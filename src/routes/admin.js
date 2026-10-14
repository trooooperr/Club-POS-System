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

module.exports = router;
