const mongoose = require('mongoose');

// Global permanent counter — never resets, always increments
const bookingCounterSchema = new mongoose.Schema({
  _id: { type: String, default: 'global' },
  seq: { type: Number, default: 0 }
}, { timestamps: false });

module.exports = mongoose.model('BookingCounter', bookingCounterSchema);
