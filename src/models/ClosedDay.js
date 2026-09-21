const mongoose = require('mongoose');

const closedDaySchema = new mongoose.Schema({
  date: {
    type: String,
    required: true,
    unique: true, // Formatted YYYY-MM-DD
    index: true
  },
  month: {
    type: String,
    required: true, // Formatted YYYY-MM
    index: true
  },
  reason: {
    type: String,
    default: 'Restaurant Closed',
    trim: true
  },
  markedBy: {
    type: String,
    default: 'admin'
  }
}, { timestamps: true });

closedDaySchema.index({ month: 1, date: 1 });

module.exports = mongoose.model('ClosedDay', closedDaySchema);
