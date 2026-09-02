const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  billNo:        { type: String, default: '', index: true },
  date:          { type: Date, default: Date.now, index: true },
  businessDate:  { type: String, default: '', index: true },
  grandTotal:    { type: Number, required: true },
  paidAmount:    { type: Number, default: 0 },
  dueAmount:     { type: Number, default: 0, index: true },
  paymentMode:   { type: String, required: true },
  cashAmount:    { type: Number, default: 0 },
  upiAmount:     { type: Number, default: 0 },
  tableNo:       { type: Number, required: true },
  items:         [{ name: String, quantity: Number, price: Number, notes: { type: String, default: '' } }],
  subtotal:      { type: Number, required: true },
  sgst:          { type: Number, required: true },
  cgst:          { type: Number, required: true },
  serviceTax:    { type: Number, default: 0 },
  serviceTaxRate:{ type: Number, default: 0 },
  discount:      { type: Number, default: 0 },
  roundOff:      { type: Number, default: 0 },
  customerPhone: { type: String, default: '' },
  customerName:  { type: String, default: '' },
  waiterName:    { type: String, default: '' },
  orderType:     { type: String, enum: ['dine-in', 'takeaway', 'delivery'], default: 'dine-in' },
  // KOT System additions
  orderStatus:   {
    type: String,
    enum: ['OPEN', 'KOT_SENT', 'PREPARING', 'READY', 'BILLING', 'PAID', 'COMPLETED'],
    default: 'OPEN',
    index: true
  },
  kotIds:        [{ type: mongoose.Schema.Types.ObjectId, ref: 'KOT' }], // All KOTs for this order
  isActive:      { type: Boolean, default: true, index: true }, // Session is still open
  inventoryFinalized: { type: Boolean, default: false },
  inventoryFinalizedAt: { type: Date },
  paymentStatus: { type: String, enum: ['paid', 'partial', 'pending'], default: 'paid', index: true },
  isCredit:      { type: Boolean, default: false, index: true },
  isManualDue:   { type: Boolean, default: false, index: true },
  settlementHistory: [{
    amount: { type: Number, required: true },
    paymentMode: { type: String, default: 'cash' },
    date: { type: Date, default: Date.now },
    settledBy: { type: String, default: '' }
  }],
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
