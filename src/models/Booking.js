const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  bookingNo: { type: String, required: true, unique: true, index: true },
  customerName: { type: String, required: true, trim: true },
  customerPhone: { type: String, required: true, trim: true },
  bookingDate: { type: String, required: true, index: true }, // Date of the booking/event (YYYY-MM-DD)
  bookingTime: { type: String, default: '07:00 PM', trim: true },
  guestCount: { type: Number, default: 2, min: 1 },
  tableNo: { type: String, default: '', trim: true }, // Table or area reserved (e.g. "Table 4", "VIP Lounge", "Rooftop")
  occasion: { 
    type: String, 
    enum: ['Birthday Party', 'Anniversary', 'Corporate Event', 'Family Dinner', 'Kitty Party', 'Table Reservation', 'Other'], 
    default: 'Table Reservation' 
  },
  billingType: { 
    type: String, 
    enum: ['table_only', 'custom', 'per_plate'], 
    default: 'table_only' 
  },
  pricePerPlate: { type: Number, default: 0 },
  foodAmount: { type: Number, default: 0 }, // Food / catering component
  decorationAmount: { type: Number, default: 0 }, // Decoration & setup amount
  totalAmount: { type: Number, default: 0 }, // Estimated / Agreed total billing amount
  advancePayment: { type: Number, default: 0 }, // Advance payment collected
  advancePaymentMode: { 
    type: String, 
    enum: ['cash', 'upi', 'card', 'split'], 
    default: 'cash' 
  },
  advanceCashAmount: { type: Number, default: 0 },
  advanceUpiAmount: { type: Number, default: 0 },
  advancePaymentDate: { type: String, required: true, index: true }, // Business date when advance was paid (YYYY-MM-DD)
  status: { 
    type: String, 
    enum: ['confirmed', 'completed', 'cancelled'], 
    default: 'confirmed',
    index: true
  },
  notes: { type: String, default: '', trim: true },
  managerName: { type: String, default: '', trim: true }, // Manager or staff who handled booking
  createdBy: { type: String, default: '' },
  createdAtDate: { type: String, default: '' } // Business date when booking was created
}, { 
  timestamps: true 
});

module.exports = mongoose.model('Booking', bookingSchema);
