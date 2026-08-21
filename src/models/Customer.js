const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, index: true },
  name:  { type: String, default: '' },
  email: { type: String, default: '' },
  visitCount: { type: Number, default: 1 },
  visitsCount: { type: Number, default: 1 },
  totalSpent: { type: Number, default: 0 },
  sources: { type: [String], default: ['ordering'] },
  lastVisitDate: { type: Date, default: Date.now },
  visits: [{
    date: { type: Date, default: Date.now },
    billNo: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    itemsCount: { type: Number, default: 0 },
    orderType: { type: String, default: 'dine-in' }
  }]
}, { timestamps: true, strict: false });

module.exports = mongoose.model('Customer', customerSchema);
