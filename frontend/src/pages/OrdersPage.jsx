import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Search, CalendarDays, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { authFetch, apiUrl } from '../lib/api';
import TopNavBar from '../components/TopNavBar';

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
    <div className="date-field">
      <span className="date-field-label">{label}</span>
      <input
        type="date"
        value={value}
        onChange={onChange}
        className="date-picker-clean unified-date-input"
        ref={inputRef}
      />
      <button
        type="button"
        className="calendar-trigger"
        aria-label={`Open ${label} date picker`}
        onClick={triggerPicker}
      >
        <CalendarDays size={15} />
      </button>
    </div>
  );
}

/* Centered Payment Edit Modal (prevents overflow/clipping bugs) */
function PaymentEditModal({ order, currency, onSave, onClose }) {
  const [mode, setMode] = useState(order.paymentMode || order.paymentMethod || 'cash');
  const [cashAmt, setCashAmt] = useState(order.cashAmount ? String(order.cashAmount) : '');
  const [upiAmt, setUpiAmt] = useState(order.upiAmount ? String(order.upiAmount) : '');
  const [dueCustName, setDueCustName] = useState(order.customerName || '');
  const [dueCustPhone, setDueCustPhone] = useState(order.customerPhone || '');
  const [dueAmt, setDueAmt] = useState(order.dueAmount ? String(order.dueAmount) : String(order.grandTotal || 0));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      let cash = 0, upi = 0, dAmt = 0;
      if (mode === 'cash') {
        cash = order.grandTotal;
        upi = 0;
      } else if (mode === 'upi') {
        cash = 0;
        upi = order.grandTotal;
      } else if (mode === 'split') {
        cash = parseFloat(cashAmt) || 0;
        upi = parseFloat(upiAmt) || 0;
        if (Math.abs(cash + upi - order.grandTotal) > 0.02) {
          alert(`Split amounts (₹${(cash + upi).toFixed(0)}) must equal the grand total (₹${order.grandTotal.toFixed(0)})`);
          setSaving(false);
          return;
        }
      } else if (mode === 'due') {
        dAmt = parseFloat(dueAmt) || order.grandTotal;
      }
      await onSave(order._id, mode, cash, upi, dAmt, dueCustName, dueCustPhone);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="mbox" style={{ maxWidth: '380px', width: '92%', padding: '20px', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--t0)' }}>
            HTB-{(order.billNo || '').split('-').pop()} Payment
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--t1)', marginBottom: 16 }}>
          Grand Total: <span style={{ fontWeight: 800, color: 'var(--a)' }}>{currency}{order.grandTotal.toFixed(0)}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
          {['cash', 'upi', 'split', 'due'].map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); if (m !== 'split') { setCashAmt(''); setUpiAmt(''); } }}
              style={{
                padding: '10px 0', borderRadius: 8, fontSize: 11, fontWeight: 700,
                border: mode === m ? '2px solid var(--a)' : '1px solid var(--b2)',
                background: mode === m ? 'rgba(245,158,11,0.12)' : 'var(--s2)',
                color: mode === m ? 'var(--a)' : 'var(--t1)',
                cursor: 'pointer', transition: 'all 0.15s'
              }}
            >
              {m === 'split' ? 'SPLIT' : m === 'due' ? 'PENDING' : m.toUpperCase()}
            </button>
          ))}
        </div>

        {mode === 'split' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Cash {currency}</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={cashAmt}
                onChange={e => {
                  const v = e.target.value;
                  setCashAmt(v);
                  if (v !== '') setUpiAmt(Math.max(0, order.grandTotal - (parseFloat(v) || 0)).toFixed(0));
                  else setUpiAmt('');
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>UPI {currency}</label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="0"
                value={upiAmt}
                onChange={e => {
                  const v = e.target.value;
                  setUpiAmt(v);
                  if (v !== '') setCashAmt(Math.max(0, order.grandTotal - (parseFloat(v) || 0)).toFixed(0));
                  else setCashAmt('');
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
          </div>
        )}

        {mode === 'due' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Customer Name</label>
              <input
                type="text"
                placeholder="Customer name"
                value={dueCustName}
                onChange={e => setDueCustName(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Customer Phone (Optional)</label>
              <input
                type="text"
                placeholder="Phone number"
                value={dueCustPhone}
                onChange={e => setDueCustPhone(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 4 }}>Pending Due Amount ({currency})</label>
              <input
                type="number"
                value={dueAmt}
                onChange={e => setDueAmt(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--b2)',
              background: 'var(--s2)', color: 'var(--t1)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
              background: 'var(--a)', color: '#000', fontSize: 13, fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiscountEditModal({ order, currency, onSave, onClose }) {
  const [discountVal, setDiscountVal] = useState(order.discount ? String(order.discount) : '');
  const [saving, setSaving] = useState(false);

  const serviceTaxVal = order.serviceTax || 0;
  const subtotalAndTax = order.subtotal + order.sgst + order.cgst + serviceTaxVal;
  const newGrandTotal = Math.round(Math.max(0, subtotalAndTax - (parseFloat(discountVal) || 0)));

  const handleSave = async () => {
    const val = parseFloat(discountVal) || 0;
    if (val < 0 || val > subtotalAndTax) {
      alert(`Discount must be between 0 and ${subtotalAndTax.toFixed(0)}`);
      return;
    }

    setSaving(true);
    try {
      await onSave(order._id, val);
      onClose();
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to save discount');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={onClose}>
      <div className="mbox" style={{ maxWidth: '340px', width: '92%', padding: '20px', position: 'relative' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--t0)' }}>
            Edit Discount (HTB-{(order.billNo || '').split('-').pop()})
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ fontSize: '13px', color: 'var(--t1)', marginBottom: 8 }}>
          Subtotal + Tax: <span style={{ fontWeight: 700, color: 'var(--t0)' }}>{currency}{subtotalAndTax.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: '13px', color: 'var(--t1)', marginBottom: 16 }}>
          New Grand Total: <span style={{ fontWeight: 800, color: 'var(--a)' }}>{currency}{newGrandTotal.toFixed(0)}</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 700, display: 'block', marginBottom: 6, textTransform: 'uppercase' }}>
            Discount Amount ({currency})
          </label>
          <textarea
            placeholder="Enter discount amount"
            rows="2"
            value={discountVal}
            onChange={e => setDiscountVal(e.target.value.replace(/[^0-9.]/g, ''))}
            style={{
              width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)',
              background: 'var(--s2)', color: 'var(--t0)', fontSize: 14, fontWeight: 700,
              resize: 'none', fontFamily: 'inherit'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--b2)',
              background: 'var(--s2)', color: 'var(--t1)', fontSize: 13, fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
              background: 'var(--a)', color: '#000', fontSize: 13, fontWeight: 800,
              cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  const { orderHistory, setInvoiceOrder, invoiceOrder, settings, deleteOrder, updateOrderPayment, updateOrderDiscount, role, showToast, loadData, setActiveSection, selectTable, setTableBills } = useApp();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [editingPaymentOrder, setEditingPaymentOrder] = useState(null);
  const [editingDiscountOrder, setEditingDiscountOrder] = useState(null);
  const c = settings.currency;

  const handleReopenBill = async (orderId, billNo) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/reopen-bill/${orderId}`), { method: 'POST' });
      if (!res.ok) {
        showToast('Failed to re-open bill', 'amber');
        return;
      }
      const data = await res.json();
      const order = data.order;
      const tableNo = order?.tableNo;
      const targetTableId = `t${tableNo}`;

      // Populate local table bill state immediately so items show right away
      if (setTableBills && order) {
        const mappedItems = (order.items || []).map(i => ({
          _id: i.menuItemId?._id || i.menuItemId || i._id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          department: i.department || 'kitchen',
          note: i.notes || i.note || ''
        }));

        setTableBills(prev => ({
          ...prev,
          [targetTableId]: {
            items: mappedItems,
            customerName: order.customerName || '',
            customerPhone: order.customerPhone || '',
            discount: order.discount ? String(order.discount) : '',
            isCreditPay: order.isCredit || false,
            paidAmount: order.paidAmount !== undefined ? String(order.paidAmount) : ''
          }
        }));
      }

      showToast(`Bill ${billNo} re-opened for editing on Table ${tableNo}!`, 'green');
      if (loadData) await loadData();
      if (setActiveSection) setActiveSection('billing');
      if (selectTable) selectTable(tableNo);
    } catch (err) {
      console.error('Error reopening bill:', err);
      showToast('Error re-opening bill', 'amber');
    }
  };

  const getCurrentMonthStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthStr);
  const [monthOrders, setMonthOrders] = useState(null);
  const [loadingMonth, setLoadingMonth] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoadingMonth(true);
    authFetch(apiUrl(`/api/orders?month=${selectedMonth}`))
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (isMounted) {
          setMonthOrders(data);
          setLoadingMonth(false);
        }
      })
      .catch(err => {
        console.error('Failed to load month orders:', err);
        if (isMounted) setLoadingMonth(false);
      });
    return () => { isMounted = false; };
  }, [selectedMonth, orderHistory]);

  const activeOrdersList = useMemo(() => {
    const listMap = new Map();
    (Array.isArray(orderHistory) ? orderHistory : []).forEach(o => {
      if (o && o._id && o.billNo) listMap.set(String(o._id), o);
    });
    (Array.isArray(monthOrders) ? monthOrders : []).forEach(o => {
      if (o && o._id && o.billNo) listMap.set(String(o._id), o);
    });
    return Array.from(listMap.values());
  }, [monthOrders, orderHistory]);

  const formatMonthLabel = (ymStr) => {
    if (!ymStr) return '';
    const [y, m] = ymStr.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    let prevY = y;
    let prevM = m - 1;
    if (prevM < 1) {
      prevM = 12;
      prevY -= 1;
    }
    setSelectedMonth(`${prevY}-${String(prevM).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    let nextY = y;
    let nextM = m + 1;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setSelectedMonth(`${nextY}-${String(nextM).padStart(2, '0')}`);
  };

  const isCurrentOrFutureMonth = (ymStr) => ymStr >= getCurrentMonthStr();

  const getLocalDateString = (dateObj) => {
    if (!dateObj) return '';
    const d = new Date(dateObj);
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

  const formatBusinessDate = (dateStr) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };
  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  const handleDeleteOrder = async (id, billNo) => {
    const displayBillNo = billNo ? `HTB-${billNo.split('-').pop()}` : 'this order';
    if (window.confirm(`Are you sure you want to delete order ${displayBillNo}?`)) {
      try {
        await deleteOrder(id);
        setMonthOrders(prev => prev ? prev.filter(o => o._id !== id) : null);
        showToast('Order deleted successfully', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to delete order', 'error');
      }
    }
  };

  const handlePaymentSave = async (orderId, paymentMode, cashAmount, upiAmount, dueAmount, custName, custPhone) => {
    try {
      if (paymentMode === 'due' || paymentMode === 'pending') {
        const res = await authFetch(apiUrl(`/api/orders/${orderId}/payment-status`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: 'due',
            paymentMode: 'due',
            dueAmount: dueAmount !== undefined ? dueAmount : undefined,
            customerName: custName,
            customerPhone: custPhone
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || data.error || 'Failed to update to pending');
        showToast('Bill marked as Pending / Due', 'success');
        fetchOrders();
        return;
      }
      const updated = await updateOrderPayment(orderId, paymentMode, cashAmount, upiAmount);
      if (updated && monthOrders) {
        setMonthOrders(prev => prev.map(o => o._id === orderId ? { ...o, paymentMode: updated.paymentMode, cashAmount: updated.cashAmount, upiAmount: updated.upiAmount } : o));
      }
      fetchOrders();
      showToast('Payment mode updated', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update payment', 'error');
    }
  };

  const handleDiscountSave = async (orderId, discount) => {
    try {
      const updated = await updateOrderDiscount(orderId, discount);
      if (updated && monthOrders) {
        setMonthOrders(prev => prev.map(o => o._id === orderId ? updated : o));
      }
      showToast('Discount updated successfully', 'success');
    } catch (err) {
      showToast(err.message || 'Failed to update discount', 'error');
    }
  };

  const filtered = useMemo(() => {
    const list = (Array.isArray(activeOrdersList) ? activeOrdersList : []).filter(o => {
      if (!o.billNo || o.billNo.trim() === '') return false;
      const localDateStr = o.businessDate || getLocalDateString(o.date);
      const matchDate = (!startDate || localDateStr >= startDate) && (!endDate || localDateStr <= endDate);
      const matchSearch = !search ||
        (o.billNo && o.billNo.toLowerCase().includes(search.toLowerCase())) ||
        (o.customerName || 'Walk-in Customer').toLowerCase().includes(search.toLowerCase());
      return matchDate && matchSearch;
    });

    return list.sort((a, b) => {
      const aBiz = a.businessDate || getLocalDateString(a.date || a.createdAt);
      const bBiz = b.businessDate || getLocalDateString(b.date || b.createdAt);

      if (aBiz !== bBiz) {
        return bBiz.localeCompare(aBiz);
      }

      const aNo = a.billNo || '';
      const bNo = b.billNo || '';

      const aMatch = aNo.match(/HTB-(\d+)/);
      const bMatch = bNo.match(/HTB-(\d+)/);

      const aNum = aMatch ? parseInt(aMatch[1], 10) : 0;
      const bNum = bMatch ? parseInt(bMatch[1], 10) : 0;

      return bNum - aNum;
    });
  }, [activeOrdersList, search, startDate, endDate]);

  const payBadge = (mode, order) => {
    const cls = { cash: 'badge-cash', card: 'badge-card', upi: 'badge-upi', split: 'badge-split' };

    const handleBadgeClick = (e) => {
      e.stopPropagation();
      setEditingPaymentOrder(order);
    };

    if (mode === 'split' && order) {
      return (
        <span
          className="badge badge-split"
          style={{ cursor: 'pointer' }}
          onClick={handleBadgeClick}
          title={`Cash: ${c}${(order.cashAmount || 0).toFixed(0)}, UPI: ${c}${(order.upiAmount || 0).toFixed(0)}`}
        >
          SPLIT (C:{(order.cashAmount || 0).toFixed(0)} U:{(order.upiAmount || 0).toFixed(0)})
        </span>
      );
    }
    return (
      <span
        className={`badge ${cls[mode] || 'badge-cash'}`}
        style={{ cursor: 'pointer' }}
        onClick={handleBadgeClick}
      >
        {mode?.toUpperCase()}
      </span>
    );
  };

  return (
    <div className="fi fade-in orders-container">

      {/* MONTH PAGINATION BAR */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        background: 'var(--s1)',
        borderRadius: '12px',
        border: '1px solid var(--b1)',
        marginBottom: 12
      }}>
        <button
          className="btn btn-sm btn-subtle"
          onClick={handlePrevMonth}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', cursor: 'pointer' }}
          title="Previous Month"
        >
          <ChevronLeft size={16} />
          <span>Previous</span>
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800, color: 'var(--t0)' }}>
          <CalendarDays size={16} style={{ color: 'var(--a)' }} />
          <span>{formatMonthLabel(selectedMonth)}</span>
          {loadingMonth && <span style={{ fontSize: '11px', color: 'var(--a)' }}>(Loading...)</span>}
        </div>

        <button
          className="btn btn-sm btn-subtle"
          onClick={handleNextMonth}
          disabled={isCurrentOrFutureMonth(selectedMonth)}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px',
            cursor: isCurrentOrFutureMonth(selectedMonth) ? 'not-allowed' : 'pointer',
            opacity: isCurrentOrFutureMonth(selectedMonth) ? 0.4 : 1
          }}
          title="Next Month"
        >
          <span>Next</span>
          <ChevronRight size={16} />
        </button>
      </div>

      {/* FILTER BAR - FIXED ALIGNMENT */}
      <div className="orders-filters-row">
        <div className="search-wrapper-unified">
          <Search size={16} className="search-icon" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search bill no. or customer..."
            className="search-input-unified"
          />
          {search && (
            <button className="search-clear-btn" onClick={() => { setSearch(''); }} title="Clear search">
              <X size={14} />
            </button>
          )}
        </div>

        <div
          className="date-group-unified"
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 4,
            position: 'relative'
          }}
        >
          {/* From */}
          <div style={{ flex: 1 }}>
            <DateField
              label="From"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              inputRef={startInputRef}
            />
          </div>

          {/* To */}
          <div style={{ flex: 1 }}>
            <DateField
              label="To"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              inputRef={endInputRef}
            />
          </div>

          {/* Clear Button */}
          {(startDate || endDate || search) && (
            <button
              className="clear-filter-btn"
              onClick={() => {
                setSearch('');
                setStartDate('');
                setEndDate('');
              }}
              style={{
                height: 36,
                width: 36,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                marginBottom: 2, // aligns with input baseline
                opacity: 0.8,
                transition: 'all 0.2s ease'
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* MOBILE LIST VIEW */}
      <div className="mobile-orders-list">
        {filtered.length === 0 ? <div className="empty-msg">No orders found</div> :
          filtered.map(o => (
            <div key={o._id} className="order-mobile-card" onClick={() => setInvoiceOrder(o)}>
              <div className="order-card-row">
                <div>
                  <div className="bill-no-tag">HTB-{(o.billNo || '').split('-').pop()}</div>
                  <div className="card-meta">{formatBusinessDate(o.businessDate || getLocalDateString(o.date))} · Table {o.tableNo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="card-total">{c}{o.grandTotal.toFixed(0)}</div>
                  {payBadge(o.paymentMode, o)}
                </div>
              </div>
              <div className="card-footer-info">
                <span className="cust-name-card">{o.customerName || 'Walk-in Customer'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                    onClick={(e) => { e.stopPropagation(); setInvoiceOrder(o); }}
                  >
                    View Bill
                  </button>
                  <button
                    className="btn btn-amber btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', height: '24px', background: 'var(--a)', color: '#000', fontWeight: 800 }}
                    onClick={(e) => { e.stopPropagation(); handleReopenBill(o._id, o.billNo); }}
                  >
                    Re-open Bill
                  </button>
                  <button
                    className="btn btn-blue btn-sm"
                    style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                    onClick={(e) => { e.stopPropagation(); setEditingDiscountOrder(o); }}
                  >
                    Edit
                  </button>
                  {role === 'admin' && (
                    <button
                      className="btn btn-danger btn-sm"
                      style={{ padding: '2px 8px', fontSize: '11px', height: '24px' }}
                      onClick={(e) => { e.stopPropagation(); handleDeleteOrder(o._id, o.billNo); }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        }
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="desktop-orders-table">
        <div className="card-table-wrapper">
          <table className="dtable">
            <thead>
              <tr>
                <th>Date</th><th>Bill No.</th><th style={{ textAlign: 'center' }}>Table</th>
                <th>Customer</th><th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'center' }}>Mode</th>
                <th style={{ textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o._id}>
                  <td className="td-date">{formatBusinessDate(o.businessDate || getLocalDateString(o.date))}</td>
                  <td style={{ fontWeight: 700 }}>HTB-{(o.billNo || '').split('-').pop()}</td>
                  <td style={{ textAlign: 'center' }}>T{o.tableNo}</td>
                  <td className="td-date">{o.customerName || 'Walk-in Customer'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--a)' }}>{c}{o.grandTotal.toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>{payBadge(o.paymentMode, o)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => setInvoiceOrder(o)}>View Bill</button>
                      <button className="btn btn-amber btn-sm" style={{ background: 'var(--a)', color: '#000', fontWeight: 800 }} onClick={() => handleReopenBill(o._id, o.billNo)}>Re-open Bill</button>
                      <button className="btn btn-blue btn-sm" onClick={() => setEditingDiscountOrder(o)}>Edit</button>
                      {role === 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteOrder(o._id, o.billNo)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Edit Modal Overlay */}
      {editingPaymentOrder && (
        <PaymentEditModal
          order={editingPaymentOrder}
          currency={c}
          onSave={handlePaymentSave}
          onClose={() => setEditingPaymentOrder(null)}
        />
      )}

      {/* Discount Edit Modal Overlay */}
      {editingDiscountOrder && (
        <DiscountEditModal
          order={editingDiscountOrder}
          currency={c}
          onSave={handleDiscountSave}
          onClose={() => setEditingDiscountOrder(null)}
        />
      )}
    </div>
  );
}
