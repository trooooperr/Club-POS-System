/**
 * driveBackup.js
 * ─────────────────────────────────────────────────────────────────
 * Google Drive upload helper for HumTum DB backups.
 *
 * Prerequisites (one-time setup):
 *   1. Go to https://console.cloud.google.com → Create a project
 *   2. Enable "Google Drive API"
 *   3. Create a Service Account → download JSON key → save as
 *      keys/google-service-account.json
 *   4. Share a Google Drive folder with the service account email
 *      (found inside the JSON key as "client_email")
 *   5. Copy that folder's ID into .env as GOOGLE_DRIVE_BACKUP_FOLDER_ID
 * ─────────────────────────────────────────────────────────────────
 */

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');

const KEY_PATH    = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH
  || path.join(__dirname, '../../keys/google-service-account.json');
const FOLDER_ID   = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID || null;
const SCOPES      = ['https://www.googleapis.com/auth/drive.file'];

/**
 * Returns an authenticated Google Drive client.
 */
function getDriveClient() {
  if (!fs.existsSync(KEY_PATH)) {
    throw new Error(
      `Google Service Account key not found at: ${KEY_PATH}\n` +
      `See comments in src/lib/driveBackup.js for setup instructions.`
    );
  }
  const auth = new google.auth.GoogleAuth({
    keyFile : KEY_PATH,
    scopes  : SCOPES,
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Ensures a folder named `folderName` exists inside GOOGLE_DRIVE_BACKUP_FOLDER_ID.
 * Returns the sub-folder ID. If GOOGLE_DRIVE_BACKUP_FOLDER_ID is not set,
 * the folder is created in the service account's root (then share it with yourself).
 *
 * @param {object} drive - authenticated Drive client
 * @param {string} folderName
 * @returns {Promise<string>} folderId
 */
async function ensureFolder(drive, folderName) {
  const q = FOLDER_ID
    ? `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${FOLDER_ID}' in parents and trashed=false`
    : `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const res = await drive.files.list({
    q,
    fields : 'files(id, name)',
    spaces : 'drive',
  });

  if (res.data.files.length > 0) {
    return res.data.files[0].id;
  }

  // Create it
  const meta = {
    name     : folderName,
    mimeType : 'application/vnd.google-apps.folder',
  };
  if (FOLDER_ID) meta.parents = [FOLDER_ID];

  const folder = await drive.files.create({ resource: meta, fields: 'id' });
  return folder.data.id;
}

/**
 * Uploads a local file to a specific Google Drive folder.
 *
 * @param {string} localFilePath  - absolute path to the file to upload
 * @param {string} driveFolderName - name of sub-folder inside backup root (e.g. "2026-10-12")
 * @returns {Promise<string>} - the Drive file ID
 */
async function uploadBackupFile(localFilePath, driveFolderName) {
  const drive     = getDriveClient();
  const folderId  = await ensureFolder(drive, driveFolderName);
  const fileName  = path.basename(localFilePath);
  const mimeType  = 'application/gzip';

  const res = await drive.files.create({
    resource : { name: fileName, parents: [folderId] },
    media    : { mimeType, body: fs.createReadStream(localFilePath) },
    fields   : 'id, name, webViewLink',
  });

  console.log(`☁️  Uploaded to Drive: ${res.data.name} → ${res.data.webViewLink}`);
  return res.data.id;
}

module.exports = { uploadBackupFile };
