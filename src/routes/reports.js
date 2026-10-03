const express = require('express');
const router  = express.Router();
const Order   = require('../models/Order');
const Event   = require('../models/Event');
const Booking = require('../models/Booking');
const Inventory = require('../models/Inventory');
const MenuItem = require('../models/MenuItem');
const Settings = require('../models/Settings');
const nodemailer = require('nodemailer');
const { getCache, setCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const { getBusinessDayBounds, getBusinessDateString } = require('../lib/businessDay');

const REPORT_SUMMARY_CACHE_KEY = 'reports:daily-summary';

async function getPersistedSettings() {
  const existing = await Settings.findOne();
  return existing || Settings.create({});
}

function resolveEmailConfig(persisted, incoming = {}) {
  const authEmail =
    process.env.SMTP_USER ||
    process.env.GMAIL_SENDER ||
    incoming.authEmail ||
    persisted?.senderEmail ||
    '';

  return {
    authEmail,
    senderEmail: process.env.GMAIL_SENDER || incoming.senderEmail || persisted?.senderEmail || authEmail,
    senderPassword: incoming.senderPassword || persisted?.senderPassword || process.env.GMAIL_APP_PASSWORD || '',
    adminEmail: incoming.adminEmail || persisted?.adminEmail || process.env.ADMIN_EMAIL || '',
  };
}

function assertEmailConfig(emailConfig) {
  if (!emailConfig.authEmail) {
    throw new Error('Missing sender email. Set GMAIL_SENDER in .env.');
  }
  if (!emailConfig.senderPassword) {
    throw new Error('Missing Gmail app password. Set GMAIL_APP_PASSWORD in .env.');
  }
  if (!emailConfig.adminEmail) {
    throw new Error('Missing recipient email. Set ADMIN_EMAIL in .env or Settings.');
  }
}

const dns = require('dns').promises;

async function createTransport(emailConfig) {
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: emailConfig.authEmail,
        pass: emailConfig.senderPassword,
      },
    });
  }

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: emailConfig.authEmail,
      pass: emailConfig.senderPassword,
    },
  });
}

// ── Build the HTML email report ──────────────────────────────────
function buildReportHTML({ date, orders, settings, inventory, dailyReport = [] }) {
  const ordersToCount = orders.filter(o => !o.isManualDue);
  const total   = ordersToCount.reduce((s,o)=>s+(o.paidAmount !== undefined ? o.paidAmount : (o.dueAmount > 0 ? Math.max(0, o.grandTotal - o.dueAmount) : o.grandTotal)),0);
  const paid    = total;
  const due     = ordersToCount.reduce((s,o)=>s+(o.dueAmount||0),0);
  const pmMap   = {};
  ordersToCount.forEach(o=>{
    const actualPaid = o.paidAmount !== undefined ? o.paidAmount : (o.dueAmount > 0 ? Math.max(0, o.grandTotal - o.dueAmount) : o.grandTotal);
    if (actualPaid > 0) {
      if (o.paymentMode === 'split') {
        pmMap['cash'] = (pmMap['cash'] || 0) + (o.cashAmount || 0);
        pmMap['upi']  = (pmMap['upi']  || 0) + (o.upiAmount  || 0);
      } else {
        const mode = (o.paymentMode === 'due' || !o.paymentMode) ? 'cash' : o.paymentMode;
        pmMap[mode] = (pmMap[mode] || 0) + actualPaid;
      }
    }
  });
  const itemMap = {};
  orders.forEach(o=>o.items?.forEach(i=>{ itemMap[i.name]=(itemMap[i.name]||0)+i.quantity; }));
  const topItems = Object.entries(itemMap).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const lowStock = inventory.filter(i=>i.trackStock !== false && i.stock<=i.minStock);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<style>
  body{font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#F8FAFC;color:#1E293B;margin:0;padding:0}
  .wrap{max-width:640px;margin:0 auto;padding:40px 20px}
  .header{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:16px;padding:32px;text-align:center;margin-bottom:24px;box-shadow:0 4px 12px rgba(0,0,0,0.03)}
  .header h1{margin:0;font-size:26px;font-weight:800;color:#0F172A;letter-spacing:-0.02em}
  .header p{margin:8px 0 0;font-size:14px;color:#64748B}
  .kpi-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
  .kpi{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:20px;text-align:center;box-shadow:0 2px 4px rgba(0,0,0,0.02)}
  .kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#64748B;margin-bottom:8px;font-weight:700}
  .kpi-value{font-size:24px;font-weight:800;color:#0F172A}
  .kpi-green{color:#10B981}.kpi-amber{color:#D97706}.kpi-red{color:#EF4444}.kpi-blue{color:#2563EB}
  .section{background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin-bottom:16px;box-shadow:0 2px 4px rgba(0,0,0,0.02)}
  .section h3{font-size:13px;font-weight:700;margin:0 0 16px;color:#475569;text-transform:uppercase;letter-spacing:0.05em}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{padding:10px 12px;text-align:left;color:#64748B;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #F1F5F9}
  td{padding:12px;border-bottom:1px solid #F1F5F9;color:#334155}
  tr:last-child td{border-bottom:none}
  .badge{display:inline-block;padding:3px 8px;border-radius:6px;font-size:10px;font-weight:700}
  .low{background:#FEF2F2;color:#EF4444;border:1px solid #FEE2E2}
  .ok{background:#F0FDF4;color:#10B981;border:1px solid #DCFCE7}
  .footer{text-align:center;font-size:12px;color:#94A3B8;margin-top:32px;padding-top:24px;border-top:1px solid #E2E8F0}
  .alert-box{background:#FFFBEB;border:1px solid #FEF3C7;border-radius:10px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400E}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>${settings.restaurantName||'HumTum'}</h1>
    <p>Daily Sales Report · ${new Date(date).toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
  </div>

  <div class="kpi-grid">
    <div class="kpi"><div class="kpi-label">Total Revenue</div><div class="kpi-value kpi-amber">${settings.currency||'₹'}${total.toFixed(0)}</div></div>
    <div class="kpi"><div class="kpi-label">Orders</div><div class="kpi-value kpi-green">${orders.length}</div></div>
  </div>


  <div class="section">
    <h3>📊 Payment Breakdown</h3>
    <table><thead><tr><th>Mode</th><th>Amount</th><th>Share</th></tr></thead><tbody>
      ${Object.entries(pmMap).map(([mode,amt])=>`<tr><td>${mode.toUpperCase()}</td><td style="font-family:monospace">${settings.currency||'₹'}${amt.toFixed(2)}</td><td>${total>0?((amt/total)*100).toFixed(0):0}%</td></tr>`).join('')}
    </tbody></table>
  </div>

  <div class="section">
    <h3>🍷 Daily Stock Sales & Drinks Report</h3>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Opening</th>
          <th>Added</th>
          <th>Sold</th>
          <th>Closing</th>
        </tr>
      </thead>
      <tbody>
        ${dailyReport.length === 0 || !dailyReport.some(i => i.isAlcoholic || i.soldStock > 0 || i.addedStock !== 0)
          ? '<tr><td colspan="5" style="text-align:center;color:#64748B">No drink sales or stock activity today</td></tr>'
          : dailyReport
              .filter(i => i.isAlcoholic || i.soldStock > 0 || i.addedStock !== 0)
              .map(i => `
                <tr>
                  <td>${i.itemName} ${i.isAlcoholic ? '🍷' : ''}</td>
                  <td style="font-family:monospace">${Number(i.openingStock).toFixed(2).replace(/\.00$/, '')} ${i.unit}</td>
                  <td style="font-family:monospace;color:${i.addedStock > 0 ? '#10B981' : i.addedStock < 0 ? '#EF4444' : '#64748B'}">${i.addedStock > 0 ? '+' : ''}${i.addedStock !== 0 ? Number(i.addedStock).toFixed(2).replace(/\.00$/, '') : '—'}</td>
                  <td style="font-family:monospace;color:#EF4444">${i.soldStock > 0 ? Number(i.soldStock).toFixed(2).replace(/\.00$/, '') : '—'}</td>
                  <td style="font-family:monospace;font-weight:bold">${Number(i.closingStock).toFixed(2).replace(/\.00$/, '')} ${i.unit}</td>
                </tr>
              `).join('')
        }
      </tbody>
    </table>
  </div>



  <div class="section">
    <h3>📦 Low Stock Items (${lowStock.length})</h3>
    <table><thead><tr><th>Item</th><th>Stock</th><th>Min</th><th>Status</th></tr></thead><tbody>
      ${lowStock.length===0?'<tr><td colspan="4" style="text-align:center;color:#64748B">All items are in stock</td></tr>':lowStock.map(i=>`<tr><td>${i.name}</td><td style="font-family:monospace">${i.stock} ${i.unit}</td><td style="font-family:monospace;color:#525870">${i.minStock}</td><td><span class="badge low">Low Stock</span></td></tr>`).join('')}
    </tbody></table>
  </div>

  <div class="section">
    <h3>📋 Today's Orders (${orders.length})</h3>
    <table><thead><tr><th>Bill No</th><th>Table</th><th>Amount</th><th>Mode</th></tr></thead><tbody>
      ${orders.slice(0,15).map(o=>`<tr><td style="font-family:monospace">${o.billNo}</td><td>T${o.tableNo}</td><td style="font-family:monospace">${settings.currency||'₹'}${o.grandTotal.toFixed(2)}</td><td>${o.paymentMode?.toUpperCase()}</td></tr>`).join('')}
      ${orders.length>15?`<tr><td colspan="4" style="text-align:center;color:#525870">+${orders.length-15} more orders</td></tr>`:''}
    </tbody></table>
  </div>

  <div class="footer">
    ${settings.restaurantName||'HumTum'}<br/>
    ${settings.address||''}
  </div>
</div>
</body>
</html>`;
}
// ── Standalone function for internal use (e.g. cron) ───────────
async function sendDailyReportInternal(options = {}) {
  const persistedSettings = await getPersistedSettings();
  const resolvedEmailConfig = resolveEmailConfig(persistedSettings, options.emailConfig);
  assertEmailConfig(resolvedEmailConfig);
  const resolvedSettings = {
    ...persistedSettings.toObject(),
    ...options.settings,
    restaurantName: options.settings?.restaurantName || persistedSettings.restaurantName || process.env.RESTAURANT_NAME || 'HumTum',
    currency: options.settings?.currency || persistedSettings.currency || '₹',
  };

  const businessDateStr = getBusinessDateString(new Date());
  const orders = await Order.find({ businessDate: businessDateStr, grandTotal: { $gt: 0 }, isManualDue: { $ne: true } });
  const inventory = await Inventory.find();
  const inventoryCategories = resolvedSettings.inventoryCategories || [];
  inventory.sort((a, b) => {
    const catAIndex = inventoryCategories.indexOf(a.category);
    const catBIndex = inventoryCategories.indexOf(b.category);
    const indexA = catAIndex === -1 ? 999999 : catAIndex;
    const indexB = catBIndex === -1 ? 999999 : catBIndex;
    if (indexA !== indexB) return indexA - indexB;
    const orderA = a.order || 0;
    const orderB = b.order || 0;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });

  const { getDailyInventoryReport } = require('../lib/inventoryReport');
  const dailyReport = await getDailyInventoryReport(businessDateStr);
  const html = buildReportHTML({ date: new Date(businessDateStr), orders, settings: resolvedSettings, inventory, dailyReport });
  const transporter = await createTransport(resolvedEmailConfig);
  await transporter.verify();

  const result = await transporter.sendMail({
    from:    `"${resolvedSettings.restaurantName || 'HumTum POS'}" <${resolvedEmailConfig.senderEmail}>`,
    replyTo: resolvedEmailConfig.senderEmail,
    to:      resolvedEmailConfig.adminEmail,
    subject: `📊 Daily Report — ${resolvedSettings.restaurantName || 'HumTum'} — ${new Date().toLocaleDateString('en-IN')}`,
    html,
  });

  return {
    ...result,
    recipient: resolvedEmailConfig.adminEmail,
    ordersCount: orders.length,
  };
}

router.post('/send-daily', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { emailConfig, settings } = req.body;
    const result = await sendDailyReportInternal({ emailConfig, settings });
    res.json({
      success:true,
      message:'Report sent',
      recipient: result.recipient,
      ordersCount: result.ordersCount,
    });
  } catch (err) {
    console.error('Email error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to send email.' });
  }
});

// ── GET /daily-html (For External Cron / Google Apps Script) ───
router.get('/daily-html', async (req, res) => {
  try {
    // Note: Request is already authenticated by `allowCronSecret` middleware in app.js
    
    const persistedSettings = await getPersistedSettings();
    const resolvedSettings = {
      ...persistedSettings.toObject(),
      restaurantName: persistedSettings.restaurantName || process.env.RESTAURANT_NAME || 'HumTum',
      currency: persistedSettings.currency || '₹',
    };

    const businessDateStr = getBusinessDateString(new Date());
    const orders = await Order.find({ businessDate: businessDateStr, grandTotal: { $gt: 0 }, isManualDue: { $ne: true } });
    const inventory = await Inventory.find();
    const inventoryCategories = resolvedSettings.inventoryCategories || [];
    inventory.sort((a, b) => {
      const catAIndex = inventoryCategories.indexOf(a.category);
      const catBIndex = inventoryCategories.indexOf(b.category);
      const indexA = catAIndex === -1 ? 999999 : catAIndex;
      const indexB = catBIndex === -1 ? 999999 : catBIndex;
      if (indexA !== indexB) return indexA - indexB;
      const orderA = a.order || 0;
      const orderB = b.order || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    });

    const { getDailyInventoryReport } = require('../lib/inventoryReport');
    const dailyReport = await getDailyInventoryReport(businessDateStr);
    const html = buildReportHTML({ date: new Date(businessDateStr), orders, settings: resolvedSettings, inventory, dailyReport });
    res.send(html);
  } catch (err) {
    console.error('Error generating daily HTML:', err.message);
    res.status(500).send('Error generating report HTML: ' + err.message);
  }
});

router.get('/daily-summary', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const cached = await getCache(REPORT_SUMMARY_CACHE_KEY);
    if (cached) return res.json(cached);

    const businessDateStr = getBusinessDateString(new Date());
    const orders = await Order.find({ businessDate: businessDateStr, grandTotal: { $gt: 0 }, isManualDue: { $ne: true } });
    const total    = orders.reduce((s,o)=>s+(o.paidAmount !== undefined ? o.paidAmount : (o.dueAmount > 0 ? Math.max(0, o.grandTotal - o.dueAmount) : o.grandTotal)),0);
    const due      = orders.reduce((s,o)=>s+(o.dueAmount||0),0);
    const pmMap    = {};
    orders.forEach(o=>{
      const actualPaid = o.paidAmount !== undefined ? o.paidAmount : (o.dueAmount > 0 ? Math.max(0, o.grandTotal - o.dueAmount) : o.grandTotal);
      if (actualPaid > 0) {
        const mode = (o.paymentMode === 'due' || !o.paymentMode) ? 'cash' : o.paymentMode;
        pmMap[mode] = (pmMap[mode] || 0) + actualPaid;
      }
    });
    const summary = { ordersCount:orders.length, revenue:total, due, paymentBreakdown:pmMap, date:new Date(businessDateStr) };
    await setCache(REPORT_SUMMARY_CACHE_KEY, summary, 120);
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/today-discounts', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const businessDateStr = getBusinessDateString(new Date());
    const rawOrders = await Order.find({
      businessDate: businessDateStr,
      discount: { $gt: 0 }
    }).sort({ updatedAt: -1, date: -1 });

    // Exclude 100% discount bills (even if fine added), ₹1 unpaid bills, & pending credit bills
    const ordersWithDiscount = rawOrders.filter(o => {
      const is100Pct = (o.discountPercent !== undefined && o.discountPercent !== null && o.discountPercent >= 100) ||
        (((o.grandTotal || 0) - (o.fine || 0)) <= 1 && (o.discount || 0) > 0);
      if (is100Pct) return false;
      return o.grandTotal > 1 && o.paidAmount !== 1 && !o.isCredit && (o.dueAmount || 0) === 0;
    });

    const totalDiscount = ordersWithDiscount.reduce((sum, o) => sum + (o.discount || 0), 0);

    const details = ordersWithDiscount.map(o => ({
      _id: o._id,
      billNo: o.billNo || `HTB-T${o.tableNo}`,
      tableNo: o.tableNo,
      customerName: o.customerName || 'Walk-in Guest',
      customerPhone: o.customerPhone || '',
      waiterName: o.waiterName || '',
      subtotal: o.subtotal || 0,
      discount: o.discount || 0,
      discountPercent: (o.grandTotal <= 1 && (o.discount || 0) > 0)
        ? 100
        : (o.discountPercent !== undefined && o.discountPercent !== null
            ? Math.min(100, Math.round(o.discountPercent))
            : ((o.subtotal || 0) > 0 ? Math.min(100, Math.round(((o.discount || 0) / (((o.grandTotal || 0) + (o.discount || 0)) || o.subtotal)) * 100)) : 0)),
      sgst: o.sgst || 0,
      cgst: o.cgst || 0,
      totalGst: Number(((o.sgst || 0) + (o.cgst || 0)).toFixed(2)),
      serviceTax: o.serviceTax || 0,
      roundOff: o.roundOff || 0,
      grandTotal: o.grandTotal || 0,
      date: o.updatedAt || o.date,
      paymentMode: o.paymentMode || 'cash'
    }));

    res.json({
      businessDate: businessDateStr,
      totalDiscount,
      count: details.length,
      orders: details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/discounts', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let matchQuery = { discount: { $gt: 0 } };

    if (startDate && endDate) {
      matchQuery.businessDate = { $gte: startDate, $lte: endDate };
    }

    const rawOrders = await Order.find(matchQuery).sort({ updatedAt: -1, date: -1 });

    // Exclude 100% discount bills (even if fine added), ₹1 unpaid bills, & pending credit bills
    const ordersWithDiscount = rawOrders.filter(o => {
      const is100Pct = (o.discountPercent !== undefined && o.discountPercent !== null && o.discountPercent >= 100) ||
        (((o.grandTotal || 0) - (o.fine || 0)) <= 1 && (o.discount || 0) > 0);
      if (is100Pct) return false;
      return o.grandTotal > 1 && o.paidAmount !== 1 && !o.isCredit && (o.dueAmount || 0) === 0;
    });

    const totalDiscount = ordersWithDiscount.reduce((sum, o) => sum + (o.discount || 0), 0);
    const count = ordersWithDiscount.length;
    const avgDiscount = count > 0 ? Math.round(totalDiscount / count) : 0;
    const maxDiscount = ordersWithDiscount.reduce((max, o) => Math.max(max, o.discount || 0), 0);

    // Group daily discounts for chart visualization
    const dailyMap = {};
    ordersWithDiscount.forEach(o => {
      const bDate = o.businessDate || (o.date ? new Date(o.date).toISOString().slice(0, 10) : 'Other');
      dailyMap[bDate] = (dailyMap[bDate] || 0) + (o.discount || 0);
    });

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const sortedDates = Object.keys(dailyMap).sort();
    const dailyData = sortedDates.map(dateStr => {
      const parts = dateStr.split('-');
      let dayOfWeek = '';
      let dayShort = '';
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m, d);
        if (!isNaN(dateObj.getTime())) {
          dayOfWeek = days[dateObj.getDay()];
          dayShort = shortDays[dateObj.getDay()];
        }
        const day = parts[2];
        const month = months[m] || parts[1];
        return { name: `${day} ${month}`, date: dateStr, dayOfWeek, dayShort, discount: dailyMap[dateStr] };
      }
      return { name: dateStr, date: dateStr, discount: dailyMap[dateStr] };
    });

    const details = ordersWithDiscount.map(o => ({
      _id: o._id,
      billNo: o.billNo || `HTB-T${o.tableNo}`,
      tableNo: o.tableNo,
      customerName: o.customerName || 'Walk-in Guest',
      customerPhone: o.customerPhone || '',
      waiterName: o.waiterName || '',
      subtotal: o.subtotal || 0,
      discount: o.discount || 0,
      discountPercent: (o.grandTotal <= 1 && (o.discount || 0) > 0)
        ? 100
        : (o.discountPercent !== undefined && o.discountPercent !== null
            ? Math.min(100, Math.round(o.discountPercent))
            : ((o.subtotal || 0) > 0 ? Math.min(100, Math.round(((o.discount || 0) / (((o.grandTotal || 0) + (o.discount || 0)) || o.subtotal)) * 100)) : 0)),
      sgst: o.sgst || 0,
      cgst: o.cgst || 0,
      totalGst: Number(((o.sgst || 0) + (o.cgst || 0)).toFixed(2)),
      serviceTax: o.serviceTax || 0,
      roundOff: o.roundOff || 0,
      grandTotal: o.grandTotal || 0,
      date: o.updatedAt || o.date,
      paymentMode: o.paymentMode || 'cash'
    }));

    res.json({
      startDate: startDate || '',
      endDate: endDate || '',
      totalDiscount,
      count,
      avgDiscount,
      maxDiscount,
      dailyData,
      orders: details
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/analytics', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate required' });

    const orderMatch = { businessDate: { $gte: startDate, $lte: endDate }, grandTotal: { $gt: 0 } };
    const eventMatch = { date: { $gte: startDate, $lte: endDate } };
    const bookingMatch = {
      $or: [
        { advancePaymentDate: { $gte: startDate, $lte: endDate } },
        { createdAtDate: { $gte: startDate, $lte: endDate } },
        { bookingDate: { $gte: startDate, $lte: endDate } }
      ],
      advancePayment: { $gt: 0 },
      status: { $ne: 'cancelled' }
    };

    // 1. Order Stats & Event Stats & Bookings
    const statsResult = await Order.aggregate([
      { $match: orderMatch },
      { $group: { 
          _id: null, 
          revenue: { 
            $sum: {
              $cond: [
                { $gt: ["$paidAmount", 0] },
                "$paidAmount",
                {
                  $cond: [
                    { $gt: ["$dueAmount", 0] },
                    { $max: [0, { $subtract: ["$grandTotal", "$dueAmount"] }] },
                    "$grandTotal"
                  ]
                }
              ]
            }
          }, 
          grossRevenue: { $sum: "$grandTotal" },
          dueAmount: { $sum: { $ifNull: ["$dueAmount", 0] } },
          discount: { $sum: "$discount" }, 
          count: { $sum: 1 } 
      } }
    ]);
    const orderStats = statsResult[0] || { revenue: 0, grossRevenue: 0, dueAmount: 0, discount: 0, count: 0 };

    const eventStatsResult = await Event.aggregate([
      { $match: eventMatch },
      { $group: { 
          _id: null, 
          revenue: { $sum: "$grandTotal" }, 
          expenses: { $sum: "$totalExpenses" },
          net: { $sum: "$netRevenue" },
          count: { $sum: 1 } 
      }}
    ]);
    const eventStats = eventStatsResult[0] || { revenue: 0, expenses: 0, net: 0, count: 0 };

    // Fetch Bookings with advance payment in the requested period
    const bookings = await Booking.find(bookingMatch).lean();

    // 2. Fetch inventory names and prepare smart alcohol classifier
    const inventoryItems = await Inventory.find({}).select('name').lean();
    const invNorms = inventoryItems.map(i => (i.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim());

    const alcKeywords = [
      'carlsberg', 'carlsbesrg', 'budweiser', 'budwiser', 'tuborg', 'kingfisher', 'corona', 
      'breezer', 'breezers', 'bacardi', 'absolut', 'pipers', 'ballantine', 'black dog', 
      'black & white', 'blenders pride', 'blender pride', 'bombay sapphire', 'dewar', 'grey goose', 'indri', 
      'jack daniel', 'jagermeister', 'jager bomb', 'jameson', 'johnnie walker', 'jose cuervo', 
      'royal stag', 'smirnoff', 'simranoff', 'vodka', 'whisky', 'whiskey', 'scotch', 'tequila', 
      'beer', 'rum', 'gin', 'liqueur', 'shot', 'shots', 'fire pencil', 'flaming', 'plater', 'platter',
      '30ml', '60ml', '90ml', '120ml', 'bucket', 'bomb mix', 'bira', 'heineken', 'old monk',
      'chivas', 'glenfiddich', 'teachers', 'vat 69', 'royal challenge', 'signature', 'antiquity',
      'imperial blue', 'mcdowell', 'magic moments', 'cocktail', 'peg'
    ];

    const isAlcoholItem = (item) => {
      if (!item) return false;
      if (item.isAlcoholic === true || item.isAlcohol === true) return true;
      if (item.department === 'bar') return true;

      const norm = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!norm) return false;

      for (const iname of invNorms) {
        if (norm === iname) return true;
        if (iname.length >= 4 && norm.includes(iname)) return true;
        if (norm.length >= 6 && iname.includes(norm)) return true;
      }

      for (const kw of alcKeywords) {
        if (norm.includes(kw)) {
          const isSoft = norm.includes('water') || norm.includes('soda') || norm.includes('juice') || norm.includes('shake') || norm.includes('coffee') || norm.includes('tea') || norm.includes('red bull') || norm.includes('cold drink');
          if (isSoft) {
            const hasHardBrand = ['carlsberg', 'carlsbesrg', 'budweiser', 'budwiser', 'tuborg', 'kingfisher', 'corona', 'breezer', 'bacardi', 'absolut', 'pipers', 'ballantine', 'black dog', 'blenders', 'blender', 'bombay sapphire', 'grey goose', 'indri', 'jack daniel', 'jagermeister', 'jameson', 'johnnie walker', 'jose cuervo', 'royal stag', 'smirnoff', 'simranoff', 'vodka', 'whisky', 'whiskey', 'scotch', 'tequila', 'beer', 'rum', 'gin'].some(b => norm.includes(b));
            if (hasHardBrand) return true;
            return false;
          }
          return true;
        }
      }
      return false;
    };

    // 3. Fetch all orders with items & financial fields to calculate exact Restaurant & Bar sales
    const orders = await Order.find(orderMatch).select(
      'businessDate items foodSubtotal alcoholSubtotal subtotal sgst cgst serviceTax discount roundOff grandTotal paidAmount dueAmount paymentMode isCredit paymentMethod paymentStatus cashAmount upiAmount'
    ).lean();

    const dailyMap = {};
    const initDailyEntry = () => ({
      sales: 0,
      grossSales: 0,
      due: 0,
      restaurantSales: 0,
      barSales: 0,
      advancePayments: 0
    });

    let totalRestaurantSales = 0;
    let totalBarSales = 0;
    let totalGst = 0;
    let cashTotal = 0, upiTotal = 0, dueTotal = 0;

    orders.forEach(o => {
      const bDate = o.businessDate || (o.date ? new Date(o.date).toISOString().slice(0, 10) : 'Other');
      if (!dailyMap[bDate]) dailyMap[bDate] = initDailyEntry();

      // Determine order actual collected and due
      const isDueOrder = o.paymentMode === 'due' || o.paymentMethod === 'due' || o.paymentStatus === 'pending' || o.isCredit;
      const orderDue = o.dueAmount > 0 ? o.dueAmount : (isDueOrder ? o.grandTotal - (o.paidAmount || 0) : 0);
      const actualPaid = o.paidAmount !== undefined ? o.paidAmount : (o.dueAmount > 0 ? Math.max(0, o.grandTotal - o.dueAmount) : o.grandTotal);

      dailyMap[bDate].sales += actualPaid;
      dailyMap[bDate].grossSales += (o.grandTotal || 0);
      dailyMap[bDate].due += Math.max(0, orderDue);
      dueTotal += Math.max(0, orderDue);

      // Payment mode allocation
      if (o.paymentMode === 'split') {
        cashTotal += (o.cashAmount || 0);
        upiTotal  += (o.upiAmount  || 0);
      } else if (isDueOrder) {
        if (o.cashAmount > 0) cashTotal += o.cashAmount;
        if (o.upiAmount > 0) upiTotal += o.upiAmount;
        if (!o.cashAmount && !o.upiAmount && actualPaid > 0) {
          cashTotal += actualPaid;
        }
      } else if (o.paymentMode === 'upi') {
        upiTotal += actualPaid;
      } else {
        cashTotal += actualPaid;
      }

      // Compute exact Restaurant vs Bar sales from items
      let orderFood = 0;
      let orderAlcohol = 0;

      if (Array.isArray(o.items) && o.items.length > 0) {
        o.items.forEach(item => {
          if (!item) return;
          const itemTotal = (item.price || 0) * (item.quantity || 1);
          if (isAlcoholItem(item)) {
            orderAlcohol += itemTotal;
          } else {
            orderFood += itemTotal;
          }
        });

        // Respect saved alcohol subtotal if stored higher
        if (o.alcoholSubtotal > orderAlcohol) {
          const diff = o.alcoholSubtotal - orderAlcohol;
          orderAlcohol = o.alcoholSubtotal;
          orderFood = Math.max(0, orderFood - diff);
        }
      } else {
        orderFood = o.foodSubtotal || 0;
        orderAlcohol = o.alcoholSubtotal || 0;
        if (orderFood === 0 && orderAlcohol === 0) {
          orderFood = o.subtotal || 0;
        }
      }

      // Track total GST collected (SGST + CGST)
      const orderGst = Number(((o.sgst || 0) + (o.cgst || 0)).toFixed(2));
      totalGst += orderGst;

      const orderRestaurantSales = Math.round(orderFood + orderGst);
      const orderBarSales = Math.max(0, Math.round(orderAlcohol + (o.serviceTax || 0) - (o.discount || 0)));

      dailyMap[bDate].restaurantSales += orderRestaurantSales;
      dailyMap[bDate].barSales += orderBarSales;

      totalRestaurantSales += orderRestaurantSales;
      totalBarSales += orderBarSales;
    });

    // Merge Event stats into daily data and totals
    const events = await Event.find(eventMatch).select('date paymentMode grandTotal cashAmount upiAmount totalExpenses').lean();
    events.forEach(e => {
      const eDate = e.date;
      if (!dailyMap[eDate]) dailyMap[eDate] = initDailyEntry();
      dailyMap[eDate].sales += (e.grandTotal || 0);
      dailyMap[eDate].grossSales += (e.grandTotal || 0);

      if (e.paymentMode === 'split') {
        cashTotal += (e.cashAmount || 0);
        upiTotal  += (e.upiAmount  || 0);
      } else if (e.paymentMode === 'upi') {
        upiTotal += (e.grandTotal || 0);
      } else {
        cashTotal += (e.grandTotal || 0);
      }
    });

    // Merge Booking advance payments into daily data on the date created / advance paid
    let totalAdvancePayment = 0;
    bookings.forEach(b => {
      const bDate = b.advancePaymentDate || b.createdAtDate || (b.createdAt ? new Date(b.createdAt).toISOString().slice(0, 10) : startDate);
      if (bDate >= startDate && bDate <= endDate) {
        const adv = b.advancePayment || 0;
        if (!dailyMap[bDate]) dailyMap[bDate] = initDailyEntry();
        dailyMap[bDate].advancePayments += adv;
        dailyMap[bDate].sales += adv;
        dailyMap[bDate].grossSales += adv;

        totalAdvancePayment += adv;
        if (b.advancePaymentMode === 'split') {
          cashTotal += (b.advanceCashAmount || 0);
          upiTotal  += (b.advanceUpiAmount  || 0);
        } else if (b.advancePaymentMode === 'upi') {
          upiTotal += adv;
        } else {
          cashTotal += adv;
        }
      }
    });

    // If a specific future or empty single day was requested, guarantee its entry in dailyMap
    if (startDate === endDate && !dailyMap[startDate]) {
      dailyMap[startDate] = initDailyEntry();
    }

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const shortDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const sortedDates = Object.keys(dailyMap).sort();
    const dailyData = sortedDates.map(dateStr => {
      const dateParts = dateStr.split('-');
      let dayOfWeek = '';
      let dayShort = '';
      if (dateParts.length === 3) {
        const y = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10) - 1;
        const d = parseInt(dateParts[2], 10);
        const dateObj = new Date(y, m, d);
        if (!isNaN(dateObj.getTime())) {
          dayOfWeek = days[dateObj.getDay()];
          dayShort = shortDays[dateObj.getDay()];
        }
      }
      const day = dateParts[2];
      const month = months[parseInt(dateParts[1], 10) - 1] || dateParts[1];
      const entry = dailyMap[dateStr] || initDailyEntry();
      return { 
        name: `${day} ${month}`, 
        date: dateStr,
        dayOfWeek,
        dayShort,
        sales: Math.round(entry.sales),
        grossSales: Math.round(entry.grossSales),
        due: Math.round(entry.due),
        restaurantSales: Math.round(entry.restaurantSales),
        barSales: Math.round(entry.barSales),
        advancePayments: Math.round(entry.advancePayments)
      };
    });

    // 4. Alcoholic Shots / Liquor Sales Analytics (Excludes Non-Alcoholic items like Fire Pencil/Platters)
    const menuItemsForLookup = await MenuItem.find({}).select('name category isAlcoholic').lean();
    const inventoryItemsForLookup = await Inventory.find({}).select('name category isAlcoholic').lean();

    const shooterCategoryItems = new Set();
    menuItemsForLookup.forEach(m => {
      const cat = (m.category || '').toUpperCase().trim();
      if (cat === 'SHOOTERS' || cat === 'SHOTS' || cat === 'SHOOTER' || cat === 'SHOT') {
        if (m.name && !m.name.toUpperCase().includes('PENCIL') && !m.name.toUpperCase().includes('PLATTER')) {
          shooterCategoryItems.add(m.name.trim().toLowerCase());
        }
      }
    });
    inventoryItemsForLookup.forEach(i => {
      const cat = (i.category || '').toUpperCase().trim();
      if (cat === 'SHOOTERS' || cat === 'SHOTS' || cat === 'SHOOTER' || cat === 'SHOT') {
        if (i.name && !i.name.toUpperCase().includes('PENCIL') && !i.name.toUpperCase().includes('PLATTER')) {
          shooterCategoryItems.add(i.name.trim().toLowerCase());
        }
      }
    });

    const isAlcoholicShooterItem = (itemName, itemCategory) => {
      if (!itemName) return false;
      const upperName = itemName.trim().toUpperCase();
      // Exclude non-alcoholic items like sparklers/candles/food platters
      if (upperName.includes('PENCIL') || upperName.includes('PLATTER') || upperName.includes('BOMBAY')) return false;

      const cat = (itemCategory || '').toUpperCase().trim();
      if (cat === 'SHOOTERS' || cat === 'SHOTS' || cat === 'SHOOTER' || cat === 'SHOT') return true;
      if (upperName.includes('SHOT') || upperName.includes('SHOOTER') || upperName.includes('VODKA BOMB') || upperName.includes('JAGER BOMB')) return true;

      return shooterCategoryItems.has(itemName.trim().toLowerCase());
    };

    const fullOrdersForShots = await Order.find({ ...orderMatch, isActive: false, isManualDue: { $ne: true } }).select('items businessDate date').lean();

    const shotItemsMap = {};
    let totalShotsCount = 0;
    let totalShotsRevenue = 0;

    fullOrdersForShots.forEach(o => {
      (o.items || []).forEach(item => {
        if (item && item.name && isAlcoholicShooterItem(item.name, item.category)) {
          const key = item.name.trim();
          const qty = item.quantity || 1;
          const unitPrice = item.price || 0;
          const rev = qty * unitPrice;

          if (!shotItemsMap[key]) {
            shotItemsMap[key] = {
              name: key,
              quantity: 0,
              revenue: 0,
              price: unitPrice
            };
          }
          shotItemsMap[key].quantity += qty;
          shotItemsMap[key].revenue += rev;
          totalShotsCount += qty;
          totalShotsRevenue += rev;
        }
      });
    });

    const shotsBreakdown = Object.values(shotItemsMap).sort((a, b) => b.quantity - a.quantity);

    const combinedCollectedRevenue = (orderStats.revenue || 0) + (eventStats.revenue || 0) + totalAdvancePayment;
    const combinedGrossRevenue = (orderStats.grossRevenue || 0) + (eventStats.revenue || 0) + totalAdvancePayment;
    const totalDueAmount = dueTotal > 0 ? dueTotal : (orderStats.dueAmount || 0);

    res.json({
      revenue: Math.round(combinedCollectedRevenue),           // Collected (Cash + UPI received)
      collectedRevenue: Math.round(combinedCollectedRevenue),  // Explicit alias
      grossRevenue: Math.round(combinedGrossRevenue),         // Total including due bills
      totalSalesWithDue: Math.round(combinedGrossRevenue),    // Clear alias for total sales incl due
      totalDue: Math.round(totalDueAmount),                   // Total pending due amount
      totalGst: Math.round(totalGst),                         // Total GST collected from customers
      restaurantSales: Math.round(totalRestaurantSales),
      barSales: Math.round(totalBarSales),
      advancePayments: Math.round(totalAdvancePayment),
      totalRestaurantSales: Math.round(totalRestaurantSales),
      totalBarSales: Math.round(totalBarSales),
      totalAdvancePayment: Math.round(totalAdvancePayment),
      orderRevenue: Math.round(orderStats.revenue || 0),
      orderGrossRevenue: Math.round(orderStats.grossRevenue || 0),
      eventRevenue: Math.round(eventStats.revenue || 0),
      eventExpenses: Math.round(eventStats.expenses || 0),
      netEventRevenue: Math.round(eventStats.net || 0),
      totalDiscount: Math.round(orderStats.discount || 0),
      count: (orderStats.count || 0) + (eventStats.count || 0) + bookings.length,
      orderCount: orderStats.count || 0,
      eventCount: eventStats.count || 0,
      bookingCount: bookings.length,
      dailyData,
      paymentBreakdown: { cash: Math.round(cashTotal), upi: Math.round(upiTotal), due: Math.round(totalDueAmount) },
      shotsStats: {
        totalShots: totalShotsCount,
        totalRevenue: Math.round(totalShotsRevenue),
        items: shotsBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/shots', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate required' });

    const orderMatch = { businessDate: { $gte: startDate, $lte: endDate }, grandTotal: { $gt: 0 }, isActive: false };
    const orders = await Order.find(orderMatch).select('items billNo tableNo customerName businessDate date').lean();

    const menuItemsForLookup = await MenuItem.find({}).select('name category isAlcoholic').lean();
    const inventoryItemsForLookup = await Inventory.find({}).select('name category isAlcoholic').lean();

    const shooterCategoryItems = new Set();
    menuItemsForLookup.forEach(m => {
      const cat = (m.category || '').toUpperCase().trim();
      if (cat === 'SHOOTERS' || cat === 'SHOTS' || cat === 'SHOOTER' || cat === 'SHOT') {
        if (m.name && !m.name.toUpperCase().includes('PENCIL') && !m.name.toUpperCase().includes('PLATTER')) {
          shooterCategoryItems.add(m.name.trim().toLowerCase());
        }
      }
    });
    inventoryItemsForLookup.forEach(i => {
      const cat = (i.category || '').toUpperCase().trim();
      if (cat === 'SHOOTERS' || cat === 'SHOTS' || cat === 'SHOOTER' || cat === 'SHOT') {
        if (i.name && !i.name.toUpperCase().includes('PENCIL') && !i.name.toUpperCase().includes('PLATTER')) {
          shooterCategoryItems.add(i.name.trim().toLowerCase());
        }
      }
    });

    const isAlcoholicShooterItem = (itemName, itemCategory) => {
      if (!itemName) return false;
      const upperName = itemName.trim().toUpperCase();
      if (upperName.includes('PENCIL') || upperName.includes('PLATTER') || upperName.includes('BOMBAY')) return false;

      const cat = (itemCategory || '').toUpperCase().trim();
      if (cat === 'SHOOTERS' || cat === 'SHOTS' || cat === 'SHOOTER' || cat === 'SHOT') return true;
      if (upperName.includes('SHOT') || upperName.includes('SHOOTER') || upperName.includes('VODKA BOMB') || upperName.includes('JAGER BOMB')) return true;

      return shooterCategoryItems.has(itemName.trim().toLowerCase());
    };

    const shotItemsMap = {};
    let totalShotsCount = 0;
    let totalShotsRevenue = 0;

    orders.forEach(o => {
      (o.items || []).forEach(item => {
        if (item && item.name && isAlcoholicShooterItem(item.name, item.category)) {
          const key = item.name.trim();
          const qty = item.quantity || 1;
          const unitPrice = item.price || 0;
          const rev = qty * unitPrice;

          if (!shotItemsMap[key]) {
            shotItemsMap[key] = {
              name: key,
              quantity: 0,
              revenue: 0,
              price: unitPrice
            };
          }
          shotItemsMap[key].quantity += qty;
          shotItemsMap[key].revenue += rev;
          totalShotsCount += qty;
          totalShotsRevenue += rev;
        }
      });
    });

    const shotsBreakdown = Object.values(shotItemsMap).sort((a, b) => b.quantity - a.quantity);

    res.json({
      startDate,
      endDate,
      totalShots: totalShotsCount,
      totalRevenue: totalShotsRevenue,
      items: shotsBreakdown
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = { router, sendDailyReportInternal, resolveEmailConfig, createTransport, getPersistedSettings };
