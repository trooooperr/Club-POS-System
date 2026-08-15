import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { ArrowLeft, Search, Trash2, Printer, UtensilsCrossed, X, Menu, Clock } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';
import LiveKOTModal from '../components/LiveKOTModal';

const qz = window.qz;

function KOTDetailsModal({ kot, currency = '₹', onClose, onDelete, canDelete = false }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onClose]);

  if (!kot) return null;

  const items = kot.items || [];
  const kotSubtotal = items.reduce((sum, i) => sum + (i.price || 0) * (i.quantity || 0), 0);

  return (
    <div 
      className="moverlay" 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)', zIndex: 1100 }} 
      onClick={onClose}
    >
      <div 
        className="mbox" 
        style={{ maxWidth: '460px', width: '92%', padding: '20px', position: 'relative', borderRadius: '14px', background: 'var(--s1)', border: '1px solid var(--b1)', color: 'var(--t0)' }} 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--t0)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{kot.kotNo || `KOT-${kot._id?.slice(-4)}`}</span>
              <span className="badge" style={{ fontSize: 11, background: 'var(--s3)', color: 'var(--t1)', padding: '2px 8px', borderRadius: 6 }}>
                Table {kot.tableNo}
              </span>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            style={{ background: 'var(--s2)', border: '1px solid var(--b1)', color: 'var(--t1)', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            title="Close (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* Metadata Bar */}
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--t2)', marginBottom: 14, background: 'var(--s2)', padding: '8px 12px', borderRadius: 8, flexWrap: 'wrap' }}>
          {kot.waiterName && <div>Waitstaff: <strong style={{ color: 'var(--t0)' }}>{kot.waiterName.toUpperCase()}</strong></div>}
          {kot.orderType && <div>Type: <strong style={{ color: 'var(--a)' }}>{kot.orderType.toUpperCase()}</strong></div>}
        </div>

        {/* Items List Table */}
        <div style={{ maxHeight: '260px', overflowY: 'auto', marginBottom: 14, border: '1px solid var(--b1)', borderRadius: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--s2)', borderBottom: '1px solid var(--b1)', color: 'var(--t2)', fontSize: 11, textTransform: 'uppercase' }}>
                <th align="left" style={{ padding: '8px 12px' }}>Item</th>
                <th align="center" style={{ padding: '8px 6px' }}>Qty</th>
                <th align="right" style={{ padding: '8px 12px' }}>Price</th>
                <th align="right" style={{ padding: '8px 12px' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--b1)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--t0)' }}>
                    {item.name}
                    {item.notes && <div style={{ fontSize: 10, color: '#F59E0B', fontStyle: 'italic' }}>Note: {item.notes}</div>}
                  </td>
                  <td align="center" style={{ padding: '8px 6px', fontWeight: 700 }}>x{item.quantity}</td>
                  <td align="right" style={{ padding: '8px 12px', color: 'var(--t2)' }}>{currency}{(item.price || 0).toFixed(0)}</td>
                  <td align="right" style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--t0)' }}>{currency}{((item.price || 0) * (item.quantity || 0)).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 10, borderTop: '1px solid var(--b1)', fontWeight: 800 }}>
          {canDelete && onDelete ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onDelete(kot);
              }}
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#EF4444',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 'bold',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Trash2 size={13} />
              Delete KOT
            </button>
          ) : (
            <span style={{ color: 'var(--t1)', fontSize: 12 }}>KOT Items: {items.reduce((sum, i) => sum + (i.quantity || 0), 0)}</span>
          )}
          <span style={{ color: 'var(--a)', fontSize: 16 }}>Total: {currency}{kotSubtotal.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

/* COMPACT TABLE PILL */
function TableCard({ id, isActive, status, num, onClick }) {
  return (
    <button className={`tcard-mini ${status}${isActive ? ' active' : ''}`} onClick={onClick}>
      <span className="tnum-mini">{num}</span>
      <div className={`tstatus-dot ${status}`} />
    </button>
  );
}

function TableTile({ id, status, num, total, items, currency, onClick, isVip }) {
  const isOccupied = status === 'occupied';
  const isDue = status === 'due';
  const isFree = !isOccupied && !isDue;
  const statusLabel = isOccupied || isDue ? 'Busy' : 'Free';

  return (
    <button
      className={`table-tile ${status}${isVip ? ' vip-tile' : ''}`}
      onClick={onClick}
    >
      {isVip && <div className="vip-shimmer" />}
      <div className="table-tile-inner">
        <div className="table-tile-header">
          <div className="table-tile-icon">
            {isVip && <span className="vip-crown">♛</span>}
            <span className="table-tile-number">T{num}</span>
          </div>
          <span className={`table-tile-status ${status}`}>{statusLabel}</span>
        </div>
        {isVip && <span className="vip-label">VIP</span>}
        <div className="table-tile-footer">
          {isFree ? (
            <span className="table-tile-free-hint">Tap to open</span>
          ) : (
            <>
              <span className="table-tile-items">{items} item{items !== 1 ? 's' : ''}</span>
              <strong className="table-tile-amount">{currency}{total.toFixed(0)}</strong>
            </>
          )}
        </div>
      </div>
    </button>
  );
}

/* IMAGE-FOCUS MENU ITEM */
function MenuItem({ item, qty, add, rem, stock, minStock }) {
  const src = item.imageUrl?.startsWith('http') ? item.imageUrl
    : `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name.slice(0, 1))}`;
  return (
    <div className={`mcard-modern${!item.available ? ' na' : ''}`}>
      <div className="mimg-container">
        <img className="mimg-big" src={src} alt={item.name} onError={e => { e.target.src = `https://placehold.co/320x320/171921/F59E0B?text=${encodeURIComponent(item.name.slice(0, 1))}` }} />
        <div className="m-price-tag" style={{ position: 'absolute', bottom: 8, left: 8, zIndex: 5 }}>₹{item.price.toFixed(0)}</div>
        {!item.available && <div className="sold-out-badge-top" style={{ top: 8, left: 8, right: 'auto' }}>SOLD OUT</div>}
        {stock !== undefined && stock > 0 && (
          <div className={`stock-badge ${stock <= (minStock || 5) ? 'low' : ''}`} style={{ top: 8, right: 8 }}>
            Stock: {stock}
          </div>
        )}
      </div>
      <div className="mbody-modern">
        <div className="mname-modern" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {item.department !== 'bar' && (
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 14,
              height: 14,
              border: `1px solid ${item.isVeg !== false ? '#28a745' : '#dc3545'}`,
              padding: 2,
              flexShrink: 0
            }}>
              <span style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                backgroundColor: item.isVeg !== false ? '#28a745' : '#dc3545'
              }} />
            </span>
          )}
          <span>{item.name}</span>
        </div>
        {item.available && (
          <div className="mctrl-modern">
            <button className="qbtn-m" onClick={() => rem(String(item._id), 'decrease')}>−</button>
            <span className="qnum-m" style={{ fontSize: '14px' }}>{qty}</span>
            <button className="qbtn-m" onClick={() => add(String(item._id), 'increase')}>+</button>
          </div>
        )}
      </div>
    </div>
  );
}

// PayModal and settle UI removed — printing handled directly via doGen/printFinalBill

/* ─── BILLING NAV BAR ─────────────────────────────────────────── */
function BillingNavBar({
  activeTableId, occupiedCount, totalTables,
  onBack, onPrintKOT, onPrintBill, onOpenLiveQueue,
  pendingCount = 0, allCount = 0, busy = false
}) {
  const vacantCount = totalTables - occupiedCount;
  return (
    <div className="billing-navbar">
      {/* LEFT: Back + Title */}
      <div className="bnav-left">
        {onBack && (
          <button className="bnav-back-btn" onClick={onBack} title="Back to Tables (Esc)">
            <ArrowLeft size={15} />
          </button>
        )}
        <div className="bnav-title-group">
          <UtensilsCrossed size={16} className="bnav-icon" />
          <span className="bnav-title">Billing</span>
          {activeTableId && (
            <span className="bnav-table-badge">Table {activeTableId.substring(1)}</span>
          )}
        </div>
      </div>

      {/* CENTER: Shortcuts */}
      {activeTableId && (
        <div className="bnav-shortcuts">
          <button
            className="bnav-shortcut-btn kot"
            onClick={onPrintKOT}
            disabled={pendingCount === 0 || busy}
            title="Print KOT (Ctrl+K)"
          >
            <Printer size={13} />
            <span>KOT</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button
            className="bnav-shortcut-btn bill"
            onClick={onPrintBill}
            disabled={allCount === 0 || busy}
            title="Print Bill (Ctrl+Enter)"
          >
            <Printer size={13} />
            <span>Bill</span>
            <kbd>Ctrl ↵</kbd>
          </button>
          <div className="bnav-shortcut-btn esc" title="Back to Tables (Esc)" onClick={onBack}>
            <span>Esc</span>
            <kbd>↩</kbd>
          </div>
        </div>
      )}

      {/* RIGHT: Stats & Live KOTs Button */}
      <div className="bnav-stats" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <button
          type="button"
          onClick={onOpenLiveQueue}
          style={{ background: 'rgba(245,158,11,0.14)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', height: '36px' }}
          title="Open Live KOT Display"
        >
          <Clock size={14} />
          <span>Live KOTs</span>
        </button>

        <div className="bnav-stat occupied">
          <span className="bnav-stat-dot occ-dot" />
          <div>
            <div className="bnav-stat-num">{occupiedCount}</div>
            <div className="bnav-stat-label">Active</div>
          </div>
        </div>
        <div className="bnav-stat vacant">
          <span className="bnav-stat-dot vac-dot" />
          <div>
            <div className="bnav-stat-num">{vacantCount}</div>
            <div className="bnav-stat-label">Vacant</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BillingPage() {
  const {
    tableBills, setTableBills, activeTableId, selectTable,
    updateTableItem: updateTableItemRaw,
    clearTable: clearTableRaw,
    setTableField: setTableFieldRaw,
    setItemNote: setItemNoteRaw,
    allSellableItems,
    billTotals, filteredMenu, categories, categoryFilter, setCategoryFilter,
    menuSearch, setMenuSearch, inventory, workers, getTableStatus, getTableInfo, settings, NUM_TABLES,
    openTableSession, createKOT, finalizeBill, completeOrder, socket, syncTableSession, cancelTableSession,
    setSidebarOpen, showToast, printKOTDocument, printBillDocument,
    removeKOTItem, deleteKOT, role
  } = useApp();

  const [pm] = useState('cash');
  const [tableSearch, setTableSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileBillOpen, setMobileBillOpen] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null); // Current order for this table
  const [kots, setKots] = useState([]); // KOTs for current order
  const [confirmDialog, setConfirmDialog] = useState(null); // { title, message, confirmText, danger, onConfirm, onCancel }
  const [selectedKotDetails, setSelectedKotDetails] = useState(null);
  const [showLiveKOTModal, setShowLiveKOTModal] = useState(false);
  const [customerHistoryMap, setCustomerHistoryMap] = useState({});
  const [showHistory, setShowHistory] = useState(false);

  const showConfirm = (message, onConfirm, isDanger = false, confirmText = 'Confirm', title = 'Confirm Action', onCancel = null) => {
    setConfirmDialog({ title, message, confirmText, danger: isDanger, onConfirm, onCancel });
  };
  
  // Wrap state setters and actions to track user edit timestamps
  const lastEditRef = useRef({}); // { tableId: timestamp }
  
  const recordLocalEdit = (tableId) => {
    if (tableId) {
      lastEditRef.current[tableId] = Date.now();
    }
  };

  const [orderType, setOrderTypeRaw] = useState('dine-in');
  const [selectedWaiter, setSelectedWaiterRaw] = useState('');

  const setOrderType = (val) => {
    recordLocalEdit(activeTableId);
    setOrderTypeRaw(val);
  };

  const setSelectedWaiter = (val) => {
    recordLocalEdit(activeTableId);
    setSelectedWaiterRaw(val);
  };

  const updateTableItem = (tableId, itemId, action) => {
    recordLocalEdit(tableId);
    updateTableItemRaw(tableId, itemId, action);
  };

  const clearTable = (tableId) => {
    recordLocalEdit(tableId);
    clearTableRaw(tableId);
  };

  const setTableField = (tableId, field, val) => {
    recordLocalEdit(tableId);
    setTableFieldRaw(tableId, field, val);
  };

  const setItemNote = (tableId, itemId, note) => {
    recordLocalEdit(tableId);
    setItemNoteRaw(tableId, itemId, note);
  };

  const [billPanelWidth, setBillPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const searchInputRef = useRef(null);
  const billingGridRef = useRef(null);

  const table = tableBills[activeTableId] || { items: [], customerPhone: '', customerName: '', discount: '' };
  const c = settings.currency;
  const waiterOptions = useMemo(() => {
    return (workers || []).filter(w => {
      const role = String(w.role || '').toLowerCase();
      return role.includes('waiter') || role.includes('staff') || role.includes('server');
    });
  }, [workers]);

  const selectedWaiterObj = useMemo(() => {
    return waiterOptions.find(w => w._id === selectedWaiter) || null;
  }, [waiterOptions, selectedWaiter]);

  // Group sent KOT items and pending items
  const combinedItems = useMemo(() => {
    const sentMap = {};
    (kots || []).forEach(kot => {
      (kot.items || []).forEach(item => {
        const id = item.menuItemId?._id || item.menuItemId;
        const key = id || item.name;
        if (sentMap[key]) {
          sentMap[key].quantity += item.quantity;
        } else {
          sentMap[key] = {
            _id: id,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            isSent: true,
            note: item.notes || ''
          };
        }
      });
    });

    const pending = (table.items || []).map(item => ({
      ...item,
      isSent: false
    }));

    return {
      sent: Object.values(sentMap),
      pending,
      all: [...Object.values(sentMap), ...pending]
    };
  }, [kots, table.items]);

  // Combined totals
  const totals = useMemo(() => {
    const subtotal = combinedItems.all.reduce((s, i) => s + (i.price || 0) * (i.quantity || 0), 0);
    const sgst = subtotal * (settings.sgstRate / 100);
    const cgst = subtotal * (settings.cgstRate / 100);
    const serviceTax = settings.serviceTaxEnabled ? subtotal * ((settings.serviceTaxRate || 0) / 100) : 0;
    const discountVal = parseFloat((table.discount || '').replace(/[^0-9.]/g, '')) || 0;
    const discountAmount = Math.round(subtotal * (discountVal / 100));
    const rawTotal = subtotal + sgst + cgst + serviceTax - discountAmount;
    const grandTotal = Math.max(0, Math.round(rawTotal));
    const roundOff = grandTotal - rawTotal;
    return { subtotal, sgst, cgst, serviceTax, discountAmount, grandTotal, roundOff };
  }, [combinedItems.all, table.discount, settings]);

  const { subtotal, sgst, cgst, serviceTax, discountAmount, grandTotal, roundOff } = totals;

  const tableList = Array.from({ length: NUM_TABLES }, (_, i) => {
    const id = `T${i + 1}`;
    const info = getTableInfo(id);
    return { id, num: i + 1, status: getTableStatus(id), items: info.itemsCount, total: info.totalAmount };
  });
  const occupiedCount = tableList.filter(t => t.status !== 'free').length;

  const [billError, setBillError] = useState('');
  const [isMobile, setIsMobile] = useState(typeof window !== 'undefined' ? window.innerWidth <= 750 : false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 750);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);



  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (event) => {
      const container = billingGridRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const newWidth = Math.min(600, Math.max(420, rect.right - event.clientX));
      setBillPanelWidth(newWidth);
    };
    const onMouseUp = () => setIsResizing(false);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);


  // When table is selected, load/open session
  const ensureActiveOrder = async (tableIdOverride, createIfMissing = true) => {
    const targetTableId = tableIdOverride || activeTableId;
    if (!targetTableId) return null;
    const tableNo = parseInt(targetTableId.substring(1));

    try {
      const response = await authFetch(apiUrl(`/api/orders/table/${tableNo}/session`));

      let session;
      if (response.ok) {
        session = await response.json();
      } else if (response.status === 404) {
        if (!createIfMissing) {
          setActiveOrder(null);
          setKots([]);
          return null;
        }
        session = await openTableSession(tableNo, selectedWaiterObj?.name || '', orderType);
      } else {
        throw new Error('Unable to load table session');
      }

      // Check if session has a message indicating no active session (our backend returns 200 with { message: 'No active session' })
      if (session && session.message === 'No active session') {
        if (!createIfMissing) {
          setActiveOrder(null);
          setKots([]);
          return null;
        }
        session = await openTableSession(tableNo, selectedWaiterObj?.name || '', orderType);
      }

      const orderId = session?.activeOrderId?._id || session?.activeOrderId;
      if (!orderId) {
        if (!createIfMissing) {
          setActiveOrder(null);
          setKots([]);
          return null;
        }
        const newSession = await openTableSession(tableNo, selectedWaiterObj?.name || '', orderType);
        const newOrderId = newSession?.activeOrderId?._id || newSession?.activeOrderId;
        if (!newOrderId) throw new Error('Unable to determine active order');
        setActiveOrder(newOrderId);
        return newOrderId;
      }

      // Map database pending items to local table format
      const dbPendingItems = (session?.pendingItems || []).map(i => ({
        _id: i.menuItemId?._id || i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        department: i.department || 'kitchen',
        note: i.notes || ''
      }));

      // Update local storage/state table bills if not edited recently
      const lastEdit = lastEditRef.current[targetTableId] || 0;
      const timeSinceLastEdit = Date.now() - lastEdit;

      if (timeSinceLastEdit >= 2500) {
        setTableBills(prev => ({
          ...prev,
          [targetTableId]: {
            ...prev[targetTableId],
            items: dbPendingItems,
            customerName: session?.activeOrderId?.customerName || prev[targetTableId]?.customerName || '',
            customerPhone: session?.activeOrderId?.customerPhone || prev[targetTableId]?.customerPhone || '',
            discount: session?.activeOrderId?.discount?.toString() || prev[targetTableId]?.discount || ''
          }
        }));

        // Update selectedWaiter and orderType from DB session
        if (session?.waiterName) {
          const waiter = waiterOptions.find(w => w.name === session.waiterName || w.userId?.name === session.waiterName);
          setSelectedWaiterRaw(waiter ? waiter._id : '');
        } else {
          setSelectedWaiterRaw('');
        }
        if (session?.orderType) {
          setOrderTypeRaw(session.orderType);
        } else {
          setOrderTypeRaw('dine-in');
        }
      }

      setActiveOrder(orderId);
      setKots(session?.kotIds || []);

      return orderId;
    } catch (err) {
      console.error('Load session error:', err);
      throw err;
    }
  };

  useEffect(() => {
    if (!activeTableId) {
      setActiveOrder(null);
      setKots([]);
      return;
    }
    const loadTableSession = async () => {
      try {
        await ensureActiveOrder();
      } catch (err) {
        console.error('Load session error:', err);
      }
    };
    loadTableSession();
  }, [activeTableId]);

  // Sync changes to backend session
  useEffect(() => {
    if (!activeTableId || !activeOrder) return;
    const tableNo = parseInt(activeTableId.substring(1));

    const delayDebounceFn = setTimeout(() => {
      // ONLY sync if the user made local changes recently (in the last 2 seconds)
      const lastEdit = lastEditRef.current[activeTableId] || 0;
      const timeSinceLastEdit = Date.now() - lastEdit;
      if (timeSinceLastEdit > 2000) {
        return;
      }

      const pendingItemsForDb = (table.items || []).map(i => ({
        menuItemId: i._id || i.menuItemId,
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        department: i.department || 'kitchen',
        notes: i.note || ''
      }));

      syncTableSession(
        tableNo,
        pendingItemsForDb,
        totals.grandTotal,
        selectedWaiterObj?.name || '',
        orderType,
        table.customerName || '',
        table.customerPhone || ''
      ).catch(() => { });
    }, 800); // 800ms debounce

    return () => clearTimeout(delayDebounceFn);
  }, [table.items, table.customerName, table.customerPhone, selectedWaiterObj, orderType, activeTableId, activeOrder, totals.grandTotal]);

  // Auto-fill returning customer details and load CRM history when 10-digit phone number is entered
  useEffect(() => {
    const rawPhone = (table.customerPhone || '').replace(/\D/g, '');
    if (rawPhone.length === 10) {
      authFetch(apiUrl(`/api/orders/customer-history/${rawPhone}`))
        .then(res => res.json())
        .then(data => {
          if (data && data.customerName && !table.customerName) {
            setTableField(activeTableId, 'customerName', data.customerName);
          }
          setCustomerHistoryMap(prev => ({ ...prev, [activeTableId]: data }));
        })
        .catch(() => {});
    } else {
      setCustomerHistoryMap(prev => ({ ...prev, [activeTableId]: null }));
    }
  }, [table.customerPhone, activeTableId]);

  // Listen to real-time socket events for current table
  useEffect(() => {
    if (!activeTableId || !socket) return;
    const tableNo = parseInt(activeTableId.substring(1));

    socket.emit('join-table', tableNo);

    const handleUpdate = (data) => {
      // If we triggered the update, ignore it to prevent race conditions
      if (data && data.senderId === socket.id) {
        return;
      }
      ensureActiveOrder(undefined, false).catch(() => { });
    };

    const handleOrderCompleted = () => {
      // Clean up frontend state immediately and do NOT fetch/reopen
      clearTable(activeTableId);
      setActiveOrder(null);
      setKots([]);
      setSelectedWaiter('');
    };

    socket.on('KOT_UPDATED', handleUpdate);
    socket.on('NEW_KOT', handleUpdate);
    socket.on('TABLE_UPDATED', handleUpdate);
    socket.on('ORDER_COMPLETED', handleOrderCompleted);

    return () => {
      socket.off('KOT_UPDATED', handleUpdate);
      socket.off('NEW_KOT', handleUpdate);
      socket.off('TABLE_UPDATED', handleUpdate);
      socket.off('ORDER_COMPLETED', handleOrderCompleted);
    };
  }, [activeTableId, socket, clearTable]);

  // Print KOT
  const printKOT = async () => {
    try {
      const orderId = activeOrder || await ensureActiveOrder();
      if (table.items.length === 0) {
        setBillError('Please add items first');
        return;
      }

      const hasClrItem = table.items.some(i => i.name && i.name.toUpperCase() === 'CLR');
      if (hasClrItem) {
        setBusy(true);
        try {
          const tableNo = parseInt(activeTableId.substring(1));
          await cancelTableSession(tableNo);
          clearTable(activeTableId);
          setKots([]);
          setActiveOrder(null);
          setSelectedWaiterRaw('');
          setOrderTypeRaw('dine-in');
          setBillError('');
          setMobileBillOpen(false);
          showToast(`Table ${tableNo} cleared`, 'success');
        } catch (err) {
          setBillError(err.message);
        } finally {
          setBusy(false);
        }
        return;
      }

      setBusy(true);
      const tableNo = parseInt(activeTableId.substring(1));

      const itemsToSubmit = table.items.map(i => {
        const master = allSellableItems.find(m => String(m._id) === String(i._id) || m.name === i.name);
        const isInv = i.isInventory || master?.isInventory || false;
        return {
          menuItemId: i._id,
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          department: (i.department === 'bar' || master?.department === 'bar' || isInv) ? 'bar' : 'kitchen',
          notes: i.note || ''
        };
      });

      const barItems = itemsToSubmit.filter(i => i.department === 'bar');
      const kitchenItems = itemsToSubmit.filter(i => i.department !== 'bar');

      // Create separate KOTs for Kitchen and Bar to ensure separate KOT numbers
      if (kitchenItems.length > 0) {
        const kitchenPrintJobId = 'pos_print_' + Math.random().toString(36).substring(2, 9);
        try {
          sessionStorage.setItem(kitchenPrintJobId, 'true');
        } catch (e) {
          console.error(e);
        }
        const kot = await createKOT(
          orderId, tableNo, kitchenItems, kitchenPrintJobId, selectedWaiterObj?.name || '', orderType
        );
        setKots(prev => [...prev, kot]);
        printKOTDocument(kot, tableNo);
      }

      if (barItems.length > 0) {
        const barPrintJobId = 'pos_print_' + Math.random().toString(36).substring(2, 9);
        try {
          sessionStorage.setItem(barPrintJobId, 'true');
        } catch (e) {
          console.error(e);
        }
        const kot = await createKOT(
          orderId, tableNo, barItems, barPrintJobId, selectedWaiterObj?.name || '', orderType
        );
        setKots(prev => [...prev, kot]);
        printKOTDocument(kot, tableNo);
      }

      // Clear items for next KOT
      clearTable(activeTableId);

      // Clear pendingItems in DB session
      await syncTableSession(tableNo, [], 0, selectedWaiterObj?.name || '', orderType);

      setBillError('');
      setBusy(false);
      setMobileBillOpen(false); // Close mobile bill panel
    } catch (err) {
      setBillError(err.message);
      setBusy(false);
    }
  };

  // Print final bill
  const printFinalBill = async (paidAmount) => {
    if (busy) return;
    setBusy(true);

    try {
      const orderId = activeOrder || await ensureActiveOrder();
      if (!orderId) {
        setBusy(false);
        return;
      }

      const tableNo = parseInt(activeTableId.substring(1));

      const hasClrItem = combinedItems.all.some(i => i.name && i.name.toUpperCase() === 'CLR');
      if (hasClrItem) {
        try {
          await cancelTableSession(tableNo);
          clearTable(activeTableId);
          setKots([]);
          setActiveOrder(null);
          setSelectedWaiterRaw('');
          setOrderTypeRaw('dine-in');
          setBillError('');
          setMobileBillOpen(false);
          showToast(`Table ${tableNo} cleared`, 'success');
        } catch (err) {
          setBillError(err.message);
        } finally {
          setBusy(false);
        }
        return;
      }

      // Finalize bill (combines all KOTs and leftover items)
      const finalizedOrder = await finalizeBill(
        orderId,
        combinedItems.all,
        subtotal,
        sgst,
        cgst,
        serviceTax,
        discountAmount,
        roundOff,
        grandTotal,
        selectedWaiterObj?.name || '',
        orderType,
        table.customerName || '',
        table.customerPhone || '',
        pm,
        pm === 'cash' ? grandTotal : 0,
        0
      );

      // Print bill
      await printBillDocument(
        tableNo,
        {
          items: combinedItems.all,
          subtotal,
          sgst,
          cgst,
          serviceTax,
          discountAmount,
          roundOff,
          grandTotal
        },
        grandTotal,
        selectedWaiterObj?.name || '',
        finalizedOrder?.billNo,
        selectedWaiterObj,
        pm,
        pm === 'cash' ? grandTotal : 0,
        pm === 'upi' ? grandTotal : 0
      );

      // Auto-send WhatsApp review message — DISABLED
      // if (table.customerPhone && ...) { window.open(...) }

      clearTable(activeTableId);
      setKots([]);
      setActiveOrder(null);
      setSelectedWaiterRaw('');
      setOrderTypeRaw('dine-in');
      setBillError('');
      setMobileBillOpen(false);
    } catch (err) {
      setBillError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doGen = async paid => {
    if (busy) return;
    await printFinalBill(paid);
  };

  // CLR TABLE: Cancel session without saving to order history
  const handleClearTable = async () => {
    if (!activeTableId) return;
    const tableNo = parseInt(activeTableId.substring(1));
    const hasItems = combinedItems.all.length > 0 || kots.length > 0;
    const msg = hasItems
      ? `Clear Table ${tableNo}? This will discard all items and KOTs for this table. Nothing will be saved to order history.`
      : `Clear Table ${tableNo}? The table will be marked as free.`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await cancelTableSession(tableNo);
      clearTable(activeTableId);
      setActiveOrder(null);
      setKots([]);
      setSelectedWaiterRaw('');
      setOrderTypeRaw('dine-in');
      setMobileBillOpen(false);
      showToast(`Table ${tableNo} cleared`, 'success');
    } catch (err) {
      showToast(err.message || 'Failed to clear table', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        selectTable(null);
        return;
      }
      if (e.defaultPrevented) return;
      const targetTag = document.activeElement?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag) && !e.ctrlKey && !e.metaKey) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        printKOT();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (localStorage.getItem('is_cashier_pos') !== 'false') {
          doGen(0);
        }
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        setMenuSearch(prev => prev.slice(0, -1));
        searchInputRef.current?.focus();
        return;
      }
      if (/^[a-zA-Z0-9 ]$/.test(e.key)) {
        e.preventDefault();
        setMenuSearch(prev => prev + e.key);
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [printKOT, doGen, selectTable]);
  if (!activeTableId) {
    const ZONES = [
      { name: 'Bottom Lounge', range: [1, 6], color: 'zone-bottom' },
      { name: 'Top Lounge',    range: [7, 12],  color: 'zone-top' },
      { name: 'Restaurant',    range: [13, 18], color: 'zone-rest' },
      { name: 'VIP',    range: [19, 20], color: 'zone-vip' },
    ];

    return (
      <div className="fi table-picker-container">
        {/* TOP NAVBAR FOR MOBILE/HAMBURGER AND HUMTUM BRANDING */}
        <header className="humtum-bar tp-navbar">
          <div className="humtum-left">
            <button
              className="hnav-menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <div className="hnav-title-group">
              <span className="hnav-title">Dining Layout</span>
            </div>
          </div>
          <div className="hnav-stats">
            <div className="hnav-stat">
              <span className="hnav-stat-dot occ-dot" />
              <div>
                <div className="hnav-stat-num">{occupiedCount}</div>
                <div className="hnav-stat-label">Active</div>
              </div>
            </div>
            <div className="hnav-stat">
              <span className="hnav-stat-dot vac-dot" />
              <div>
                <div className="hnav-stat-num">{NUM_TABLES - occupiedCount}</div>
                <div className="hnav-stat-label">Vacant</div>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable Layout Body */}
        <div className="table-picker-page">
          {/* Desktop-only Header */}
          <div className="tp-desktop-header">
            <div className="tp-header-title-group">
              <h1 className="tp-header-title">Dining Layout</h1>
              <p className="tp-header-subtitle">Select a table to manage orders, bills, and real-time KOTs</p>
            </div>
            <div className="tp-header-stats">
              <div className="tp-stat-item occupied">
                <span className="tp-stat-dot" />
                <span className="tp-stat-val">{occupiedCount}</span>
                <span className="tp-stat-lbl">Active</span>
              </div>
              <div className="tp-stat-item free">
                <span className="tp-stat-dot" />
                <span className="tp-stat-val">{NUM_TABLES - occupiedCount}</span>
                <span className="tp-stat-lbl">Free</span>
              </div>
              <div className="tp-stat-item total">
                <span className="tp-stat-val">{NUM_TABLES}</span>
                <span className="tp-stat-lbl">Total</span>
              </div>
            </div>
          </div>

          {/* Subtitle / Helper info (mobile only) */}
          <div className="tp-picker-info-mobile">
            <p className="tp-header-subtitle" style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--t2)' }}>
              Select a table to manage orders, bills, and real-time KOTs
            </p>
          </div>

          {/* Zone sections — 2×2 block grid */}
          <div className="tp-zones-grid">
            {ZONES.map(zone => {
              const zoneTables = tableList.filter(t => t.num >= zone.range[0] && t.num <= zone.range[1]);
              const zoneActive = zoneTables.filter(t => t.status !== 'free').length;
              const isVip = zone.color === 'zone-vip';
              const isRest = zone.color === 'zone-rest';
              const isFullWidth = isVip || isRest;
              return (
                <div key={zone.name} className={`tp-zone ${zone.color}${isFullWidth ? ' tp-zone-full' : ''}`}>
                  <div className="tp-zone-header">
                    <div className="tp-zone-title-group">
                      <span className="tp-zone-name">{zone.name}</span>
                      <span className="tp-zone-sub">Tables T{zone.range[0]}–T{zone.range[1]}</span>
                    </div>
                    <div className="tp-zone-badge">
                      {zoneActive > 0 && <span className="tp-zone-active-count">{zoneActive} active</span>}
                    </div>
                  </div>
                  <div className={`tp-zone-grid${isVip ? ' tp-zone-grid-vip' : isRest ? ' tp-zone-grid-rest' : ''}`}>
                    {zoneTables.map(t => (
                      <TableTile
                        key={t.id}
                        id={t.id}
                        num={t.num}
                        status={t.status}
                        total={t.total}
                        items={t.items}
                        currency={c}
                        onClick={() => selectTable(t.id)}
                        isVip={isVip}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }



  return (
    <div className="fi billing-layout">
      {/* BILLING NAVBAR */}
      <BillingNavBar
        activeTableId={activeTableId}
        occupiedCount={occupiedCount}
        totalTables={NUM_TABLES}
        onBack={() => selectTable(null)}
        onPrintKOT={() => doGen(1)}
        onPrintBill={() => doGen(0)}
        onOpenLiveQueue={() => setShowLiveKOTModal(true)}
        pendingCount={combinedItems.pending.length}
        allCount={combinedItems.all.length}
        busy={busy}
      />


      <div ref={billingGridRef} className="billing-main-grid" style={{ gridTemplateColumns: isMobile ? '1fr' : `minmax(350px, 1fr) auto ${billPanelWidth}px` }}>
        {/* LEFT: MENU SECTION */}
        <div className="menu-side">
          <div className="filter-bar-sticky">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
              <div className="search-wrap-mini" style={{ margin: 0, flex: 1 }}>
                <Search size={16} className="search-icon" />
                <input
                  value={menuSearch}
                  onChange={e => setMenuSearch(e.target.value)}
                  placeholder="Search menu..."
                  ref={searchInputRef}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredMenu.length > 0) {
                        const firstAvailableItem = filteredMenu.find(item => item.available !== false);
                        if (firstAvailableItem) {
                          updateTableItem(activeTableId, firstAvailableItem._id, 'increase');
                          setMenuSearch('');
                        }
                      }
                    }
                  }}
                />
                {menuSearch && (
                  <button className="search-clear-btn" onClick={() => { setMenuSearch(''); searchInputRef.current?.focus(); }} title="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="cat-scroll-mini">
              {categories.map(cat => (
                <button key={cat} className={`cat-pill${categoryFilter === cat ? ' on' : ''}`} onClick={() => setCategoryFilter(cat)}>{cat}</button>
              ))}
            </div>
          </div>

          <div className="items-grid-modern">
            {filteredMenu.map(item => {
              const stockItem = inventory?.find(inv => inv.name.toLowerCase().trim() === item.name.toLowerCase().trim());
              return (
                <MenuItem key={item._id} item={item} qty={table.items.find(i => String(i._id) === String(item._id))?.quantity || 0}
                  stock={stockItem?.trackStock === false ? undefined : stockItem?.stock}
                  minStock={stockItem?.minStock}
                  add={(id, a) => updateTableItem(activeTableId, id, a)}
                  rem={(id, a) => updateTableItem(activeTableId, id, a)} />
              );
            })}
          </div>
        </div>

        {/* RESIZE HANDLE */}
        {!isMobile && (
          <div 
            className={`resize-handle ${isResizing ? 'resizing' : ''}`} 
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
          />
        )}

        {/* RIGHT: BILL PANEL */}
        <div className={`bill-panel-res ${mobileBillOpen ? 'open' : 'closed'}`}>
          <div className="mobile-handle" onClick={() => setMobileBillOpen(!mobileBillOpen)}>
            <div className="h-indicator" />
            {isMobile && (
              <div className="mobile-handle-summary">
                <span className="summary-items">🛒 {combinedItems.all.reduce((s, i) => s + i.quantity, 0)} Items</span>
                <span className="summary-total">Total: {c}{grandTotal.toFixed(0)}</span>
              </div>
            )}
          </div>

          <div className="bill-scroll-content">
            <div className="bill-header-row">
              <span>Table {activeTableId ? activeTableId.substring(1) : ''}</span>
              {activeTableId && <button onClick={() => clearTable(activeTableId)} className="trash-btn"><Trash2 size={14} /></button>}
            </div>

            <div className="order-meta-row">
              <div className="order-type-group">
                {['dine-in', 'takeaway', 'delivery'].map(type => (
                  <button
                    key={type}
                    className={`type-pill${orderType === type ? ' active' : ''}`}
                    onClick={() => setOrderType(type)}
                    type="button"
                  >
                    {type.replace('-', ' ').toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="waiter-select-wrap">
                <div className="order-meta-label">Waiter</div>
                <select className="mini-input mini-select" value={selectedWaiter} onChange={e => setSelectedWaiter(e.target.value)}>
                  <option value="" disabled>Select waiter</option>
                  {waiterOptions.map(w => (
                    <option key={w._id} value={w._id}>{w.name || w.userId?.name || w.role || 'Staff'}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="section-divider" />
            <input className="mini-input customer-input" value={table.customerName || ''} onChange={e => setTableField(activeTableId, 'customerName', e.target.value)} placeholder="Customer Name" />
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
              <input 
                className="mini-input customer-input" 
                type={role === 'admin' ? 'text' : 'password'} 
                value={table.customerPhone || ''} 
                onChange={e => setTableField(activeTableId, 'customerPhone', e.target.value)} 
                placeholder="Mobile No" 
                maxLength={10} 
                title={role !== 'admin' ? 'Customer mobile number is hidden for privacy' : 'Mobile No'}
                style={{ flex: 1, marginBottom: 0 }}
              />

              {table.customerPhone && table.customerPhone.replace(/\D/g, '').length === 10 && customerHistoryMap[activeTableId] && (
                <div style={{ display: 'flex', alignItems: 'center', height: '24px', flexShrink: 0 }}>
                  {(customerHistoryMap[activeTableId]?.totalOrders || 0) > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowHistory(!showHistory)}
                      style={{
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.35)',
                        borderRadius: '6px',
                        color: '#f59e0b',
                        padding: '0 8px',
                        fontSize: '10.5px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        height: '24px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <span>Old Customer ({customerHistoryMap[activeTableId].totalOrders} Visits)</span>
                      <span style={{ fontSize: '9px' }}>{showHistory ? '▲' : '▼'}</span>
                    </button>
                  ) : (
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.12)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        borderRadius: '6px',
                        color: '#10b981',
                        padding: '0 8px',
                        fontSize: '10.5px',
                        fontWeight: '700',
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: '24px',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      New Customer
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Expanded CRM Customer History Div (Full Width of Billing Area) */}
            {showHistory && table.customerPhone && table.customerPhone.replace(/\D/g, '').length === 10 && (customerHistoryMap[activeTableId]?.totalOrders || 0) > 0 && (
              <div style={{
                width: '100%',
                background: 'var(--bg3)',
                border: '1px solid var(--b2)',
                borderRadius: '8px',
                padding: '8px 10px',
                marginTop: '2px',
                marginBottom: '8px',
                boxSizing: 'border-box'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: 'var(--t1)',
                  marginBottom: '6px',
                  paddingBottom: '4px',
                  borderBottom: '1px dashed var(--b2)'
                }}>
                  <span style={{ color: '#f59e0b' }}>
                    Old Customer ({customerHistoryMap[activeTableId].totalOrders} Visits History)
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    style={{
                      background: 'var(--b2)',
                      border: 'none',
                      borderRadius: '4px',
                      color: 'var(--t1)',
                      padding: '2px 8px',
                      fontSize: '10px',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    Close ▲
                  </button>
                </div>

                <div style={{
                  maxHeight: '130px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}>
                  {customerHistoryMap[activeTableId]?.orders?.map((ord, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '11px',
                      color: 'var(--t1)',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      background: 'var(--bg2)',
                      fontWeight: '700'
                    }}>
                      <span>{new Date(ord.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span style={{ fontWeight: '700', color: 'var(--t1)' }}>
                        {ord.billNo ? `Bill: ${ord.billNo}` : 'Visit'} {ord.total ? `(₹${ord.total})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="food-items-label">Food Items</div>
            <div className="bill-items-scroller">
              {/* Unified flat item list — all selected items stay visible */}
              {combinedItems.all.length === 0 && (
                <div style={{ color: 'var(--t2)', fontSize: 12, textAlign: 'center', paddingTop: 12 }}>No items added yet</div>
              )}

              {/* Sent (KOT-printed) items — shown first with custom remove/reduce control */}
              {combinedItems.sent.map((item, idx) => (
                <div key={item._id || idx} className="b-item-entry">
                  <div className="b-item-row">
                    <span className="b-item-name" style={{ color: 'var(--t1)' }}>{item.name} <span style={{ fontSize: 9, color: 'var(--t3)' }}>(Sent)</span></span>
                    <div className="b-item-ctrl">
                      <button
                        type="button"
                        onClick={() => {
                          if (busy) return;
                          const activeOrderId = activeOrder?._id || activeOrder;
                          if (!activeOrderId) return;
                          
                          showConfirm(
                            `Are you sure you want to remove 1x "${item.name}" from KOT? This will refund inventory stock.`,
                            async () => {
                              setBusy(true);
                              try {
                                await removeKOTItem(activeOrderId, item.name, 1);
                                showToast(`Removed 1x "${item.name}" successfully`, 'success');
                                await loadTableSession(); // Refresh table state
                              } catch (err) {
                                showToast(err.message || 'Failed to remove item', 'error');
                              } finally {
                                setBusy(false);
                              }
                            },
                            true, // isDanger
                            'Remove Item',
                            'Remove KOT Item'
                          );
                        }}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.2)', cursor: 'pointer', borderRadius: '4px', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0', fontSize: '14px', fontWeight: 'bold' }}
                        title="Remove 1x from KOT (refunds stock)"
                      >
                        −
                      </button>
                      <span style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--t0)' }}>{item.quantity}</span>
                    </div>
                    <span className="b-item-price">{c}{(item.price * item.quantity).toFixed(0)}</span>
                  </div>
                </div>
              ))}

              {/* Pending items — editable with +/− */}
              {combinedItems.pending.map(item => (
                <div key={item._id} className="b-item-entry">
                  <div className="b-item-row">
                    <span className="b-item-name">{item.name}</span>
                    <div className="b-item-ctrl">
                      <button onClick={() => updateTableItem(activeTableId, item._id, 'decrease')}>−</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateTableItem(activeTableId, item._id, 'increase')}>+</button>
                    </div>
                    <span className="b-item-price">{c}{(item.price * item.quantity).toFixed(0)}</span>
                  </div>
                  <textarea
                    className="item-note"
                    placeholder="Note..."
                    value={item.note || ''}
                    onChange={e => setItemNote(activeTableId, item._id, e.target.value)}
                    rows={1}
                  />
                </div>
              ))}
            </div>

            <div className="section-divider" />
            <div className="bill-footer">
              <div className="bill-summary-card">
                <div className="s-row"><span>Subtotal</span><span>{c}{subtotal.toFixed(0)}</span></div>
                {cgst > 0 && <div className="s-row"><span>CGST ({settings.cgstRate || 0}%)</span><span>{c}{cgst.toFixed(2)}</span></div>}
                {sgst > 0 && <div className="s-row"><span>SGST ({settings.sgstRate || 0}%)</span><span>{c}{sgst.toFixed(2)}</span></div>}
                {serviceTax > 0 && <div className="s-row"><span>Service Tax ({settings.serviceTaxRate || 0}%)</span><span>{c}{serviceTax.toFixed(2)}</span></div>}
                {roundOff !== 0 && (
                  <div className="s-row" style={{ color: 'var(--t3)', fontSize: '12px', fontStyle: 'italic' }}>
                    <span>Round Off</span>
                    <span>{roundOff > 0 ? '+' : ''}{roundOff.toFixed(2)}</span>
                  </div>
                )}
                <div className="s-row">
                  <span>Discount (%)</span>
                  <input
                    className="mini-input"
                    style={{ width: 60, textAlign: 'right' }}
                    value={table.discount || ''}
                    onChange={e => setTableField(activeTableId, 'discount', e.target.value.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                  />
                </div>
                <div className="s-row total-big"><span>Total</span><span>{c}{grandTotal.toFixed(0)}</span></div>
              </div>



              {billError && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '7px 11px', fontSize: 11, color: '#EF4444', marginBottom: 6 }}>
                  ⚠️ {billError}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <button
                  className="btn btn-ghost btn-lg"
                  style={{ flex: 1 }}
                  onClick={printKOT}
                  disabled={combinedItems.pending.length === 0 || busy}
                >
                  <Printer size={14} /> Print KOT
                </button>
                {localStorage.getItem('is_cashier_pos') !== 'false' && (
                  <button
                    className="btn btn-primary btn-lg"
                    style={{ flex: 1 }}
                    onClick={() => doGen(0)}
                    disabled={combinedItems.all.length === 0 || busy}
                  >
                    {busy ? 'Processing…' : 'Print Bill'}
                  </button>
                )}
              </div>
              {/* CLR TABLE: clear table without saving to history */}
              <button
                className="btn btn-danger btn-lg"
                style={{ width: '100%', marginBottom: 4, opacity: 0.85, letterSpacing: 1 }}
                onClick={handleClearTable}
                disabled={busy}
                title="Clear this table (no bill saved to history)"
              >
                CLR TABLE
              </button>
            </div>

            {/* KOT History */}
            {kots.length > 0 && (
              <div className="kot-history">
                <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 4, color: 'var(--t1)' }}>
                  KOT History ({kots.length})
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {kots.map((k, i) => (
                    <button
                      key={i} 
                      type="button"
                      onClick={() => setSelectedKotDetails(k)}
                      style={{ 
                        fontSize: 11, 
                        background: 'var(--s1)', 
                        border: '1px solid var(--b1)', 
                        padding: '4px 10px', 
                        borderRadius: 6, 
                        color: 'var(--t0)', 
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Click to view KOT details"
                    >
                      <span>{k.kotNo || `KOT-${k._id?.slice(-4) || (i + 1)}`} · {new Date(k.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {confirmDialog && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
          }}>
            <div style={{
              background: 'var(--s1)',
              border: '1px solid var(--b1)',
              borderRadius: 'var(--r)',
              padding: '24px',
              maxWidth: '420px',
              width: '100%',
              boxShadow: 'var(--sh)',
              color: 'var(--t0)'
            }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
                {confirmDialog.title || 'Confirm Action'}
              </h3>
              <p style={{ color: 'var(--t1)', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
                {confirmDialog.message}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDialog.onCancel) confirmDialog.onCancel();
                    setConfirmDialog(null);
                  }}
                  className="btn btn-ghost"
                  style={{ padding: '8px 16px', fontSize: '13px', minHeight: 'unset' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirmDialog.onConfirm) confirmDialog.onConfirm();
                    setConfirmDialog(null);
                  }}
                  className={`btn ${confirmDialog.danger ? 'btn-danger' : 'btn-primary'}`}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    minHeight: 'unset',
                    ...(confirmDialog.danger ? { background: '#EF4444', borderColor: '#EF4444', color: '#fff' } : {})
                  }}
                >
                  {confirmDialog.confirmText || 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}
        {/* KOT Details Popup */}
        {selectedKotDetails && (
          <KOTDetailsModal
            kot={selectedKotDetails}
            currency={c}
            canDelete={role === 'admin' || role === 'manager'}
            onClose={() => setSelectedKotDetails(null)}
            onDelete={(k) => {
              if (busy) return;
              showConfirm(
                `⚠️ WARNING: Are you sure you want to DELETE entire "${k.kotNo || 'KOT'}"? All items in this KOT will be deleted and their stock will be refunded.`,
                async () => {
                  setBusy(true);
                  try {
                    await deleteKOT(k._id, k.tableNo);
                    showToast(`Deleted ${k.kotNo || 'KOT'} and refunded stock successfully`, 'success');
                    await ensureActiveOrder(`t${k.tableNo}`, false);
                    await loadData(); // Refresh table state
                  } catch (err) {
                    showToast(err.message || 'Failed to delete KOT', 'error');
                  } finally {
                    setBusy(false);
                  }
                },
                true, // isDanger
                'Delete KOT',
                'Delete KOT'
              );
            }}
          />
        )}
        {/* Live KOT Display Modal */}
        {showLiveKOTModal && (
          <LiveKOTModal
            onClose={() => setShowLiveKOTModal(false)}
          />
        )}
      </div>
    </div>
  );
}
