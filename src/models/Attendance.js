const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  workerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Worker', 
    required: true, 
    index: true 
  },
  workerName: { 
    type: String, 
    required: true, 
    trim: true 
  },
  date: { 
    type: String, 
    required: true, 
    index: true // Formatted YYYY-MM-DD
  },
  month: { 
    type: String, 
    required: true, 
    index: true // Formatted YYYY-MM
  },
  status: { 
    type: String, 
    enum: ['present', 'absent', 'half-day', 'leave'], 
    default: 'present',
    required: true,
    index: true
  },
  note: { 
    type: String, 
    default: '', 
    trim: true 
  },
  markedBy: { 
    type: String, 
    default: 'admin' 
  }
}, { timestamps: true });

// Ensure unique attendance per worker per date
attendanceSchema.index({ workerId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ month: 1, workerId: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
