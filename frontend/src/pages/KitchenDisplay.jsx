import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Volume2, VolumeX, Clock, ChefHat, AlertCircle, RefreshCw, Search, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
// --- UI configuration ---
const TOTAL_TABLES = 21;
const SECTION_MAP = {
  topBarLounge: [1,2,3,4,5,6,7],
  lowerBarLounge: [8,9,10,11,12,13,14],
  restaurantArea: [15,16,17,18,19,20,21],
};
function KOTCard({ kot }) {
  const { role, deleteKOT, removeKOTItem, showToast } = useApp();
  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="kot-card"
      style={{
        background: 'var(--s2)',
        border: '1px solid var(--b1)',
        borderRadius: 10,
        padding: 12,
        color: 'var(--t1)',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 0.5 }} className="kot-table-number">
            {kot.kotNo}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {kot.orderType && (
              <span className="kot-order-type-badge">
                {kot.orderType}
              </span>
            )}
            {kot.waiterName && (
              <span style={{ fontSize: 10, color: 'var(--t2)' }}>
                👤 {kot.waiterName}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 4 }} className="kot-time-text">
            <Clock size={12} />
            {formatTime(kot.createdAt)}
          </div>
          {(role === 'admin' || role === 'manager') && (
            <button
              onClick={async () => {
                if (window.confirm(`⚠️ Are you sure you want to DELETE entire "${kot.kotNo || 'KOT'}"? All items in it will be deleted, and stock will be refunded.`)) {
                  try {
                    await deleteKOT(kot._id, kot.tableNo);
                    showToast('KOT deleted and stock refunded successfully', 'success');
                  } catch (err) {
                    showToast(err.message || 'Failed to delete KOT', 'error');
                  }
                }
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                color: '#ff4d4d',
                padding: '2px 8px',
                borderRadius: '6px',
                fontSize: '10px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Items list */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: 8, overflow: 'hidden' }}>
        {kot.items.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '6px 10px',
              borderBottom: idx < kot.items.length - 1 ? '1px solid var(--b2)' : 'none',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--t0)' }}>{item.name}</div>
              {(item.notes || item.note) && (
                <div style={{ fontSize: 10, color: '#f5c518', fontStyle: 'italic', marginTop: 2 }}>
                  ✎ {item.notes || item.note}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--t0)' }}>
                ×{item.quantity}
              </span>
              {(role === 'admin' || role === 'manager') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Remove 1x "${item.name}" from KOT?`)) {
                        try {
                          await removeKOTItem(kot.orderId, item.name, 1);
                          showToast(`Removed 1x "${item.name}" successfully`, 'success');
                        } catch (err) {
                          showToast(err.message || 'Failed to remove item', 'error');
                        }
                      }
                    }}
                    style={{
                      background: 'var(--s2)',
                      border: '1px solid var(--b2)',
                      color: '#ef4444',
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Remove 1x"
                  >
                    −
                  </button>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (window.confirm(`Delete all "${item.name}" from this KOT?`)) {
                        try {
                          await removeKOTItem(kot.orderId, item.name, item.quantity);
                          showToast(`Deleted "${item.name}" successfully`, 'success');
                        } catch (err) {
                          showToast(err.message || 'Failed to remove item', 'error');
                        }
                      }
                    }}
                    style={{
                      background: 'var(--s2)',
                      border: '1px solid var(--b2)',
                      color: '#9ca3af',
                      width: '18px',
                      height: '18px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '10px',
                      cursor: 'pointer',
                      padding: 0
                    }}
                    title="Delete all"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Order-level notes */}
      {(() => {
        const cleanedNotes = kot.notes
          ? kot.notes.replace(/pos_print_[a-z0-9]+/gi, '').replace(/^\s*,\s*|\s*,\s*$/g, '').trim()
          : '';
        return cleanedNotes ? (
          <div style={{ background: 'rgba(245,197,24,0.08)', border: '1px solid rgba(245,197,24,0.3)', borderRadius: 6, padding: '6px 8px', fontSize: 11, color: '#f5c518', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <AlertCircle size={12} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>{cleanedNotes}</span>
          </div>
        ) : null;
      })()}
    </div>
  );
}

export default function KitchenDisplay({ department = 'kitchen' }) {
  const { socket, role, can, updateKOTStatus } = useApp();
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tableSearch, setTableSearch] = useState('');

  const getBusinessTodayStr = () => {
    const d = new Date();
    const istTime = new Date(d.getTime() + 19800000);
    let year = istTime.getUTCFullYear();
    let month = istTime.getUTCMonth();
    let dateVal = istTime.getUTCDate();
    let hour = istTime.getUTCHours();

    if (hour < 5) {
      const prevDay = new Date(Date.UTC(year, month, dateVal - 1));
      year = prevDay.getUTCFullYear();
      month = prevDay.getUTCMonth();
      dateVal = prevDay.getUTCDate();
    }

    const yyyy = year;
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(dateVal).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getBusinessTodayStr();
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const dateInputRef = useRef(null);

  const formattedDateName = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    return dateObj.toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC'
    });
  }, [selectedDate]);

  const handleStepDate = (offset) => {
    const addDays = (dateStr, days) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      date.setUTCDate(date.getUTCDate() + days);
      const yyyy = date.getUTCFullYear();
      const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(date.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (offset > 0 && selectedDate >= todayStr) return;

    const nextDate = addDays(selectedDate, offset);
    if (offset > 0 && nextDate > todayStr) return;

    setSelectedDate(nextDate);
  };

  const isNextDisabled = selectedDate >= todayStr;

  const loadKOTs = async (dateToLoad = selectedDate) => {
    try {
      const res = await authFetch(apiUrl(`/api/kots/kitchen/display?date=${dateToLoad}`));
      if (!res.ok) throw new Error('Failed to load KOTs');
      const data = await res.json();
      const isToday = dateToLoad === todayStr;
      const displayKots = isToday
        ? data.filter(kot => !['COMPLETED', 'SERVED'].includes(kot.status))
        : data;
      setKots(displayKots);
    } catch (err) {
      console.error('Failed to load KOTs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (kotId, newStatus) => {
    try {
      await updateKOTStatus(kotId, newStatus);
      if (['COMPLETED', 'SERVED'].includes(newStatus)) {
        setKots(prev => prev.filter(k => k._id !== kotId));
      } else {
        setKots(prev => prev.map(k => k._id === kotId ? { ...k, status: newStatus } : k));
      }
    } catch (err) {
      console.error('Failed to update KOT status:', err);
    }
  };

  const playNotification = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (e) {}
  };

  useEffect(() => {
    setLoading(true);
    setSelectedTable(null);
    loadKOTs(selectedDate);
  }, [selectedDate]);

  useEffect(() => {
    if (socket) {
      socket.emit('join-kitchen');

      socket.on('NEW_KOT', (data) => {
        if (selectedDate !== todayStr) return;
        if (!['COMPLETED', 'SERVED'].includes(data.status)) {
          setKots(prev => {
            if (prev.some(k => k._id === data._id)) return prev;
            return [data, ...prev];
          });
          if (soundEnabled) playNotification();
        }
      });

      socket.on('KOT_UPDATED', (data) => {
        if (selectedDate !== todayStr) return;
        if (['COMPLETED', 'SERVED'].includes(data.status)) {
          setKots(prev => prev.filter(k => k._id !== data._id));
        } else {
          setKots(prev => prev.map(k => k._id === data._id ? { ...k, ...data } : k));
        }
      });

      socket.on('KOT_DELETED', (data) => {
        if (selectedDate !== todayStr) return;
        if (data.kotId) {
          setKots(prev => prev.filter(k => k._id !== data.kotId));
        }
      });

      socket.on('ORDER_COMPLETED', (data) => {
        if (selectedDate !== todayStr) return;
        if (data.tableNo) {
          setKots(prev => prev.filter(k => k.tableNo !== parseInt(data.tableNo)));
        }
      });

      return () => {
        socket.off('NEW_KOT');
        socket.off('KOT_UPDATED');
        socket.off('KOT_DELETED');
        socket.off('ORDER_COMPLETED');
      };
    }
  }, [socket, soundEnabled, selectedDate, todayStr]);

  // Group KOTs by table number, filtering items by the specified department
  const kotsByTable = (kots || []).reduce((acc, kot) => {
    const deptItems = (kot?.items || []).filter(item => {
      // Default to kitchen if department is missing
      const itemDept = item.department || 'kitchen';
      return itemDept === department;
    });

    // If this KOT has no items for this display's department, skip it
    if (deptItems.length === 0) return acc;

    // Create a copy of the KOT with only the relevant items
    const displayKot = { ...kot, items: deptItems };

    const key = displayKot.tableNo;
    if (!acc[key]) acc[key] = [];
    acc[key].push(displayKot);
    return acc;
  }, {});

  // All table numbers (including empty ones)
  const allTableNos = Array.from({ length: TOTAL_TABLES }, (_, i) => (i + 1).toString());

  // Counts for top stats bar
  const activeTables = Object.keys(kotsByTable).length;
  const emptyTables = TOTAL_TABLES - activeTables;

  const tableNos = Object.keys(kotsByTable).sort((a, b) => parseInt(a) - parseInt(b));

  if (!can('kitchen')) {
    return <div style={{ padding: 20, color: '#ef4444' }}>Access denied. This display is for staff only.</div>;
  }

  const filteredKots = tableSearch.trim()
    ? kots.filter(k => 
        String(k.tableNo).includes(tableSearch.trim()) || 
        String(k.kotNo || '').toLowerCase().includes(tableSearch.trim().toLowerCase())
      )
    : kots;

  return (
    <div className="kitchen-display">
      {/* Page Header: Search + Date Navigation + Refresh */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
        <div className="kot-search-wrapper" style={{ flex: '1 1 200px', maxWidth: '320px' }}>
          <Search size={15} className="kot-search-icon" />
          <input
            type="text"
            placeholder="Search KOT..."
            value={tableSearch}
            onChange={e => setTableSearch(e.target.value)}
            className="kot-search-input"
          />
        </div>

        {/* Date Selector Pill (Matches Attendance / Image 2 style) */}
        <div
          className="kot-date-navigator"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'var(--s2)',
            border: '1px solid var(--b2)',
            borderRadius: 10,
            padding: '3px 6px',
            gap: 6
          }}
        >
          {/* Previous Day Arrow */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStepDate(-1);
            }}
            className="btn btn-ghost date-nav-btn"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--b2)',
              background: 'var(--s1)',
              color: 'var(--t0)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              height: 30,
              width: 30,
              flexShrink: 0
            }}
            title="Previous Day"
          >
            <ChevronLeft size={16} />
          </button>

          {/* Formatted Date Display */}
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              color: 'var(--t0)',
              padding: '0 6px',
              userSelect: 'none',
              whiteSpace: 'nowrap'
            }}
          >
            {formattedDateName}
          </div>

          {/* Dedicated Calendar Icon Button */}
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
              padding: '5px 7px',
              borderRadius: 6,
              border: '1px solid var(--b2)',
              background: 'var(--s1)',
              color: 'var(--a)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              height: 30,
              width: 30,
              flexShrink: 0
            }}
            title="Choose Date"
          >
            <CalendarDays size={15} />
          </button>

          {/* Hidden Date Input */}
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            max={todayStr}
            onChange={e => {
              const val = e.target.value;
              if (val && val <= todayStr) setSelectedDate(val);
            }}
            style={{
              position: 'absolute',
              opacity: 0,
              pointerEvents: 'none',
              width: 0,
              height: 0
            }}
          />

          {/* Next Day Arrow (Disabled on Today or Future) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleStepDate(1);
            }}
            disabled={isNextDisabled}
            className="btn btn-ghost date-nav-btn"
            style={{
              padding: '6px 8px',
              borderRadius: 6,
              border: '1px solid var(--b2)',
              background: 'var(--s1)',
              color: 'var(--t0)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: 30,
              width: 30,
              flexShrink: 0,
              opacity: isNextDisabled ? 0.25 : 1,
              cursor: isNextDisabled ? 'not-allowed' : 'pointer'
            }}
            title={isNextDisabled ? "Cannot select future dates" : "Next Day"}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <button
          onClick={() => { setRefreshing(true); loadKOTs(selectedDate).finally(() => setRefreshing(false)); }}
          className="refresh-button"
          aria-label="Refresh KOTs"
        >
          <RefreshCw size={14} className={refreshing ? 'rotating' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--t2)' }}>Loading KOTs...</div>
        ) : Object.keys(kotsByTable).length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--t2)' }}>
            <ChefHat size={56} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
            <p style={{ fontSize: 16 }}>{tableSearch ? `No KOTs for table "${tableSearch}"` : `No KOTs on ${formattedDateName}`}</p>
          </div>
        ) : (
        <>
            {selectedTable ? (
              <div className="selected-table-view">
                <button className="back-button" onClick={() => setSelectedTable(null)}>
                  &larr; Back to Tables
                </button>
                <div className="selected-table-title">TABLE {selectedTable}</div>
                <div className="kitchen-kot-list custom-scroll">
                  {(kotsByTable[selectedTable] || [])
                    .slice()
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
                    .map(kot => (
                      <KOTCard key={kot._id} kot={kot} />
                    ))}
                </div>
              </div>
            ) : (
              <div className="tables-grid">
                {Object.entries(kotsByTable)
                  .filter(([tn, kotList]) => {
                    if (!tableSearch) return true;
                    const search = tableSearch.trim().toLowerCase();
                    return tn.toLowerCase().includes(search) || kotList.some(k => String(k.kotNo || '').toLowerCase().includes(search));
                  })
                  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                  .map(([tn, kotList]) => (
                    <div key={tn} className="kitchen-table-card" onClick={() => setSelectedTable(tn)}>
                      <div className="kitchen-table-header">
                        <span>TABLE {tn}</span>
                        <span className="count-badge">{kotList.length} KOTs</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
        </>
      )}

      <style>{`
        .date-nav-btn {
          transition: all 0.2s var(--ease);
        }
        .date-nav-btn:hover:not(:disabled) {
          background: var(--s2) !important;
          color: var(--a) !important;
          border-color: var(--a) !important;
        }
        .date-nav-btn:disabled {
          opacity: 0.25 !important;
          cursor: not-allowed !important;
        }
      `}</style>
    </div>
  );
}
