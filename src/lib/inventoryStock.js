const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const { deleteCache } = require('./redis');

const INVENTORY_CACHE_KEY = 'inventory:all';
const MENU_CACHE_KEY = 'menu:all';

function normalizeName(name) {
  return (name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function itemKey(item) {
  return normalizeName(item?.name);
}

// Helper to compute effective deduction quantity with an upper bound (max 1000)
// Allows fractional values (e.g. 0.4 for a 30ml pour from a bottle)
function getEffectiveDeduction(item, baseQty) {
  const rawDedQty = Number(item?.stockDeductionQty);
  // Use the configured value if it's a valid positive number; otherwise default to 1
  const dedQty = (rawDedQty > 0) ? rawDedQty : 1;
  const cappedDedQty = Math.min(dedQty, 1000); // enforce upper limit as per user decision
  return baseQty * cappedDedQty;
}

function aggregateQuantities(items = []) {
  const quantities = new Map();

  for (const item of items) {
    const name = itemKey(item);
    const quantity = Math.abs(Number(item?.quantity) || 0);
    if (!name || quantity <= 0) continue;
    quantities.set(name, (quantities.get(name) || 0) + quantity);
  }

  return quantities;
}

async function syncChildStocks(parentIds) {
  if (!parentIds?.length) return;
  const children = await Inventory.find({ linkInventoryId: { $in: parentIds } });
  if (!children.length) return;
  const parents = await Inventory.find({ _id: { $in: parentIds } });
  const parentMap = new Map(parents.map(p => [p._id.toString(), p.stock]));
  const ops = children.map(child => ({
    updateOne: {
      filter: { _id: child._id },
      update: { $set: { stock: parentMap.get(child.linkInventoryId.toString()) } }
    }
  }));
  await Inventory.bulkWrite(ops, { ordered: false });
}

function itemsFromQuantityMap(quantities) {
  return [...quantities.entries()].map(([name, quantity]) => ({ name, quantity }));
}

async function updateMenuAvailability() {
  const [inventoryItems, menuItems] = await Promise.all([
    Inventory.find(),
    MenuItem.find()
  ]);
  const inventoryById = new Map(inventoryItems.map(i => [i._id.toString(), i]));

  const availabilityMap = new Map();
  for (const item of inventoryItems) {
    let isAvailable = true;
    if (item.linkInventoryId) {
      const parent = inventoryById.get(item.linkInventoryId.toString());
      if (parent && parent.trackStock !== false) {
        isAvailable = parent.stock >= (item.stockDeductionQty || 1);
      }
    } else {
      if (item.trackStock !== false) {
        isAvailable = item.stock > 0;
      }
    }
    availabilityMap.set(normalizeName(item.name), isAvailable);
  }

  const ops = [];
  for (const mItem of menuItems) {
    if (mItem.trackDirectStock) {
      const isAvail = (mItem.directStock || 0) > 0;
      if (mItem.available !== isAvail) {
        ops.push({
          updateOne: {
            filter: { _id: mItem._id },
            update: { $set: { available: isAvail } }
          }
        });
      }
    } else {
      const normName = normalizeName(mItem.name);
      if (availabilityMap.has(normName)) {
        ops.push({
          updateOne: {
            filter: { _id: mItem._id },
            update: { $set: { available: availabilityMap.get(normName) } }
          }
        });
      }
    }
  }

  if (ops.length) {
    await MenuItem.bulkWrite(ops, { ordered: false });
  }
}

async function getInventorySnapshot() {
  const items = await Inventory.find().populate('linkInventoryId');
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
}

async function deductInventoryForItems(items = [], dateOrBusinessDate = null) {
  const quantities = aggregateQuantities(items);
  const names = [...quantities.keys()];
  if (!names.length) return getInventorySnapshot();

  const nameRegexes = names.map(n => {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const spaced = escaped.replace(/ /g, '\\s+');
    return new RegExp(`^${spaced}$`, 'i');
  });
  const directInvItems = await Inventory.find({ name: { $in: nameRegexes } });

  const parentIds = directInvItems
    .filter(i => i.linkInventoryId)
    .map(i => i.linkInventoryId);

  const allMatching = await Inventory.find({
    $or: [
      { name: { $in: nameRegexes } },
      { _id: { $in: parentIds } }
    ]
  });

  const inventoryById = new Map(allMatching.map(i => [i._id.toString(), i]));
  const inventoryByName = new Map(allMatching.map(i => [normalizeName(i.name), i]));

  const ops = [];
  const affectedParentIds = [];
  // Aggregate deductions for both parent items and child contributions.
  const parentDeductionMap = new Map(); // parentId -> total effective deduction
  for (const [name, quantity] of quantities.entries()) {
    const directInv = inventoryByName.get(normalizeName(name));
    if (!directInv) continue;

    // Determine the inventory record that should be deducted (parent for child items,
    // self for standalone/parent items).
    const targetId = directInv.linkInventoryId ? directInv.linkInventoryId.toString() : directInv._id.toString();
    const dedQty = getEffectiveDeduction(directInv, quantity);
    const prev = parentDeductionMap.get(targetId) || 0;
    parentDeductionMap.set(targetId, prev + dedQty);
  }

  // Apply accumulated deductions per inventory record.
  for (const [invId, totalDeduction] of parentDeductionMap.entries()) {
    const inv = inventoryById.get(invId);
    if (!inv || inv.trackStock === false) continue;
    ops.push({
      updateOne: {
        filter: { _id: inv._id },
        update: [
          { $set: { stock: { $max: [0, { $subtract: ['$stock', totalDeduction] }] } } }
        ]
      }
    });
    affectedParentIds.push(inv._id);
  }

  if (ops.length) {
    await Inventory.bulkWrite(ops, { ordered: false });
    try {
      const { recordStockChange } = require('./inventoryReport');
      for (const [invId, totalDeduction] of parentDeductionMap.entries()) {
        await recordStockChange(invId, -totalDeduction, 'sale', dateOrBusinessDate);
      }
      for (const [name, quantity] of quantities.entries()) {
        const directInv = inventoryByName.get(normalizeName(name));
        if (directInv && directInv.linkInventoryId) {
          await recordStockChange(directInv._id, -quantity, 'sale', dateOrBusinessDate);
        }
      }
    } catch (err) {
      console.error('Error logging daily stock deductions:', err.message);
    }
  }

  // Direct MenuItem Stock Deduction
  const directMenuItems = await MenuItem.find({ trackDirectStock: true });
  if (directMenuItems.length > 0) {
    const menuOps = [];
    for (const mItem of directMenuItems) {
      const normName = normalizeName(mItem.name);
      const qty = quantities.get(normName) || 0;
      if (qty <= 0) continue;
      const dedPerUnit = Number(mItem.stockDeductionQty) > 0 ? Number(mItem.stockDeductionQty) : 1;
      const totalDeduction = qty * dedPerUnit;
      const newStock = Math.max(0, (mItem.directStock || 0) - totalDeduction);
      menuOps.push({
        updateOne: {
          filter: { _id: mItem._id },
          update: { 
            $set: { 
              directStock: newStock,
              available: newStock > 0
            } 
          }
        }
      });
    }
    if (menuOps.length) {
      await MenuItem.bulkWrite(menuOps, { ordered: false });
    }
  }

  const uniqueParentIds = [...new Set([
    ...parentIds.map(id => id.toString()),
    ...affectedParentIds.map(id => id.toString())
  ])].map(id => {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId(id);
  });
  await syncChildStocks(uniqueParentIds);
  await updateMenuAvailability();
  await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
  return getInventorySnapshot();
}

function buildInventoryDelta(finalItems = [], alreadyDeducted = new Map()) {
  const finalQuantities = aggregateQuantities(finalItems);
  const delta = new Map();

  for (const [name, quantity] of finalQuantities.entries()) {
    const remaining = quantity - (alreadyDeducted.get(name) || 0);
    if (remaining > 0) delta.set(name, remaining);
  }

  return itemsFromQuantityMap(delta);
}

function broadcastInventoryUpdate(req, inventory, extra = {}) {
  if (!req.app.locals.io) return;
  if (inventory) {
    req.app.locals.io.emit('INVENTORY_UPDATED', {
      inventory,
      ...extra,
      timestamp: new Date()
    });
  }
  MenuItem.find().then(menuItems => {
    req.app.locals.io.emit('MENU_UPDATED', menuItems);
  }).catch(() => {});
}

async function refundInventoryForItems(items = [], dateOrBusinessDate = null) {
  const quantities = aggregateQuantities(items);
  const names = [...quantities.keys()];
  if (!names.length) return getInventorySnapshot();

  const nameRegexes = names.map(n => {
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const spaced = escaped.replace(/ /g, '\\s+');
    return new RegExp(`^${spaced}$`, 'i');
  });
  const directInvItems = await Inventory.find({ name: { $in: nameRegexes } });

  const parentIds = directInvItems
    .filter(i => i.linkInventoryId)
    .map(i => i.linkInventoryId);

  const allMatching = await Inventory.find({
    $or: [
      { name: { $in: nameRegexes } },
      { _id: { $in: parentIds } }
    ]
  });

  const inventoryById = new Map(allMatching.map(i => [i._id.toString(), i]));
  const inventoryByName = new Map(allMatching.map(i => [normalizeName(i.name), i]));

  const ops = [];
  const affectedParentIds = [];
  const parentRefundMap = new Map(); // targetId -> total refund quantity

  for (const [name, quantity] of quantities.entries()) {
    const directInv = inventoryByName.get(normalizeName(name));
    if (!directInv) continue;

    const targetId = directInv.linkInventoryId ? directInv.linkInventoryId.toString() : directInv._id.toString();
    const refundQty = getEffectiveDeduction(directInv, quantity);

    const prev = parentRefundMap.get(targetId) || 0;
    parentRefundMap.set(targetId, prev + refundQty);
  }

  for (const [invId, totalRefund] of parentRefundMap.entries()) {
    const inv = inventoryById.get(invId);
    if (!inv || inv.trackStock === false) continue;
    ops.push({
      updateOne: {
        filter: { _id: inv._id },
        update: { $inc: { stock: totalRefund } }
      }
    });
    affectedParentIds.push(inv._id);
  }

  if (ops.length) {
    await Inventory.bulkWrite(ops, { ordered: false });
    try {
      const { recordStockChange } = require('./inventoryReport');
      for (const [invId, totalRefund] of parentRefundMap.entries()) {
        await recordStockChange(invId, totalRefund, 'refund', dateOrBusinessDate);
      }
      for (const [name, quantity] of quantities.entries()) {
        const directInv = inventoryByName.get(normalizeName(name));
        if (directInv && directInv.linkInventoryId) {
          await recordStockChange(directInv._id, quantity, 'refund', dateOrBusinessDate);
        }
      }
    } catch (err) {
      console.error('Error logging daily stock refunds:', err.message);
    }
  }

  // Direct MenuItem Stock Refund
  const directMenuItems = await MenuItem.find({ trackDirectStock: true });
  if (directMenuItems.length > 0) {
    const menuOps = [];
    for (const mItem of directMenuItems) {
      const normName = normalizeName(mItem.name);
      const qty = quantities.get(normName) || 0;
      if (qty <= 0) continue;
      const refPerUnit = Number(mItem.stockDeductionQty) > 0 ? Number(mItem.stockDeductionQty) : 1;
      const totalRefund = qty * refPerUnit;
      const newStock = (mItem.directStock || 0) + totalRefund;
      menuOps.push({
        updateOne: {
          filter: { _id: mItem._id },
          update: { 
            $set: { 
              directStock: newStock,
              available: newStock > 0
            } 
          }
        }
      });
    }
    if (menuOps.length) {
      await MenuItem.bulkWrite(menuOps, { ordered: false });
    }
  }

  const uniqueParentIds = [...new Set([
    ...parentIds.map(id => id.toString()),
    ...affectedParentIds.map(id => id.toString())
  ])].map(id => {
    const mongoose = require('mongoose');
    return new mongoose.Types.ObjectId(id);
  });
  await syncChildStocks(uniqueParentIds);
  await updateMenuAvailability();
  await deleteCache([INVENTORY_CACHE_KEY, MENU_CACHE_KEY]);
  return getInventorySnapshot();
}

module.exports = {
  aggregateQuantities,
  buildInventoryDelta,
  broadcastInventoryUpdate,
  deductInventoryForItems,
  refundInventoryForItems,
  getInventorySnapshot,
  updateMenuAvailability,
  syncChildStocks,
};
