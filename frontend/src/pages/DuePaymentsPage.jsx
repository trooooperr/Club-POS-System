import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { Clock, Search, Wallet, User, Phone, CheckCircle2, AlertCircle, DollarSign, X } from 'lucide-react';

export default function DuePaymentsPage() {
  const { settings, showToast, loadData, currency = '₹' } = useApp();

  const [data, setData] = useState({ totalDue: 0, count: 0, orders: [] });
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'pending', 'partial'
  const [searchTerm, setSearchTerm] = useState('');

  // Settlement Modal State
  const [settleOrder, setSettleOrder] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('cash');
  const [settling, setSettling] = useState(false);

  const fetchDuePayments = () => {
    setLoading(true);
    authFetch(apiUrl('/api/orders/due-payments'))
      .then(res => res.json())
      .then(resData => {
        if (resData.orders) {
          setData(resData);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch due payments:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDuePayments();
  }, []);

  const filteredOrders = useMemo(() => {
    let list = data.orders || [];

    if (filterTab === 'pending') {
      list = list.filter(o => o.paymentStatus === 'pending' || o.paidAmount === 0 || o.grandTotal === 1);
    } else if (filterTab === 'partial') {
      list = list.filter(o => o.paymentStatus === 'partial' && o.paidAmount > 0);
    }

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(o =>
        (o.customerName && o.customerName.toLowerCase().includes(term)) ||
        (o.customerPhone && o.customerPhone.toLowerCase().includes(term)) ||
        (o.billNo && o.billNo.toLowerCase().includes(term)) ||
        (o.tableNo && String(o.tableNo).includes(term))
      );
    }

    return list;
  }, [data.orders, filterTab, searchTerm]);

  const openSettleModal = (order) => {
    setSettleOrder(order);
    setSettleAmount(String(order.dueAmount || 0));
    setPaymentMode('cash');
  };

  const handleSettleSubmit = async (e) => {
    e.preventDefault();
    if (!settleOrder) return;
    const amt = parseFloat(settleAmount) || 0;
    if (amt <= 0) {
      showToast('Please enter a valid settlement amount', 'amber');
      return;
    }
    if (amt > (settleOrder.dueAmount || 0)) {
      showToast(`Amount cannot exceed due balance of ${currency}${settleOrder.dueAmount}`, 'amber');
      return;
    }

    setSettling(true);
    try {
      const res = await authFetch(apiUrl(`/api/orders/${settleOrder._id}/settle-due`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amt, paymentMode })
      });
      if (!res.ok) {
        const errData = await res.json();
        showToast(errData.message || 'Failed to settle payment', 'amber');
        setSettling(false);
        return;
      }

      showToast(`Settled ${currency}${amt} for Bill ${settleOrder.billNo}!`, 'green');
      setSettleOrder(null);
      setSettling(false);
      fetchDuePayments();
      if (loadData) loadData();
    } catch (err) {
      console.error('Error settling payment:', err);
      showToast('Failed to settle payment', 'amber');
      setSettling(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filters & Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ fontSize: '12.5px', color: 'var(--t2)', margin: 0 }}>
            Track and settle customer pay-later & credit balances.
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: '9px', padding: '3px' }}>
            {[
              { id: 'all', label: 'All Due' },
              { id: 'pending', label: 'Unpaid (Pending)' },
              { id: 'partial', label: 'Partial' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFilterTab(tab.id)}
                style={{
                  background: filterTab === tab.id ? 'var(--a)' : 'transparent',
                  color: filterTab === tab.id ? '#000000' : 'var(--t1)',
                  fontWeight: filterTab === tab.id ? 800 : 600,
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

          <button
            onClick={fetchDuePayments}
            style={{
              background: 'var(--s2)',
              border: '1px solid var(--b2)',
              borderRadius: '8px',
              padding: '6px 12px',
              fontSize: '12px',
              color: 'var(--t0)',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
        <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--t2)', fontWeight: 600 }}>
            <span>Total Remaining Due</span>
            <div style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', borderRadius: '6px', padding: '4px 6px', display: 'flex' }}>
              <Wallet size={14} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#EF4444' }}>
            {currency}{data.totalDue.toLocaleString('en-IN')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Outstanding balance to be collected</div>
        </div>

        <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--t2)', fontWeight: 600 }}>
            <span>Customers with Due</span>
            <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', borderRadius: '6px', padding: '4px 6px', display: 'flex' }}>
              <User size={14} />
            </div>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--t0)' }}>
            {data.count}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Pending or partial credit bills</div>
        </div>
      </div>

      {/* Main Table / List Section */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t0)', margin: 0 }}>
              Due Payment Records ({filteredOrders.length})
            </h3>
            <span style={{ fontSize: '11.5px', color: 'var(--t2)' }}>Click "Settle Balance" on any customer bill to log payment</span>
          </div>

          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
            <input
              type="text"
              placeholder="Search customer, phone, bill #..."
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

        {/* Responsive Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1.5px solid var(--b2)', color: 'var(--t2)', fontSize: '11.5px' }}>
                <th style={{ padding: '8px 10px' }}>Customer Name</th>
                <th style={{ padding: '8px 10px' }}>Contact Phone</th>
                <th style={{ padding: '8px 10px' }}>Bill # & Table</th>
                <th style={{ padding: '8px 10px' }}>Date & Time</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Bill</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Paid</th>
                <th style={{ padding: '8px 10px', textAlign: 'right' }}>Remaining Due</th>
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--t2)' }}>Loading due payments...</td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '28px', color: 'var(--t2)' }}>No pending customer due payments found.</td>
                </tr>
              ) : (
                filteredOrders.map((ord, idx) => (
                  <tr key={ord._id || idx} style={{ borderBottom: '1px solid var(--b0)' }}>
                    <td style={{ padding: '10px', fontWeight: 800, color: 'var(--t0)' }}>
                      👤 {ord.customerName || 'Walk-in Guest'}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--t1)', fontWeight: 600 }}>
                      {ord.customerPhone ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Phone size={12} style={{ color: 'var(--a)' }} />
                          {ord.customerPhone}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--t2)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, color: 'var(--t0)' }}>
                      {ord.billNo || `HTB-T${ord.tableNo}`} <span style={{ color: 'var(--t2)', fontWeight: 600, fontSize: '11.5px' }}>(Table {ord.tableNo})</span>
                    </td>
                    <td style={{ padding: '10px', color: 'var(--t2)', fontSize: '11.5px' }}>
                      {new Date(ord.date).toLocaleDateString()} {new Date(ord.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600, color: 'var(--t1)' }}>
                      {currency}{ord.grandTotal.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>
                      {currency}{(ord.paidAmount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, color: '#EF4444', fontSize: '13px' }}>
                      {currency}{(ord.dueAmount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <button
                        onClick={() => openSettleModal(ord)}
                        style={{
                          background: 'var(--a)',
                          color: '#000000',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '5px 12px',
                          fontSize: '11.5px',
                          fontWeight: 800,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        Settle Balance
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Settle Balance Modal */}
      {settleOrder && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999, padding: '16px'
        }}>
          <div style={{
            background: 'var(--s1)', border: '1.5px solid var(--b2)', borderRadius: '14px',
            width: '100%', maxWidth: '420px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--b2)', paddingBottom: '10px' }}>
              <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t0)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Wallet size={16} style={{ color: 'var(--a)' }} />
                <span>Settle Due Balance</span>
              </div>
              <button onClick={() => setSettleOrder(null)} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--t1)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div><strong>Customer:</strong> {settleOrder.customerName || 'Walk-in Guest'} {settleOrder.customerPhone ? `(${settleOrder.customerPhone})` : ''}</div>
              <div><strong>Bill No:</strong> {settleOrder.billNo} (Table {settleOrder.tableNo})</div>
              <div><strong>Total Bill:</strong> {currency}{settleOrder.grandTotal} | <strong>Already Paid:</strong> {currency}{settleOrder.paidAmount || 0}</div>
              <div style={{ color: '#EF4444', fontWeight: 800, fontSize: '13px', marginTop: '2px' }}>
                Outstanding Due: {currency}{settleOrder.dueAmount}
              </div>
            </div>

            <form onSubmit={handleSettleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ fontSize: '11.5px', color: 'var(--t2)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Settlement Amount ({currency})
                </label>
                <input
                  type="number"
                  min="1"
                  max={settleOrder.dueAmount}
                  step="any"
                  value={settleAmount}
                  onChange={e => setSettleAmount(e.target.value)}
                  style={{
                    width: '100%', background: 'var(--s2)', border: '1px solid var(--b2)',
                    borderRadius: '8px', padding: '8px 10px', fontSize: '14px', fontWeight: 800, color: 'var(--t0)'
                  }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: '11.5px', color: 'var(--t2)', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Payment Mode
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['cash', 'upi', 'card'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setPaymentMode(mode)}
                      style={{
                        flex: 1,
                        background: paymentMode === mode ? 'var(--a)' : 'var(--s2)',
                        color: paymentMode === mode ? '#000000' : 'var(--t1)',
                        border: '1px solid var(--b2)',
                        borderRadius: '7px',
                        padding: '6px',
                        fontSize: '11.5px',
                        fontWeight: 800,
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                      }}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setSettleOrder(null)}
                  style={{
                    flex: 1, background: 'var(--s2)', border: '1px solid var(--b2)',
                    borderRadius: '8px', padding: '9px', fontSize: '12px', fontWeight: 700, color: 'var(--t0)', cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settling}
                  style={{
                    flex: 1.5, background: 'var(--a)', border: 'none',
                    borderRadius: '8px', padding: '9px', fontSize: '12px', fontWeight: 800, color: '#000000', cursor: settling ? 'wait' : 'pointer'
                  }}
                >
                  {settling ? 'Processing...' : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
