const express = require('express');
const router = express.Router();
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const { requireRole } = require('../middleware/auth');

function getTodayIST() {
  const now = new Date();
  // Format as YYYY-MM-DD in Asia/Kolkata
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function getCurrentMonthIST() {
  return getTodayIST().slice(0, 7);
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

// GET /api/attendance/daily?date=YYYY-MM-DD
// Returns attendance for all staff on a specific date (defaults to present if unmarked, unless future date)
router.get('/daily', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const todayIST = getTodayIST();
    const queryDate = req.query.date ? String(req.query.date).trim() : todayIST;
    const isFutureDate = queryDate > todayIST;
    const workers = await Worker.find().sort({ name: 1 }).lean();
    const records = await Attendance.find({ date: queryDate }).lean();

    const recordMap = new Map();
    for (const r of records) {
      recordMap.set(r.workerId.toString(), r);
    }

    let presentCount = 0;
    let absentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;

    const list = workers.map(w => {
      const rec = recordMap.get(w._id.toString());
      // Default to "present" if no specific record exists and date is not in future
      const status = rec ? rec.status : (isFutureDate ? 'upcoming' : 'present');
      const note = rec ? (rec.note || '') : '';
      const markedBy = rec ? (rec.markedBy || '') : '';
      const isExplicit = !!rec;

      if (status === 'absent') absentCount++;
      else if (status === 'half-day') halfDayCount++;
      else if (status === 'leave') leaveCount++;
      else if (status === 'present') presentCount++;

      return {
        _id: rec ? rec._id : null,
        workerId: w._id,
        workerName: w.name,
        role: w.role || 'Staff',
        contact: w.contact || '',
        salary: w.salary || 0,
        status,
        note,
        markedBy,
        isExplicit,
        date: queryDate,
        isFutureDate
      };
    });

    res.json({
      success: true,
      date: queryDate,
      isFutureDate,
      summary: {
        total: workers.length,
        present: presentCount,
        absent: absentCount,
        halfDay: halfDayCount,
        leave: leaveCount
      },
      attendance: list
    });
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/attendance/mark
// Mark or update attendance for a staff member (Admin / Manager)
router.post('/mark', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { workerId, date, status, note } = req.body;
    if (!workerId) {
      return res.status(400).json({ success: false, message: 'workerId is required' });
    }

    const todayIST = getTodayIST();
    const targetDate = date ? String(date).trim() : todayIST;
    if (targetDate > todayIST) {
      return res.status(400).json({ success: false, message: 'Cannot mark attendance for future dates' });
    }

    const worker = await Worker.findById(workerId);
    if (!worker) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }

    const targetMonth = targetDate.slice(0, 7);
    const validStatus = ['present', 'absent', 'half-day', 'leave'].includes(status) ? status : 'present';
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    const markedBy = req.user?.username || req.user?.name || 'admin';

    // If marked present and without note, we can delete the absence record or upsert present
    const updated = await Attendance.findOneAndUpdate(
      { workerId: worker._id, date: targetDate },
      {
        workerId: worker._id,
        workerName: worker.name,
        date: targetDate,
        month: targetMonth,
        status: validStatus,
        note: cleanNote,
        markedBy
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      attendance: updated,
      message: `Marked ${worker.name} as ${validStatus}`
    });
  } catch (error) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/attendance/monthly?month=YYYY-MM
// Detailed monthly breakdown with all staff members, present/absent days, and complete absence details
router.get('/monthly', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const currentMonthIST = getCurrentMonthIST();
    const queryMonth = req.query.month ? String(req.query.month).trim() : currentMonthIST;
    const [yearStr, monthStr] = queryMonth.split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const monthIndex = (parseInt(monthStr, 10) || (new Date().getMonth() + 1)) - 1;

    const totalDaysInMonth = getDaysInMonth(year, monthIndex);
    const todayIST = getTodayIST();
    const isCurrentMonth = queryMonth === currentMonthIST;
    const isFutureMonth = queryMonth > currentMonthIST;

    let elapsedDays = 0;
    if (isFutureMonth) {
      elapsedDays = 0;
    } else if (isCurrentMonth) {
      const currentDayIST = parseInt(todayIST.split('-')[2], 10);
      elapsedDays = Math.min(totalDaysInMonth, Math.max(0, currentDayIST));
    } else {
      elapsedDays = totalDaysInMonth;
    }

    const workers = await Worker.find().sort({ name: 1 }).lean();
    const records = await Attendance.find({ month: queryMonth }).sort({ date: 1 }).lean();

    // Group records by worker
    const recordsByWorker = new Map();
    for (const r of records) {
      const wid = r.workerId.toString();
      if (!recordsByWorker.has(wid)) recordsByWorker.set(wid, []);
      recordsByWorker.get(wid).push(r);
    }

    let totalAbsencesAll = 0;
    let totalPresentDaysAll = 0;

    const staffSummary = workers.map(w => {
      const wRecords = recordsByWorker.get(w._id.toString()) || [];
      const absences = wRecords.filter(r => r.status === 'absent');
      const leaves = wRecords.filter(r => r.status === 'leave');
      const halfDays = wRecords.filter(r => r.status === 'half-day');

      const absentCount = absences.length;
      const leaveCount = leaves.length;
      const halfDayCount = halfDays.length;

      // Unrecorded days are treated as present for past and elapsed days!
      const totalNonPresent = absentCount + leaveCount + (halfDayCount * 0.5);
      const presentDays = isFutureMonth ? 0 : Math.max(0, parseFloat((elapsedDays - totalNonPresent).toFixed(1)));
      const attendanceRate = elapsedDays > 0 ? Math.round((presentDays / elapsedDays) * 100) : 0;

      totalAbsencesAll += absentCount;
      totalPresentDaysAll += presentDays;

      // Full details of all days this staff member was absent or on leave
      const absenceDetails = wRecords
        .filter(r => r.status !== 'present')
        .map(r => {
          const d = new Date(r.date + 'T00:00:00Z');
          const dayName = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
          return {
            _id: r._id,
            date: r.date,
            dayName,
            status: r.status,
            note: r.note || 'No reason provided',
            markedBy: r.markedBy || 'System',
            updatedAt: r.updatedAt
          };
        });

      return {
        workerId: w._id,
        name: w.name,
        role: w.role || 'Staff',
        contact: w.contact || '',
        salary: w.salary || 0,
        joiningDate: w.joiningDate,
        totalDays: elapsedDays,
        presentDays,
        absentDays: absentCount,
        halfDays: halfDayCount,
        leaveDays: leaveCount,
        attendanceRate,
        absenceDetails
      };
    });

    const totalStaff = workers.length;
    const avgAttendanceRate = (totalStaff > 0 && elapsedDays > 0)
      ? Math.round((totalPresentDaysAll / (totalStaff * elapsedDays)) * 100)
      : 100;

    res.json({
      success: true,
      month: queryMonth,
      totalDaysInMonth,
      elapsedDays,
      isCurrentMonth,
      overallStats: {
        totalStaff,
        totalAbsences: totalAbsencesAll,
        avgAttendanceRate,
        totalWorkingDays: elapsedDays
      },
      staff: staffSummary
    });
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
