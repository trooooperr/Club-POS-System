/**
 * backup-db.js
 * ─────────────────────────────────────────────────────────────────
 * HumTum MongoDB → Google Drive backup script.
 *
 * What it does:
 *   1. Connects to both MongoDB clusters (POS + Website)
 *   2. Exports every collection as JSON (streamed in batches — no RAM blow-up)
 *   3. Compresses all files into a single .tar.gz archive
 *   4. Uploads the archive to Google Drive
 *   5. Cleans up temporary local files
 *
 * Run manually:  node scripts/backup-db.js
 * Auto-runs via cron in server.js (daily 5:30 AM IST)
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const tar      = require('tar');
const os       = require('os');
const { uploadBackupFile } = require('../src/lib/driveBackup');

// ── Config ───────────────────────────────────────────────────────
const DATABASES = [
  {
    name : 'humtum_pos',
    uri  : process.env.CLOUD_MONGO_URI,
    label: 'POS Backend (humtumbar)',
  },
  // Website DB excluded — uses a separate MongoDB instance
].filter(db => db.uri);

const BATCH_SIZE   = 200;  // docs per write flush — keeps memory usage low

// Mongoose connection options — prevent hanging on slow Atlas connections
const CONN_OPTIONS = {
  serverSelectionTimeoutMS : 30000,  // 30s to find server
  socketTimeoutMS          : 120000, // 2 min per query
  connectTimeoutMS         : 30000,
};

/**
 * Exports all collections from a MongoDB connection into individual JSON files
 * inside `outDir/dbName/` — using a streaming cursor to avoid OOM on large collections.
 */
async function exportDatabase(uri, dbName, outDir) {
  console.log(`\n🔌 Connecting to ${dbName}...`);
  const conn = await mongoose.createConnection(uri, CONN_OPTIONS).asPromise();

  const dbDir = path.join(outDir, dbName);
  fs.mkdirSync(dbDir, { recursive: true });

  const collections = await conn.db.listCollections().toArray();
  console.log(`   Found ${collections.length} collections in ${dbName}`);

  for (const colMeta of collections) {
    const colName = colMeta.name;
    const outFile = path.join(dbDir, `${colName}.json`);
    const stream  = fs.createWriteStream(outFile, { encoding: 'utf8' });

    stream.write('[\n');

    const cursor  = conn.db.collection(colName).find({}).batchSize(BATCH_SIZE);
    let   count   = 0;
    let   first   = true;

    for await (const doc of cursor) {
      if (!first) stream.write(',\n');
      stream.write(JSON.stringify(doc));
      first = false;
      count++;
    }

    stream.write('\n]\n');
    await new Promise((resolve, reject) => stream.end(err => err ? reject(err) : resolve()));

    console.log(`   ✅ ${colName}: ${count} docs → ${colName}.json`);
  }

  await conn.close();
  console.log(`   🔒 Closed connection to ${dbName}`);
}

/**
 * Creates a .tar.gz archive from the contents of `srcDir`.
 */
async function createArchive(srcDir, destFile) {
  console.log(`\n📦 Compressing backup → ${path.basename(destFile)}...`);
  await tar.c(
    { gzip: true, file: destFile, cwd: srcDir },
    fs.readdirSync(srcDir)
  );
  const sizeMB = (fs.statSync(destFile).size / 1024 / 1024).toFixed(2);
  console.log(`   Archive size: ${sizeMB} MB`);
}

/**
 * Removes the temporary directory after upload.
 */
function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`\n🧹 Cleaned up temporary files.`);
  } catch (e) {
    console.warn(`⚠️  Cleanup warning: ${e.message}`);
  }
}

/**
 * Main backup routine — called by cron or directly.
 */
async function runBackup() {
  const startTime = Date.now();
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  🗄️  HumTum DB Backup — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`${'═'.repeat(55)}`);

  if (DATABASES.length === 0) {
    console.error('❌ No database URIs configured. Check CLOUD_MONGO_URI / MONGODB_URI in .env');
    return { success: false, error: 'No database URIs' };
  }

  const dateStr     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmpDir      = path.join(os.tmpdir(), `humtum_backup_${dateStr}_${process.pid}`);
  const tarName     = `humtum_pos_backup_${dateStr}.tar.gz`;
  const tarPath     = path.join(tmpDir, tarName);
  const folderLabel = dateStr.slice(0, 10); // "2026-10-14" — Drive sub-folder name

  // Prepare tmp directories
  fs.mkdirSync(tmpDir, { recursive: true });
  const exportDir = path.join(tmpDir, 'export');
  fs.mkdirSync(exportDir, { recursive: true });

  try {
    // 1. Export each database
    for (const db of DATABASES) {
      console.log(`\n📂 Backing up: ${db.label}`);
      await exportDatabase(db.uri, db.name, exportDir);
    }

    // 2. Compress
    await createArchive(exportDir, tarPath);

    // 3. Upload to Google Drive
    console.log(`\n☁️  Uploading to Google Drive → HumTum_DB_Backups/${folderLabel}...`);
    const driveFileId = await uploadBackupFile(tarPath, folderLabel);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Backup complete in ${elapsed}s`);
    console.log(`   Drive file ID: ${driveFileId}`);
    console.log(`${'═'.repeat(55)}\n`);

    return { success: true, driveFileId, elapsed };

  } catch (err) {
    console.error(`\n❌ Backup FAILED: ${err.message}`);
    console.error(err.stack);
    return { success: false, error: err.message };
  } finally {
    cleanup(tmpDir);
  }
}

// ── Run directly: node scripts/backup-db.js ───────────────────────
if (require.main === module) {
  runBackup()
    .then(result => { process.exitCode = result.success ? 0 : 1; })
    .catch(err   => { console.error(err); process.exitCode = 1; });
}

module.exports = { runBackup };
