const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema({
  name: { type: String,required: true,unique: true,trim: true,index: true },
  category: { type: String, required: true, index: true },
  unit: { type: String, required: true },
  stock: { type: Number, default: 0, min: 0 },
  minStock: { type: Number, default: 5, min: 0 },
  price: { type: Number, required: true, default: 0, min: 0 },
  shortcut: { type: String, default: '', lowercase: true, trim: true },
  imageUrl: { type: String, default: '' },
  isAlcoholic: { type: Boolean, default: false },
  isAlcohol: { type: Boolean, default: false },
  trackStock: { type: Boolean, default: true },
  isAvailable: { type: Boolean, default: true },
  linkInventoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', default: null },
  stockDeductionQty: { type: Number, default: 1 },
  order: { type: Number, default: 0 }
},{ timestamps: true });

module.exports = mongoose.model('Inventory', inventorySchema);

