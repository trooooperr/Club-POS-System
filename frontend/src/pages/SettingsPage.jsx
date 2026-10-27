import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useApp, applyThemeAccent } from '../context/AppContext';
import { Save, Check, Send, KeyRound, ShieldAlert, Users, Trash2, RefreshCw, GripVertical, Download, Laptop, Smartphone, Tablet, Monitor, MapPin, Clock, LogOut, ShieldCheck, Database, UploadCloud, ExternalLink, ChevronDown, ChevronUp, QrCode, Copy, Plus, Edit2, LayoutGrid, Layers, Printer, Sliders, Hash, Palette, Sparkles, Image as ImageIcon, Wifi, Globe, Bell } from 'lucide-react';
import QRCode from 'qrcode';
import { apiUrl, authFetch } from '../lib/api';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const THEME_PRESETS = [
  { id: 'amber-gold', label: 'Amber Gold', hex: '#F59E0B', desc: 'Warm Amber' },
  { id: 'cyber-emerald', label: 'Cyber Emerald', hex: '#10B981', desc: 'Lounge / Garden' },
  { id: 'electric-violet', label: 'Electric Violet', hex: '#8B5CF6', desc: 'Violet / Lounge' },
  { id: 'crimson-ruby', label: 'Crimson Ruby', hex: '#EF4444', desc: 'Speakeasy / Cocktails' },
  { id: 'ocean-cyan', label: 'Ocean Cyan', hex: '#06B6D4', desc: 'Rooftop / Poolside' },
  { id: 'neon-rose', label: 'Neon Rose', hex: '#F43F5E', desc: 'VIP / Chic Lounge' },
];


export default function SettingsPage() {
  const { settings, setSettings, saveSettings, currentUser, orderHistory, workers, loadData, agentConnected, agentPrinters, fetchAgentPrinters, socket, logout } = useApp();
  const [form, setForm] = useState({ ...settings, billingPrinterName: settings.billingPrinterName || '' });
  const [saved, setSaved] = useState(false);
  const isDirtyRef = useRef(false);
  const set = (k, v) => {
    isDirtyRef.current = true;
    setForm(f => ({ ...f, [k]: v }));
  };

  const [showTechnicalSettings, setShowTechnicalSettings] = useState(false);


  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Image too large. Please select an image under 2MB', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 256;
        let w = img.width;
        let h = img.height;
        if (w > h && w > maxDim) {
          h = Math.round((h * maxDim) / w);
          w = maxDim;
        } else if (h > maxDim) {
          w = Math.round((w * maxDim) / h);
          h = maxDim;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        set('logoUrl', dataUrl);
        showToast('Logo uploaded & applied!', 'success');
      };
      img.src = uploadEvent.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectThemePreset = (preset) => {
    set('themePreset', preset.id);
    set('accentColor', preset.hex);
    applyThemeAccent(preset.hex);
    showToast(`Switched theme to ${preset.label}`, 'info');
  };

  const handleCustomColorChange = (hex) => {
    set('accentColor', hex);
    set('themePreset', 'custom');
    applyThemeAccent(hex);
  };

  const [email, setEmail] = useState({
    adminEmail: settings.adminEmail || '',
    loginAlertEmail: settings.loginAlertEmail || 'alokgupta1605@gmail.com',
    loginAlertEnabled: settings.loginAlertEnabled !== false
  });
  const [testingLoginAlert, setTestingLoginAlert] = useState(false);
  const setE = (k, v) => setEmail(prev => ({ ...prev, [k]: v }));
  const { showToast } = useApp();
  const [fetchingPrinters, setFetchingPrinters] = useState(false);
  const [testingPrinter, setTestingPrinter] = useState(null);
  const [updatingAgent, setUpdatingAgent] = useState(false);

  const [editingMenuCat, setEditingMenuCat] = useState(null);
  const [editingInvCat, setEditingInvCat] = useState(null);
  const [editCatVal, setEditCatVal] = useState('');
  // Ref to detect double‑tap on touch devices
  const lastTapRef = useRef(0);

  // ── Active Sessions / Devices ──────────────────────────────────
  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingSession, setRevokingSession] = useState(null);

  const fetchSessions = async () => {
    setLoadingSessions(true);
    try {
      const res = await authFetch(apiUrl('/api/auth/sessions'));
      if (res.ok) {
        const data = await res.json();
        if (data.sessions) {
          setSessions(data.sessions);
        }
      }
    } catch (err) {
      console.error('Failed to load active sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // ── Database Backup State & Handlers ───────────────────────────
  const [triggeringBackup, setTriggeringBackup] = useState(false);
  const [restoringBackup, setRestoringBackup] = useState(false);
  const [confirmRestoreLock, setConfirmRestoreLock] = useState(false);
  const [backupResult, setBackupResult] = useState(null);

  const handleTriggerDriveBackup = async () => {
    setTriggeringBackup(true);
    setBackupResult(null);
    try {
      const res = await authFetch(apiUrl('/api/admin/backup/trigger'), {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupResult({
          success: true,
          message: 'Instant backup created and uploaded to Google Drive!',
          elapsed: data.elapsed,
          time: new Date().toLocaleTimeString('en-IN')
        });
        showToast('Instant backup created and synced to Google Drive!', 'success');
      } else {
        setBackupResult({ success: false, error: data.error || 'Failed to complete backup' });
        showToast(data.error || 'Backup failed', 'error');
      }
    } catch (err) {
      setBackupResult({ success: false, error: err.message });
      showToast('Network error during backup: ' + err.message, 'error');
    } finally {
      setTriggeringBackup(false);
    }
  };

  const handleSyncFromLatestBackup = async () => {
    if (!window.confirm('⚠️ Are you sure you want to sync MongoDB with your latest backup?\n\nThis will download the latest backup from Google Drive and sync all database collections.')) {
      return;
    }
    setRestoringBackup(true);
    setBackupResult(null);
    try {
      showToast('Downloading latest backup from Google Drive and syncing database...', 'info');
      const res = await authFetch(apiUrl('/api/admin/backup/restore-latest'), {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBackupResult({
          success: true,
          message: data.message || 'Database successfully synced with latest backup!',
          time: new Date().toLocaleTimeString('en-IN')
        });
        showToast('Database successfully synced with latest backup!', 'success');
        if (typeof loadData === 'function') loadData();
      } else {
        setBackupResult({ success: false, error: data.error || 'Failed to sync from latest backup' });
        showToast(data.error || 'Database sync failed', 'error');
      }
    } catch (err) {
      setBackupResult({ success: false, error: err.message });
      showToast('Error syncing database: ' + err.message, 'error');
    } finally {
      setRestoringBackup(false);
    }
  };

  const handleRevokeSession = async (sessionId, deviceName) => {
    if (!window.confirm(`Are you sure you want to log out ${deviceName || 'this device'}?`)) {
      return;
    }
    setRevokingSession(sessionId);
    try {
      const res = await authFetch(apiUrl(`/api/auth/sessions/${sessionId}`), {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Device logged out successfully', 'success');
        setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to logout device', 'error');
      }
    } catch (err) {
      showToast('Network error while logging out device', 'error');
    } finally {
      setRevokingSession(null);
    }
  };

  const handleLogoutThisDevice = async () => {
    if (window.confirm('Are you sure you want to log out of this device?')) {
      await logout();
      window.location.href = '/login';
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    if (!window.confirm('Are you sure you want to sign out of all other devices?')) {
      return;
    }
    setRevokingSession('all');
    try {
      const res = await authFetch(apiUrl('/api/auth/sessions'), {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast('Signed out of all other devices', 'success');
        setSessions(prev => prev.filter(s => s.isCurrent));
      } else {
        const data = await res.json().catch(() => ({}));
        showToast(data.error || 'Failed to sign out other devices', 'error');
      }
    } catch (err) {
      showToast('Network error while signing out other devices', 'error');
    } finally {
      setRevokingSession(null);
    }
  };

  const formatSessionDate = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return dateStr;
    }
  };

  const formatRelativeTime = (dateStr) => {
    if (!dateStr) return '';
    try {
      const diffMs = Date.now() - new Date(dateStr).getTime();
      const mins = Math.floor(diffMs / (1000 * 60));
      if (mins < 2) return 'Just now';
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return '';
    }
  };

  const renderDeviceIcon = (deviceType) => {
    const t = (deviceType || '').toLowerCase();
    if (t === 'mobile') return <Smartphone size={22} />;
    if (t === 'tablet') return <Tablet size={22} />;
    return <Laptop size={22} />;
  };

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

  const handleSelfUpdate = async () => {
    const port = form.printAgentPort || 5001;
    const token = form.printAgentToken || '';
    // Points to the Node.js backend which serves the latest print-agent.js
    const updateUrl = apiUrl(`/api/print-agent-src?token=${encodeURIComponent(token)}`);
    setUpdatingAgent(true);
    try {
      const res = await fetch(`http://localhost:${port}/self-update`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ updateUrl })
      });
      if (res.ok) {
        showToast('Print Agent is updating and will restart in ~5 seconds...', 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Update request rejected by Agent', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('Could not reach Print Agent. Is it running?', 'error');
    } finally {
      setTimeout(() => setUpdatingAgent(false), 6000);
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
      setEmail({
        adminEmail: settings.adminEmail || '',
        loginAlertEmail: settings.loginAlertEmail || 'alokgupta1605@gmail.com',
        loginAlertEnabled: settings.loginAlertEnabled !== false
      });
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
      revenue: (todayOrders || []).reduce((s, o) => s + (o.grandTotal || 0), 0),
      ordersCount: (todayOrders || []).length,
      due: (todayOrders || []).reduce((s, o) => s + (o.dueAmount || 0), 0)
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
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

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
    if (!isDirtyRef.current) {
      setForm({ ...settings });
      setEmail({
        adminEmail: settings.adminEmail || '',
        loginAlertEmail: settings.loginAlertEmail || 'alokgupta1605@gmail.com',
        loginAlertEnabled: settings.loginAlertEnabled !== false
      });
    }
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





  // ── Table Themes & Canvas Generator ──────────────────────────
  const SECTION_THEMES = [
    { id: 'zone-bottom', label: 'Sky Blue', hex: '#0ea5e9' },
    { id: 'zone-top',    label: 'Amber Gold', hex: '#f59e0b' },
    { id: 'zone-rest',   label: 'Emerald', hex: '#10b981' },
    { id: 'zone-vip',    label: 'Gold VIP', hex: '#eab308' },
    { id: 'zone-purple', label: 'Purple Lounge', hex: '#a855f7' },
    { id: 'zone-rose',   label: 'Rose Red', hex: '#f43f5e' },
    { id: 'zone-cyan',   label: 'Electric Cyan', hex: '#06b6d4' },
  ];

  const generateTableQrCardCanvas = async ({ tableNo, qrDataUrl }) => {
    // Minimal download: white card with TABLE X title + QR code only
    const padding = 32;
    const qrSize = 400;
    const titleH = 60;
    const width = qrSize + padding * 2;
    const height = titleH + qrSize + padding * 2;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Table number title
    ctx.textAlign = 'center';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 34px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(`TABLE ${tableNo}`, width / 2, padding + 38);

    // Draw QR image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = qrDataUrl;
    });
    ctx.drawImage(img, padding, padding + titleH, qrSize, qrSize);

    return canvas;
  };

  // ── Table & Section State ─────────────────────────────────────
  const currentTotalTables = Math.max(1, Math.min(200, parseInt(form.totalTables) || 20));
  const currentSections = useMemo(() => {
    return Array.isArray(form.tableSections) && form.tableSections.length > 0
      ? form.tableSections
      : [
          { id: 'sec-1', name: 'Bottom Lounge', range: [1, 6], color: 'zone-bottom' },
          { id: 'sec-2', name: 'Top Lounge',    range: [7, 12],  color: 'zone-top' },
          { id: 'sec-3', name: 'Restaurant',    range: [13, 18], color: 'zone-rest' },
          { id: 'sec-4', name: 'VIP',           range: [19, 20], color: 'zone-vip' },
        ];
  }, [form.tableSections]);

  const [editingSecId, setEditingSecId] = useState(null);
  const [secForm, setSecForm] = useState({ name: '', start: 1, end: 1, color: 'zone-bottom' });
  const [showAddSec, setShowAddSec] = useState(false);
  const [newSec, setNewSec] = useState({ name: '', start: 1, end: 1, color: 'zone-bottom' });
  const [secError, setSecError] = useState('');
  const [savingTableConfig, setSavingTableConfig] = useState(false);

  // ── QR Code Hub State ─────────────────────────────────────────
  const [qrFilterSec, setQrFilterSec] = useState('All');
  const [qrSearch, setQrSearch] = useState('');
  const [copiedTable, setCopiedTable] = useState(null);
  const [qrCodeUrls, setQrCodeUrls] = useState({});
  const [generatingQrs, setGeneratingQrs] = useState(false);
  const [activeQrTable, setActiveQrTable] = useState(null);
  const [selectedQrTable, setSelectedQrTable] = useState(1);
  const [showAllTablesGrid, setShowAllTablesGrid] = useState(false);
  const [previewQrModal, setPreviewQrModal] = useState(null);
  const [downloadingQrTable, setDownloadingQrTable] = useState(null);
  const [showPrintSheet, setShowPrintSheet] = useState(false);

  const webBaseUrl = (form.webMenuBaseUrl || 'https://humtumbar.in').replace(/\/+$/, '');

  // Generate QR code for a single table on-demand and cache it
  const ensureQrCode = useCallback(async (tableNum) => {
    if (!tableNum) return null;
    if (qrCodeUrls[tableNum]) return qrCodeUrls[tableNum];
    try {
      const targetUrl = `${webBaseUrl}/menu?table=${tableNum}`;
      const qrData = await QRCode.toDataURL(targetUrl, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#000000', light: '#ffffff' }
      });
      setQrCodeUrls(prev => ({ ...prev, [tableNum]: qrData }));
      return qrData;
    } catch (err) {
      console.error('Error generating QR for table', tableNum, err);
      return null;
    }
  }, [qrCodeUrls, webBaseUrl]);

  // Preload QR for the actively selected table
  useEffect(() => {
    if (selectedQrTable) {
      ensureQrCode(selectedQrTable);
    }
  }, [selectedQrTable, ensureQrCode]);

  // Keep selected table clamped within available range
  useEffect(() => {
    if (currentTotalTables > 0 && selectedQrTable > currentTotalTables) {
      setSelectedQrTable(Math.max(1, currentTotalTables));
    }
  }, [currentTotalTables, selectedQrTable]);

  // Toggle showing QR code for a specific table
  const handleToggleTableQr = async (tableNum) => {
    if (activeQrTable === tableNum) {
      setActiveQrTable(null);
      return;
    }
    setActiveQrTable(tableNum);
    await ensureQrCode(tableNum);
  };

  const getSectionForTable = useCallback((num) => {
    const found = currentSections.find(s => num >= s.range[0] && num <= s.range[1]);
    return found ? found.name : 'General';
  }, [currentSections]);

  // Open the dedicated stand card mockup modal
  const handleOpenQrModal = async (tableNum) => {
    const secName = getSectionForTable(tableNum);
    const targetUrl = `${webBaseUrl}/menu?table=${tableNum}`;
    const qrData = await ensureQrCode(tableNum);
    setPreviewQrModal({
      tableNo: tableNum,
      sectionName: secName,
      qrDataUrl: qrData,
      targetUrl
    });
  };

  // Only batch-generate when user explicitly opens the Print Sheet modal
  useEffect(() => {
    if (!showPrintSheet) return;
    let isSubscribed = true;
    const generateAllForPrint = async () => {
      setGeneratingQrs(true);
      try {
        for (let i = 1; i <= currentTotalTables; i++) {
          if (!isSubscribed) break;
          if (!qrCodeUrls[i]) {
            const targetUrl = `${webBaseUrl}/menu?table=${i}`;
            const qrData = await QRCode.toDataURL(targetUrl, {
              width: 260,
              margin: 2,
              errorCorrectionLevel: 'H',
              color: { dark: '#000000', light: '#ffffff' }
            });
            if (isSubscribed) {
              setQrCodeUrls(prev => ({ ...prev, [i]: qrData }));
            }
          }
        }
      } catch (err) {
        console.error('Error generating print sheet QR codes:', err);
      } finally {
        if (isSubscribed) setGeneratingQrs(false);
      }
    };
    generateAllForPrint();
    return () => { isSubscribed = false; };
  }, [showPrintSheet, currentTotalTables, webBaseUrl, qrCodeUrls]);

  const handleSetTotalTables = (num) => {
    const val = Math.max(1, Math.min(200, parseInt(num) || 1));
    setForm(prev => ({ ...prev, totalTables: val }));
  };

  const handleStartEditSection = (s) => {
    setEditingSecId(s.id);
    setSecForm({
      name: s.name,
      start: s.range[0],
      end: s.range[1],
      color: s.color || 'zone-bottom'
    });
    setSecError('');
  };

  const handleSaveEditedSection = () => {
    setSecError('');
    if (!secForm.name.trim()) return setSecError('Section name is required');
    const start = Math.max(1, Math.min(currentTotalTables, parseInt(secForm.start) || 1));
    const end = Math.max(start, Math.min(currentTotalTables, parseInt(secForm.end) || start));

    const updated = currentSections.map(s => {
      if (s.id === editingSecId) {
        return {
          ...s,
          name: secForm.name.trim(),
          range: [start, end],
          color: secForm.color || s.color
        };
      }
      return s;
    });

    setForm(prev => ({ ...prev, tableSections: updated }));
    setEditingSecId(null);
    showToast(`Updated section "${secForm.name}"`, 'success');
  };

  const handleAddSection = () => {
    setSecError('');
    const name = newSec.name.trim();
    if (!name) return setSecError('Section name is required');
    const start = Math.max(1, Math.min(currentTotalTables, parseInt(newSec.start) || 1));
    const end = Math.max(start, Math.min(currentTotalTables, parseInt(newSec.end) || start));

    const newSectionItem = {
      id: `sec-${Date.now()}`,
      name,
      range: [start, end],
      color: newSec.color || 'zone-bottom'
    };

    const updated = [...currentSections, newSectionItem];
    setForm(prev => ({ ...prev, tableSections: updated }));
    setShowAddSec(false);
    setNewSec({ name: '', start: Math.min(currentTotalTables, end + 1), end: Math.min(currentTotalTables, end + 5), color: 'zone-bottom' });
    showToast(`Added section "${name}" (Tables ${start}–${end})`, 'success');
  };

  const handleDeleteSection = (secId) => {
    const sec = currentSections.find(s => s.id === secId);
    if (!window.confirm(`Are you sure you want to delete section "${sec?.name || 'this section'}"?\n\nTables in this range will automatically be accessible in Additional Tables on the floor plan.`)) {
      return;
    }
    const updated = currentSections.filter(s => s.id !== secId);
    setForm(prev => ({ ...prev, tableSections: updated }));
    showToast(`Deleted section "${sec?.name || ''}"`, 'info');
  };

  const handleAutoDistributeSections = () => {
    if (!currentSections.length) return;
    const count = currentSections.length;
    const perSec = Math.floor(currentTotalTables / count);
    let remainder = currentTotalTables % count;

    let currentStart = 1;
    const updated = currentSections.map((s) => {
      const extra = remainder > 0 ? 1 : 0;
      if (remainder > 0) remainder--;
      const span = Math.max(1, perSec + extra);
      const start = currentStart;
      const end = Math.min(currentTotalTables, start + span - 1);
      currentStart = end + 1;
      return { ...s, range: [start, end] };
    });

    setForm(prev => ({ ...prev, tableSections: updated }));
    showToast(`Auto-distributed ${currentTotalTables} tables across ${count} sections`, 'success');
  };

  const handleInstantSaveTableConfig = async () => {
    setSavingTableConfig(true);
    try {
      await saveSettings({
        ...form,
        totalTables: currentTotalTables,
        tableSections: currentSections,
        webMenuBaseUrl: form.webMenuBaseUrl || 'https://humtumbar.in'
      });
      showToast('Table & Section setup saved successfully!', 'success');
    } catch (err) {
      showToast('Failed to save table setup: ' + err.message, 'error');
    } finally {
      setSavingTableConfig(false);
    }
  };

  const handleCopyTableLink = async (tableNum) => {
    const url = `${webBaseUrl}/menu?table=${tableNum}`;
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const input = document.createElement('input');
        input.value = url;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
      }
      setCopiedTable(tableNum);
      setTimeout(() => setCopiedTable(null), 2000);
      showToast(`Copied QR order link for Table ${tableNum}`, 'success');
    } catch (e) {
      showToast('Failed to copy link', 'error');
    }
  };

  const handleDownloadTableQr = async (tableNum) => {
    setDownloadingQrTable(tableNum);
    try {
      let qrData = qrCodeUrls[tableNum];
      if (!qrData) {
        const targetUrl = `${webBaseUrl}/menu?table=${tableNum}`;
        qrData = await QRCode.toDataURL(targetUrl, {
          width: 400,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' }
        });
        setQrCodeUrls(prev => ({ ...prev, [tableNum]: qrData }));
      }
      const canvas = await generateTableQrCardCanvas({ tableNo: tableNum, qrDataUrl: qrData });
      const link = document.createElement('a');
      link.download = `Table-${tableNum}-QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(`Downloaded QR for Table ${tableNum}`, 'success');
    } catch (err) {
      console.error('Download QR error:', err);
      showToast('Failed to download QR code', 'error');
    } finally {
      setDownloadingQrTable(null);
    }
  };

  const handleSaveEmail = async () => {
    setSavingEmail(true);
    try {
      await saveSettings({
        ...form,
        adminEmail: email.adminEmail,
        loginAlertEmail: email.loginAlertEmail,
        loginAlertEnabled: email.loginAlertEnabled
      });
      showToast('Email & Login Alert settings saved successfully');
    } catch (e) {
      showToast('Error saving email: ' + e.message, 'error');
    } finally {
      setSavingEmail(false);
    }
  };

  const handleTestLoginAlert = async () => {
    setTestingLoginAlert(true);
    try {
      const res = await authFetch(apiUrl('/api/settings/test-login-alert'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.loginAlertEmail || 'alokgupta1605@gmail.com' })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Test alert email sent successfully!');
      } else {
        showToast(data.error || 'Failed to send test email', 'error');
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    } finally {
      setTestingLoginAlert(false);
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
      const savedResult = await saveSettings(data);
      isDirtyRef.current = false;
      if (savedResult) {
        setForm({ ...savedResult });
      }
      setSaved(true);
      showToast('Settings saved successfully');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setSaved(false);
      showToast(e.message || 'Failed to save settings', 'error');
    }
  };


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
              <h2>Business & Branding</h2>
              <p>Printed invoice, venue identity, and white-label theme.</p>
            </div>
          </div>
          <div className="settings-fields">

            <div className="settings-field settings-wide">
              <label>Restaurant / Venue Name</label>
              <input
                value={form.restaurantName || ''}
                onChange={e => set('restaurantName', e.target.value)}
                placeholder="HUMTUM"
              />
            </div>

            <div className="settings-field settings-wide">
              <label>Tagline / Subtitle (Optional - shown on bill & sidebar)</label>
              <input
                value={form.brandTagline || ''}
                onChange={e => set('brandTagline', e.target.value)}
                placeholder="The Bar & Restaurant"
              />
            </div>


            <div className="settings-field settings-wide">
              <label>Address</label>
              <input
                value={form.address || ''}
                onChange={e => set('address', e.target.value)}
                placeholder="Restaurant address"
              />
            </div>

            <div className="settings-field">
              <label>GSTIN</label>
              <input
                value={form.gstin || ''}
                onChange={e => set('gstin', e.target.value)}
                placeholder="GST number"
              />
            </div>

            <div className="settings-field">
              <label>Phone</label>
              <input
                value={form.phone || ''}
                onChange={e => set('phone', e.target.value)}
                placeholder="Phone number"
              />
            </div>

            {/* Clean Theme Accent Color */}
            <div className="settings-field">
              <label>Accent Theme Color</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={form.accentColor || '#F59E0B'}
                  onChange={e => handleCustomColorChange(e.target.value)}
                  style={{ width: '36px', height: '36px', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', borderRadius: '6px' }}
                />
                <input
                  type="text"
                  value={form.accentColor || '#F59E0B'}
                  onChange={e => handleCustomColorChange(e.target.value)}
                  style={{ flex: 1, fontFamily: 'monospace' }}
                  placeholder="#F59E0B"
                />
              </div>
            </div>

            {/* Clean Logo Upload */}
            <div className="settings-field">
              <label>Venue Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="btn btn-secondary" style={{ cursor: 'pointer', margin: 0, padding: '8px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UploadCloud size={14} />
                  {form.logoUrl ? 'Change' : 'Upload'}
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                </label>
                {form.logoUrl && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '8px 10px', color: 'var(--red)' }}
                    onClick={() => set('logoUrl', '')}
                    title="Remove Logo"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="Logo" style={{ width: '32px', height: '32px', objectFit: 'contain', borderRadius: '6px', border: '1px solid var(--border)' }} />
                )}
              </div>
            </div>

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
              <label>GST Rate %</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.gstRate ?? Number(((form.cgstRate || 0) + (form.sgstRate || 0)).toFixed(2))}
                onChange={e => {
                  const val = parseFloat(e.target.value) || 0;
                  set('gstRate', val);
                  set('cgstRate', Number((val / 2).toFixed(2)));
                  set('sgstRate', Number((val / 2).toFixed(2)));
                }}
              />
            </div>
            <div className="settings-field">
              <label>Maximum Discount Limit %</label>
              <input type="number" min="0" max="100" step="1" value={form.maxDiscountLimit ?? 30} onChange={e => set('maxDiscountLimit', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} />
            </div>
            <label className="settings-toggle">
              <input type="checkbox" checked={!!form.serviceTaxEnabled} onChange={e => set('serviceTaxEnabled', e.target.checked)} />
              <span>Enable Service Charge</span>
            </label>
            {form.serviceTaxEnabled && (
              <div className="settings-field">
                <label>Service Charge Rate %</label>
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

        {/* Operational Settings: Menu Categories */}
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

        {/* Operational Settings: Inventory Categories */}
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

        {/* Collapsible Technical & Advanced Settings Header */}
        <div className="settings-full" style={{ marginTop: '12px' }}>
          <button
            type="button"
            onClick={() => setShowTechnicalSettings(prev => !prev)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: '8px',
              fontSize: '15px',
              fontWeight: '800',
              cursor: 'pointer',
              background: 'var(--s1)',
              border: '1px solid var(--b1)',
              color: 'var(--t0)',
              transition: 'all 0.2s ease',
              boxShadow: 'var(--sh-sm)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <ShieldAlert size={18} style={{ color: 'var(--a)' }} />
              <span>Technical & Advanced Settings</span>
              <span style={{ fontSize: '12px', color: 'var(--t2)', fontWeight: 'normal' }}>
                (Table Layout, QR Codes, Printing, Cloud Backup, Email Alerts, Active Devices, Security)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--a)' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{showTechnicalSettings ? 'Hide' : 'Show'}</span>
              {showTechnicalSettings ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </div>
          </button>
        </div>

        {/* Collapsible Technical & Advanced Content */}
        {showTechnicalSettings && (
          <>
            {/* ── 1. Table & Section Management ───────────────────────────── */}
        <section className="settings-card settings-full">
          <div className="settings-card-head">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <LayoutGrid size={20} style={{ color: 'var(--a)' }} />
                <h2>Dining Tables & Section Management</h2>
              </div>
              <p>Configure total tables in your venue, create or remove dining sections, and assign table ranges.</p>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleInstantSaveTableConfig}
              disabled={savingTableConfig}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              {savingTableConfig ? <RefreshCw size={14} className="spin" /> : <Save size={14} />}
              <span>{savingTableConfig ? 'Saving...' : 'Save Table Setup'}</span>
            </button>
          </div>

          {/* Table Count Banner & Stepper */}
          <div className="table-mgmt-banner">
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Tables
              </div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: 'var(--t0)', marginTop: '1px' }}>
                {currentTotalTables} <span style={{ fontSize: '13px', fontWeight: '500', color: 'var(--t2)' }}>Tables (T1–T{currentTotalTables})</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div className="table-stepper-group">
                <button
                  type="button"
                  className="table-stepper-btn"
                  onClick={() => handleSetTotalTables(currentTotalTables - 5)}
                  disabled={currentTotalTables <= 5}
                  title="Decrease 5 Tables"
                >
                  -5
                </button>
                <button
                  type="button"
                  className="table-stepper-btn"
                  onClick={() => handleSetTotalTables(currentTotalTables - 1)}
                  disabled={currentTotalTables <= 1}
                  title="Decrease 1 Table"
                >
                  -1
                </button>
                <input
                  type="number"
                  min="1"
                  max="200"
                  className="table-stepper-input"
                  value={currentTotalTables}
                  onChange={e => handleSetTotalTables(e.target.value)}
                />
                <button
                  type="button"
                  className="table-stepper-btn"
                  onClick={() => handleSetTotalTables(currentTotalTables + 1)}
                  disabled={currentTotalTables >= 200}
                  title="Increase 1 Table"
                >
                  +1
                </button>
                <button
                  type="button"
                  className="table-stepper-btn"
                  onClick={() => handleSetTotalTables(currentTotalTables + 5)}
                  disabled={currentTotalTables >= 195}
                  title="Increase 5 Tables"
                >
                  +5
                </button>
              </div>

              {/* Quick Presets */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[20, 25, 30, 40, 50].map(cnt => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => handleSetTotalTables(cnt)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11.5px',
                      borderRadius: '6px',
                      border: '1px solid var(--b1)',
                      background: currentTotalTables === cnt ? 'var(--a)' : 'var(--s2)',
                      color: currentTotalTables === cnt ? '#000' : 'var(--t1)',
                      fontWeight: currentTotalTables === cnt ? '700' : '500',
                      cursor: 'pointer'
                    }}
                  >
                    {cnt} Tables
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Section Management Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', marginBottom: '6px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '700', margin: 0, color: 'var(--t0)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Layers size={14} style={{ color: 'var(--a)' }} />
                <span>Sections & Zones ({currentSections.length})</span>
              </h3>
              <p style={{ margin: '1px 0 0 0', fontSize: '11px', color: 'var(--t2)' }}>
                Divide tables into areas (e.g. Lounge, Rooftop, Bar, VIP).
              </p>
            </div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setShowAddSec(true);
                  const lastSec = currentSections[currentSections.length - 1];
                  const nextStart = lastSec ? Math.min(currentTotalTables, lastSec.range[1] + 1) : 1;
                  const nextEnd = Math.min(currentTotalTables, nextStart + 4);
                  setNewSec({ name: '', start: nextStart, end: nextEnd, color: 'zone-bottom' });
                }}
                style={{ fontSize: '11px', padding: '4px 9px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              >
                <Plus size={12} /> Add Section
              </button>
            </div>
          </div>

          {secError && <div className="settings-error" style={{ marginBottom: '10px' }}>{secError}</div>}

          {/* Add Section Box */}
          {showAddSec && (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--a)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
              <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '12px', color: 'var(--a)' }}>
                Add New Dining Section
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                <div className="settings-field">
                  <label>Section Name</label>
                  <input
                    value={newSec.name}
                    onChange={e => setNewSec(s => ({ ...s, name: e.target.value }))}
                    placeholder="e.g. Rooftop Lounge, VIP Deck"
                  />
                </div>
                <div className="settings-field">
                  <label>Start Table #</label>
                  <input
                    type="number"
                    min="1"
                    max={currentTotalTables}
                    value={newSec.start}
                    onChange={e => setNewSec(s => ({ ...s, start: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className="settings-field">
                  <label>End Table #</label>
                  <input
                    type="number"
                    min="1"
                    max={currentTotalTables}
                    value={newSec.end}
                    onChange={e => setNewSec(s => ({ ...s, end: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div className="settings-field">
                  <label>Theme Color</label>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', height: '38px', flexWrap: 'wrap' }}>
                    {SECTION_THEMES.map(th => (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => setNewSec(s => ({ ...s, color: th.id }))}
                        title={th.label}
                        style={{
                          width: '24px',
                          height: '24px',
                          borderRadius: '50%',
                          background: th.hex,
                          border: newSec.color === th.id ? '2px solid #fff' : '2px solid transparent',
                          transform: newSec.color === th.id ? 'scale(1.2)' : 'scale(1)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddSec(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={handleAddSection}>Create Section</button>
              </div>
            </div>
          )}

          {/* Section Items Grid */}
          <div className="section-editor-grid">
            {currentSections.map(sec => {
              const isEditing = editingSecId === sec.id;
              const theme = SECTION_THEMES.find(t => t.id === sec.color) || SECTION_THEMES[0];
              const tableCount = Math.max(0, sec.range[1] - sec.range[0] + 1);

              if (isEditing) {
                return (
                  <div key={sec.id} className="section-item-box" style={{ borderColor: 'var(--a)' }}>
                    <div style={{ fontWeight: '700', fontSize: '13px', color: 'var(--a)' }}>Editing Section</div>
                    <div className="settings-field">
                      <label>Section Name</label>
                      <input
                        value={secForm.name}
                        onChange={e => setSecForm(f => ({ ...f, name: e.target.value }))}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <div className="settings-field" style={{ flex: 1 }}>
                        <label>Start Table</label>
                        <input
                          type="number"
                          min="1"
                          max={currentTotalTables}
                          value={secForm.start}
                          onChange={e => setSecForm(f => ({ ...f, start: parseInt(e.target.value) || 1 }))}
                        />
                      </div>
                      <div className="settings-field" style={{ flex: 1 }}>
                        <label>End Table</label>
                        <input
                          type="number"
                          min="1"
                          max={currentTotalTables}
                          value={secForm.end}
                          onChange={e => setSecForm(f => ({ ...f, end: parseInt(e.target.value) || 1 }))}
                        />
                      </div>
                    </div>
                    <div className="settings-field">
                      <label>Color Theme</label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {SECTION_THEMES.map(th => (
                          <button
                            key={th.id}
                            type="button"
                            onClick={() => setSecForm(f => ({ ...f, color: th.id }))}
                            title={th.label}
                            style={{
                              width: '22px',
                              height: '22px',
                              borderRadius: '50%',
                              background: th.hex,
                              border: secForm.color === th.id ? '2px solid #fff' : '2px solid transparent',
                              transform: secForm.color === th.id ? 'scale(1.2)' : 'scale(1)',
                              cursor: 'pointer'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', marginTop: '6px' }}>
                      <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setEditingSecId(null)}>Cancel</button>
                      <button type="button" className="btn btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={handleSaveEditedSection}>Save</button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={sec.id} className="section-item-box">
                  <div className="section-item-top">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                      <span className="section-theme-dot" style={{ background: theme.hex }} />
                      <span style={{ fontWeight: '700', fontSize: '13px', color: 'var(--t0)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sec.name}</span>
                    </div>
                    <span style={{ fontSize: '10.5px', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: `${theme.hex}20`, color: theme.hex, whiteSpace: 'nowrap' }}>
                      T{sec.range[0]}–T{sec.range[1]} ({tableCount})
                    </span>
                  </div>

                  <div className="section-item-actions" style={{ borderTop: '1px solid var(--b0)', paddingTop: '6px' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '11px', padding: '3px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px', color: 'var(--t1)' }}
                      onClick={() => handleStartEditSection(sec)}
                    >
                      <Edit2 size={11} /> Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ fontSize: '11px', padding: '3px 7px', display: 'inline-flex', alignItems: 'center', gap: '3px', color: '#ef4444', marginLeft: 'auto' }}
                      onClick={() => handleDeleteSection(sec.id)}
                    >
                      <Trash2 size={11} /> Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {currentSections.length === 0 && (
            <div className="settings-empty" style={{ margin: '14px 0' }}>
              No sections defined. All tables will appear in a default layout.
            </div>
          )}
        </section>

        {/* ── Table QR Code Hub (Mobile Self-Ordering) ─────────────── */}
        <section className="settings-card settings-full">
          <div className="settings-card-head" style={{ marginBottom: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <QrCode size={18} style={{ color: 'var(--a)' }} />
                <h2 style={{ fontSize: '16px' }}>Table QR Codes (Self-Ordering)</h2>
              </div>
              <p style={{ fontSize: '12px', margin: '2px 0 0' }}>Instant guest order links & printable table tent cards. Click any table's QR button to reveal.</p>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowPrintSheet(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 12px' }}
            >
              <Printer size={13} /> Print All Cards
            </button>
          </div>

          {/* Compact QR Toolbar */}
          <div className="qr-hub-toolbar" style={{ gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 540px', minWidth: '320px', flexWrap: 'wrap' }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', flex: '1 1 160px', minWidth: '140px' }}>
                <input
                  type="text"
                  placeholder="Filter table #..."
                  value={qrSearch}
                  onChange={e => setQrSearch(e.target.value)}
                  style={{ width: '100%', paddingLeft: '28px', height: '34px', fontSize: '12.5px' }}
                />
                <Hash size={13} style={{ position: 'absolute', left: '9px', top: '10px', color: 'var(--t2)' }} />
              </div>

              {/* 1. Section Dropdown */}
              <select
                value={qrFilterSec}
                onChange={e => {
                  const newSecId = e.target.value;
                  setQrFilterSec(newSecId);
                  if (newSecId !== 'All') {
                    const targetSec = currentSections.find(s => s.id === newSecId);
                    if (targetSec && (selectedQrTable < targetSec.range[0] || selectedQrTable > targetSec.range[1])) {
                      setSelectedQrTable(targetSec.range[0]);
                      ensureQrCode(targetSec.range[0]);
                    }
                  }
                }}
                style={{
                  flex: '1.3 1 220px',
                  minWidth: '200px',
                  height: '34px',
                  fontSize: '12.5px',
                  padding: '4px 10px',
                  color: 'var(--t0)',
                  background: 'var(--s1)'
                }}
                title="Filter by Section"
              >
                <option value="All">All Sections</option>
                {currentSections.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (T{s.range[0]}–T{s.range[1]})</option>
                ))}
              </select>

              {/* 2. Table Dropdown — directly to the right of Section Dropdown */}
              {(() => {
                const tablesList = Array.from({ length: currentTotalTables }, (_, i) => i + 1).filter(tableNo => {
                  if (qrSearch && !String(tableNo).includes(qrSearch.trim())) return false;
                  if (qrFilterSec !== 'All') {
                    const targetSec = currentSections.find(s => s.id === qrFilterSec);
                    if (targetSec && (tableNo < targetSec.range[0] || tableNo > targetSec.range[1])) {
                      return false;
                    }
                  }
                  return true;
                });

                return (
                  <select
                    value={selectedQrTable}
                    onChange={e => {
                      const num = Number(e.target.value);
                      setSelectedQrTable(num);
                      ensureQrCode(num);
                    }}
                    style={{
                      flex: '1.3 1 230px',
                      minWidth: '210px',
                      height: '34px',
                      fontSize: '12.5px',
                      padding: '4px 10px',
                      fontWeight: '700',
                      border: '1px solid var(--a)',
                      color: 'var(--t0)',
                      background: 'var(--s1)'
                    }}
                    title="Select Table"
                  >
                    {tablesList.map(num => {
                      const sec = getSectionForTable(num);
                      return (
                        <option key={num} value={num}>Table {num} ({sec})</option>
                      );
                    })}
                    {tablesList.length === 0 && (
                      <option value={selectedQrTable}>Table {selectedQrTable}</option>
                    )}
                  </select>
                );
              })()}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '260px', flex: '0 1 280px' }}>
              <label style={{ fontSize: '11px', color: 'var(--t2)', whiteSpace: 'nowrap' }}>Domain:</label>
              <input
                type="text"
                value={form.webMenuBaseUrl || ''}
                onChange={e => set('webMenuBaseUrl', e.target.value)}
                placeholder="https://yourvenue.in"
                style={{ flex: 1, fontSize: '11.5px', height: '34px', fontFamily: 'monospace', padding: '4px 8px' }}
              />
            </div>
          </div>

          {/* Active Selected Table QR Card — Compact, Single-Row (No extra space taken) */}
          {(() => {
            const currentTableNo = selectedQrTable;
            const secName = getSectionForTable(currentTableNo);
            const targetSec = currentSections.find(s => currentTableNo >= s.range[0] && currentTableNo <= s.range[1]);
            const theme = SECTION_THEMES.find(t => t.id === targetSec?.color) || SECTION_THEMES[0];
            const qrData = qrCodeUrls[currentTableNo];
            const isCopied = copiedTable === currentTableNo;
            const isDownloading = downloadingQrTable === currentTableNo;
            const targetUrl = `${webBaseUrl}/menu?table=${currentTableNo}`;

            return (
              <div className="qr-active-preview-card">
                <div className="qr-active-preview-left">
                  <div className="qr-img-wrapper" style={{ padding: '6px', background: '#ffffff', borderRadius: '8px', border: '1px solid var(--b1)' }}>
                    {qrData ? (
                      <img
                        src={qrData}
                        alt={`Table ${currentTableNo} QR`}
                        style={{ width: '105px', height: '105px', display: 'block' }}
                      />
                    ) : (
                      <div style={{ width: '105px', height: '105px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>
                        <RefreshCw size={18} className="spin" />
                      </div>
                    )}
                  </div>
                </div>

                <div className="qr-active-preview-right">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--t0)' }}>
                        Table {currentTableNo}
                      </span>
                      <span
                        className="qr-sec-pill"
                        style={{
                          color: theme.hex,
                          background: `${theme.hex}20`,
                          fontSize: '11px',
                          padding: '2px 8px',
                          maxWidth: 'none'
                        }}
                      >
                        {secName}
                      </span>
                    </div>

                    {/* Quick navigation arrows */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={currentTableNo <= 1}
                        onClick={() => {
                          const prev = Math.max(1, currentTableNo - 1);
                          setSelectedQrTable(prev);
                          ensureQrCode(prev);
                        }}
                        style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                        title="Previous Table"
                      >
                        ← Prev
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={currentTableNo >= currentTotalTables}
                        onClick={() => {
                          const next = Math.min(currentTotalTables, currentTableNo + 1);
                          setSelectedQrTable(next);
                          ensureQrCode(next);
                        }}
                        style={{ padding: '3px 8px', fontSize: '11px', height: '26px' }}
                        title="Next Table"
                      >
                        Next →
                      </button>
                    </div>
                  </div>

                  {/* URL Display */}
                  <div style={{
                    fontSize: '11px',
                    color: 'var(--t2)',
                    fontFamily: 'monospace',
                    background: 'var(--s1)',
                    border: '1px solid var(--b1)',
                    borderRadius: '5px',
                    padding: '5px 8px',
                    wordBreak: 'break-all'
                  }}>
                    {targetUrl}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className={`btn ${isCopied ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => handleCopyTableLink(currentTableNo)}
                      style={{ fontSize: '11.5px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      {isCopied ? <Check size={12} /> : <Copy size={12} />}
                      <span>{isCopied ? 'Copied Link!' : 'Copy Link'}</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleDownloadTableQr(currentTableNo)}
                      disabled={isDownloading}
                      style={{ fontSize: '11.5px', padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                    >
                      {isDownloading ? <RefreshCw size={12} className="spin" /> : <Download size={12} />}
                      <span>Download QR (PNG)</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => setShowAllTablesGrid(prev => !prev)}
                      style={{ fontSize: '11px', padding: '4px 8px', color: 'var(--t2)', marginLeft: 'auto' }}
                    >
                      {showAllTablesGrid ? '▲ Hide All Tables Grid' : '▼ Show All Tables Grid'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Optional Collapsible All Tables Grid */}
          {showAllTablesGrid && (
            <div className="qr-tables-grid" style={{ marginTop: '10px' }}>
              {Array.from({ length: currentTotalTables }, (_, i) => i + 1)
                .filter(tableNo => {
                  if (qrSearch && !String(tableNo).includes(qrSearch.trim())) return false;
                  if (qrFilterSec !== 'All') {
                    const targetSec = currentSections.find(s => s.id === qrFilterSec);
                    if (targetSec && (tableNo < targetSec.range[0] || tableNo > targetSec.range[1])) {
                      return false;
                    }
                  }
                  return true;
                })
                .map(tableNo => {
                  const secName = getSectionForTable(tableNo);
                  const targetSec = currentSections.find(s => tableNo >= s.range[0] && tableNo <= s.range[1]);
                  const theme = SECTION_THEMES.find(t => t.id === targetSec?.color) || SECTION_THEMES[0];
                  const isSelected = selectedQrTable === tableNo;

                  return (
                    <div
                      key={tableNo}
                      className={`qr-compact-card ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedQrTable(tableNo);
                        ensureQrCode(tableNo);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="qr-compact-top">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0 }}>
                          <span className="qr-table-num">Table {tableNo}</span>
                          <span className="qr-sec-pill" style={{ color: theme.hex, background: `${theme.hex}20` }}>
                            {secName}
                          </span>
                        </div>
                        <span style={{ fontSize: '10.5px', color: isSelected ? 'var(--a)' : 'var(--t3)', fontWeight: '700' }}>
                          {isSelected ? '● Active' : 'Select'}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </section>

        {/* 3. Printing Services */}
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
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <a
                          href="/print-agent.zip"
                          download="print-agent.zip"
                          className="btn btn-secondary"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 14px', borderRadius: '8px', textDecoration: 'none', color: 'var(--t0)' }}
                        >
                          <Download size={13} />
                          Download Agent
                        </a>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={handleSelfUpdate}
                          disabled={updatingAgent || !agentConnected}
                          title={!agentConnected ? 'Print Agent must be running to update' : 'Push the latest update to the cashier laptop automatically'}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', padding: '6px 14px', borderRadius: '8px' }}
                        >
                          <RefreshCw size={13} style={{ animation: updatingAgent ? 'spin 1s linear infinite' : 'none' }} />
                          {updatingAgent ? 'Updating...' : 'Update Agent'}
                        </button>
                        <a
                          href="/print-agent.js"
                          download="print-agent.js"
                          title="Download only the updated print-agent.js file"
                          style={{ fontSize: '11px', color: 'var(--t2)', textDecoration: 'underline', marginLeft: '4px' }}
                        >
                          (or download only print-agent.js)
                        </a>
                      </div>
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

            {/* 2. Email Notifications & Security Alerts */}
            <section className="settings-card settings-full">
              <div className="settings-card-head">
                <div>
                  <h2>Email Notifications & Security Alerts</h2>
                  <p>Configure automated daily revenue reports and real-time login security alerts.</p>
                </div>
                <Bell size={20} style={{ color: 'var(--a)' }} />
              </div>

              <div className="settings-fields settings-report-fields" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px' }}>
                <div className="settings-field">
                  <label>Sender Email (System SMTP)</label>
                  <input value={form.senderEmail || settings.senderEmail || 'cafeteriahumtum@gmail.com'} readOnly className="settings-readonly" />
                </div>
                <div className="settings-field">
                  <label>Daily Report Admin Email</label>
                  <input value={email.adminEmail || ''} onChange={e => setE('adminEmail', e.target.value)} placeholder="owner@company.com" />
                </div>
                <div className="settings-field">
                  <label>Login Notification Alert Email</label>
                  <input value={email.loginAlertEmail || ''} onChange={e => setE('loginAlertEmail', e.target.value)} placeholder="alokgupta1605@gmail.com" />
                  <span style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '4px', display: 'block' }}>
                    Every successful user login triggers an instant email alert with device, IP, and timestamp.
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label className="settings-toggle" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={email.loginAlertEnabled !== false}
                    onChange={e => setE('loginAlertEnabled', e.target.checked)}
                  />
                  <span>Enable Real-time Login Email Alerts</span>
                </label>
              </div>

              <div className="settings-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '16px' }}>
                <button className="btn btn-primary settings-grid-action" onClick={handleSaveEmail} disabled={savingEmail}>
                  {savingEmail ? 'Saving...' : 'Save Email Settings'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleTestLoginAlert}
                  disabled={testingLoginAlert || !email.loginAlertEmail}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={14} />
                  {testingLoginAlert ? 'Sending Test Alert...' : 'Test Login Alert Email'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleSendReport}
                  disabled={sending || !email.adminEmail}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={14} />
                  {sending ? 'Sending Report...' : 'Send Test Daily Report'}
                </button>
              </div>
              {sendResult && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: sendResult.ok ? 'var(--green)' : 'var(--red)' }}>
                  {sendResult.msg}
                </div>
              )}
            </section>

            {/* 3. Database Backup & Sync Section */}
            {['admin', 'manager'].includes(currentUser?.role) && (
              <section className="settings-card settings-full">
                <div className="settings-card-head">
                  <div>
                    <h2>Database Backup & Sync</h2>
                    <p>Instant cloud backup and one-click database restore from your latest Google Drive backup.</p>
                  </div>
                  <Database size={20} style={{ color: 'var(--a)' }} />
                </div>

                <div className="settings-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '16px' }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleTriggerDriveBackup}
                    disabled={triggeringBackup || restoringBackup}
                  >
                    {triggeringBackup ? (
                      <>
                        <RefreshCw size={14} className="spin" />
                        Backing Up...
                      </>
                    ) : (
                      <>
                        <UploadCloud size={14} />
                        Instant Backup
                      </>
                    )}
                  </button>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={async () => {
                        await handleSyncFromLatestBackup();
                        setConfirmRestoreLock(false);
                      }}
                      disabled={triggeringBackup || restoringBackup || !confirmRestoreLock}
                      style={{
                        opacity: (!confirmRestoreLock || triggeringBackup || restoringBackup) ? 0.45 : 1,
                        cursor: (!confirmRestoreLock || triggeringBackup || restoringBackup) ? 'not-allowed' : 'pointer',
                        borderColor: confirmRestoreLock ? 'rgba(239, 68, 68, 0.6)' : undefined,
                        color: confirmRestoreLock ? '#f87171' : undefined
                      }}
                      title={!confirmRestoreLock ? "Check the confirmation box on the right to unlock" : "Click to sync database with latest Google Drive backup"}
                    >
                      {restoringBackup ? (
                        <>
                          <RefreshCw size={14} className="spin" />
                          Syncing Database...
                        </>
                      ) : (
                        <>
                          <RefreshCw size={14} />
                          Sync from Latest Backup
                        </>
                      )}
                    </button>

                    <label style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '12px',
                      color: confirmRestoreLock ? '#f87171' : 'var(--t2)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      background: confirmRestoreLock ? 'rgba(239, 68, 68, 0.08)' : 'rgba(255,255,255,0.03)',
                      padding: '6px 10px',
                      borderRadius: '6px',
                      border: `1px solid ${confirmRestoreLock ? 'rgba(239, 68, 68, 0.3)' : 'var(--b1)'}`
                    }}>
                      <input
                        type="checkbox"
                        checked={confirmRestoreLock}
                        onChange={e => setConfirmRestoreLock(e.target.checked)}
                        style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                      />
                      <span>Confirm unlock to restore</span>
                    </label>
                  </div>
                </div>

                {backupResult && (
                  <div style={{
                    marginTop: '14px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: backupResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${backupResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: backupResult.success ? '#4ade80' : '#f87171'
                  }}>
                    <span>{backupResult.success ? '✅' : '❌'}</span>
                    <span>{backupResult.message || backupResult.error} {backupResult.time ? `(${backupResult.time})` : ''}</span>
                  </div>
                )}
              </section>
            )}

            {/* 4. Account & Security */}
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

            {/* 5. Where You're Signed In (Active Devices) */}
            <section className="settings-card settings-full settings-devices-card">
              <div className="settings-card-head">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2>Where You're Signed In</h2>
                    {sessions.length > 0 && (
                      <span className="devices-count-badge">
                        {sessions.length} {sessions.length === 1 ? 'device' : 'devices'}
                      </span>
                    )}
                  </div>
                  <p>Active devices and browsers signed in to your POS account. Log out of any device you don't recognize.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={fetchSessions}
                    disabled={loadingSessions}
                    title="Refresh device list"
                  >
                    <RefreshCw size={13} className={loadingSessions ? 'spin' : ''} />
                    Refresh
                  </button>
                  {sessions.filter(s => !s.isCurrent).length > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)' }}
                      onClick={handleRevokeAllOtherSessions}
                      disabled={revokingSession === 'all'}
                    >
                      <LogOut size={13} />
                      {revokingSession === 'all' ? 'Signing out...' : 'Sign out of all other devices'}
                    </button>
                  )}
                </div>
              </div>

              <div className="devices-list">
                {loadingSessions && sessions.length === 0 ? (
                  <div className="devices-empty-state">
                    <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px', color: 'var(--a)' }} />
                    <p>Loading active devices...</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="devices-empty-state">
                    <ShieldCheck size={28} style={{ margin: '0 auto 8px', color: 'var(--green)' }} />
                    <p>No active sessions found.</p>
                  </div>
                ) : (
                  sessions.map(s => (
                    <div key={s.sessionId} className={`device-item ${s.isCurrent ? 'is-current' : ''}`}>
                      <div className="device-item-left">
                        <div className="device-icon-wrap">
                          {renderDeviceIcon(s.deviceType)}
                        </div>
                        <div className="device-info">
                          <div className="device-title-row">
                            <span className="device-name">{s.deviceName}</span>
                            {s.role && (
                              <span style={{
                                fontSize: '0.72rem',
                                padding: '2px 8px',
                                borderRadius: '10px',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                background: s.role === 'admin' ? 'rgba(255, 140, 0, 0.15)' : s.role === 'manager' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                                color: s.role === 'admin' ? '#FF8C00' : s.role === 'manager' ? '#EAB308' : '#60A5FA',
                                border: `1px solid ${s.role === 'admin' ? 'rgba(255, 140, 0, 0.35)' : s.role === 'manager' ? 'rgba(234, 179, 8, 0.35)' : 'rgba(59, 130, 246, 0.35)'}`
                              }}>
                                {s.role} {s.username && s.username !== s.role ? `• ${s.username}` : ''}
                              </span>
                            )}
                            {s.isCurrent && (
                              <span className="device-current-badge">
                                <span className="device-status-dot" /> This device
                              </span>
                            )}
                            <span className="device-active-status">
                              <span className="device-active-dot" /> {s.isCurrent ? 'Active now' : formatRelativeTime(s.lastActive)}
                            </span>
                            {s.ip && <span className="device-ip-badge">{s.ip}</span>}
                          </div>
                          <div className="device-meta-row">
                            <span className="device-meta-item">
                              <MapPin size={13} /> {s.location || 'India'}
                            </span>
                            <span className="device-meta-item">
                              <Clock size={13} /> Signed in: {formatSessionDate(s.createdAt)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="device-item-right">
                        {s.isCurrent ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm device-logout-btn current-logout-btn"
                            onClick={handleLogoutThisDevice}
                            title="Log out of this device"
                          >
                            <LogOut size={13} />
                            Log out
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm device-logout-btn"
                            onClick={() => handleRevokeSession(s.sessionId, s.deviceName)}
                            disabled={revokingSession === s.sessionId}
                            title="Force log out this device"
                          >
                            <LogOut size={13} />
                            {revokingSession === s.sessionId ? 'Logging out...' : 'Log out'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ── Table QR Stand Preview Modal ──────────────────────────── */}
      {previewQrModal && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', zIndex: 1200 }} onClick={() => setPreviewQrModal(null)}>
          <div className="mbox" style={{ maxWidth: '480px', width: '92%', background: 'var(--s1)', borderRadius: '16px', border: '1px solid var(--b1)', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0, color: 'var(--t0)' }}>
                  Table {previewQrModal.tableNo} · QR Tent Card
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--a)' }}>{previewQrModal.sectionName}</span>
              </div>
              <button type="button" onClick={() => setPreviewQrModal(null)} className="iBtn" style={{ padding: '6px' }}>
                ✕
              </button>
            </div>

            {/* Stand Mockup Preview */}
            <div style={{ background: '#0d131f', border: '2px solid #eab308', borderRadius: '12px', padding: '20px', textAlign: 'center', color: '#fff', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
              <div style={{ fontFamily: 'Cinzel, Georgia, serif', fontWeight: '900', fontSize: '20px', color: '#f59e0b', letterSpacing: '2px' }}>
                {(form.restaurantName || 'HUMTUM').toUpperCase()}
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', letterSpacing: '1px', marginTop: '2px' }}>
                {form.brandTagline || 'BAR & RESTAURANT'}
              </div>
              
              <div style={{ display: 'inline-block', background: 'rgba(234,179,8,0.15)', border: '1px solid rgba(234,179,8,0.4)', borderRadius: '12px', padding: '2px 14px', fontSize: '11px', color: '#fbbf24', fontWeight: '700', marginTop: '10px' }}>
                {previewQrModal.sectionName.toUpperCase()}
              </div>

              <div style={{ fontSize: '28px', fontWeight: '900', margin: '10px 0 14px', color: '#fff' }}>
                TABLE {previewQrModal.tableNo}
              </div>

              <div style={{ background: '#fff', display: 'inline-block', padding: '12px', borderRadius: '14px', boxShadow: '0 4px 14px rgba(0,0,0,0.4)' }}>
                {previewQrModal.qrDataUrl ? (
                  <img src={previewQrModal.qrDataUrl} alt="Table QR" style={{ width: '180px', height: '180px', display: 'block' }} />
                ) : (
                  <div style={{ width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
                    Loading QR...
                  </div>
                )}
              </div>

              <div style={{ fontSize: '14px', fontWeight: '700', color: '#e2e8f0', marginTop: '14px' }}>
                SCAN TO VIEW MENU & ORDER
              </div>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                Point phone camera to browse & order
              </div>

              <div style={{ marginTop: '14px', padding: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace' }}>
                {previewQrModal.targetUrl}
              </div>
            </div>

            {/* Modal Actions */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '18px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => handleCopyTableLink(previewQrModal.tableNo)}
              >
                <Copy size={14} /> Copy Link
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                onClick={() => handleDownloadTableQr(previewQrModal.tableNo)}
              >
                <Download size={14} /> Download Card PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Sheet Overlay ───────────────────────────────────── */}
      {showPrintSheet && (
        <div className="moverlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', zIndex: 1200 }} onClick={() => setShowPrintSheet(false)}>
          <div className="mbox" style={{ maxWidth: '850px', width: '95%', maxHeight: '90vh', overflowY: 'auto', background: 'var(--s1)', borderRadius: '16px', border: '1px solid var(--b1)', padding: '24px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '800', margin: 0 }}>Print Table Cards Sheet ({currentTotalTables} Tables)</h3>
                <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--t2)' }}>
                  Printable table tent cards ready to cut and display on tables.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" className="btn btn-primary" onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Printer size={14} /> Print Now
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => setShowPrintSheet(false)}>Close</button>
              </div>
            </div>

            <div className="print-tent-cards-area" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
              {Array.from({ length: currentTotalTables }, (_, i) => i + 1).map(num => (
                <div key={num} style={{ border: '2px solid #eab308', borderRadius: '12px', padding: '16px', textAlign: 'center', background: '#0d131f', color: '#fff' }}>
                  <div style={{ fontFamily: 'Cinzel, Georgia, serif', fontWeight: '900', fontSize: '16px', color: '#f59e0b' }}>
                    {(form.restaurantName || 'HUMTUM').toUpperCase()}
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: '900', margin: '6px 0', color: '#fff' }}>
                    TABLE {num}
                  </div>
                  <div style={{ fontSize: '11px', color: '#fbbf24', fontWeight: '700', marginBottom: '8px' }}>
                    {getSectionForTable(num).toUpperCase()}
                  </div>
                  <div style={{ background: '#fff', display: 'inline-block', padding: '8px', borderRadius: '8px' }}>
                    {qrCodeUrls[num] ? (
                      <img src={qrCodeUrls[num]} alt={`T${num}`} style={{ width: '120px', height: '120px', display: 'block' }} />
                    ) : (
                      <div style={{ width: '120px', height: '120px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
                        Loading...
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', fontWeight: '700', marginTop: '8px', color: '#e2e8f0' }}>SCAN TO VIEW MENU & ORDER</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
