const InventoryDailyReport = require('../models/InventoryDailyReport');
const Inventory = require('../models/Inventory');
const { getBusinessDateString } = require('./businessDay');

/**
 * Records a change in inventory stock for the current business day.
 * @param {string|mongoose.Types.ObjectId} inventoryId
 * @param {number} quantityChange - The change in stock (positive or negative)
 * @param {'sale'|'refund'|'addition'|'adjustment'|'sync'} type
 */
async function recordStockChange(inventoryId, quantityChange, type, dateOrBusinessDate = null) {
  try {
    let businessDate;
    if (typeof dateOrBusinessDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateOrBusinessDate)) {
      businessDate = dateOrBusinessDate;
    } else if (dateOrBusinessDate) {
      businessDate = getBusinessDateString(new Date(dateOrBusinessDate));
    } else {
      businessDate = getBusinessDateString(new Date());
    }
    const item = await Inventory.findById(inventoryId);
    if (!item) return;

    let report = await InventoryDailyReport.findOne({ businessDate, inventoryId });
    
    // Determine the current stock after the change is applied
    const currentStock = item.stock;

    if (!report) {
      // First change of the day
      // openingStock is stock before this change
      const openingStock = Math.max(0, currentStock - quantityChange);

      report = new InventoryDailyReport({
        businessDate,
        inventoryId: item._id,
        itemName: item.name,
        category: item.category,
        unit: item.unit,
        openingStock,
        addedStock: 0,
        soldStock: 0,
        closingStock: currentStock,
        isAlcoholic: !!(item.isAlcoholic || item.isAlcohol)
      });
    } else {
      report.closingStock = currentStock;
    }

    if (type === 'sale') {
      report.soldStock += Math.abs(quantityChange);
    } else if (type === 'refund') {
      report.soldStock = Math.max(0, report.soldStock - quantityChange);
    } else if (type === 'addition' || type === 'adjustment') {
      report.addedStock += quantityChange;
    } else if (type === 'sync') {
      // Child item sync
      report.closingStock = currentStock;
    }

    await report.save();
  } catch (err) {
    console.error('Error recording stock change:', err.message);
  }
}

/**
 * Gets the daily inventory report for a given business date.
 * Automatically includes all inventory items.
 * @param {string} businessDate 
 * @returns {Promise<Array>}
 */
async function getDailyInventoryReport(businessDate) {
  const items = await Inventory.find({
    $or: [
      { linkInventoryId: null },
      { linkInventoryId: { $exists: false } }
    ]
  }).populate('linkInventoryId');
  const loggedReports = await InventoryDailyReport.find({ businessDate });
  
  const reportMap = new Map(loggedReports.map(r => [r.inventoryId.toString(), r]));
  
  const fullReport = items.map(item => {
    const logged = reportMap.get(item._id.toString());
    
    // Determine effective stock (handling child items linked to parents)
    let currentStock = item.stock;
    if (item.linkInventoryId) {
      currentStock = typeof item.linkInventoryId === 'object' ? item.linkInventoryId.stock : item.stock;
    }

    if (logged) {
      // Sync closing stock to current stock just in case it got out of sync
      logged.closingStock = currentStock;
      return logged.toObject();
    } else {
      return {
        businessDate,
        inventoryId: item._id,
        itemName: item.name,
        category: item.category,
        unit: item.unit,
        openingStock: currentStock,
        addedStock: 0,
        soldStock: 0,
        closingStock: currentStock,
        isAlcoholic: !!(item.isAlcoholic || item.isAlcohol)
      };
    }
  });

  return fullReport;
}

/**
 * Backfills past daily stock reports using order and KOT history.
 */
async function backfillDailyStockReports() {
  const Order = require('../models/Order');
  const KOT = require('../models/KOT');

  console.log('⏳ Starting backfill of daily stock reports...');

  const inventoryItems = await Inventory.find();
  const inventoryByName = new Map(inventoryItems.map(i => [(i.name || '').replace(/\s+/g, ' ').trim().toLowerCase(), i]));
  
  // Track stock state backward starting from current stock levels
  const stockState = new Map(inventoryItems.map(i => [i._id.toString(), i.stock]));

  const distinctDates = await Order.distinct('businessDate');
  const sortedDates = distinctDates.filter(Boolean).sort((a, b) => b.localeCompare(a));

  const getEffectiveDeduction = (item, baseQty) => {
    const rawDedQty = Number(item.stockDeductionQty);
    const dedQty = (rawDedQty > 0) ? rawDedQty : 1;
    const cappedDedQty = Math.min(dedQty, 1000);
    return baseQty * cappedDedQty;
  };

  for (const businessDate of sortedDates) {
    const orders = await Order.find({ businessDate, grandTotal: { $gt: 0 } });
    const activeOrders = await Order.find({ businessDate, inventoryFinalized: { $ne: true } });
    const activeKots = await KOT.find({ 
      orderId: { $in: activeOrders.map(o => o._id) },
      inventoryDeducted: true
    });

    const soldQuantities = new Map();
    const addItemsToMap = (items) => {
      for (const item of items) {
        const name = (item.name || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const qty = Math.abs(Number(item.quantity) || 0);
        if (!name || qty <= 0) continue;
        soldQuantities.set(name, (soldQuantities.get(name) || 0) + qty);
      }
    };

    orders.filter(o => o.inventoryFinalized).forEach(o => addItemsToMap(o.items || []));
    activeKots.forEach(kot => addItemsToMap(kot.items || []));

    const parentDeductionMap = new Map();
    const directSalesMap = new Map();

    for (const [name, quantity] of soldQuantities.entries()) {
      const invItem = inventoryByName.get(name);
      if (!invItem) continue;

      directSalesMap.set(invItem._id.toString(), (directSalesMap.get(invItem._id.toString()) || 0) + quantity);

      if (invItem.trackStock !== false) {
        const targetId = invItem.linkInventoryId ? invItem.linkInventoryId.toString() : invItem._id.toString();
        const dedQty = getEffectiveDeduction(invItem, quantity);
        parentDeductionMap.set(targetId, (parentDeductionMap.get(targetId) || 0) + dedQty);
      }
    }

    const bulkOps = [];
    for (const item of inventoryItems) {
      if (item.linkInventoryId) continue; // Skip child items in backfill
      const itemIdStr = item._id.toString();
      const directSales = directSalesMap.get(itemIdStr) || 0;
      
      let soldStock = 0;
      if (item.trackStock !== false) {
        if (!item.linkInventoryId) {
          soldStock = parentDeductionMap.get(itemIdStr) || 0;
        } else {
          soldStock = getEffectiveDeduction(item, directSales);
        }
      }

      const closingStock = stockState.get(itemIdStr) || 0;
      const openingStock = closingStock + soldStock;

      // Update state for the previous day
      stockState.set(itemIdStr, openingStock);

      bulkOps.push({
        updateOne: {
          filter: { businessDate, inventoryId: item._id },
          update: {
            $setOnInsert: {
              itemName: item.name,
              category: item.category,
              unit: item.unit,
              isAlcoholic: !!(item.isAlcoholic || item.isAlcohol),
              addedStock: 0
            },
            $set: {
              openingStock,
              soldStock,
              closingStock
            }
          },
          upsert: true
        }
      });
    }

    if (bulkOps.length > 0) {
      await InventoryDailyReport.bulkWrite(bulkOps, { ordered: false });
    }
  }

  console.log(`✅ Backfill complete. Processed ${sortedDates.length} days.`);
}

/**
 * Gets the daily inventory report aggregated over a range of business dates (inclusive).
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @returns {Promise<Array>}
 */
async function getDailyInventoryReportRange(startDate, endDate) {
  const items = await Inventory.find({
    $or: [
      { linkInventoryId: null },
      { linkInventoryId: { $exists: false } }
    ]
  }).populate('linkInventoryId');
  
  // Find all daily report logs in this date range
  const loggedReports = await InventoryDailyReport.find({
    businessDate: { $gte: startDate, $lte: endDate }
  });

  // Group logged reports by inventoryId to aggregate them
  const reportMap = new Map();
  for (const r of loggedReports) {
    const key = r.inventoryId.toString();
    if (!reportMap.has(key)) {
      reportMap.set(key, []);
    }
    reportMap.get(key).push(r);
  }

  const fullReport = items.map(item => {
    const itemIdStr = item._id.toString();
    const logs = reportMap.get(itemIdStr) || [];
    
    // Determine effective stock (handling child items linked to parents)
    let currentStock = item.stock;
    if (item.linkInventoryId) {
      currentStock = typeof item.linkInventoryId === 'object' ? item.linkInventoryId.stock : item.stock;
    }

    if (logs.length > 0) {
      // Sort logs by businessDate ascending to determine chronological order
      logs.sort((a, b) => a.businessDate.localeCompare(b.businessDate));

      const openingStock = logs[0].openingStock;

      let closingStock = logs[logs.length - 1].closingStock;
      const todayStr = getBusinessDateString(new Date());
      if (logs[logs.length - 1].businessDate === todayStr) {
        closingStock = currentStock;
      }

      const addedStock = logs.reduce((sum, r) => sum + (r.addedStock || 0), 0);
      const soldStock = logs.reduce((sum, r) => sum + (r.soldStock || 0), 0);

      return {
        businessDate: `${startDate} to ${endDate}`,
        inventoryId: item._id,
        itemName: item.name,
        category: item.category,
        unit: item.unit,
        openingStock,
        addedStock,
        soldStock,
        closingStock,
        isAlcoholic: !!(item.isAlcoholic || item.isAlcohol),
        minStock: item.minStock
      };
    } else {
      return {
        businessDate: `${startDate} to ${endDate}`,
        inventoryId: item._id,
        itemName: item.name,
        category: item.category,
        unit: item.unit,
        openingStock: currentStock,
        addedStock: 0,
        soldStock: 0,
        closingStock: currentStock,
        isAlcoholic: !!(item.isAlcoholic || item.isAlcohol),
        minStock: item.minStock
      };
    }
  });

  return fullReport;
}

module.exports = {
  recordStockChange,
  getDailyInventoryReport,
  getDailyInventoryReportRange,
  backfillDailyStockReports
};
