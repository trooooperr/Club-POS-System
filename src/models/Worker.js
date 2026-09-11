const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  role: { type: String, default: 'Staff' },
  salary: { type: Number, default: 0, min: 0 },
  paidSalary: { type: Number, default: 0 },
  advance: { type: Number, default: 0 },
  contact: { 
    type: String, 
    default: '',
    validate: {
      validator: function(v) {
        return v === '' || /^\d{10}$/.test(v); 
      },
      message: props => `${props.value} is not a valid 10-digit phone number!`
    }
  },
  email: { type: String, default: '', trim: true, lowercase: true },
  upiId: { type: String, default: '', trim: true },
  joiningDate: { type: Date, default: Date.now },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Worker', workerSchema);