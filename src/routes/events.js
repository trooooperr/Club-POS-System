const express = require('express');
const router  = express.Router();
const Event   = require('../models/Event');
const { requireRole } = require('../middleware/auth');
const { getBusinessDateString } = require('../lib/businessDay');

function calculateEventTotals(data) {
  const billingType = data.billingType === 'per_plate' ? 'per_plate' : 'custom';
  const guestCount = Math.max(0, parseInt(data.guestCount, 10) || 0);
  const pricePerPlate = Math.max(0, parseFloat(data.pricePerPlate) || 0);
  
  let plateTotal = 0;
  if (billingType === 'per_plate') {
    plateTotal = Math.round(guestCount * pricePerPlate);
  }

  const rawExpenses = Array.isArray(data.expenses) ? data.expenses : [];
  const expenses = rawExpenses
    .filter(e => e && e.name && e.name.trim())
    .map(e => ({
      name: e.name.trim(),
      amount: Math.max(0, parseFloat(e.amount) || 0)
    }));

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const additionalCharges = Math.max(0, parseFloat(data.additionalCharges) || 0);

  // Grand total is revenue charged for the event
  // For per_plate: plateTotal + additionalCharges
  // For custom: package/additionalCharges + (if user billed expenses or fixed price)
  let grandTotal = 0;
  if (billingType === 'per_plate') {
    grandTotal = plateTotal + additionalCharges;
  } else {
    grandTotal = additionalCharges; // Package price or event billing amount entered
  }

  const netRevenue = grandTotal - totalExpenses;

  return {
    billingType,
    guestCount,
    pricePerPlate,
    plateTotal,
    expenses,
    totalExpenses,
    additionalCharges,
    grandTotal,
    netRevenue
  };
}

// GET /api/events - List events with optional date range filter
router.get('/', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { startDate, endDate, date } = req.query;
    const query = {};

    if (date) {
      query.date = date;
    } else if (startDate && endDate) {
      query.date = { $gte: startDate, $lte: endDate };
    }

    const events = await Event.find(query).sort({ date: -1, createdAt: -1 });

    // Summary calculations
    const summary = events.reduce((acc, ev) => {
      acc.totalRevenue += (ev.grandTotal || 0);
      acc.totalExpenses += (ev.totalExpenses || 0);
      acc.netRevenue += (ev.netRevenue || 0);
      acc.count += 1;
      return acc;
    }, { totalRevenue: 0, totalExpenses: 0, netRevenue: 0, count: 0 });

    res.json({ events, summary });
  } catch (err) {
    console.error('Error fetching events:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/events - Create new event
router.post('/', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { name, hostedBy, date, paymentMode, cashAmount, upiAmount, status, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Event name is required' });
    }

    const eventDate = date || getBusinessDateString(new Date());
    const totals = calculateEventTotals(req.body);

    const event = new Event({
      name: name.trim(),
      hostedBy: hostedBy ? hostedBy.trim() : '',
      date: eventDate,
      ...totals,
      paymentMode: paymentMode || 'cash',
      cashAmount: parseFloat(cashAmount) || (paymentMode === 'cash' ? totals.grandTotal : 0),
      upiAmount: parseFloat(upiAmount) || (paymentMode === 'upi' ? totals.grandTotal : 0),
      status: status || 'completed',
      notes: notes || '',
      createdBy: req.user?.username || req.user?.name || 'Staff'
    });

    await event.save();
    res.status(201).json(event);
  } catch (err) {
    console.error('Error creating event:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/events/:id - Update event
router.put('/:id', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, hostedBy, date, paymentMode, cashAmount, upiAmount, status, notes } = req.body;

    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (name) event.name = name.trim();
    if (hostedBy !== undefined) event.hostedBy = hostedBy.trim();
    if (date) event.date = date;

    const totals = calculateEventTotals({
      billingType: req.body.billingType !== undefined ? req.body.billingType : event.billingType,
      guestCount: req.body.guestCount !== undefined ? req.body.guestCount : event.guestCount,
      pricePerPlate: req.body.pricePerPlate !== undefined ? req.body.pricePerPlate : event.pricePerPlate,
      expenses: req.body.expenses !== undefined ? req.body.expenses : event.expenses,
      additionalCharges: req.body.additionalCharges !== undefined ? req.body.additionalCharges : event.additionalCharges,
    });

    Object.assign(event, totals);

    if (paymentMode) event.paymentMode = paymentMode;
    if (cashAmount !== undefined) event.cashAmount = parseFloat(cashAmount) || 0;
    if (upiAmount !== undefined) event.upiAmount = parseFloat(upiAmount) || 0;
    if (status) event.status = status;
    if (notes !== undefined) event.notes = notes;

    await event.save();
    res.json(event);
  } catch (err) {
    console.error('Error updating event:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/events/:id - Delete event
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const event = await Event.findByIdAndDelete(id);
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    res.json({ message: 'Event deleted successfully', id });
  } catch (err) {
    console.error('Error deleting event:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
