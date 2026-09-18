import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { Tag, TrendingUp, CalendarDays, Search, Percent, CheckCircle2, User, Clock, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';

function DateField({ value, onChange, inputRef, label, max }) {
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
    <div
      onClick={triggerPicker}
      className="custom-date-field"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--s2)',
        border: '1px solid var(--b2)',
        borderRadius: '8px',
        padding: '5px 10px',
        fontSize: '12px',
        color: 'var(--t0)',
        cursor: 'pointer',
        userSelect: 'none'
      }}
    >
      <CalendarDays size={13} style={{ color: 'var(--a)' }} />
      <span style={{ color: 'var(--t2)', fontSize: '11px' }}>{label}:</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
      <input
        ref={inputRef}
        type="date"
        value={value}
        max={max}
        onChange={e => onChange(e.target.value)}
        style={{
          position: 'absolute',
          opacity: 0,
          pointerEvents: 'none',
          width: 0,
          height: 0
        }}
      />
    </div>
  );
}

export default function DiscountsPage() {
  const { currency = '₹', setActiveSection } = useApp();

  const getBusinessTodayStr = () => {
    const now = new Date();
    const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istOffset = 5.5 * 3600000;
    const istDate = new Date(utcTime + istOffset);

    let year = istDate.getFullYear();
    let month = istDate.getMonth();
    let dateVal = istDate.getDate();
    let hour = istDate.getHours();

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
  const [searchTerm, setSearchTerm] = useState('');
  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  const [data, setData] = useState({
    totalDiscount: 0,
    count: 0,
    avgDiscount: 0,
    maxDiscount: 0,
    orders: []
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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
    authFetch(apiUrl(`/api/reports/discounts?startDate=${start}&endDate=${end}`))
      .then(res => res.json())
      .then(resData => {
        if (resData.totalDiscount !== undefined) {
          const non100Orders = (resData.orders || []).filter(o => {
            const is100Pct = (o.discountPercent !== undefined && o.discountPercent !== null && o.discountPercent >= 100) ||
              (((o.grandTotal || 0) - (o.fine || 0)) <= 1 && (o.discount || 0) > 0);
            return !is100Pct;
          });
          const totalDiscount = non100Orders.reduce((sum, o) => sum + (o.discount || 0), 0);
          const count = non100Orders.length;
          const avgDiscount = count > 0 ? Math.round(totalDiscount / count) : 0;
          const maxDiscount = non100Orders.reduce((max, o) => Math.max(max, o.discount || 0), 0);
          setData({
            ...resData,
            totalDiscount,
            count,
            avgDiscount,
            maxDiscount,
            orders: non100Orders
          });
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch discount analytics:', err);
        setLoading(false);
      });
  }, [range, startDate, endDate, todayStr]);

  const handleRangeSelect = (f) => {
    setRange(f);
    const now = new Date();
    const formatDateStr = (d) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    };

    if (f === 'today') {
      setStartDate(todayStr);
      setEndDate(todayStr);
    } else if (f === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      setStartDate(formatDateStr(weekAgo));
      setEndDate(todayStr);
    } else if (f === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(formatDateStr(firstDay));
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const lastDayStr = formatDateStr(lastDay);
      setEndDate(lastDayStr > todayStr ? todayStr : lastDayStr);
    } else if (f === 'all') {
      setStartDate('2020-01-01');
      setEndDate(todayStr);
    }
  };

  const handleDateChange = (type, val) => {
    if (!val) return;
    const clampedVal = val > todayStr ? todayStr : val;
    let newStart = type === 'start' ? clampedVal : startDate;
    let newEnd = type === 'end' ? clampedVal : endDate;

    if (newStart > newEnd) {
      if (type === 'start') newEnd = newStart;
      else newStart = newEnd;
    }

    setStartDate(newStart);
    setEndDate(newEnd);

    if (newStart === todayStr && newEnd === todayStr) {
      setRange('today');
    } else {
      setRange('custom');
    }
  };

  // Step backward or forward by offset (e.g. -1 for previous day, +1 for next day)
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

    let curStart = startDate;
    let curEnd = endDate;

    if (range === 'today') {
      curStart = todayStr;
      curEnd = todayStr;
    }

    // Never advance into future beyond today
    if (offset > 0 && curEnd >= todayStr) return;

    const nextStart = addDays(curStart, offset);
    const nextEnd = addDays(curEnd, offset);

    if (offset > 0 && nextEnd > todayStr) return;

    setStartDate(nextStart);
    setEndDate(nextEnd);

    if (nextStart === todayStr && nextEnd === todayStr) {
      setRange('today');
    } else {
      setRange('custom');
    }
  };

  const isNextDisabled = range === 'today' || endDate >= todayStr;

  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return data.orders || [];
    const term = searchTerm.toLowerCase();
    return (data.orders || []).filter(o =>
      (o.billNo && o.billNo.toLowerCase().includes(term)) ||
      (o.customerName && o.customerName.toLowerCase().includes(term)) ||
      (o.customerPhone && o.customerPhone.toLowerCase().includes(term)) ||
      (o.tableNo && String(o.tableNo).includes(term)) ||
      (o.waiterName && o.waiterName.toLowerCase().includes(term))
    );
  }, [data.orders, searchTerm]);

  return (
    <div style={{ padding: 'clamp(10px, 2vw, 16px)', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {/* Date Range & Filter Controls Bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        {/* Range Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: '9px', padding: '3px' }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'Week' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => handleRangeSelect(tab.id)}
                style={{
                  background: range === tab.id ? 'var(--a)' : 'transparent',
                  color: range === tab.id ? '#000000' : 'var(--t1)',
                  fontWeight: range === tab.id ? 800 : 600,
                  border: 'none',
                  borderRadius: '7px',
                  padding: '6px 14px',
                  fontSize: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {/* Left arrow: Previous Day */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleStepDate(-1);
              }}
              className="btn btn-ghost date-nav-btn"
              style={{
                padding: '6px 8px',
                borderRadius: '8px',
                border: '1px solid var(--b2)',
                background: 'var(--s2)',
                color: 'var(--t0)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                height: '32px',
                width: '32px',
                flexShrink: 0
              }}
              title="Previous Day"
            >
              <ChevronLeft size={16} />
            </button>

            <DateField label="From" value={startDate} onChange={val => handleDateChange('start', val)} max={todayStr} inputRef={startInputRef} />
            <span style={{ color: 'var(--t2)', fontSize: '12px' }}>to</span>
            <DateField label="To" value={endDate} onChange={val => handleDateChange('end', val)} max={todayStr} inputRef={endInputRef} />

            {/* Right arrow: Next Day */}
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
                borderRadius: '8px',
                border: '1px solid var(--b2)',
                background: 'var(--s2)',
                color: 'var(--t0)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '32px',
                width: '32px',
                flexShrink: 0,
                opacity: isNextDisabled ? 0.25 : 1,
                cursor: isNextDisabled ? 'not-allowed' : 'pointer'
              }}
              title={isNextDisabled ? "Cannot select future dates" : "Next Day"}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
        {/* Total Discount */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--t2)', fontWeight: 600 }}>
            <span>Total Discount Given</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', borderRadius: '6px', padding: '4px 6px', display: 'flex' }}>
              <Tag size={14} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#EF4444' }}>
            {currency}{data.totalDiscount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Total value of discounts granted</div>
        </div>

        {/* Discounted Orders Count */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--t2)', fontWeight: 600 }}>
            <span>Discounted Orders</span>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', borderRadius: '6px', padding: '4px 6px', display: 'flex' }}>
              <Percent size={14} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--t0)' }}>
            {data.count}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Orders with discount &gt; 0</div>
        </div>

        {/* Average Discount */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--t2)', fontWeight: 600 }}>
            <span>Avg Discount / Order</span>
            <div style={{ background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', borderRadius: '6px', padding: '4px 6px', display: 'flex' }}>
              <TrendingUp size={14} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--t0)' }}>
            {currency}{data.avgDiscount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Average discount per order</div>
        </div>

        {/* Max Single Discount */}
        <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--t2)', fontWeight: 600 }}>
            <span>Max Single Discount</span>
            <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', borderRadius: '6px', padding: '4px 6px', display: 'flex' }}>
              <CheckCircle2 size={14} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--t0)' }}>
            {currency}{data.maxDiscount.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Highest discount on a single bill</div>
        </div>
      </div>

      {/* Breakdown Table Section */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t0)', margin: 0 }}>
              Itemized Discounted Orders ({filteredOrders.length})
            </h3>
            <span style={{ fontSize: '11.5px', color: 'var(--t2)' }}>Complete record of bills where discount was applied</span>
          </div>

          {/* Search Bar */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
            <input
              type="text"
              placeholder="Search bill #, customer, phone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setSearchTerm('');
                if (e.key === 'Enter') e.target.blur();
              }}
              style={{
                width: '100%',
                background: 'var(--s2)',
                border: '1px solid var(--b2)',
                borderRadius: '8px',
                padding: '6px 10px 6px 30px',
                fontSize: '12px',
                color: 'var(--t0)',
                outline: 'none'
              }}
            />
          </div>
        </div>

        {/* Orders Table */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--b2)', color: 'var(--t2)', fontSize: '11.5px' }}>
                <th style={{ padding: '8px 10px' }}>Bill #</th>
                <th style={{ padding: '8px 10px' }}>Customer</th>
                <th style={{ padding: '8px 10px' }}>Date & Time</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Bill</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Discount</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Paid Bill</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Staff</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '24px', color: 'var(--t2)' }}>Loading discounted orders...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '28px', color: 'var(--t2)' }}>No matching discount records found.</td>
                </tr>
              ) : (
                filteredOrders.map((ord, idx) => (
                  <tr key={ord._id || idx} style={{ borderBottom: '1px solid var(--b0)', transition: 'background 0.15s' }}>
                    <td style={{ padding: '10px', fontWeight: 800, color: 'var(--t0)' }}>
                      {ord.billNo} <span style={{ color: 'var(--t2)', fontWeight: 600, fontSize: '11.5px' }}>(Table {ord.tableNo})</span>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--t1)', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={13} style={{ color: 'var(--t2)' }} />
                        <span>{ord.customerName}</span>
                        {ord.customerPhone && <span style={{ color: 'var(--t2)', fontSize: '11px' }}>({ord.customerPhone})</span>}
                      </div>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--t2)', fontSize: '11.5px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        <span>{new Date(ord.date).toLocaleDateString()} {new Date(ord.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--t1)' }}>
                      {currency}{Math.round((ord.grandTotal || 0) + (ord.discount || 0)).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#EF4444' }}>
                      -{currency}{ord.discount.toLocaleString('en-IN')} {ord.discountPercent > 0 ? `(${Math.round(ord.discountPercent)}%)` : ''}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#10B981' }}>
                      {currency}{ord.grandTotal.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', color: 'var(--t2)', fontSize: '11.5px' }}>
                      {ord.waiterName || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .date-nav-btn {
          transition: all 0.2s var(--ease);
        }
        .date-nav-btn:hover:not(:disabled) {
          background: var(--s3) !important;
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
