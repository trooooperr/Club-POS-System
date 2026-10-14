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
 * Generates local export files and compresses them into a tar.gz archive.
 * Returns { tmpDir, tarPath, tarName, folderLabel, elapsed }.
 * Caller is responsible for calling cleanup(tmpDir) if not using runBackup().
 */
async function createBackupArchive() {
  const startTime = Date.now();

  if (DATABASES.length === 0) {
    throw new Error('No database URIs configured. Check CLOUD_MONGO_URI in .env');
  }

  const dateStr     = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const tmpDir      = path.join(os.tmpdir(), `humtum_backup_${dateStr}_${process.pid}`);
  const tarName     = `humtum_pos_backup_${dateStr}.tar.gz`;
  const tarPath     = path.join(tmpDir, tarName);
  const folderLabel = dateStr.slice(0, 10);

  fs.mkdirSync(tmpDir, { recursive: true });
  const exportDir = path.join(tmpDir, 'export');
  fs.mkdirSync(exportDir, { recursive: true });

  for (const db of DATABASES) {
    console.log(`\n📂 Backing up: ${db.label}`);
    await exportDatabase(db.uri, db.name, exportDir);
  }

  await createArchive(exportDir, tarPath);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  return { tmpDir, tarPath, tarName, folderLabel, elapsed };
}

/**
 * Main backup routine — called by cron, API, or CLI.
 */
async function runBackup() {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  🗄️  HumTum DB Backup — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  console.log(`${'═'.repeat(55)}`);

  let backupContext = null;

  try {
    backupContext = await createBackupArchive();
    const { tmpDir, tarPath, folderLabel, elapsed } = backupContext;

    console.log(`\n☁️  Uploading to Google Drive → HumTum_DB_Backups/${folderLabel}...`);
    const driveResult = await uploadBackupFile(tarPath, folderLabel);
    const driveFileId = typeof driveResult === 'object' ? driveResult.id : driveResult;
    const webViewLink = typeof driveResult === 'object' ? driveResult.webViewLink : `https://drive.google.com/file/d/${driveFileId}/view`;

    console.log(`\n✅ Backup complete in ${elapsed}s`);
    console.log(`   Drive file ID: ${driveFileId}`);
    console.log(`${'═'.repeat(55)}\n`);

    return { success: true, driveFileId, webViewLink, elapsed, folderLabel };

  } catch (err) {
    console.error(`\n❌ Backup FAILED: ${err.message}`);
    console.error(err.stack);
    return { success: false, error: err.message };
  } finally {
    if (backupContext && backupContext.tmpDir) {
      cleanup(backupContext.tmpDir);
    }
  }
}

// ── Run directly: node scripts/backup-db.js ───────────────────────
if (require.main === module) {
  runBackup()
    .then(result => { process.exitCode = result.success ? 0 : 1; })
    .catch(err   => { console.error(err); process.exitCode = 1; });
}

module.exports = { runBackup, createBackupArchive, cleanup };
