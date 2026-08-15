const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const KOT = require('../models/KOT');
const TableSession = require('../models/TableSession');
const Settings = require('../models/Settings');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');

let mongo;

describe('HumTum POS - Rigorous API and Security Audit Suite', () => {
  let adminToken, managerToken, staffToken;
  let admin, manager, staff;
  let sampleInventoryItem, sampleMenuItem;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());

    // Create users representing each role
    admin = await User.create({ name: 'Owner Admin', username: 'admin_test', passwordHash: 'pwd', role: 'admin' });
    manager = await User.create({ name: 'Lead Manager', username: 'manager_test', passwordHash: 'pwd', role: 'manager' });
    staff = await User.create({ name: 'Server Staff', username: 'staff_test', passwordHash: 'pwd', role: 'staff' });

    adminToken = generateToken(admin);
    managerToken = generateToken(manager);
    staffToken = generateToken(staff);

    // Seed default settings
    await Settings.create({
      restaurantName: 'HumTum POS Test',
      sgstRate: 2.5,
      cgstRate: 2.5,
      currency: '₹',
    });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  describe('1. Role-Based Access Control (RBAC) Security Verification', () => {
    it('should BLOCK staff from accessing admin clear-cache', async () => {
      const res = await request(app)
        .post('/api/admin/clear-cache')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW admin to clear cache', async () => {
      const res = await request(app)
        .post('/api/admin/clear-cache')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should BLOCK staff from modifying Settings', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ restaurantName: 'Hacked Name' });
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW admin to update Settings', async () => {
      const res = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ restaurantName: 'HumTum POS Pro' });
      expect(res.statusCode).toBe(200);
      expect(res.body.restaurantName).toBe('HumTum POS Pro');
    });

    it('should BLOCK staff from adding/removing Settings categories', async () => {
      const res1 = await request(app)
        .post('/api/settings/menu-category')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ category: 'Cocktails' });
      expect(res1.statusCode).toBe(403);

      const res2 = await request(app)
        .delete('/api/settings/menu-category')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ category: 'Cocktails' });
      expect(res2.statusCode).toBe(403);
    });

    it('should ALLOW admin to add/remove Settings categories', async () => {
      const res1 = await request(app)
        .post('/api/settings/menu-category')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category: 'Cocktails' });
      expect(res1.statusCode).toBe(200);
      expect(res1.body).toContain('Cocktails');

      const res2 = await request(app)
        .delete('/api/settings/menu-category')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ category: 'Cocktails' });
      expect(res2.statusCode).toBe(200);
      expect(res2.body).not.toContain('Cocktails');
    });
  });

  describe('2. Inventory API & Decoupled Menu Checks', () => {
    it('should ALLOW manager to create inventory item and verify it is NOT added to menu automatically', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Jack Daniels Whisky',
          category: 'Spirits',
          unit: 'Bottles',
          stock: 12,
          minStock: 2,
          price: 250,
          shortcut: 'jd'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Jack Daniels Whisky');
      sampleInventoryItem = res.body;

      // Verify that MenuItem was NOT auto-created
      const menuItem = await MenuItem.findOne({ name: 'Jack Daniels Whisky' });
      expect(menuItem).toBeNull();

      // Create MenuItem explicitly for menu test suite
      sampleMenuItem = await MenuItem.create({
        name: 'Jack Daniels Whisky',
        category: 'Spirits',
        price: 250,
        shortcut: 'jd',
        department: 'bar'
      });
    });

    it('should BLOCK staff from creating inventory items', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'Unauthorized Beer', category: 'Beer', unit: 'Bottles', stock: 10, minStock: 2, price: 100 });
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW manager to update inventory stock', async () => {
      const res = await request(app)
        .patch(`/api/inventory/${sampleInventoryItem._id}/stock`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ quantityChange: 5 });

      expect(res.statusCode).toBe(200);
      expect(res.body.stock).toBe(17); // 12 + 5
    });

    it('should BLOCK staff from updating inventory stock', async () => {
      const res = await request(app)
        .patch(`/api/inventory/${sampleInventoryItem._id}/stock`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ quantityChange: 5 });
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW manager to reorder inventory items successfully', async () => {
      const res = await request(app)
        .put('/api/inventory/reorder')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ orderedIds: [sampleInventoryItem._id] });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should ALLOW creating an inventory item with trackStock: false without creating menu item', async () => {
      const res = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Chocolate Milkshake',
          category: 'Dessert',
          unit: 'Pieces',
          price: 150,
          trackStock: false
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.trackStock).toBe(false);

      // Verify that corresponding MenuItem was not auto-created
      const menuItem = await MenuItem.findOne({ name: 'Chocolate Milkshake' });
      expect(menuItem).toBeNull();
    });
  });

  describe('3. Menu Operations Checks', () => {
    it('should ALLOW staff to fetch the menu items and search by shortcut', async () => {
      const res = await request(app)
        .get('/api/menu')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);

      const shortcutRes = await request(app)
        .get(`/api/menu/shortcut/jd`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(shortcutRes.statusCode).toBe(200);
      expect(shortcutRes.body.name).toBe('Jack Daniels Whisky');
    });

    it('should BLOCK staff from deleting menu items', async () => {
      const res = await request(app)
        .delete(`/api/menu/${sampleMenuItem._id}`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW manager to update and delete menu items', async () => {
      const updatedRes = await request(app)
        .put(`/api/menu/${sampleMenuItem._id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ price: 300 });
      expect(updatedRes.statusCode).toBe(200);
      expect(updatedRes.body.price).toBe(300);

      // Verify delete
      const delRes = await request(app)
        .delete(`/api/menu/${sampleMenuItem._id}`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(delRes.statusCode).toBe(200);
    });
  });

  describe('4. KOT and Order Operations Checks', () => {
    let testOrder, testSession;

    it('should ALLOW staff to open a table session and automatically create an order', async () => {
      const res = await request(app)
        .post('/api/orders/table/5/open')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ waiterName: 'John waiter', orderType: 'dine-in' });

      expect(res.statusCode).toBe(201);
      expect(res.body.tableNo).toBe(5);
      expect(res.body.status).toBe('OPEN');
      expect(res.body.activeOrderId).toBeDefined();
      testSession = res.body;
      testOrder = res.body.activeOrderId;
    });

    it('should ALLOW staff to create a KOT under the opened order', async () => {
      // Re-create the menu item first since it was deleted in previous test
      const item = await MenuItem.create({
        name: 'Tequila Shot',
        category: 'Spirits',
        price: 150,
        department: 'bar'
      });

      const res = await request(app)
        .post('/api/kots')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          orderId: testOrder._id,
          tableNo: 5,
          items: [{ menuItemId: item._id, name: 'Tequila Shot', quantity: 2, price: 150 }],
          notes: 'No salt',
          waiterName: 'John waiter',
          orderType: 'dine-in'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.kotNo).toBeDefined();
      expect(res.body.status).toBe('PENDING');
      expect(res.body.departmentQueues).toBeDefined();
    });

    it('should ALLOW staff/kitchen to fetch kitchen display KOTs', async () => {
      const res = await request(app)
        .get('/api/kots/kitchen/display')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should ALLOW staff/kitchen to update KOT status', async () => {
      const getKots = await KOT.find({ tableNo: 5 });
      const kotId = getKots[0]._id;

      const res = await request(app)
        .patch(`/api/kots/${kotId}/status`)
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ status: 'READY' });
      
      expect(res.statusCode).toBe(200);
      expect(res.body.status).toBe('READY');
    });
  });

  describe('5. Staff/Worker Records Security Checks', () => {
    let testWorker;

    it('should BLOCK staff from creating worker profile', async () => {
      const res = await request(app)
        .post('/api/workers')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({ name: 'New Bartender', role: 'Staff', salary: 12000 });
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW manager to create a worker profile & sync with login user', async () => {
      const res = await request(app)
        .post('/api/workers')
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ name: 'Sam Worker', role: 'Staff', salary: 14000, contact: '9999888877', email: 'sam@humtum.com' });

      expect(res.statusCode).toBe(201);
      expect(res.body.name).toBe('Sam Worker');
      testWorker = res.body;

      // Verify that User account was auto-created
      const user = await User.findOne({ username: 'samworker' });
      expect(user).toBeDefined();
      expect(user.role).toBe('staff');
    });

    it('should BLOCK staff from reading worker payment history', async () => {
      const res = await request(app)
        .get(`/api/workers/${testWorker._id}/history`)
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW manager to read worker payment history', async () => {
      const res = await request(app)
        .get(`/api/workers/${testWorker._id}/history`)
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
    });
  });

  describe('6. Reports & Financials Security Checks', () => {
    it('should BLOCK staff from accessing reports daily summary', async () => {
      const res = await request(app)
        .get('/api/reports/daily-summary')
        .set('Authorization', `Bearer ${staffToken}`);
      expect(res.statusCode).toBe(403);
    });

    it('should ALLOW manager to access reports daily summary', async () => {
      const res = await request(app)
        .get('/api/reports/daily-summary')
        .set('Authorization', `Bearer ${managerToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.ordersCount).toBeDefined();
    });

    it('should BLOCK staff from requesting email daily reports', async () => {
      const res = await request(app)
        .post('/api/reports/send-daily')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({});
      expect(res.statusCode).toBe(403);
    });
  });
});
