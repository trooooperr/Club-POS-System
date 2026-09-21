import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { 
  Calendar, 
  CalendarDays, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Search, 
  UserCheck, 
  UserX, 
  FileText, 
  X,
  TrendingUp,
  Award,
  Filter,
  ArrowLeft,
  CalendarOff,
  Store,
  Unlock
} from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';

export default function AttendancePage() {
  const { showToast, role, setActiveSection } = useApp();
  const [activeTab, setActiveTab] = useState('daily'); // 'daily' | 'monthly'
  const dateInputRef = useRef(null);

  // Daily view state
  const getTodayStr = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [selectedDate, setSelectedDate] = useState(getTodayStr());
  const [dailyData, setDailyData] = useState({ summary: {}, attendance: [] });
  const [dailyLoading, setDailyLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Monthly view state
  const getCurrentMonthStr = () => getTodayStr().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr());
  const [monthlyData, setMonthlyData] = useState({ overallStats: {}, staff: [] });
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  // Attendance marking modal state (present, half-day, absent)
  const [markingModal, setMarkingModal] = useState({
    isOpen: false,
    worker: null,
    status: 'present',
    overtimeHours: '',
    note: '',
    submitting: false
  });

  // Staff absence history modal state (for detailed monthly breakdown)
  const [historyModal, setHistoryModal] = useState({
    isOpen: false,
    staff: null
  });

  // Closed day marking modal state
  const [closedDayModal, setClosedDayModal] = useState({
    isOpen: false,
    reason: 'Weekly Off',
    submitting: false
  });

  // Fetch Daily Attendance
  const fetchDailyAttendance = useCallback(async (date) => {
    setDailyLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/attendance/daily?date=${date}`));
      const data = await res.json();
      if (data.success) {
        setDailyData(data);
      } else {
        showToast(data.message || 'Failed to load daily attendance', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading attendance', 'error');
    } finally {
      setDailyLoading(false);
    }
  }, [showToast]);

  // Fetch Monthly Attendance
  const fetchMonthlyAttendance = useCallback(async (month) => {
    setMonthlyLoading(true);
    try {
      const res = await authFetch(apiUrl(`/api/attendance/monthly?month=${month}`));
      const data = await res.json();
      if (data.success) {
        setMonthlyData(data);
      } else {
        showToast(data.message || 'Failed to load monthly attendance', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Error loading monthly attendance', 'error');
    } finally {
      setMonthlyLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    const today = getTodayStr();
    if (selectedDate > today) {
      setSelectedDate(today);
      return;
    }
    const currentMonth = getCurrentMonthStr();
    if (selectedMonth > currentMonth) {
      setSelectedMonth(currentMonth);
      return;
    }
    if (activeTab === 'daily') {
      fetchDailyAttendance(selectedDate);
    } else {
      fetchMonthlyAttendance(selectedMonth);
    }
  }, [activeTab, selectedDate, selectedMonth, fetchDailyAttendance, fetchMonthlyAttendance]);

  // Daily navigation helpers
  const handleDateChange = (offset) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    const nextStr = d.toLocaleDateString('en-CA');
    const today = getTodayStr();
    if (offset > 0 && nextStr > today) return;
    setSelectedDate(nextStr);
  };

  // Monthly navigation helpers
  const handleMonthChange = (offset) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1 + offset, 1);
    const yStr = d.getFullYear();
    const mStr = String(d.getMonth() + 1).padStart(2, '0');
    const nextMonth = `${yStr}-${mStr}`;
    const currentMonth = getCurrentMonthStr();
    if (offset > 0 && nextMonth > currentMonth) return;
    setSelectedMonth(nextMonth);
  };

  // Global ESC / Enter key handler for modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (markingModal.isOpen) {
          e.preventDefault();
          setMarkingModal({ isOpen: false, worker: null, status: 'present', overtimeHours: '', note: '', submitting: false });
        } else if (historyModal.isOpen) {
          e.preventDefault();
          setHistoryModal({ isOpen: false, staff: null });
        } else if (closedDayModal.isOpen) {
          e.preventDefault();
          setClosedDayModal({ isOpen: false, reason: 'Weekly Off', submitting: false });
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [markingModal.isOpen, historyModal.isOpen, closedDayModal.isOpen]);

  // Mark or reopen restaurant closed day
  const handleToggleClosedDay = async (markClosed, reasonStr) => {
    setClosedDayModal(prev => ({ ...prev, submitting: true }));
    try {
      const res = await authFetch(apiUrl('/api/attendance/closed-day'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: selectedDate,
          isClosed: markClosed,
          reason: reasonStr || 'Restaurant Closed'
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        setClosedDayModal({ isOpen: false, reason: 'Weekly Off', submitting: false });
        fetchDailyAttendance(selectedDate);
      } else {
        showToast(data.message || 'Failed to update closed day', 'error');
        setClosedDayModal(prev => ({ ...prev, submitting: false }));
      }
    } catch (err) {
      showToast(err.message || 'Error updating closed day', 'error');
      setClosedDayModal(prev => ({ ...prev, submitting: false }));
    }
  };

  // Quick mark present
  const handleMarkPresent = async (worker) => {
    try {
      const res = await authFetch(apiUrl('/api/attendance/mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: worker.workerId || worker._id,
          date: selectedDate,
          status: 'present',
          overtimeHours: worker.overtimeHours || 0,
          note: ''
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Marked ${worker.workerName || worker.name} as Present`, 'success');
        fetchDailyAttendance(selectedDate);
      } else {
        showToast(data.message || 'Failed to update attendance', 'error');
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Submit attendance / overtime / absence from modal
  const handleSaveAbsence = async () => {
    if (!markingModal.worker) return;
    setMarkingModal(prev => ({ ...prev, submitting: true }));
    try {
      const otVal = parseFloat(markingModal.overtimeHours) || 0;
      const res = await authFetch(apiUrl('/api/attendance/mark'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerId: markingModal.worker.workerId || markingModal.worker._id,
          date: selectedDate,
          status: markingModal.status,
          overtimeHours: otVal,
          note: markingModal.note
        })
      });
      const data = await res.json();
      if (data.success) {
        const otMsg = otVal > 0 ? ` (+${otVal}h OT)` : '';
        showToast(`Saved attendance for ${markingModal.worker.workerName || markingModal.worker.name}: ${markingModal.status}${otMsg}`, 'success');
        setMarkingModal({ isOpen: false, worker: null, status: 'present', overtimeHours: '', note: '', submitting: false });
        fetchDailyAttendance(selectedDate);
      } else {
        showToast(data.message || 'Failed to update attendance', 'error');
        setMarkingModal(prev => ({ ...prev, submitting: false }));
      }
    } catch (err) {
      showToast(err.message, 'error');
      setMarkingModal(prev => ({ ...prev, submitting: false }));
    }
  };

  // Filtered daily staff
  const filteredDailyList = useMemo(() => {
    if (!dailyData.attendance) return [];
    if (!searchQuery.trim()) return dailyData.attendance;
    const q = searchQuery.toLowerCase().trim();
    return dailyData.attendance.filter(w => 
      (w.workerName || '').toLowerCase().includes(q) ||
      (w.role || '').toLowerCase().includes(q) ||
      (w.contact || '').includes(q)
    );
  }, [dailyData.attendance, searchQuery]);

  // Format month name (e.g. "September 2026")
  const formattedMonthName = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const d = new Date(year, month - 1, 1);
    return d.toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Format date display (e.g. "Friday, 11 Sep 2026")
  const formattedDateName = useMemo(() => {
    const d = new Date(selectedDate + 'T00:00:00');
    return d.toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }, [selectedDate]);

  return (
    <div className="fi attendance-page">
      
      {/* TAB SWITCHER */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ display: 'inline-flex', background: 'var(--s2)', padding: 3, borderRadius: 10, border: '1px solid var(--b1)' }}>
          <button
            onClick={() => setActiveTab('daily')}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: activeTab === 'daily' ? 'var(--a)' : 'transparent',
              color: activeTab === 'daily' ? '#000' : 'var(--t2)',
              transition: 'all 0.2s ease'
            }}
          >
            <Calendar size={14} /> Daily Attendance
          </button>
          <button
            onClick={() => setActiveTab('monthly')}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              border: 'none',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: activeTab === 'monthly' ? 'var(--a)' : 'transparent',
              color: activeTab === 'monthly' ? '#000' : 'var(--t2)',
              transition: 'all 0.2s ease'
            }}
          >
            <CalendarDays size={14} /> Monthly Report
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: DAILY ATTENDANCE
      ────────────────────────────────────────────────────────────── */}
      {activeTab === 'daily' && (
        <>
          {/* CLOSED DAY ALERT BANNER */}
          {dailyData.isClosedDay && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(185,28,28,0.06) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: 12,
              padding: '12px 18px',
              marginBottom: 14,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 38,
                  height: 38,
                  borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.2)',
                  color: '#ef4444',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <CalendarOff size={20} />
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    Restaurant is Marked CLOSED on this Day
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      background: 'var(--s1)',
                      color: 'var(--t0)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      padding: '2px 8px',
                      borderRadius: 6
                    }}>
                      {dailyData.closedDay?.reason || 'Restaurant Closed'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                    This day is <strong>excluded from active working days</strong>. Staff will not be penalized as absent in monthly reports.
                  </div>
                </div>
              </div>
              {(role === 'admin' || role === 'manager') && (
                <button
                  type="button"
                  onClick={() => handleToggleClosedDay(false)}
                  className="btn btn-sm"
                  style={{
                    background: 'var(--s1)',
                    border: '1px solid var(--b2)',
                    color: 'var(--t0)',
                    fontWeight: 700,
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer'
                  }}
                >
                  <Unlock size={14} /> Reopen Restaurant on this Day
                </button>
              )}
            </div>
          )}

          {/* DATE CONTROL & KPI SUMMARY */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            {/* Date selector card with Calendar Picker */}
            <div style={{ background: 'var(--s1)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--b1)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase' }}>Selected Date</span>
                {dailyData.isClosedDay ? (
                  <span style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: '#ef4444',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <CalendarOff size={11} /> CLOSED
                  </span>
                ) : (
                  <span style={{
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: '#22c55e',
                    background: 'rgba(34, 197, 94, 0.12)',
                    border: '1px solid rgba(34, 197, 94, 0.25)',
                    padding: '2px 8px',
                    borderRadius: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4
                  }}>
                    <Store size={11} /> OPEN
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                {/* Left arrow: Previous Day */}
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDateChange(-1);
                  }}
                  className="btn btn-ghost" 
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--b2)', background: 'var(--s2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  title="Previous Day"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Date Display Text */}
                <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--t0)', textAlign: 'center', flex: 1, userSelect: 'none' }}>
                  {formattedDateName}
                </div>

                {/* Dedicated Calendar Icon Button - ONLY opens calendar on click of this icon */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dateInputRef.current) {
                      if (typeof dateInputRef.current.showPicker === 'function') {
                        dateInputRef.current.showPicker();
                      } else {
                        dateInputRef.current.focus();
                      }
                    }
                  }}
                  className="btn btn-ghost"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--b2)',
                    background: 'var(--s2)',
                    color: 'var(--a)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer'
                  }}
                  title="Open Calendar Picker"
                >
                  <CalendarDays size={16} />
                </button>

                {/* Hidden native date input */}
                <input
                  ref={dateInputRef}
                  type="date"
                  value={selectedDate}
                  max={getTodayStr()}
                  onChange={e => {
                    const val = e.target.value;
                    if (val && val <= getTodayStr()) setSelectedDate(val);
                  }}
                  style={{
                    position: 'absolute',
                    opacity: 0,
                    pointerEvents: 'none',
                    width: 0,
                    height: 0
                  }}
                />

                {/* Right arrow: Next Day */}
                <button 
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDateChange(1);
                  }}
                  disabled={selectedDate >= getTodayStr()}
                  className="btn btn-ghost" 
                  style={{
                    padding: '6px 8px',
                    borderRadius: 6,
                    border: '1px solid var(--b2)',
                    background: 'var(--s2)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: selectedDate >= getTodayStr() ? 0.3 : 1,
                    cursor: selectedDate >= getTodayStr() ? 'not-allowed' : 'pointer'
                  }}
                  title={selectedDate >= getTodayStr() ? "Cannot select future dates" : "Next Day"}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Metric: Total Staff */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid var(--b1)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase' }}>Total Staff</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--t0)', marginTop: 4 }}>
                {dailyData.summary?.total ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Registered Members</div>
            </div>

            {/* Metric: Present Today / Day Status */}
            {dailyData.isClosedDay ? (
              <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CalendarOff size={14} /> Restaurant Status
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#f87171', marginTop: 4 }}>
                  CLOSED DAY
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                  {dailyData.closedDay?.reason || 'Restaurant off'}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <UserCheck size={14} /> Present Today
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#22c55e', marginTop: 4 }}>
                  {dailyData.summary?.present ?? 0}
                </div>
                <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Default status applied</div>
              </div>
            )}

            {/* Metric: Absent Today */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: dailyData.isClosedDay ? 'var(--t3)' : '#ef4444', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <UserX size={14} /> Absent Today
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: dailyData.isClosedDay ? 'var(--t2)' : '#ef4444', marginTop: 4 }}>
                {dailyData.isClosedDay ? 0 : (dailyData.summary?.absent ?? 0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>
                {dailyData.isClosedDay ? 'Not counted in active days' : 'Marked absent by manager'}
              </div>
            </div>

            {/* Metric: Overtime Today */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(6,182,212,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={14} /> Overtime Today
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#06b6d4', marginTop: 4 }}>
                {dailyData.summary?.totalOvertime ?? 0} <span style={{ fontSize: 14, fontWeight: 600 }}>hrs</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Extra working hours</div>
            </div>
          </div>

          {/* SEARCH & FILTER BAR WITH MARK CLOSED ACTION */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', minWidth: 260, flex: 1, maxWidth: 400 }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--t3)' }} />
              <input 
                type="text" 
                placeholder="Search staff name or role..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ 
                  width: '100%', 
                  padding: '9px 12px 9px 36px', 
                  borderRadius: 8, 
                  background: 'var(--s1)', 
                  border: '1px solid var(--b1)', 
                  color: 'var(--t0)', 
                  fontSize: 13 
                }}
              />
            </div>

            {(role === 'admin' || role === 'manager') && (
              dailyData.isClosedDay ? (
                <button
                  type="button"
                  onClick={() => handleToggleClosedDay(false)}
                  className="btn btn-sm"
                  style={{
                    background: 'var(--s2)',
                    border: '1px solid var(--b2)',
                    color: 'var(--t1)',
                    fontWeight: 700,
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                  title="Reopen restaurant on this day"
                >
                  <Unlock size={14} style={{ color: '#22c55e' }} /> Reopen Restaurant Day
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setClosedDayModal({ isOpen: true, reason: 'Weekly Off', submitting: false })}
                  className="btn btn-sm"
                  style={{
                    background: 'var(--s2)',
                    border: '1px solid var(--b2)',
                    color: 'var(--t1)',
                    fontWeight: 700,
                    fontSize: 12,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                  title="Mark this day as closed (excluded from active working days)"
                >
                  <CalendarOff size={14} style={{ color: '#ef4444' }} /> Mark Day as Closed
                </button>
              )
            )}
          </div>

          {/* DAILY ATTENDANCE TABLE */}
          <div style={{ background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden' }}>
            {dailyLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--t2)' }}>Loading attendance data...</div>
            ) : filteredDailyList.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--t2)' }}>
                No staff members found. Add staff members in the Staff page to begin tracking attendance.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b1)', color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '12px 16px' }}>Staff Name</th>
                      <th style={{ padding: '12px 16px' }}>Role</th>
                      <th style={{ padding: '12px 16px' }}>Contact</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Today's Status</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Overtime (Hrs)</th>
                      <th style={{ padding: '12px 16px' }}>Reason / Notes</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDailyList.map((worker) => {
                      const isClosed = dailyData.isClosedDay || worker.isClosedDay || worker.status === 'closed';
                      const isFuture = !isClosed && (selectedDate > getTodayStr() || worker.isFutureDate || worker.status === 'upcoming');
                      const isAbsent = !isClosed && !isFuture && worker.status === 'absent';
                      const isLeave = !isClosed && !isFuture && worker.status === 'leave';
                      const isHalfDay = !isClosed && !isFuture && worker.status === 'half-day';
                      const isOvertime = !isClosed && !isFuture && (worker.status === 'overtime' || (worker.overtimeHours > 0 && worker.status === 'present'));

                      return (
                        <tr key={worker.workerId} style={{ borderBottom: '1px solid var(--b0)', transition: 'background 0.15s' }}>
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--t0)' }}>
                            {worker.workerName}
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--t2)' }}>
                            <span style={{ background: 'var(--s2)', padding: '2px 8px', borderRadius: 6, fontSize: 11, border: '1px solid var(--b1)' }}>
                              {worker.role}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--t2)', fontFamily: 'monospace' }}>
                            {worker.contact || '—'}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            {isClosed ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                background: 'rgba(239,68,68,0.1)', 
                                color: '#f87171', 
                                padding: '4px 10px', 
                                borderRadius: 20, 
                                fontSize: 12, 
                                fontWeight: 800, 
                                border: '1px solid rgba(239,68,68,0.25)' 
                              }}>
                                <CalendarOff size={13} /> RESTAURANT CLOSED
                              </span>
                            ) : isFuture ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                background: 'var(--s2)', 
                                color: 'var(--t3)', 
                                padding: '4px 10px', 
                                borderRadius: 20, 
                                fontSize: 12, 
                                fontWeight: 700, 
                                border: '1px solid var(--b2)' 
                              }}>
                                <Clock size={13} /> UPCOMING
                              </span>
                            ) : isAbsent ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                background: 'rgba(239,68,68,0.15)', 
                                color: '#ef4444', 
                                padding: '4px 10px', 
                                borderRadius: 20, 
                                fontSize: 12, 
                                fontWeight: 800, 
                                border: '1px solid rgba(239,68,68,0.3)' 
                              }}>
                                <XCircle size={13} /> ABSENT
                              </span>
                            ) : isLeave ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                background: 'rgba(245,158,11,0.15)', 
                                color: '#f59e0b', 
                                padding: '4px 10px', 
                                borderRadius: 20, 
                                fontSize: 12, 
                                fontWeight: 800, 
                                border: '1px solid rgba(245,158,11,0.3)' 
                              }}>
                                <Clock size={13} /> ON LEAVE
                              </span>
                            ) : isHalfDay ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                background: 'rgba(245,158,11,0.15)', 
                                color: '#f59e0b', 
                                padding: '4px 10px', 
                                borderRadius: 20, 
                                fontSize: 12, 
                                fontWeight: 800, 
                                border: '1px solid rgba(245,158,11,0.3)' 
                              }}>
                                <Clock size={13} /> HALF DAY
                              </span>
                            ) : (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 4, 
                                background: 'rgba(34,197,94,0.15)', 
                                color: '#22c55e', 
                                padding: '4px 10px', 
                                borderRadius: 20, 
                                fontSize: 12, 
                                fontWeight: 800, 
                                border: '1px solid rgba(34,197,94,0.3)' 
                              }}>
                                <CheckCircle2 size={13} /> PRESENT
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            {worker.overtimeHours > 0 ? (
                              <span style={{ 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: 3, 
                                background: 'rgba(6,182,212,0.15)', 
                                color: '#06b6d4', 
                                padding: '3px 8px', 
                                borderRadius: 12, 
                                fontSize: 11.5, 
                                fontWeight: 800, 
                                border: '1px solid rgba(6,182,212,0.3)' 
                              }}>
                                <Clock size={12} /> {worker.overtimeHours} hrs
                              </span>
                            ) : (
                              <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--t2)', fontSize: 12 }}>
                            {worker.note ? (
                              <span>{worker.note}</span>
                            ) : isClosed ? (
                              <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>{dailyData.closedDay?.reason || 'Restaurant Off'}</span>
                            ) : isAbsent ? (
                              <span style={{ color: 'var(--t3)', fontStyle: 'italic' }}>No reason recorded</span>
                            ) : (
                              <span style={{ color: 'var(--t3)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            {isClosed ? (
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                <button
                                  type="button"
                                  onClick={() => setMarkingModal({ 
                                    isOpen: true, 
                                    worker, 
                                    status: 'present', 
                                    overtimeHours: worker.overtimeHours || '', 
                                    note: worker.note || '', 
                                    submitting: false 
                                  })}
                                  className="btn btn-sm btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: 11, color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.35)' }}
                                  title="Log overtime hours for this closed day"
                                >
                                  + OT
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMarkingModal({ 
                                    isOpen: true, 
                                    worker, 
                                    status: 'present', 
                                    overtimeHours: worker.overtimeHours || '', 
                                    note: worker.note || '', 
                                    submitting: false 
                                  })}
                                  className="btn btn-sm btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  title="Add note"
                                >
                                  Note
                                </button>
                              </div>
                            ) : isFuture ? (
                              <span style={{ fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>Upcoming date</span>
                            ) : (
                              <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                                {isAbsent || isLeave || isHalfDay ? (
                                  <button
                                    onClick={() => handleMarkPresent(worker)}
                                    className="btn btn-sm"
                                    style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid #22c55e', fontSize: 11 }}
                                    title="Change status back to Present"
                                  >
                                    Mark Present
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setMarkingModal({ isOpen: true, worker, status: 'absent', overtimeHours: worker.overtimeHours || '', note: '', submitting: false })}
                                    className="btn btn-sm btn-danger"
                                    style={{ fontSize: 11 }}
                                    title="Mark this staff member Absent for today"
                                  >
                                    Mark Absent
                                  </button>
                                )}

                                <button
                                  onClick={() => setMarkingModal({ 
                                    isOpen: true, 
                                    worker, 
                                    status: worker.status === 'absent' ? 'present' : (worker.status || 'present'), 
                                    overtimeHours: worker.overtimeHours || '', 
                                    note: worker.note || '', 
                                    submitting: false 
                                  })}
                                  className="btn btn-sm btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: 11, color: '#06b6d4', border: '1px solid rgba(6, 182, 212, 0.35)' }}
                                  title="Log or edit overtime hours"
                                >
                                  + OT
                                </button>

                                <button
                                  onClick={() => setMarkingModal({ 
                                    isOpen: true, 
                                    worker, 
                                    status: worker.status || 'absent', 
                                    overtimeHours: worker.overtimeHours || '', 
                                    note: worker.note || '', 
                                    submitting: false 
                                  })}
                                  className="btn btn-sm btn-ghost"
                                  style={{ padding: '4px 8px', fontSize: 11 }}
                                  title="Edit status or add note"
                                >
                                  Edit / Note
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: MONTHLY STAFF ATTENDANCE REPORT
      ────────────────────────────────────────────────────────────── */}
      {activeTab === 'monthly' && (
        <>
          {/* MONTH SELECTOR & MONTHLY KPI OVERVIEW */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
            {/* Month selector card */}
            <div style={{ background: 'var(--s1)', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--b1)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', marginBottom: 6 }}>
                Selected Month
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <button 
                  onClick={() => handleMonthChange(-1)} 
                  className="btn btn-ghost" 
                  style={{ padding: '6px 8px' }}
                  title="Previous Month"
                >
                  <ChevronLeft size={16} />
                </button>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--t0)', textAlign: 'center' }}>
                  {formattedMonthName}
                </div>
                <button 
                  onClick={() => handleMonthChange(1)} 
                  disabled={selectedMonth >= getCurrentMonthStr()}
                  className="btn btn-ghost" 
                  style={{
                    padding: '6px 8px',
                    opacity: selectedMonth >= getCurrentMonthStr() ? 0.3 : 1,
                    cursor: selectedMonth >= getCurrentMonthStr() ? 'not-allowed' : 'pointer'
                  }}
                  title={selectedMonth >= getCurrentMonthStr() ? "Cannot view future months" : "Next Month"}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Metric: Active Days */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid var(--b1)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase' }}>Active Days (MTD)</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--t0)', marginTop: 4 }}>
                {monthlyData.activeDays ?? monthlyData.elapsedDays ?? 0} <span style={{ fontSize: 14, color: 'var(--t3)', fontWeight: 500 }}>/ {monthlyData.totalActiveDaysInMonth ?? monthlyData.totalDaysInMonth ?? 30} days</span>
              </div>
              <div style={{ fontSize: 11, color: (monthlyData.elapsedClosedDays > 0 || monthlyData.totalClosedDays > 0) ? '#f59e0b' : 'var(--t3)', marginTop: 2 }}>
                {(monthlyData.elapsedClosedDays > 0 || monthlyData.totalClosedDays > 0)
                  ? `${monthlyData.elapsedClosedDays || monthlyData.totalClosedDays} closed day(s) excluded` 
                  : 'Days counted up to today'}
              </div>
            </div>

            {/* Metric: Average Attendance Rate */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(34,197,94,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <TrendingUp size={14} /> Team Attendance Rate
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#22c55e', marginTop: 4 }}>
                {monthlyData.overallStats?.avgAttendanceRate ?? 100}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Monthly average</div>
            </div>

            {/* Metric: Total Absences this month */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={14} /> Total Staff Absences
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#ef4444', marginTop: 4 }}>
                {monthlyData.overallStats?.totalAbsences ?? 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Across all members</div>
            </div>

            {/* Metric: Total Overtime this month */}
            <div style={{ background: 'var(--s1)', padding: '14px 18px', borderRadius: 12, border: '1px solid rgba(6,182,212,0.3)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Clock size={14} /> Total Overtime (MTD)
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#06b6d4', marginTop: 4 }}>
                {monthlyData.overallStats?.totalOvertimeHours ?? 0} <span style={{ fontSize: 14, fontWeight: 600 }}>hrs</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Monthly total extra hours</div>
            </div>
          </div>

          {/* MONTHLY CLOSED DAYS BANNER */}
          {monthlyData.closedDays && monthlyData.closedDays.length > 0 && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 10,
              padding: '10px 14px',
              marginBottom: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <CalendarOff size={16} style={{ color: '#ef4444' }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--t0)' }}>
                  {monthlyData.closedDays.length} Restaurant Closed {monthlyData.closedDays.length === 1 ? 'Day' : 'Days'} in {formattedMonthName}:
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {monthlyData.closedDays.map((cd, i) => (
                    <span key={i} style={{ fontSize: 11.5, background: 'var(--s1)', border: '1px solid var(--b2)', padding: '2px 8px', borderRadius: 6, color: 'var(--t1)' }}>
                      <strong>{cd.date.slice(8)}th</strong> ({cd.reason})
                    </span>
                  ))}
                </div>
              </div>
              <span style={{ fontSize: 11.5, color: '#f59e0b', fontWeight: 600 }}>
                Excluded from active working days
              </span>
            </div>
          )}

          {/* MONTHLY STAFF BREAKDOWN TABLE */}
          <div style={{ background: 'var(--s1)', borderRadius: 12, border: '1px solid var(--b1)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--b1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--t0)' }}>
                Monthly Staff Breakdown — {formattedMonthName}
              </h2>
              <span style={{ fontSize: 12, color: 'var(--t2)' }}>
                Active days exclude restaurant closed days. Click <strong>"View Absence / OT Log"</strong> for exact dates.
              </span>
            </div>

            {monthlyLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--t2)' }}>Loading monthly data...</div>
            ) : !monthlyData.staff || monthlyData.staff.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--t2)' }}>No records available for this month.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b1)', color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <th style={{ padding: '12px 16px' }}>Staff Name</th>
                      <th style={{ padding: '12px 16px' }}>Role</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Active Days</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Present</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Absent</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Leave / Half-Day</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Overtime (Hrs)</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center' }}>Attendance %</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Log Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.staff.map(s => {
                      const hasAbsencesOrOT = s.absenceDetails && s.absenceDetails.length > 0;
                      const rateColor = s.attendanceRate >= 90 ? '#22c55e' : s.attendanceRate >= 75 ? '#f59e0b' : '#ef4444';

                      return (
                        <tr key={s.workerId} style={{ borderBottom: '1px solid var(--b0)' }}>
                          <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--t0)' }}>
                            {s.name}
                          </td>
                          <td style={{ padding: '14px 16px', color: 'var(--t2)' }}>
                            <span style={{ background: 'var(--s2)', padding: '2px 8px', borderRadius: 6, fontSize: 11, border: '1px solid var(--b1)' }}>
                              {s.role}
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--t2)' }}>
                            {s.totalDays}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: '#22c55e' }}>
                            {s.presentDays}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: s.absentDays > 0 ? '#ef4444' : 'var(--t3)' }}>
                            {s.absentDays}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center', color: (s.leaveDays + s.halfDays) > 0 ? '#f59e0b' : 'var(--t3)' }}>
                            {s.leaveDays + (s.halfDays > 0 ? ` (${s.halfDays} HD)` : '') || '0'}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            {s.totalOvertimeHours > 0 ? (
                              <span style={{
                                background: 'rgba(6,182,212,0.15)',
                                color: '#06b6d4',
                                border: '1px solid rgba(6,182,212,0.35)',
                                padding: '3px 8px',
                                borderRadius: 12,
                                fontWeight: 800,
                                fontSize: 12
                              }}>
                                {s.totalOvertimeHours} hrs
                              </span>
                            ) : (
                              <span style={{ color: 'var(--t3)', fontSize: 12 }}>—</span>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{ 
                              background: `${rateColor}18`, 
                              color: rateColor, 
                              border: `1px solid ${rateColor}35`, 
                              padding: '3px 8px', 
                              borderRadius: 12, 
                              fontWeight: 800, 
                              fontSize: 12 
                            }}>
                              {s.attendanceRate}%
                            </span>
                          </td>
                          <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                            {hasAbsencesOrOT ? (
                              <button
                                onClick={() => setHistoryModal({ isOpen: true, staff: s })}
                                className="btn btn-sm"
                                style={{ 
                                  fontSize: 11, 
                                  background: 'rgba(6,182,212,0.12)', 
                                  color: '#06b6d4', 
                                  border: '1px solid rgba(6,182,212,0.3)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4
                                }}
                              >
                                <FileText size={12} /> View {s.absenceDetails.length} Log Entries
                              </button>
                            ) : (
                              <span style={{ fontSize: 11, color: '#22c55e', fontStyle: 'italic', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={12} /> 100% Present
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: MARK ABSENT / ADD REASON
      ────────────────────────────────────────────────────────────── */}
      {markingModal.isOpen && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}>
          <div className="mbox" style={{ maxWidth: '420px', width: '92%', padding: '22px', borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--t0)' }}>
                Mark Attendance: {markingModal.worker?.workerName || markingModal.worker?.name}
              </h3>
              <button 
                onClick={() => setMarkingModal({ isOpen: false, worker: null, status: 'present', overtimeHours: '', note: '', submitting: false })}
                style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 14 }}>
              Date: <strong style={{ color: 'var(--t0)' }}>{formattedDateName}</strong>
            </div>

            {/* STATUS SELECTOR: Present (default), Half Day, Absent */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Select Status
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                  { key: 'present', label: 'Present', color: '#22c55e' },
                  { key: 'half-day', label: 'Half Day', color: '#3b82f6' },
                  { key: 'absent', label: 'Absent', color: '#ef4444' }
                ].map(st => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => {
                      setMarkingModal(prev => ({ 
                        ...prev, 
                        status: st.key,
                        overtimeHours: st.key === 'present' ? prev.overtimeHours : ''
                      }));
                    }}
                    style={{
                      padding: '10px 4px',
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: markingModal.status === st.key ? `2px solid ${st.color}` : '1px solid var(--b1)',
                      background: markingModal.status === st.key ? `${st.color}18` : 'var(--s2)',
                      color: markingModal.status === st.key ? st.color : 'var(--t1)'
                    }}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            {/* OVERTIME (IN HOURS) INPUT - DISPLAYED FOR PRESENT */}
            {markingModal.status === 'present' && (
              <div style={{ marginBottom: 16, background: 'var(--s2)', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--b1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#06b6d4', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} /> Overtime (in Hours)
                  </label>
                  <span style={{ fontSize: 11, color: 'var(--t2)' }}>0 = No Overtime</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={markingModal.overtimeHours}
                    onChange={e => {
                      const val = e.target.value;
                      setMarkingModal(prev => ({
                        ...prev,
                        overtimeHours: val
                      }));
                    }}
                    placeholder="0 hrs"
                    style={{
                      width: '85px',
                      borderRadius: 8,
                      background: 'var(--s1)',
                      border: '1px solid var(--b2)',
                      padding: '7px 10px',
                      color: 'var(--t0)',
                      fontSize: 13,
                      fontWeight: 800
                    }}
                  />
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[1, 1.5, 2, 3, 4].map(h => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setMarkingModal(prev => ({ 
                          ...prev, 
                          overtimeHours: String(h)
                        }))}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: Number(markingModal.overtimeHours) === h ? '1px solid #06b6d4' : '1px solid var(--b1)',
                          background: Number(markingModal.overtimeHours) === h ? 'rgba(6, 182, 212, 0.2)' : 'var(--s1)',
                          color: Number(markingModal.overtimeHours) === h ? '#06b6d4' : 'var(--t2)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        +{h}h
                      </button>
                    ))}
                    {parseFloat(markingModal.overtimeHours) > 0 && (
                      <button
                        type="button"
                        onClick={() => setMarkingModal(prev => ({ ...prev, overtimeHours: '' }))}
                        style={{
                          padding: '5px 8px',
                          borderRadius: 6,
                          border: '1px solid var(--b1)',
                          background: 'var(--s1)',
                          color: '#ef4444',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer'
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* PRESET QUICK REASONS */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Quick Reasons / Notes
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Sick Leave / Fever', 'Family Emergency', 'Personal Work', 'Extra Shift / Overtime', 'Out of Station'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMarkingModal(prev => ({ ...prev, note: preset }))}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 6,
                      background: markingModal.note === preset ? 'rgba(245,158,11,0.2)' : 'var(--s2)',
                      border: markingModal.note === preset ? '1px solid var(--a)' : '1px solid var(--b1)',
                      color: markingModal.note === preset ? 'var(--a)' : 'var(--t2)',
                      cursor: 'pointer'
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* REASON NOTE INPUT */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Reason / Remarks
              </label>
              <textarea
                value={markingModal.note}
                onChange={e => setMarkingModal(prev => ({ ...prev, note: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveAbsence();
                  }
                }}
                placeholder="Enter details or notes... (Press Enter to save)"
                rows={2}
                style={{
                  width: '100%',
                  borderRadius: 8,
                  background: 'var(--s2)',
                  border: '1px solid var(--b1)',
                  padding: '8px 10px',
                  color: 'var(--t0)',
                  fontSize: 13,
                  resize: 'none'
                }}
              />
            </div>

            {/* ACTION BUTTONS */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setMarkingModal({ isOpen: false, worker: null, status: 'present', overtimeHours: '', note: '', submitting: false })}
                disabled={markingModal.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`btn ${markingModal.status === 'absent' ? 'btn-danger' : 'btn-primary'}`}
                onClick={handleSaveAbsence}
                disabled={markingModal.submitting}
                style={{ 
                  minWidth: 120
                }}
              >
                {markingModal.submitting ? 'Saving...' : markingModal.status === 'absent' ? 'Confirm Absence' : 'Save Attendance'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: DETAILED MONTHLY ABSENCE LOG PER STAFF
      ────────────────────────────────────────────────────────────── */}
      {historyModal.isOpen && historyModal.staff && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}>
          <div className="mbox" style={{ maxWidth: '560px', width: '92%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: '22px', borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid var(--b1)', paddingBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--t0)' }}>
                  Attendance & Overtime Log: {historyModal.staff.name}
                </h3>
                <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>
                  Month: <strong>{formattedMonthName}</strong> • Role: <strong>{historyModal.staff.role}</strong>
                </div>
              </div>
              <button 
                onClick={() => setHistoryModal({ isOpen: false, staff: null })}
                style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
              {historyModal.staff.absenceDetails?.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#22c55e' }}>
                  No absences or overtime records for this staff member this month.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {historyModal.staff.absenceDetails.map((item, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        background: 'var(--s2)', 
                        border: '1px solid var(--b1)', 
                        borderRadius: 10, 
                        padding: '12px 14px', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'flex-start',
                        gap: 12
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, color: 'var(--t0)', fontSize: 14 }}>
                            {item.date} ({item.dayName})
                          </span>
                          <span style={{ 
                            fontSize: 10, 
                            fontWeight: 800, 
                            textTransform: 'uppercase', 
                            padding: '2px 6px', 
                            borderRadius: 4, 
                            background: item.status === 'absent' 
                              ? 'rgba(239,68,68,0.15)' 
                              : item.status === 'overtime' 
                              ? 'rgba(6,182,212,0.15)'
                              : 'rgba(245,158,11,0.15)',
                            color: item.status === 'absent' 
                              ? '#ef4444' 
                              : item.status === 'overtime' 
                              ? '#06b6d4'
                              : '#f59e0b'
                          }}>
                            {item.status}
                          </span>
                          {item.overtimeHours > 0 && (
                            <span style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 4,
                              background: 'rgba(6,182,212,0.15)',
                              color: '#06b6d4',
                              border: '1px solid rgba(6,182,212,0.3)'
                            }}>
                              +{item.overtimeHours} hrs OT
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--t1)' }}>
                          <strong>Notes / Reason:</strong> {item.note}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, borderTop: '1px solid var(--b1)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>
                Absent: <strong style={{ color: '#ef4444' }}>{historyModal.staff.absentDays}</strong> | Overtime: <strong style={{ color: '#06b6d4' }}>{historyModal.staff.totalOvertimeHours || 0} hrs</strong> | Attendance: <strong>{historyModal.staff.attendanceRate}%</strong>
              </div>
              <button 
                className="btn btn-sm btn-ghost" 
                onClick={() => setHistoryModal({ isOpen: false, staff: null })}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 3: MARK RESTAURANT CLOSED DAY
      ────────────────────────────────────────────────────────────── */}
      {closedDayModal.isOpen && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}>
          <div className="mbox" style={{ maxWidth: '420px', width: '92%', padding: '22px', borderRadius: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CalendarOff size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--t0)' }}>
                  Mark as Closed Day
                </h3>
              </div>
              <button 
                onClick={() => setClosedDayModal({ isOpen: false, reason: 'Weekly Off', submitting: false })}
                style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 16, lineHeight: 1.5 }}>
              Date: <strong style={{ color: 'var(--t0)' }}>{formattedDateName}</strong>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Select Preset Reason
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {['Weekly Off', 'Holiday / Festival', 'Maintenance', 'Renovation', 'Emergency / Weather'].map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setClosedDayModal(prev => ({ ...prev, reason: preset }))}
                    style={{
                      fontSize: 11.5,
                      padding: '4px 10px',
                      borderRadius: 6,
                      background: closedDayModal.reason === preset ? 'rgba(239,68,68,0.18)' : 'var(--s2)',
                      border: closedDayModal.reason === preset ? '1px solid #ef4444' : '1px solid var(--b1)',
                      color: closedDayModal.reason === preset ? '#ef4444' : 'var(--t2)',
                      fontWeight: closedDayModal.reason === preset ? 700 : 500,
                      cursor: 'pointer'
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={closedDayModal.reason}
                onChange={e => setClosedDayModal(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Or type custom reason..."
                style={{
                  width: '100%',
                  borderRadius: 8,
                  background: 'var(--s2)',
                  border: '1px solid var(--b1)',
                  padding: '8px 10px',
                  color: 'var(--t0)',
                  fontSize: 13
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setClosedDayModal({ isOpen: false, reason: 'Weekly Off', submitting: false })}
                disabled={closedDayModal.submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => handleToggleClosedDay(true, closedDayModal.reason)}
                disabled={closedDayModal.submitting}
                style={{ minWidth: 140 }}
              >
                {closedDayModal.submitting ? 'Marking...' : 'Confirm Closed Day'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
