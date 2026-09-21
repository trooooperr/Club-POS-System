const express = require('express');
const router = express.Router();
const Worker = require('../models/Worker');
const Attendance = require('../models/Attendance');
const ClosedDay = require('../models/ClosedDay');
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
// Returns attendance for all staff on a specific date (defaults to present if unmarked, unless future date or closed day)
router.get('/daily', requireRole(['admin', 'manager', 'staff']), async (req, res) => {
  try {
    const todayIST = getTodayIST();
    const queryDate = req.query.date ? String(req.query.date).trim() : todayIST;
    const isFutureDate = queryDate > todayIST;
    const workers = await Worker.find().sort({ name: 1 }).lean();
    const records = await Attendance.find({ date: queryDate }).lean();
    const closedDay = await ClosedDay.findOne({ date: queryDate }).lean();
    const isClosedDay = !!closedDay;

    const recordMap = new Map();
    for (const r of records) {
      recordMap.set(r.workerId.toString(), r);
    }

    let presentCount = 0;
    let absentCount = 0;
    let halfDayCount = 0;
    let leaveCount = 0;
    let totalOvertimeHours = 0;

    const list = workers.map(w => {
      const rec = recordMap.get(w._id.toString());
      const overtimeHours = rec ? (Number(rec.overtimeHours) || 0) : 0;
      const note = rec ? (rec.note || '') : '';
      const markedBy = rec ? (rec.markedBy || '') : '';
      const isExplicit = !!rec;

      // Status logic: if restaurant closed, staff status is 'closed'
      let status;
      if (isClosedDay) {
        status = 'closed';
      } else {
        status = rec ? rec.status : (isFutureDate ? 'upcoming' : 'present');
      }

      if (!isClosedDay) {
        if (status === 'absent') absentCount++;
        else if (status === 'half-day') halfDayCount++;
        else if (status === 'leave') leaveCount++;
        else if (status === 'present' || status === 'overtime') presentCount++;
      }

      totalOvertimeHours += overtimeHours;

      return {
        _id: rec ? rec._id : null,
        workerId: w._id,
        workerName: w.name,
        role: w.role || 'Staff',
        contact: w.contact || '',
        salary: w.salary || 0,
        status,
        overtimeHours,
        note,
        markedBy,
        isExplicit,
        date: queryDate,
        isFutureDate,
        isClosedDay
      };
    });

    res.json({
      success: true,
      date: queryDate,
      isFutureDate,
      isClosedDay,
      closedDay: closedDay ? { date: closedDay.date, reason: closedDay.reason, markedBy: closedDay.markedBy } : null,
      summary: {
        total: workers.length,
        isClosedDay,
        closedReason: closedDay?.reason || '',
        present: isClosedDay ? 0 : presentCount,
        absent: isClosedDay ? 0 : absentCount,
        halfDay: isClosedDay ? 0 : halfDayCount,
        leave: isClosedDay ? 0 : leaveCount,
        totalOvertime: totalOvertimeHours
      },
      attendance: list
    });
  } catch (error) {
    console.error('Error fetching daily attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/attendance/closed-day
// Mark or reopen a restaurant closed day (Admin / Manager)
router.post('/closed-day', requireRole(['admin', 'manager']), async (req, res) => {
  try {
    const { date, isClosed, reason } = req.body;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ success: false, message: 'Valid date (YYYY-MM-DD) is required' });
    }

    const targetDate = date.trim();
    const targetMonth = targetDate.slice(0, 7);
    const markedBy = req.user?.username || req.user?.name || 'admin';

    // If isClosed is explicitly false, reopen / remove closed day
    if (isClosed === false) {
      await ClosedDay.findOneAndDelete({ date: targetDate });
      return res.json({
        success: true,
        isClosedDay: false,
        closedDay: null,
        message: `Restaurant marked OPEN on ${targetDate}`
      });
    }

    // Otherwise mark as closed
    const cleanReason = (typeof reason === 'string' && reason.trim()) ? reason.trim() : 'Restaurant Closed';
    const closedRecord = await ClosedDay.findOneAndUpdate(
      { date: targetDate },
      {
        date: targetDate,
        month: targetMonth,
        reason: cleanReason,
        markedBy
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      isClosedDay: true,
      closedDay: {
        date: closedRecord.date,
        reason: closedRecord.reason,
        markedBy: closedRecord.markedBy
      },
      message: `Restaurant marked CLOSED on ${targetDate} (${cleanReason})`
    });
  } catch (error) {
    console.error('Error updating closed day:', error);
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
    const validStatus = ['present', 'absent', 'half-day', 'leave', 'overtime'].includes(status) ? status : 'present';
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    const cleanOvertime = req.body.overtimeHours !== undefined 
      ? Math.max(0, parseFloat(req.body.overtimeHours) || 0) 
      : (req.body.overtime !== undefined ? Math.max(0, parseFloat(req.body.overtime) || 0) : 0);
    const markedBy = req.user?.username || req.user?.name || 'admin';

    // Update or upsert attendance record with overtime
    const updated = await Attendance.findOneAndUpdate(
      { workerId: worker._id, date: targetDate },
      {
        workerId: worker._id,
        workerName: worker.name,
        date: targetDate,
        month: targetMonth,
        status: validStatus,
        overtimeHours: cleanOvertime,
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
// Active working days exclude restaurant closed days!
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

    // Fetch closed days in this month
    const closedDays = await ClosedDay.find({ month: queryMonth }).sort({ date: 1 }).lean();
    const closedDatesSet = new Set(closedDays.map(c => c.date));
    const totalClosedDaysInMonth = closedDays.length;

    let elapsedClosedDays = 0;
    if (!isFutureMonth) {
      for (const cd of closedDays) {
        if (isCurrentMonth) {
          if (cd.date <= todayIST) elapsedClosedDays++;
        } else {
          elapsedClosedDays++;
        }
      }
    }

    // Active working days strictly exclude closed days!
    const activeDays = Math.max(0, elapsedDays - elapsedClosedDays);
    const totalActiveDaysInMonth = Math.max(0, totalDaysInMonth - totalClosedDaysInMonth);

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
    let totalOvertimeAll = 0;

    const staffSummary = workers.map(w => {
      const wRecords = recordsByWorker.get(w._id.toString()) || [];
      // Records on closed days should not penalize staff as absences
      const activeRecords = wRecords.filter(r => !closedDatesSet.has(r.date));
      const absences = activeRecords.filter(r => r.status === 'absent');
      const leaves = activeRecords.filter(r => r.status === 'leave');
      const halfDays = activeRecords.filter(r => r.status === 'half-day');

      const absentCount = absences.length;
      const leaveCount = leaves.length;
      const halfDayCount = halfDays.length;
      const totalOvertimeHours = wRecords.reduce((sum, r) => sum + (Number(r.overtimeHours) || 0), 0);

      // Unrecorded days are treated as present ONLY on active working days!
      const totalNonPresent = absentCount + leaveCount + (halfDayCount * 0.5);
      const presentDays = isFutureMonth ? 0 : Math.max(0, parseFloat((activeDays - totalNonPresent).toFixed(1)));
      const attendanceRate = activeDays > 0 ? Math.round((presentDays / activeDays) * 100) : (isFutureMonth ? 0 : 100);

      totalAbsencesAll += absentCount;
      totalPresentDaysAll += presentDays;
      totalOvertimeAll += totalOvertimeHours;

      // Full details of all days this staff member was absent, on leave, or worked overtime
      const absenceDetails = wRecords
        .filter(r => r.status !== 'present' || (r.overtimeHours || 0) > 0)
        .map(r => {
          const d = new Date(r.date + 'T00:00:00Z');
          const dayName = d.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' });
          const isDateClosed = closedDatesSet.has(r.date);
          return {
            _id: r._id,
            date: r.date,
            dayName,
            status: r.status,
            overtimeHours: r.overtimeHours || 0,
            isClosedDay: isDateClosed,
            note: r.note || (r.overtimeHours > 0 ? `Overtime: ${r.overtimeHours} hrs` : 'No reason provided'),
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
        totalDays: activeDays, // Active working days (excluding closed days)
        calendarDays: elapsedDays,
        presentDays,
        absentDays: absentCount,
        halfDays: halfDayCount,
        leaveDays: leaveCount,
        totalOvertimeHours,
        attendanceRate,
        absenceDetails
      };
    });

    const totalStaff = workers.length;
    const avgAttendanceRate = (totalStaff > 0 && activeDays > 0)
      ? Math.round((totalPresentDaysAll / (totalStaff * activeDays)) * 100)
      : 100;

    res.json({
      success: true,
      month: queryMonth,
      totalDaysInMonth,
      totalActiveDaysInMonth,
      elapsedDays,
      activeDays,
      totalClosedDays: totalClosedDaysInMonth,
      elapsedClosedDays,
      closedDays: closedDays.map(c => ({ date: c.date, reason: c.reason, markedBy: c.markedBy })),
      isCurrentMonth,
      overallStats: {
        totalStaff,
        totalAbsences: totalAbsencesAll,
        avgAttendanceRate,
        totalWorkingDays: activeDays,
        calendarDaysElapsed: elapsedDays,
        closedDaysCount: elapsedClosedDays,
        totalOvertimeHours: totalOvertimeAll
      },
      staff: staffSummary
    });
  } catch (error) {
    console.error('Error fetching monthly attendance:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
