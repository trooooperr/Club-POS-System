const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.CLOUD_MONGO_URI);
  console.log('Connected to MongoDB');

  const Order = require('../src/models/Order');
  const BillCounter = require('../src/models/BillCounter');

  // 1. Clean open/unbilled orders that were given premature bill numbers
  const openOrdersWithBill = await Order.find({
    isActive: true,
    orderStatus: { $in: ['OPEN', 'KOT_SENT', 'PREPARING', 'READY'] },
    billNo: { $regex: /^HTB-/ }
  });
  console.log(`Found ${openOrdersWithBill.length} open orders with premature bill numbers:`);
  for (const o of openOrdersWithBill) {
    console.log(`- Clearing billNo from Table ${o.tableNo} (Cust: ${o.customerName || 'N/A'}, was: ${o.billNo})`);
    o.billNo = '';
    await o.save();
  }

  // 2. Re-sequence 2026-09-03 orders chronologically by finalization time to remove duplicates
  const sept3Orders = await Order.find({
    businessDate: '2026-09-03',
    billNo: { $regex: /^HTB-/ },
    isActive: false
  }).sort({ inventoryFinalizedAt: 1, date: 1, createdAt: 1 });

  console.log(`Found ${sept3Orders.length} finalized orders on 2026-09-03 to re-sequence.`);

  // First pass: set temporary bill numbers to avoid uniqueness collisions
  for (let i = 0; i < sept3Orders.length; i++) {
    await Order.updateOne({ _id: sept3Orders[i]._id }, { $set: { billNo: `TEMP-${i + 1}` } });
  }

  // Second pass: set clean sequential HTB-001..HTB-0XX
  for (let i = 0; i < sept3Orders.length; i++) {
    const seqStr = `HTB-${(i + 1).toString().padStart(3, '0')}`;
    const ord = sept3Orders[i];
    await Order.updateOne({ _id: ord._id }, { $set: { billNo: seqStr } });
    console.log(`- ${seqStr} | Table ${ord.tableNo} | ${ord.customerName || 'Walk-in'} | Total: ₹${ord.grandTotal}`);
  }

  // Sync BillCounter for 2026-09-03 to sept3Orders.length
  await BillCounter.findOneAndUpdate(
    { businessDate: '2026-09-03' },
    { $set: { seq: sept3Orders.length, updatedAt: new Date() } },
    { upsert: true }
  );
  console.log(`Updated BillCounter for 2026-09-03 to seq: ${sept3Orders.length}`);

  // 3. Check 2026-09-04 (today)
  const todayOrders = await Order.find({
    businessDate: '2026-09-04',
    billNo: { $regex: /^HTB-/ }
  });
  console.log(`Today (2026-09-04) has ${todayOrders.length} finalized bills.`);
  if (todayOrders.length === 0) {
    // Ensure counter is reset or ready for 001
    await BillCounter.deleteOne({ businessDate: '2026-09-04' });
    console.log('BillCounter for 2026-09-04 is clean and will start at HTB-001 on first bill.');
  }

  console.log('Reconciliation complete.');
  process.exit(0);
}

run().catch(err => {
  console.error('Reconciliation error:', err);
  process.exit(1);
});
