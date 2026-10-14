const express = require('express');
const router = express.Router();
const { deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const { runBackup, createBackupArchive, cleanup } = require('../../scripts/backup-db');

// CLEAR CACHE ENDPOINT (Admin only)
router.post('/clear-cache', requireRole('admin'), async (req, res) => {
  try {
    await deleteCache(['menu:all', 'inventory:all', 'workers:all', 'settings:current', 'orders:all']);
    res.json({ success: true, message: 'All caches cleared successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// TRIGGER BACKUP TO GOOGLE DRIVE (Admin & Manager)
router.post('/backup/trigger', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    console.log(`🗄️ Backup triggered manually by user: ${req.user?.username || 'admin'}`);
    const result = await runBackup();
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error });
    }
    res.json({
      success: true,
      message: 'Backup created and uploaded to Google Drive successfully!',
      driveFileId: result.driveFileId,
      webViewLink: result.webViewLink,
      elapsed: result.elapsed,
      folderLabel: result.folderLabel,
    });
  } catch (err) {
    console.error('Manual backup error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DOWNLOAD FRESH BACKUP ARCHIVE DIRECTLY (Admin & Manager)
router.get('/backup/download', requireRole(['admin', 'manager']), async (req, res) => {
  let context = null;
  try {
    console.log(`📥 Direct backup download requested by: ${req.user?.username || 'admin'}`);
    context = await createBackupArchive();
    const { tarPath, tarName, tmpDir } = context;

    res.download(tarPath, tarName, (err) => {
      cleanup(tmpDir);
      if (err && !res.headersSent) {
        console.error('Error sending backup file:', err);
        res.status(500).json({ error: 'Failed to download backup file' });
      }
    });
  } catch (err) {
    if (context && context.tmpDir) cleanup(context.tmpDir);
    console.error('Backup download error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// SYNC MONGODB WITH LATEST BACKUP FROM GOOGLE DRIVE (Admin & Manager)
router.post('/backup/restore-latest', requireRole(['admin', 'manager']), async (req, res) => {
  let downloaded = null;
  try {
    console.log(`🔄 Restore/sync from latest backup initiated by: ${req.user?.username || 'admin'}`);
    const { downloadLatestBackup } = require('../lib/driveBackup');
    const { restoreFromArchive } = require('../../scripts/restore-db');
    const { runBackup } = require('../../scripts/backup-db');

    // 1. Download target backup from Drive first (before any database modifications)
    downloaded = await downloadLatestBackup();

    // 2. Automatically create a pre-restore safety snapshot of the live database
    console.log('🛡️ Creating pre-restore safety snapshot in Google Drive...');
    try {
      await runBackup();
    } catch (preErr) {
      console.warn('⚠️ Pre-restore safety backup encountered an issue:', preErr.message);
    }

    // 3. Restore the target archive into MongoDB
    const result = await restoreFromArchive(downloaded.filePath, process.env.CLOUD_MONGO_URI, false);

    // Clear caches so the app immediately reflects restored data
    await deleteCache(['menu:all', 'inventory:all', 'workers:all', 'settings:current', 'orders:all']);

    res.json({
      success: true,
      message: `MongoDB successfully synced with latest backup (${downloaded.fileName} from ${downloaded.folderName})! A safety snapshot of your previous database was also uploaded to Google Drive.`,
      fileName: downloaded.fileName,
      folderName: downloaded.folderName,
      restoredCollections: result.restoredCollections,
    });
  } catch (err) {
    console.error('Error during database sync from latest backup:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (downloaded && downloaded.filePath && fs.existsSync(downloaded.filePath)) {
      try { fs.unlinkSync(downloaded.filePath); } catch (e) {}
    }
  }
});

module.exports = router;
