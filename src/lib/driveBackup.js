/**
 * driveBackup.js
 * ─────────────────────────────────────────────────────────────────
 * Google Drive upload helper — uses OAuth2 (user credentials).
 * This allows uploading to YOUR personal Google Drive (cafeteriahumtum@gmail.com).
 *
 * One-time setup:
 *   1. Create an OAuth2 client in Google Cloud Console (Desktop app type)
 *   2. Add GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET to .env
 *   3. Run: node scripts/setup-drive-auth.js
 *      → Opens browser → you approve → refresh token saved to .env automatically
 * ─────────────────────────────────────────────────────────────────
 */

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CLIENT_ID     = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
const FOLDER_ID     = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || null;
const REDIRECT_URI  = 'http://localhost:3001/oauth/callback';

/**
 * Returns an authenticated Google Drive client using OAuth2 user credentials.
 */
function getDriveClient() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'Missing GOOGLE_OAUTH_CLIENT_ID or GOOGLE_OAUTH_CLIENT_SECRET in .env\n' +
      'Run: node scripts/setup-drive-auth.js'
    );
  }
  if (!REFRESH_TOKEN) {
    throw new Error(
      'Missing GOOGLE_OAUTH_REFRESH_TOKEN in .env\n' +
      'Run: node scripts/setup-drive-auth.js  (one-time browser authorization)'
    );
  }

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Ensures a sub-folder named `folderName` exists inside GOOGLE_DRIVE_BACKUP_FOLDER_ID.
 * Returns the sub-folder ID.
 *
 * @param {object} drive
 * @param {string} folderName - e.g. "2026-10-14"
 * @returns {Promise<string>}
 */
async function ensureFolder(drive, folderName) {
  const q = FOLDER_ID
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${FOLDER_ID}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({ q, fields: 'files(id, name)', spaces: 'drive' });

  if (res.data.files.length > 0) return res.data.files[0].id;

  const meta = { name: folderName, mimeType: 'application/vnd.google-apps.folder' };
  if (FOLDER_ID) meta.parents = [FOLDER_ID];

  const folder = await drive.files.create({ resource: meta, fields: 'id' });
  return folder.data.id;
}

/**
 * Deletes backup sub-folders inside GOOGLE_DRIVE_BACKUP_FOLDER_ID older than retentionDays.
 * Folder names follow the format "YYYY-MM-DD".
 *
 * @param {object} drive
 * @param {number} retentionDays
 */
async function cleanOldBackups(drive, retentionDays = 30) {
  if (!FOLDER_ID) return;

  try {
    const q = `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
    const res = await drive.files.list({
      q,
      fields: 'files(id, name, createdTime)',
      pageSize: 100,
      spaces: 'drive',
    });

    const folders = res.data.files || [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10); // "YYYY-MM-DD"

    for (const folder of folders) {
      // Check if folder name is a date "YYYY-MM-DD"
      if (/^\d{4}-\d{2}-\d{2}$/.test(folder.name)) {
        if (folder.name < cutoffStr) {
          console.log(`🗑️  Pruning old backup folder: ${folder.name} (older than ${retentionDays} days)...`);
          await drive.files.delete({ fileId: folder.id });
          console.log(`   ✅ Deleted old folder: ${folder.name}`);
        }
      }
    }
  } catch (err) {
    console.warn(`⚠️  Warning during old backup cleanup: ${err.message}`);
  }
}

/**
 * Uploads a local file to Google Drive inside a dated sub-folder,
 * then cleans up any folders older than BACKUP_RETENTION_DAYS (default: 30 days).
 *
 * @param {string} localFilePath   - absolute path to the .tar.gz file
 * @param {string} driveFolderName - sub-folder name, e.g. "2026-10-14"
 * @returns {Promise<string>} - Drive file ID
 */
async function uploadBackupFile(localFilePath, driveFolderName) {
  const drive    = getDriveClient();
  const folderId = await ensureFolder(drive, driveFolderName);
  const fileName = path.basename(localFilePath);

  const res = await drive.files.create({
    resource : { name: fileName, parents: [folderId] },
    media    : { mimeType: 'application/gzip', body: fs.createReadStream(localFilePath) },
    fields   : 'id, name, webViewLink',
  });

  console.log(`☁️  Uploaded: ${res.data.name}`);
  if (res.data.webViewLink) console.log(`   View: ${res.data.webViewLink}`);

  // Automatically clean up backup folders older than retention period (default: 1825 days / 5 years)
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS, 10) || 1825;
  await cleanOldBackups(drive, retentionDays);

  return res.data.id;
}

/**
 * Finds and downloads the latest backup archive (.tar.gz) from Google Drive.
 * Returns { filePath, fileName, folderName, fileId }.
 */
async function downloadLatestBackup() {
  const drive = getDriveClient();
  if (!FOLDER_ID) throw new Error('GOOGLE_DRIVE_BACKUP_FOLDER_ID is not configured in .env');

  // List all dated subfolders, newest first
  const folderRes = await drive.files.list({
    q: `'${FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name, createdTime)',
    orderBy: 'name desc',
    pageSize: 15,
    spaces: 'drive',
  });

  const folders = (folderRes.data.files || []).filter(f => /^\d{4}-\d{2}-\d{2}/.test(f.name));
  if (folders.length === 0) {
    throw new Error('No backup folders found in your Google Drive');
  }

  // Find the first .tar.gz in the most recent folder
  for (const folder of folders) {
    const fileRes = await drive.files.list({
      q: `'${folder.id}' in parents and trashed=false and name contains '.tar.gz'`,
      fields: 'files(id, name, size, createdTime)',
      orderBy: 'createdTime desc',
      pageSize: 15,
      spaces: 'drive',
    });

    // Exclude safety snapshots so restore always picks true scheduled/instant backups
    const candidateFiles = (fileRes.data.files || []).filter(f => !f.name.startsWith('PRE_RESTORE_SAFETY_SNAPSHOT'));
    const backupFile = candidateFiles[0];
    if (backupFile) {
      console.log(`📥 Downloading genuine scheduled backup from Google Drive: ${folder.name}/${backupFile.name}`);
      const tmpPath = path.join(os.tmpdir(), `latest_download_${Date.now()}_${backupFile.name}`);
      const dest = fs.createWriteStream(tmpPath);

      const streamRes = await drive.files.get(
        { fileId: backupFile.id, alt: 'media' },
        { responseType: 'stream' }
      );

      await new Promise((resolve, reject) => {
        streamRes.data
          .pipe(dest)
          .on('finish', resolve)
          .on('error', reject);
      });

      return {
        filePath: tmpPath,
        fileName: backupFile.name,
        folderName: folder.name,
        fileId: backupFile.id,
      };
    }
  }

  throw new Error('No .tar.gz backup files found in Google Drive');
}

module.exports = { uploadBackupFile, cleanOldBackups, downloadLatestBackup };

