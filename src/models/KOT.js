const mongoose = require('mongoose');

const kotSchema = new mongoose.Schema({
  kotNo:        { type: String, required: true, index: true },
  orderId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  tableNo:      { type: Number, required: true, index: true },
  items:        [{
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
    name:       { type: String, required: true },
    quantity:   { type: Number, required: true },
    price:      { type: Number, required: true },
    department: { type: String, default: 'kitchen' }, // kitchen, bar, dessert, etc.
    notes:      { type: String, default: '' }
  }],
  status:       {
    type: String,
    enum: ['PENDING', 'PREPARING', 'READY', 'SERVED', 'COMPLETED'],
    default: 'PENDING',
    index: true
  },
  notes:        { type: String, default: '' },
  waiterName:    { type: String, default: '' },
  orderType:     { type: String, default: 'dine-in' },
  createdAt:    { type: Date, default: Date.now, index: true },
  startedAt:    { type: Date },
  readyAt:      { type: Date },
  servedAt:     { type: Date },
  completedAt:  { type: Date },
  departmentQueues: { type: Map, of: String }, // Maps department to queue status
  printCount:   { type: Number, default: 0 },
  inventoryDeducted: { type: Boolean, default: false, index: true },
  inventoryDeductedAt: { type: Date },
  source:       { type: String, default: 'table', index: true },
  offlineSyncId:{ type: String, default: '', index: true },
}, { timestamps: true });

// Index for common queries
kotSchema.index({ orderId: 1, tableNo: 1 });
kotSchema.index({ status: 1, createdAt: -1 });
kotSchema.index({ tableNo: 1, status: 1 });

module.exports = mongoose.model('KOT', kotSchema);
