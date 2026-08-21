const express = require('express');
const mongoose = require('mongoose');
const MenuItem = require('../models/MenuItem');
const Inventory = require('../models/Inventory');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const { updateMenuAvailability } = require('../lib/inventoryStock');
const router = express.Router();

const MENU_CACHE_KEY = 'menu:all';
const INVENTORY_CACHE_KEY = 'inventory:all';

const sortMenuItems = async (items) => {
  const Settings = require('../models/Settings');
  const settings = await Settings.findOne();
  const menuCategories = settings ? (settings.menuCategories || []) : [];
  
  items.sort((a, b) => {
    const catAIndex = menuCategories.indexOf(a.category);
    const catBIndex = menuCategories.indexOf(b.category);
    
    const indexA = catAIndex === -1 ? 999999 : catAIndex;
    const indexB = catBIndex === -1 ? 999999 : catBIndex;
    
    if (indexA !== indexB) {
      return indexA - indexB;
    }
    
    const orderA = a.order || 0;
    const orderB = b.order || 0;
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    
    return a.name.localeCompare(b.name);
  });
  return items;
};

// Get all menu items (Staff and above can view menu)
router.get('/', async (req, res) => {
  try {
    const cached = await getCache(MENU_CACHE_KEY);
    if (cached) return res.json(cached);

    const rawItems = await MenuItem.find();
    const items = await sortMenuItems(rawItems);
    await setCache(MENU_CACHE_KEY, items, 300);
    res.json(items);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get all shortcuts
router.get('/shortcuts/all', async (req, res) => {
  try {
    const items = await MenuItem.find({ shortcut: { $ne: '' } }).select('name shortcut category price');
    const shortcuts = items.map(item => ({
      shortcut: item.shortcut,
      name: item.name,
      category: item.category,
      price: item.price,
      id: item._id
    }));
    res.json(shortcuts);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Get item by shortcut
router.get('/shortcut/:code', async (req, res) => {
  try {
    const item = await MenuItem.findOne({ shortcut: req.params.code.toLowerCase() });
    if (!item) return res.status(404).json({ message: 'Shortcut not found' });
    res.json(item);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Reorder menu items (Admin/Manager only)
router.put('/reorder', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) {
      return res.status(400).json({ message: 'orderedIds array is required' });
    }
    const bulkOps = orderedIds
      .filter(id => mongoose.Types.ObjectId.isValid(id))
      .map((id, index) => ({
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { order: index } }
        }
      }));
    if (bulkOps.length > 0) {
      await MenuItem.bulkWrite(bulkOps);
    }
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sync menu from inventory (Admin/Manager only)
router.post('/sync', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const inventory = await Inventory.find();
    const inventoryNames = inventory.map(i => i.name);

    for (const inv of inventory) {
      await MenuItem.findOneAndUpdate(
        { name: inv.name },
        {
          name: inv.name,
          category: inv.category,
          price: inv.price,
          available: (inv.isAvailable === false || inv.available === false) ? false : (inv.trackStock === false ? true : (inv.stock > 0)),
          shortcut: inv.shortcut || '',
          department: 'bar',
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Bulk-correct any existing inventory-backed MenuItems that were saved without department:'bar'
    if (inventoryNames.length > 0) {
      await MenuItem.updateMany(
        { name: { $in: inventoryNames }, department: { $ne: 'bar' } },
        { $set: { department: 'bar' } }
      );
    }

    await deleteCache([MENU_CACHE_KEY, INVENTORY_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create menu item (Admin/Manager only)
router.post('/', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const data = req.body;
    if (data.shortcut) data.shortcut = data.shortcut.toLowerCase().trim();
    const item = new MenuItem(data);
    await item.save();
    await updateMenuAvailability();
    const saved = await MenuItem.findById(item._id);
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.status(201).json(saved);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Update menu item (Admin/Manager only)
router.put('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const data = req.body;
    if (data.shortcut) data.shortcut = data.shortcut.toLowerCase().trim();
    const updated = await MenuItem.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ message: 'Item not found' });
    await updateMenuAvailability();
    const freshUpdated = await MenuItem.findById(req.params.id);
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json(freshUpdated);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// Delete menu item (Admin/Manager only)
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await MenuItem.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Item not found' });
    await deleteCache(MENU_CACHE_KEY);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
    }
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
