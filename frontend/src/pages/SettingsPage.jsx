import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { Save, Check, Send, KeyRound, ShieldAlert, Users, Trash2, RefreshCw, GripVertical } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
export default function SettingsPage() {
  const { settings, setSettings, saveSettings, currentUser, orderHistory, workers, loadData, agentConnected, agentPrinters, fetchAgentPrinters, socket } = useApp();
  const [form, setForm] = useState({ ...settings, billingPrinterName: settings.billingPrinterName || '' });
  const [saved, setSaved] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [isCashierPos, setIsCashierPos] = useState(localStorage.getItem('is_cashier_pos') !== 'false');

  const handleToggleCashier = (checked) => {
    setIsCashierPos(checked);
    localStorage.setItem('is_cashier_pos', checked ? 'true' : 'false');
    showToast(checked ? 'Device configured as Cashier POS' : 'Device configured as Mobile/Order POS', 'info');
  };

  const [email, setEmail] = useState({ adminEmail: settings.adminEmail || '' });
  const setE = (k, v) => setEmail(prev => ({ ...prev, [k]: v }));
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  const { showToast } = useApp();
  const [fetchingPrinters, setFetchingPrinters] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(null);

  const [editingMenuCat, setEditingMenuCat] = useState(null);
  const [editingInvCat, setEditingInvCat] = useState(null);
  const [editCatVal, setEditCatVal] = useState('');
  // Ref to detect double‑tap on touch devices
  const lastTapRef = useRef(0);

  const [whatsappStatus, setWhatsappStatus] = useState({ status: 'DISCONNECTED', qr: null, user: null });
  const [loadingWhatsapp, setLoadingWhatsapp] = useState(false);

  const fetchWhatsappStatus = async () => {
    try {
      const res = await authFetch(apiUrl('/api/settings/whatsapp/status'));
      if (res.ok) {
        const data = await res.json();
        setWhatsappStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch WhatsApp status:', err);
    }
  };

  const handleWhatsappConnect = async () => {
    setLoadingWhatsapp(true);
    try {
      const res = await authFetch(apiUrl('/api/settings/whatsapp/connect'), { method: 'POST' });
      if (res.ok) {
        showToast('Connecting WhatsApp...', 'info');
        await fetchWhatsappStatus();
      } else {
        showToast('Failed to initiate WhatsApp connection', 'error');
      }
    } catch (err) {
      showToast('Error connecting WhatsApp', 'error');
    } finally {
      setLoadingWhatsapp(false);
    }
  };

  const handleWhatsappDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect WhatsApp and log out?')) return;
    setLoadingWhatsapp(true);
    try {
      const res = await authFetch(apiUrl('/api/settings/whatsapp/disconnect'), { method: 'POST' });
      if (res.ok) {
        showToast('WhatsApp disconnected successfully', 'success');
        setWhatsappStatus({ status: 'DISCONNECTED', qr: null, user: null });
      } else {
        showToast('Failed to disconnect WhatsApp', 'error');
      }
    } catch (err) {
      showToast('Error disconnecting WhatsApp', 'error');
    } finally {
      setLoadingWhatsapp(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === 'admin') {
      fetchWhatsappStatus();
    }
  }, [currentUser]);

  useEffect(() => {
    if (socket && currentUser?.role === 'admin') {
      const handleStatusUpdate = (data) => {
        setWhatsappStatus(data);
      };
      socket.on('WHATSAPP_STATUS_UPDATE', handleStatusUpdate);
      return () => {
        socket.off('WHATSAPP_STATUS_UPDATE', handleStatusUpdate);
      };
    }
  }, [socket, currentUser]);

  const handleRenameMenuCategory = async (oldCat, newCat) => {
    const trimmed = newCat.trim();
    if (!trimmed) {
      setEditingMenuCat(null);
      return;
    }
    if (trimmed === oldCat) {
      setEditingMenuCat(null);
      return;
    }
    try {
      const res = await authFetch(apiUrl('/api/settings/menu-category/rename'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldCategory: oldCat, newCategory: trimmed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to rename category');
      setForm(f => ({ ...f, menuCategories: data }));
      setSettings(s => ({ ...s, menuCategories: data }));
      showToast(`Category renamed to ${trimmed}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setEditingMenuCat(null);
    }
  };

  const handleRenameInvCategory = async (oldCat, newCat) => {
    const trimmed = newCat.trim();
    if (!trimmed) {
      setEditingInvCat(null);
      return;
    }
    if (trimmed === oldCat) {
      setEditingInvCat(null);
      return;
    }
    try {
      const res = await authFetch(apiUrl('/api/settings/inventory-category/rename'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldCategory: oldCat, newCategory: trimmed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to rename category');
      setForm(f => ({ ...f, inventoryCategories: data }));
      setSettings(s => ({ ...s, inventoryCategories: data }));
      showToast(`Category renamed to ${trimmed}`, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setEditingInvCat(null);
    }
  };

  const handleDetectPrinters = async () => {
    setFetchingPrinters(true);
    try {
      if (form.printAgentEnabled) {
        const printers = await fetchAgentPrinters();
        if (printers && printers.length > 0) {
          set('detectedPrinters', printers);
          showToast(`Detected ${printers.length} printer(s) from Print Agent`, 'success');
        } else {
          showToast('No printers detected. Ensure print agent is running and configured correctly.', 'warning');
        }
      }
    } catch {
      showToast('Failed to detect printers', 'error');
    } finally {
      setFetchingPrinters(false);
    }
  };

  const handleTestPrint = async (printerName, typeLabel) => {
    if (!printerName) {
      showToast(`Please select a printer for ${typeLabel} first`, 'error');
      return;
    }
    setTestingPrinter(printerName);
    try {
      const port = form.printAgentPort || 5001;
      const token = form.printAgentToken || '';
      const res = await fetch(`http://localhost:${port}/test-print`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ printerName })
      });
      if (res.ok) {
        showToast(`Sent test print to ${printerName}`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Test print rejected by Agent', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Failed to reach local Print Agent', 'error');
    } finally {
      setTestingPrinter(null);
    }
  };

  const printerOptions = useMemo(() => {
    const list = agentPrinters.length > 0 ? agentPrinters : (form.detectedPrinters || []);
    const unique = new Set(list);
    if (form.kitchenPrinterName) unique.add(form.kitchenPrinterName);
    if (form.barPrinterName) unique.add(form.barPrinterName);
    if (form.billingPrinterName) unique.add(form.billingPrinterName);
    return Array.from(unique);
  }, [agentPrinters, form.detectedPrinters, form.kitchenPrinterName, form.barPrinterName, form.billingPrinterName]);

  // Sync form states with loaded settings
  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
      setEmail({ adminEmail: settings.adminEmail || '' });
    }
  }, [settings]);

  // STAFF MANAGEMENT (RESET PASSWORDS)
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [newStaffPwd, setNewStaffPwd] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [forceReset, setForceReset] = useState(true);

  const handleStaffReset = async () => {
    if (!selectedStaffId) return showToast('Please select a staff member', 'error');
    if (newStaffPwd.length < 6) return showToast('Password must be at least 6 characters', 'error');

    const worker = workers?.find(w => w.userId?._id === selectedStaffId || w.userId === selectedStaffId);
    setResetBusy(true);
    try {
      const res = await authFetch(apiUrl(`/api/auth/reset-worker-password/${selectedStaffId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPassword: newStaffPwd || undefined,
          forceReset
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to update');
      showToast(`Account for ${worker?.name || 'Staff'} updated`);
      setNewStaffPwd('');
      setSelectedStaffId('');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setResetBusy(false);
    }
  };

  const getBusinessDateString = (dateObj = new Date()) => {
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

  const summary = useMemo(() => {
    if (!orderHistory) return null;
    const currentBizDate = getBusinessDateString(new Date());
    const todayOrders = orderHistory.filter(o => {
      const bizDate = o.businessDate || getBusinessDateString(o.date || o.createdAt);
      return bizDate === currentBizDate;
    });
    return {
      revenue: todayOrders.reduce((s, o) => s + o.grandTotal, 0),
      ordersCount: todayOrders.length,
      due: todayOrders.reduce((s, o) => s + (o.dueAmount || 0), 0)
    };
  }, [orderHistory]);

  const [profileForm, setProfileForm] = useState({
    username: currentUser?.username || '',
    email: currentUser?.email || '',
    password: '',
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    setProfileForm({
      username: currentUser?.username || '',
      email: currentUser?.email || '',
      password: '',
    });
  }, [currentUser]);

  const handleUpdateProfile = async () => {
    if (profileSaving) return;
    setProfileError('');
    setProfileSaving(true);
    try {
      const res = await authFetch(apiUrl('/api/auth/profile'), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');

      const auth = JSON.parse(localStorage.getItem('humtum_auth_v2'));
      if (auth) {
        localStorage.setItem('humtum_auth_v2', JSON.stringify(data.user));
      }
      setProfileSaved(true);
      setProfileForm(f => ({ ...f, password: '' })); // Clear password field
      setTimeout(() => setProfileSaved(false), 3000);
      // Wait a moment then reload to refresh currentUser via AppContext
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      setProfileError(e.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const invCategories = Array.isArray(form.inventoryCategories) ? form.inventoryCategories : [];
  const menuCategories = Array.isArray(form.menuCategories) ? form.menuCategories : [];

  // Inventory category state
  const [invCatInput, setInvCatInput] = useState('');
  const [invCatError, setInvCatError] = useState('');
  // Menu category state
  const [menuCatInput, setMenuCatInput] = useState('');
  const [menuCatError, setMenuCatError] = useState('');

  useEffect(() => {
    setForm({ ...settings });
    setEmail({ adminEmail: settings.adminEmail || '' });
  }, [settings]);

  const handleShiftMenuCategory = (index, direction) => {
    const newCats = [...menuCategories];
    if (direction === 'left' && index > 0) {
      [newCats[index - 1], newCats[index]] = [newCats[index], newCats[index - 1]];
    } else if (direction === 'right' && index < newCats.length - 1) {
      [newCats[index + 1], newCats[index]] = [newCats[index], newCats[index + 1]];
    }
    setForm(f => ({ ...f, menuCategories: newCats }));
    setSettings(s => ({ ...s, menuCategories: newCats }));
  };

  const handleShiftInvCategory = (index, direction) => {
    const newCats = [...invCategories];
    if (direction === 'left' && index > 0) {
      [newCats[index - 1], newCats[index]] = [newCats[index], newCats[index - 1]];
    } else if (direction === 'right' && index < newCats.length - 1) {
      [newCats[index + 1], newCats[index]] = [newCats[index], newCats[index + 1]];
    }
    setForm(f => ({ ...f, inventoryCategories: newCats }));
    setSettings(s => ({ ...s, inventoryCategories: newCats }));
  };


  // Inventory category handlers (with context sync)
  const handleAddInvCategory = () => {
    const cat = invCatInput.trim();
    if (!cat) return setInvCatError('Category required');
    const prev = form.inventoryCategories || [];
    if (prev.includes(cat)) return setInvCatError('Already exists');

    setInvCatError('');
    const next = [...prev, cat];
    setForm({ ...form, inventoryCategories: next });
    setSettings({ ...settings, inventoryCategories: next });
    setInvCatInput('');
  };
  const handleRemoveInvCategory = (cat) => {
    const prev = form.inventoryCategories || [];
    const next = prev.filter(c => c !== cat);
    setForm({ ...form, inventoryCategories: next });
    setSettings({ ...settings, inventoryCategories: next });
  };

  // Menu category handlers (with context sync)
  const handleAddMenuCategory = () => {
    const cat = menuCatInput.trim();
    if (!cat) return setMenuCatError('Category required');
    const prev = form.menuCategories || [];
    if (prev.includes(cat)) return setMenuCatError('Already exists');

    setMenuCatError('');
    const next = [...prev, cat];
    setForm({ ...form, menuCategories: next });
    setSettings({ ...settings, menuCategories: next });
    setMenuCatInput('');
  };
  const handleRemoveMenuCategory = (cat) => {
    const prev = form.menuCategories || [];
    const next = prev.filter(c => c !== cat);
    setForm({ ...form, menuCategories: next });
    setSettings({ ...settings, menuCategories: next });
  };





  const handleSaveEmail = async () => {
    if (savingEmail) return;
    setSavingEmail(true);
    try {
      await saveSettings({ ...form, adminEmail: email.adminEmail });
      showToast('Email settings saved successfully');
    } catch (e) {
      showToast('Error saving email: ' + e.message, 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleSendReport = async () => {
    if (!email.adminEmail) {
      setSendResult({ ok: false, msg: 'Fill admin email first. Sender email is fixed.' });
      return;
    }
    setSending(true); setSendResult(null);
    try {
      const r = await authFetch(apiUrl('/api/reports/send-daily'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailConfig: {
            adminEmail: email.adminEmail.trim(),
          },
          settings: form,
          inventory: [],
        })
      });
      const d = await r.json();
      setSendResult(d.success
        ? { ok: true, msg: `✅ Report sent to ${d.recipient || email.adminEmail} (${d.ordersCount || 0} orders)` }
        : { ok: false, msg: `❌ ${d.error}` }
      );
    } catch (e) {
      setSendResult({ ok: false, msg: `❌ ${e.message}` });
    }
    setSending(false);
  };

  const handleSaveSettings = async () => {
    try {
      setSaved('saving');
      const data = { ...form, ...email };
      await saveSettings(data);
      setSaved(true);
      showToast('Settings saved successfully');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaved(false);
      showToast(e.message || 'Failed to save settings', 'error');
    }
  };

  const c = form.currency;

  return (
    <div className="fi settings-page">
      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingBottom: '16px' }}>

        <button className="btn btn-primary settings-save-btn" onClick={handleSaveSettings} disabled={saved === 'saving'}>
          {saved === 'saving' ? <><RefreshCw size={14} />Saving</> : saved ? <><Check size={14} />Saved</> : <><Save size={14} />Save Settings</>}
        </button>
      </div>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Business Info</h2>
              <p>Printed invoice and restaurant identity details.</p>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field settings-wide">
              <label>Restaurant Name</label>
              <input value={form.restaurantName || ''} onChange={e => set('restaurantName', e.target.value)} placeholder="HUMTUM Billing System" />
            </div>
            <div className="settings-field settings-wide">
              <label>Address</label>
              <input value={form.address || ''} onChange={e => set('address', e.target.value)} placeholder="Restaurant address" />
            </div>
            <div className="settings-field">
              <label>GSTIN</label>
              <input value={form.gstin || ''} onChange={e => set('gstin', e.target.value)} placeholder="GST number" />
            </div>
            <div className="settings-field">
              <label>Phone</label>
              <input value={form.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="Phone number" />
            </div>
            {/* 
            <div className="settings-field settings-wide">
              <label>Google Review Link</label>
              <input value={form.googleReviewLink || ''} onChange={e => set('googleReviewLink', e.target.value)} placeholder="https://g.page/r/.../review" />
            </div>
            */}
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-card-head">
            <div>
              <h2>Tax & Billing</h2>
              <p>Rates and receipt copy used during billing.</p>
            </div>
          </div>
          <div className="settings-fields">
            <div className="settings-field">
              <label>SGST Rate %</label>
              <input type="number" min="0" step="0.01" value={form.sgstRate ?? 0} onChange={e => set('sgstRate', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="settings-field">
              <label>CGST Rate %</label>
              <input type="number" min="0" step="0.01" value={form.cgstRate ?? 0} onChange={e => set('cgstRate', parseFloat(e.target.value) || 0)} />
            </div>
            <label className="settings-toggle settings-wide">
              <input type="checkbox" checked={!!form.serviceTaxEnabled} onChange={e => set('serviceTaxEnabled', e.target.checked)} />
              <span>Enable Service Tax</span>
            </label>
            <div className="settings-field">
              <label>Maximum Discount Limit %</label>
              <input type="number" min="0" max="100" step="1" value={form.maxDiscountLimit ?? 30} onChange={e => set('maxDiscountLimit', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
            </div>
            {form.serviceTaxEnabled && (
              <div className="settings-field">
                <label>Service Tax Rate %</label>
                <input type="number" min="0" step="0.01" value={form.serviceTaxRate ?? 0} onChange={e => set('serviceTaxRate', parseFloat(e.target.value) || 0)} />
              </div>
            )}
            <div className="settings-field settings-wide">
              <label>Thank You Message</label>
              <input value={form.thankYouMsg || ''} onChange={e => set('thankYouMsg', e.target.value)} placeholder="Thank you for visiting!" />
            </div>
            <div className="settings-field settings-wide">
              <label>UPI ID for QR Payments</label>
              <input value={form.upiId || ''} onChange={e => set('upiId', e.target.value)} placeholder="e.g. restaurant@upi" />
            </div>
            <label className="settings-toggle">
              <input type="checkbox" checked={form.includeUpiAmount !== false} onChange={e => set('includeUpiAmount', e.target.checked)} />
              <span>Include total bill amount in QR code</span>
            </label>
            <label className="settings-toggle">
              <input type="checkbox" checked={!!form.darkMode} onChange={e => set('darkMode', e.target.checked)} />
              <span>Use dark mode by default</span>
            </label>
          </div>
        </section>



        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Printing Services</h2>
              <p>Configure local silent receipt and KOT routing via Print Agent.</p>
            </div>
            {form.printAgentEnabled && (
              <div className={`qz-status-badge ${agentConnected ? 'connected' : 'disconnected'}`}>
                <div className="qz-status-dot" style={{ backgroundColor: agentConnected ? '#2ea043' : '#8b949e' }} />
                <span>{agentConnected ? 'Print Agent Connected' : 'Print Agent Disconnected'}</span>
              </div>
            )}
          </div>

          <div className="settings-printing-row" style={{ marginTop: '14px' }}>
            <label className="settings-toggle" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!form.printAgentEnabled} onChange={e => {
                set('printAgentEnabled', e.target.checked);
              }} />
              <span>Use Local Print Agent (Silent Printing)</span>
            </label>
          </div>

          {form.printAgentEnabled && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--b1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', margin: 0 }}>Print Agent Configuration</h3>
                  <a
                    href="/print-agent.zip"
                    download="print-agent.zip"
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 14px', borderRadius: '8px', textDecoration: 'none', color: 'var(--t0)' }}
                  >
                    <Send size={13} />
                    Download Print Agent (.zip)
                  </a>
                </div>
                <div className="settings-printing-row" style={{ gap: '16px', marginBottom: '16px' }}>
                  <div className="settings-field" style={{ flex: 1, minWidth: '150px' }}>
                    <label>Agent Port</label>
                    <input
                      type="number"
                      disabled
                      value={form.printAgentPort || 5001}
                      style={{ background: 'var(--b3)', cursor: 'not-allowed' }}
                    />
                  </div>
                  <div className="settings-field" style={{ flex: 2, minWidth: '250px' }}>
                    <label>Authorization Token (Paste into config.json)</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        readOnly
                        value={form.printAgentToken || ''}
                        style={{ fontFamily: 'monospace', fontSize: '12px', background: 'var(--b3)' }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(form.printAgentToken || '');
                          showToast('Token copied to clipboard', 'success');
                        }}
                        style={{ padding: '8px 12px', fontSize: '12px' }}
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleDetectPrinters}
                    disabled={fetchingPrinters}
                    style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <RefreshCw size={13} style={{ animation: fetchingPrinters ? 'spin 1s linear infinite' : 'none' }} />
                    {fetchingPrinters ? 'Detecting...' : 'Detect Printers'}
                  </button>
                  {agentPrinters.length > 0 && (
                    <span style={{ fontSize: '11px', color: '#8b949e' }}>{agentPrinters.length} printer(s) detected</span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Kitchen Printer */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="settings-field" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
                      <label>Kitchen Printer</label>
                      <select
                        value={form.kitchenPrinterName || ''}
                        onChange={e => set('kitchenPrinterName', e.target.value)}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)' }}
                      >
                        <option value="">-- Select Printer --</option>
                        {printerOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleTestPrint(form.kitchenPrinterName, 'Kitchen Printer')}
                      disabled={!form.kitchenPrinterName || testingPrinter !== null}
                      style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '12px' }}
                    >
                      {testingPrinter === form.kitchenPrinterName ? 'Testing...' : 'Test Print'}
                    </button>
                  </div>

                  {/* Bar Printer */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="settings-field" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
                      <label>Bar Printer</label>
                      <select
                        value={form.barPrinterName || ''}
                        onChange={e => set('barPrinterName', e.target.value)}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)' }}
                      >
                        <option value="">-- Select Printer --</option>
                        {printerOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleTestPrint(form.barPrinterName, 'Bar Printer')}
                      disabled={!form.barPrinterName || testingPrinter !== null}
                      style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '12px' }}
                    >
                      {testingPrinter === form.barPrinterName ? 'Testing...' : 'Test Print'}
                    </button>
                  </div>

                  {/* Billing Printer */}
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                    <div className="settings-field" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
                      <label>Billing Printer</label>
                      <select
                        value={form.billingPrinterName || ''}
                        onChange={e => set('billingPrinterName', e.target.value)}
                        style={{ padding: '8px', borderRadius: '8px', border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)' }}
                      >
                        <option value="">-- Select Printer --</option>
                        {printerOptions.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleTestPrint(form.billingPrinterName, 'Billing Printer')}
                      disabled={!form.billingPrinterName || testingPrinter !== null}
                      style={{ height: '36px', padding: '0 16px', borderRadius: '8px', fontSize: '12px' }}
                    >
                      {testingPrinter === form.billingPrinterName ? 'Testing...' : 'Test Print'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Menu Categories</h2>
              <p>Control category filters shown on menu and billing screens.</p>
            </div>
          </div>
          <div className="category-input-row">
            <input value={menuCatInput} onChange={e => setMenuCatInput(e.target.value)} placeholder="Add menu category" />
            <button className="btn btn-primary" onClick={handleAddMenuCategory}>Add</button>
          </div>
          {menuCatError && <div className="settings-error">{menuCatError}</div>}
          <div className="category-chips-inline">
            {menuCategories.map((cat, index) => (
              <div key={cat} className="category-chip-inline">
                {index > 0 && (
                  <button type="button" className="arrow-btn" onClick={() => handleShiftMenuCategory(index, 'left')} title="Move left">◀</button>
                )}
                {editingMenuCat === cat ? (
                  <input
                    type="text"
                    value={editCatVal}
                    onChange={e => setEditCatVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameMenuCategory(cat, editCatVal);
                      if (e.key === 'Escape') setEditingMenuCat(null);
                    }}
                    onBlur={() => handleRenameMenuCategory(cat, editCatVal)}
                    autoFocus
                    className="category-rename-input"
                    style={{ background: 'var(--b2)', border: '1px solid var(--a)', borderRadius: '4px', color: 'var(--t0)', padding: '2px 6px', fontSize: '13px', width: '120px' }}
                  />
                ) : (
                  <span
                    className="cat-name"
                    onDoubleClick={() => { setEditingMenuCat(cat); setEditCatVal(cat); }}
                    onTouchStart={() => {
                      const now = Date.now();
                      if (now - lastTapRef.current < 300) {
                        setEditingMenuCat(cat);
                        setEditCatVal(cat);
                      }
                      lastTapRef.current = now;
                    }}
                    title="Double-click or double‑tap to rename"
                    style={{ cursor: 'pointer' }}
                  >
                    {cat}
                  </span>
                )}
                {index < menuCategories.length - 1 && (
                  <button type="button" className="arrow-btn" onClick={() => handleShiftMenuCategory(index, 'right')} title="Move right">▶</button>
                )}
                <button type="button" className="delete-btn" onClick={() => handleRemoveMenuCategory(cat)} title="Remove category">×</button>
              </div>
            ))}
            {menuCategories.length === 0 && <div className="settings-empty">No menu categories yet.</div>}
          </div>
        </section>

        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Inventory Categories</h2>
              <p>Maintain inventory groups for stock and reporting.</p>
            </div>
          </div>
          <div className="category-input-row">
            <input value={invCatInput} onChange={e => setInvCatInput(e.target.value)} placeholder="Add inventory category" />
            <button className="btn btn-primary" onClick={handleAddInvCategory}>Add</button>
          </div>
          {invCatError && <div className="settings-error">{invCatError}</div>}
          <div className="category-chips-inline">
            {invCategories.map((cat, index) => (
              <div key={cat} className="category-chip-inline">
                {index > 0 && (
                  <button type="button" className="arrow-btn" onClick={() => handleShiftInvCategory(index, 'left')} title="Move left">◀</button>
                )}
                {editingInvCat === cat ? (
                  <input
                    type="text"
                    value={editCatVal}
                    onChange={e => setEditCatVal(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleRenameInvCategory(cat, editCatVal);
                      if (e.key === 'Escape') setEditingInvCat(null);
                    }}
                    onBlur={() => handleRenameInvCategory(cat, editCatVal)}
                    autoFocus
                    className="category-rename-input"
                    style={{ background: 'var(--b2)', border: '1px solid var(--a)', borderRadius: '4px', color: 'var(--t0)', padding: '2px 6px', fontSize: '13px', width: '120px' }}
                  />
                ) : (
                  <span
                    className="cat-name"
                    onDoubleClick={() => { setEditingInvCat(cat); setEditCatVal(cat); }}
                    onTouchStart={() => {
                      const now = Date.now();
                      if (now - lastTapRef.current < 300) {
                        setEditingInvCat(cat);
                        setEditCatVal(cat);
                      }
                      lastTapRef.current = now;
                    }}
                    title="Double-click or double‑tap to rename"
                    style={{ cursor: 'pointer' }}
                  >
                    {cat}
                  </span>
                )}
                {index < invCategories.length - 1 && (
                  <button type="button" className="arrow-btn" onClick={() => handleShiftInvCategory(index, 'right')} title="Move right">▶</button>
                )}
                <button type="button" className="delete-btn" onClick={() => handleRemoveInvCategory(cat)} title="Remove category">×</button>
              </div>
            ))}
            {invCategories.length === 0 && <div className="settings-empty">No inventory categories yet.</div>}
          </div>
        </section>

        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <h2>Daily Report</h2>
              <p>Send today&apos;s summary to the configured administrator email.</p>
            </div>
          </div>



          <div className="settings-fields settings-report-fields">
            <div className="settings-field">
              <label>Sender Email</label>
              <input value={form.senderEmail || settings.senderEmail || ''} readOnly className="settings-readonly" />
            </div>
            <div className="settings-field">
              <label>Admin Email</label>
              <input value={email.adminEmail || ''} onChange={e => setE('adminEmail', e.target.value)} placeholder="owner@company.com" />
            </div>
          </div>
          <div className="settings-actions">
            <button className="btn btn-primary settings-grid-action" onClick={handleSaveEmail} disabled={savingEmail}>
              {savingEmail ? 'Saving...' : 'Save Email'}
            </button>
          </div>
        </section>

        {false && currentUser?.role === 'admin' && (
          <section className="settings-card settings-full">
            <div className="settings-card-head">
              <div>
                <h2>WhatsApp Business Integration</h2>
                <p>Send automated thank-you messages and review/social media links on bill finalization.</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '16px' }}>
              
              {/* Left Column: Settings Configuration */}
              <div style={{ flex: '1 1 450px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div className="settings-field">
                  <label>Thank You Message Template</label>
                  <textarea
                    rows={10}
                    value={form.whatsappTemplate || ''}
                    onChange={e => set('whatsappTemplate', e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: '200px',
                      background: 'var(--b2)',
                      border: '1px solid var(--border)',
                      borderRadius: '8px',
                      color: 'var(--t0)',
                      padding: '10px',
                      fontFamily: 'monospace',
                      fontSize: '13px',
                      resize: 'vertical'
                    }}
                    placeholder="Write your template..."
                  />
                </div>
              </div>

              {/* Right Column: Connection State / QR Code */}
              <div style={{
                flex: '1 1 300px',
                background: 'var(--b2)',
                borderRadius: '12px',
                padding: '20px',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '300px',
                textAlign: 'center'
              }}>
                <h3 style={{ marginBottom: '10px', color: 'var(--t0)' }}>WhatsApp Connection Status</h3>
                
                {/* Status Indicator */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                  <div style={{
                    width: '12px',
                    height: '12px',
                    borderRadius: '50%',
                    backgroundColor: whatsappStatus.status === 'CONNECTED' ? '#4ade80' : whatsappStatus.status === 'CONNECTING' ? '#facc15' : '#f87171'
                  }} />
                  <span style={{ fontWeight: '600', color: 'var(--t1)', textTransform: 'uppercase', fontSize: '14px' }}>
                    {whatsappStatus.status}
                  </span>
                </div>

                {whatsappStatus.status === 'CONNECTED' ? (
                  <div>
                    <p style={{ color: 'var(--t2)', fontSize: '13px', marginBottom: '15px' }}>
                      Connected to WhatsApp Business account: <strong>{whatsappStatus.user}</strong>
                    </p>
                    <button
                      className="btn btn-secondary"
                      onClick={handleWhatsappDisconnect}
                      disabled={loadingWhatsapp}
                      style={{ background: '#f87171', color: 'white' }}
                    >
                      {loadingWhatsapp ? 'Disconnecting...' : 'Disconnect WhatsApp'}
                    </button>
                  </div>
                ) : whatsappStatus.status === 'CONNECTING' ? (
                  <div>
                    {whatsappStatus.qr ? (
                      <div>
                        <p style={{ color: 'var(--t1)', fontSize: '13px', marginBottom: '12px' }}>
                          Scan this QR code with WhatsApp to connect your account:
                        </p>
                        <div style={{
                          background: 'white',
                          padding: '10px',
                          borderRadius: '8px',
                          display: 'inline-block',
                          marginBottom: '15px'
                        }}>
                          <img src={whatsappStatus.qr} alt="WhatsApp QR Code" style={{ width: '200px', height: '200px' }} />
                        </div>
                        <p style={{ color: 'var(--t2)', fontSize: '11px' }}>
                          Open WhatsApp on your phone &gt; Settings &gt; Linked Devices &gt; Link a Device.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p style={{ color: 'var(--t2)', fontSize: '13px', marginBottom: '15px' }}>
                          Generating QR code, please wait...
                        </p>
                        <div className="settings-spinner" style={{
                          border: '4px solid var(--b3)',
                          borderTop: '4px solid var(--a)',
                          borderRadius: '50%',
                          width: '30px',
                          height: '30px',
                          animation: 'spin 1s linear infinite',
                          margin: '0 auto'
                        }} />
                      </div>
                    )}
                    <button
                      className="btn btn-secondary"
                      onClick={handleWhatsappDisconnect}
                      disabled={loadingWhatsapp}
                      style={{ marginTop: '15px' }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ color: 'var(--t2)', fontSize: '13px', marginBottom: '20px' }}>
                      WhatsApp is currently disconnected. Click below to display the login QR code.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={handleWhatsappConnect}
                      disabled={loadingWhatsapp}
                    >
                      {loadingWhatsapp ? 'Generating QR...' : 'Connect WhatsApp'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </section>
        )}

        <section className="settings-card settings-full settings-security-card">
          <div className="settings-card-head">
            <div>
              <h2>Account & Security</h2>
              <p>Manage your profile, update passwords, and control team access.</p>
            </div>
            <ShieldAlert size={20} />
          </div>

          {/* My Profile */}
          <div className="settings-subsection">
            <h3 className="settings-subsection-title">My Profile</h3>
            <div className="profile-row-pro">
              <div className="settings-field">
                <label>Username</label>
                <input value={profileForm.username} onChange={e => setProfileForm(f => ({ ...f, username: e.target.value }))} />
              </div>
              <div className="settings-field">
                <label>New Password</label>
                <input type="password" value={profileForm.password} onChange={e => setProfileForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to keep current password" />
              </div>
              <button className="btn btn-primary settings-grid-action" onClick={handleUpdateProfile} disabled={profileSaving}>
                {profileSaving ? 'Updating...' : profileSaved ? <><Check size={14} />Updated</> : 'Update Profile'}
              </button>
            </div>
            {profileError && <p className="settings-error">{profileError}</p>}
          </div>

          {/* Staff & Manager Password Reset (admin only) */}
          {currentUser?.role === 'admin' && (
            <div className="settings-subsection">
              <h3 className="settings-subsection-title">Staff & Manager Passwords</h3>
              <div className="staff-reset-grid">
                <div className="settings-field">
                  <label>Select Account</label>
                  <select value={selectedStaffId} onChange={e => setSelectedStaffId(e.target.value)}>
                    <option value="">Select target</option>
                    <option value="staff_team">All Staff</option>
                    <option value="manager_team">Manager Account</option>
                  </select>
                </div>

                <div className="settings-field settings-password-field">
                  <label>Update Password</label>
                  <div>
                    <KeyRound size={15} />
                    <input type="password" value={newStaffPwd} onChange={e => setNewStaffPwd(e.target.value)} placeholder="Set 6+ chars" />
                  </div>
                </div>

                <label className="settings-toggle staff-force-toggle">
                  <input type="checkbox" checked={forceReset} onChange={e => setForceReset(e.target.checked)} />
                  <span>Force reset on next login</span>
                </label>

                <button className="btn btn-primary settings-grid-action" onClick={handleStaffReset} disabled={resetBusy || !selectedStaffId}>
                  {resetBusy ? 'Updating...' : 'Update Accounts'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
