/**
 * restore-db.js
 * ─────────────────────────────────────────────────────────────────
 * HumTum Database Restoration Script
 *
 * Restores collections from a backup archive (.tar.gz) or extracted folder
 * back into MongoDB (Cloud or Local).
 *
 * Usage:
 *   1. Download the .tar.gz file from Google Drive (e.g. into downloads or project folder)
 *   2. Run:
 *      node scripts/restore-db.js ./humtum_pos_backup_XXXX.tar.gz
 *
 * Options:
 *   --drop     Wipe existing collections before restoring (clean overwrite)
 *   --local    Restore into LOCAL_MONGO_URI instead of CLOUD_MONGO_URI
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const os       = require('os');
const tar      = require('tar');

const BATCH_SIZE = 500;

async function restoreCollection(db, colName, filePath, shouldDrop) {
  if (!fs.existsSync(filePath)) return;

  const rawData = fs.readFileSync(filePath, 'utf8');
  let docs = [];
  try {
    docs = JSON.parse(rawData);
  } catch (err) {
    console.error(`   ❌ Failed to parse ${path.basename(filePath)}: ${err.message}`);
    return;
  }

  if (!Array.isArray(docs) || docs.length === 0) {
    console.log(`   ℹ️  ${colName}: 0 documents in backup (skipped)`);
    return;
  }

  const collection = db.collection(colName);

  if (shouldDrop) {
    try {
      await collection.drop();
      console.log(`   🗑️  Dropped existing collection: ${colName}`);
    } catch (e) {
      // Collection may not exist yet, safe to ignore
    }
  }

  // Restore in batches using bulk upsert to prevent duplicate key errors
  let restoredCount = 0;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const chunk = docs.slice(i, i + BATCH_SIZE);
    const operations = chunk.map(doc => {
      // Re-hydrate MongoDB ObjectIds and Dates if they were stored as string forms
      if (doc._id && typeof doc._id === 'string' && /^[0-9a-fA-F]{24}$/.test(doc._id)) {
        doc._id = new mongoose.Types.ObjectId(doc._id);
      }
      return {
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        }
      };
    });

    await collection.bulkWrite(operations, { ordered: false });
    restoredCount += chunk.length;
  }

  console.log(`   ✅ ${colName}: Restored ${restoredCount} documents`);
  return restoredCount;
}

/**
 * Programmatic restore from archive file (.tar.gz) or directory
 */
async function restoreFromArchive(resolvedPath, targetUri = process.env.CLOUD_MONGO_URI, shouldDrop = false) {
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Backup file not found at: ${resolvedPath}`);
  }
  if (!targetUri) {
    throw new Error('Target MongoDB URI is missing');
  }

  let workDir = resolvedPath;
  let tempExtractDir = null;

  try {
    if (resolvedPath.endsWith('.tar.gz') || resolvedPath.endsWith('.tgz')) {
      tempExtractDir = path.join(os.tmpdir(), `humtum_restore_${Date.now()}`);
      fs.mkdirSync(tempExtractDir, { recursive: true });
      await tar.x({ file: resolvedPath, cwd: tempExtractDir });
      workDir = tempExtractDir;
    }

    let dbFolder = workDir;
    const subdirs = fs.readdirSync(workDir, { withFileTypes: true });
    const posDir = subdirs.find(d => d.isDirectory() && (d.name.includes('pos') || d.name === 'humtum_pos'));
    if (posDir) {
      dbFolder = path.join(workDir, posDir.name);
    }

    const jsonFiles = fs.readdirSync(dbFolder).filter(f => f.endsWith('.json'));
    if (jsonFiles.length === 0) {
      throw new Error(`No .json collection dumps found in ${dbFolder}`);
    }

    const conn = await mongoose.createConnection(targetUri).asPromise();
    const restoredCollections = [];

    for (const file of jsonFiles) {
      const colName = path.basename(file, '.json');
      const fullPath = path.join(dbFolder, file);
      const count = await restoreCollection(conn.db, colName, fullPath, shouldDrop);
      restoredCollections.push({ collection: colName, count });
    }

    await conn.close();
    return { success: true, restoredCollections, totalCollections: restoredCollections.length };
  } finally {
    if (tempExtractDir && fs.existsSync(tempExtractDir)) {
      try { fs.rmSync(tempExtractDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targetArg = args.find(a => !a.startsWith('--'));
  const shouldDrop = args.includes('--drop');
  const useLocal = args.includes('--local');

  if (!targetArg) {
    console.log(`\n❌ Please provide the path to your backup archive (.tar.gz) or extracted folder.`);
    console.log(`\nUsage:\n  node scripts/restore-db.js <path-to-backup.tar.gz> [--drop] [--local]\n`);
    console.log(`Example:\n  node scripts/restore-db.js ./humtum_pos_backup_2026-10-14.tar.gz\n`);
    process.exit(1);
  }

  const resolvedPath = path.resolve(targetArg);
  const targetUri = useLocal ? process.env.LOCAL_MONGO_URI : process.env.CLOUD_MONGO_URI;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🔄 HumTum Database Restoration Tool`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Target Database : ${useLocal ? 'LOCAL MongoDB' : 'CLOUD MongoDB (Atlas)'}`);
  console.log(`Backup Source   : ${resolvedPath}`);
  console.log(`Clean Overwrite : ${shouldDrop ? 'YES (--drop enabled)' : 'NO (safe upsert/merge)'}`);
  console.log(`${'═'.repeat(60)}\n`);

  await restoreFromArchive(resolvedPath, targetUri, shouldDrop);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🎉 RESTORATION COMPLETED SUCCESSFULLY!`);
  console.log(`${'═'.repeat(60)}\n`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ Restoration failed:', err);
    process.exit(1);
  });
}

module.exports = { restoreFromArchive, restoreCollection };

