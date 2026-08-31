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

  // Add New Due Record Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addCustName, setAddCustName] = useState('');
  const [addCustPhone, setAddCustPhone] = useState('');
  const [addDueAmount, setAddDueAmount] = useState('');
  const [addTableNo, setAddTableNo] = useState('');
  const [addNotes, setAddNotes] = useState('');

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

  const openAddModal = () => {
    setAddCustName('');
    setAddCustPhone('');
    setAddDueAmount('');
    setAddTableNo('');
    setAddNotes('');
    setAddModalOpen(true);
  };

  const handleCreateDueSubmit = async (e) => {
    e.preventDefault();
    if (!addCustName.trim()) {
      showToast('Please enter customer name', 'error');
      return;
    }
    const amt = parseFloat(addDueAmount);
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid due amount', 'error');
      return;
    }

    setSaving(true);
    try {
      const res = await authFetch(apiUrl('/api/orders/due'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: addCustName.trim(),
          customerPhone: addCustPhone.trim(),
          dueAmount: amt,
          tableNo: addTableNo,
          notes: addNotes.trim()
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.message || resData.error || 'Failed to create due record');
      }

      showToast(`Created new due record for ${addCustName.trim()}!`, 'success');
      setAddModalOpen(false);
      fetchDuePayments();
      if (loadData) loadData();
    } catch (err) {
      console.error('Error creating due record:', err);
      showToast(err.message || 'Failed to create due record', 'error');
    } finally {
      setSaving(false);
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <p style={{ fontSize: '12.5px', color: 'var(--t2)', margin: 0 }}>
            Manage customer pay-later & credit due balances.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <button
            onClick={openAddModal}
            style={{
              background: 'var(--a)',
              color: '#000000',
              border: 'none',
              borderRadius: '9px',
              padding: '8px 16px',
              fontSize: '12.5px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 12px rgba(245,158,11,0.2)'
            }}
          >
            + Add New Due Record
          </button>

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
              color: 'var(--t1)',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: 600
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Total Pending Due Amount
          </span>
          <div style={{ fontSize: '24px', fontWeight: 900, color: '#EF4444', marginTop: '4px' }}>
            {currency}{ (data.totalDue || 0).toLocaleString('en-IN') }
          </div>
        </div>

        <div style={{ background: 'var(--s2)', border: '1px solid var(--b2)', borderRadius: '12px', padding: '16px 20px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Due Records Count
          </span>
          <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--t0)', marginTop: '4px' }}>
            {data.count || 0} Bills
          </div>
        </div>
      </div>

      <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
        <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
        <input
          type="text"
          placeholder="Search by customer name, phone, bill #..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          style={{
            width: '100%',
            padding: '9px 12px 9px 36px',
            borderRadius: '9px',
            border: '1px solid var(--b2)',
            background: 'var(--s2)',
            color: 'var(--t0)',
            fontSize: '13px'
          }}
        />
      </div>

      <div style={{ background: 'var(--s1)', border: '1px solid var(--b2)', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b2)', textTransform: 'uppercase', fontSize: '11px', color: 'var(--t2)', letterSpacing: '0.05em' }}>
                <th style={{ padding: '12px', textAlign: 'left' }}>Customer</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>Phone</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>Bill No.</th>
                <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Total Bill</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Paid</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Due Balance</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="8" style={{ padding: '30px', textAlign: 'center', color: 'var(--t2)' }}>
                    Loading due payment records...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ padding: '40px', textAlign: 'center', color: 'var(--t2)' }}>
                    No pending due records found.
                  </td>
                </tr>
              ) : (
                filteredOrders.map(ord => (
                  <tr key={ord._id} style={{ borderBottom: '1px solid var(--b1)' }}>
                    <td style={{ padding: '10px', fontWeight: 700, color: 'var(--t0)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <User size={14} style={{ color: 'var(--a)' }} />
                        <span>{ord.customerName || 'Walk-in Guest'}</span>
                      </div>
                      {ord.notes && <div style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: 400, marginTop: 2 }}>{ord.notes}</div>}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--t1)' }}>
                      {ord.customerPhone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Phone size={12} style={{ color: 'var(--t2)' }} />
                          <span>{ord.customerPhone}</span>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--t2)' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, color: 'var(--t0)' }}>
                      {ord.billNo || `HTB-T${ord.tableNo}`}
                    </td>
                    <td style={{ padding: '10px', color: 'var(--t2)' }}>
                      {new Date(ord.date).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 600 }}>
                      {currency}{ord.grandTotal.toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, color: '#10B981' }}>
                      {currency}{(ord.paidAmount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', fontWeight: 900, color: '#EF4444' }}>
                      {currency}{(ord.dueAmount || 0).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                        <button onClick={() => openEditModal(ord)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--b2)', background: 'var(--s2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700 }}>
                          <Edit3 size={12} /> Edit
                        </button>
                        <button onClick={() => handleRemoveFromDue(ord._id, ord.billNo)} style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)', color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', fontWeight: 700 }}>
                          <Trash2 size={12} /> Clear
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

      {addModalOpen && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }} onClick={() => setAddModalOpen(false)}>
          <div className="mbox" style={{ maxWidth: '440px', width: '92%', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--t0)' }}>
                Create New Due Payment Record
              </h3>
              <button onClick={() => setAddModalOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDueSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Customer Name *</label>
                <input
                  type="text"
                  placeholder="Enter customer name"
                  value={addCustName}
                  onChange={e => setAddCustName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, fontWeight: 700 }}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Due Amount ({currency}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    placeholder="e.g. 500"
                    value={addDueAmount}
                    onChange={e => setAddDueAmount(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', fontSize: 13, fontWeight: 800, color: '#EF4444' }}
                    required
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Phone Number</label>
                  <input
                    type="text"
                    placeholder="Phone (Optional)"
                    value={addCustPhone}
                    onChange={e => setAddCustPhone(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Table No. (Optional)</label>
                <input
                  type="number"
                  placeholder="e.g. 4"
                  value={addTableNo}
                  onChange={e => setAddTableNo(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13 }}
                />
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--t2)', display: 'block', marginBottom: 4 }}>Notes / Reason (Optional)</label>
                <textarea
                  rows="2"
                  placeholder="Additional notes about this credit entry..."
                  value={addNotes}
                  onChange={e => setAddNotes(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: 13, resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setAddModalOpen(false)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--b2)', background: 'var(--s2)', color: 'var(--t1)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: 'var(--a)', color: '#000', fontWeight: 800, fontSize: 13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
                >
                  {saving ? 'Creating...' : 'Create Due Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
