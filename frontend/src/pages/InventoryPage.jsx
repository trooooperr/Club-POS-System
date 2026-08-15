import React, { useState, useEffect } from 'react';
import { Plus, X, ChevronDown, ChevronUp, Search, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { apiUrl, authFetch } from '../lib/api';
import TopNavBar from '../components/TopNavBar';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

const UNITS = ['Bottles', 'Cans', 'Litre', 'ml', 'Kg', 'Gram', 'Pieces'];

/* STATUS */
const getStatus = (i) => {
  if (i.trackStock === false) return { text: 'Unlimited', cls: 'b-green' };
  if (i.stock === 0) return { text: 'Out of Stock', cls: 'b-red' };
  if (i.stock <= i.minStock) return { text: 'Low Stock', cls: 'b-amber' };
  return { text: 'In Stock', cls: 'b-green' };
};

/* MODAL */

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
    <div className="date-field">
      <span className="date-field-label">{label}</span>
      <input
        type="date"
        value={value}
        onChange={onChange}
        className="date-picker-clean unified-date-input"
        ref={inputRef}
      />
      <button
        type="button"
        className="calendar-trigger"
        aria-label={`Open ${label} date picker`}
        onClick={triggerPicker}
      >
        <CalendarDownIcon />
      </button>
    </div>
  );
}

function CalendarDownIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8h18" /><path d="M21 6v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6" /><path d="M16 2v4M8 2v4" /></svg>;
}


function StockModal({ item, onClose, onSave }) {
  const { settings, inventory } = useApp();
  const categories = Array.isArray(settings.inventoryCategories) && settings.inventoryCategories.length > 0
    ? settings.inventoryCategories
    : ['General'];
  const [form, setForm] = useState(() => {
    if (item) {
      return { 
        ...item, 
        isAlcoholic: !!(item.isAlcoholic || item.isAlcohol), 
        trackStock: item.trackStock !== false,
        linkInventoryId: item.linkInventoryId?._id || item.linkInventoryId || '',
        stockDeductionQty: item.stockDeductionQty || 1,
        imageUrl: item.imageUrl || '',
      };
    }
    return {
      name: '', category: categories[0] || 'General', unit: 'Bottles', stock: 0, minStock: 5, price: '', shortcut: '', isAlcoholic: false, trackStock: true, linkInventoryId: '', stockDeductionQty: 1, imageUrl: ''
    };
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // If categories change and no category selected, set default
  useEffect(() => {
    if (!form.category && categories.length > 0) {
      setForm(f => ({ ...f, category: categories[0] || 'General' }));
    }
  }, [categories]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const selectableInventory = (inventory || []).filter(inv => inv.trackStock !== false && inv._id !== item?._id);

  // Sync stock from linked parent when parent changes
  useEffect(() => {
    if (form.linkInventoryId) {
      const parent = inventory.find(inv => inv._id === form.linkInventoryId);
      if (parent) {
        set('stock', parent.stock);
      }
    }
  }, [form.linkInventoryId, inventory]);

  const handleSave = async () => {
    if (saving) return;
    if (!form.name || !form.category || !form.unit) {
      setError('Name, category, and unit are required.');
      return;
    }

    let linkInventoryId = null;
    let stockDeductionQty = 1;

    if (form.trackStock) {
      if (form.linkInventoryId) {
        linkInventoryId = form.linkInventoryId;
      }
      const parsedVal = form.stockDeductionQty;
      let finalQty = 1;
      
      if (parsedVal !== undefined && parsedVal !== null && String(parsedVal).trim() !== '') {
        if (typeof parsedVal === 'number') {
          finalQty = parsedVal;
        } else {
          const str = String(parsedVal).trim();
          if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 2) {
              const num = parseFloat(parts[0]);
              const den = parseFloat(parts[1]);
              if (isNaN(num) || isNaN(den) || den === 0) {
                setError('Invalid fraction format (e.g. 30/750).');
                return;
              }
              finalQty = num / den;
            } else {
              setError('Invalid deduction quantity.');
              return;
            }
          } else {
            finalQty = parseFloat(str);
            if (isNaN(finalQty)) {
              setError('Deduction quantity must be a valid number.');
              return;
            }
          }
        }
      } else {
        finalQty = 1;
      }
      
      if (finalQty <= 0) {
        setError('Deduction quantity must be greater than 0.');
        return;
      }
      stockDeductionQty = finalQty;
    }


    const data = {
      ...form,
      stock: form.trackStock ? (Number(form.stock) || 0) : 0,
      minStock: form.trackStock ? (Number(form.minStock) || 0) : 0,
      price: Number(form.price) || 0,
      shortcut: (form.shortcut || '').toLowerCase().trim(),
      imageUrl: form.imageUrl || '',
      isAlcoholic: !!form.isAlcoholic,
      trackStock: !!form.trackStock,
      linkInventoryId,
      stockDeductionQty
    };
    setError(null);
    setSaving(true);
    try {
      await onSave(data, setError, onClose);
    } catch (err) {
      setError(err.message || 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="moverlay">
      <div className="mbox">
        <div className="mhead">
          {item ? 'Edit Item' : 'Add Item'}
          <button className="iBtn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="fgroup">
          <label className="lbl">Item Name</label>
          <input value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div className="fgroup" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
          <input 
            type="checkbox" 
            id="trackStock"
            checked={!!form.trackStock} 
            onChange={e => set('trackStock', e.target.checked)} 
            style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
          />
          <label htmlFor="trackStock" style={{ margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>Track Stock Level</label>
        </div>

        {form.trackStock && (
          <div style={{ background: 'rgba(255,255,255,0.015)', padding: '10px', borderRadius: '8px', border: '1px solid var(--b1)', marginBottom: '12px' }}>
            <div className="frow2">
              <div className="fgroup">
                <label className="lbl">Stock</label>
                <input type="number" value={form.stock} onChange={e => set('stock', e.target.value)} disabled={!!form.linkInventoryId} readOnly={!!form.linkInventoryId} />
              </div>
              <div className="fgroup">
                <label className="lbl">Min Stock</label>
                <input type="number" value={form.minStock} onChange={e => set('minStock', e.target.value)} />
              </div>
            </div>

            <div className="frow2" style={{ marginTop: '10px', gap: '12px' }}>
              <div className="fgroup" style={{ flex: 1 }}>
                <label className="lbl">Link Parent (Optional)</label>
                <select 
                  value={form.linkInventoryId} 
                  onChange={e => set('linkInventoryId', e.target.value)}
                  style={{ width: '100%', padding: '6px 10px', background: 'var(--s2)', color: 'var(--t0)' }}
                >
                  <option value="">-- No Link (Tracks itself) --</option>
                  {selectableInventory.map(inv => (
                    <option key={inv._id} value={inv._id}>
                      {inv.name} ({inv.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="fgroup" style={{ flex: 1 }}>
                <label className="lbl">Deduction Qty (default 1)</label>
                <input 
                  type="text" 
                  value={form.stockDeductionQty} 
                  onChange={e => set('stockDeductionQty', e.target.value)}
                  placeholder="e.g. 1, 5, or 30/750"
                  style={{ padding: '6px 10px' }}
                />
              </div>
            </div>
          </div>
        )}

        <div className="frow2">
          <div className="fgroup">
            <label className="lbl">Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>

          <div className="fgroup">
            <label className="lbl">Unit</label>
            <select value={form.unit} onChange={e => set('unit', e.target.value)}>
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div className="fgroup">
          <label className="lbl">Price</label>
          <input type="number" value={form.price} onChange={e => set('price', e.target.value)} />
        </div>

        <div className="fgroup" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 12 }}>
          <input 
            type="checkbox" 
            id="isAlcoholic"
            checked={!!form.isAlcoholic} 
            onChange={e => set('isAlcoholic', e.target.checked)} 
            style={{ width: 'auto', margin: 0, cursor: 'pointer' }}
          />
          <label htmlFor="isAlcoholic" style={{ margin: 0, cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>Alcoholic Item</label>
        </div>

        <div className="fgroup">
          <label className="lbl">Shortcut</label>
          <input value={form.shortcut || ''} onChange={e => set('shortcut', e.target.value.toLowerCase().trim())}
            placeholder="e.g. cp, pn, ff" maxLength={10} />
          <span className="modal-hint" style={{ fontSize: 10, color: 'var(--t2)', marginTop: 4, display: 'block' }}>Short code to quickly add this item</span>
        </div>

        <div className="fgroup">
          <label className="lbl">Image URL</label>
          <input value={form.imageUrl || ''} onChange={e => set('imageUrl', e.target.value)}
            placeholder="https://images.unsplash.com/photo..." />
        </div>

        {error && <div style={{ color: 'red', marginBottom: 8, marginTop: 8 }}>{error}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn btn-ghost" disabled={saving} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : item ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* MAIN */
export default function InventoryPage() {
  const { settings, role, can, inventory, setInventory, deleteInventoryItem, reorderInventoryItems, isDryDay, toggleDryDay } = useApp();
  const isAdmin = role === 'admin' || role === 'manager';
  const categories = Array.isArray(settings.inventoryCategories) && settings.inventoryCategories.length > 0
    ? settings.inventoryCategories
    : ['General'];
  const getTodayLocalDate = () => {
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

  const [modal, setModal] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState(getTodayLocalDate);
  const [endDate, setEndDate] = useState(getTodayLocalDate);
  const startInputRef = React.useRef(null);
  const endInputRef = React.useRef(null);
  const [cat, setCat] = useState('All');
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Daily Stock Report States
  const [activeTab, setActiveTab] = useState('stock'); // 'stock' | 'report'
  const [reportData, setReportData] = useState([]);
  const [reportSearch, setReportSearch] = useState('');
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportCat, setReportCat] = useState('All');

  useEffect(() => {
    if (categories.length > 0 && cat !== 'All' && !categories.includes(cat)) {
      setCat('All');
    }
  }, [categories, cat]);

  useEffect(() => {
    if (activeTab !== 'report') return;
    let active = true;
    (async () => {
      setLoadingReport(true);
      try {
        const res = await authFetch(apiUrl(`/api/inventory/daily-report?startDate=${startDate}&endDate=${endDate}`));
        if (!res.ok) throw new Error('Failed to fetch daily report');
        const data = await res.json();
        if (active) {
          setReportData(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (active) setLoadingReport(false);
      }
    })();
    return () => { active = false; };
  }, [activeTab, startDate, endDate]);

  const clearFilters = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
  };

  const adjust = async (id, val) => {
    // Optimistic local state update
    const previousInventory = inventory;
    setInventory(prev => prev.map(i =>
      i._id === id ? { ...i, stock: Math.max(0, i.stock + val) } : i
    ));

    try {
      const res = await authFetch(apiUrl(`/api/inventory/${id}/stock`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantityChange: val })
      });
      if (!res.ok) throw new Error('Failed to update stock');

      const updated = await res.json();
      // Sync with final server state
      setInventory(prev => prev.map(i => i._id === id ? updated : i));
      if (window.updateMenuContext) window.updateMenuContext();
    } catch (err) {
      setInventory(previousInventory); // Rollback
      console.error('Stock update error', err);
    }
  };

  const toggleAvailability = async (id, currentVal) => {
    const previousInventory = inventory;
    const newVal = !currentVal;
    setInventory(prev => prev.map(i => i._id === id ? { ...i, isAvailable: newVal } : i));
    try {
      const res = await authFetch(apiUrl(`/api/inventory/${id}/availability`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAvailable: newVal })
      });
      if (!res.ok) throw new Error('Failed to update availability');
      const updated = await res.json();
      setInventory(prev => prev.map(i => i._id === id ? updated : i));
      if (window.updateMenuContext) window.updateMenuContext();
    } catch (err) {
      setInventory(previousInventory);
      console.error('Availability update error', err);
    }
  };

  const handleSave = async (data, setModalError, closeModal) => {
    const previousInventory = inventory;

    // Minimal optimistic local update for edits
    if (data._id) {
      setInventory(prev => prev.map(i => i._id === data._id ? { ...i, ...data } : i));
    }

    if (closeModal) closeModal(); // Close UI immediately

    try {
      let res;
      if (data._id) {
        res = await authFetch(apiUrl(`/api/inventory/${data._id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } else {
        res = await authFetch(apiUrl('/api/inventory'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      }

      if (!res.ok) {
        setInventory(previousInventory); // Rollback
        let errMsg = 'Failed to save';
        try {
          const text = await res.text();
          errMsg = JSON.parse(text).message || errMsg;
        } catch { }
        alert(errMsg);
        return;
      }

      const saved = await res.json();
      // Apply the final saved object
      setInventory(prev => {
        if (data._id) return prev.map(i => i._id === data._id ? saved : i);
        return [...prev, saved];
      });

      if (window.updateMenuContext) window.updateMenuContext();
    } catch (err) {
      setInventory(previousInventory);
      console.error('Save error', err);
      alert('Save failed: ' + err.message);
    }
  }

  const filtered = inventory.filter(i => {
    const nameMatch = i.name && i.name.toLowerCase().includes(search.toLowerCase());
    const catMatch = cat === 'All' || i.category === cat;
    return nameMatch && catMatch;
  });

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.index === destination.index) return;

    const itemsOfCategory = Array.from(filtered);
    const [removed] = itemsOfCategory.splice(source.index, 1);
    itemsOfCategory.splice(destination.index, 0, removed);

    const orderedIds = itemsOfCategory.map(item => item._id);
    reorderInventoryItems(orderedIds);
  };

  const handleShiftItem = async (index, direction) => {
    if (direction === 'up' && index > 0) {
      const newItems = [...filtered];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      const orderedIds = newItems.map(item => item._id);
      reorderInventoryItems(orderedIds);
    } else if (direction === 'down' && index < filtered.length - 1) {
      const newItems = [...filtered];
      [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
      const orderedIds = newItems.map(item => item._id);
      reorderInventoryItems(orderedIds);
    }
  };

  const filteredReport = reportData.filter(i => {
    const nameMatch = i.itemName && i.itemName.toLowerCase().includes(reportSearch.toLowerCase());
    const catMatch = reportCat === 'All' || i.category === reportCat;
    return nameMatch && catMatch;
  });

  return (
    <div className="fi inventory-page">
      {/* TABS */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: '16px', gap: '8px', paddingBottom: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`tab-btn ${activeTab === 'stock' ? 'active' : ''}`}
            onClick={() => setActiveTab('stock')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'stock' ? 'var(--gradient-accent)' : 'var(--s2)',
              border: activeTab === 'stock' ? 'none' : '1px solid var(--b1)',
              borderRadius: '8px',
              color: activeTab === 'stock' ? '#000000' : 'var(--t1)',
              fontWeight: '800',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'stock' ? 'var(--sh-glowing)' : 'none',
              transition: 'all 0.25s var(--ease)'
            }}
          >
            Current Stock
          </button>
          <button
            className={`tab-btn ${activeTab === 'report' ? 'active' : ''}`}
            onClick={() => setActiveTab('report')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'report' ? 'var(--gradient-accent)' : 'var(--s2)',
              border: activeTab === 'report' ? 'none' : '1px solid var(--b1)',
              borderRadius: '8px',
              color: activeTab === 'report' ? '#000000' : 'var(--t1)',
              fontWeight: '800',
              cursor: 'pointer',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: activeTab === 'report' ? 'var(--sh-glowing)' : 'none',
              transition: 'all 0.25s var(--ease)'
            }}
          >
            Daily Stock Report
          </button>
        </div>

        {/* DRY DAY TOGGLE BUTTON */}
        <button
          className={`dry-day-btn ${isDryDay ? 'active' : ''}`}
          onClick={() => {
            if (isAdmin) {
              toggleDryDay();
            } else {
              alert('Only Admin/Manager can toggle Dry Day mode.');
            }
          }}
          title={isDryDay ? 'Dry Day is ACTIVE (Alcohol items disabled)' : 'Click to activate Dry Day (Disable all alcohol items)'}
          style={{ cursor: isAdmin ? 'pointer' : 'not-allowed', margin: 0 }}
        >
          {isDryDay ? '🚫 DRY DAY: ON' : '🍺 Dry Day: OFF'}
        </button>
      </div>

      {activeTab === 'stock' ? (
        <>
          {/* FILTER BAR - unified with OrdersPage */}
          <div className="orders-filters-row">
            <div style={{ display: 'flex', flex: 1, gap: 8 }}>
              <div className="search-wrapper-unified" style={{ flex: 1 }}>
                <Search size={16} className="search-icon" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search items..."
                  className="search-input-unified"
                />
                {search && (
                  <button className="search-clear-btn" onClick={() => setSearch('')} title="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="select-wrapper-unified hide-on-desktop" style={{ width: '110px', flexShrink: 0 }}>
                <select value={cat} onChange={e => setCat(e.target.value)} style={{ paddingLeft: '14px' }}>
                  <option value="All">All</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {isAdmin && (
              <button
                className="btn btn-primary search-add-btn mobile-fab-btn"
                onClick={() => setModal('add')}
              >
                <Plus size={14} className="add-icon" />
                <span>Add</span>
              </button>
            )}
          </div>

          {/* CATEGORY */}
          <div className="chipsWrap hide-on-mobile">
            <button
              className={`chip ${cat === 'All' ? 'on' : ''}`}
              onClick={() => setCat('All')}
            >
              All
            </button>
            {categories.map(c => (
              <button
                key={c}
                className={`chip ${cat === c ? 'on' : ''}`}
                onClick={() => setCat(c)}
              >
                {c}
              </button>
            ))}
          </div>

          {/* MOBILE */}
          <div className="mobileView">
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="inventory-mobile-list">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps}>
                    {filtered.map((i, index) => {
                      const effectiveStock = (() => {
                        if (i.linkInventoryId) {
                          const parentId = typeof i.linkInventoryId === 'object' ? i.linkInventoryId._id : i.linkInventoryId;
                          const parent = inventory.find(p => p._id === parentId);
                          return parent ? { ...i, stock: parent.stock } : i;
                        }
                        return i;
                      })();
                      const s = getStatus(effectiveStock);
                      const open = expanded === i._id;

                      return (
                        <Draggable key={i._id} draggableId={i._id} index={index} isDragDisabled={!isAdmin || !!search}>
                          {(provided) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className="invCard"
                              style={{
                                ...provided.draggableProps.style,
                                cursor: (!isAdmin || !!search) ? 'default' : 'grab'
                              }}
                            >
                              <div className="invTop">
                                <div>
                                   <div className="invName">{i.name}</div>
                                   {i.linkInventoryId && (
                                     <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                       <span>📦 Links to: {
                                         typeof i.linkInventoryId === 'object' 
                                           ? i.linkInventoryId.name 
                                           : (inventory?.find(inv => inv._id === i.linkInventoryId)?.name || 'Loading...')
                                       } ({
                                         Number(i.stockDeductionQty) < 1 
                                           ? Number(i.stockDeductionQty).toFixed(3).replace(/\.?0+$/, '') 
                                           : i.stockDeductionQty
                                       })</span>
                                     </div>
                                   )}
                                   {i.shortcut && <div className="invShortcutRow">Shortcut: <span className="invShortcut">{i.shortcut}</span></div>}
                                  <div className="invMeta">{i.category} • ₹{i.price}</div>
                                  <div style={{ marginTop: 4 }}>
                                    <span className={`badge ${i.isAlcoholic || i.isAlcohol ? 'b-red' : 'b-green'}`} style={{ fontSize: 10 }}>
                                      {i.isAlcoholic || i.isAlcohol ? 'Alcoholic' : 'Non-Alcoholic'}
                                    </span>
                                  </div>
                                </div>

                                 <div className="invRight">
                                   <div className="invStock">{i.trackStock === false ? '—' : (() => {
                                     if (i.linkInventoryId) {
                                       const parentId = typeof i.linkInventoryId === 'object' ? i.linkInventoryId._id : i.linkInventoryId;
                                       const parent = inventory.find(p => p._id === parentId);
                                       const parentStock = parent ? parent.stock : i.stock;
                                       return Number(parentStock).toFixed(2).replace(/\.0+$/, '');
                                     }
                                     return Number(i.stock).toFixed(2).replace(/\.0+$/, '');
                                   })()}</div>
                                  <span className={`badge ${s.cls}`}>{s.text}</span>
                                </div>
                              </div>

                              {isAdmin ? (
                                <div className="invActions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <label className="switch" style={{ margin: 0, transform: 'scale(0.85)' }} title={i.isAvailable === false ? 'Out of Stock (Unavailable)' : 'Available'}>
                                    <input
                                      type="checkbox"
                                      checked={i.isAvailable !== false}
                                      onChange={() => toggleAvailability(i._id, i.isAvailable !== false)}
                                    />
                                    <span className="slider round"></span>
                                  </label>
                                  <button className="btn btn-blue btn-sm" onClick={() => setModal(i)}>Edit</button>
                                  <button className="btn btn-icon-sm btn-danger" onClick={() => setConfirmDelete(i._id)} title="Delete item"><Trash2 size={14} /></button>
                                </div>
                              ) : (
                                <div className="invActions view-only-label" style={{ padding: '4px 0', fontSize: 11, color: 'var(--t3)', fontStyle: 'italic' }}>
                                  Read-only Access
                                </div>
                              )}

                              <div className="expand hide-mobile" onClick={() => setExpanded(open ? null : i._id)}>
                                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              </div>

                              {open && (
                                <div className="invDetails">
                                  <span>Min: {i.trackStock === false ? '—' : i.minStock}</span>
                                  <span>₹{i.price}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>

          {/* DESKTOP */}
          <div className="desktopView">
            <div className="card-table-wrapper">
              <table className="dtable">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Shortcut</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Classification</th>
                    <th>Status</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>

                <DragDropContext onDragEnd={onDragEnd}>
                  <Droppable droppableId="inventory-desktop-list">
                    {(provided) => (
                      <tbody ref={provided.innerRef} {...provided.droppableProps}>
                        {filtered.map((i, index) => {
                          const effectiveStock = (() => {
                            if (i.linkInventoryId) {
                              const parentId = typeof i.linkInventoryId === 'object' ? i.linkInventoryId._id : i.linkInventoryId;
                              const parent = inventory.find(p => p._id === parentId);
                              return parent ? parent.stock : i.stock;
                            }
                            return i.stock;
                          })();
                          const s = getStatus({ ...i, stock: effectiveStock });
                          return (
                            <Draggable key={i._id} draggableId={i._id} index={index} isDragDisabled={!isAdmin || !!search}>
                              {(provided) => (
                                <tr
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  style={{
                                    ...provided.draggableProps.style,
                                    cursor: (!isAdmin || !!search) ? 'default' : 'grab'
                                  }}
                                >
                                  <td>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                      <span>{i.name}</span>
                                      {i.linkInventoryId && (
                                        <span style={{ fontSize: '10px', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px', fontWeight: 'normal' }}>
                                          <span>Deductions parent:</span>
                                          <span style={{ color: 'var(--accent)', fontWeight: 'bold' }}>
                                            {typeof i.linkInventoryId === 'object' 
                                              ? i.linkInventoryId.name 
                                              : (inventory?.find(inv => inv._id === i.linkInventoryId)?.name || 'Loading...')}
                                          </span>
                                          <span>({
                                            Number(i.stockDeductionQty) < 1 
                                              ? Number(i.stockDeductionQty).toFixed(3).replace(/\.?0+$/, '') 
                                              : i.stockDeductionQty
                                          })</span>
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td>{i.shortcut ? <span className="invShortcut">{i.shortcut}</span> : '—'}</td>
                                  <td>{i.category}</td>
                                  <td>₹{i.price}</td>
                                   <td>{i.trackStock === false ? '—' : Number(i.stock).toFixed(2).replace(/\.0+$/, '')}</td>
                                  <td>
                                    <span className={`badge ${i.isAlcoholic || i.isAlcohol ? 'b-red' : 'b-green'}`}>
                                      {i.isAlcoholic || i.isAlcohol ? 'Alcoholic' : 'Non-Alcoholic'}
                                    </span>
                                  </td>
                                  <td><span className={`badge ${s.cls}`}>{s.text}</span></td>
                                  {isAdmin && (
                                    <td>
                                      <div className="action-cell">
                                        <div className="invActions" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                          <label className="switch" style={{ margin: 0, transform: 'scale(0.85)' }} title={i.isAvailable === false ? 'Out of Stock (Unavailable)' : 'Available'}>
                                            <input
                                              type="checkbox"
                                              checked={i.isAvailable !== false}
                                              onChange={() => toggleAvailability(i._id, i.isAvailable !== false)}
                                            />
                                            <span className="slider round"></span>
                                          </label>
                                          <button className="btn btn-blue btn-sm" onClick={() => setModal(i)}>Edit</button>
                                          <button className="btn btn-icon-sm btn-danger" onClick={() => setConfirmDelete(i._id)} title="Delete item"><Trash2 size={14} /></button>
                                        </div>
                                      </div>
                                    </td>
                                  )}
                                </tr>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </tbody>
                    )}
                  </Droppable>
                </DragDropContext>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* DAILY STOCK REPORT VIEW */}
          <div className="orders-filters-row" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', width: '100%', alignItems: 'center' }}>
              <div className="search-wrapper-unified" style={{ flex: '1 1 200px' }}>
                <Search size={16} className="search-icon" />
                <input
                  value={reportSearch}
                  onChange={e => setReportSearch(e.target.value)}
                  placeholder="Search report items..."
                  className="search-input-unified"
                />
                {reportSearch && (
                  <button className="search-clear-btn" onClick={() => setReportSearch('')} title="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
              <div style={{ flexShrink: 0 }}>
                <DateField
                  label="From Date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  inputRef={startInputRef}
                />
              </div>
              <div style={{ flexShrink: 0 }}>
                <DateField
                  label="To Date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  inputRef={endInputRef}
                />
              </div>
              <div className="select-wrapper-unified" style={{ width: '150px', flexShrink: 0 }}>
                <select value={reportCat} onChange={e => setReportCat(e.target.value)} style={{ paddingLeft: '14px' }}>
                  <option value="All">All Categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          </div>

          {loadingReport ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t2)', fontSize: '15px' }}>
              ⏳ Loading daily stock report...
            </div>
          ) : (
            <>
              {/* Report Desktop View */}
              <div className="desktopView">
                <div className="card-table-wrapper">
                  <table className="dtable">
                    <thead>
                      <tr>
                        <th>Item Name</th>
                        <th>Category</th>
                        <th>Opening Stock</th>
                        <th>Added Today (+/-)</th>
                        <th>Sold Today</th>
                        <th>Closing Stock</th>
                        <th>Unit</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReport.length === 0 ? (
                        <tr>
                          <td colSpan="8" style={{ textAlign: 'center', color: 'var(--t2)', padding: '24px' }}>
                            No records found
                          </td>
                        </tr>
                      ) : (
                        filteredReport.map(i => {
                          const s = getStatus({ trackStock: true, stock: i.closingStock, minStock: i.minStock || 5 });
                          return (
                            <tr key={i.inventoryId}>
                              <td style={{ fontWeight: 'bold', color: 'var(--t0)' }}>
                                {i.itemName}
                              </td>
                              <td>{i.category}</td>
                              <td style={{ fontFamily: 'monospace' }}>{Number(i.openingStock).toFixed(2).replace(/\.00$/, '')}</td>
                              <td style={{
                                fontFamily: 'monospace',
                                color: i.addedStock > 0 ? '#4ade80' : i.addedStock < 0 ? '#f87171' : 'var(--t2)',
                                fontWeight: i.addedStock !== 0 ? 'bold' : 'normal'
                              }}>
                                {i.addedStock > 0 ? `+${Number(i.addedStock).toFixed(2).replace(/\.00$/, '')}` : i.addedStock < 0 ? Number(i.addedStock).toFixed(2).replace(/\.00$/, '') : '—'}
                              </td>
                              <td style={{ fontFamily: 'monospace', color: i.soldStock > 0 ? '#f87171' : 'var(--t2)', fontWeight: i.soldStock > 0 ? 'bold' : 'normal' }}>
                                {i.soldStock > 0 ? Number(i.soldStock).toFixed(2).replace(/\.00$/, '') : '—'}
                              </td>
                              <td style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{Number(i.closingStock).toFixed(2).replace(/\.00$/, '')}</td>
                              <td>{i.unit}</td>
                              <td><span className={`badge ${s.cls}`}>{s.text}</span></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Report Mobile View */}
              <div className="mobileView">
                {filteredReport.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--t2)', padding: '24px' }}>No records found</div>
                ) : (
                  filteredReport.map(i => {
                    const s = getStatus({ trackStock: true, stock: i.closingStock, minStock: i.minStock || 5 });
                    return (
                      <div key={i.inventoryId} className="invCard" style={{ cursor: 'default' }}>
                        <div className="invTop">
                          <div>
                            <div className="invName" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              {i.itemName}
                            </div>
                            <div className="invMeta">{i.category} • {i.unit}</div>
                          </div>
                          <div className="invRight">
                            <span className={`badge ${s.cls}`}>{s.text}</span>
                          </div>
                        </div>
                        
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr 1fr 1fr',
                          gap: '8px',
                          marginTop: '12px',
                          paddingTop: '12px',
                          borderTop: '1px solid var(--b1)',
                          textAlign: 'center',
                          fontSize: '11px',
                          color: 'var(--t2)'
                        }}>
                          <div>
                            <div style={{ color: 'var(--t3)', marginBottom: '2px' }}>Opening</div>
                            <div style={{ fontFamily: 'monospace', color: 'var(--t1)' }}>{Number(i.openingStock).toFixed(1).replace(/\.0$/, '')}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--t3)', marginBottom: '2px' }}>Added</div>
                            <div style={{
                              fontFamily: 'monospace',
                              color: i.addedStock > 0 ? '#4ade80' : i.addedStock < 0 ? '#f87171' : 'var(--t1)'
                            }}>{i.addedStock > 0 ? '+' : ''}{i.addedStock !== 0 ? Number(i.addedStock).toFixed(1).replace(/\.0$/, '') : '0'}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--t3)', marginBottom: '2px' }}>Sold</div>
                            <div style={{
                              fontFamily: 'monospace',
                              color: i.soldStock > 0 ? '#f87171' : 'var(--t1)'
                            }}>{i.soldStock > 0 ? Number(i.soldStock).toFixed(1).replace(/\.0$/, '') : '0'}</div>
                          </div>
                          <div>
                            <div style={{ color: 'var(--t3)', marginBottom: '2px' }}>Closing</div>
                            <div style={{ fontFamily: 'monospace', color: 'var(--t0)', fontWeight: 'bold' }}>{Number(i.closingStock).toFixed(1).replace(/\.0$/, '')}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* MODAL */}
      {modal && (
        <StockModal
          item={modal === 'add' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      {confirmDelete && (
        <div className="moverlay">
          <div className="mbox">
            <div className="mhead">Delete Inventory Item</div>
            <p>Are you sure you want to delete this item?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={async () => {
                try {
                  await deleteInventoryItem(confirmDelete);
                } catch (e) {
                  alert(e.message || 'Failed to delete item');
                } finally {
                  setConfirmDelete(null);
                }
              }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
