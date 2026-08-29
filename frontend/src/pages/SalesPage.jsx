import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { apiUrl, authFetch } from '../lib/api';
import { TrendingUp, Zap, ArrowRight, CalendarDays, Wallet, Wine, Search, Flame } from 'lucide-react';

const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="tip-head">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="tip-row">
          <span className="tip-dot" style={{ background: p.color || 'var(--blue)' }}></span>
          <span className="tip-label" style={{ color: 'var(--t1)' }}>{p.name}:</span>
          <span className="tip-val mono" style={{ color: 'var(--t0)' }}>
            {p.name === 'Qty' ? p.value : `₹${p.value?.toLocaleString('en-IN')}`}
          </span>
        </div>
      ))}
    </div>
  );
};

const PieTip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="chart-tip">
      <div className="tip-row">
        <span className="tip-dot" style={{ background: d.payload?.fill || d.color }}></span>
        <span className="tip-label" style={{ color: 'var(--t1)' }}>{d.name}:</span>
        <span className="tip-val mono" style={{ color: 'var(--t0)' }}>
          ₹{d.value?.toLocaleString('en-IN')}
        </span>
      </div>
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

const PIE_COLORS = ['#10B981', '#F59E0B']; // Green for Cash, Amber for UPI

const RADIAN = Math.PI / 180;
const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  if (percent < 0.05) return null;
  return (
    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function SalesPage() {
  const { settings } = useApp();
  
  const getBusinessTodayStr = () => {
    const d = new Date();
    // 5.5 hours offset for IST in milliseconds
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
  const [shotSearch, setShotSearch] = useState('');
  const startInputRef = useRef(null);
  const endInputRef = useRef(null);

  const [analytics, setAnalytics] = useState({ revenue: 0, count: 0, dailyData: [], paymentBreakdown: { cash: 0, upi: 0 }, shotsStats: { totalShots: 0, totalRevenue: 0, items: [] } });
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
    authFetch(apiUrl(`/api/reports/analytics?startDate=${start}&endDate=${end}`))
      .then(res => res.json())
      .then(data => {
        if (data.revenue !== undefined) {
          setAnalytics(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch analytics:', err);
        setLoading(false);
      });
  }, [range, startDate, endDate, todayStr]);

  const handleDateChange = (type, val) => {
    setRange('custom');
    if (type === 'start') setStartDate(val);
    else setEndDate(val);
  };

  const pieData = useMemo(() => {
    const pb = analytics.paymentBreakdown || { cash: 0, upi: 0 };
    const data = [];
    if (pb.cash > 0) data.push({ name: 'Cash', value: pb.cash });
    if (pb.upi > 0) data.push({ name: 'UPI', value: pb.upi });
    return data;
  }, [analytics.paymentBreakdown]);

  const shotsList = useMemo(() => {
    const items = analytics.shotsStats?.items || [];
    if (!shotSearch.trim()) return items;
    return items.filter(i => (i.name || '').toLowerCase().includes(shotSearch.toLowerCase()));
  }, [analytics.shotsStats, shotSearch]);

  const totalShotsCount = analytics.shotsStats?.totalShots || 0;
  const totalShotsRevenue = analytics.shotsStats?.totalRevenue || 0;

  return (
    <div className="fi sales-page">
      <div className="sales-header-res">
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

      {/* KPI Cards Row */}
      <div className="kpi-row-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
        <div className="kpi" style={{ color: 'var(--t0)' }}>
          <div className="kpi-label">Total Revenue</div>
          <div className="kpi-value mono">{loading ? '...' : `₹${(analytics?.revenue || 0).toLocaleString('en-IN')}`}</div>
        </div>

        <div className="kpi" style={{ color: 'var(--t0)' }}>
          <div className="kpi-label">POS Orders</div>
          <div className="kpi-value mono">{loading ? '...' : (analytics?.orderCount ?? (analytics?.count || 0))}</div>
        </div>

        <div className="kpi" style={{ color: 'var(--t0)', borderLeft: '3px solid #F59E0B' }}>
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#F59E0B' }}>
            <Wine size={13} /> Shots Sold
          </div>
          <div className="kpi-value mono" style={{ color: '#F59E0B' }}>
            {loading ? '...' : `${totalShotsCount} Shots`}
          </div>
        </div>

        <div className="kpi" style={{ color: 'var(--t0)', borderLeft: '3px solid #10B981' }}>
          <div className="kpi-label" style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#10B981' }}>
            <Zap size={13} /> Shots Revenue
          </div>
          <div className="kpi-value mono" style={{ color: '#10B981' }}>
            {loading ? '...' : `₹${totalShotsRevenue.toLocaleString('en-IN')}`}
          </div>
        </div>

        {analytics?.eventCount > 0 && (
          <>
            <div className="kpi" style={{ color: 'var(--t0)' }}>
              <div className="kpi-label">Event Revenue</div>
              <div className="kpi-value mono" style={{ color: 'var(--a)' }}>{loading ? '...' : `₹${(analytics?.eventRevenue || 0).toLocaleString('en-IN')}`}</div>
            </div>
            <div className="kpi" style={{ color: 'var(--t0)' }}>
              <div className="kpi-label">Event Expenses</div>
              <div className="kpi-value mono" style={{ color: '#EF4444' }}>{loading ? '...' : `₹${(analytics?.eventExpenses || 0).toLocaleString('en-IN')}`}</div>
            </div>
          </>
        )}
      </div>

      {/* Charts Row */}
      <div className="charts-equal-row">
        <div className="card chart-box">
          <div className="chart-info"><Zap size={16} style={{ color: 'var(--a)' }} /><span>Revenue Growth</span></div>
          <ResponsiveContainer width="100%" height={280}>
            {loading ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>Loading...</div> : (
              <AreaChart data={analytics.dailyData} margin={{ left: -25, right: 10, top: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--a)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--a)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--b1)" />
                <XAxis dataKey="name" tick={{ fill: 'var(--t1)', fontSize: 10 }} axisLine={{ stroke: 'var(--b2)' }} />
                <YAxis tick={{ fill: 'var(--t1)', fontSize: 10 }} axisLine={{ stroke: 'var(--b2)' }} />
                <Tooltip content={<Tip />} cursor={{ stroke: 'var(--a)', strokeWidth: 1 }} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke="var(--a)" strokeWidth={2.5} fill="url(#areaGrad)" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>

        <div className="card chart-box">
          <div className="chart-info"><Wallet size={16} style={{ color: '#10B981' }} /><span>Payment Breakdown</span></div>
          <ResponsiveContainer width="100%" height={280}>
            {loading ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)' }}>Loading...</div> : (
              pieData.length === 0 ? (
                <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--t2)', fontSize: 13 }}>No payment data</div>
              ) : (
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderLabel}
                    outerRadius={100}
                    innerRadius={45}
                    dataKey="value"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.name === 'Cash' ? PIE_COLORS[0] : PIE_COLORS[1]} />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTip />} />
                  <Legend
                    formatter={(value, entry) => {
                      const item = pieData.find(d => d.name === value);
                      return <span style={{ color: 'var(--t0)', fontSize: 12, fontWeight: 600 }}>{value}: ₹{item ? item.value.toLocaleString('en-IN') : 0}</span>;
                    }}
                  />
                </PieChart>
              )
            )}
          </ResponsiveContainer>
        </div>
      </div>

      {/* Itemized Shots Sales Analytics Card */}
      <div className="card chart-box" style={{ marginTop: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ background: '#F59E0B1A', border: '1px solid #F59E0B33', padding: '6px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Wine size={18} style={{ color: '#F59E0B' }} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--t0)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Shots & Liquor Sales Breakdown
                <span style={{ background: '#F59E0B20', color: '#F59E0B', fontSize: '11px', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                  {totalShotsCount} Shots Total
                </span>
              </h3>
              <span style={{ fontSize: '11.5px', color: 'var(--t2)' }}>
                Detailed itemized record of shots and liquor sold ({range.toUpperCase()})
              </span>
            </div>
          </div>

          <div style={{ position: 'relative', width: '260px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
            <input
              type="text"
              placeholder="Search shot name..."
              value={shotSearch}
              onChange={e => setShotSearch(e.target.value)}
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

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--b2)', color: 'var(--t2)', fontSize: '11.5px' }}>
                <th style={{ padding: '8px 10px' }}>Item Name</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Price</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Shots Sold</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Revenue</th>
                <th style={{ padding: '8px 10px', width: '180px' }}>Sales Share</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--t2)' }}>Loading shots analytics...</td>
                </tr>
              ) : shotsList.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '28px', color: 'var(--t2)' }}>
                    No shots or liquor sales recorded in this period.
                  </td>
                </tr>
              ) : (
                shotsList.map((item, idx) => {
                  const sharePct = totalShotsCount > 0 ? Math.round((item.quantity / totalShotsCount) * 100) : 0;
                  return (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--b0)' }}>
                      <td style={{ padding: '10px', fontWeight: 700, color: 'var(--t0)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Flame size={13} style={{ color: '#F59E0B' }} />
                          <span>{item.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--t1)' }}>
                        ₹{(item.price || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#F59E0B' }}>
                        {item.quantity} Shots
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 800, color: '#10B981' }}>
                        ₹{(item.revenue || 0).toLocaleString('en-IN')}
                      </td>
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, background: 'var(--s2)', borderRadius: '4px', height: '6px', overflow: 'hidden' }}>
                            <div style={{ width: `${sharePct}%`, background: '#F59E0B', height: '100%', borderRadius: '4px', transition: 'width 0.3s' }} />
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--t2)', width: '32px', textAlign: 'right', fontWeight: 600 }}>{sharePct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        .sales-page { display: flex; flex-direction: column; gap: 20px; }
        .sales-header-res { 
          display: flex; 
          align-items: center; 
          flex-wrap: wrap; 
          gap: 12px; 
          width: 100%;
          justify-content: flex-end; /* Aligns items to right on desktop */
        }

        .ph-left { text-align: left; }
        .unified-pill-box { 
          display: flex; 
          align-items: center; 
          background: var(--s2); 
          padding: 4px 8px; 
          border-radius: 14px; 
          border: 1px solid var(--b1); 
          height: 48px; 
        }
        
        .active-border { border-color: var(--a) !important; box-shadow: 0 0 0 1px var(--a); }

        .f-pill { border: none; background: none; color: var(--t2); padding: 8px 16px; border-radius: 10px; font-size: 11px; font-weight: 700; cursor: pointer; transition: 0.2s; }
        .f-pill.active { background: var(--a); color: #000; }

        .d-input {
          background: none;
          border: none;
          color: var(--t0);
          font-size: 12px;
          outline: none;
          min-width: 0;
          width: 100%;
          padding: 0;
          box-shadow: none;
        }
        .unified-date-input::-webkit-calendar-picker-indicator {
          opacity: 0;
          position: absolute;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
        .unified-date-input {
          flex: 1;
          color-scheme: dark;
          font-family: inherit;
          cursor: pointer;
        }
        .lm .unified-date-input {
          color-scheme: light;
        }
        .sales-date-field {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }
        .sales-date-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--t2);
          white-space: nowrap;
        }
        .sales-date-input-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          background: var(--s1);
          border: 1px solid var(--b1);
          border-radius: 8px;
          padding: 0 10px;
          height: 34px;
          min-width: 120px;
        }
        .sales-calendar-icon {
          color: var(--t2);
          cursor: pointer;
        }
        .sales-calendar-icon:hover { color: var(--a); }

        .kpi-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .charts-equal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        .chart-box { padding: 24px; background: var(--s1); border: 1px solid var(--b1); border-radius: var(--rl); min-width: 0; overflow: hidden; }
        .chart-info { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--t0); margin-bottom: 20px; }

        .chart-tip { background: var(--s2); border: 1px solid var(--b2); padding: 12px; border-radius: 10px; }

        @media (max-width: 750px) { 
          .sales-header-res {
            flex-direction: column;
            align-items: stretch;
            justify-content: center;
            gap: 16px;
          }
          .filter-pills {
            width: 100%; 
            justify-content: space-between; 
            flex-wrap: wrap;
            gap: 8px;
            height: auto;
            padding: 8px;
          }
          .f-pill {
            flex: 1;
            text-align: center;
          }
          .date-box-res { 
            flex-direction: row;
            align-items: center;
            gap: 8px; 
            height: auto; 
            padding: 8px; 
            width: 100%;
          }
          .sales-date-field {
            flex: 1;
            justify-content: center;
          }
          .sales-date-input-wrapper {
            flex: 1;
            max-width: none;
            min-width: 0;
            padding: 0 4px;
          }
          .sales-date-label { display: none; }
          .chart-box {
            padding: 16px;
          }
        }

        @media (max-width: 1024px) { 
          .charts-equal-row { grid-template-columns: 1fr; } 
        }
        
        @media (max-width: 480px) {
          .kpi-row-2 { grid-template-columns: 1fr 1fr; gap: 8px; }
          .kpi-row-2 .kpi-label { font-size: 10px; }
          .kpi-row-2 .kpi-value { font-size: 18px; }
        }
      `}</style>
    </div>
  );
}
