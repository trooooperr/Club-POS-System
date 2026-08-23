import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { 
  Calendar, Plus, Trash2, Edit2, Sparkles, User, 
  DollarSign, Users, Music, Disc, RefreshCw, X, Check, 
  Search, Filter, ArrowRight, CalendarDays, Wallet, Tag
} from 'lucide-react';

function DateField({ value, onChange, inputRef, label }) {
  const triggerPicker = () => {
    if (inputRef?.current) {
      if (typeof inputRef.current.showPicker === 'function') {
        inputRef.current.showPicker();
      } else {
        inputRef.current.focus();
      }
    }
  };

  return (
    <div className="sales-date-field">
      <span className="sales-date-label">{label}</span>
      <div className="sales-date-input-wrapper">
        <input
          type="date"
          value={value}
          onChange={onChange}
          className="d-input unified-date-input"
          ref={inputRef}
        />
        <CalendarDays size={13} className="sales-calendar-icon" onClick={triggerPicker} />
      </div>
    </div>
  );
}

export default function EventsPage() {
  const { settings, showToast, can } = useApp();

  const getBusinessTodayStr = () => {
    const d = new Date();
    const istTime = new Date(d.getTime() + 19800000); // IST offset
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

  // Filters & State
  const [range, setRange] = useState('all');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [searchQuery, setSearchQuery] = useState('');
  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  const [events, setEvents] = useState([]);
  const [summary, setSummary] = useState({ totalRevenue: 0, totalExpenses: 0, netRevenue: 0, count: 0 });
  const [loading, setLoading] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);

  // Form Fields
  const [name, setName] = useState('');
  const [hostedBy, setHostedBy] = useState('');
  const [date, setDate] = useState(todayStr);
  const [billingType, setBillingType] = useState('custom'); // 'custom' primary, 'per_plate' secondary
  const [guestCount, setGuestCount] = useState('');
  const [pricePerPlate, setPricePerPlate] = useState('');
  const [additionalCharges, setAdditionalCharges] = useState('');
  const [expenses, setExpenses] = useState([
    { name: 'DJ', amount: '' },
    { name: 'Dancers', amount: '' }
  ]);
  const [paymentMode, setPaymentMode] = useState('cash');
  const [cashAmount, setCashAmount] = useState('');
  const [upiAmount, setUpiAmount] = useState('');
  const [status, setStatus] = useState('completed');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch Events
  const fetchEvents = useCallback(() => {
    let url = apiUrl('/api/events');
    if (range === 'today') {
      url += `?date=${todayStr}`;
    } else if (range === 'custom') {
      url += `?startDate=${startDate}&endDate=${endDate}`;
    } else if (range === 'week') {
      const now = new Date();
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      const s = weekAgo.toISOString().split('T')[0];
      url += `?startDate=${s}&endDate=${todayStr}`;
    } else if (range === 'month') {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      url += `?startDate=${firstDay}&endDate=${todayStr}`;
    }

    setLoading(true);
    authFetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.events) {
          setEvents(data.events);
          setSummary(data.summary || { totalRevenue: 0, totalExpenses: 0, netRevenue: 0, count: 0 });
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch events:', err);
        showToast('Failed to load events', 'red');
        setLoading(false);
      });
  }, [range, startDate, endDate, todayStr, showToast]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handleDateChange = (type, val) => {
    setRange('custom');
    if (type === 'start') setStartDate(val);
    else setEndDate(val);
  };

  // Open Modal for New Event
  const handleOpenAddModal = () => {
    setEditingEvent(null);
    setName('');
    setHostedBy('');
    setDate(todayStr);
    setBillingType('custom'); // Default primary option
    setGuestCount('');
    setPricePerPlate('');
    setAdditionalCharges('');
    setExpenses([
      { name: 'DJ', amount: '' },
      { name: 'Dancers', amount: '' }
    ]);
    setPaymentMode('cash');
    setCashAmount('');
    setUpiAmount('');
    setStatus('completed');
    setNotes('');
    setIsModalOpen(true);
  };

  // Open Modal for Editing
  const handleOpenEditModal = (ev) => {
    setEditingEvent(ev);
    setName(ev.name || '');
    setHostedBy(ev.hostedBy || '');
    setDate(ev.date || todayStr);
    setBillingType(ev.billingType || 'custom');
    setGuestCount(ev.guestCount || '');
    setPricePerPlate(ev.pricePerPlate || '');
    setAdditionalCharges(ev.additionalCharges || '');
    setExpenses(ev.expenses && ev.expenses.length > 0 ? ev.expenses.map(e => ({ name: e.name, amount: e.amount || '' })) : [
      { name: 'DJ', amount: '' },
      { name: 'Dancers', amount: '' }
    ]);
    setPaymentMode(ev.paymentMode || 'cash');
    setCashAmount(ev.cashAmount || '');
    setUpiAmount(ev.upiAmount || '');
    setStatus(ev.status || 'completed');
    setNotes(ev.notes || '');
    setIsModalOpen(true);
  };

  // Dynamic Expenses Helper
  const handleAddExpenseRow = () => {
    setExpenses(prev => [...prev, { name: '', amount: '' }]);
  };

  const handleRemoveExpenseRow = (index) => {
    setExpenses(prev => prev.filter((_, i) => i !== index));
  };

  const handleExpenseChange = (index, field, val) => {
    setExpenses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  // Live Calculations in Modal
  const calculatedPlateTotal = useMemo(() => {
    if (billingType !== 'per_plate') return 0;
    const g = parseFloat(guestCount) || 0;
    const p = parseFloat(pricePerPlate) || 0;
    return Math.round(g * p);
  }, [billingType, guestCount, pricePerPlate]);

  const calculatedTotalExpenses = useMemo(() => {
    return expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
  }, [expenses]);

  const calculatedGrandTotal = useMemo(() => {
    const add = parseFloat(additionalCharges) || 0;
    if (billingType === 'per_plate') {
      return calculatedPlateTotal + add;
    }
    return add;
  }, [billingType, calculatedPlateTotal, additionalCharges]);

  const calculatedNetRevenue = useMemo(() => {
    return calculatedGrandTotal - calculatedTotalExpenses;
  }, [calculatedGrandTotal, calculatedTotalExpenses]);

  // Form Submit
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Please enter event name', 'amber');
      return;
    }

    setSaving(true);
    const payload = {
      name: name.trim(),
      hostedBy: hostedBy.trim(),
      date,
      billingType,
      guestCount: parseFloat(guestCount) || 0,
      pricePerPlate: parseFloat(pricePerPlate) || 0,
      additionalCharges: parseFloat(additionalCharges) || 0,
      expenses: expenses.filter(e => e.name && e.name.trim()),
      paymentMode,
      cashAmount: parseFloat(cashAmount) || 0,
      upiAmount: parseFloat(upiAmount) || 0,
      status,
      notes,
    };

    const isEdit = !!editingEvent;
    const url = isEdit ? apiUrl(`/api/events/${editingEvent._id}`) : apiUrl('/api/events');
    const method = isEdit ? 'PUT' : 'POST';

    try {
      const res = await authFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save event');
      }

      showToast(isEdit ? 'Event updated successfully' : 'Event created successfully', 'green');
      setIsModalOpen(false);
      fetchEvents();
    } catch (err) {
      console.error('Save event error:', err);
      showToast(err.message, 'red');
    } finally {
      setSaving(false);
    }
  };

  // Delete Event
  const handleDelete = async (id, evName) => {
    if (!window.confirm(`Are you sure you want to delete event "${evName}"?`)) return;

    try {
      const res = await authFetch(apiUrl(`/api/events/${id}`), { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      showToast('Event deleted', 'green');
      fetchEvents();
    } catch (err) {
      console.error('Delete error:', err);
      showToast(err.message, 'red');
    }
  };

  // Filtered Events
  const filteredEvents = useMemo(() => {
    if (!searchQuery.trim()) return events;
    const q = searchQuery.toLowerCase();
    return events.filter(ev => 
      ev.name.toLowerCase().includes(q) ||
      (ev.hostedBy && ev.hostedBy.toLowerCase().includes(q)) ||
      ev.date.includes(q) ||
      (ev.expenses && ev.expenses.some(ex => ex.name.toLowerCase().includes(q)))
    );
  }, [events, searchQuery]);

  return (
    <div className="fi events-page">
      {/* Controls Bar */}
      <div className="events-header-res">
        <div className="events-controls-right" style={{ width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="unified-pill-box filter-pills">
              {['all', 'today', 'week', 'month'].map(f => (
                <button key={f} className={`f-pill ${range === f ? 'active' : ''}`} onClick={() => setRange(f)}>
                  {f.toUpperCase()}
                </button>
              ))}
            </div>

            <div className={`unified-pill-box date-box-res ${range === 'custom' ? 'active-border' : ''}`} style={{ gap: 8, paddingLeft: 10, paddingRight: 10 }}>
              <DateField label="From" value={startDate} onChange={e => handleDateChange('start', e.target.value)} inputRef={startInputRef} />
              <ArrowRight size={13} style={{ color: 'var(--t2)', flexShrink: 0 }} />
              <DateField label="To" value={endDate} onChange={e => handleDateChange('end', e.target.value)} inputRef={endInputRef} />
            </div>
          </div>

          <button className="btn btn-primary" style={{ padding: '0 18px', height: 42, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }} onClick={handleOpenAddModal}>
            <Plus size={16} /> New Event
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-row-4">
        <div className="kpi-card-custom">
          <div className="kpi-card-label">Total Event Revenue</div>
          <div className="kpi-card-val mono">₹{(summary.totalRevenue || 0).toLocaleString('en-IN')}</div>
        </div>

        <div className="kpi-card-custom">
          <div className="kpi-card-label">Total Event Expenses</div>
          <div className="kpi-card-val mono" style={{ color: '#EF4444' }}>₹{(summary.totalExpenses || 0).toLocaleString('en-IN')}</div>
        </div>

        <div className="kpi-card-custom">
          <div className="kpi-card-label">Net Event Earnings</div>
          <div className="kpi-card-val mono" style={{ color: '#10B981' }}>₹{(summary.netRevenue || 0).toLocaleString('en-IN')}</div>
        </div>

        <div className="kpi-card-custom">
          <div className="kpi-card-label">Total Events</div>
          <div className="kpi-card-val mono">{summary.count || 0}</div>
        </div>
      </div>

      {/* Search & Actions Bar */}
      <div className="events-search-bar">
        <div className="search-input-wrap">
          <Search size={15} style={{ color: 'var(--t2)' }} />
          <input
            type="text"
            placeholder="Search by event name, host, or expense..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="search-input"
          />
          {searchQuery && (
            <button className="iBtn" onClick={() => setSearchQuery('')}><X size={13} /></button>
          )}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={fetchEvents} title="Refresh Events List">
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      {/* Events List Cards / Table */}
      {loading ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--t2)' }}>
          Loading events...
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: 'center' }}>
          <Calendar size={40} style={{ color: 'var(--t2)', marginBottom: 12, opacity: 0.5 }} />
          <h3 style={{ margin: '0 0 6px', color: 'var(--t0)' }}>No Events Found</h3>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--t2)' }}>
            {searchQuery ? 'No events matched your search query.' : 'Click "+ New Event" to register an event or party.'}
          </p>
        </div>
      ) : (
        <div className="events-grid">
          {filteredEvents.map(ev => (
            <div key={ev._id} className="event-card">
              <div className="event-card-header">
                <div>
                  <div className="event-title">{ev.name}</div>
                  {ev.hostedBy && (
                    <div className="event-host">
                      <User size={12} /> Hosted by <strong>{ev.hostedBy}</strong>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={`event-badge-mode ${ev.billingType === 'per_plate' ? 'per-plate' : 'custom'}`}>
                    {ev.billingType === 'per_plate' ? 'Per Plate Basis' : 'Custom / Menu & Expenses'}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--t2)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={11} /> {ev.date}
                  </span>
                </div>
              </div>

              <div className="event-card-body">
                {/* Per Plate Section details if applicable */}
                {ev.billingType === 'per_plate' && (
                  <div className="event-detail-row">
                    <span className="lbl"><Users size={13} /> Guests & Rate:</span>
                    <span className="val mono">
                      {ev.guestCount} guests @ ₹{(ev.pricePerPlate || 0).toLocaleString('en-IN')}/plate = <strong>₹{(ev.plateTotal || 0).toLocaleString('en-IN')}</strong>
                    </span>
                  </div>
                )}

                {/* Additional / Package Fee */}
                {ev.additionalCharges > 0 && (
                  <div className="event-detail-row">
                    <span className="lbl"><Tag size={13} /> Additional Billed Fee:</span>
                    <span className="val mono">₹{ev.additionalCharges.toLocaleString('en-IN')}</span>
                  </div>
                )}

                {/* Expenses Breakdown */}
                {ev.expenses && ev.expenses.length > 0 && (
                  <div className="expenses-breakdown-box">
                    <div className="expenses-head">
                      <Disc size={12} /> Expenses Breakdown ({ev.expenses.length}):
                    </div>
                    <div className="expenses-chips">
                      {ev.expenses.map((ex, idx) => (
                        <div key={idx} className="expense-chip">
                          <span className="ex-name">{ex.name}</span>
                          <span className="ex-amt mono">₹{ex.amount?.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: '#EF4444', fontWeight: 700, textAlign: 'right' }}>
                      Total Expenses: ₹{(ev.totalExpenses || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                )}
              </div>

              <div className="event-card-footer">
                <div>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--t2)', display: 'block' }}>
                    Total Billed Amount
                  </span>
                  <div className="event-grand-total mono">
                    ₹{(ev.grandTotal || 0).toLocaleString('en-IN')}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--t2)', display: 'block' }}>
                    Net Revenue
                  </span>
                  <div className="event-net-total mono" style={{ color: ev.netRevenue >= 0 ? '#10B981' : '#EF4444' }}>
                    ₹{(ev.netRevenue || 0).toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="event-actions">
                  <button className="iBtn" onClick={() => handleOpenEditModal(ev)} title="Edit Event">
                    <Edit2 size={14} />
                  </button>
                  <button className="iBtn danger" onClick={() => handleDelete(ev._id, ev.name)} title="Delete Event">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE / EDIT EVENT MODAL */}
      {isModalOpen && (
        <div className="moverlay" onClick={() => setIsModalOpen(false)}>
          <div className="mcard event-modal" onClick={e => e.stopPropagation()}>
            <div className="mhead">
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={18} style={{ color: 'var(--a)' }} />
                {editingEvent ? 'Edit Event' : 'Create New Event'}
              </h3>
              <button className="iBtn" onClick={() => setIsModalOpen(false)}><X size={16} /></button>
            </div>

            <form onSubmit={handleSubmit} className="mbody">
              {/* 1. Billing Type Mode (First in Form - Horizontal Flex) */}
              <div className="fg" style={{ marginBottom: 14 }}>
                <label className="flbl" style={{ marginBottom: 6, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>BILLING TYPE MODE</label>
                <div className="billing-mode-tabs">
                  <button
                    type="button"
                    className={`mode-tab ${billingType === 'custom' ? 'active' : ''}`}
                    onClick={() => setBillingType('custom')}
                  >
                    Custom / Menu & Expenses
                  </button>
                  <button
                    type="button"
                    className={`mode-tab ${billingType === 'per_plate' ? 'active' : ''}`}
                    onClick={() => setBillingType('per_plate')}
                  >
                    Per Plate Basis
                  </button>
                </div>
              </div>

              {/* 2. Event Name & Host */}
              <div className="form-grid-2">
                <div className="fg">
                  <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>EVENT NAME *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Birthday Party / Corporate Night"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="finput"
                  />
                </div>
                <div className="fg">
                  <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>HOSTED BY (OPTIONAL)</label>
                  <input
                    type="text"
                    placeholder="e.g. Rahul Sharma"
                    value={hostedBy}
                    onChange={e => setHostedBy(e.target.value)}
                    className="finput"
                  />
                </div>
              </div>

              {/* 3. Event Date & Billed Fee */}
              <div className="form-grid-2" style={{ marginTop: 12 }}>
                <div className="fg">
                  <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>EVENT DATE *</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="finput"
                  />
                </div>
                <div className="fg">
                  <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>
                    {billingType === 'custom' ? 'EVENT CHARGES / BILLED FEE (₹)' : 'ADDITIONAL BILLED FEE (₹)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="e.g. 15000"
                    value={additionalCharges}
                    onChange={e => setAdditionalCharges(e.target.value)}
                    className="finput"
                  />
                </div>
              </div>

              {/* 4. Per Plate Section (If per_plate selected) */}
              {billingType === 'per_plate' && (
                <div className="per-plate-box" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid var(--b1)', borderRadius: 10, padding: 12, marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--a)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={14} /> PER PLATE CALCULATION
                  </div>
                  <div className="form-grid-2">
                    <div className="fg">
                      <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>NUMBER OF GUESTS</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 50"
                        value={guestCount}
                        onChange={e => setGuestCount(e.target.value)}
                        className="finput"
                      />
                    </div>
                    <div className="fg">
                      <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>PRICE PER PLATE (₹)</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="e.g. 500"
                        value={pricePerPlate}
                        onChange={e => setPricePerPlate(e.target.value)}
                        className="finput"
                      />
                    </div>
                  </div>
                  <div className="fg" style={{ marginTop: 10 }}>
                    <label className="flbl" style={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>CALCULATED PLATE TOTAL</label>
                    <input
                      type="text"
                      disabled
                      value={`₹${calculatedPlateTotal.toLocaleString('en-IN')}`}
                      className="finput mono"
                      style={{ background: 'var(--s2)', fontWeight: 800, color: 'var(--a)' }}
                    />
                  </div>
                </div>
              )}

              {/* 5. Expenses Breakdown Section (DJ, Dancers, etc.) */}
              <div className="expenses-section-builder" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <label className="flbl" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 11 }}>
                    <Disc size={14} style={{ color: '#EF4444' }} /> EVENT EXPENSES (DJ, DANCERS, DECORATION, ETC.)
                  </label>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={handleAddExpenseRow} style={{ fontSize: 11 }}>
                    + Add Expense Row
                  </button>
                </div>

                {expenses.map((ex, idx) => (
                  <div key={idx} className="expense-builder-row">
                    <input
                      type="text"
                      placeholder="Expense Name (e.g. DJ / Dancers / Lights)"
                      value={ex.name}
                      onChange={e => handleExpenseChange(idx, 'name', e.target.value)}
                      className="finput"
                      style={{ flex: 2 }}
                    />
                    <input
                      type="number"
                      min="0"
                      placeholder="Amount (₹)"
                      value={ex.amount}
                      onChange={e => handleExpenseChange(idx, 'amount', e.target.value)}
                      className="finput"
                      style={{ flex: 1 }}
                    />
                    {expenses.length > 1 && (
                      <button type="button" className="iBtn danger" onClick={() => handleRemoveExpenseRow(idx)}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* 6. Summary Calculation Box */}
              <div className="modal-summary-box">
                <div className="sum-row">
                  <span>Total Event Revenue Billed:</span>
                  <span className="mono" style={{ fontWeight: 800, color: 'var(--t0)' }}>
                    ₹{calculatedGrandTotal.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="sum-row">
                  <span>Total Event Expenses:</span>
                  <span className="mono" style={{ fontWeight: 800, color: '#EF4444' }}>
                    ₹{calculatedTotalExpenses.toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="sum-row thick" style={{ paddingTop: 6, marginTop: 6, borderTop: '1px solid var(--b1)' }}>
                  <span style={{ fontWeight: 800 }}>Net Event Income:</span>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 900, color: calculatedNetRevenue >= 0 ? '#10B981' : '#EF4444' }}>
                    ₹{calculatedNetRevenue.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* Modal Actions - Flex Horizontal on Right */}
              <div className="mfoot-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? <RefreshCw size={14} className="spin" /> : <Check size={16} />}
                  {editingEvent ? 'Update Event' : 'Save Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Styled CSS */}
      <style>{`
        .events-page { display: flex; flex-direction: column; gap: 20px; }
        .events-header-res {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px;
          width: 100%;
        }
        .events-controls-right {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }
        
        .kpi-row-4 {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        .kpi-card-custom {
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: var(--rl);
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 4px;
        }
        .kpi-card-label {
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--t2);
          margin-bottom: 2px;
        }
        .kpi-card-val {
          font-size: 22px;
          font-weight: 900;
          color: var(--t0);
        }

        .events-search-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .search-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 10px;
          padding: 0 12px;
          height: 40px;
          flex: 1;
          max-width: 400px;
          gap: 8px;
        }
        .search-input {
          background: none;
          border: none;
          outline: none;
          color: var(--t0);
          font-size: 13px;
          width: 100%;
        }

        .events-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
          gap: 16px;
        }
        .event-card {
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: var(--rl);
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          transition: border-color 0.2s;
        }
        .event-card:hover {
          border-color: var(--b2);
        }
        .event-card-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .event-title {
          font-size: 16px;
          font-weight: 800;
          color: var(--t0);
        }
        .event-host {
          font-size: 12px;
          color: var(--t2);
          display: flex;
          align-items: center;
          gap: 4px;
          margin-top: 2px;
        }
        .event-badge-mode {
          font-size: 10px;
          font-weight: 800;
          padding: 3px 8px;
          border-radius: 6px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .event-badge-mode.custom {
          background: rgba(13, 148, 136, 0.15);
          color: var(--a);
          border: 1px solid rgba(13, 148, 136, 0.3);
        }
        .event-badge-mode.per-plate {
          background: rgba(245, 158, 11, 0.15);
          color: #F59E0B;
          border: 1px solid rgba(245, 158, 11, 0.3);
        }

        .event-detail-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 6px;
        }
        .event-detail-row .lbl {
          color: var(--t2);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .event-detail-row .val {
          color: var(--t0);
        }

        .expenses-breakdown-box {
          background: var(--s2);
          border: 1px dashed var(--b2);
          border-radius: 8px;
          padding: 10px;
          margin-top: 6px;
        }
        .expenses-head {
          font-size: 11px;
          font-weight: 700;
          color: var(--t1);
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .expenses-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .expense-chip {
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 6px;
          padding: 3px 8px;
          font-size: 11px;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .expense-chip .ex-name { color: var(--t1); }
        .expense-chip .ex-amt { color: #EF4444; font-weight: 700; }

        .event-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid var(--b1);
        }
        .event-grand-total {
          font-size: 16px;
          font-weight: 900;
          color: var(--t0);
        }
        .event-net-total {
          font-size: 15px;
          font-weight: 800;
        }
        .event-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        /* Modal Styles */
        .event-modal {
          max-width: 600px;
          width: 90%;
        }
        .billing-mode-tabs {
          display: flex;
          flex-direction: row;
          gap: 10px;
          width: 100%;
          margin-top: 4px;
        }
        .mode-tab {
          flex: 1;
          background: var(--s2);
          border: 1px solid var(--b1);
          color: var(--t2);
          padding: 10px 14px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          text-align: center;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .mode-tab.active {
          background: var(--a);
          color: #000;
          border-color: var(--a);
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.25);
        }
        .per-plate-box {
          background: rgba(13, 148, 136, 0.05);
          border: 1px solid rgba(13, 148, 136, 0.2);
          border-radius: 10px;
          padding: 12px;
          margin-top: 12px;
        }
        .expenses-section-builder {
          background: var(--s2);
          border: 1px solid var(--b1);
          border-radius: 10px;
          padding: 12px;
          margin-top: 12px;
        }
        .expense-builder-row {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        .modal-summary-box {
          background: var(--s2);
          border: 1px solid var(--b2);
          border-radius: 10px;
          padding: 12px;
          margin-top: 14px;
        }
        .sum-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 4px;
          color: var(--t1);
        }

        .mfoot-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          margin-top: 18px;
          width: 100%;
        }
        .mfoot-actions .btn {
          width: auto !important;
          min-width: 110px;
          height: 42px;
          padding: 0 20px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-weight: 700;
        }

        @media (max-width: 1024px) {
          .kpi-row-4 { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 750px) {
          .events-header-res { flex-direction: column; align-items: stretch; }
          .events-controls-right { flex-direction: column; align-items: stretch; }
          .kpi-row-4 { grid-template-columns: 1fr; }
          .events-grid { grid-template-columns: 1fr; }
          .billing-mode-tabs { flex-direction: column; }
        }
      `}</style>
    </div>
  );
}
