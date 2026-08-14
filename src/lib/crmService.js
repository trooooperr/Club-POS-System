const Customer = require('../models/Customer');
const Order = require('../models/Order');

function getEffectiveBusinessDate(inputDate = new Date()) {
  const d = new Date(inputDate);
  const istTime = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
  const istHour = istTime.getUTCHours();
  if (istHour < 5) {
    // Orders placed between midnight and 5:00 AM IST belong to the previous calendar day
    return new Date(d.getTime() - 24 * 60 * 60 * 1000);
  }
  return d;
}

async function recordCustomerVisit({ phone, name = '', billNo = '', amount = 0, items = [], orderType = 'dine-in', date = null }) {
  if (!phone) return null;
  const cleanPhone = String(phone).replace(/\D/g, '').trim();
  if (cleanPhone.length < 5) return null;

  try {
    const rawDate = date ? new Date(date) : new Date();
    const visitDate = getEffectiveBusinessDate(rawDate);
    let customer = await Customer.findOne({ phone: cleanPhone });

    const visitEntry = {
      date: visitDate,
      billNo: billNo || '',
      amount: Number(amount) || 0,
      itemsCount: Array.isArray(items) ? items.length : 0,
      orderType: orderType || 'dine-in'
    };

    if (!customer) {
      customer = new Customer({
        phone: cleanPhone,
        name: name || '',
        visitCount: 1,
        totalSpent: Number(amount) || 0,
        lastVisitDate: visitDate,
        visits: [visitEntry]
      });
    } else {
      if (name && name.trim()) customer.name = name.trim();
      customer.visitCount = (customer.visitCount || 0) + 1;
      customer.totalSpent = (customer.totalSpent || 0) + (Number(amount) || 0);
      customer.lastVisitDate = visitDate;
      customer.visits.unshift(visitEntry);
    }

    await customer.save();
    return customer;
  } catch (err) {
    console.error('CRM record visit error:', err.message);
    return null;
  }
}

async function getCustomerCRMHistory(phone) {
  if (!phone) return { totalOrders: 0, lastOrderDate: null, lastOrderItems: [], customerName: '', orders: [] };
  const cleanPhone = String(phone).replace(/\D/g, '').trim();
  if (cleanPhone.length < 5) return { totalOrders: 0, lastOrderDate: null, lastOrderItems: [], customerName: '', orders: [] };

  try {
    const crmDoc = await Customer.findOne({ phone: cleanPhone });
    // Only completed/finalized past orders count as previous visits!
    const pastOrders = await Order.find({
      customerPhone: { $regex: new RegExp(cleanPhone, 'i') },
      isActive: false
    }).sort({ date: -1 });

    if ((!crmDoc || !crmDoc.visits || crmDoc.visits.length === 0) && pastOrders.length === 0) {
      return { totalOrders: 0, lastOrderDate: null, lastOrderItems: [], customerName: crmDoc?.name || '', orders: [] };
    }

    const customerName = (crmDoc && crmDoc.name) || (pastOrders[0] && pastOrders[0].customerName) || '';
    const rawLastDate = (crmDoc && crmDoc.lastVisitDate) || (pastOrders[0] && pastOrders[0].date) || null;
    const lastOrderDate = rawLastDate ? getEffectiveBusinessDate(rawLastDate) : null;
    const lastOrderItems = (pastOrders[0] && pastOrders[0].items) || [];
    const lastBillNo = (pastOrders[0] && pastOrders[0].billNo) || (crmDoc && crmDoc.visits && crmDoc.visits[0] && crmDoc.visits[0].billNo) || '';

    // Merge visit dates from both Order and Customer CRM cleanly
    const visitsMap = new Map();
    if (pastOrders.length > 0) {
      for (const o of pastOrders) {
        const rawDate = o.date || o.createdAt;
        const effectiveDate = getEffectiveBusinessDate(rawDate);
        const billKey = (o.billNo || '').trim().toUpperCase();
        const dateKey = effectiveDate.toISOString().slice(0, 10);
        const key = billKey ? `bill_${billKey}` : `date_${dateKey}`;
        
        visitsMap.set(key, {
          billNo: o.billNo || '',
          date: effectiveDate,
          total: o.grandTotal || 0,
          itemsCount: (o.items || []).reduce((s, i) => s + (i.quantity || 1), 0)
        });
      }
    }
    if (crmDoc && crmDoc.visits) {
      for (const v of crmDoc.visits) {
        const billKey = (v.billNo || '').trim().toUpperCase();
        const visitDate = v.date ? new Date(v.date) : new Date();
        const dateKey = visitDate.toISOString().slice(0, 10);
        const key = billKey ? `bill_${billKey}` : `date_${dateKey}`;

        if (!visitsMap.has(key)) {
          visitsMap.set(key, {
            billNo: v.billNo || '',
            date: visitDate,
            total: v.amount || 0,
            itemsCount: v.itemsCount || 0
          });
        }
      }
    }

    const mergedOrders = [...visitsMap.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalOrders = mergedOrders.length;

    return {
      totalOrders,
      lastOrderDate,
      lastOrderItems,
      customerName,
      lastBillNo,
      orders: mergedOrders.slice(0, 20)
    };
  } catch (err) {
    console.error('CRM get history error:', err.message);
    return { totalOrders: 0, lastOrderDate: null, lastOrderItems: [], customerName: '', orders: [] };
  }
}

module.exports = {
  recordCustomerVisit,
  getCustomerCRMHistory
};
