import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { Plus, CalendarDays, Trash2, Edit3, ArrowRight } from 'lucide-react';

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

  const [expenses, setExpenses] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);

  const [formTitle, setFormTitle] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCategory, setFormCategory] = useState('Raw Material');
  const [formPaymentMethod, setFormPaymentMethod] = useState('cash');
  const [formPersonName, setFormPersonName] = useState('');
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

  // ESC key to close add/edit modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (modalOpen) {
          e.preventDefault();
          setModalOpen(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen]);

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
    setFormPersonName('');
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
    setFormPersonName(exp.personName || '');
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
        personName: formPersonName.trim(),
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

  return (
    <div className="fi expenses-page" style={{ maxWidth: '1400px', margin: '0 auto', padding: 'clamp(10px, 2vw, 16px)' }}>
      {/* Top Controls: Range Pills, Date Pickers, Add Button */}
      <div className="expenses-header-res" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 10, flex: 1 }}>
          <div className="unified-pill-box filter-pills">
            {['today', 'week', 'month', 'all'].map(f => (
              <button key={f} className={`f-pill ${range === f ? 'active' : ''}`} onClick={() => setRange(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>

          <div className={`unified-pill-box date-box-res ${range === 'custom' ? 'active-border' : ''}`} style={{ gap: 10, paddingLeft: 10, paddingRight: 10 }}>
            <DateField label="From" value={startDate} onChange={e => handleDateChange('start', e.target.value)} inputRef={startInputRef} />
            <ArrowRight size={14} style={{ color: 'var(--t2)', flexShrink: 0 }} />
            <DateField label="To" value={endDate} onChange={e => handleDateChange('end', e.target.value)} inputRef={endInputRef} />
          </div>
        </div>

        <button
          onClick={openAddModal}
          className="btn-add-expense-responsive"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px',
            borderRadius: 10, background: 'var(--a)', color: '#000', fontWeight: 800,
            fontSize: 13, border: 'none', cursor: 'pointer', boxShadow: '0 4px 12px rgba(245,158,11,0.25)'
          }}
        >
          <Plus size={16} /> <span>Add Expense</span>
        </button>
      </div>

      {/* Total Expense KPI Card */}
      <div style={{ marginBottom: 16 }}>
        <div className="kpi expense-kpi-card" style={{ color: 'var(--t0)', maxWidth: '320px', padding: '16px 20px', borderRadius: '14px', background: 'var(--s2)', border: '1px solid var(--b2)' }}>
          <div className="kpi-label" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--t2)' }}>Total Expenses</div>
          <div className="kpi-value mono" style={{ color: '#EF4444', fontSize: 26, fontWeight: 900, marginTop: 4 }}>
            {loading ? '...' : `${c}${totalAmount.toLocaleString('en-IN')}`}
          </div>
        </div>
      </div>

      {/* Category Filter Pills (No search box) */}
      <div style={{ marginBottom: 16 }}>
        <div className="unified-pill-box filter-pills expense-cat-scroll" style={{ overflowX: 'auto', padding: 4, maxWidth: '100%', WebkitOverflowScrolling: 'touch' }}>
          <button className={`f-pill ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => setCategoryFilter('all')}>
            ALL CATEGORIES
          </button>
          {CATEGORIES.map(cat => (
            <button key={cat} className={`f-pill ${categoryFilter === cat ? 'active' : ''}`} onClick={() => setCategoryFilter(cat)}>
              {cat.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="settings-card expenses-desktop-view" style={{ padding: 0, overflow: 'hidden', border: '1px solid var(--b2)', borderRadius: '12px' }}>
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table className="invTable" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b1)', color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Expense Title</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Person Name</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '14px 16px', textAlign: 'left' }}>Payment Method</th>
                <th style={{ padding: '14px 16px', textAlign: 'right' }}>Amount ({c})</th>
                <th style={{ padding: '14px 16px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: 32, textAlign: 'center', color: 'var(--t2)', fontSize: 14 }}>
                    No expense records found for this period.
                  </td>
                </tr>
              ) : (
                expenses.map(exp => (
                  <tr key={exp._id} style={{ borderBottom: '1px solid var(--b1)', fontSize: 13 }}>
                    <td style={{ padding: '14px 16px', color: 'var(--t1)' }}>
                      {exp.businessDate || (exp.date ? new Date(exp.date).toLocaleDateString('en-IN') : '-')}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--t0)', fontWeight: 700 }}>
                      {exp.title}
                      {exp.notes && <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 400, marginTop: 2 }}>{exp.notes}</div>}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--t0)', fontWeight: 600 }}>
                      {exp.personName ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--t0)' }}>
                          👤 {exp.personName}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--t2)', fontSize: 12 }}>—</span>
                      )}
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

      {/* MOBILE CARD VIEW */}
      <div className="expenses-mobile-view">
        {expenses.length === 0 ? (
          <div className="card card-p" style={{ textAlign: 'center', color: 'var(--t2)', padding: '28px 16px' }}>
            No expense records found for this period.
          </div>
        ) : (
          expenses.map(exp => (
            <div key={exp._id} className="card card-p expense-mob-card" style={{ padding: '14px', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--t0)', lineHeight: 1.3 }}>{exp.title}</div>
                  {exp.notes && <div style={{ fontSize: 12, color: 'var(--t2)', marginTop: 2 }}>{exp.notes}</div>}
                </div>
                <div className="mono" style={{ fontSize: 16, fontWeight: 800, color: '#EF4444', whiteSpace: 'nowrap' }}>
                  {c}{parseFloat(exp.amount || 0).toLocaleString('en-IN')}
                </div>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11 }}>
                <span style={{
                  padding: '2px 7px', borderRadius: 6, fontWeight: 700,
                  background: 'rgba(245,158,11,0.12)', color: 'var(--a)'
                }}>
                  {exp.category}
                </span>

                <span style={{
                  padding: '2px 7px', borderRadius: 6, fontWeight: 700,
                  background: 'var(--s3)', color: 'var(--t1)', textTransform: 'uppercase'
                }}>
                  {exp.paymentMethod || 'CASH'}
                </span>

                <span style={{ color: 'var(--t2)', marginLeft: 'auto' }}>
                  {exp.businessDate || (exp.date ? new Date(exp.date).toLocaleDateString('en-IN') : '-')}
                </span>
              </div>

              {exp.personName && (
                <div style={{ fontSize: 12, color: 'var(--t1)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ color: 'var(--t2)' }}>Given to:</span>
                  <strong>{exp.personName}</strong>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--b1)', paddingTop: 8 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', fontSize: 12 }}
                  onClick={() => openEditModal(exp)}
                >
                  <Edit3 size={13} /> Edit
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0', fontSize: 12 }}
                  onClick={() => handleDeleteExpense(exp._id, exp.title)}
                >
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Expense Modal */}
      {modalOpen && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={() => setModalOpen(false)}>
          <div className="mbox expense-modal-box" style={{ maxWidth: '440px', width: '92%', padding: '20px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 900, color: 'var(--t0)' }}>
                {editingExpense ? 'Edit Expense' : 'Add New Expense'}
              </h3>
              <button onClick={() => setModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', fontSize: 16, padding: 4 }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveExpense} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Expense Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Vegetables & Raw Material"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Person Name (Given To / Vendor)</label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Kumar / Vendor Name"
                  value={formPersonName}
                  onChange={e => setFormPersonName(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                />
              </div>

              <div className="expense-form-row" style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Amount ({c}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={formAmount}
                    onChange={e => setFormAmount(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
                    required
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Category</label>
                  <select
                    value={formCategory}
                    onChange={e => setFormCategory(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="expense-form-row" style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Payment Method</label>
                  <select
                    value={formPaymentMethod}
                    onChange={e => setFormPaymentMethod(e.target.value)}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
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
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Notes / Remarks (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="Additional details or notes..."
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
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

      {/* Responsive Styles for Expenses Page */}
      <style>{`
        .expenses-cat-scroll::-webkit-scrollbar {
          height: 4px;
        }
        .expenses-cat-scroll::-webkit-scrollbar-thumb {
          background: var(--b2);
          border-radius: 4px;
        }

        @media (max-width: 768px) {
          .expenses-desktop-view {
            display: none !important;
          }
          .expenses-mobile-view {
            display: flex !important;
            flex-direction: column;
            gap: 10px;
          }
          .expenses-header-res {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .btn-add-expense-responsive {
            width: 100%;
            padding: 11px 0 !important;
          }
          .expense-kpi-card {
            max-width: 100% !important;
            width: 100%;
          }
          .expense-mob-card {
            background: var(--s2);
            border: 1px solid var(--b2);
          }
          .expense-form-row {
            flex-direction: column !important;
            gap: 10px !important;
          }
        }

        @media (min-width: 769px) {
          .expenses-desktop-view {
            display: block !important;
          }
          .expenses-mobile-view {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
