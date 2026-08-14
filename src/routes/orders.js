const express = require('express');
const Order = require('../models/Order');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const router = express.Router();
const ORDERS_CACHE_KEY = 'orders:all';
const REPORT_SUMMARY_CACHE_KEY = 'reports:daily-summary';
const TableSession = require('../models/TableSession');
const KOT = require('../models/KOT');
const BillCounter = require('../models/BillCounter');
const { getBusinessDayBoundary, getISTHour, getBusinessDateString } = require('../lib/businessDay');
const {
  aggregateQuantities,
  broadcastInventoryUpdate,
  buildInventoryDelta,
  deductInventoryForItems,
} = require('../lib/inventoryStock');

// Generate new Bill No based on businessDateStr (e.g. "2026-07-04")
async function generateNextBillNo(businessDateStr) {
  // Try to find the counter first
  let counter = await BillCounter.findOne({ businessDate: businessDateStr });
  
  if (!counter) {
    // If counter document does not exist yet, initialize it based on the maximum existing bill number in DB
    const todayOrders = await Order.find({
      businessDate: businessDateStr,
      billNo: { $regex: /^HTB-\d+$/ }
    }).select('billNo');

    let maxNum = 0;
    if (todayOrders.length > 0) {
      const numbers = todayOrders.map(o => {
        const match = o.billNo.match(/HTB-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      });
      maxNum = Math.max(...numbers);
    }
    
    try {
      counter = await BillCounter.findOneAndUpdate(
        { businessDate: businessDateStr },
        { $setOnInsert: { seq: maxNum } },
        { upsert: true, new: true }
      );
    } catch (err) {
      // Fetch in case of concurrent inserts
      counter = await BillCounter.findOne({ businessDate: businessDateStr });
    }
  }

  // Atomically increment counter and retrieve updated value
  counter = await BillCounter.findOneAndUpdate(
    { businessDate: businessDateStr },
    { $inc: { seq: 1 } },
    { new: true }
  );

  return `HTB-${counter.seq.toString().padStart(3, '0')}`;
}

// ── GET CUSTOMER QR / CHECKIN ORDER HISTORY BY PHONE (Public CRM) ──
router.get('/customer-history/:phone', async (req, res) => {
  try {
    const { getCustomerCRMHistory } = require('../lib/crmService');
    const history = await getCustomerCRMHistory(req.params.phone);
    res.json(history);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const cached = await getCache(ORDERS_CACHE_KEY);
    if (cached) return res.json(cached);

    const orders = await Order.find({
      isActive: { $ne: true },
      grandTotal: { $gt: 0 },
      billNo: { $ne: '' }
    }).sort({ date: -1, billNo: -1 });
    await setCache(ORDERS_CACHE_KEY, orders, 180);
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('kotIds');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── OPEN TABLE SESSION ──────────────────────────────────────────
router.post('/table/:tableNo/open', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const { waiterName, orderType, customerName, customerPhone } = req.body;

    // Check if table is already open, heal duplicate/orphaned sessions
    const activeSessions = await TableSession.find({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } }).populate('activeOrderId');
    let existingSession = null;
    for (const session of activeSessions) {
      if (!session.activeOrderId || !session.activeOrderId.isActive) {
        // Clean up orphaned or inactive session
        await TableSession.deleteOne({ _id: session._id });
      } else {
        if (!existingSession) {
          existingSession = session;
        } else {
          // Clean up duplicate session
          await TableSession.deleteOne({ _id: session._id });
        }
      }
    }

    if (existingSession) {
      return res.status(200).json(existingSession);
    }

    // Clean up any old completed sessions for this table to prevent Duplicate Key errors
    await TableSession.deleteMany({ tableNo: parseInt(tableNo), status: 'COMPLETED' });

    // Create initial order with empty billNo (generated only on finalization)
    const order = new Order({
      billNo: '',
      tableNo: parseInt(tableNo),
      items: [],
      subtotal: 0,
      sgst: 0,
      cgst: 0,
      serviceTax: 0,
      discount: 0,
      roundOff: 0,
      grandTotal: 0,
      paidAmount: 0,
      dueAmount: 0,
      paymentMode: 'cash',
      orderStatus: 'OPEN',
      isActive: true,
      date: new Date(),
      businessDate: getBusinessDateString(),
      waiterName: waiterName || '',
      orderType: orderType || 'dine-in',
      customerName: customerName || '',
      customerPhone: customerPhone || ''
    });
    const savedOrder = await order.save();

    // Create new session
    const session = new TableSession({
      tableNo: parseInt(tableNo),
      activeOrderId: savedOrder._id,
      status: 'OPEN',
      openedAt: new Date(),
      lastActivityAt: new Date(),
      waiterName: waiterName || '',
      orderType: orderType || 'dine-in'
    });

    const savedSession = await session.save();
    const sessionObj = savedSession.toObject();
    sessionObj.activeOrderId = savedOrder.toObject();

    res.status(201).json(sessionObj);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── GET ALL ACTIVE SESSIONS ─────────────────────────────────────
router.get('/sessions/active', async (req, res) => {
  try {
    const sessions = await TableSession.find({ status: { $ne: 'COMPLETED' } })
      .populate('kotIds')
      .populate('activeOrderId');
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET TABLE SESSION ───────────────────────────────────────────
router.get('/table/:tableNo/session', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const sessions = await TableSession.find({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } })
      .populate('kotIds')
      .populate('activeOrderId');

    let activeSession = null;
    for (const session of sessions) {
      if (!session.activeOrderId || !session.activeOrderId.isActive) {
        await TableSession.deleteOne({ _id: session._id });
      } else {
        if (!activeSession) {
          activeSession = session;
        } else {
          await TableSession.deleteOne({ _id: session._id });
        }
      }
    }

    if (!activeSession) {
      // Return 200 instead of 404 to prevent harmless frontend network errors
      return res.status(200).json({ message: 'No active session' });
    }

    res.json(activeSession);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── UPDATE TABLE SESSION (Sync pending items) ──────────────────
router.put('/table/:tableNo/session', async (req, res) => {
  try {
    const { tableNo } = req.params;
    const { pendingItems, totalAmount, waiterName, orderType } = req.body;

    const sessions = await TableSession.find({ tableNo: parseInt(tableNo), status: { $ne: 'COMPLETED' } });
    let activeSession = null;
    for (const session of sessions) {
      if (!session.activeOrderId) {
        await TableSession.deleteOne({ _id: session._id });
      } else {
        if (!activeSession) {
          activeSession = session;
        } else {
          await TableSession.deleteOne({ _id: session._id });
        }
      }
    }

    if (!activeSession) {
      // Return 200 instead of 404 to prevent harmless frontend network errors during checkout race conditions
      return res.status(200).json({ message: 'No active session found (likely completed)' });
    }

    // Update active Order with customer details & order meta
    if (activeSession.activeOrderId) {
      const orderUpdate = {};
      if (customerName !== undefined) orderUpdate.customerName = customerName;
      if (customerPhone !== undefined) orderUpdate.customerPhone = customerPhone;
      if (waiterName !== undefined) orderUpdate.waiterName = waiterName;
      if (orderType !== undefined) orderUpdate.orderType = orderType;
      if (Object.keys(orderUpdate).length > 0) {
        await Order.findByIdAndUpdate(activeSession.activeOrderId, orderUpdate);
      }
    }

    const session = await TableSession.findByIdAndUpdate(
      activeSession._id,
      {
        $set: {
          pendingItems: pendingItems || [],
          totalAmount: totalAmount || 0,
          waiterName: waiterName || '',
          orderType: orderType || 'dine-in',
          lastActivityAt: new Date()
        }
      },
      { new: true }
    ).populate('activeOrderId').populate('kotIds');

    res.json(session);
  } catch (err) {
    console.error('Update Table Session Error:', err);
    res.status(400).json({ message: err.message });
  }
});

// ── CREATE ORDER (called when opening table or direct orders) ────────────────────
router.post('/', async (req, res) => {
  try {
    const orderData = req.body;

    const targetDate = orderData.date ? new Date(orderData.date) : new Date();
    orderData.businessDate = getBusinessDateString(targetDate);

    // Assign sequential bill number only if the order is already marked as finalized/inactive or completed
    const isCompleted = orderData.isActive === false || orderData.orderStatus === 'COMPLETED' || (orderData.dueAmount === 0 && Array.isArray(orderData.items) && orderData.items.length > 0 && orderData.isActive !== true);
    if (isCompleted) {
      if (orderData.grandTotal <= 0) {
        return res.status(400).json({ message: 'Cannot save completed order with grand total 0' });
      }
      orderData.billNo = await generateNextBillNo(orderData.businessDate);
    } else {
      orderData.billNo = '';
    }

    const isDirectOrder = Array.isArray(orderData.items) && orderData.items.length > 0;

    // New KOT workflow: don't deduct inventory yet, only create order if items empty
    const order = new Order({
      ...orderData,
      date: targetDate,
      businessDate: orderData.businessDate,
      orderStatus: orderData.orderStatus || (isDirectOrder ? (orderData.dueAmount === 0 ? 'COMPLETED' : 'OPEN') : 'OPEN'),
      isActive: orderData.isActive !== undefined ? orderData.isActive : (isCompleted ? false : true),
      items: orderData.items || [],
      inventoryFinalized: isDirectOrder,
      ...(isDirectOrder && { inventoryFinalizedAt: new Date() })
    });
    const saved = await order.save();

    // Trigger WhatsApp Thank You notification in the background
    if (saved.customerPhone && !saved.isActive) {
      (async () => {
        try {
          const Settings = require('../models/Settings');
          const settingsObj = await Settings.findOne();
          if (settingsObj && settingsObj.whatsappEnabled) {
            const whatsappService = require('../lib/whatsappService');
            await whatsappService.sendThankYouMessage(saved, settingsObj);
          }
        } catch (waErr) {
          console.error('[WhatsApp] Auto trigger error:', waErr.message);
        }
      })();
    }

    let directOrderInventory = null;
    if (isDirectOrder) {
      try {
        directOrderInventory = await deductInventoryForItems(orderData.items, orderData.businessDate || targetDate);
        broadcastInventoryUpdate(req, directOrderInventory, {
          orderId: saved._id,
          source: 'DIRECT_ORDER'
        });
      } catch (bulkErr) {
        console.error('Inventory bulk update error in POST /:', bulkErr.message);
      }
    }

    // Create/update table session
    if (orderData.tableNo) {
      await TableSession.findOneAndUpdate(
        { tableNo: orderData.tableNo, status: { $ne: 'COMPLETED' } },
        {
          $set: {
            status: isDirectOrder && orderData.dueAmount === 0 ? 'COMPLETED' : 'OPEN',
            activeOrderId: saved._id,
            lastActivityAt: new Date(),
            totalAmount: orderData.grandTotal || 0
          }
        },
        { upsert: true, new: true }
      );
    }

    const response = saved.toObject();
    if (directOrderInventory) response.inventory = directOrderInventory;
    res.status(201).json(response);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ── FINALIZE BILL (called when printing final bill) ─────────────
router.patch('/:id/finalize-bill', async (req, res) => {
  try {
    const { items, subtotal, sgst, cgst, serviceTax, discount, roundOff, grandTotal, waiterName, orderType, customerName, customerPhone, paymentMode, cashAmount, upiAmount } = req.body;

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const wasActive = order.isActive;

    // Server-side safeguard for CLR item
    const hasClrItem = Array.isArray(items) && items.some(i => i.name && i.name.toUpperCase() === 'CLR');
    if (hasClrItem) {
      await KOT.deleteMany({ orderId: req.params.id });
      await TableSession.findOneAndDelete({ activeOrderId: req.params.id });
      const tableNo = order.tableNo;
      await Order.findByIdAndDelete(req.params.id);

      await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
      return res.json({
        success: true,
        cleared: true,
        order: {
          _id: req.params.id,
          tableNo,
          items: [],
          grandTotal: 0,
          isActive: false
        }
      });
    }

    if (grandTotal <= 0) {
      return res.status(400).json({ message: 'Cannot finalize bill with grand total 0' });
    }

    // Update order with final calculations (combine all KOT items)
    order.items = items;
    order.subtotal = subtotal;
    order.sgst = sgst;
    order.cgst = cgst;
    order.serviceTax = typeof serviceTax === 'number' ? serviceTax : 0;
    order.discount = discount;
    order.roundOff = roundOff;
    order.grandTotal = grandTotal;
    order.orderStatus = 'COMPLETED';
    order.isActive = false;
    if (waiterName !== undefined) order.waiterName = waiterName;
    if (orderType !== undefined) order.orderType = orderType;
    if (customerName !== undefined) order.customerName = customerName;
    if (customerPhone !== undefined) order.customerPhone = customerPhone;
    if (paymentMode !== undefined) order.paymentMode = paymentMode;
    if (cashAmount !== undefined) order.cashAmount = parseFloat(cashAmount) || 0;
    if (upiAmount !== undefined) order.upiAmount = parseFloat(upiAmount) || 0;

    // Generate and assign sequential bill number at checkout
    if (wasActive || !order.billNo || order.billNo === 'PENDING') {
      order.date = new Date();
      order.businessDate = getBusinessDateString(order.date);
      order.billNo = await generateNextBillNo(order.businessDate);
    } else if (!order.businessDate) {
      order.businessDate = getBusinessDateString(order.date || order.createdAt);
    }

    const saved = await order.save();

    if (saved.customerPhone) {
      const { recordCustomerVisit } = require('../lib/crmService');
      recordCustomerVisit({
        phone: saved.customerPhone,
        name: saved.customerName,
        billNo: saved.billNo,
        amount: saved.grandTotal,
        items: saved.items,
        orderType: saved.orderType,
        date: saved.date || saved.createdAt
      }).catch(err => console.error('CRM record visit error:', err.message));
    }

    // Trigger WhatsApp Thank You notification in the background
    if (saved.customerPhone && !saved.isActive) {
      (async () => {
        try {
          const Settings = require('../models/Settings');
          const settingsObj = await Settings.findOne();
          if (settingsObj && settingsObj.whatsappEnabled) {
            const whatsappService = require('../lib/whatsappService');
            await whatsappService.sendThankYouMessage(saved, settingsObj);
          }
        } catch (waErr) {
          console.error('[WhatsApp] Auto trigger error:', waErr.message);
        }
      })();
    }

    let updatedInventory = null;

    if (!order.inventoryFinalized && Array.isArray(items) && items.length > 0) {
      try {
        const deductedKots = await KOT.find({
          orderId: order._id,
          tableNo: order.tableNo,
          inventoryDeducted: true
        }).select('items');
        const alreadyDeducted = aggregateQuantities(deductedKots.flatMap(kot => kot.items || []));
        const deltaItems = buildInventoryDelta(items, alreadyDeducted);

        if (deltaItems.length > 0) {
          updatedInventory = await deductInventoryForItems(deltaItems, order.businessDate || order.date);
          broadcastInventoryUpdate(req, updatedInventory, {
            orderId: req.params.id,
            source: 'FINAL_BILL'
          });
        }

        order.inventoryFinalized = true;
        order.inventoryFinalizedAt = new Date();
        await order.save();
      } catch (bulkErr) {
        console.error('Inventory finalization error:', bulkErr.message);
      }
    }

    const response = saved.toObject();
    if (updatedInventory) response.inventory = updatedInventory;
    response.inventoryFinalized = order.inventoryFinalized;
    response.inventoryFinalizedAt = order.inventoryFinalizedAt;
    await TableSession.findOneAndDelete({ activeOrderId: order._id });
    res.json(response);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET FULL ORDER HISTORY (including completed) ────────────────────
router.get('/history/all', async (req, res) => {
  try {
    const orders = await Order.find({ isActive: false, grandTotal: { $gt: 0 }, billNo: { $ne: '' } }).sort({ date: -1, billNo: -1 }).populate('kotIds');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── SETTLE PAYMENT (old flow preserved for compatibility) ───────
router.patch('/:id/settle', async (req, res) => {
  try {
    const { paidAmount, paymentMode, cashAmount, upiAmount } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const wasActive = order.isActive;

    if (order.grandTotal <= 0) {
      return res.status(400).json({ message: 'Cannot settle payment for order with grand total 0' });
    }

    if (paidAmount !== undefined) {
      order.paidAmount = (order.paidAmount || 0) + parseFloat(paidAmount || 0);
      order.dueAmount = Math.max(0, order.grandTotal - order.paidAmount);
    }

    if (paymentMode) {
      order.paymentMode = paymentMode;
    }
    if (cashAmount !== undefined) order.cashAmount = parseFloat(cashAmount) || 0;
    if (upiAmount !== undefined) order.upiAmount = parseFloat(upiAmount) || 0;

    // Mark order as paid when full payment received
    if (order.dueAmount <= 0) {
      order.orderStatus = 'PAID';
      order.isActive = false;
      if (wasActive || !order.billNo || order.billNo === 'PENDING') {
        order.date = new Date();
        order.businessDate = getBusinessDateString(order.date);
        order.billNo = await generateNextBillNo(order.businessDate);
      } else if (!order.businessDate) {
        order.businessDate = getBusinessDateString(order.date || order.createdAt);
      }
    }

    const saved = await order.save();

    // Update table session
    await TableSession.findOneAndUpdate(
      { activeOrderId: order._id },
      {
        $set: {
          paymentReceived: true,
          status: 'PAID',
          lastActivityAt: new Date()
        }
      }
    );

    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json(saved);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── UPDATE DISCOUNT FOR ORDER ───────────────────────────────────
router.patch('/:id/discount', async (req, res) => {
  try {
    const { discount } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const discountVal = parseFloat(discount) || 0;
    const serviceTaxVal = order.serviceTax || 0;
    const subtotalAndTax = order.subtotal + order.sgst + order.cgst + serviceTaxVal;
    if (discountVal < 0 || discountVal > subtotalAndTax) {
      return res.status(400).json({ message: 'Invalid discount amount' });
    }

    order.discount = discountVal;

    // Recalculate grandTotal and roundOff
    const rawTotal = subtotalAndTax - discountVal;
    const rounded = Math.round(rawTotal);
    order.roundOff = rounded - rawTotal;
    order.grandTotal = rounded;

    // Adjust payments if paid
    if (order.dueAmount <= 0) {
      order.paidAmount = rounded;
      if (order.paymentMode === 'cash') {
        order.cashAmount = rounded;
        order.upiAmount = 0;
      } else if (order.paymentMode === 'upi') {
        order.cashAmount = 0;
        order.upiAmount = rounded;
      } else if (order.paymentMode === 'split') {
        // Adjust splits proportionally
        const totalSplit = order.cashAmount + order.upiAmount;
        if (totalSplit > 0) {
          const ratio = rounded / totalSplit;
          order.cashAmount = Math.max(0, parseFloat((order.cashAmount * ratio).toFixed(2)));
          order.upiAmount = Math.max(0, parseFloat((order.upiAmount * ratio).toFixed(2)));
        } else {
          order.cashAmount = rounded;
          order.upiAmount = 0;
        }
      }
    } else {
      order.dueAmount = Math.max(0, rounded - order.paidAmount);
    }

    if (!order.businessDate) {
      order.businessDate = getBusinessDateString(order.date || order.createdAt);
    }

    const saved = await order.save();
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── COMPLETE ORDER & CLEAR TABLE ────────────────────────────────
router.patch('/:id/complete', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const wasActive = order.isActive;

    // Server-side safeguard for CLR item
    const hasClrItem = Array.isArray(order.items) && order.items.some(i => i.name && i.name.toUpperCase() === 'CLR');
    if (hasClrItem) {
      await KOT.deleteMany({ orderId: order._id });
      await TableSession.findOneAndDelete({ activeOrderId: order._id });
      await Order.findByIdAndDelete(order._id);
      await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
      return res.json({ success: true, cleared: true, _id: order._id, tableNo: order.tableNo });
    }

    if (order.grandTotal <= 0) {
      return res.status(400).json({ message: 'Cannot complete order with grand total 0' });
    }

    // Mark order as completed
    order.orderStatus = 'COMPLETED';
    order.isActive = false;
    if (wasActive || !order.billNo || order.billNo === 'PENDING') {
      order.date = new Date();
      order.businessDate = getBusinessDateString(order.date);
      order.billNo = await generateNextBillNo(order.businessDate);
    } else if (!order.businessDate) {
      order.businessDate = getBusinessDateString(order.date || order.createdAt);
    }
    const saved = await order.save();

    // Trigger WhatsApp Thank You notification in the background
    if (saved.customerPhone && !saved.isActive) {
      (async () => {
        try {
          const Settings = require('../models/Settings');
          const settingsObj = await Settings.findOne();
          if (settingsObj && settingsObj.whatsappEnabled) {
            const whatsappService = require('../lib/whatsappService');
            await whatsappService.sendThankYouMessage(saved, settingsObj);
          }
        } catch (waErr) {
          console.error('[WhatsApp] Auto trigger error:', waErr.message);
        }
      })();
    }

    // Mark table session as completed and delete it to free the table index
    await TableSession.findOneAndDelete({ activeOrderId: order._id });

    res.json(saved);
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── GET ACTIVE ORDERS ───────────────────────────────────────────
router.get('/active/all', async (req, res) => {
  try {
    const orders = await Order.find({ isActive: true }).sort({ date: -1 }).populate('kotIds');
    res.json(orders);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await Order.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Order not found' });
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ message: 'Order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ── CANCEL TABLE SESSION (CLR – wipe table without saving to history) ───
router.delete('/table/:tableNo/cancel', async (req, res) => {
  try {
    const tableNo = parseInt(req.params.tableNo);

    // Find the active session for this table
    const sessions = await TableSession.find({ tableNo, status: { $ne: 'COMPLETED' } });

    for (const session of sessions) {
      const orderId = session.activeOrderId;

      // Delete all KOTs linked to this order
      if (orderId) {
        await KOT.deleteMany({ orderId });
        // Delete the order itself (no history kept)
        await Order.findByIdAndDelete(orderId);
      }

      // Delete the session
      await TableSession.findByIdAndDelete(session._id);
    }

    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ success: true, message: `Table ${tableNo} cleared` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── ADMIN: Reset all bills and counters ─────────────────────────
router.post('/admin/reset-bills', requireRole(['admin']), async (req, res) => {
  try {
    await Order.deleteMany({});
    // Invalidate all relevant cache keys
    await deleteCache([ORDERS_CACHE_KEY, REPORT_SUMMARY_CACHE_KEY]);
    res.json({ message: 'All bills and counters have been reset.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
