import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { DollarSign, Plus, CalendarDays, Search, Trash2, Edit3, ArrowRight, Tag, Wallet } from 'lucide-react';

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

const CATEGORIES = [
  'Raw Material',
  'Utilities',
  'Maintenance',
  'Staff Advance',
  'Marketing',
  'Rent',
  'Other'
];

export default function ExpensesPage() {
  const { showToast, currency } = useApp();
  const c = currency || '₹';

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
  const [range, setRange] = useState('today');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [expenses, setExpenses] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const [formTitle, setFormTitle] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('Raw Material');
  const [formPaymentMethod, setFormPaymentMethod] = useState('cash');
  const [formDate, setFormDate] = useState(todayStr);
  const [formNotes, setFormNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  const fetchExpenses = () => {
    let start = startDate;
    let end = endDate;
    const now = new Date();

    const formatDateStr = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (range === 'today') {
      start = end = todayStr;
    } else if (range === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      start = formatDateStr(weekAgo);
      end = todayStr;
    } else if (range === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      start = formatDateStr(firstDay);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      end = formatDateStr(lastDay);
    } else if (range === 'all') {
      start = '2020-01-01';
      end = '2099-12-31';
    }

    setLoading(true);
    let url = `/api/expenses?startDate=${start}&endDate=${end}`;
    if (categoryFilter !== 'all') {
      url += `&category=${encodeURIComponent(categoryFilter)}`;
    }

    authFetch(apiUrl(url))
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.expenses)) {
          setExpenses(data.expenses);
          setTotalAmount(data.totalAmount || 0);
        } else {
          setExpenses([]);
          setTotalAmount(0);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch expenses:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchExpenses();
  }, [range, startDate, endDate, categoryFilter]);

  const handleDateChange = (type, val) => {
    setRange('custom');
    if (type === 'start') setStartDate(val);
    else setEndDate(val);
  };

  const openAddModal = () => {
    setEditingExpense(null);
    setFormTitle('');
    setFormAmount('');
    setFormCategory('Raw Material');
    setFormPaymentMethod('cash');
    setFormDate(todayStr);
    setFormNotes('');
    setModalOpen(true);
  };

  const openEditModal = (exp) => {
    setEditingExpense(exp);
    setFormTitle(exp.title || '');
    setFormAmount(String(exp.amount || ''));
    setFormCategory(exp.category || 'Other');
    setFormPaymentMethod(exp.paymentMethod || 'cash');
    setFormDate(exp.businessDate || todayStr);
    setFormNotes(exp.notes || '');
    setModalOpen(true);
  };

  const handleSaveExpense = async (e) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      showToast('Please enter an expense title', 'error');
      return;
    }
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid expense amount', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: formTitle.trim(),
        amount: amt,
        category: formCategory,
        paymentMethod: formPaymentMethod,
        date: formDate,
        notes: formNotes.trim()
      };

      const url = editingExpense ? `/api/expenses/${editingExpense._id}` : '/api/expenses';
      const method = editingExpense ? 'PUT' : 'POST';

      const res = await authFetch(apiUrl(url), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Failed to save expense');

      showToast(editingExpense ? 'Expense updated successfully' : 'Expense added successfully', 'success');
      setModalOpen(false);
      fetchExpenses();
    } catch (err) {
      showToast(err.message || 'Failed to save expense', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExpense = async (id, title) => {
    if (window.confirm(`Are you sure you want to delete expense "${title}"?`)) {
      try {
        const res = await authFetch(apiUrl(`/api/expenses/${id}`), { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed to delete expense');
        showToast('Expense deleted', 'success');
        fetchExpenses();
      } catch (err) {
        showToast(err.message || 'Failed to delete expense', 'error');
      }
    }
  };

  const filteredExpenses = useMemo(() => {
    return (expenses || []).filter(e => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        (e.title || '').toLowerCase().includes(term) ||
        (e.category || '').toLowerCase().includes(term) ||
        (e.notes || '').toLowerCase().includes(term) ||
        (e.createdBy || '').toLowerCase().includes(term)
      );
    });
  }, [expenses, searchTerm]);

  const topCategory = useMemo(() => {
    const catMap = {};
    (expenses || []).forEach(e => {
      catMap[e.category] = (catMap[e.category] || 0) + e.amount;
    });
    let top = 'None';
    let max = 0;
    Object.entries(catMap).forEach(([cat, val]) => {
      if (val > max) {
        max = val;
        top = cat;
      }
    });
    return top;
  }, [expenses]);

  return (
    <div className="fi sales-page">
      <div className="sales-header-res">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="unified-pill-box filter-pills">
            {['today', 'week', 'month', 'all'].map(f => (
              <button key={f} className={`f-pill ${range === f ? 'active' : ''}`} onClick={() => setRange(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className={`unified-pill-box date-box-res ${range === 'custom' ? 'active-border' : ''}`} style={{ gap: 12, paddingLeft: 12, paddingRight: 12 }}>
            <DateField label="From" value={startDate} onChange={e => handleDateChange('start', e.target.value)} inputRef={startInputRef} />
            <ArrowRight size={14} style={{ color: 'var(--t2)', flexShrink: 0 }} />
            <DateField label="To" value={endDate} onChange={e => handleDateChange('end', e.target.value)} inputRef={endInputRef} />
          </div>
        </div>

        <button
          onClick={openAddModal}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px',
            borderRadius: 12, background: 'var(--a)', color: '#000', fontWeight: 800,
            fontSize: 13, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.25)'
          }}
        >
          <Plus size={16} /> Add Expense
        </button>
      </div>

      {/* KPI Cards Row */}
      <div className="kpi-row-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="kpi" style={{ color: 'var(--t0)' }}>
          <div className="kpi-label">Total Expenses</div>
          <div className="kpi-value mono" style={{ color: '#EF4444' }}>
            {loading ? '...' : `${c}${totalAmount.toLocaleString('en-IN')}`}
          </div>
        </div>

        <div className="kpi" style={{ color: 'var(--t0)' }}>
          <div className="kpi-label">Expense Transactions</div>
          <div className="kpi-value mono">{loading ? '...' : (expenses || []).length}</div>
        </div>

        <div className="kpi" style={{ color: 'var(--t0)' }}>
          <div className="kpi-label">Top Expense Category</div>
          <div className="kpi-value" style={{ fontSize: 18, textTransform: 'capitalize' }}>{loading ? '...' : topCategory}</div>
        </div>
      </div>

      {/* Category Filter Pills & Search */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div className="unified-pill-box filter-pills" style={{ overflowX: 'auto', padding: 4 }}>
          <button className={`f-pill ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
            ALL CATEGORIES
          </button>
          {CATEGORIES.map(cat => (
            <button key={cat} className={`f-pill ${categoryFilter === cat ? 'active' : ''}`} onClick={() => setCategoryFilter(cat)}>
              {cat.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="sales-search-box" style={{ width: 240 }}>
          <Search size={14} className="sales-search-icon" />
          <input
            type="text"
            placeholder="Search expense..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="sales-search-input"
          />
        </div>
      </div>

      {/* Expense Table Card */}
      <div className="settings-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="invTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b1)', color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Expense Title</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Payment Method</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Amount ({c})</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ padding: 32, textAlign: 'center', color: 'var(--t2)', fontSize: 14 }}>
                    No expense records found for this period.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map(exp => (
                  <tr key={exp._id} style={{ borderBottom: '1px solid var(--b1)', fontSize: 13 }}>
                    <td style={{ padding: '14px 16px', color: 'var(--t1)' }}>
                      {exp.businessDate || (exp.date ? new Date(exp.date).toLocaleDateString('en-IN') : '-')}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--t0)', fontWeight: 700 }}>
                      {exp.title}
                      {exp.notes && <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 400, marginTop: 2 }}>{exp.notes}</div>}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-block', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                        background: 'rgba(245,158,11,0.12)', color: 'var(--a)'
                      }}>
                        {exp.category}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--t1)', textTransform: 'uppercase', fontSize: 11, fontWeight: 700 }}>
                      {exp.paymentMethod || 'CASH'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 800, color: '#EF4444' }}>
                      {c}{parseFloat(exp.amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        <button
                          onClick={() => openEditModal(exp)}
                          style={{ background: 'none', border: 'none', color: 'var(--t1)', cursor: 'pointer', padding: 4 }}
                          title="Edit Expense"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp._id, exp.title)}
                          style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}
                          title="Delete Expense"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Expense Modal */}
      {modalOpen && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={() => setModalOpen(false)}>
          <div className="mbox" style={{ maxWidth: '440px', width: '92%', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 900, color: 'var(--t0)' }}>
                {editingExpense ? 'Edit Expense' : 'Add New Expense'}
              </h3>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Expense Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Vegetables & Raw Material Purchase"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Amount ({c}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
                    required
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Category</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={e => setFormPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  >
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Date</label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Notes / Remarks (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="Additional details or vendor info..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--b2)', background: 'var(--s2)', color: 'var(--t1)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--a)', color: '#000', fontWeight: 800, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Saving...' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
