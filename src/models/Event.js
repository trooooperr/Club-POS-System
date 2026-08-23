const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, default: 0 },
}, { _id: false });

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  hostedBy: { type: String, default: '', trim: true },
  date: { type: String, required: true, index: true }, // Format: YYYY-MM-DD (business date)
  billingType: { 
    type: String, 
    enum: ['custom', 'per_plate'], 
    default: 'custom' // Primary default is custom expense/menu, secondary is per_plate
  },
  guestCount: { type: Number, default: 0 },
  pricePerPlate: { type: Number, default: 0 },
  plateTotal: { type: Number, default: 0 },
  expenses: [expenseSchema],
  totalExpenses: { type: Number, default: 0 },
  additionalCharges: { type: Number, default: 0 },
  grandTotal: { type: Number, default: 0 }, // Overall Event revenue / amount
  netRevenue: { type: Number, default: 0 }, // grandTotal - totalExpenses
  paymentMode: { 
    type: String, 
    enum: ['cash', 'upi', 'card', 'split', 'pending'], 
    default: 'cash' 
  },
  cashAmount: { type: Number, default: 0 },
  upiAmount: { type: Number, default: 0 },
  status: { 
    type: String, 
    enum: ['completed', 'ongoing', 'cancelled'], 
    default: 'completed' 
  },
  notes: { type: String, default: '' },
  createdBy: { type: String, default: '' },
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Event', eventSchema);
