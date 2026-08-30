import React, { useState, useEffect } from 'react';
import { useApp, ROLE_HIERARCHY } from '../context/AppContext';
import { Plus, Pencil, Trash2, X, History } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';

// --- HISTORY MODAL ---
function HistoryModal({ worker, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch(apiUrl(`/api/workers/${worker._id}/history`))
      .then(res => res.json())
      .then(data => { setHistory(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [worker._id]);

  return (
    <div className="moverlay">
      <div className="mbox history-modal">
        <div className="mhead">
          <span className="truncate">Payment Log: {worker.name}</span>
          <button className="iBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="historyContent" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {loading ? (<p className="empty">Loading records...</p>) : history.length === 0 ? (<p className="empty">No records found.</p>) : (
            <>
              {/* Desktop table */}
              <table className="dtable history-table-desktop">
                <thead><tr><th>Date & Time</th><th>Amount</th><th>Status</th></tr></thead>
                <tbody>
                  {history.map((t) => (
                    <tr key={t._id}>
                      <td>
                        <div style={{ color: 'var(--t0)', fontWeight: 600 }}>{new Date(t.date).toLocaleDateString('en-IN')}</div>
                        <div style={{ fontSize: '10px', color: 'var(--t2)' }}>{new Date(t.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--t0)' }}>₹{t.amount.toLocaleString('en-IN')}</td>
                      <td><span className="badge b-green">Paid</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile cards */}
              <div className="history-cards-mobile">
                {history.map((t) => (
                  <div key={t._id} className="history-card-item">
                    <div className="history-card-left">
                      <div className="history-card-amount mono">₹{t.amount.toLocaleString('en-IN')}</div>
                      <div className="history-card-date">
                        {new Date(t.date).toLocaleDateString('en-IN')} • {new Date(t.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <span className="badge b-green" style={{ fontSize: 10, padding: '2px 8px' }}>Paid</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


// --- WORKER MODAL ---
function WorkerModal({ worker, onClose, onSave }) {
  const [form, setForm] = useState({
    name: worker?.name || '',
    role: worker?.role || 'Waiter',
    salary: worker?.salary || '',
    contact: worker?.contact || '',
    joiningDate: worker?.joiningDate ? worker.joiningDate.split('T')[0] : new Date().toISOString().split('T')[0],
    upiId: worker?.upiId || '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (busy) return;
    if (!form.name.trim()) { setError('Full Name is required'); return; }
    if (form.contact && !/^\d{10}$/.test(form.contact)) { setError('Contact must be 10 digits'); return; }

    setBusy(true);
    try {
      const currentPaid = parseFloat(worker?.paidSalary) || 0;
      const newAddition = parseFloat(form.paidSalary) || 0;
      await onSave({ ...form, salary: parseFloat(form.salary) || 0, paidSalary: currentPaid + newAddition });
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message);
      setBusy(false);
    }
  };

  return (
    <div className="moverlay">
      <div className="mbox">
        <div className="mhead">
          <span className="truncate">{worker ? 'Edit Staff Member' : 'Add New Staff'}</span>
          <button className="iBtn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="fgroup"><label className="lbl">Full Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>

        <div className="frow2">
          <div className="fgroup"><label className="lbl">Role</label><select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option>Waiter</option><option>Cashier</option><option>Chef</option><option>Manager</option><option>Bartender</option><option>Sweeper</option></select></div>
          <div className="fgroup"><label className="lbl">Joining Date</label><input type="date" className="joining-date-input" value={form.joiningDate} onChange={e => setForm({ ...form, joiningDate: e.target.value })} /></div>
        </div>

        <div className="frow2">
          <div className="fgroup"><label className="lbl">Salary (₹)</label><input type="number" value={form.salary} onChange={e => setForm({ ...form, salary: e.target.value })} /></div>
          <div className="fgroup"><label className="lbl">Contact</label><input maxLength={10} value={form.contact} onChange={e => setForm({ ...form, contact: e.target.value })} /></div>
        </div>


        <div className="fgroup">
          <label className="lbl">{worker ? "Add Payment (₹)" : "Initial Payment (₹)"}</label>
          <input type="number" value={form.paidSalary} onChange={e => setForm({ ...form, paidSalary: e.target.value })} placeholder="0" />
          {worker && <div style={{ fontSize: '10px', color: 'var(--green)', marginTop: '4px' }}>Total Paid: ₹{worker.paidSalary.toLocaleString()}</div>}
        </div>

        <div className="fgroup">
          <label className="lbl">UPI ID for Tips (Optional)</label>
          <input value={form.upiId} onChange={e => setForm({ ...form, upiId: e.target.value })} placeholder="e.g. waiter@upi" />
        </div>

        {error && <div className="badge b-red" style={{ width: '100%', padding: '8px', marginBottom: '12px' }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Updating...' : worker ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MAIN PAGE ---
export default function WorkersPage() {
  const { workers, saveWorker, deleteWorker, settings, canAccessRole, currentUser } = useApp();
  const [modal, setModal] = useState(null);
  const [historyWorker, setHistoryWorker] = useState(null);
  const [removeId, setRemoveId] = useState(null);

  const totalPayroll = (workers || []).reduce((s, w) => s + (parseFloat(w.salary) || 0), 0);
  const totalPaid = (workers || []).reduce((s, w) => s + (parseFloat(w.paidSalary) || 0), 0);
  const totalPending = totalPayroll - totalPaid;
  const { showToast, updateWorkerStatus } = useApp();

  // Hierarchy check: viewer can manage worker if viewer level > worker level
  const canManage = (w) => {
    const viewerRole = currentUser.role?.toLowerCase() || 'staff';
    const targetRole = w.role?.toLowerCase() || 'staff';
    return (ROLE_HIERARCHY[viewerRole]?.level || 0) > (ROLE_HIERARCHY[targetRole]?.level || 0);
  };

  // Robust check for account activity
  const isWorkerActive = (w) => (w.userId && typeof w.userId === 'object') ? w.userId.isActive : true;


  return (
    <div className="fi workers-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: "6px" }}>
        <button className="btn btn-primary add-staff-btn" onClick={() => setModal('add')}>
          <Plus size={16} /> <span>Add Staff</span>
        </button>
      </div>

      <div className="workers-kpi-row">
        <div className="kpi " style={{ '--accent-color': 'var(--green)' }}>
          <div className="kpi-label">Total Payroll</div>
          <div className="kpi-value mono" style={{ 'color': 'var(--t0)' }}>₹{totalPayroll.toLocaleString('en-IN')}</div>
        </div>
        <div className="kpi" style={{ '--accent-color': 'var(--blue)' }}>
          <div className="kpi-label">Paid This Month</div>
          <div className="kpi-value mono" style={{ 'color': 'var(--t0)' }}>₹{totalPaid.toLocaleString('en-IN')}</div>
        </div>
        <div className="kpi" style={{ '--accent-color': 'var(--red)' }}>
          <div className="kpi-label">Pending Salary</div>
          <div className="kpi-value mono" style={{ 'color': 'var(--t0)' }}>₹{totalPending.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* DESKTOP TABLE */}
      <div className="card desktop-view card-table-wrapper">
        <table className="dtable">
          <thead>
            <tr>
              <th>NAME</th><th>ROLE</th><th>SALARY</th><th>PAID</th><th>REMAINING</th><th>JOINING DATE</th><th style={{ textAlign: 'right' }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {workers.map(w => {
              const remaining = (parseFloat(w.salary) || 0) - (parseFloat(w.paidSalary) || 0);
              const isActive = isWorkerActive(w);
              return (
                <React.Fragment key={w._id}>
                  <tr style={{ opacity: isActive ? 1 : 0.6 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <strong style={{ color: 'var(--t0)' }}>{w.name}</strong>
                      </div>
                    </td>
                    <td><span className="badge b-amber">{w.role}</span></td>
                    <td className="mono">₹{parseFloat(w.salary).toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>₹{parseFloat(w.paidSalary).toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ color: remaining > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>₹{remaining.toLocaleString('en-IN')}</td>
                    <td className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{new Date(w.joiningDate).getDate()}th</td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button className="iBtn" onClick={() => setHistoryWorker(w)} title="View Payment History"><History size={16} /></button>

                        <button className="iBtn" onClick={() => setModal(w)} title="Edit Employee"><Pencil size={16} /></button>
                        <button className="iBtn" style={{ color: 'var(--red)' }} onClick={() => setRemoveId(w._id)}><Trash2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                  {removeId === w._id && (
                    <tr style={{ background: 'rgba(239,68,68,0.04)' }}>
                      <td colSpan={7}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px' }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>Confirm remove <strong>{w.name}</strong>?</span>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setRemoveId(null)}>Cancel</button>
                            <button className="btn btn-danger btn-sm" onClick={() => deleteWorker(w._id)}>Delete</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE LIST */}
      <div className="mobile-view">
        {workers.map(w => {
          const remaining = (parseFloat(w.salary) || 0) - (parseFloat(w.paidSalary) || 0);
          const isActive = isWorkerActive(w);
          return (
            <div key={w._id} className="card card-p" style={{ opacity: isActive ? 1 : 0.7 }}>

              {/* TOP SECTION */}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--t0)' }}>{w.name}</div>
                    <div className="ph-sub">
                      {w.role} • {new Date(w.joiningDate).getDate()}th
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div
                    className="mono txt-red"
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: remaining > 0 ? 'var(--red)' : 'var(--green)'
                    }}
                  >
                    ₹{remaining.toLocaleString()}
                  </div>
                  <div className="ph-sub">Remaining</div>
                </div>
              </div>

              {/* STATUS BAR (MOBILE) */}

              {/* ACTION BUTTONS */}
              <div style={{
                display: 'flex',
                gap: 8,
                borderTop: '1px solid var(--b0)',
                paddingTop: 8
              }}>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => setHistoryWorker(w)}
                  title="History"
                >
                  <History size={14} />
                </button>


                <button
                  className="btn btn-ghost btn-sm"
                  style={{ flex: 1 }}
                  onClick={() => setModal(w)}
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>

                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => setRemoveId(w._id)}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>

              </div>

              {/* ✅ DELETE CONFIRMATION (NEW) */}
              {removeId === w._id && (
                <div className="mob-del-confirm">
                  <span>
                    Confirm remove <strong>{w.name}</strong>?
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setRemoveId(null)}
                    >
                      Cancel
                    </button>

                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        deleteWorker(w._id);
                        setRemoveId(null); // optional but recommended
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {modal && <WorkerModal worker={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSave={(d) => saveWorker(d, modal !== 'add' ? modal._id : null)} />}
      {historyWorker && <HistoryModal worker={historyWorker} onClose={() => setHistoryWorker(null)} />}


      <style>{`

        /* Mobile Adjustments */
        .staff-mob-card { margin-bottom: 12px; }
        .card-top { display: flex; justify-content: space-between; margin-bottom: 12px; }
        .user-name-res { font-weight: 700; color: var(--t0); font-size: 16px; }
        .rem-val { font-size: 15px; font-weight: 800; }
        .card-action-row { display: flex; gap: 8px; border-top: 1px solid var(--b0); paddingTop: 12px; margin-top: 4px; padding-top: 12px; }
        .mob-del-confirm { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }

        @media(max-width: 768px) {
          .desktop-view { display: none !important; }
          .mobile-view { display: block !important; }
          .ph-res { flex-direction: row !important; align-items: center !important; }
          .add-staff-btn span { display: none; }
          .add-staff-btn { width: 44px; height: 44px; border-radius: 50%; padding: 0; position: fixed; bottom: 24px; right: 20px; z-index: 100; box-shadow: 0 4px 20px rgba(0,0,0,0.3); justify-content: center; }
          .res-frow { grid-template-columns: 1fr !important; gap: 0; }
          .ph-title { font-size: 18px !important; }
          .hintText { font-size: 11px; color: var(--t2); margin-top: 4px; }
        }
        @media(min-width: 769px) {
          .desktop-view { display: block !important; }
          .mobile-view { display: none !important; }
        }
        /* Calendar Fix for Dark Mode */
        .date-input { color-scheme: dark; }
        .lm .date-input { color-scheme: light; }
        ::-webkit-calendar-picker-indicator { filter: invert(0.8); cursor: pointer; }
        .lm ::-webkit-calendar-picker-indicator { filter: none; }
.dtable th,
.dtable td {
  text-align: left;
  padding: 14px 16px;
  vertical-align: middle;
}
  .dtable th:last-child,
.dtable td:last-child {
  text-align: right;
}
  .dtable {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* 🔥 KEY FIX */
}
  .dtable {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed; /* 🔥 KEY FIX */
}
  .iBtn {
  display: flex;
  align-items: center;
  justify-content: center;
}
  .badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
      `}</style>
    </div>
  );
}
