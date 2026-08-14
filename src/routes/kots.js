const express = require('express');
const router = express.Router();
const KOT = require('../models/KOT');
const Order = require('../models/Order');
const TableSession = require('../models/TableSession');
const KotCounter = require('../models/KotCounter');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const {
  broadcastInventoryUpdate,
  deductInventoryForItems,
  refundInventoryForItems,
} = require('../lib/inventoryStock');

// ── RECALCULATE ORDER TOTALS (For Completed Orders) ─────────────────
async function recalculateOrderTotals(order) {
  const kots = await KOT.find({ orderId: order._id });
  const itemMap = new Map();
  for (const kot of kots) {
    for (const item of kot.items) {
      const name = item.name;
      const key = name.trim().toLowerCase();
      if (itemMap.has(key)) {
        const existing = itemMap.get(key);
        existing.quantity += item.quantity;
      } else {
        itemMap.set(key, {
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          notes: item.notes || ''
        });
      }
    }
  }
  const updatedItems = [...itemMap.values()];
  const subtotal = updatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

  const Settings = require('../models/Settings');
  const settings = await Settings.findOne();
  const sgstRate = settings ? settings.sgstRate : 2.5;
  const cgstRate = settings ? settings.cgstRate : 2.5;
  const serviceTaxRate = settings && settings.serviceTaxEnabled ? (settings.serviceTaxRate || 0) : 0;

  const sgst = (subtotal * sgstRate) / 100;
  const cgst = (subtotal * cgstRate) / 100;
  const serviceTax = (subtotal * serviceTaxRate) / 100;

  const discount = Math.min(order.discount || 0, subtotal);
  const rawTotal = subtotal + sgst + cgst + serviceTax - discount;
  const grandTotal = Math.round(rawTotal);
  const roundOff = grandTotal - rawTotal;

  order.items = updatedItems;
  order.subtotal = subtotal;
  order.sgst = sgst;
  order.cgst = cgst;
  order.serviceTax = serviceTax;
  order.discount = discount;
  order.roundOff = roundOff;
  order.grandTotal = grandTotal;

  if (order.dueAmount === 0) {
    order.paidAmount = grandTotal;
  } else {
    order.dueAmount = Math.max(0, grandTotal - (order.paidAmount || 0));
  }

  await order.save();
}

// ── GENERATE KOT NUMBER ─────────────────────────────────────────
async function generateKOTNo() {
  const redis = require('../lib/redis');
  const { getBusinessDayBoundary, getBusinessDateString } = require('../lib/businessDay');
  const boundary = getBusinessDayBoundary();
  const dateStr = getBusinessDateString(boundary);

  // 1. Atomically increment the counter for today's business date
  let counter = await KotCounter.findOneAndUpdate(
    { businessDate: dateStr },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  // 2. Maximum sequence safety check across existing KOTs for today
  const kotsToday = await KOT.find({ createdAt: { $gte: boundary } }, { kotNo: 1 });
  let maxSeqInDb = 0;
  for (const k of kotsToday) {
    if (k.kotNo) {
      const match = k.kotNo.match(/KOT-(\d+)/i);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxSeqInDb) maxSeqInDb = num;
      }
    }
  }

  // If the counter sequence is less than or equal to an existing KOT number today, boost it atomically!
  if (counter.seq <= maxSeqInDb) {
    const nextSeq = maxSeqInDb + 1;
    const updated = await KotCounter.findOneAndUpdate(
      { businessDate: dateStr, seq: { $lt: nextSeq } },
      { $set: { seq: nextSeq } },
      { new: true }
    );
    counter = updated || { seq: nextSeq };
  }

  const seqNumber = counter.seq;

  // 3. Passively sync to Redis if available
  try {
    const client = await redis.connectRedis();
    if (client) {
      const kotCounterKey = `kot_seq:${dateStr}`;
      await client.set(kotCounterKey, seqNumber);
      await client.expire(kotCounterKey, 172800); // 48h expiration
    }
  } catch (redisErr) {
    // Non-blocking fallback if Redis connection has issues
  }

  return `KOT-${seqNumber.toString().padStart(3, '0')}`;
}



// ── GET ALL KOTs FOR A TABLE ────────────────────────────────────
router.get('/table/:tableNo', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const kots = await KOT.find({ tableNo: parseInt(tableNo) }).sort({ createdAt: -1 });
    res.json(kots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET KOT BY ID ───────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const kot = await KOT.findById(req.params.id).populate('orderId').populate('items.menuItemId');
    if (!kot) return res.status(404).json({ message: 'KOT not found' });
    res.json(kot);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── CREATE NEW KOT ──────────────────────────────────────────────
// Called when adding items and printing first KOT
router.post('/', async (req, res) => {
  try {
    const { orderId, tableNo, items, notes, waiterName, orderType } = req.body;
    
    // Validate order exists and is for this table
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (order.tableNo !== tableNo) return res.status(400).json({ message: 'Table mismatch' });

    // Generate KOT number
    const kotNo = await generateKOTNo();

    // Group items by department — trust the department sent from the frontend.
    // Only fall back to MenuItem lookup if no department was provided.
    const departmentQueues = {};
    for (const item of items) {
      let dept = item.department; // Use what the client sent
      if (!dept) {
        // Fallback: look up the menu item
        const menuItem = await MenuItem.findById(item.menuItemId).catch(() => null);
        dept = menuItem?.department || 'kitchen';
      }
      // Ensure the item carries the resolved department forward
      item.department = dept;
      departmentQueues[dept] = 'PENDING';
    }

    // Create KOT
    const kot = new KOT({
      kotNo,
      orderId,
      tableNo,
      items,
      notes: notes || '',
      waiterName: waiterName || order.waiterName || '',
      orderType: orderType || order.orderType || 'dine-in',
      departmentQueues,
      status: 'PENDING',
      source: 'pos'
    });

    const saved = await kot.save();

    let updatedInventory = null;
    try {
      // Determine request source (default to 'pos')
      const kotSource = req.body.source || 'pos';
      // Deduct inventory only for POS-initiated KOTs and only if order is not a direct device order
      const isAlreadyDeducted = order.inventoryFinalized;
      if (!isAlreadyDeducted && kotSource === 'pos') {
        updatedInventory = await deductInventoryForItems(items, order.businessDate || order.date || saved.createdAt);
        saved.inventoryDeducted = true;
        saved.inventoryDeductedAt = new Date();
        await saved.save();
        broadcastInventoryUpdate(req, updatedInventory, {
          orderId,
          kotId: saved._id,
          source: kotSource
        });
      }

    } catch (inventoryErr) {
      console.error('Inventory deduction error in POST /api/kots:', inventoryErr.message);
    }

    // Add KOT to order
    await Order.findByIdAndUpdate(orderId, {
      $push: { kotIds: saved._id },
      orderStatus: 'KOT_SENT'
    });

    // Update or create table session
    await TableSession.findOneAndUpdate(
      { activeOrderId: orderId },
      {
        $set: { status: 'KOT_SENT', lastActivityAt: new Date(), totalAmount: order.grandTotal },
        $push: { kotIds: saved._id }
      },
      { upsert: true, new: true }
    );

    const response = saved.toObject();
    if (updatedInventory) response.inventory = updatedInventory;
    res.status(201).json(response);
    
    // Invalidate cache
    await deleteCache([`kots:table:${tableNo}`, `order:${orderId}`]);
  } catch (err) {
    console.error("POST /api/kots Error:", err);
    res.status(400).json({ message: err.message });
  }
});

// ── UPDATE KOT STATUS ──────────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const kot = await KOT.findByIdAndUpdate(
      req.params.id,
      {
        status,
        ...(status === 'PREPARING' && { startedAt: new Date() }),
        ...(status === 'READY' && { readyAt: new Date() }),
        ...(status === 'SERVED' && { servedAt: new Date() }),
        ...(status === 'COMPLETED' && { completedAt: new Date() })
      },
      { new: true }
    );

    if (!kot) return res.status(404).json({ message: 'KOT not found' });

    res.json(kot);
    
    // Invalidate cache
    await deleteCache([`kots:table:${kot.tableNo}`]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── UPDATE KOT DEPARTMENT QUEUE STATUS ──────────────────────────
router.patch('/:id/department/:dept', async (req, res) => {
  try {
    const { status } = req.body;
    const { id, dept } = req.params;
    
    const kot = await KOT.findById(id);
    if (!kot) return res.status(404).json({ message: 'KOT not found' });
    
    if (!kot.departmentQueues) kot.departmentQueues = new Map();
    kot.departmentQueues.set(dept, status);
    
    await kot.save();
    res.json(kot);
    
    await deleteCache([`kots:table:${kot.tableNo}`]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── INCREMENT PRINT COUNT ──────────────────────────────────────
router.patch('/:id/print', async (req, res) => {
  try {
    const kot = await KOT.findByIdAndUpdate(
      req.params.id,
      { $inc: { printCount: 1 } },
      { new: true }
    );

    if (!kot) return res.status(404).json({ message: 'KOT not found' });
    res.json(kot);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── GET KITCHEN DISPLAY (Full KOT History for Today) ─────────────
router.get('/kitchen/display', async (req, res) => {
  try {
    const { getBusinessDayBoundary } = require('../lib/businessDay');
    const start = getBusinessDayBoundary();

    const kots = await KOT.find({ createdAt: { $gte: start } })
      .sort({ createdAt: -1 })
      .populate('items.menuItemId');
    
    res.json(kots);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── DELETE KOT (Admin/Manager only, refunds stock) ─────────────────
const { requireRole } = require('../middleware/auth');
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const kot = await KOT.findById(req.params.id);
    if (!kot) return res.status(404).json({ message: 'KOT not found' });

    // 1. Refund the inventory stock for the items in the KOT
    let updatedInventory = null;
    if (kot.items && kot.items.length > 0) {
      const order = await Order.findById(kot.orderId);
      updatedInventory = await refundInventoryForItems(kot.items, order?.businessDate || order?.date || kot.createdAt);
      broadcastInventoryUpdate(req, updatedInventory, { orderId: kot.orderId, kotId: kot._id });
    }

    // 2. Remove this KOT ID from the associated Order
    const order = await Order.findByIdAndUpdate(kot.orderId, {
      $pull: { kotIds: kot._id }
    }, { new: true });

    // If this is a historical/completed order, recalculate its totals
    if (order && !order.isActive) {
      await recalculateOrderTotals(order);
    }

    // 3. Remove this KOT ID from the TableSession
    const session = await TableSession.findOneAndUpdate(
      { tableNo: kot.tableNo, status: { $ne: 'COMPLETED' } },
      { $pull: { kotIds: kot._id } },
      { new: true }
    ).populate('activeOrderId').populate('kotIds');

    // 4. Delete the KOT document
    await KOT.findByIdAndDelete(kot._id);

    // Invalidate cache
    await deleteCache([`kots:table:${kot.tableNo}`, `order:${kot.orderId}`]);

    // Broadcast changes via Socket.IO
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
      req.app.locals.io.emit('KOT_DELETED', { kotId: kot._id });
      if (session) {
        req.app.locals.io.emit('TABLE_SESSION_UPDATED', {
          tableNo: kot.tableNo,
          session,
          timestamp: new Date()
        });
      }
      if (updatedInventory) {
        broadcastInventoryUpdate(req, updatedInventory, {
          orderId: kot.orderId,
          kotId: kot._id,
          source: 'KOT_DELETED'
        });
      }
    }

    const updatedOrder = await Order.findById(kot.orderId).populate('kotIds');

    res.json({
      message: 'KOT deleted and stock refunded successfully',
      inventory: updatedInventory,
      order: updatedOrder
    });
  } catch (err) {
    console.error('DELETE KOT Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── REMOVE/REDUCE ITEM FROM ACTIVE KOTS (Refunds stock) ──────────────
router.post('/remove-item', async (req, res) => {
  try {
    const { orderId, name, quantityToRemove } = req.body;
    if (!orderId || !name || !quantityToRemove || quantityToRemove <= 0) {
      return res.status(400).json({ message: 'OrderId, item name, and valid quantity to remove are required' });
    }

    // Find all active/non-completed KOTs linked to this order
    const kots = await KOT.find({ orderId }).sort({ createdAt: -1 }); // Newest first
    
    let remainingToRemove = quantityToRemove;
    let actualRefundedQty = 0;
    let updatedInventory = null;
    
    const modifiedKotIds = [];

    for (const kot of kots) {
      if (remainingToRemove <= 0) break;

      const itemIndex = kot.items.findIndex(i => i.name.trim().toLowerCase() === name.trim().toLowerCase());
      if (itemIndex === -1) continue;

      const item = kot.items[itemIndex];
      const qtyInKot = item.quantity;
      
      if (qtyInKot <= remainingToRemove) {
        // Remove item from KOT
        actualRefundedQty += qtyInKot;
        remainingToRemove -= qtyInKot;
        kot.items.splice(itemIndex, 1);
      } else {
        // Reduce item quantity in KOT
        actualRefundedQty += remainingToRemove;
        item.quantity -= remainingToRemove;
        remainingToRemove = 0;
      }

      modifiedKotIds.push(kot._id);

      if (kot.items.length === 0) {
        // If KOT has no items left, delete it!
        await KOT.findByIdAndDelete(kot._id);
        await Order.findByIdAndUpdate(orderId, { $pull: { kotIds: kot._id } });
        await TableSession.findOneAndUpdate(
          { activeOrderId: orderId },
          { $pull: { kotIds: kot._id } }
        );
        if (req.app.locals.io) {
          req.app.locals.io.emit('KOT_DELETED', { kotId: kot._id });
        }
      } else {
        // Save updated KOT
        await kot.save();
        if (req.app.locals.io) {
          req.app.locals.io.emit('KOT_UPDATED', kot);
        }
      }
    }

    if (actualRefundedQty > 0) {
      // Refund inventory stock for this item
      const order = await Order.findById(orderId);
      updatedInventory = await refundInventoryForItems([{ name, quantity: actualRefundedQty }], order?.businessDate || order?.date);
      broadcastInventoryUpdate(req, updatedInventory, { orderId, itemName: name });
    }

    // Invalidate cache
    const order = await Order.findById(orderId);
    if (order) {
      // If this is a completed order, recalculate its totals
      if (!order.isActive) {
        await recalculateOrderTotals(order);
      }

      await deleteCache([`kots:table:${order.tableNo}`, `order:${orderId}`]);
      
      // Fetch updated session to broadcast
      const session = await TableSession.findOne({ tableNo: order.tableNo, status: { $ne: 'COMPLETED' } })
        .populate('activeOrderId')
        .populate('kotIds');

      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        if (session) {
          req.app.locals.io.emit('TABLE_SESSION_UPDATED', {
            tableNo: order.tableNo,
            session,
            timestamp: new Date()
          });
        }
        if (updatedInventory) {
          broadcastInventoryUpdate(req, updatedInventory, {
            orderId,
            source: 'KOT_ITEM_REMOVED'
          });
        }
      }

      const updatedOrder = await Order.findById(orderId).populate('kotIds');

      res.json({ 
        message: `Successfully removed ${actualRefundedQty}x ${name}`, 
        inventory: updatedInventory,
        order: updatedOrder
      });
    } else {
      res.status(404).json({ message: 'Order not found' });
    }
  } catch (err) {
    console.error('Remove KOT Item Error:', err);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
