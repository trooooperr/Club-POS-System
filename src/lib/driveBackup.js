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

module.exports = { uploadBackupFile, cleanOldBackups };

