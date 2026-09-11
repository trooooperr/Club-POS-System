const express = require('express');
const Worker = require('../models/Worker');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { getCache, setCache, deleteCache } = require('../lib/redis');
const { requireRole } = require('../middleware/auth');
const router = express.Router();

const WORKERS_CACHE_KEY = 'workers:all';

/**
 * Calculates the cycle start date based on the worker's joining date.
 * Every month on the joining date day, the worker's monthly cycle starts and advance resets.
 */
function getWorkerCycleStartDate(joiningDate, now = new Date()) {
  const jd = new Date(joiningDate || Date.now());
  const joinDay = jd.getDate(); // 1 - 31
  const curYear = now.getFullYear();
  const curMonth = now.getMonth(); // 0 - 11
  const curDate = now.getDate();

  let cycleYear = curYear;
  let cycleMonth = curMonth;

  if (curDate < joinDay) {
    cycleMonth = curMonth - 1;
    if (cycleMonth < 0) {
      cycleMonth = 11;
      cycleYear = curYear - 1;
    }
  }

  const maxDaysInCycleMonth = new Date(cycleYear, cycleMonth + 1, 0).getDate();
  const effectiveDay = Math.min(joinDay, maxDaysInCycleMonth);

  return new Date(cycleYear, cycleMonth, effectiveDay, 0, 0, 0, 0);
}

// GET workers list (computes advance taken this month, resets on joining date)
router.get('/', async (req, res) => {
  try {
    const workers = await Worker.find().sort({ name: 1 }).populate('userId', 'isActive role username');
    const now = new Date();

    const workerIds = workers.map(w => w._id);
    const thirtyFiveDaysAgo = new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000);
    const recentTransactions = await Transaction.find({
      workerId: { $in: workerIds },
      date: { $gte: thirtyFiveDaysAgo }
    }).lean();

    const txMap = new Map();
    for (const tx of recentTransactions) {
      const wid = tx.workerId.toString();
      if (!txMap.has(wid)) txMap.set(wid, []);
      txMap.get(wid).push(tx);
    }

    const list = workers.map(w => {
      const cycleStart = getWorkerCycleStartDate(w.joiningDate, now);
      const wTxs = txMap.get(w._id.toString()) || [];
      const cycleTxs = wTxs.filter(t => new Date(t.date) >= cycleStart && t.type === 'Payment');

      let advanceThisMonth = 0;
      if (cycleTxs.length > 0) {
        advanceThisMonth = cycleTxs.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      } else {
        const lastUpdated = w.updatedAt ? new Date(w.updatedAt) : new Date(w.createdAt || 0);
        if (lastUpdated >= cycleStart) {
          advanceThisMonth = parseFloat(w.advance !== undefined ? w.advance : w.paidSalary) || 0;
        } else {
          // Reset advance on joining date
          advanceThisMonth = 0;
        }
      }

      const wObj = w.toObject ? w.toObject() : { ...w };
      wObj.advance = advanceThisMonth;
      wObj.paidSalary = advanceThisMonth;
      wObj.cycleStartDate = cycleStart;
      return wObj;
    });

    res.json(list);
  }
  catch (err) { res.status(500).json({ message: err.message }); }
});

// GET worker salary/payment history (Admin/Manager only)
router.get('/:id/history', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const history = await Transaction.find({ workerId: req.params.id }).sort({ date: -1 });
    res.json(history);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// CREATE worker (Admin/Manager only)
router.post(
  '/',
  requireRole(['admin', 'manager']),
  (req, res, next) => {
    const { name, role, salary } = req.body;
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ message: 'Valid worker name is required.' });
    }
    if (salary != null && (isNaN(salary) || Number(salary) < 0)) {
      return res.status(400).json({ message: 'Salary must be a non-negative number.' });
    }
    next();
  },
  async (req, res) => {
    try {
    const workerData = req.body;
    // --- AUTO LOGIN ACCOUNT LOGIC ---
    let userId = null;
    try {
      const username = workerData.name.toLowerCase().replace(/\s+/g, '');
      
      let user = await User.findOne({ 
        $or: [
          { username: username }, 
          { email: (workerData.email && workerData.email.length > 0) ? workerData.email : undefined }
        ]
      });
      
      if (!user) {
        user = new User({
          name: workerData.name,
          username,
          passwordHash: 'staff123',
          role: workerData.role?.toLowerCase().includes('manager') ? 'manager' : 'staff',
          email: (workerData.email && workerData.email.length > 0) ? workerData.email : undefined
        });
        await user.save();
      } else {
        // Sync email if provided
        if (workerData.email && (!user.email || user.email === '')) {
          user.email = workerData.email;
          await user.save();
        }
      }
      userId = user._id;
    } catch (e) {
      console.error('Auto-account creation failed:', e.message);
    }

    const worker = new Worker({ ...workerData, userId });
    const savedWorker = await worker.save();

    if (parseFloat(workerData.paidSalary) > 0) {
      await new Transaction({
        workerId: savedWorker._id,
        workerName: savedWorker.name,
        amount: parseFloat(req.body.paidSalary),
        type: 'Payment'
      }).save();
    }
    await deleteCache(WORKERS_CACHE_KEY);

    const savedObj = savedWorker.toObject ? savedWorker.toObject() : { ...savedWorker };
    const initialAdvance = parseFloat(workerData.paidSalary) || 0;
    savedObj.advance = initialAdvance;
    savedObj.paidSalary = initialAdvance;
    savedObj.cycleStartDate = getWorkerCycleStartDate(savedWorker.joiningDate, new Date());
    res.status(201).json(savedObj);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// UPDATE worker (Admin/Manager only)
router.put(
  '/:id',
  requireRole(['admin', 'manager']),
  (req, res, next) => {
    const { name, salary } = req.body;
    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return res.status(400).json({ message: 'Worker name cannot be empty.' });
    }
    if (salary != null && (isNaN(salary) || Number(salary) < 0)) {
      return res.status(400).json({ message: 'Salary must be a non-negative number.' });
    }
    next();
  },
  async (req, res) => {
    try {
    const oldWorker = await Worker.findById(req.params.id);
    if (!oldWorker) return res.status(404).json({ message: 'Worker not found' });
    const newTotalPaid = parseFloat(req.body.paidSalary) || 0;
    const addedAmount = newTotalPaid - oldWorker.paidSalary;

    const updated = await Worker.findByIdAndUpdate(req.params.id, req.body, { 
      new: true, 
      runValidators: true 
    });

    if (addedAmount > 0) {
      await new Transaction({
        workerId: updated._id,
        workerName: updated.name,
        amount: addedAmount,
        type: 'Payment'
      }).save();
    }

    // --- SYNC WITH USER ACCOUNT ---
    try {
      if (updated.userId) {
        const user = await User.findById(updated.userId);
        if (user) {
          if (req.body.name) user.name = req.body.name;
          if (req.body.email) user.email = req.body.email;
          else if (req.body.email === '') user.email = undefined; // Support clearing email
          if (req.body.role) {
            user.role = req.body.role.toLowerCase().includes('manager') ? 'manager' : 'staff';
          }
          await user.save();
        }
      } else if (req.body.role) {
        // AUTO-ACTIVATION for roles that need login
        const username = updated.name.toLowerCase().replace(/\s+/g, '');
        const newUser = new User({
          name: updated.name,
          username,
          passwordHash: 'staff123',
          role: req.body.role.toLowerCase().includes('manager') ? 'manager' : 'staff',
          email: (updated.email && updated.email.length > 0) ? updated.email : undefined
        });
        await newUser.save();
        updated.userId = newUser._id;
        await updated.save();
      }
    } catch (e) {
      console.error('User sync failed:', e.message);
    }

    await deleteCache(WORKERS_CACHE_KEY);

    const now = new Date();
    const cycleStart = getWorkerCycleStartDate(updated.joiningDate, now);
    const recentTransactions = await Transaction.find({
      workerId: updated._id,
      date: { $gte: cycleStart },
      type: 'Payment'
    });
    const cycleAdvance = recentTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const updatedObj = updated.toObject ? updated.toObject() : { ...updated };
    updatedObj.advance = cycleAdvance;
    updatedObj.paidSalary = cycleAdvance;
    updatedObj.cycleStartDate = cycleStart;

    res.json(updatedObj);
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// DELETE worker (Admin/Manager only)
router.delete('/:id', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ message: 'Worker not found' });
    
    // Cleanup transactions
    await Transaction.deleteMany({ workerId: req.params.id });
    
    // Delete worker record
    await Worker.findByIdAndDelete(req.params.id);

    await deleteCache(WORKERS_CACHE_KEY);
    res.json({ success: true, id: req.params.id }); 
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
