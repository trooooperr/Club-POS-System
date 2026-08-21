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

function getCustomerPhoneQuery(cleanPhone) {
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;
  return {
    $or: [
      { phone: cleanPhone },
      { phone: last10 },
      { phone: `+91${last10}` },
      { phone: `91${last10}` },
      { phone: { $regex: new RegExp(last10 + '$', 'i') } }
    ]
  };
}

async function recordCustomerVisit({ phone, name = '', billNo = '', amount = 0, items = [], orderType = 'dine-in', date = null }) {
  if (!phone) return null;
  const cleanPhone = String(phone).replace(/\D/g, '').trim();
  if (cleanPhone.length < 5) return null;
  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  try {
    const rawDate = date ? new Date(date) : new Date();
    const visitDate = getEffectiveBusinessDate(rawDate);
    let customer = await Customer.findOne(getCustomerPhoneQuery(cleanPhone));

    const visitEntry = {
      date: visitDate,
      billNo: billNo || '',
      amount: Number(amount) || 0,
      itemsCount: Array.isArray(items) ? items.length : 0,
      orderType: orderType || 'dine-in'
    };

    if (!customer) {
      customer = new Customer({
        phone: last10,
        name: name || '',
        visitCount: 1,
        visitsCount: 1,
        totalSpent: Number(amount) || 0,
        sources: ['ordering'],
        lastVisitDate: visitDate,
        visits: [visitEntry]
      });
    } else {
      if (name && name.trim()) customer.name = name.trim();
      if (!Array.isArray(customer.sources)) customer.sources = [];
      if (!customer.sources.includes('ordering')) customer.sources.push('ordering');

      const billKey = (billNo || '').trim().toUpperCase();
      const dateStr = visitDate.toISOString().slice(0, 10);
      
      const isDuplicate = Array.isArray(customer.visits) && customer.visits.some(v => {
        const vBill = (v.billNo || '').trim().toUpperCase();
        if (billKey && vBill && billKey === vBill) return true;
        const vDateStr = v.date ? new Date(v.date).toISOString().slice(0, 10) : '';
        return !billKey && !vBill && vDateStr === dateStr && (v.amount === Number(amount));
      });

      if (!isDuplicate) {
        if (!customer.visits) customer.visits = [];
        customer.visits.unshift(visitEntry);
        const newCount = Math.max((customer.visitCount || customer.visitsCount || 0) + 1, customer.visits.length);
        customer.visitCount = newCount;
        customer.visitsCount = newCount;
        customer.totalSpent = (customer.totalSpent || 0) + (Number(amount) || 0);
        customer.lastVisitDate = visitDate;
      } else {
        customer.lastVisitDate = visitDate;
      }
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

  const last10 = cleanPhone.length >= 10 ? cleanPhone.slice(-10) : cleanPhone;

  try {
    const crmDoc = await Customer.findOne(getCustomerPhoneQuery(cleanPhone));
    // Only completed/finalized past orders count as previous visits!
    const pastOrders = await Order.find({
      customerPhone: { $regex: new RegExp(last10, 'i') },
      isActive: false
    }).sort({ date: -1 });

    const totalCrmCount = (crmDoc?.visitCount || crmDoc?.visitsCount || crmDoc?.visits?.length || 0);
    if (!crmDoc && pastOrders.length === 0) {
      return { totalOrders: 0, lastOrderDate: null, lastOrderItems: [], customerName: '', orders: [] };
    }
    if (totalCrmCount === 0 && pastOrders.length === 0) {
      return { totalOrders: 0, lastOrderDate: null, lastOrderItems: [], customerName: crmDoc?.name || '', orders: [] };
    }

    const customerName = (crmDoc && crmDoc.name) || (pastOrders[0] && pastOrders[0].customerName) || '';
    const firstOrder = pastOrders[0];
    const rawLastDate = (firstOrder && firstOrder.businessDate ? new Date(`${firstOrder.businessDate}T12:00:00+05:30`) : (firstOrder && firstOrder.date)) || (crmDoc && crmDoc.lastVisitDate) || null;
    const lastOrderDate = rawLastDate;
    const lastOrderItems = (firstOrder && firstOrder.items) || [];
    const lastBillNo = (firstOrder && firstOrder.billNo) || (crmDoc && crmDoc.visits && crmDoc.visits[0] && crmDoc.visits[0].billNo) || '';

    // Merge visit dates from both Order and Customer CRM cleanly using order businessDate
    const visitsMap = new Map();
    if (pastOrders.length > 0) {
      for (const o of pastOrders) {
        const orderDate = o.businessDate ? new Date(`${o.businessDate}T12:00:00+05:30`) : getEffectiveBusinessDate(o.date || o.createdAt);
        const billKey = (o.billNo || '').trim().toUpperCase();
        const dateKey = orderDate.toISOString().slice(0, 10);
        const key = billKey ? `bill_${billKey}` : `order_${o._id}`;
        
        visitsMap.set(key, {
          billNo: o.billNo || '',
          date: orderDate,
          total: o.grandTotal || 0,
          itemsCount: (o.items || []).reduce((s, i) => s + (i.quantity || 1), 0)
        });
      }
    }
    if (crmDoc && crmDoc.visits && crmDoc.visits.length > 0) {
      for (const v of crmDoc.visits) {
        const billKey = (v.billNo || '').trim().toUpperCase();
        const visitDate = v.date ? new Date(v.date) : new Date();
        const dateKey = visitDate.toISOString().slice(0, 10);
        const key = billKey ? `bill_${billKey}` : `date_${dateKey}`;

        if (!visitsMap.has(key)) {
          const hasSameDate = [...visitsMap.values()].some(existing => {
            const existingDateStr = new Date(existing.date).toISOString().slice(0, 10);
            return existingDateStr === dateKey;
          });

          if (!hasSameDate) {
            visitsMap.set(key, {
              billNo: v.billNo || '',
              date: visitDate,
              total: v.amount || 0,
              itemsCount: v.itemsCount || 0
            });
          }
        }
      }
    }

    const mergedOrders = [...visitsMap.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalOrders = Math.max(mergedOrders.length, totalCrmCount);

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
