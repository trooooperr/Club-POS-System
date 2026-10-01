const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const app = require('../../app');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { generateToken } = require('../middleware/auth');

describe('Bookings API & Analytics Integration', () => {
  let mongoServer;
  let adminToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    const admin = await User.create({
      username: 'admin',
      passwordHash: 'dummyhash',
      role: 'admin',
      name: 'System Admin'
    });

    adminToken = generateToken(admin);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Booking.deleteMany({});
  });

  it('should create a new booking with advance payment and list upcoming bookings chronologically', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    // 1. Create booking for tomorrow
    const bookingData = {
      customerName: 'Aarav Patel',
      customerPhone: '9876543210',
      bookingDate: tomorrow,
      bookingTime: '08:00 PM',
      guestCount: 15,
      tableNo: 'VIP Hall',
      occasion: 'Birthday Party',
      billingType: 'per_plate',
      pricePerPlate: 800,
      totalAmount: 12000,
      advancePayment: 5000,
      advancePaymentMode: 'upi',
      advancePaymentDate: today,
      notes: 'Arranged cake and balloon decor'
    };

    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(bookingData);

    expect(res.statusCode).toBe(201);
    expect(res.body.bookingNo).toMatch(/^BK-/);
    expect(res.body.customerName).toBe('Aarav Patel');
    expect(res.body.advancePayment).toBe(5000);
    expect(res.body.advancePaymentMode).toBe('upi');

    // 2. Fetch upcoming bookings
    const listRes = await request(app)
      .get('/api/bookings?type=upcoming')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.bookings.length).toBe(1);
    expect(listRes.body.summary.totalAdvance).toBe(5000);
    expect(listRes.body.summary.upcomingCount).toBe(1);
  });

  it('should count advance payment in analytics report for the advance payment date', async () => {
    const today = new Date().toISOString().slice(0, 10);

    await Booking.create({
      bookingNo: 'BK-TEST-001',
      customerName: 'Rohit Verma',
      customerPhone: '9988776655',
      bookingDate: '2026-10-15',
      bookingTime: '07:30 PM',
      guestCount: 20,
      totalAmount: 25000,
      advancePayment: 8000,
      advancePaymentMode: 'cash',
      advancePaymentDate: today,
      createdAtDate: today,
      status: 'confirmed'
    });

    const analyticsRes = await request(app)
      .get(`/api/reports/analytics?startDate=${today}&endDate=${today}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(analyticsRes.statusCode).toBe(200);
    expect(analyticsRes.body.advancePayments).toBe(8000);
    expect(analyticsRes.body.revenue).toBeGreaterThanOrEqual(8000);
    expect(analyticsRes.body.bookingCount).toBe(1);
  });
});
