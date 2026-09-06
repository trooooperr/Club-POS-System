/**
 * Cleanup script to remove stale drink/bar items from the `menuitems` collection.
 * In HUMTUM POS, all drinks are managed exclusively in `inventories`.
 * Stale duplicates (such as 'INDRI ' with trailing space at ₹6699) in `menuitems`
 * caused duplicate cards, wrong prices, and broken ordering in customer menus.
 */
const mongoose = require('mongoose');
require('dotenv').config();

async function cleanupStaleMenuItems() {
  const mongoUri = process.env.CLOUD_MONGO_URI;
  if (!mongoUri) {
    console.error('CLOUD_MONGO_URI not set');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  const db = mongoose.connection.db;

  const barCategories = [
    'BEER',
    'WHISKY',
    'VODKA',
    'LIQUEUR',
    'GIN',
    'CLASSIC SCOTCH',
    'SINGLE MALT',
    'SHOOTERS'
  ];

  const regexCats = barCategories.map(c => new RegExp(`^${c}$`, 'i'));

  const staleItems = await db.collection('menuitems').find({
    $or: [
      { category: { $in: regexCats } },
      { name: /indri/i },
      { name: /kingfisher/i },
      { name: /carlsberg/i },
      { name: /budwiser/i },
      { name: /tuborg/i }
    ]
  }).toArray();

  console.log(`Found ${staleItems.length} stale bar/drink items in menuitems collection.`);

  for (const item of staleItems) {
    console.log(`Deleting stale MenuItem: [${item._id}] "${item.name}" (Cat: ${item.category}, Price: ₹${item.price})`);
    await db.collection('menuitems').deleteOne({ _id: item._id });
  }

  console.log('All stale bar items successfully removed from menuitems collection.');

  // Clear Redis cache if redis is configured
  try {
    const { deleteCache } = require('../src/lib/redis');
    await deleteCache(['menu:all', 'inventory:all']);
    console.log('Redis menu & inventory cache invalidated.');
  } catch (err) {
    console.warn('Redis cache clear skipped:', err.message);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

cleanupStaleMenuItems().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
