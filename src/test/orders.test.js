const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');

let mongo;

describe('Orders API', () => {
  let token;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    
    const user = await User.create({
      name: 'Admin',
      username: 'admin',
      passwordHash: 'admin123',
      role: 'admin'
    });
    token = generateToken(user);
    
    await Inventory.create({
      name: 'Test Soda',
      category: 'General',
      unit: 'Bottles',
      stock: 10,
      minStock: 2,
      price: 50
    });
    await MenuItem.create({
      name: 'Test Soda',
      category: 'General',
      price: 50,
      department: 'bar',
      shortcut: 'ts'
    });
  }, 30000);

  beforeEach(async () => {
    await mongoose.model('Order').deleteMany({});
    await mongoose.model('KOT').deleteMany({});
    await mongoose.model('TableSession').deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  it('should create an order and reduce inventory', async () => {
    const orderData = {
      billNo: '9999',
      tableNo: 1,
      items: [{ name: 'Test Soda', quantity: 2, price: 50 }],
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      discount: 0,
      grandTotal: 105,
      paidAmount: 105,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date().toISOString()
    };

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData);
    
    expect(res.statusCode).toBe(201);
    const item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(8);
  });

  it('should reduce inventory on KOT and not double reduce on final bill', async () => {
    await Inventory.findOneAndUpdate({ name: 'Test Soda' }, { stock: 10 });

    const sessionRes = await request(app)
      .post('/api/orders/table/1/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sessionRes.statusCode).toBe(201);
    const orderId = sessionRes.body.activeOrderId._id;
    const menuItem = await MenuItem.findOne({ name: 'Test Soda' });

    const kotRes = await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        tableNo: 1,
        items: [{
          menuItemId: menuItem._id,
          name: 'Test Soda',
          quantity: 3,
          price: 50,
          department: 'bar'
        }]
      });

    expect(kotRes.statusCode).toBe(201);
    let item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(7);

    const finalRes = await request(app)
      .patch(`/api/orders/${orderId}/finalize-bill`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ name: 'Test Soda', quantity: 3, price: 50 }],
        subtotal: 150,
        sgst: 3.75,
        cgst: 3.75,
        discount: 0,
        roundOff: -0.5,
        grandTotal: 157
      });

    expect(finalRes.statusCode).toBe(200);
    item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(7);
  });

  it('should reduce only extra inventory added after KOT when final bill is printed', async () => {
    await Inventory.findOneAndUpdate({ name: 'Test Soda' }, { stock: 10 });

    const sessionRes = await request(app)
      .post('/api/orders/table/2/open')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(sessionRes.statusCode).toBe(201);
    const orderId = sessionRes.body.activeOrderId._id;
    const menuItem = await MenuItem.findOne({ name: 'Test Soda' });

    const kotRes = await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${token}`)
      .send({
        orderId,
        tableNo: 2,
        items: [{
          menuItemId: menuItem._id,
          name: 'Test Soda',
          quantity: 2,
          price: 50,
          department: 'bar'
        }]
      });

    expect(kotRes.statusCode).toBe(201);
    let item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(8);

    const finalRes = await request(app)
      .patch(`/api/orders/${orderId}/finalize-bill`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ name: 'Test Soda', quantity: 3, price: 50 }],
        subtotal: 150,
        sgst: 3.75,
        cgst: 3.75,
        discount: 0,
        roundOff: -0.5,
        grandTotal: 157
      });

    expect(finalRes.statusCode).toBe(200);
    item = await Inventory.findOne({ name: 'Test Soda' });
    expect(item.stock).toBe(7);
  });

  it('should generate sequential bill numbers correctly, handle manual updates and reset on a new business day', async () => {
    // 1. Create a finalized order on July 4th
    const orderData1 = {
      tableNo: 5,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-04T12:00:00Z').toISOString()
    };

    const res1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData1);
    
    expect(res1.statusCode).toBe(201);
    expect(res1.body.billNo).toMatch(/^HTB-\d+$/);
    const billNum1 = parseInt(res1.body.billNo.match(/HTB-(\d+)/)[1], 10);

    // 2. Create another finalized order on the same day (July 4th) and verify sequential increment
    const orderData2 = {
      tableNo: 6,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-04T13:00:00Z').toISOString()
    };

    const res2 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData2);
    
    expect(res2.statusCode).toBe(201);
    const billNum2 = parseInt(res2.body.billNo.match(/HTB-(\d+)/)[1], 10);
    expect(billNum2).toBe(billNum1 + 1);

    // 3. Create an order on a different business day (July 5th) and verify it resets to HTB-001
    const orderData3 = {
      tableNo: 7,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-05T12:00:00Z').toISOString()
    };

    const res3 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData3);

    expect(res3.statusCode).toBe(201);
    expect(res3.body.billNo).toBe('HTB-001');

    // 4. Create an order late at night on July 6th at 2:00 AM IST (which is July 5th 20:30 UTC)
    // This order belongs to the July 5th business day.
    // Verify it sequentially increments from the July 5th order (HTB-001) to HTB-002
    // and does NOT shift twice (which would look at July 4th and generate a mismatch).
    const orderData4 = {
      tableNo: 8,
      items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
      subtotal: 50,
      sgst: 1.25,
      cgst: 1.25,
      discount: 0,
      grandTotal: 52.5,
      paidAmount: 52.5,
      dueAmount: 0,
      paymentMode: 'cash',
      date: new Date('2026-07-05T20:30:00Z').toISOString()
    };

    const res4 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData4);

    expect(res4.statusCode).toBe(201);
    expect(res4.body.billNo).toBe('HTB-002');
  });

  it('should update discount and recalculate grandTotal and payment fields', async () => {
    const orderData = {
      tableNo: 10,
      items: [{ name: 'Test Soda', quantity: 2, price: 50 }],
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      discount: 0,
      grandTotal: 105,
      paidAmount: 105,
      dueAmount: 0,
      paymentMode: 'cash'
    };

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData);

    expect(res.statusCode).toBe(201);
    const orderId = res.body._id;

    // Apply ₹10 discount via PATCH
    const discountRes = await request(app)
      .patch(`/api/orders/${orderId}/discount`)
      .set('Authorization', `Bearer ${token}`)
      .send({ discount: 10 });

    expect(discountRes.statusCode).toBe(200);
    expect(discountRes.body.discount).toBe(10);
    expect(discountRes.body.grandTotal).toBe(95);
    expect(discountRes.body.paidAmount).toBe(95);
    expect(discountRes.body.dueAmount).toBe(0);
    expect(discountRes.body.cashAmount).toBe(95);
  });

  it('should not alter date, businessDate, or billNo of an already finalized order when settling or updating payment mode', async () => {
    // 1. Create an active order
    const orderData = {
      tableNo: 12,
      items: [{ name: 'Test Tea', quantity: 1, price: 100 }],
      subtotal: 100,
      sgst: 2.5,
      cgst: 2.5,
      discount: 0,
      grandTotal: 105,
      paidAmount: 0,
      dueAmount: 105,
      paymentMode: 'cash',
      isActive: true
    };

    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderData);
    expect(createRes.statusCode).toBe(201);
    const orderId = createRes.body._id;
    expect(createRes.body.billNo).toBe('');

    // 2. Finalize the order
    const finalizeRes = await request(app)
      .patch(`/api/orders/${orderId}/finalize-bill`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: orderData.items,
        subtotal: 100,
        sgst: 2.5,
        cgst: 2.5,
        discount: 0,
        roundOff: 0,
        grandTotal: 105,
        paymentMode: 'cash',
        cashAmount: 105
      });
    expect(finalizeRes.statusCode).toBe(200);
    const originalBillNo = finalizeRes.body.billNo;
    const originalDate = finalizeRes.body.date;
    const originalBusinessDate = finalizeRes.body.businessDate;
    expect(originalBillNo).toMatch(/^HTB-\d+$/);
    expect(originalBusinessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // 3. Settle/edit payment mode
    const settleRes = await request(app)
      .patch(`/api/orders/${orderId}/settle`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        paymentMode: 'upi',
        cashAmount: 0,
        upiAmount: 105
      });
    expect(settleRes.statusCode).toBe(200);
    expect(settleRes.body.paymentMode).toBe('upi');
    expect(settleRes.body.billNo).toBe(originalBillNo);
    expect(settleRes.body.businessDate).toBe(originalBusinessDate);
    expect(settleRes.body.date).toBe(originalDate);
  });

  test('should update settings with service tax and apply service tax to finalized order', async () => {
    // 1. Update settings with service tax enabled (e.g. 5%)
    const settingsRes = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceTaxEnabled: true,
        serviceTaxRate: 5
      });
    expect(settingsRes.statusCode).toBe(200);
    expect(settingsRes.body.serviceTaxEnabled).toBe(true);
    expect(settingsRes.body.serviceTaxRate).toBe(5);

    // 2. Create order
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({ tableNo: 12, subtotal: 0, sgst: 0, cgst: 0, grandTotal: 0, paymentMode: 'cash' });
    expect(createRes.statusCode).toBe(201);
    const orderId = createRes.body._id;

    // 3. Finalize bill with subtotal=100, sgst=2.5, cgst=2.5, serviceTax=5, grandTotal=110
    const finalizeRes = await request(app)
      .patch(`/api/orders/${orderId}/finalize-bill`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ name: 'Test Soda', quantity: 2, price: 50 }],
        subtotal: 100,
        sgst: 2.5,
        cgst: 2.5,
        serviceTax: 5,
        discount: 0,
        roundOff: 0,
        grandTotal: 110,
        paymentMode: 'cash',
        cashAmount: 110
      });
    expect(finalizeRes.statusCode).toBe(200);
    expect(finalizeRes.body.serviceTax).toBe(5);
    expect(finalizeRes.body.grandTotal).toBe(110);
  });

  it('should record and update customer visits correctly for new and returning customers', async () => {
    const testPhone = '9998887776';

    // 1. Initial check: should have 0 visits
    let historyRes = await request(app)
      .get(`/api/orders/customer-history/${testPhone}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.totalOrders).toBe(0);

    // 2. Complete first order for customer
    const order1 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tableNo: 1,
        items: [{ name: 'Test Soda', quantity: 1, price: 50 }],
        subtotal: 50,
        sgst: 2.5,
        cgst: 2.5,
        grandTotal: 55,
        paymentMode: 'cash',
        customerName: 'John Doe',
        customerPhone: testPhone,
        isActive: false
      });
    expect(order1.statusCode).toBe(201);

    // 3. Second check: should now have 1 visit
    historyRes = await request(app)
      .get(`/api/orders/customer-history/+91${testPhone}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.totalOrders).toBe(1);
    expect(historyRes.body.customerName).toBe('John Doe');

    // 4. Complete second order for customer
    const order2 = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tableNo: 2,
        items: [{ name: 'Test Soda', quantity: 2, price: 50 }],
        subtotal: 100,
        sgst: 5,
        cgst: 5,
        grandTotal: 110,
        paymentMode: 'upi',
        customerName: 'John Doe',
        customerPhone: `+91${testPhone}`,
        isActive: false
      });
    expect(order2.statusCode).toBe(201);

    // 5. Final check: should now show 2 visits
    historyRes = await request(app)
      .get(`/api/orders/customer-history/${testPhone}`)
      .set('Authorization', `Bearer ${token}`);
    expect(historyRes.statusCode).toBe(200);
    expect(historyRes.body.totalOrders).toBe(2);
  });
});

