/**
 * backup-db.js
 * ─────────────────────────────────────────────────────────────────
 * HumTum MongoDB → Google Drive backup script.
 *
 * What it does:
 *   1. Connects to both MongoDB clusters (POS + Website)
 *   2. Exports every collection as a JSON file
 *   3. Compresses all files into a single .tar.gz archive
 *   4. Uploads the archive to Google Drive
 *   5. Cleans up temporary local files
 *
 * Can be run manually:
 *   node scripts/backup-db.js
 *
 * Or automatically via the cron inside server.js (daily 5:00 AM IST).
 * ─────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const fs       = require('fs');
const path     = require('path');
const zlib     = require('zlib');
const tar      = require('tar');
const { uploadBackupFile } = require('../src/lib/driveBackup');

// ── Config ───────────────────────────────────────────────────────
const DATABASES = [
  {
    name : 'humtum_pos',
    uri  : process.env.CLOUD_MONGO_URI,
    label: 'POS Backend (humtumbar)',
  },
  {
    name : 'humtum_website',
    uri  : process.env.MONGODB_URI || process.env.WEBSITE_MONGO_URI,
    label: 'Website (cluster0)',
  },
].filter(db => db.uri); // skip if URI not defined

const TMP_DIR   = path.join(__dirname, '../.backup_tmp');
const DATE_STR  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // e.g. 2026-10-12T05-00-00
const TAR_NAME  = `humtum_backup_${DATE_STR}.tar.gz`;
const TAR_PATH  = path.join(TMP_DIR, TAR_NAME);
const FOLDER_LABEL = DATE_STR.slice(0, 10); // "2026-10-12" — used as Drive sub-folder name

/**
 * Exports all collections from a mongoose connection into individual JSON files
 * inside `outDir/dbName/`.
 *
 * @param {string} uri     - MongoDB connection URI
 * @param {string} dbName  - friendly name (used for folder & file naming)
 * @param {string} outDir  - parent directory to write files into
 */
async function exportDatabase(uri, dbName, outDir) {
  console.log(`\n🔌 Connecting to ${dbName}...`);
  const conn = await mongoose.createConnection(uri).asPromise();

  const dbDir = path.join(outDir, dbName);
  fs.mkdirSync(dbDir, { recursive: true });

  const collections = await conn.db.listCollections().toArray();
  console.log(`   Found ${collections.length} collections in ${dbName}`);

  for (const colMeta of collections) {
    const colName = colMeta.name;
    const docs    = await conn.db.collection(colName).find({}).toArray();
    const outFile = path.join(dbDir, `${colName}.json`);
    fs.writeFileSync(outFile, JSON.stringify(docs, null, 2), 'utf8');
    console.log(`   ✅ ${colName}: ${docs.length} documents → ${colName}.json`);
  }

  await conn.close();
  console.log(`   🔒 Closed connection to ${dbName}`);
}

/**
 * Creates a .tar.gz archive from the contents of `srcDir`.
 *
 * @param {string} srcDir   - directory to compress
 * @param {string} destFile - output .tar.gz path
 */
async function createArchive(srcDir, destFile) {
  console.log(`\n📦 Compressing backup to ${path.basename(destFile)}...`);
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
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n🧹 Cleaned up temporary files.`);
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
    console.error('❌ No database URIs configured. Check CLOUD_MONGO_URI and MONGODB_URI in .env');
    return { success: false, error: 'No database URIs' };
  }

  // 1. Prepare tmp directory
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const exportDir = path.join(TMP_DIR, 'export');
  fs.mkdirSync(exportDir, { recursive: true });

  try {
    // 2. Export each database
    for (const db of DATABASES) {
      console.log(`\n📂 Backing up: ${db.label}`);
      await exportDatabase(db.uri, db.name, exportDir);
    }

    // 3. Create archive
    await createArchive(exportDir, TAR_PATH);

    // 4. Upload to Google Drive
    console.log(`\n☁️  Uploading to Google Drive (folder: HumTum_DB_Backups/${FOLDER_LABEL})...`);
    // Drive sub-folder: "HumTum_DB_Backups" → "2026-10-12"
    // Note: ensureFolder in driveBackup.js creates nesting under GOOGLE_DRIVE_BACKUP_FOLDER_ID
    const driveFileId = await uploadBackupFile(TAR_PATH, FOLDER_LABEL);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Backup complete in ${elapsed}s → Drive file ID: ${driveFileId}`);
    console.log(`${'═'.repeat(55)}\n`);

    return { success: true, driveFileId, elapsed };
  } catch (err) {
    console.error(`\n❌ Backup FAILED: ${err.message}`);
    console.error(err.stack);
    return { success: false, error: err.message };
  } finally {
    cleanup(TMP_DIR);
  }
}

// ── Run directly (node scripts/backup-db.js) ─────────────────────
if (require.main === module) {
  runBackup()
    .then(result => {
      process.exitCode = result.success ? 0 : 1;
    })
    .catch(err => {
      console.error(err);
      process.exitCode = 1;
    });
}

module.exports = { runBackup };
