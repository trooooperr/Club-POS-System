const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');

let mongo;

describe('Attendance & GST Settings API', () => {
  let token;
  let worker1;
  let worker2;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    await Settings.create({
      restaurantName: 'HumTum POS',
      currency: '₹',
      gstRate: 5,
      sgstRate: 2.5,
      cgstRate: 2.5
    });

    const user = await User.create({
      name: 'Admin',
      username: 'admin',
      passwordHash: 'admin123',
      role: 'admin'
    });
    token = generateToken(user);

    worker1 = await Worker.create({
      name: 'Ramesh Kumar',
      role: 'Waiter',
      contact: '9876543210',
      salary: 15000
    });

    worker2 = await Worker.create({
      name: 'Suresh Singh',
      role: 'Bartender',
      contact: '9876543211',
      salary: 20000
    });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  it('should return default present status for all staff on daily attendance', async () => {
    const res = await request(app)
      .get('/api/attendance/daily?date=2026-09-11')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendance.length).toBe(2);
    // Default is present
    expect(res.body.attendance[0].status).toBe('present');
    expect(res.body.attendance[1].status).toBe('present');
    expect(res.body.summary.present).toBe(2);
    expect(res.body.summary.absent).toBe(0);
  });

  it('should mark a worker absent with reason', async () => {
    const res = await request(app)
      .post('/api/attendance/mark')
      .set('Authorization', `Bearer ${token}`)
      .send({
        workerId: worker1._id.toString(),
        date: '2026-09-11',
        status: 'absent',
        note: 'Sick leave / fever'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.attendance.status).toBe('absent');
    expect(res.body.attendance.note).toBe('Sick leave / fever');
  });

  it('should reflect absence on daily attendance check', async () => {
    const res = await request(app)
      .get('/api/attendance/daily?date=2026-09-11')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.summary.present).toBe(1);
    expect(res.body.summary.absent).toBe(1);

    const w1 = res.body.attendance.find(a => a.workerId.toString() === worker1._id.toString());
    const w2 = res.body.attendance.find(a => a.workerId.toString() === worker2._id.toString());

    expect(w1.status).toBe('absent');
    expect(w1.note).toBe('Sick leave / fever');
    expect(w2.status).toBe('present');
  });

  it('should return detailed monthly breakdown with staff absence history', async () => {
    const res = await request(app)
      .get('/api/attendance/monthly?month=2026-09')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.staff.length).toBe(2);

    const w1 = res.body.staff.find(s => s.workerId.toString() === worker1._id.toString());
    expect(w1.absentDays).toBe(1);
    expect(w1.absenceDetails.length).toBe(1);
    expect(w1.absenceDetails[0].date).toBe('2026-09-11');
    expect(w1.absenceDetails[0].note).toBe('Sick leave / fever');

    const w2 = res.body.staff.find(s => s.workerId.toString() === worker2._id.toString());
    expect(w2.absentDays).toBe(0);
    expect(w2.absenceDetails.length).toBe(0);
  });

  it('should mark a date as restaurant closed day', async () => {
    const res = await request(app)
      .post('/api/attendance/closed-day')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-09-12',
        isClosed: true,
        reason: 'Weekly Off'
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isClosedDay).toBe(true);
    expect(res.body.closedDay.reason).toBe('Weekly Off');
  });

  it('should return closed day status on daily attendance', async () => {
    const res = await request(app)
      .get('/api/attendance/daily?date=2026-09-12')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isClosedDay).toBe(true);
    expect(res.body.closedDay.reason).toBe('Weekly Off');
    expect(res.body.summary.isClosedDay).toBe(true);
    expect(res.body.summary.present).toBe(0);
    expect(res.body.summary.absent).toBe(0);
    expect(res.body.attendance[0].status).toBe('closed');
    expect(res.body.attendance[1].status).toBe('closed');
  });

  it('should exclude closed days from active days in monthly report', async () => {
    const res = await request(app)
      .get('/api/attendance/monthly?month=2026-09')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalClosedDays).toBe(1);
    expect(res.body.closedDays.length).toBe(1);
    expect(res.body.closedDays[0].date).toBe('2026-09-12');
    expect(res.body.closedDays[0].reason).toBe('Weekly Off');

    // activeDays must exclude elapsed closed days
    expect(res.body.activeDays).toBe(res.body.elapsedDays - res.body.elapsedClosedDays);
    expect(res.body.overallStats.totalWorkingDays).toBe(res.body.activeDays);
    expect(res.body.overallStats.closedDaysCount).toBe(res.body.elapsedClosedDays);

    // Each staff member's totalDays should be the activeDays
    expect(res.body.staff[0].totalDays).toBe(res.body.activeDays);
    expect(res.body.staff[1].totalDays).toBe(res.body.activeDays);
  });

  it('should reopen a closed day when isClosed is false', async () => {
    const res = await request(app)
      .post('/api/attendance/closed-day')
      .set('Authorization', `Bearer ${token}`)
      .send({
        date: '2026-09-12',
        isClosed: false
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isClosedDay).toBe(false);

    // Verify daily attendance is now open again
    const dailyRes = await request(app)
      .get('/api/attendance/daily?date=2026-09-12')
      .set('Authorization', `Bearer ${token}`);

    expect(dailyRes.body.isClosedDay).toBe(false);
    expect(dailyRes.body.attendance[0].status).toBe('present');
  });

  it('should update GST rate in settings and synchronize cgst and sgst rates', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        gstRate: 6
      });

    expect(res.statusCode).toBe(200);
    expect(res.body.gstRate).toBe(6);
    expect(res.body.cgstRate).toBe(3);
    expect(res.body.sgstRate).toBe(3);
  });
});
