/**
 * sync.js
 * ─────────────────────────────────────────────────────────────────
 * Timestamp-Guarded Multi-Device Sync Endpoint for HUMTUM POS.
 * 
 * Implements Last-Write-Wins (LWW) conflict resolution and
 * sequential counter catch-up for offline actions.
 * ─────────────────────────────────────────────────────────────────
 */

const express = require('express');
const router = express.Router();
const MenuItem = require('../models/MenuItem');
const Expense = require('../models/Expense');
const Attendance = require('../models/Attendance');
const Inventory = require('../models/Inventory');
const Worker = require('../models/Worker');
const Settings = require('../models/Settings');
const BillCounter = require('../models/BillCounter');
const KotCounter = require('../models/KotCounter');

router.post('/batch', async (req, res) => {
  try {
    const { deviceId, mutations } = req.body;
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return res.json({ success: true, processed: 0, skipped: 0, results: [] });
    }

    const results = [];
    let processed = 0;
    let skipped = 0;

    for (const mut of mutations) {
      const { id, entity, action, targetId, payload, clientTimestamp } = mut;
      const clientDate = clientTimestamp ? new Date(clientTimestamp) : new Date();

      try {
        switch (entity) {
          // ── MENU ITEM ───────────────────────────────────────────
          case 'menu': {
            if (action === 'create') {
              const existing = payload.name ? await MenuItem.findOne({ name: payload.name.trim() }) : null;
              if (existing) {
                // If existing, update only if clientTimestamp is newer
                if (clientDate >= (existing.updatedAt || new Date(0))) {
                  Object.assign(existing, payload);
                  await existing.save();
                  processed++;
                } else {
                  skipped++;
                }
              } else {
                const item = new MenuItem(payload);
                await item.save();
                processed++;
              }
            } else if (action === 'update' && targetId) {
              const item = await MenuItem.findById(targetId);
              if (item) {
                if (clientDate >= (item.updatedAt || new Date(0))) {
                  Object.assign(item, payload);
                  await item.save();
                  processed++;
                } else {
                  skipped++;
                }
              }
            } else if (action === 'delete' && targetId) {
              await MenuItem.findByIdAndDelete(targetId);
              processed++;
            }
            break;
          }

          // ── EXPENSE ─────────────────────────────────────────────
          case 'expense': {
            if (action === 'create') {
              const offlineSyncId = payload.offlineSyncId || id;
              const existing = await Expense.findOne({ offlineSyncId });
              if (!existing) {
                const exp = new Expense({
                  ...payload,
                  offlineSyncId,
                  date: payload.date ? new Date(payload.date) : clientDate
                });
                await exp.save();
                processed++;
              } else {
                skipped++;
              }
            } else if (action === 'update' && targetId) {
              const exp = await Expense.findById(targetId);
              if (exp && clientDate >= (exp.updatedAt || new Date(0))) {
                Object.assign(exp, payload);
                await exp.save();
                processed++;
              } else {
                skipped++;
              }
            } else if (action === 'delete' && targetId) {
              await Expense.findByIdAndDelete(targetId);
              processed++;
            }
            break;
          }

          // ── ATTENDANCE ──────────────────────────────────────────
          case 'attendance': {
            if (payload && payload.workerId && payload.date) {
              let existing = await Attendance.findOne({
                workerId: payload.workerId,
                date: payload.date
              });
              if (existing) {
                if (clientDate >= (existing.updatedAt || new Date(0))) {
                  existing.status = payload.status || existing.status;
                  if (payload.overtimeHours !== undefined) existing.overtimeHours = payload.overtimeHours;
                  if (payload.note !== undefined) existing.note = payload.note;
                  await existing.save();
                  processed++;
                } else {
                  skipped++;
                }
              } else {
                const att = new Attendance(payload);
                await att.save();
                processed++;
              }
            }
            break;
          }

          // ── INVENTORY ───────────────────────────────────────────
          case 'inventory': {
            if (action === 'adjust_stock' && targetId && typeof payload.delta === 'number') {
              // Delta adjustment is cumulative across devices
              await Inventory.findByIdAndUpdate(targetId, {
                $inc: { stock: payload.delta }
              });
              processed++;
            } else if (action === 'update' && targetId) {
              const inv = await Inventory.findById(targetId);
              if (inv && clientDate >= (inv.updatedAt || new Date(0))) {
                Object.assign(inv, payload);
                await inv.save();
                processed++;
              } else {
                skipped++;
              }
            } else if (action === 'create') {
              const inv = new Inventory(payload);
              await inv.save();
              processed++;
            }
            break;
          }

          // ── WORKER ──────────────────────────────────────────────
          case 'worker': {
            if (action === 'create') {
              const w = new Worker(payload);
              await w.save();
              processed++;
            } else if (action === 'update' && targetId) {
              const w = await Worker.findById(targetId);
              if (w && clientDate >= (w.updatedAt || new Date(0))) {
                Object.assign(w, payload);
                await w.save();
                processed++;
              } else {
                skipped++;
              }
            }
            break;
          }

          // ── SETTINGS ────────────────────────────────────────────
          case 'settings': {
            let s = await Settings.findOne();
            if (!s) s = new Settings();
            if (clientDate >= (s.updatedAt || new Date(0))) {
              Object.assign(s, payload);
              await s.save();
              processed++;
            } else {
              skipped++;
            }
            break;
          }

          default:
            skipped++;
        }
        results.push({ id, status: 'synced' });
      } catch (err) {
        console.error(`Error processing sync mutation for ${entity}:`, err);
        results.push({ id, status: 'error', message: err.message });
      }
    }

    // Broadcast socket event so other active screens update immediately
    if (req.app.locals.io) {
      req.app.locals.io.emit('BATCH_SYNC_COMPLETED', { deviceId, processed });
    }

    res.json({ success: true, processed, skipped, results });
  } catch (err) {
    console.error('Batch sync endpoint failure:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── COUNTER CATCH-UP ENDPOINT ─────────────────────────────────────
// Allows the offline client to inform the server of the highest local sequential counters
router.post('/counter-catchup', async (req, res) => {
  try {
    const { businessDate, maxBillSeq, maxKotSeq } = req.body;
    const dateStr = businessDate || new Date().toISOString().slice(0, 10);

    let updatedBillSeq = null;
    let updatedKotSeq = null;

    if (typeof maxBillSeq === 'number' && maxBillSeq > 0) {
      const counter = await BillCounter.findOneAndUpdate(
        { businessDate: dateStr },
        [
          {
            $set: {
              seq: { $max: [{ $ifNull: ['$seq', 0] }, maxBillSeq] },
              updatedAt: new Date()
            }
          }
        ],
        { upsert: true, new: true }
      );
      updatedBillSeq = counter.seq;
    }

    if (typeof maxKotSeq === 'number' && maxKotSeq > 0) {
      const counter = await KotCounter.findOneAndUpdate(
        { businessDate: dateStr },
        [
          {
            $set: {
              seq: { $max: [{ $ifNull: ['$seq', 0] }, maxKotSeq] },
              updatedAt: new Date()
            }
          }
        ],
        { upsert: true, new: true }
      );
      updatedKotSeq = counter.seq;
    }

    res.json({ success: true, updatedBillSeq, updatedKotSeq });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
