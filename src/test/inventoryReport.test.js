const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const KOT = require('../models/KOT');
const Settings = require('../models/Settings');
const InventoryDailyReport = require('../models/InventoryDailyReport');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');
const { getBusinessDateString } = require('../lib/businessDay');

let mongo;

describe('HumTum POS - Inventory Daily Report Suite', () => {
  let adminToken, managerToken;
  let admin, manager;
  let testBeer, testBurger;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    admin = await User.create({ name: 'Admin', username: 'admin_report', passwordHash: 'pwd', role: 'admin' });
    manager = await User.create({ name: 'Manager', username: 'manager_report', passwordHash: 'pwd', role: 'manager' });

    adminToken = generateToken(admin);
    managerToken = generateToken(manager);

    await Settings.create({
      restaurantName: 'HumTum POS Test',
      sgstRate: 2.5,
      cgstRate: 2.5,
      currency: '₹',
    });

    // Create test items
    testBeer = await Inventory.create({
      name: 'Corona Beer',
      category: 'Drinks',
      unit: 'Bottles',
      stock: 50,
      minStock: 5,
      price: 250,
      isAlcoholic: true,
      trackStock: true
    });

    testBurger = await Inventory.create({
      name: 'Veg Burger',
      category: 'Food',
      unit: 'Pieces',
      stock: 10,
      minStock: 2,
      price: 150,
      isAlcoholic: false,
      trackStock: true
    });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  beforeEach(async () => {
    await InventoryDailyReport.deleteMany({});
  });

  describe('1. Daily stock tracking and report generation', () => {
    it('should log stock changes when manually adjusting stock via API', async () => {
      const res = await request(app)
        .patch(`/api/inventory/${testBeer._id}/stock`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ quantityChange: 10 });

      expect(res.statusCode).toBe(200);
      expect(res.body.stock).toBe(60);

      // Verify that a report was created
      const todayStr = getBusinessDateString(new Date());
      const report = await InventoryDailyReport.findOne({ businessDate: todayStr, inventoryId: testBeer._id });
      
      expect(report).toBeDefined();
      expect(report.itemName).toBe('Corona Beer');
      expect(report.addedStock).toBe(10);
      expect(report.closingStock).toBe(60);
      expect(report.openingStock).toBe(50);
      expect(report.soldStock).toBe(0);
    });

    it('should log stock changes when an order is finalized with inventory deductions', async () => {
      // Create a direct order that deducts stock
      const res = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          tableNo: 5,
          paymentMode: 'cash',
          subtotal: 500,
          sgst: 12.5,
          cgst: 12.5,
          grandTotal: 525,
          isActive: false,
          orderStatus: 'COMPLETED',
          items: [
            { name: 'Corona Beer', quantity: 2, price: 250 }
          ]
        });

      expect(res.statusCode).toBe(201);

      // Verify that report shows the sale deduction
      const todayStr = getBusinessDateString(new Date());
      const report = await InventoryDailyReport.findOne({ businessDate: todayStr, inventoryId: testBeer._id });
      
      expect(report).toBeDefined();
      expect(report.soldStock).toBe(2);
    });

    it('should retrieve a complete report including items with no activity', async () => {
      const todayStr = getBusinessDateString(new Date());
      
      const res = await request(app)
        .get(`/api/inventory/daily-report?date=${todayStr}`)
        .set('Authorization', `Bearer ${managerToken}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(2); // Beer and Burger

      const beerReport = res.body.find(i => i.itemName === 'Corona Beer');
      const burgerReport = res.body.find(i => i.itemName === 'Veg Burger');

      expect(beerReport).toBeDefined();
      expect(burgerReport).toBeDefined();
      expect(burgerReport.openingStock).toBe(10);
      expect(burgerReport.soldStock).toBe(0);
      expect(burgerReport.addedStock).toBe(0);
      expect(burgerReport.closingStock).toBe(10);
    });
  });

  describe('2. Historical Stock Backfill', () => {
    it('should successfully backfill daily reports from past completed orders', async () => {
      const pastDate = '2026-07-10';

      // Manually create an order on a past date
      await Order.create({
        billNo: 'B-1001',
        businessDate: pastDate,
        date: new Date('2026-07-10T12:00:00Z'),
        subtotal: 750,
        sgst: 18.75,
        cgst: 18.75,
        grandTotal: 787.5,
        paymentMode: 'cash',
        tableNo: 2,
        isActive: false,
        orderStatus: 'COMPLETED',
        inventoryFinalized: true,
        items: [
          { name: 'Corona Beer', quantity: 3, price: 250 }
        ]
      });

      // Run backfill function
      const { backfillDailyStockReports } = require('../lib/inventoryReport');
      await backfillDailyStockReports();

      // Check report for the past date
      const pastReport = await InventoryDailyReport.findOne({ businessDate: pastDate, inventoryId: testBeer._id });
      expect(pastReport).toBeDefined();
      expect(pastReport.soldStock).toBe(3);
      expect(pastReport.openingStock).toBe(pastReport.closingStock + 3);
    });

    it('should attribute stock deductions between 12 Midnight and 5 AM to the previous business date', async () => {
      // Order created at 2:00 AM IST on Aug 4th (UTC: Aug 3rd 20:30:00)
      const postMidnightDate = new Date('2026-08-03T20:30:00.000Z');
      const expectedBizDate = getBusinessDateString(postMidnightDate); // Should be "2026-08-03" (previous day's shift)

      const { deductInventoryForItems } = require('../lib/inventoryStock');
      await deductInventoryForItems([{ name: 'Corona Beer', quantity: 4 }], expectedBizDate);

      const report = await InventoryDailyReport.findOne({ businessDate: expectedBizDate, inventoryId: testBeer._id });
      expect(report).toBeDefined();
      expect(report.businessDate).toBe(expectedBizDate);
      expect(report.soldStock).toBe(4);

      // Verify that no report was created for the new calendar day "2026-08-04"
      const wrongReport = await InventoryDailyReport.findOne({ businessDate: '2026-08-04', inventoryId: testBeer._id });
      expect(wrongReport).toBeNull();
    });
  });
});
