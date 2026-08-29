import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { apiUrl, authFetch } from '../lib/api';
import { Tag, TrendingUp, CalendarDays, Search, Percent, CheckCircle2, User, Clock } from 'lucide-react';

const CustomTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tip-head">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tip-row">
          <span className="tip-dot" style={{ background: '#EF4444' }}></span>
          <span className="tip-label" style={{ color: 'var(--t1)' }}>{p.name}:</span>
          <span className="tip-val mono" style={{ color: 'var(--t0)' }}>
            ₹{p.value?.toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  );
};

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
  const { currency = '₹' } = useApp();

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
    dailyData: [],
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
          setData(resData);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch discount analytics:', err);
        setLoading(false);
      });
  }, [range, startDate, endDate, todayStr]);

  const handleDateChange = (type, val) => {
    setRange('custom');
    if (type === 'start') setStartDate(val);
    else setEndDate(val);
  };

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
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Date Range Filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--t0)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <Tag size={22} style={{ color: '#EF4444' }} />
            Discount Analytics
          </h1>
          <p style={{ fontSize: '12.5px', color: 'var(--t2)', marginTop: '2px', margin: 0 }}>
            Comprehensive overview of discounts given across daily, weekly, monthly, and custom time periods.
          </p>
        </div>

        {/* Range Selector Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: '9px', padding: '3px' }}>
            {[
              { id: 'today', label: 'Today' },
              { id: 'week', label: '7 Days' },
              { id: 'month', label: 'This Month' },
              { id: 'all', label: 'All Time' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setRange(tab.id)}
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
            <DateField label="From" value={startDate} onChange={val => handleDateChange('start', val)} inputRef={startInputRef} />
            <span style={{ color: 'var(--t2)', fontSize: '12px' }}>to</span>
            <DateField label="To" value={endDate} onChange={val => handleDateChange('end', val)} inputRef={endInputRef} />
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
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

      {/* Chart Section */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t0)', margin: 0 }}>
            Discount Trend Over Time
          </h3>
          <span style={{ fontSize: '11.5px', color: 'var(--t2)' }}>Daily Aggregates</span>
        </div>

        {loading ? (
          <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', fontSize: '13px' }}>
            Loading trend chart...
          </div>
        ) : (data.dailyData || []).length === 0 ? (
          <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', fontSize: '13px' }}>
            No discount records found for the selected period.
          </div>
        ) : (
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="discountGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--b0)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--t2)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--t2)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip content={<CustomTip />} />
                <Area type="monotone" dataKey="discount" name="Discount" stroke="#EF4444" strokeWidth={2.5} fillOpacity={1} fill="url(#discountGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
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
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
            <input
              type="text"
              placeholder="Search bill #, customer, phone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
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
        <div style={{ overflowX: 'auto' }}>
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
                      {currency}{ord.subtotal.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#EF4444' }}>
                      -{currency}{ord.discount.toLocaleString('en-IN')} {ord.discountPercent > 0 ? `(${ord.discountPercent}%)` : ''}
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
    </div>
  );
}
