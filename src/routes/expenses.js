const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const { requireRole } = require('../middleware/auth');
const { getBusinessDateString } = require('../lib/businessDay');

// GET /api/expenses (with optional date range filter)
router.get('/', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { startDate, endDate, category } = req.query;
    const filter = {};

    if (startDate && endDate) {
      filter.businessDate = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      filter.businessDate = { $gte: startDate };
    } else if (endDate) {
      filter.businessDate = { $lte: endDate };
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    const expenses = await Expense.find(filter).sort({ date: -1, createdAt: -1 }).lean();

    const totalAmount = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const categoryBreakdown = {};
    expenses.forEach(e => {
      const cat = e.category || 'Other';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + (parseFloat(e.amount) || 0);
    });

    res.json({
      expenses,
      totalAmount,
      count: expenses.length,
      categoryBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/expenses
router.post('/', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { title, amount, category, paymentMethod, date, notes, personName } = req.body;
    if (!title || amount === undefined) {
      return res.status(400).json({ message: 'Title and amount are required' });
    }

    const expDate = date ? new Date(date) : new Date();
    const businessDate = getBusinessDateString(expDate);

    const newExpense = new Expense({
      title,
      amount: parseFloat(amount) || 0,
      category: category || 'Other',
      paymentMethod: paymentMethod || 'cash',
      date: expDate,
      businessDate,
      notes: notes || '',
      personName: personName || '',
      createdBy: req.user?.username || 'staff'
    });

    const saved = await newExpense.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/expenses/:id
router.put('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { title, amount, category, paymentMethod, date, notes, personName } = req.body;
    const expense = await Expense.findById(req.params.id);
    if (!expense) return res.status(404).json({ message: 'Expense not found' });

    if (title) expense.title = title;
    if (amount !== undefined) expense.amount = parseFloat(amount) || 0;
    if (category) expense.category = category;
    if (paymentMethod) expense.paymentMethod = paymentMethod;
    if (notes !== undefined) expense.notes = notes;
    if (personName !== undefined) expense.personName = personName;
    if (date) {
      expense.date = new Date(date);
      expense.businessDate = getBusinessDateString(expense.date);
    }

    const saved = await expense.save();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Expense not found' });
    res.json({ success: true, message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
