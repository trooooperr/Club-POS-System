const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const Settings = require('../models/Settings');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');
const KOT = require('../models/KOT');
const TableSession = require('../models/TableSession');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');

let mongo;

describe('KOT Management & Deletion API', () => {
  let adminToken;
  let staffToken;
  let activeOrder;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    
    // Seed Settings
    await Settings.create({
      restaurantName: 'HumTum POS',
      currency: '₹',
      sgstRate: 2.5,
      cgstRate: 2.5
    });

    // Create Admin User
    const admin = await User.create({
      name: 'Admin User',
      username: 'admin',
      passwordHash: 'admin123',
      role: 'admin'
    });
    adminToken = generateToken(admin);

    // Create Staff User
    const staff = await User.create({
      name: 'Staff User',
      username: 'staff',
      passwordHash: 'staff123',
      role: 'staff'
    });
    staffToken = generateToken(staff);
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    // Clear collections
    await Inventory.deleteMany({});
    await Order.deleteMany({});
    await KOT.deleteMany({});
    await TableSession.deleteMany({});

    // Seed Inventory items
    await Inventory.create([
      { name: 'Corona Beer', stock: 100, trackStock: true, price: 200, category: 'Beer', unit: 'bottle' },
      { name: 'French Fries', stock: 50, trackStock: true, price: 150, category: 'Food', unit: 'plate' }
    ]);

    // Create a Table Order
    activeOrder = await Order.create({
      billNo: 'BILL-001',
      tableNo: 5,
      items: [],
      subtotal: 0,
      sgst: 0,
      cgst: 0,
      discount: 0,
      roundOff: 0,
      grandTotal: 0,
      paidAmount: 0,
      dueAmount: 0,
      paymentMode: 'cash',
      orderStatus: 'OPEN',
      isActive: true,
      date: new Date()
    });

    // Create Table Session
    await TableSession.create({
      tableNo: 5,
      activeOrderId: activeOrder._id,
      status: 'OPEN',
      openedAt: new Date()
    });
  });

  it('should successfully create a KOT and deduct stock', async () => {
    const res = await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: activeOrder._id,
        tableNo: 5,
        items: [
          { name: 'Corona Beer', quantity: 2, price: 200, department: 'bar' },
          { name: 'French Fries', quantity: 1, price: 150, department: 'kitchen' }
        ]
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.kotNo).toBeDefined();

    // Verify stock is deducted
    const beer = await Inventory.findOne({ name: 'Corona Beer' });
    const fries = await Inventory.findOne({ name: 'French Fries' });
    expect(beer.stock).toBe(98); // 100 - 2
    expect(fries.stock).toBe(49); // 50 - 1
  });

  it('should remove a single item from active KOTs and refund stock', async () => {
    // 1. Create a KOT
    await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: activeOrder._id,
        tableNo: 5,
        items: [
          { name: 'Corona Beer', quantity: 3, price: 200, department: 'bar' }
        ]
      });

    // 2. Remove 1x Corona Beer
    const removeRes = await request(app)
      .post('/api/kots/remove-item')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        orderId: activeOrder._id,
        name: 'Corona Beer',
        quantityToRemove: 1
      });

    expect(removeRes.statusCode).toBe(200);

    // Verify stock is refunded by 1
    const beer = await Inventory.findOne({ name: 'Corona Beer' });
    expect(beer.stock).toBe(98); // 100 - 3 (initial KOT) + 1 (refund) = 98

    // Verify KOT item qty is reduced
    const kot = await KOT.findOne({ orderId: activeOrder._id });
    expect(kot.items[0].quantity).toBe(2);
  });

  it('should delete a KOT and refund all its items when requested by Admin', async () => {
    // 1. Create a KOT
    const kotRes = await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: activeOrder._id,
        tableNo: 5,
        items: [
          { name: 'Corona Beer', quantity: 5, price: 200, department: 'bar' },
          { name: 'French Fries', quantity: 2, price: 150, department: 'kitchen' }
        ]
      });

    const kotId = kotRes.body._id;

    // 2. Try to delete KOT as Staff (should be forbidden)
    const staffDeleteRes = await request(app)
      .delete(`/api/kots/${kotId}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(staffDeleteRes.statusCode).toBe(403);

    // Verify stock is still deducted
    let beer = await Inventory.findOne({ name: 'Corona Beer' });
    expect(beer.stock).toBe(95);

    // 3. Delete KOT as Admin
    const adminDeleteRes = await request(app)
      .delete(`/api/kots/${kotId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(adminDeleteRes.statusCode).toBe(200);

    // Verify stock is fully refunded
    beer = await Inventory.findOne({ name: 'Corona Beer' });
    const fries = await Inventory.findOne({ name: 'French Fries' });
    expect(beer.stock).toBe(100);
    expect(fries.stock).toBe(50);

    // Verify KOT is deleted
    const count = await KOT.countDocuments({ _id: kotId });
    expect(count).toBe(0);

    // Verify KOT ID is pulled from Order
    const order = await Order.findById(activeOrder._id);
    expect(order.kotIds.length).toBe(0);
  });

  it('should recalculate historical/completed order totals when KOT items are modified', async () => {
    // 1. Set the order to completed (isActive: false)
    activeOrder.isActive = false;
    activeOrder.orderStatus = 'COMPLETED';
    await activeOrder.save();

    // 2. Create a KOT under this completed order
    const kotRes = await request(app)
      .post('/api/kots')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: activeOrder._id,
        tableNo: 5,
        items: [
          { name: 'Corona Beer', quantity: 4, price: 200, department: 'bar' },
          { name: 'French Fries', quantity: 2, price: 150, department: 'kitchen' }
        ]
      });

    const kotId = kotRes.body._id;

    // 3. Remove 1x Corona Beer from the KOT
    const removeRes = await request(app)
      .post('/api/kots/remove-item')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        orderId: activeOrder._id,
        name: 'Corona Beer',
        quantityToRemove: 1
      });

    expect(removeRes.statusCode).toBe(200);

    // Verify order items and totals are recalculated with split tax
    // Corona Beer: 3 left (qty = 3, price = 200) -> 600 (alcoholic -> 0% GST)
    // French Fries: 2 left (qty = 2, price = 150) -> 300 (food -> 2.5% SGST + 2.5% CGST = 15)
    // Subtotal = 900
    // Total = 915
    const updatedOrder = await Order.findById(activeOrder._id);
    expect(updatedOrder.items.length).toBe(2);
    expect(updatedOrder.subtotal).toBe(900);
    expect(updatedOrder.grandTotal).toBe(915);

    // Verify inventory stock is correct
    const beer = await Inventory.findOne({ name: 'Corona Beer' });
    expect(beer.stock).toBe(97); // 100 - 4 + 1 = 97
  });
});
