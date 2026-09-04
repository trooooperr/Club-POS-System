const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
  await mongoose.connect(process.env.CLOUD_MONGO_URI);
  console.log('Connected to MongoDB');

  const Order = require('../src/models/Order');
  const BillCounter = require('../src/models/BillCounter');

  // 1. Move Ashwani Chaudhary (Table 6, ₹800) to 2026-09-04 as the first bill (HTB-001)
  const ashwani = await Order.findOne({ customerName: /Ashwani Chaudhary/i, grandTotal: 800 });
  if (ashwani) {
    console.log(`Moving Ashwani Chaudhary to 2026-09-04 as HTB-001 (was ${ashwani.billNo} on ${ashwani.businessDate})`);
    ashwani.businessDate = '2026-09-04';
    ashwani.date = new Date('2026-09-04T08:51:24.808Z');
    ashwani.billNo = 'HTB-001';
    await ashwani.save();

    await BillCounter.findOneAndUpdate(
      { businessDate: '2026-09-04' },
      { $set: { seq: 1, updatedAt: new Date() } },
      { upsert: true }
    );
    console.log('Set BillCounter for 2026-09-04 to seq: 1');
  }

  // 2. Separate manual due records on 2026-09-03 so they do not consume dining bill numbers
  const manualDues = await Order.find({
    businessDate: '2026-09-03',
    isManualDue: true
  }).sort({ createdAt: 1 });

  console.log(`Updating ${manualDues.length} manual due records on 2026-09-03 to HTB-D... format:`);
  for (let i = 0; i < manualDues.length; i++) {
    const dueBillNo = `HTB-D${(i + 1).toString().padStart(2, '0')}`;
    await Order.updateOne({ _id: manualDues[i]._id }, { $set: { billNo: dueBillNo } });
    console.log(`- ${dueBillNo} | ${manualDues[i].customerName} | ₹${manualDues[i].grandTotal}`);
  }

  // 3. Re-sequence regular dining orders on 2026-09-03 starting from HTB-001
  const diningOrders = await Order.find({
    businessDate: '2026-09-03',
    isManualDue: { $ne: true },
    isActive: false
  }).sort({ inventoryFinalizedAt: 1, date: 1, createdAt: 1 });

  console.log(`Re-sequencing ${diningOrders.length} dining orders on 2026-09-03 from HTB-001:`);

  // Step A: temporary bills to avoid conflicts
  for (let i = 0; i < diningOrders.length; i++) {
    await Order.updateOne({ _id: diningOrders[i]._id }, { $set: { billNo: `TEMP-${i + 1}` } });
  }

  // Step B: clean HTB-001..HTB-0XX
  for (let i = 0; i < diningOrders.length; i++) {
    const seqStr = `HTB-${(i + 1).toString().padStart(3, '0')}`;
    const ord = diningOrders[i];
    await Order.updateOne({ _id: ord._id }, { $set: { billNo: seqStr } });
    console.log(`- ${seqStr} | Table ${ord.tableNo} | ${ord.customerName || 'Walk-in'} | ₹${ord.grandTotal}`);
  }

  // Set BillCounter for 2026-09-03 to diningOrders.length
  await BillCounter.findOneAndUpdate(
    { businessDate: '2026-09-03' },
    { $set: { seq: diningOrders.length, updatedAt: new Date() } },
    { upsert: true }
  );
  console.log(`Updated BillCounter for 2026-09-03 to seq: ${diningOrders.length}`);

  // 4. Invalidate Redis cache
  try {
    const { deleteCache } = require('../src/lib/redis');
    await deleteCache(['orders:all', 'reports:daily-summary']);
    console.log('Redis cache cleared.');
  } catch (e) {
    console.log('Cache clear skipped:', e.message);
  }

  console.log('Done!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
