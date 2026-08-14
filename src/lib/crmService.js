const Customer = require('../models/Customer');
const Order = require('../models/Order');

async function recordCustomerVisit({ phone, name = '', billNo = '', amount = 0, items = [], orderType = 'dine-in', date = null }) {
  if (!phone) return null;
  const cleanPhone = String(phone).replace(/\D/g, '').trim();
  if (cleanPhone.length < 5) return null;

  try {
    const visitDate = date ? new Date(date) : new Date();
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
    const pastOrders = await Order.find({
      customerPhone: { $regex: new RegExp(cleanPhone, 'i') }
    }).sort({ date: -1 });

    const totalOrders = Math.max(crmDoc ? crmDoc.visitCount : 0, pastOrders.length);
    const customerName = (crmDoc && crmDoc.name) || (pastOrders[0] && pastOrders[0].customerName) || '';
    const lastOrderDate = (crmDoc && crmDoc.lastVisitDate) || (pastOrders[0] && pastOrders[0].date) || null;
    const lastOrderItems = (pastOrders[0] && pastOrders[0].items) || [];
    const lastBillNo = (pastOrders[0] && pastOrders[0].billNo) || (crmDoc && crmDoc.visits && crmDoc.visits[0] && crmDoc.visits[0].billNo) || '';

    // Merge visit dates from both Order and Customer CRM
    const visitsMap = new Map();
    if (pastOrders.length > 0) {
      for (const o of pastOrders) {
        const key = `${o.billNo || ''}_${o.date || o.createdAt}`;
        visitsMap.set(key, {
          billNo: o.billNo || '',
          date: o.date || o.createdAt,
          total: o.grandTotal || 0,
          itemsCount: (o.items || []).reduce((s, i) => s + (i.quantity || 1), 0)
        });
      }
    }
    if (crmDoc && crmDoc.visits) {
      for (const v of crmDoc.visits) {
        const key = `${v.billNo || ''}_${v.date}`;
        if (!visitsMap.has(key)) {
          visitsMap.set(key, {
            billNo: v.billNo || '',
            date: v.date,
            total: v.amount || 0,
            itemsCount: v.itemsCount || 0
          });
        }
      }
    }

    const mergedOrders = [...visitsMap.values()].sort((a, b) => new Date(b.date) - new Date(a.date));

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
