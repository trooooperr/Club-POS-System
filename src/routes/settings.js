const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Settings = require('../models/Settings');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');

const SETTINGS_CACHE_KEY = 'settings:current';
const FIXED_SENDER_EMAIL = process.env.GMAIL_SENDER || 'cafeteriahumtum@gmail.com';

const DEFAULTS = {
  senderEmail: FIXED_SENDER_EMAIL,
  senderPassword: process.env.GMAIL_APP_PASSWORD || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
};

function cleanString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function cleanNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : fallback;
}

function cleanCategoryList(value) {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set();
  return value
    .map(item => cleanString(item))
    .filter(Boolean)
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function addCategory(list, category) {
  const next = cleanCategoryList(list) || [];
  const clean = cleanString(category);
  if (!clean) return { error: 'Category required' };
  if (!next.some(item => item.toLowerCase() === clean.toLowerCase())) {
    next.push(clean);
  }
  return { categories: next };
}

function removeCategory(list, category) {
  const clean = cleanString(category);
  if (!clean) return { error: 'Category required' };
  const categories = (cleanCategoryList(list) || []).filter(item => item.toLowerCase() !== clean.toLowerCase());
  return { categories };
}

function normalizeSettings(data) {
  return {
    ...data.toObject(),
    restaurantName: data.restaurantName || 'HUMTUM Billing System',
    address: data.address || '',
    gstin: data.gstin || '',
    phone: data.phone || '',
    sgstRate: Number(data.sgstRate) || 0,
    cgstRate: Number(data.cgstRate) || 0,
    serviceTaxEnabled: !!data.serviceTaxEnabled,
    serviceTaxRate: Number(data.serviceTaxRate) || 0,
    currency: data.currency || '₹',
    thankYouMsg: data.thankYouMsg || '',
    darkMode: data.darkMode !== false,
    directPrinting: !!data.directPrinting,
    qzTrayEnabled: !!data.qzTrayEnabled,
    printAgentEnabled: !!data.printAgentEnabled,
    printAgentPort: Number(data.printAgentPort) || 5001,
    printAgentToken: data.printAgentToken || '',
    kitchenPrinterName: data.kitchenPrinterName || '',
    barPrinterName: data.barPrinterName || '',
    billingPrinterName: data.billingPrinterName || '',
    detectedPrinters: cleanCategoryList(data.detectedPrinters) || [],
    upiId: data.upiId || '',
    includeUpiAmount: data.includeUpiAmount !== false,
    inventoryCategories: cleanCategoryList(data.inventoryCategories) || [],
    menuCategories: cleanCategoryList(data.menuCategories) || [],
    senderEmail: FIXED_SENDER_EMAIL,
    adminEmail: data.adminEmail || DEFAULTS.adminEmail,
    googleReviewLink: data.googleReviewLink || '',
    instagramLink: data.instagramLink || '',
    facebookLink: data.facebookLink || '',
    whatsappEnabled: !!data.whatsappEnabled,
    whatsappTemplate: data.whatsappTemplate || 'Hello {customerName}!\n\nThank you for visiting HumTum Bar & Club. We hope you had a wonderful time! 🍹✨\n\nCould you please take a moment to share your experience with us? It helps us grow!\nGoogle Review: {googleReviewLink}\n\nFollow us to stay updated with our events and offers:\nInstagram: {instagramLink}\nFacebook: {facebookLink}\n\nHope to see you again soon!\nTeam HumTum',
    isDryDay: !!data.isDryDay,
  };
}

async function getOrCreateSettings() {
  let existing = await Settings.findOne();
  if (existing) {
    let changed = false;
    if (existing.senderEmail !== FIXED_SENDER_EMAIL) {
      existing.senderEmail = FIXED_SENDER_EMAIL;
      changed = true;
    }
    if (!existing.printAgentToken) {
      existing.printAgentToken = crypto.randomBytes(24).toString('hex');
      changed = true;
    }
    if (!existing.googleReviewLink || existing.googleReviewLink === '') {
      existing.googleReviewLink = 'https://g.page/r/CQnCGIPFlqaOEBM/review';
      changed = true;
    }
    if (!existing.instagramLink || existing.instagramLink === '') {
      existing.instagramLink = 'https://www.instagram.com/humtum.thebar/';
      changed = true;
    }
    if (!existing.facebookLink || existing.facebookLink === '') {
      existing.facebookLink = 'https://www.facebook.com/humtum.thebar/';
      changed = true;
    }
    if (existing.whatsappEnabled !== true) {
      existing.whatsappEnabled = true;
      changed = true;
    }
    if (!existing.whatsappTemplate || existing.whatsappTemplate === '' || existing.whatsappTemplate.includes('{billNo}')) {
      existing.whatsappTemplate = 'Hello {customerName}!\n\nThank you for visiting HumTum Bar & Club. We hope you had a wonderful time! 🍹✨\n\nCould you please take a moment to share your experience with us? It helps us grow!\nGoogle Review: {googleReviewLink}\n\nFollow us to stay updated with our events and offers:\nInstagram: {instagramLink}\nFacebook: {facebookLink}\n\nHope to see you again soon!\nTeam HumTum';
      changed = true;
    }
    if (changed) {
      await existing.save();
    }
    return existing;
  }

  return Settings.create({
    senderEmail: FIXED_SENDER_EMAIL,
    printAgentToken: crypto.randomBytes(24).toString('hex')
  });
}

// Add Inventory Category (Admin/Manager)
router.post('/inventory-category', requireRole(['admin', 'manager']), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = addCategory(settings.inventoryCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.inventoryCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.inventoryCategories);
});

// Remove Inventory Category (Admin/Manager)
router.delete('/inventory-category', requireRole(['admin', 'manager']), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = removeCategory(settings.inventoryCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.inventoryCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.inventoryCategories);
});


// Add Menu Category (Admin/Manager)
router.post('/menu-category', requireRole(['admin', 'manager']), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = addCategory(settings.menuCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.menuCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.menuCategories);
});

// Remove Menu Category (Admin/Manager)
router.delete('/menu-category', requireRole(['admin', 'manager']), async (req, res) => {
  const settings = await getOrCreateSettings();
  const result = removeCategory(settings.menuCategories, req.body.category);
  if (result.error) return res.status(400).json({ message: result.error });
  settings.senderEmail = FIXED_SENDER_EMAIL;
  settings.menuCategories = result.categories;
  await settings.save();
  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(settings.menuCategories);
});


// GET settings (All authenticated users can read settings)
router.get('/', async (req, res) => {
  const cached = await getCache(SETTINGS_CACHE_KEY);
  if (cached) return res.json(cached);

  const data = await getOrCreateSettings();
  const normalized = normalizeSettings(data);
  await setCache(SETTINGS_CACHE_KEY, normalized, 300);
  res.json(normalized);
});

// UPDATE settings (Admin/Manager)
router.put('/', requireRole(['admin', 'manager']), async (req, res) => {
  console.log('--- Settings update request received ---');
  console.log('User Role:', req.user?.role);
  console.log('Incoming settings payload:', req.body);

  const settings = await getOrCreateSettings();
  console.log('Existing settings in DB directPrinting:', settings.directPrinting);

  if (req.body.restaurantName !== undefined) settings.restaurantName = cleanString(req.body.restaurantName);
  if (req.body.address !== undefined) settings.address = cleanString(req.body.address);
  if (req.body.gstin !== undefined) settings.gstin = cleanString(req.body.gstin).toUpperCase();
  if (req.body.phone !== undefined) settings.phone = cleanString(req.body.phone);
  if (req.body.sgstRate !== undefined) settings.sgstRate = cleanNumber(req.body.sgstRate, settings.sgstRate);
  if (req.body.cgstRate !== undefined) settings.cgstRate = cleanNumber(req.body.cgstRate, settings.cgstRate);
  if (req.body.serviceTaxEnabled !== undefined) settings.serviceTaxEnabled = !!req.body.serviceTaxEnabled;
  if (req.body.serviceTaxRate !== undefined) settings.serviceTaxRate = cleanNumber(req.body.serviceTaxRate, settings.serviceTaxRate);
  if (req.body.currency !== undefined) settings.currency = cleanString(req.body.currency, '₹').slice(0, 4) || '₹';
  if (req.body.thankYouMsg !== undefined) settings.thankYouMsg = cleanString(req.body.thankYouMsg);
  if (req.body.darkMode !== undefined) settings.darkMode = !!req.body.darkMode;
  if (req.body.directPrinting !== undefined) settings.directPrinting = !!req.body.directPrinting;
  if (req.body.qzTrayEnabled !== undefined) settings.qzTrayEnabled = !!req.body.qzTrayEnabled;
  if (req.body.printAgentEnabled !== undefined) settings.printAgentEnabled = !!req.body.printAgentEnabled;
  if (req.body.printAgentPort !== undefined) settings.printAgentPort = cleanNumber(req.body.printAgentPort, 5001);
  if (req.body.printAgentToken !== undefined) settings.printAgentToken = cleanString(req.body.printAgentToken);
  if (req.body.kitchenPrinterName !== undefined) settings.kitchenPrinterName = cleanString(req.body.kitchenPrinterName);
  if (req.body.barPrinterName !== undefined) settings.barPrinterName = cleanString(req.body.barPrinterName);
  if (req.body.billingPrinterName !== undefined) settings.billingPrinterName = cleanString(req.body.billingPrinterName);
  const detectedPrinters = cleanCategoryList(req.body.detectedPrinters);
  if (detectedPrinters !== undefined) settings.detectedPrinters = detectedPrinters;
  if (req.body.upiId !== undefined) settings.upiId = cleanString(req.body.upiId);
  if (req.body.includeUpiAmount !== undefined) settings.includeUpiAmount = !!req.body.includeUpiAmount;
  if (req.body.adminEmail !== undefined) settings.adminEmail = cleanString(req.body.adminEmail).toLowerCase();
  if (req.body.googleReviewLink !== undefined) settings.googleReviewLink = cleanString(req.body.googleReviewLink);
  if (req.body.instagramLink !== undefined) settings.instagramLink = cleanString(req.body.instagramLink);
  if (req.body.facebookLink !== undefined) settings.facebookLink = cleanString(req.body.facebookLink);
  if (req.body.whatsappEnabled !== undefined) settings.whatsappEnabled = !!req.body.whatsappEnabled;
  if (req.body.whatsappTemplate !== undefined) settings.whatsappTemplate = cleanString(req.body.whatsappTemplate);
  if (req.body.isDryDay !== undefined) settings.isDryDay = !!req.body.isDryDay;

  const inventoryCategories = cleanCategoryList(req.body.inventoryCategories);
  if (inventoryCategories !== undefined) {
    settings.inventoryCategories = inventoryCategories;
  }

  const menuCategories = cleanCategoryList(req.body.menuCategories);
  if (menuCategories !== undefined) {
    settings.menuCategories = menuCategories;
  }

  settings.senderEmail = FIXED_SENDER_EMAIL;
  
  console.log('Saving settings directPrinting property:', settings.directPrinting);
  await settings.save();
  
  const normalized = normalizeSettings(settings);
  console.log('Normalized settings response directPrinting:', normalized.directPrinting);

  await deleteCache(SETTINGS_CACHE_KEY);
  res.json(normalized);
});

// Rename Inventory Category (Admin/Manager)
router.patch('/inventory-category/rename', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { oldCategory, newCategory } = req.body;
    const cleanOld = cleanString(oldCategory);
    const cleanNew = cleanString(newCategory);

    if (!cleanOld || !cleanNew) {
      return res.status(400).json({ message: 'Both old and new categories are required' });
    }

    const settings = await getOrCreateSettings();
    let categories = cleanCategoryList(settings.inventoryCategories) || [];
    const idx = categories.indexOf(cleanOld);

    if (idx === -1) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Prevent duplicates
    if (categories.includes(cleanNew) && cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
      return res.status(400).json({ message: 'New category already exists' });
    }

    categories[idx] = cleanNew;
    settings.inventoryCategories = categories;
    settings.senderEmail = FIXED_SENDER_EMAIL;
    await settings.save();

    // Update all Inventory documents
    const Inventory = require('../models/Inventory');
    await Inventory.updateMany({ category: cleanOld }, { category: cleanNew });

    // Invalidate Cache
    await deleteCache([SETTINGS_CACHE_KEY, 'inventory:all']);

    res.json(settings.inventoryCategories);
  } catch (err) {
    console.error('Rename Inventory Category Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// Rename Menu Category (Admin/Manager)
router.patch('/menu-category/rename', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { oldCategory, newCategory } = req.body;
    const cleanOld = cleanString(oldCategory);
    const cleanNew = cleanString(newCategory);

    if (!cleanOld || !cleanNew) {
      return res.status(400).json({ message: 'Both old and new categories are required' });
    }

    const settings = await getOrCreateSettings();
    let categories = cleanCategoryList(settings.menuCategories) || [];
    const idx = categories.indexOf(cleanOld);

    if (idx === -1) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Prevent duplicates
    if (categories.includes(cleanNew) && cleanOld.toLowerCase() !== cleanNew.toLowerCase()) {
      return res.status(400).json({ message: 'New category already exists' });
    }

    categories[idx] = cleanNew;
    settings.menuCategories = categories;
    settings.senderEmail = FIXED_SENDER_EMAIL;
    await settings.save();

    // Update all MenuItem documents
    const MenuItem = require('../models/MenuItem');
    await MenuItem.updateMany({ category: cleanOld }, { category: cleanNew });

    // Invalidate Cache
    await deleteCache([SETTINGS_CACHE_KEY, 'menu:all']);

    res.json(settings.menuCategories);
  } catch (err) {
    console.error('Rename Menu Category Error:', err);
    res.status(500).json({ message: err.message });
  }
});

// ── WHATSAPP API ENDPOINTS (Admin only) ──────────────────────────
router.get('/whatsapp/status', requireRole(['admin']), (req, res) => {
  try {
    const whatsappService = require('../lib/whatsappService');
    res.json(whatsappService.getStatus());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/whatsapp/connect', requireRole(['admin']), async (req, res) => {
  try {
    const whatsappService = require('../lib/whatsappService');
    await whatsappService.connect();
    res.json({ message: 'WhatsApp connection initiated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/whatsapp/disconnect', requireRole(['admin']), async (req, res) => {
  try {
    const whatsappService = require('../lib/whatsappService');
    await whatsappService.disconnect();
    res.json({ message: 'WhatsApp disconnected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
