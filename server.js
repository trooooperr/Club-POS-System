require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Force IPv4 globally to fix Render outbound email block

// ── Validate critical env vars before anything else ──────────────
const JWT_SECRET = process.env.JWT_SECRET;
const INSECURE_DEFAULTS = [
  'humtum-pos-secret-key-change-in-production',
  'humtum_pos_production_secret_2026_safe_key',
  'change_me',
  'secret',
];
if (!JWT_SECRET || JWT_SECRET.length < 32 || INSECURE_DEFAULTS.includes(JWT_SECRET)) {
  console.warn(
    '⚠️  JWT_SECRET is missing or appears to be a weak/default value.\n' +
    '   Generate a strong secret: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n' +
    '   Then set JWT_SECRET in your .env file.\n' +
    '   Continuing anyway — CHANGE THIS BEFORE DEPLOYING TO PRODUCTION.'
  );
}

const mongoose = require('mongoose');
const cron = require('node-cron');
const http = require('http');
const socketIO = require('socket.io');

const app = require('./app');
const { connectRedis, setCache } = require('./src/lib/redis');
const Settings = require('./src/models/Settings');
const { seedDefaultUsers } = require('./src/routes/auth');
const { sendDailyReportInternal } = require('./src/routes/reports');

const PORT = Number(process.env.PORT || 3000);
const REPORT_TIME = process.env.REPORT_CRON || '0 5 * * *';

// ── HTTP Server + Socket.IO ──────────────────────────────────────
const server = http.createServer(app);
const io = socketIO(server, {
  cors: { origin: true, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ── MongoDB URI resolution ───────────────────────────────────────
let mongoUri;
let memoryServer = null;

// ── Cron: Daily report ───────────────────────────────────────────
function scheduleDailyReport() {
  cron.schedule(REPORT_TIME, async () => {
    console.log('⏰ Running scheduled daily report...');
    try {
      await sendDailyReportInternal();
      console.log('✅ Scheduled report sent successfully.');
    } catch (err) {
      console.error('❌ Failed to send scheduled report:', err.message);
    }
  }, { timezone: 'Asia/Kolkata' });
  console.log(`📅 Daily report cron scheduled: ${REPORT_TIME} IST`);
}

// ── Cache warmup ─────────────────────────────────────────────────
async function warmupCache() {
  try {
    const MenuItem = require('./src/models/MenuItem');
    const Inventory = require('./src/models/Inventory');
    const Worker = require('./src/models/Worker');

    const [rawMenuItems, settings, rawInventory, workers] = await Promise.all([
      MenuItem.find(),
      (async () => {
        const existing = await Settings.findOne();
        return existing || Settings.create({});
      })(),
      Inventory.find(),
      Worker.find().sort({ name: 1 }),
    ]);

    const menuCategories = settings ? (settings.menuCategories || []) : [];
    const inventoryCategories = settings ? (settings.inventoryCategories || []) : [];

    rawMenuItems.sort((a, b) => {
      const catAIndex = menuCategories.indexOf(a.category);
      const catBIndex = menuCategories.indexOf(b.category);
      const indexA = catAIndex === -1 ? 999999 : catAIndex;
      const indexB = catBIndex === -1 ? 999999 : catBIndex;
      if (indexA !== indexB) return indexA - indexB;
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    rawInventory.sort((a, b) => {
      const catAIndex = inventoryCategories.indexOf(a.category);
      const catBIndex = inventoryCategories.indexOf(b.category);
      const indexA = catAIndex === -1 ? 999999 : catAIndex;
      const indexB = catBIndex === -1 ? 999999 : catBIndex;
      if (indexA !== indexB) return indexA - indexB;
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    await Promise.all([
      setCache('menu:all', rawMenuItems, 300),
      setCache('settings:current', settings, 300),
      setCache('inventory:all', rawInventory, 300),
      setCache('workers:all', workers, 300),
    ]);
    console.log('🔥 Cache warmed up');
  } catch (err) {
    console.warn('⚠️  Cache warmup failed (non-fatal):', err.message);
  }
}

// ── Startup migration: fix inventory-backed MenuItems department ──
async function migrateInventoryMenuItems() {
  try {
    const MenuItem = require('./src/models/MenuItem');
    const Inventory = require('./src/models/Inventory');
    const inventoryItems = await Inventory.find().select('name');
    const inventoryNames = inventoryItems.map(i => i.name);
    if (inventoryNames.length === 0) return;
    const result = await MenuItem.updateMany(
      { name: { $in: inventoryNames }, department: { $ne: 'bar' } },
      { $set: { department: 'bar' } }
    );
    if (result.modifiedCount > 0) {
      console.log(`✅ Migrated ${result.modifiedCount} inventory-backed MenuItem(s) → department:'bar'`);
    }
  } catch (err) {
    console.warn('⚠️  Inventory-MenuItem migration failed (non-fatal):', err.message);
  }
}

// ── Startup migration: seed CLR menu item ──
async function seedCLRMenuItem() {
  try {
    const MenuItem = require('./src/models/MenuItem');
    const existing = await MenuItem.findOne({ name: { $regex: /^clr$/i } });
    if (!existing) {
      await MenuItem.create({
        name: 'CLR',
        category: 'Food',
        price: 0,
        available: true,
        department: 'kitchen',
        shortcut: 'clr',
        isVeg: true,
        order: 999
      });
      console.log('✅ Seeded CLR menu item');
      const { deleteCache } = require('./src/lib/redis');
      await deleteCache('menu:all').catch(() => { });
    }
  } catch (err) {
    console.warn('⚠️ Seeding CLR menu item failed:', err.message);
  }
}

// ── Graceful shutdown ────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 Received ${signal}. Gracefully shutting down...`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('✅ HTTP server closed');
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        console.log('✅ MongoDB connection closed');
      }
      if (memoryServer) {
        await memoryServer.stop();
        console.log('✅ In-memory MongoDB stopped');
      }
    } catch (err) {
      console.error('❌ Shutdown error:', err.message);
    }
    process.exit(0);
  });

  // Force exit after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced exit after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── Unhandled errors ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err.message, err.stack);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Promise Rejection:', reason);
  // Don't crash on unhandled rejection — log and continue
});

// ── Socket.IO event handlers ─────────────────────────────────────
function setupSocketIO() {
  app.locals.io = io;

  io.on('connection', (socket) => {
    console.log('👤 Client connected:', socket.id);

    socket.on('join-kitchen', () => {
      socket.join('kitchen');
      console.log('👨‍🍳 Kitchen staff joined:', socket.id);
    });

    socket.on('join-table', (tableNo) => {
      socket.join(`table:${tableNo}`);
    });

    socket.on('admin-broadcast', async (data) => {
      console.log('📢 Received admin-broadcast:', data);
      if (data && data.event) {
        if (data.event === 'NEW_KOT' && data.kotNo) {
          try {
            const KOT = require('./src/models/KOT');
            const kotDoc = await KOT.findOne({ kotNo: data.kotNo });
            if (kotDoc) {
              console.log('🎯 Found KOT from admin-broadcast:', kotDoc.kotNo);
              io.to('kitchen').emit('NEW_KOT', kotDoc);
              io.emit('NEW_KOT', kotDoc); // Broadcast globally for print receivers on any tab
              io.emit('TABLE_SESSION_UPDATED', { tableNo: kotDoc.tableNo });
            } else {
              console.warn('⚠️ KOT not found for kotNo:', data.kotNo);
            }
          } catch (err) {
            console.error('❌ Error handling NEW_KOT admin-broadcast:', err.message);
          }
        } else {
          // General broadcast fallback (e.g. REFRESH_MENU, TABLE_SESSION_UPDATED)
          io.emit(data.event, data);
        }
      }
    });

    socket.on('kot-created', (data) => {
      io.emit('TABLE_SESSION_UPDATED', { tableNo: data.tableNo });
      console.log('🎫 Socket.io: kot-created received, broadcasting TABLE_SESSION_UPDATED:', data.kotNo);
    });

    socket.on('kot-status-updated', (data) => {
      io.to('kitchen').emit('KOT_UPDATED', data);
      io.to(`table:${data.tableNo}`).emit('KOT_UPDATED', data);
      io.emit('TABLE_SESSION_UPDATED', { tableNo: data.tableNo });
    });

    socket.on('kot-ready', (data) => {
      io.to('kitchen').emit('KOT_READY', data);
      io.to(`table:${data.tableNo}`).emit('KOT_READY', data);
      io.emit('TABLE_SESSION_UPDATED', { tableNo: data.tableNo });
    });

    socket.on('table-updated', (data) => {
      io.to(`table:${data.tableNo}`).emit('TABLE_UPDATED', data);
      io.emit('TABLE_SESSION_UPDATED', { tableNo: data.tableNo });
    });

    socket.on('payment-completed', (data) => {
      io.to(`table:${data.tableNo}`).emit('PAYMENT_COMPLETED', data);
      io.to('kitchen').emit('PAYMENT_COMPLETED', data);
      io.emit('TABLE_SESSION_UPDATED', { tableNo: data.tableNo });
    });

    socket.on('order-completed', (data) => {
      io.to('kitchen').emit('ORDER_COMPLETED', data);
      io.to(`table:${data.tableNo}`).emit('ORDER_COMPLETED', data);
      io.emit('TABLE_SESSION_UPDATED', { tableNo: data.tableNo });
    });

    socket.on('disconnect', () => {
      console.log('❌ Client disconnected:', socket.id);
    });
  });
}

// ── Main startup ─────────────────────────────────────────────────
async function startServer() {
  try {
    console.log('🚀 Starting HumTum POS Backend...');
    console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

    // Determine MongoDB URI
    if (process.env.USE_MEMORY_DB === 'true') {
      console.log('📦 Starting in-memory MongoDB...');
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      mongoUri = memoryServer.getUri();
      console.log('✅ In-memory MongoDB ready');
    } else if (process.env.CLOUD_MONGO_URI) {
      mongoUri = process.env.CLOUD_MONGO_URI;
      console.log('🔗 Using cloud MongoDB URI');
    } else {
      console.error('❌ No MongoDB URI configured. Set CLOUD_MONGO_URI in .env or enable USE_MEMORY_DB=true.');
      process.exit(1);
    }

    // Validate URI is not a placeholder
    if (mongoUri.includes('<') || mongoUri.includes('example.com')) {
      console.error('❌ CLOUD_MONGO_URI appears to be a placeholder. Please set a real connection string.');
      process.exit(1);
    }

    // Connect to MongoDB with production-grade options
    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 30_000,
        socketTimeoutMS: 45_000,
        maxPoolSize: 10,
        minPoolSize: 1,
        family: 4,    // Force IPv4
        retryWrites: true,
        w: 'majority',
      });
    } catch (connErr) {
      console.error('❌ MongoDB connection failed:', connErr.message);
      if (connErr.message?.includes('querySrv')) {
        console.error('   DNS SRV lookup failed. Check your CLOUD_MONGO_URI and network.');
        console.error('   Tip: Ensure MongoDB Atlas IP whitelist includes your server IP (or 0.0.0.0/0 for dev).');
      }
      process.exit(1);
    }

    console.log('✅ MongoDB connected');

    // Fix TableSession indexes
    (async () => {
      try {
        const coll = mongoose.connection.db.collection('tablesessions');
        await coll.dropIndex('tableId_1').catch(() => { });
        await coll.createIndex({ tableNo: 1, status: 1 });
        console.log('✅ TableSession indexes verified');
      } catch (idxErr) {
        console.warn('⚠️  Index setup warning:', idxErr.message);
      }
    })();

    await seedDefaultUsers();
    await seedCLRMenuItem();
    await connectRedis();
    await warmupCache();
    await migrateInventoryMenuItems();
    if (process.env.RUN_BACKFILL === 'true') {
      (async () => {
        try {
          const { backfillDailyStockReports } = require('./src/lib/inventoryReport');
          await backfillDailyStockReports();
        } catch (bfErr) {
          console.error('⚠️  Daily report backfill failed:', bfErr.message);
        }
      })();
    }

    setupSocketIO();

    // Initialize WhatsApp Business Integration Service (Temporarily disabled)
    // const whatsappService = require('./src/lib/whatsappService');
    // await whatsappService.init(io).catch(err => {
    //   console.error('[WhatsApp] Service initialization failed:', err.message);
    // });

    // Watch collections and broadcast socket updates on DB changes
    setupDbChangeStreams(io);

    server.once('error', async (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error(`   Stop the existing process: lsof -ti :${PORT} | xargs kill`);
      } else {
        console.error('❌ Server error:', err.message);
      }
      await gracefulShutdown('EADDRINUSE');
    });

    server.listen(PORT, () => {
      console.log(`📡 Server running on port ${PORT}`);
      console.log(`🔗 Socket.IO ready`);
      scheduleDailyReport();
    });

  } catch (err) {
    console.error('❌ Server startup failed:', err.message);
    await gracefulShutdown('STARTUP_FAILURE');
  }
}

function setupDbChangeStreams(io) {
  try {
    const db = mongoose.connection.db;

    // Watch tablesessions collection
    const sessionStream = db.collection('tablesessions').watch([], { fullDocument: 'updateLookup' });
    sessionStream.on('change', (change) => {
      const doc = change.fullDocument;
      if (doc && doc.tableNo) {
        io.emit('TABLE_SESSION_UPDATED', { tableNo: doc.tableNo });
        io.to(`table:${doc.tableNo}`).emit('TABLE_UPDATED', doc);
      } else if (change.operationType === 'delete') {
        io.emit('TABLE_SESSION_UPDATED', {});
      }
    });

    // Watch kots collection
    const kotStream = db.collection('kots').watch([], { fullDocument: 'updateLookup' });
    kotStream.on('change', async (change) => {
      if (change.operationType === 'insert') {
        const doc = change.fullDocument;
        if (doc) {
          io.to('kitchen').emit('NEW_KOT', doc);
          io.emit('NEW_KOT', doc); // Broadcast globally
          io.emit('TABLE_SESSION_UPDATED', { tableNo: doc.tableNo });
          console.log('🎫 Change Stream: New KOT broadcast:', doc.kotNo);

          // Handle stock deduction for table/guest KOTs!
          if (doc.source === 'table') {
            try {
              const KOT = require('./src/models/KOT');
              const Order = require('./src/models/Order');
              const { deductInventoryForItems, broadcastInventoryUpdate } = require('./src/lib/inventoryStock');

              // Atomically claim the deduction task to prevent other server processes from double-deducting in parallel
              const kotDoc = await KOT.findOneAndUpdate(
                { _id: doc._id, inventoryDeducted: { $ne: true } },
                { $set: { inventoryDeducted: true, inventoryDeductedAt: new Date() } },
                { new: false } // returns the doc state before update
              );
              if (kotDoc) {
                const order = await Order.findById(kotDoc.orderId);
                const isAlreadyDeducted = order && order.inventoryFinalized;
                if (isAlreadyDeducted) {
                  console.log(`📡 Change Stream: Order is already inventoryFinalized. Skipping KOT ${kotDoc.kotNo} stock deduction.`);
                } else {
                  console.log(`📡 Change Stream: Deducting inventory for table KOT ${kotDoc.kotNo}...`);
                  const updatedInventory = await deductInventoryForItems(kotDoc.items, order?.businessDate || order?.date || kotDoc.createdAt);

                  broadcastInventoryUpdate({ app: { locals: { io } } }, updatedInventory, {
                    orderId: kotDoc.orderId,
                    kotId: kotDoc._id,
                    source: 'TABLE_KOT_STREAM'
                  });
                  console.log(`📡 Change Stream: Table KOT ${kotDoc.kotNo} inventory deducted successfully.`);
                }
              }

            } catch (err) {
              console.error(`❌ Change Stream: Error deducting inventory for table KOT:`, err.message);
            }
          }
        }
      }
    });

    // Watch menuitems collection (Commented out: endpoints handle REFRESH_MENU manually)
    // const menuStream = db.collection('menuitems').watch([], { fullDocument: 'updateLookup' });
    // menuStream.on('change', (change) => {
    //   console.log('🍔 Change Stream: menuitems collection changed, broadcasting REFRESH_MENU');
    //   io.emit('REFRESH_MENU');
    // });

    // Watch inventories collection (Commented out: endpoints and KOT sync handle updates manually via INVENTORY_UPDATED)
    // const invStream = db.collection('inventories').watch([], { fullDocument: 'updateLookup' });
    // invStream.on('change', (change) => {
    //   console.log('🍻 Change Stream: inventories collection changed, broadcasting REFRESH_MENU');
    //   io.emit('REFRESH_MENU');
    // });

    console.log('✅ MongoDB Change Streams initialized for real-time synchronization');
  } catch (err) {
    console.error('❌ Failed to initialize MongoDB Change Streams:', err.message);
  }
}

startServer();

module.exports = { app, server, io };
