import React, { createContext, useContext, useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { API_BASE, apiUrl, authFetch } from '../lib/api';
import io from 'socket.io-client';
import QRCode from 'qrcode';


const playAlarmChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const playTone = (freq, time, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      
      gain.gain.setValueAtTime(0.15, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + dur);
    };
    
    const now = ctx.currentTime;
    // Pleasant dual chime: C5 and E5
    playTone(523.25, now, 0.15);
    playTone(659.25, now + 0.12, 0.25);
  } catch (err) {
    console.error('Audio play error:', err);
  }
};

const AppContext = createContext(null);
const TABLES_KEY = 'humtum_table_bills_v2';
const AUTH_KEY   = 'humtum_auth_v2';
const TOKEN_KEY  = 'humtum_token_v2';

// ── Role hierarchy ──────────────────────────────────────────────
// admin > manager > staff  (admin can access all lower role views)
export const ROLE_HIERARCHY = {
  admin: {
    label: 'Admin',
    level: 3,
    color: '#FF8C00',
    permissions: ['billing','menu','orders','sales','events','workers','inventory','settings','kitchen']
  },
  manager: {
    label: 'Manager',
    level: 2,
    color: '#B8860B',
    permissions: ['billing','menu','orders','sales','events','inventory','settings','kitchen']
  },
  staff: {
    label: 'Staff',
    level: 1,
    color: '#22C55E',
    permissions: ['billing','orders','events','inventory','kitchen']
  },
};

const MENU_CACHE = 'ht_menu_cache';
const SETTINGS_CACHE = 'ht_settings_cache';
const WORKERS_CACHE = 'ht_workers_cache';
const INVENTORY_CACHE = 'ht_inventory_cache';

const NUM_TABLES = 20;

const DEFAULT_SETTINGS = {
  restaurantName:  'HUMTUM Billing System',
  address:         'Rajendra Nagar, Gorakhpur',
  gstin:           '09AXFPG9491D1Z8',
  phone:           '',
  sgstRate:        2.5,
  cgstRate:        2.5,
  serviceTaxEnabled: false,
  serviceTaxRate:   0,
  currency:        '₹',
  thankYouMsg:     'Thank you for visiting!',
  darkMode:        true,
  directPrinting:  false,
  printAgentEnabled: false,
  printAgentPort: 5001,
  printAgentToken: '',
  billingPrinterName: '',
  detectedPrinters: [],
  adminEmail:      '',
  senderEmail:     '',
};

function initTables() {
  const t = {};
  for (let i = 1; i <= NUM_TABLES; i++) {
    t[`T${i}`] = { items:[], discount:'', customerPhone:'', customerName:'', startTime:null, dueAmount:0 };
  }
  return t;
}

function loadTableBills() {
  try {
    const raw = localStorage.getItem(TABLES_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      const base = initTables();
      return { ...base, ...saved };
    }
  } catch {}
  return initTables();
}

function saveTableBills(bills) {
  try { localStorage.setItem(TABLES_KEY, JSON.stringify(bills)); } catch {}
}

async function safeFetch(url) {
  try {
    const res = await authFetch(url);
    if (!res.ok) { console.log(`API ${res.status}: ${url}`); return null; }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`Fetch failed: ${url}`, err.message);
    return null;
  }
}

export function AppProvider({ children }) {
  // ── Auth ────────────────────────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch { return null; }
  });

  // ── Socket.IO ────────────────────────────────────────────────────
  const [socket, setSocket] = useState(null);
  
  // Socket initialization relocated lower in the provider

  // ── KOT & Table Session State ───────────────────────────────────
  const [kotSessions, setKotSessions] = useState({}); // { tableNo: { kots: [], status, etc } }
  const [currentSession, setCurrentSession] = useState(null); // { tableNo, orderId, activeKots, etc }
  const [kots, setKots] = useState([]);

  // ── Settings ────────────────────────────────────────────────────
  const [settings, _setSettings] = useState(() => {
    try {
      const cached = localStorage.getItem(SETTINGS_CACHE);
      return cached ? { ...DEFAULT_SETTINGS, ...JSON.parse(cached) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  });

  const setSettings = useCallback((updater) => {
    _setSettings(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (JSON.stringify(next) === JSON.stringify(prev)) return prev;
      localStorage.setItem(SETTINGS_CACHE, JSON.stringify(next));
      return next;
    });
  }, []);

  const saveSettings = useCallback(async (updates) => {
    const previousSettings = settings;
    // Optimistic update
    setSettings(prev => {
      const next = { ...prev, ...updates };
      localStorage.setItem(SETTINGS_CACHE, JSON.stringify(next));
      return next;
    });

    try {
      const res = await authFetch(apiUrl('/api/settings'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to save settings');
      const saved = await res.json();
      // Sync with server response
      setSettings(prev => {
        const next = { ...DEFAULT_SETTINGS, ...prev, ...saved };
        localStorage.setItem(SETTINGS_CACHE, JSON.stringify(next));
        return next;
      });
      return saved;
    } catch (err) {
      // Rollback on error
      setSettings(previousSettings);
      localStorage.setItem(SETTINGS_CACHE, JSON.stringify(previousSettings));
      console.error('Save settings error', err);
      throw err;
    }
  }, [settings]);

  useEffect(() => {
    // Only fetch settings if logged in
    if (!currentUser) return;
    (async () => {
      try {
        const res = await authFetch(apiUrl('/api/settings'));
        if (res.ok) {
          const data = await res.json();
          setSettings({ ...DEFAULT_SETTINGS, ...data });
        }
      } catch {}
    })();
    // Expose menu context update for InventoryPage
    window.updateMenuContext = (menuData) => {
      if (menuData) setMenuItems(menuData);
      else authFetch(apiUrl('/api/menu')).then(r=>r.json()).then(setMenuItems).catch(()=>{});
    };
    return () => { delete window.updateMenuContext; };
  }, [currentUser]);

  // ── UI ──────────────────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState('billing');
  const [sidebarOpen,   setSidebarOpen]   = useState(false);

  // ── Data ────────────────────────────────────────────────────────
  const [menuItems,    setMenuItems]    = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [workers,      setWorkers]      = useState([]);
  const [inventory,    setInventory]    = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);
  const printedKotIdsRef = useRef(new Set());

  const applyInventoryUpdate = useCallback((nextInventory) => {
    if (!Array.isArray(nextInventory)) return;
    setInventory(nextInventory);
    const invMap = new Map(nextInventory.map(i => [i._id?.toString(), i]));
    setMenuItems(prev => prev.map(item => {
      const match = nextInventory.find(inv => inv.name?.toLowerCase().trim() === item.name?.toLowerCase().trim());
      if (!match) return item;
      let avail = match.isAvailable !== false && match.available !== false;
      if (avail && match.linkInventoryId) {
        const parentId = typeof match.linkInventoryId === 'object' ? match.linkInventoryId._id?.toString() : match.linkInventoryId?.toString();
        const parent = parentId ? invMap.get(parentId) : null;
        if (parent) {
          if (parent.isAvailable === false || parent.available === false) {
            avail = false;
          } else if (parent.trackStock !== false) {
            avail = parent.stock >= (match.stockDeductionQty || 1);
          }
        }
      } else if (avail && match.trackStock !== false) {
        avail = (match.stock || 0) > 0;
      }
      return { ...item, available: avail };
    }));
    localStorage.setItem(INVENTORY_CACHE, JSON.stringify(nextInventory));
  }, []);

  // ── Tables — persist to localStorage ────────────────────────────
  const [tableBills, _setTableBills] = useState(loadTableBills);
  const setTableBills = useCallback((updater) => {
    _setTableBills(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveTableBills(next);
      return next;
    });
  }, []);

  const [activeTableId,   setActiveTableId]   = useState(null);
  const [categoryFilter,  setCategoryFilter]  = useState('All');
  const [menuSearch,      setMenuSearch]      = useState('');
  const [invoiceOrder,    setInvoiceOrder]    = useState(null);
  

  // ── Print Agent State ───────────────────────────────────────────
  const [agentConnected, setAgentConnected] = useState(false);
  const [agentPrinters, setAgentPrinters] = useState([]);

  // ── Notifications ───────────────────────────────────────────────
  const [toast, setToast] = useState(null); // { msg, type }
  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Printing Utilities ──────────────────────────────────────────
  const firePrint = useCallback(async (html, documentType = 'document', printerName = '') => {
    const runBrowserPrint = () => {
      try {
        const uniqueId = 'print-iframe-' + Math.random().toString(36).substring(2, 9);
        const iframe = document.createElement('iframe');
        iframe.id = uniqueId;
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '10px';
        iframe.style.height = '10px';
        iframe.style.opacity = '0.01';
        iframe.style.border = 'none';
        iframe.style.zIndex = '-9999';
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);
        
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();
        
        setTimeout(() => {
          try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => {
              try {
                document.body.removeChild(iframe);
              } catch (e) {}
            }, 60000);
          } catch (err) {
            console.error('Focus/print failed:', err);
          }
        }, 50);
      } catch (printErr) {
        console.error('Browser print failed:', printErr);
        showToast('Browser printing failed', 'error');
      }
    };

    // ── Local Print Agent Check ───────────────────────────────────────
    if (settings.printAgentEnabled) {
      const port = settings.printAgentPort || 5001;
      const token = settings.printAgentToken || '';
      const targetPrinter = printerName || '';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      try {
        const res = await fetch(`http://localhost:${port}/print`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          signal: controller.signal,
          body: JSON.stringify({
            html,
            printerName: targetPrinter
          })
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          showToast(`Print sent to ${targetPrinter || 'default'} via Print Agent`, 'success');
          return;
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Print agent rejected print job');
        }
      } catch (err) {
        clearTimeout(timeoutId);
        console.warn('⚠️ Local Print Agent failed:', err.message);
        showToast('Print Agent failed or unreachable. Falling back to browser print...', 'error');
        runBrowserPrint();
        return;
      }
    }

    runBrowserPrint();
  }, [settings, showToast]);

  const buildKOTHtml = useCallback((kot, tableNo, items, printerLabel) => {
    const isKitchen = printerLabel === 'KITCHEN';
    const paperWidth = 80;
    const bodyWidth = 70;
    const fontSize = 15;
    const headerFontSize = 18;
    const subFontSize = 14;
    const qtyWidth = 28;
    const qtyAlign = 'left';
    const noteFontSize = 13;
    
    const itemCount = items.length;
    const pageHeight = Math.max(110, 75 + (itemCount * 12));

    return `
    <html>
      <head>
        <title>${printerLabel}</title>
        <style>
          @page { size: ${paperWidth}mm ${pageHeight}mm; margin: 0; }
          body { 
            font-family: Arial, sans-serif, monospace; 
            width: ${bodyWidth}mm; 
            margin: 0; 
            padding: 0; 
            font-size: ${fontSize}px; 
            font-weight: 900;
            -webkit-text-stroke: 0.35px #000;
            letter-spacing: 0.2px;
          }
          .header { text-align: center; font-weight: 900; margin-bottom: 6px; font-size: ${subFontSize}px; }
          .sub { text-align: center; font-size: ${subFontSize}px; margin-bottom: 4px; font-weight: 800; }
          .divider { border-top: 2px dashed #000; margin: 6px 0; }
          .item { display: flex; justify-content: space-between; margin: 4px 0; font-weight: 900; font-size: ${fontSize}px; }
          .qty { font-weight: 900; min-width: ${qtyWidth}px; text-align: ${qtyAlign}; font-size: ${fontSize + 1}px; }
          .note { font-size: ${noteFontSize}px; margin: 0 0 4px 8px; border-left: 2.5px solid #000; padding-left: 5px; font-weight: 800; }
        </style>
      </head>
      <body>
        <div class="header" style="font-size: ${headerFontSize}px;">${printerLabel.toUpperCase()} KOT</div>
        <div class="header">${kot.kotNo} &nbsp;&nbsp;|&nbsp;&nbsp; Table: ${tableNo}</div>
        <div class="sub">${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}</div>
        <div class="divider"></div>
        ${items.map(i => `
          <div class="item"><span>${i.name}</span><span class="qty">${i.quantity}</span></div>
          ${(i.notes || i.note) ? `<div class="note">${i.notes || i.note}</div>` : ''}
        `).join('')}
        <div class="divider"></div>
      </body>
    </html>
  `;
  }, []);

  const printKOTDocument = useCallback((kot, tableNo) => {
    // Separate items by department explicitly
    const kitchenItems = [];
    const barItems = [];
    (kot.items || []).forEach(item => {
      const dept = (item.department || 'kitchen').toLowerCase();
      if (dept === 'bar') {
        barItems.push(item);
      } else {
        kitchenItems.push(item);
      }
    });

    // Print kitchen KOT first (if any)
    if (kitchenItems.length > 0) {
      firePrint(
        buildKOTHtml(kot, tableNo, kitchenItems, 'KITCHEN'),
        'document',
        settings.kitchenPrinterName || ''
      );
    }

    // Print bar KOT (if any) after a short delay to avoid iframe race
    if (barItems.length > 0) {
      setTimeout(() => {
        firePrint(
          buildKOTHtml(kot, tableNo, barItems, 'BAR'),
          'document',
          settings.barPrinterName || ''
        );
      }, 600);
    }
  }, [settings, firePrint, buildKOTHtml]);

  const printBillDocument = useCallback(async (
    tableNo, 
    table, 
    total, 
    waiterName = '', 
    billNoOverride = '', 
    waiterObj = null, 
    paymentMode = 'cash', 
    cashAmount = 0, 
    upiAmount = 0,
    dateOverride = null
  ) => {
    const tempBillNo = billNoOverride ? `HTB-${billNoOverride.split('-').pop()}` : ('HTB-' + String(Date.now()).slice(-5));
    
    const upiId = settings.upiId || 'dummy@upi';
    const merchantName = settings.restaurantName || 'HUMTUM';
    const includeAmount = settings.includeUpiAmount !== false;
    const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(merchantName)}${includeAmount ? `&am=${total.toFixed(0)}` : ''}&cu=INR`;
    
    let qrCodeUrl = '';
    try {
      qrCodeUrl = await QRCode.toDataURL(upiUrl, { margin: 1, width: 250 });
    } catch (err) {
      console.error('Failed to generate local QR Code:', err);
    }

    let waiterTipQrUrl = '';
    if (waiterObj?.upiId) {
      try {
        const waiterUpiUrl = `upi://pay?pa=${encodeURIComponent(waiterObj.upiId)}&pn=${encodeURIComponent(waiterObj.name)}&cu=INR`;
        waiterTipQrUrl = await QRCode.toDataURL(waiterUpiUrl, { margin: 1, width: 200 });
      } catch (err) {
        console.error('Failed to generate local Waiter Tip QR Code:', err);
      }
    }

    const subtotal = typeof table.subtotal === 'number'
      ? table.subtotal
      : table.items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);

    const sgst = typeof table.sgst === 'number'
      ? table.sgst
      : subtotal * (settings.sgstRate / 100);

    const cgst = typeof table.cgst === 'number'
      ? table.cgst
      : subtotal * (settings.cgstRate / 100);

    const serviceTax = typeof table.serviceTax === 'number'
      ? table.serviceTax
      : (settings.serviceTaxEnabled ? subtotal * ((settings.serviceTaxRate || 0) / 100) : 0);

    let discountAmount = 0;
    if (typeof table.discountAmount === 'number') {
      discountAmount = table.discountAmount;
    } else if (typeof table.discount === 'number') {
      discountAmount = table.discount;
    } else {
      const dv = typeof table.discount === 'string' ? table.discount.trim() : '';
      discountAmount = Math.round(dv.endsWith('%')
        ? subtotal * (parseFloat(dv) / 100) || 0
        : parseFloat(dv) || 0);
    }

    const rawTotal = subtotal + sgst + cgst + serviceTax - discountAmount;
    const grandTotal = Math.max(0, Math.round(rawTotal));
    const roundOff = typeof table.roundOff === 'number'
      ? table.roundOff
      : grandTotal - rawTotal;

    const itemCount = table.items.length;
    const hasQr = grandTotal > 0 && settings.upiId;
    const hasTipQr = !!waiterTipQrUrl;
    const pageHeight = 120 + (itemCount * 9) + (hasQr ? 55 : 0) + (hasTipQr ? 45 : 0);

    const restName = (settings.restaurantName || 'HUMTUM').trim();

    const html = `
      <html>
        <head>
          <title>${settings.barPrinterName || 'BAR'} BILL</title>
          <style>
            @page { size: 80mm ${pageHeight}mm; margin: 0; }
            body { font-family: 'Courier New', Courier, monospace; width: 70mm; margin: 0; padding: 0; font-size: 13px; color: #000; line-height: 1.2; font-weight: bold; }
            .center { text-align: center; }
            .brand { font-size: 18px; font-weight: 900; margin-bottom: 2px; text-transform: uppercase; display: block; }
            .address { font-size: 12px; margin-bottom: 6px; line-height: 1.2; }
            .dash-line { border-top: 1px dashed #000; margin: 6px 0; }
            .thick-line { border-top: 2px solid #000; margin: 4px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 12px; }
            .item-header { font-size: 12px; font-weight: 900; display: flex; margin-bottom: 4px; border-bottom: 1px solid #000; padding-bottom: 2px; }
            .item-row { display: flex; margin-bottom: 3px; align-items: flex-start; font-size: 12px; }
            .col-name { flex: 1; padding-right: 4px; text-transform: uppercase; }
            .col-qty { width: 35px; text-align: center; }
            .col-amt { width: 65px; text-align: right; font-weight: bold; }
            .footer-msg { font-size: 12px; margin-top: 10px; font-weight: bold; font-style: italic; }
            .qr-code { width: 130px; height: 130px; margin: 8px auto 2px; display: block; }
          </style>
        </head>
        <body>
          <div class="center">
            <div class="brand">${restName}</div>
            ${settings.address ? `<div class="address">${settings.address}</div>` : ''}
            ${settings.phone ? `<div class="address" style="margin-top:-4px">Ph: ${settings.phone}</div>` : ''}
            ${settings.gstin ? `<div class="address" style="margin-top:-4px">GSTIN: ${settings.gstin}</div>` : ''}
          </div>

          <div class="dash-line"></div>

          <div class="row"><span>BILL: ${tempBillNo}</span><span>TABLE: ${tableNo}</span></div>
          <div class="row">DATE: ${new Date(dateOverride || Date.now()).toLocaleString('en-IN')}</div>
          ${waiterName ? `<div class="row">WAITER: ${waiterName.toUpperCase()}</div>` : ''}

          <div class="dash-line"></div>

          <div class="item-header">
            <span class="col-name">ITEM</span>
            <span class="col-qty">QTY</span>
            <span class="col-amt">AMT</span>
          </div>

          ${table.items.map(i => `
            <div class="item-row">
              <span class="col-name">${i.name}</span>
              <span class="col-qty">${i.quantity}</span>
              <span class="col-amt">${(i.price * i.quantity).toFixed(0)}</span>
            </div>
          `).join('')}

          <div class="dash-line"></div>

          <div class="row"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
          ${cgst > 0 ? `<div class="row"><span>CGST (${settings.cgstRate || 0}%)</span><span>${cgst.toFixed(2)}</span></div>` : ''}
          ${sgst > 0 ? `<div class="row"><span>SGST (${settings.sgstRate || 0}%)</span><span>${sgst.toFixed(2)}</span></div>` : ''}
          ${serviceTax > 0 ? `<div class="row"><span>Service Tax (${settings.serviceTaxRate || 0}%)</span><span>${serviceTax.toFixed(2)}</span></div>` : ''}
          ${discountAmount > 0 ? `<div class="row"><span>Discount</span><span>-${discountAmount.toFixed(2)}</span></div>` : ''}
          ${roundOff !== 0 ? `<div class="row"><span>Round Off</span><span>${roundOff > 0 ? '+' : ''}${roundOff.toFixed(2)}</span></div>` : ''}

          <div class="thick-line"></div>
          
          <div class="row" style="font-size: 16px; font-weight: 900; margin: 4px 0;">
            <span>TOTAL PAYABLE</span>
            <span>Rs. ${total.toFixed(0)}</span>
          </div>

          <div class="thick-line"></div>



          <div class="center">
            <div style="font-size: 13px; font-weight: bold; margin-bottom: 4px;">SCAN TO PAY BILL</div>
            <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
            
            ${waiterTipQrUrl ? `
              <div class="dash-line" style="margin: 12px 0 8px 0;"></div>
              <div style="font-size: 13px; font-weight: bold; margin-bottom: 2px;">TIP YOUR WAITER</div>
              <div style="font-size: 11px; font-weight: bold; color: #555; margin-bottom: 4px;">Scan to Tip ${waiterObj.name.toUpperCase()} directly</div>
              <img class="qr-code" style="width: 100px; height: 100px; margin: 4px auto 2px; display: block;" src="${waiterTipQrUrl}" alt="Tip QR Code" />
            ` : ''}

            <div class="dash-line" style="margin-top: 10px;"></div>
            <div class="footer-msg">${settings.thankYouMsg || 'THANK YOU FOR VISITING!'}</div>
            <div class="footer-msg"><strong>NOTE:</strong> Contact us for parties & group gatherings</div>
          </div>
        </body>
      </html>
    `;
    firePrint(html, 'document', settings.billingPrinterName || settings.barPrinterName || '');
  }, [settings, firePrint]);

  // Socket.IO relocated below loadData definition

  // ── Auth helpers ────────────────────────────────────────────────
  const login = useCallback(async (username, password) => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        return { error: data.error || 'Invalid username or password' };
      }

      // Store token and user info
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(AUTH_KEY, JSON.stringify(data.user));
      setCurrentUser(data.user);
      return { success: true };
    } catch (err) {
      return { error: 'Network error. Please check your connection.' };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setCurrentUser(null);
  }, []);

  // ── Forgot Password ───────────────────────────────────────────
  const forgotPassword = useCallback(async (email) => {
    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to send OTP' };
      return { success: true, message: data.message };
    } catch (err) {
      return { error: 'Network error' };
    }
  }, []);

  const resetPassword = useCallback(async (email, otp, newPassword) => {
    try {
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Failed to reset password' };
      return { success: true, message: data.message };
    } catch (err) {
      return { error: 'Network error' };
    }
  }, []);

  const isFetching = useRef(false);
  const loadData = useCallback(async (isSilent = false, components = ['menu', 'orders', 'workers', 'inventory', 'settings', 'sessions']) => {
    if (isFetching.current) return;
    isFetching.current = true;
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const promises = [];
      const indexMap = {};

      if (components.includes('menu')) {
        indexMap.menu = promises.length;
        promises.push(safeFetch(apiUrl('/api/menu')));
      }
      if (components.includes('orders')) {
        indexMap.orders = promises.length;
        promises.push(safeFetch(apiUrl('/api/orders')));
      }
      if (components.includes('workers')) {
        indexMap.workers = promises.length;
        promises.push(safeFetch(apiUrl('/api/workers')));
      }
      if (components.includes('inventory')) {
        indexMap.inventory = promises.length;
        promises.push(safeFetch(apiUrl('/api/inventory')));
      }
      if (components.includes('settings')) {
        indexMap.settings = promises.length;
        promises.push(safeFetch(apiUrl('/api/settings')));
      }
      if (components.includes('sessions')) {
        indexMap.sessions = promises.length;
        promises.push(safeFetch(apiUrl('/api/orders/sessions/active')));
      }

      const results = await Promise.allSettled(promises);

      if (components.includes('menu') && indexMap.menu !== undefined) {
        const res = results[indexMap.menu];
        if (res && res.status === 'fulfilled' && Array.isArray(res.value)) {
          setMenuItems(res.value);
        }
      }
      if (components.includes('orders') && indexMap.orders !== undefined) {
        const res = results[indexMap.orders];
        if (res && res.status === 'fulfilled' && Array.isArray(res.value)) {
          setOrderHistory([...res.value].sort((a,b)=>new Date(b.updatedAt || b.date)-new Date(a.updatedAt || a.date)));
        }
      }
      if (components.includes('workers') && indexMap.workers !== undefined) {
        const res = results[indexMap.workers];
        if (res && res.status === 'fulfilled' && Array.isArray(res.value)) {
          setWorkers(res.value);
        }
      }
      if (components.includes('inventory') && indexMap.inventory !== undefined) {
        const res = results[indexMap.inventory];
        if (res && res.status === 'fulfilled' && Array.isArray(res.value)) {
          setInventory(res.value);
        }
      }
      if (components.includes('settings') && indexMap.settings !== undefined) {
        const res = results[indexMap.settings];
        if (res && res.status === 'fulfilled' && res.value && !Array.isArray(res.value)) {
          setSettings(res.value);
        }
      }
      if (components.includes('sessions') && indexMap.sessions !== undefined) {
        const res = results[indexMap.sessions];
        if (res && res.status === 'fulfilled' && Array.isArray(res.value)) {
          setActiveSessions(res.value);
        }
      }

    } catch (err) {
      if (!isSilent) setError('Failed to load data');
    } finally {
      if (!isSilent) setLoading(false);
      isFetching.current = false;
    }
  }, [setMenuItems, setWorkers, setInventory, setSettings]);


  // ── Print Agent Auto Connect ─────────────────────────────────────────
  const fetchAgentPrinters = useCallback(async () => {
    const port = settings.printAgentPort || 5001;
    const token = settings.printAgentToken || '';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Increased from 1000ms to 10000ms to allow PowerShell command execution time
    try {
      const res = await fetch(`http://localhost:${port}/printers`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        setAgentPrinters(data.printers || []);
        setAgentConnected(true);
        return data.printers || [];
      } else {
        setAgentConnected(false);
        setAgentPrinters([]);
        return [];
      }
    } catch (err) {
      clearTimeout(timeoutId);
      setAgentConnected(false);
      setAgentPrinters([]);
      return [];
    }
  }, [settings.printAgentPort, settings.printAgentToken]);

  const pingPrintAgent = useCallback(async () => {
    const port = settings.printAgentPort || 5001;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    try {
      const res = await fetch(`http://localhost:${port}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        setAgentConnected(true);
        return true;
      } else {
        setAgentConnected(false);
        return false;
      }
    } catch (err) {
      clearTimeout(timeoutId);
      setAgentConnected(false);
      return false;
    }
  }, [settings.printAgentPort]);

  useEffect(() => {
    let timer = null;
    let isMounted = true;

    const checkHealth = async () => {
      if (!settings.printAgentEnabled || !currentUser) return;
      const connected = await pingPrintAgent();
      if (isMounted && connected) {
        fetchAgentPrinters();
      }
    };

    if (settings.printAgentEnabled && currentUser) {
      checkHealth();
      // Poll every 60 seconds to check agent availability
      timer = setInterval(checkHealth, 60000);
    } else {
      setAgentConnected(false);
    }

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [currentUser, settings.printAgentEnabled, pingPrintAgent, fetchAgentPrinters]);

  // ── Socket.IO ────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) {
      if (socket) socket.disconnect();
      setSocket(null);
      return;
    }

    const newSocket = io(API_BASE, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket'], // Force websocket to fix Render disconnect loops
      auth: {
        token: localStorage.getItem(TOKEN_KEY),
      }
    });

    newSocket.on('connect', () => {
      console.log('✅ Socket.IO connected');
    });

    newSocket.on('disconnect', () => {
      console.log('❌ Socket.IO disconnected');
    });

    newSocket.on('INVENTORY_UPDATED', (data) => {
      if (data && data.inventory) {
        applyInventoryUpdate(data.inventory);
      }
      safeFetch(apiUrl('/api/menu')).then(res => res.json()).then(mList => {
        if (Array.isArray(mList)) setMenu(mList);
      }).catch(() => {});
    });

    newSocket.on('MENU_UPDATED', (menuData) => {
      if (Array.isArray(menuData)) {
        setMenu(menuData);
      } else {
        safeFetch(apiUrl('/api/menu')).then(res => res.json()).then(mList => {
          if (Array.isArray(mList)) setMenu(mList);
        }).catch(() => {});
      }
    });

    let sessionFetchTimer = null;
    newSocket.on('TABLE_SESSION_UPDATED', () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (sessionFetchTimer) clearTimeout(sessionFetchTimer);
      sessionFetchTimer = setTimeout(() => {
        safeFetch(apiUrl('/api/orders/sessions/active')).then(setActiveSessions);
      }, 1500);
    });

    newSocket.on('NEW_KOT', (kot) => {
      if (kot && kot.source === 'pos') {
        console.log('Skipping NEW_KOT print/alarm for POS-created KOT (source):', kot.kotNo);
        return;
      }
      if (kot && kot.notes && kot.notes.includes('pos_print_')) {
        const match = kot.notes.match(/(pos_print_[a-z0-9]+)/);
        if (match) {
          const printJobId = match[1];
          try {
            if (sessionStorage.getItem(printJobId)) {
              console.log('Skipping NEW_KOT print/alarm for POS-created KOT (sessionStorage):', kot.kotNo);
              return;
            }
          } catch (e) {
            console.error(e);
          }
        }
      }

      const kotKey = kot?._id ? String(kot._id) : (kot?.kotNo ? `${kot.kotNo}_${kot.tableNo}` : null);
      if (kotKey) {
        if (printedKotIdsRef.current.has(kotKey)) {
          console.log('Skipping duplicate NEW_KOT print/alarm:', kot.kotNo);
          return;
        }
        printedKotIdsRef.current.add(kotKey);
        setTimeout(() => {
          printedKotIdsRef.current.delete(kotKey);
        }, 30000);
      }

      playAlarmChime();
      showToast(`New order placed on Table ${kot.tableNo}!`, 'info');
      if (kot && kot.items && kot.items.length > 0) {
        printKOTDocument(kot, kot.tableNo);
      }
    });

    newSocket.on('REFRESH_MENU', () => {
      console.log('🔄 REFRESH_MENU received in POS frontend, re-fetching data...');
      loadData(true, ['menu', 'inventory']);
    });

    setSocket(newSocket);

    return () => {
      if (sessionFetchTimer) clearTimeout(sessionFetchTimer);
      if (newSocket) newSocket.disconnect();
    };
  }, [currentUser, printKOTDocument, showToast, applyInventoryUpdate, loadData]);

  const role = (currentUser?.role || 'staff').toLowerCase();
  const can = useCallback((action) => {
    return ROLE_HIERARCHY[role]?.permissions?.includes(action) || false;
  }, [role]);

  const canAccessRole = useCallback((targetRole) => {
    const myLevel  = ROLE_HIERARCHY[role]?.level || 0;
    const tgtLevel = ROLE_HIERARCHY[targetRole?.toLowerCase()]?.level || 0;
    return myLevel >= tgtLevel;
  }, [role]);

  // ── All sellable items (Menu + Inventory drink items) ─────────────
  const allSellableItems = useMemo(() => {
    const menu = menuItems || [];
    const inv  = inventory || [];

    const getImg = (item) => {
      if (item.imageUrl && item.imageUrl.startsWith('http')) return item.imageUrl;
      const cat = item.category?.toLowerCase() || '';
      if (cat.includes('beer')) return 'https://images.unsplash.com/photo-1608270586620-248524c67de9?w=320';
      if (cat.includes('liquor')) return 'https://images.unsplash.com/photo-1527281400683-19dd761dc442?w=320';
      if (cat.includes('soft') || cat.includes('can')) return 'https://images.unsplash.com/photo-1622708782522-d19597a94c21?w=320';
      if (cat.includes('main') || cat.includes('starter')) return 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=320';
      return `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name?.slice(0,1) || 'I')}`;
    };

    const processedMenu = menu
      .filter(m => {
        // Exclude if it exists in inventory, so it's fetched from inventory instead
        return !inv.some(i => (i.name || '').toLowerCase().trim() === (m.name || '').toLowerCase().trim());
      })
      .map(m => ({
        ...m,
        department: m.department || 'kitchen',
        imageUrl: getImg(m),
        available: m.available !== false,
        isInventory: false
      }));

    const inventoryMap = new Map(inv.map(i => [i._id?.toString(), i]));
    const drinkItems = inv.map(i => {
      let avail = i.isAvailable !== false && i.available !== false;
      if (avail && i.linkInventoryId) {
        const parentId = typeof i.linkInventoryId === 'object' ? i.linkInventoryId._id?.toString() : i.linkInventoryId?.toString();
        const parent = parentId ? inventoryMap.get(parentId) : null;
        if (parent) {
          if (parent.isAvailable === false || parent.available === false) {
            avail = false;
          } else if (parent.trackStock !== false) {
            avail = parent.stock >= (i.stockDeductionQty || 1);
          }
        }
      } else if (avail && i.trackStock !== false) {
        avail = (i.stock || 0) > 0;
      }
      return { 
        ...i, 
        department: 'bar',
        imageUrl: getImg(i),
        available: avail, 
        isInventory: true 
      };
    });

    return [...processedMenu, ...drinkItems];
  }, [menuItems, inventory]);

  // ── Filtered menu ────────────────────────────────────────────────
  const filteredMenu = useMemo(() => {
    return allSellableItems.filter(item => {
      const mc = categoryFilter === 'All' || item.category === categoryFilter;
      const query = menuSearch.toLowerCase();
      const ms = item.name.toLowerCase().includes(query) || (item.shortcut || '').toLowerCase().includes(query);
      return mc && ms;
    });
  }, [allSellableItems, categoryFilter, menuSearch]);

  const categories = useMemo(() => {
    const cats = allSellableItems
      .map(i => i.category)
      .filter(Boolean)
      .filter(c => c.toLowerCase() !== 'all');
    return ['All', ...new Set(cats)];
  }, [allSellableItems]);

  // ── Table helpers ────────────────────────────────────────────────
  const selectTable = useCallback((id) => setActiveTableId(id), []);

  const updateTableItem = useCallback((tableId, itemId, action) => {
    if (!tableId) return;

    setTableBills(prev => {
      const current = prev[tableId] || { 
        items: [], discount: '', customerPhone: '', customerName: '', startTime: null, dueAmount: 0 
      };

      const tableItems = [...current.items];
      const idx = tableItems.findIndex(i => String(i._id) === String(itemId));
      const masterItem = allSellableItems.find(i => String(i._id) === String(itemId));

      if (action === 'increase') {
        if (idx >= 0) {
          tableItems[idx] = { ...tableItems[idx], quantity: (tableItems[idx].quantity || 0) + 1 };
        } else if (masterItem) {
          tableItems.push({ ...masterItem, quantity: 1 });
        }
        if (!current.startTime) current.startTime = new Date().toISOString();
      } else if (action === 'decrease' && idx >= 0) {
        if (tableItems[idx].quantity <= 1) tableItems.splice(idx, 1);
        else tableItems[idx] = { ...tableItems[idx], quantity: tableItems[idx].quantity - 1 };
      } else if (action === 'remove' && idx >= 0) {
        tableItems.splice(idx, 1);
      }

      return { ...prev, [tableId]: { ...current, items: tableItems } };
    });
  }, [setTableBills, allSellableItems]);

  const clearTable = useCallback((tableId) => {
    setTableBills(prev => ({
      ...prev,
      [tableId]: { items:[], discount:'', customerPhone:'', customerName:'', startTime:null, dueAmount:0 }
    }));
  }, [setTableBills]);

  const setItemNote = useCallback((tableId, itemId, note) => {
    if (!tableId) return;
    setTableBills(prev => {
      const current = prev[tableId] || { items: [] };
      const tableItems = [...current.items];
      const idx = tableItems.findIndex(i => String(i._id) === String(itemId));
      if (idx >= 0) {
        tableItems[idx] = { ...tableItems[idx], note };
      }
      return { ...prev, [tableId]: { ...current, items: tableItems } };
    });
  }, [setTableBills]);

  const setTableField = useCallback((tableId, field, val) => {
    setTableBills(prev => ({ ...prev, [tableId]: { ...prev[tableId], [field]: val } }));
  }, [setTableBills]);

  // ── Bill totals ──────────────────────────────────────────────────
  const billTotals = useMemo(() => {
    const table    = tableBills[activeTableId] || { items:[], discount:'' };
    const subtotal = table.items.reduce((s,i) => s + i.price * i.quantity, 0);
    const sgst     = subtotal * (settings.sgstRate / 100);
    const cgst     = subtotal * (settings.cgstRate / 100);
    const serviceTax = settings.serviceTaxEnabled ? subtotal * ((settings.serviceTaxRate || 0) / 100) : 0;
    const dv       = (table.discount || '').trim();
    const discountAmount = Math.round(dv.endsWith('%')
      ? subtotal * (parseFloat(dv)/100) || 0
      : parseFloat(dv) || 0);
    const rawTotal = subtotal + sgst + cgst + serviceTax - discountAmount;
    const grandTotal = Math.round(Math.max(0, rawTotal));
    const roundOff = (grandTotal - rawTotal);
    return { subtotal, sgst, cgst, serviceTax, discountAmount, grandTotal, roundOff };
  }, [tableBills, activeTableId, settings]);


  const getTableStatus = useCallback((tableId) => {
    const tableNo = parseInt(tableId.substring(1));
    const session = activeSessions.find(s => s.tableNo === tableNo);
    const t = tableBills[tableId];
    
    let kotItemsCount = 0;
    if (session && Array.isArray(session.kotIds)) {
      session.kotIds.forEach(kot => {
        if (Array.isArray(kot.items)) {
          kot.items.forEach(item => {
            kotItemsCount += item.quantity;
          });
        }
      });
    }
    
    let pendingItemsCount = 0;
    if (t && t.items && t.items.length > 0) {
      pendingItemsCount = t.items.length;
    } else if (session && Array.isArray(session.pendingItems)) {
      pendingItemsCount = session.pendingItems.length;
    }
    
    const hasItems = (kotItemsCount + pendingItemsCount) > 0;
    const isDue = (session?.activeOrderId?.dueAmount > 0) || (t && t.dueAmount > 0);
    
    if (isDue) return 'due';
    if (hasItems) return 'occupied';
    
    return 'free';
  }, [tableBills, activeSessions]);

  const getTableInfo = useCallback((tableId) => {
    const tableNo = parseInt(tableId.substring(1));
    const session = activeSessions.find(s => s.tableNo === tableNo);
    const localBill = tableBills[tableId] || { items: [] };

    let kotItemsCount = 0;
    let kotTotal = 0;
    if (session && Array.isArray(session.kotIds)) {
      session.kotIds.forEach(kot => {
        if (Array.isArray(kot.items)) {
          kot.items.forEach(item => {
            kotItemsCount += item.quantity;
            kotTotal += (item.price || 0) * item.quantity;
          });
        }
      });
    }

    let pendingItemsCount = 0;
    let pendingTotal = 0;
    if (localBill.items && localBill.items.length > 0) {
      localBill.items.forEach(item => {
        pendingItemsCount += item.quantity;
        pendingTotal += (item.price || 0) * item.quantity;
      });
    } else if (session && Array.isArray(session.pendingItems)) {
      session.pendingItems.forEach(item => {
        pendingItemsCount += item.quantity;
        pendingTotal += (item.price || 0) * item.quantity;
      });
    }

    return {
      itemsCount: kotItemsCount + pendingItemsCount,
      totalAmount: kotTotal + pendingTotal
    };
  }, [tableBills, activeSessions]);

  // ── Generate bill (with proper error handling) ──────────────────
  const generateBill = useCallback(async (paymentMode, paidAmount) => {
    const table = tableBills[activeTableId];
    if (!table || table.items.length === 0) return { error: 'No items in bill' };

    const { subtotal, sgst, cgst, serviceTax, discountAmount, grandTotal, roundOff } = billTotals;
    const paid = parseFloat(paidAmount) || grandTotal;
    const due  = Math.max(0, grandTotal - paid);

    const orderData = {
      tableNo: parseInt(activeTableId.substring(1)),
      items:   table.items.map(i => ({ name:i.name, quantity:i.quantity, price:i.price })),
      subtotal, sgst, cgst, serviceTax,
      discount:      discountAmount,
      roundOff,
      grandTotal,
      paidAmount:    paid,
      dueAmount:     due,
      paymentMode,
      date:          new Date().toISOString(),
      customerPhone: table.customerPhone || '',
      customerName:  table.customerName  || '',
    };

    try {
      const res = await authFetch(apiUrl('/api/orders'), {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(orderData)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Server error (${res.status})`);
      }

      const savedResponse = await res.json();
      const { inventory: nextInventory, ...saved } = savedResponse;
      if (nextInventory) applyInventoryUpdate(nextInventory);
      setOrderHistory(prev => [saved, ...(Array.isArray(prev)?prev:[])]);
      setInvoiceOrder(saved);
      // ← Table cleared ONLY here, after successful DB save
      if (due === 0) clearTable(activeTableId);
      else setTableField(activeTableId, 'dueAmount', due);
      return { success:true, order:saved };
    } catch (err) {
      console.error('Generate bill error:', err);
      return { error: err.message || 'Failed to generate bill' };
    }
  }, [tableBills, activeTableId, orderHistory, billTotals, clearTable, setTableField, applyInventoryUpdate]);

  // ── Menu CRUD ────────────────────────────────────────────────────
  const saveMenuItem = useCallback(async (data, id) => {
    const previousMenu = menuItems;
    if (id) {
      // Optimistic update for toggles/edits
      setMenuItems(prev => prev.map(i => i._id === id ? { ...i, ...data } : i));
    }

    try {
      const method = id ? 'PUT' : 'POST';
      const url    = id ? apiUrl(`/api/menu/${id}`) : apiUrl('/api/menu');
      const res    = await authFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
      
      if (!res.ok) throw new Error('Failed to save menu item');
      
      const saved = await res.json();
      setMenuItems(prev => id ? prev.map(i => i._id === id ? saved : i) : [...prev, saved]);
      return saved;
    } catch (err) {
      if (id) setMenuItems(previousMenu); // Rollback
      console.error('Save menu item error:', err);
      throw err;
    }
  }, [menuItems]);

  const deleteMenuItem = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/menu/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    setMenuItems(prev => prev.filter(i=>i._id!==id));
  }, []);

  const deleteOrder = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/orders/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete order');
    setOrderHistory(prev => prev.filter(o => o._id !== id));
  }, []);


  // ── Worker CRUD ──────────────────────────────────────────────────────
  const saveWorker = useCallback(async (data, id) => {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? apiUrl(`/api/workers/${id}`) : apiUrl('/api/workers');
    const res    = await authFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to save worker');
    const saved = await res.json();
    setWorkers(prev => id ? prev.map(w=>w._id===id?saved:w) : [...prev, saved]);
    return saved;
  }, []);

  const deleteWorker = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/workers/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    setWorkers(prev => prev.filter(w=>w._id!==id));
  }, []);

  const updateWorkerStatus = useCallback((id, isActive) => {
    setWorkers(prev => prev.map(w => {
      if (w.userId?._id === id || w.userId === id) {
        return { ...w, userId: { ...w.userId, isActive } };
      }
      return w;
    }));
  }, []);

  const saveInventoryItem = useCallback(async (data, id) => {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? apiUrl(`/api/inventory/${id}`) : apiUrl('/api/inventory');
    const res    = await authFetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
    if (!res.ok) throw new Error('Failed to save inventory');
    const saved = await res.json();
    setInventory(prev => id ? prev.map(i=>i._id===id?saved:i) : [...prev, saved]);
    return saved;
  }, []);

  const deleteInventoryItem = useCallback(async (id) => {
    const res = await authFetch(apiUrl(`/api/inventory/${id}`), { method:'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
    setInventory(prev => prev.filter(i=>i._id!==id));
  }, []);

  const reorderMenuItems = useCallback(async (orderedIds) => {
    try {
      const res = await authFetch(apiUrl('/api/menu/reorder'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
      if (!res.ok) throw new Error('Failed to reorder menu items');
      setMenuItems(prev => {
        const next = prev.map(item => {
          const idx = orderedIds.indexOf(item._id);
          if (idx !== -1) {
            return { ...item, order: idx };
          }
          return item;
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      showToast('Failed to update order of menu items', 'error');
    }
  }, [showToast]);

  const reorderInventoryItems = useCallback(async (orderedIds) => {
    try {
      const res = await authFetch(apiUrl('/api/inventory/reorder'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds })
      });
      if (!res.ok) throw new Error('Failed to reorder inventory items');
      setInventory(prev => {
        const next = prev.map(item => {
          const idx = orderedIds.indexOf(item._id);
          if (idx !== -1) {
            return { ...item, order: idx };
          }
          return item;
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      showToast('Failed to update order of inventory items', 'error');
    }
  }, [showToast]);

  // ── Update order payment mode (from Orders page) ────────────────
  const updateOrderPayment = useCallback(async (orderId, paymentMode, cashAmount = 0, upiAmount = 0) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/settle`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMode, cashAmount, upiAmount })
      });
      if (!res.ok) throw new Error('Failed to update payment mode');
      const updated = await res.json();
      setOrderHistory(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map(o => o._id === orderId ? { ...o, paymentMode: updated.paymentMode, cashAmount: updated.cashAmount, upiAmount: updated.upiAmount } : o);
      });
      return updated;
    } catch (err) {
      console.error('Update payment error:', err);
      throw err;
    }
  }, []);

  // ── Update order discount (from Orders page) ─────────────────────
  const updateOrderDiscount = useCallback(async (orderId, discount) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/discount`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to update discount');
      }
      const updated = await res.json();
      setOrderHistory(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map(o => o._id === orderId ? updated : o);
      });
      return updated;
    } catch (err) {
      console.error('Update discount error:', err);
      throw err;
    }
  }, []);

  // ── Cancel (CLR) table session without saving to history ────────
  const cancelTableSession = useCallback(async (tableNo) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/table/${tableNo}/cancel`), {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to cancel table session');
      return await res.json();
    } catch (err) {
      console.error('Cancel session error:', err);
      throw err;
    }
  }, []);


  const openTableSession = useCallback(async (tableNo, waiterName = '', orderType = 'dine-in', customerName = '', customerPhone = '') => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/table/${tableNo}/open`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ waiterName, orderType, customerName, customerPhone })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to open table');
      }
      const session = await res.json();
      setCurrentSession(session);
      setActiveSessions(prev => {
        const filtered = prev.filter(s => s.tableNo !== session.tableNo);
        return [...filtered, session];
      });
      if (socket) {
        socket.emit('join-table', tableNo);
        socket.emit('table-updated', { tableNo, senderId: socket.id });
      }
      return session;
    } catch (err) {
      console.error('Open table error:', err);
      throw err;
    }
  }, [socket]);

  const syncTableSession = useCallback(async (tableNo, pendingItems, totalAmount, waiterName = '', orderType = 'dine-in', customerName = '', customerPhone = '') => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/table/${tableNo}/session`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingItems, totalAmount, waiterName, orderType, customerName, customerPhone })
      });
      if (!res.ok) throw new Error('Failed to sync session');
      const session = await res.json();
      if (session.message) return null; // Harmless race condition (session already completed)
      
      setCurrentSession(session);
      setActiveSessions(prev => {
        const filtered = prev.filter(s => s.tableNo !== session.tableNo);
        return [...filtered, session];
      });
      if (socket) {
        socket.emit('table-updated', { tableNo, senderId: socket.id });
      }
      return session;
    } catch (err) {
      console.error('Sync session error:', err);
    }
  }, [socket]);

  const createKOT = useCallback(async (orderId, tableNo, items, notes = '', waiterName = '', orderType = 'dine-in') => {
    try {
      const res = await authFetch(apiUrl('/api/kots'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, tableNo, items, notes, waiterName, orderType })
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to create KOT');
      }
      const kotResponse = await res.json();
      const { inventory: nextInventory, ...kot } = kotResponse;
      if (nextInventory) applyInventoryUpdate(nextInventory);
      setKots(prev => [kot, ...prev]);
      if (socket) socket.emit('kot-created', kot);
      return kot;
    } catch (err) {
      console.error('Create KOT error:', err);
      throw err;
    }
  }, [socket, applyInventoryUpdate]);

  const updateKOTStatus = useCallback(async (kotId, status) => {
    try {
      const res = await authFetch(apiUrl(`/api/kots/${kotId}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error('Failed to update KOT');
      const updated = await res.json();
      setKots(prev => prev.map(k => k._id === kotId ? updated : k));
      if (socket) socket.emit('kot-status-updated', updated);
      return updated;
    } catch (err) {
      console.error('Update KOT error:', err);
      throw err;
    }
  }, [socket]);

  const removeKOTItem = useCallback(async (orderId, name, quantityToRemove) => {
    try {
      const res = await authFetch(apiUrl('/api/kots/remove-item'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, name, quantityToRemove })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to remove KOT item');
      }
      const data = await res.json();
      if (data.inventory) applyInventoryUpdate(data.inventory);
      if (data.order) {
        setOrderHistory(prev => prev.map(o => o._id === data.order._id ? data.order : o));
        setInvoiceOrder(prev => prev && prev._id === data.order._id ? data.order : prev);
      }
      
      // Force reload active session to update UI state
      if (socket) socket.emit('kot-updated');
      return data;
    } catch (err) {
      console.error('Remove KOT item error:', err);
      throw err;
    }
  }, [socket, applyInventoryUpdate, setOrderHistory, setInvoiceOrder]);

  const deleteKOT = useCallback(async (kotId, tableNo) => {
    try {
      const res = await authFetch(apiUrl(`/api/kots/${kotId}`), {
        method: 'DELETE'
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to delete KOT');
      }
      const data = await res.json();
      if (data.inventory) applyInventoryUpdate(data.inventory);
      if (data.order) {
        setOrderHistory(prev => prev.map(o => o._id === data.order._id ? data.order : o));
        setInvoiceOrder(prev => prev && prev._id === data.order._id ? data.order : prev);
      }
      setKots(prev => prev.filter(k => k._id !== kotId));
      if (socket) socket.emit('kot-updated');
      return data;
    } catch (err) {
      console.error('Delete KOT error:', err);
      throw err;
    }
  }, [socket, applyInventoryUpdate, setOrderHistory, setInvoiceOrder]);

  const finalizeBill = useCallback(async (orderId, items, subtotal, sgst, cgst, serviceTax, discount, roundOff, grandTotal, waiterName = '', orderType = 'dine-in', customerName = '', customerPhone = '', paymentMode = 'cash', cashAmount = 0, upiAmount = 0) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/finalize-bill`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, subtotal, sgst, cgst, serviceTax, discount, roundOff, grandTotal, waiterName, orderType, customerName, customerPhone, paymentMode, cashAmount, upiAmount })
      });
      if (!res.ok) throw new Error('Failed to finalize bill');
      const orderResponse = await res.json();
      const { inventory: nextInventory, ...order } = orderResponse;
      if (nextInventory) applyInventoryUpdate(nextInventory);

      if (orderResponse.cleared) {
        // Remove from local order history if it exists (e.g. from state update mismatch)
        setOrderHistory(prev => {
          const historyArray = Array.isArray(prev) ? prev : [];
          return historyArray.filter(o => o._id !== orderId);
        });
        setActiveSessions(prev => prev.filter(session => {
          const sessionOrderId = session.activeOrderId?._id || session.activeOrderId;
          return String(sessionOrderId) !== String(orderId);
        }));
        if (socket && order.tableNo) socket.emit('order-completed', { tableNo: order.tableNo, orderId });
        return order;
      }

      setOrderHistory(prev => {
        const historyArray = Array.isArray(prev) ? prev : [];
        const exists = historyArray.some(o => o._id === orderId);
        if (exists) {
          return historyArray.map(o => o._id === orderId ? order : o);
        } else {
          return [order, ...historyArray];
        }
      });
      setActiveSessions(prev => prev.filter(session => {
        const sessionOrderId = session.activeOrderId?._id || session.activeOrderId;
        return String(sessionOrderId) !== String(orderId) && session.tableNo !== order.tableNo;
      }));
      if (socket && order.tableNo) socket.emit('order-completed', { tableNo: order.tableNo, orderId });
      return order;
    } catch (err) {
      console.error('Finalize bill error:', err);
      throw err;
    }
  }, [applyInventoryUpdate, socket]);

  const completeOrder = useCallback(async (orderId) => {
    try {
      const res = await authFetch(apiUrl(`/api/orders/${orderId}/complete`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error('Failed to complete order');
      const order = await res.json();

      if (order.cleared) {
        setOrderHistory(prev => {
          const historyArray = Array.isArray(prev) ? prev : [];
          return historyArray.filter(o => o._id !== orderId);
        });
        if (socket && order.tableNo) socket.emit('order-completed', { tableNo: order.tableNo, orderId });
        return order;
      }

      setOrderHistory(prev => {
        const historyArray = Array.isArray(prev) ? prev : [];
        const exists = historyArray.some(o => o._id === orderId);
        if (exists) {
          return historyArray.map(o => o._id === orderId ? order : o);
        } else {
          return [order, ...historyArray];
        }
      });
      if (socket && order.tableNo) socket.emit('order-completed', { tableNo: order.tableNo, orderId });
      return order;
    } catch (err) {
      console.error('Complete order error:', err);
      throw err;
    }
  }, [socket]);

  const toggleDryDay = useCallback(async (targetState) => {
    const isDry = targetState !== undefined ? !!targetState : !settings.isDryDay;

    // 1. INSTANT OPTIMISTIC STATE UPDATE (0ms UI latency)
    setSettings(prev => ({ ...prev, isDryDay: isDry }));

    const isAlcoholicItem = (i) => !!(i.isAlcoholic || i.isAlcohol);

    setInventory(prev => prev.map(item => {
      if (isAlcoholicItem(item)) {
        return { ...item, isAvailable: !isDry, available: !isDry };
      }
      return item;
    }));

    showToast(isDry ? 'Dry Day Activated: Alcohol items disabled' : 'Dry Day Deactivated: Alcohol items restored', isDry ? 'amber' : 'green');

    // 2. BACKGROUND API SYNC
    try {
      const res = await authFetch(apiUrl('/api/inventory/dry-day'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDryDay: isDry })
      });
      if (!res.ok) throw new Error('Failed to toggle dry day');
      const data = await res.json();
      setSettings(prev => ({ ...prev, isDryDay: data.isDryDay }));
      if (Array.isArray(data.inventory)) {
        applyInventoryUpdate(data.inventory);
      }
      return data;
    } catch (err) {
      console.error('Toggle dry day error:', err);
      // Rollback on error
      setSettings(prev => ({ ...prev, isDryDay: !isDry }));
      showToast('Failed to toggle Dry Day status', 'red');
    }
  }, [settings.isDryDay, applyInventoryUpdate, setSettings, showToast, setInventory]);

  return (
    <AppContext.Provider value={{
      currentUser, login, logout,
      forgotPassword, resetPassword,
      role, can, canAccessRole, ROLE_HIERARCHY,
      settings, setSettings, saveSettings,
      activeSection, setActiveSection,
      sidebarOpen, setSidebarOpen,
      menuItems, orderHistory, workers,
      inventory, setInventory,
      saveInventoryItem, deleteInventoryItem,
      reorderMenuItems, reorderInventoryItems,
      loading, error, loadData,
      tableBills, setTableBills, activeTableId, selectTable,
      updateTableItem, clearTable, setTableField, setItemNote,
      allSellableItems, billTotals, filteredMenu, categories,
      categoryFilter, setCategoryFilter,
      menuSearch, setMenuSearch,
      getTableStatus, generateBill,
      activeSessions, getTableInfo,
      invoiceOrder, setInvoiceOrder,
      saveMenuItem, deleteMenuItem, deleteOrder, updateOrderPayment, updateOrderDiscount,
      saveWorker, deleteWorker, updateWorkerStatus,
      toast, showToast,
      isDryDay: !!settings.isDryDay, toggleDryDay,
      NUM_TABLES,
      // Print Agent
      agentConnected, agentPrinters, fetchAgentPrinters, pingPrintAgent,
      // Socket.IO & KOT functions
      socket,
      kotSessions, currentSession, kots,
      openTableSession, syncTableSession, createKOT, updateKOTStatus, removeKOTItem, deleteKOT, finalizeBill, completeOrder, cancelTableSession,
      printKOTDocument, printBillDocument,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() { return useContext(AppContext); }
