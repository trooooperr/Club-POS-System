const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const { requireRole } = require('../middleware/auth');
const { getBusinessDateString } = require('../lib/businessDay');

// Helper to generate next sequential booking number
async function generateBookingNo() {
  const todayStr = getBusinessDateString(new Date()).replace(/-/g, '').slice(2); // e.g. 261001
  const count = await Booking.countDocuments();
  const nextSeq = String(count + 1).padStart(3, '0');
  return `BK-${todayStr}-${nextSeq}`;
}

// GET /api/bookings - List bookings with filter & upcoming sorting
router.get('/', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { type, startDate, endDate, date, status, search } = req.query;
    const today = getBusinessDateString(new Date());
    const query = {};

    if (status && status !== 'all') {
      query.status = status;
    }

    if (type === 'upcoming') {
      query.bookingDate = { $gte: today };
      if (!query.status) {
        query.status = { $ne: 'cancelled' };
      }
    } else if (type === 'today') {
      query.bookingDate = today;
    } else if (type === 'past') {
      query.bookingDate = { $lt: today };
    } else if (date) {
      query.bookingDate = date;
    } else if (startDate && endDate) {
      query.bookingDate = { $gte: startDate, $lte: endDate };
    }

    if (search && search.trim()) {
      const s = search.trim();
      query.$or = [
        { customerName: { $regex: s, $options: 'i' } },
        { customerPhone: { $regex: s, $options: 'i' } },
        { bookingNo: { $regex: s, $options: 'i' } },
        { tableNo: { $regex: s, $options: 'i' } },
        { occasion: { $regex: s, $options: 'i' } }
      ];
    }

    // Sort upcoming ascending by date and time so next upcoming is first; past descending
    const sortOrder = type === 'upcoming' 
      ? { bookingDate: 1, bookingTime: 1, createdAt: 1 } 
      : { bookingDate: -1, bookingTime: -1, createdAt: -1 };

    const bookings = await Booking.find(query).sort(sortOrder).lean();

    // Summary calculations across matching bookings
    const summary = bookings.reduce((acc, b) => {
      acc.totalBookings += 1;
      acc.totalAdvance += (b.advancePayment || 0);
      acc.totalEstimatedAmount += (b.totalAmount || 0);
      if (b.bookingDate >= today && b.status !== 'cancelled') {
        acc.upcomingCount += 1;
      }
      return acc;
    }, { totalBookings: 0, totalAdvance: 0, totalEstimatedAmount: 0, upcomingCount: 0 });

    res.json({ bookings, summary });
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/bookings - Create new booking
router.post('/', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { 
      customerName, 
      customerPhone, 
      bookingDate, 
      bookingTime, 
      guestCount, 
      tableNo, 
      occasion,
      billingType,
      pricePerPlate,
      foodAmount,
      decorationAmount,
      totalAmount, 
      advancePayment, 
      advancePaymentMode, 
      advanceCashAmount, 
      advanceUpiAmount,
      advancePaymentDate,
      status, 
      notes, 
      managerName 
    } = req.body;

    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    if (!customerPhone || !customerPhone.trim()) {
      return res.status(400).json({ error: 'Customer phone number is required' });
    }
    if (!bookingDate) {
      return res.status(400).json({ error: 'Booking date is required' });
    }

    const todayStr = getBusinessDateString(new Date());
    const bookingNo = await generateBookingNo();

    const advAmt = Math.max(0, parseFloat(advancePayment) || 0);
    const guestNum = Math.max(1, parseInt(guestCount, 10) || 1);
    const pPerPlate = Math.max(0, parseFloat(pricePerPlate) || 0);
    const decorAmt = Math.max(0, parseFloat(decorationAmount) || 0);
    let foodAmt = Math.max(0, parseFloat(foodAmount) || 0);

    if (billingType === 'per_plate' && pPerPlate > 0) {
      foodAmt = guestNum * pPerPlate;
    }

    let estTotal = Math.max(0, parseFloat(totalAmount) || 0);
    if (estTotal === 0 && (foodAmt > 0 || decorAmt > 0)) {
      estTotal = foodAmt + decorAmt;
    }

    const mode = advancePaymentMode || 'cash';
    let cashAmt = 0;
    let upiAmt = 0;
    if (advAmt > 0) {
      if (mode === 'split') {
        cashAmt = Math.max(0, parseFloat(advanceCashAmount) || 0);
        upiAmt = Math.max(0, parseFloat(advanceUpiAmount) || 0);
      } else if (mode === 'upi') {
        upiAmt = advAmt;
      } else {
        cashAmt = advAmt;
      }
    }

    const booking = new Booking({
      bookingNo,
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      bookingDate: bookingDate.trim(),
      bookingTime: (bookingTime || '07:00 PM').trim(),
      guestCount: guestNum,
      tableNo: (tableNo || '').trim(),
      occasion: occasion || 'Table Reservation',
      billingType: billingType || 'custom',
      pricePerPlate: pPerPlate,
      foodAmount: foodAmt,
      decorationAmount: decorAmt,
      totalAmount: estTotal,
      advancePayment: advAmt,
      advancePaymentMode: mode,
      advanceCashAmount: cashAmt,
      advanceUpiAmount: upiAmt,
      advancePaymentDate: (advancePaymentDate || todayStr).trim(),
      status: status || 'confirmed',
      notes: (notes || '').trim(),
      managerName: (managerName || req.user?.username || '').trim(),
      createdBy: req.user?.username || '',
      createdAtDate: todayStr
    });

    const saved = await booking.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/bookings/:id - Update booking
router.put('/:id', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });

    const { 
      customerName, 
      customerPhone, 
      bookingDate, 
      bookingTime, 
      guestCount, 
      tableNo, 
      occasion,
      billingType,
      pricePerPlate,
      foodAmount,
      decorationAmount,
      totalAmount, 
      advancePayment, 
      advancePaymentMode, 
      advanceCashAmount, 
      advanceUpiAmount,
      advancePaymentDate,
      status, 
      notes, 
      managerName 
    } = req.body;

    if (customerName) booking.customerName = customerName.trim();
    if (customerPhone) booking.customerPhone = customerPhone.trim();
    if (bookingDate) booking.bookingDate = bookingDate.trim();
    if (bookingTime) booking.bookingTime = bookingTime.trim();
    if (guestCount !== undefined) booking.guestCount = Math.max(1, parseInt(guestCount, 10) || 1);
    if (tableNo !== undefined) booking.tableNo = tableNo.trim();
    if (occasion) booking.occasion = occasion;
    if (billingType) booking.billingType = billingType;
    if (pricePerPlate !== undefined) booking.pricePerPlate = Math.max(0, parseFloat(pricePerPlate) || 0);
    if (decorationAmount !== undefined) booking.decorationAmount = Math.max(0, parseFloat(decorationAmount) || 0);

    let foodAmt = parseFloat(foodAmount);
    if (isNaN(foodAmt)) {
      foodAmt = booking.foodAmount || 0;
    }
    if (booking.billingType === 'per_plate' && booking.pricePerPlate > 0) {
      foodAmt = booking.guestCount * booking.pricePerPlate;
    }
    booking.foodAmount = foodAmt;

    let estTotal = parseFloat(totalAmount);
    if (isNaN(estTotal) || estTotal === 0) {
      estTotal = booking.foodAmount + booking.decorationAmount;
    }
    booking.totalAmount = estTotal;

    if (advancePayment !== undefined) {
      const advAmt = Math.max(0, parseFloat(advancePayment) || 0);
      booking.advancePayment = advAmt;
      const mode = advancePaymentMode || booking.advancePaymentMode || 'cash';
      booking.advancePaymentMode = mode;
      if (mode === 'split') {
        booking.advanceCashAmount = Math.max(0, parseFloat(advanceCashAmount) || 0);
        booking.advanceUpiAmount = Math.max(0, parseFloat(advanceUpiAmount) || 0);
      } else if (mode === 'upi') {
        booking.advanceUpiAmount = advAmt;
        booking.advanceCashAmount = 0;
      } else {
        booking.advanceCashAmount = advAmt;
        booking.advanceUpiAmount = 0;
      }
    }

    if (advancePaymentDate) booking.advancePaymentDate = advancePaymentDate.trim();
    if (status) booking.status = status;
    if (notes !== undefined) booking.notes = notes.trim();
    if (managerName !== undefined) booking.managerName = managerName.trim();

    const updated = await booking.save();
    res.json(updated);
  } catch (err) {
    console.error('Error updating booking:', err);
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/bookings/:id/status - Quick status toggle
router.patch('/:id/status', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const booking = await Booking.findByIdAndUpdate(
      req.params.id, 
      { $set: { status } }, 
      { new: true }
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/bookings/:id - Delete booking
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    res.json({ success: true, message: 'Booking deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
