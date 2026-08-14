const request = require('supertest');
const app = require('../../app');
const User = require('../models/User');
const MenuItem = require('../models/MenuItem');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { generateToken } = require('../middleware/auth');

let mongo;

describe('Menu API', () => {
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

    await MenuItem.create({
      name: 'Test Pizza',
      category: 'Main Course',
      price: 200,
      available: true
    });
  }, 30000);

  afterAll(async () => {
    await mongoose.connection.close();
    await mongo.stop();
  });

  it('should fetch menu with valid auth', async () => {
    const res = await request(app)
      .get('/api/menu')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('should return 401 without auth', async () => {
    const res = await request(app).get('/api/menu');
    expect(res.statusCode).toBe(401);
  });

  it('should sync availability when inventory item is toggled off', async () => {
    const Inventory = require('../models/Inventory');
    const inv = await Inventory.create({
      name: 'Test Cocktail',
      category: 'drinks',
      unit: 'bottle',
      price: 150,
      stock: 10,
      isAvailable: true,
      available: true
    });
    await MenuItem.create({
      name: 'Test Cocktail',
      category: 'drinks',
      price: 150,
      available: true,
      department: 'bar'
    });

    // Toggle off availability via PATCH endpoint
    const patchRes = await request(app)
      .patch(`/api/inventory/${inv._id}/availability`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isAvailable: false });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.body.isAvailable).toBe(false);
    expect(patchRes.body.available).toBe(false);

    // Verify MenuItem sync
    const mItem = await MenuItem.findOne({ name: 'Test Cocktail' });
    expect(mItem).not.toBeNull();
    expect(mItem.available).toBe(false);
  });
});