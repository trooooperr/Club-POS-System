const express = require('express');
const mongoose = require('mongoose');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const { updateMenuAvailability } = require('../lib/inventoryStock');
const router = express.Router();

const INVENTORY_CACHE_KEY = 'inventory:all';
const MENU_CACHE_KEY = 'menu:all';

const sortInventoryItems = async (items) => {
  const Settings = require('../models/Settings');
  const settings = await Settings.findOne();
  const inventoryCategories = settings ? (settings.inventoryCategories || []) : [];
  
  items.sort((a, b) => {
    const catAIndex = inventoryCategories.indexOf(a.category);
    const catBIndex = inventoryCategories.indexOf(b.category);
    
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

// GET ALL INVENTORY ITEMS (Allowed for all authenticated staff)
router.get('/', async (req, res) => {
  try {
    const rawItems = await Inventory.find().populate('linkInventoryId');
    const items = await sortInventoryItems(rawItems);
    await setCache(INVENTORY_CACHE_KEY, items, 300);
    res.json(items);
  } catch (err) {
    console.error('INVENTORY GET ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET DAILY INVENTORY REPORT
router.get('/daily-report', async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;
    const resolvedStart = startDate || date || require('../lib/businessDay').getBusinessDateString(new Date());
    const resolvedEnd = endDate || date || resolvedStart;

    const { getDailyInventoryReportRange } = require('../lib/inventoryReport');
    const report = await getDailyInventoryReportRange(resolvedStart, resolvedEnd);
    res.json(report);
  } catch (err) {
    console.error('DAILY REPORT GET ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET SINGLE INVENTORY ITEM (Allowed for all authenticated staff)
router.get('/:id', async (req, res) => {
  try {
    const item = await Inventory.findById(req.params.id).populate('linkInventoryId');
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CREATE INVENTORY ITEM (Admin/Manager only)
router.post(
  '/',
  requireRole(['admin', 'manager']),
  // Validation middleware
  (req, res, next) => {
    const { name, category, unit, stock, minStock, price } = req.body;
    if (!name || !category || !unit) {
      return res.status(400).json({ message: 'Name, category, and unit are required.' });
    }
    if (price == null || isNaN(price) || Number(price) < 0) {
      return res.status(400).json({ message: 'Price must be a non‑negative number.' });
    }
    next();
  },
  async (req, res) => {
    try {
      const { name, category, unit, stock, minStock, price, isAlcoholic, trackStock, linkInventoryId, stockDeductionQty, imageUrl } = req.body;
      const shortcut = (req.body.shortcut || '').toLowerCase().trim();

      const Settings = require('../models/Settings');
      const settings = await Settings.findOne();
      const isDryActive = !!(settings && settings.isDryDay);
      const isItemAlcoholic = !!(isAlcoholic || req.body.isAlcohol);
      const initialAvailability = (isDryActive && isItemAlcoholic) ? false : (req.body.isAvailable !== false);

      const invItem = new Inventory({
        name,
        category,
        unit,
        stock,
        minStock,
        price,
        shortcut,
        imageUrl: imageUrl || '',
        isAlcoholic: isItemAlcoholic,
        isAlcohol: isItemAlcoholic,
        isAvailable: initialAvailability,
        available: initialAvailability,
        trackStock: trackStock !== false,
        linkInventoryId: linkInventoryId || null,
        stockDeductionQty: stockDeductionQty || 1
      });
      const savedInv = await invItem.save();
      if (savedInv.stock > 0) {
        try {
          const { recordStockChange } = require('../lib/inventoryReport');
          await recordStockChange(savedInv._id, savedInv.stock, 'addition');
        } catch (err) {
          console.error('Error logging new item stock addition:', err.message);
        }
      }
      if (savedInv.linkInventoryId) {
        const { syncChildStocks } = require('../lib/inventoryStock');
        await syncChildStocks([savedInv.linkInventoryId]);
      }
      await updateMenuAvailability();
      await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        const allInvRaw = await Inventory.find().populate('linkInventoryId');
        const allInv = await sortInventoryItems(allInvRaw);
        req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
      }
      const populated = await Inventory.findById(savedInv._id).populate('linkInventoryId');
      res.status(201).json(populated);
    } catch (err) {
      console.error('INVENTORY CREATE ERROR:', err.message);
      res.status(400).json({ message: err.message });
    }
  }
);

// Reorder inventory items (Admin/Manager only)
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
      await Inventory.bulkWrite(bulkOps);
    }
    await deleteCache(INVENTORY_CACHE_KEY);
    if (req.app.locals.io) {
      const allInvRaw = await Inventory.find().populate('linkInventoryId');
      const allInv = await sortInventoryItems(allInvRaw);
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE INVENTORY ITEM (Admin/Manager only)
router.put(
  '/:id',
  requireRole(['admin', 'manager']),
  // Validation middleware for price
  (req, res, next) => {
    const { price } = req.body;
    if (price != null && (isNaN(price) || Number(price) < 0)) {
      return res.status(400).json({ message: 'Price must be a non‑negative number.' });
    }
    next();
  },
  async (req, res) => {
    try {
      if (req.body.isAlcoholic !== undefined) {
        req.body.isAlcoholic = !!req.body.isAlcoholic;
        req.body.isAlcohol = !!req.body.isAlcoholic;
      }
      const oldItem = await Inventory.findById(req.params.id);
      const updated = await Inventory.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );
      if (!updated) return res.status(404).json({ message: 'Item not found' });

      const Settings = require('../models/Settings');
      const settings = await Settings.findOne();
      if (settings && settings.isDryDay && (updated.isAlcoholic || updated.isAlcohol)) {
        updated.isAvailable = false;
        updated.available = false;
        await updated.save();
      }
      if (oldItem && oldItem.stock !== updated.stock) {
        try {
          const stockDiff = updated.stock - oldItem.stock;
          const { recordStockChange } = require('../lib/inventoryReport');
          await recordStockChange(updated._id, stockDiff, 'adjustment');
        } catch (err) {
          console.error('Error logging stock update adjustment:', err.message);
        }
      }
      const { syncChildStocks } = require('../lib/inventoryStock');
      if (updated.linkInventoryId) {
        await syncChildStocks([updated.linkInventoryId]);
      } else {
        await syncChildStocks([updated._id]);
      }
      await updateMenuAvailability();
      await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
      if (req.app.locals.io) {
        req.app.locals.io.emit('REFRESH_MENU');
        const allInvRaw = await Inventory.find().populate('linkInventoryId');
        const allInv = await sortInventoryItems(allInvRaw);
        req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
      }
      const populated = await Inventory.findById(updated._id).populate('linkInventoryId');
      res.json(populated);
    } catch (err) {
      console.error('INVENTORY UPDATE ERROR:', err.message);
      res.status(400).json({ message: err.message });
    }
  }
);

// UPDATE INVENTORY STOCK (Admin/Manager only)
router.patch('/:id/stock', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { quantityChange } = req.body;
    const item = await Inventory.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Item not found' });

    let finalUpdatedItem;
    const { syncChildStocks } = require('../lib/inventoryStock');

    if (item.linkInventoryId) {
      const parent = await Inventory.findById(item.linkInventoryId);
      if (parent) {
        const change = quantityChange * (item.stockDeductionQty || 1);
        parent.stock = Math.max(0, parent.stock + change);
        await parent.save();
        await syncChildStocks([parent._id]);
        try {
          const { recordStockChange } = require('../lib/inventoryReport');
          await recordStockChange(parent._id, change, 'addition');
        } catch (err) {
          console.error('Error logging parent stock adjustment:', err.message);
        }
      }
      finalUpdatedItem = await Inventory.findById(item._id).populate('linkInventoryId');
    } else {
      item.stock = Math.max(0, item.stock + quantityChange);
      const saved = await item.save();
      await syncChildStocks([saved._id]);
      finalUpdatedItem = saved;
      try {
        const { recordStockChange } = require('../lib/inventoryReport');
        await recordStockChange(saved._id, quantityChange, 'addition');
      } catch (err) {
        console.error('Error logging standalone stock adjustment:', err.message);
      }
    }

    // Sync menu item availability
    await updateMenuAvailability();
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
      const allInvRaw = await Inventory.find().populate('linkInventoryId');
      const allInv = await sortInventoryItems(allInvRaw);
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json(finalUpdatedItem);
  } catch (err) {
    console.error('INVENTORY STOCK UPDATE ERROR:', err.message);
    res.status(400).json({ message: err.message });
  }
});

// TOGGLE INVENTORY ITEM AVAILABILITY (Admin/Manager only)
router.patch('/:id/availability', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { isAvailable } = req.body;
    const availVal = !!isAvailable;
    const updated = await Inventory.findByIdAndUpdate(
      req.params.id,
      { isAvailable: availVal, available: availVal },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Item not found' });

    const nameRegex = new RegExp(`^${updated.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    await MenuItem.updateMany(
      { name: nameRegex },
      { $set: { available: updated.isAvailable === false ? false : (updated.trackStock === false ? true : (updated.stock > 0)) } }
    );

    await updateMenuAvailability();
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);

    if (req.app.locals.io) {
      const allMenuItems = await MenuItem.find();
      req.app.locals.io.emit('MENU_UPDATED', allMenuItems);
      req.app.locals.io.emit('REFRESH_MENU');
      const allInvRaw = await Inventory.find().populate('linkInventoryId');
      const allInv = await sortInventoryItems(allInvRaw);
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// TOGGLE DRY DAY STATUS (Admin/Manager only)
router.post('/dry-day', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { isDryDay } = req.body;
    const dryDayBool = !!isDryDay;

    const Settings = require('../models/Settings');
    let settings = await Settings.findOne();
    if (!settings) {
      settings = new Settings();
    }
    settings.isDryDay = dryDayBool;
    await settings.save();

    const alcoholFilter = {
      $or: [
        { isAlcoholic: true },
        { isAlcohol: true }
      ]
    };

    if (dryDayBool) {
      await Inventory.updateMany(alcoholFilter, { $set: { isAvailable: false, available: false } });
    } else {
      await Inventory.updateMany(alcoholFilter, { $set: { isAvailable: true, available: true } });
    }

    await updateMenuAvailability();
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);

    const allInvRaw = await Inventory.find().populate('linkInventoryId');
    const allInv = await sortInventoryItems(allInvRaw);

    if (req.app.locals.io) {
      const allMenuItems = await MenuItem.find();
      req.app.locals.io.emit('SETTINGS_UPDATED', settings);
      req.app.locals.io.emit('MENU_UPDATED', allMenuItems);
      req.app.locals.io.emit('REFRESH_MENU');
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }

    res.json({ success: true, isDryDay: dryDayBool, inventory: allInv });
  } catch (err) {
    console.error('DRY DAY TOGGLE ERROR:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// DELETE INVENTORY ITEM (Admin/Manager only)
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const result = await Inventory.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ message: 'Item not found' });
    await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
    if (req.app.locals.io) {
      req.app.locals.io.emit('REFRESH_MENU');
      const allInvRaw = await Inventory.find().populate('linkInventoryId');
      const allInv = await sortInventoryItems(allInvRaw);
      req.app.locals.io.emit('INVENTORY_UPDATED', { inventory: allInv, timestamp: new Date() });
    }
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
