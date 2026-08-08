const mongoose = require('mongoose');

const kotCounterSchema = new mongoose.Schema({
  businessDate: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('KotCounter', kotCounterSchema);
