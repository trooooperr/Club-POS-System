const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    enum: ['Raw Material', 'Utilities', 'Maintenance', 'Staff Advance', 'Marketing', 'Rent', 'Other'],
    default: 'Other'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'upi', 'bank_transfer', 'other'],
    default: 'cash'
  },
  date: {
    type: Date,
    default: Date.now
  },
  businessDate: {
    type: String,
    index: true
  },
  notes: {
    type: String,
    trim: true
  },
  personName: {
    type: String,
    trim: true,
    default: ''
  },
  createdBy: {
    type: String,
    default: 'system'
  }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);
