import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import { Search, Wallet, User, Phone, Edit3, Trash2, X } from 'lucide-react';

export default function DuePaymentsPage() {
  const { showToast, loadData, currency = '₹' } = useApp();

  const [data, setData] = useState({ totalDue: 0, count: 0, orders: [] });
  const [loading, setLoading] = useState(false);
  const [filterTab, setFilterTab] = useState('all'); // 'all', 'pending', 'partial'
  const [searchTerm, setSearchTerm] = useState('');

  // Edit Due Record Modal State
  const [editOrder, setEditOrder] = useState(null);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [dueAmount, setDueAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

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
        (o.tableNo && String(o.tableNo).includes(term)) ||
        (o.notes && o.notes.toLowerCase().includes(term))
      );
    }

    return list;
  }, [data.orders, filterTab, searchTerm]);

  const openEditModal = (order) => {
    setEditOrder(order);
    setCustName(order.customerName || '');
    setCustPhone(order.customerPhone || '');
    setDueAmount(String(order.dueAmount || order.grandTotal || 0));
    setNotes(order.notes || '');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editOrder) return;

    const amt = parseFloat(dueAmount);
    if (isNaN(amt) || amt < 0) {
      showToast('Please enter a valid due amount', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(apiUrl(`/api/orders/${editOrder._id}/payment-status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: 'due',
          paymentMode: 'due',
          dueAmount: amt,
          customerName: custName.trim(),
          customerPhone: custPhone.trim(),
          notes: notes.trim()
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || errData.error || 'Failed to update due details');
      }

      showToast(`Updated due record for Bill ${editOrder.billNo || 'HTB-T' + editOrder.tableNo}!`, 'success');
      setEditOrder(null);
      fetchDuePayments();
      if (loadData) loadData();
    } catch (err) {
      console.error('Error updating due record:', err);
      showToast(err.message || 'Failed to update due record', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFromDue = async (orderId, billNo) => {
    const displayBill = billNo || 'this due record';
    if (window.confirm(`Are you sure you want to remove ${displayBill} from Due Payments? The bill will remain intact in Order History.`)) {
      try {
        const res = await authFetch(apiUrl(`/api/orders/${orderId}/payment-status`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentMethod: 'cash',
            paymentMode: 'cash',
            dueAmount: 0
          })
        });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.message || errData.error || 'Failed to remove from due payments');
        }

        showToast(`Removed ${displayBill} from Due Payments`, 'success');
        fetchDuePayments();
        if (loadData) loadData();
      } catch (err) {
        showToast(err.message || 'Failed to remove from due payments', 'error');
      }
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header & Filter Pills */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ fontSize: '12.5px', color: 'var(--t2)', margin: 0 }}>
            Manage customer pay-later & credit due balances.
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
          <div style={{ fontSize: '11px', color: 'var(--t2)' }}>Outstanding pay-later credit balance</div>
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

      {/* Main Table Section */}
      <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--t0)', margin: 0 }}>
              Due Payment Records ({filteredOrders.length})
            </h3>
            <span style={{ fontSize: '11.5px', color: 'var(--t2)' }}>Edit details or delete due records using the action buttons</span>
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
                <th style={{ padding: '8px 10px', textAlign: 'center' }}>Actions</th>
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
                      {ord.notes && <div style={{ fontSize: 11, color: 'var(--t2)', fontWeight: 400, marginTop: 2 }}>{ord.notes}</div>}
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
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                        <button
                          onClick={() => openEditModal(ord)}
                          style={{
                            background: 'var(--s2)',
                            color: 'var(--a)',
                            border: '1px solid var(--b2)',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="Edit Customer Name, Phone & Due Amount"
                        >
                          <Edit3 size={13} /> Edit
                        </button>
                        <button
                          onClick={() => handleRemoveFromDue(ord._id, ord.billNo)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            borderRadius: '6px',
                            padding: '5px 10px',
                            fontSize: '11.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}
                          title="Remove from Due Payments (Bill remains in Order History)"
                        >
                          <Trash2 size={13} /> Remove Due
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

      {/* Edit Due Record Modal */}
      {editOrder && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={() => setEditOrder(null)}>
          <div className="mbox" style={{ maxWidth: '420px', width: '92%', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--t0)' }}>
                Edit Due Record ({editOrder.billNo || 'HTB-T' + editOrder.tableNo})
              </h3>
              <button onClick={() => setEditOrder(null)} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Customer Name</label>
                <input
                  type="text"
                  placeholder="Enter customer name"
                  value={custName}
                  onChange={e => setCustName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Customer Phone</label>
                <input
                  type="text"
                  placeholder="Enter phone number"
                  value={custPhone}
                  onChange={e => setCustPhone(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Due Amount ({currency})</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={dueAmount}
                  onChange={e => setDueAmount(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', fontSize: 13, fontWeight: 800, color: '#EF4444' }}
                  required
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Notes / Remarks (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="Additional notes about this due payment..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setEditOrder(null)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--b2)', background: 'var(--s2)', color: 'var(--t1)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--a)', color: '#000', fontWeight: 800, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
