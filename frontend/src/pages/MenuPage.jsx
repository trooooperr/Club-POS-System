
import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Plus, Pencil, Trash2, X, Search, Filter, AlertCircle, Check } from 'lucide-react';
import TopNavBar from '../components/TopNavBar';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';

/* ITEM MODAL */
function ItemModal({ item, onClose, onSave }) {
  const { settings, inventory } = useApp();
  const menuCategories = Array.isArray(settings.menuCategories) && settings.menuCategories.length > 0
    ? settings.menuCategories
    : ['General'];
  const [form, setForm] = useState({
    name: item?.name || '',
    category: item?.category || 'All',
    price: item?.price || '',
    department: item?.department || 'kitchen',
    imageUrl: item?.imageUrl || '',
    available: item?.available !== false,
    shortcut: item?.shortcut || '',
    isVeg: item?.isVeg !== false,
    trackDirectStock: item?.trackDirectStock || false,
    directStock: item?.directStock != null ? item.directStock : 0,
    stockDeductionQty: item?.stockDeductionQty != null ? item.stockDeductionQty : 1,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.price || isNaN(form.price)) { setError('Valid price required'); return; }
    
    const trackDirectStock = !!form.trackDirectStock;
    const directStock = trackDirectStock ? (parseFloat(form.directStock) || 0) : 0;
    const stockDeductionQty = trackDirectStock ? (parseFloat(form.stockDeductionQty) || 1) : 1;

    setSaving(true);
    try {
      await onSave({ 
        ...form, 
        price: parseFloat(form.price),
        trackDirectStock,
        directStock,
        stockDeductionQty,
        minDirectStock: 5,
        available: trackDirectStock ? (directStock > 0) : form.available,
        trackStock: false,
        inventoryId: null
      });
      onClose();
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="moverlay">
      <div className="mbox">
        <div className="mhead">
          <span>{item ? 'Edit Item' : 'Add Item'}</span>
          <button className="iBtn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="fgroup">
          <label className="lbl">Item Name</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Chilli Paneer" />
        </div>
        <div className="frow2">
          <div className="fgroup"><label className="lbl">Category</label>
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              <option value="All">All</option>
              {menuCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="fgroup"><label className="lbl">Price</label>
            <input type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
          </div>
        </div>
        <div className="frow2">
          <div className="fgroup"><label className="lbl">Department</label>
            <select value={form.department} onChange={e => setForm({ ...form, department: e.target.value })}>
              <option value="kitchen">Kitchen</option>
              <option value="bar">Bar</option>
            </select>
          </div>
          <div className="fgroup"><label className="lbl">Food Type</label>
            <select value={form.isVeg ? 'veg' : 'non-veg'} onChange={e => setForm({ ...form, isVeg: e.target.value === 'veg' })}>
              <option value="veg">Veg</option>
              <option value="non-veg">Non-Veg</option>
            </select>
          </div>
        </div>
        <div className="frow2">
          <div className="fgroup"><label className="lbl">Shortcut</label>
            <input value={form.shortcut} onChange={e => setForm({ ...form, shortcut: e.target.value.toLowerCase().trim() })}
              placeholder="e.g. cp, pn, ff" maxLength={10} />
          </div>
          <div className="fgroup"><label className="lbl">Image URL</label>
            <input value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })}
              placeholder="https://images.unsplash.com/photo..." />
          </div>
        </div>
        <div style={{ borderTop: '1px solid var(--b1)', paddingTop: '15px', marginTop: '15px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <label className="lbl" style={{ margin: 0, fontWeight: 700, fontSize: '13px' }}>Stock Management</label>
            <label className="switch" style={{ margin: 0, transform: 'scale(0.85)' }} title="Stock Management ON / OFF">
              <input
                type="checkbox"
                checked={form.trackDirectStock}
                onChange={e => setForm({ ...form, trackDirectStock: e.target.checked })}
              />
              <span className="slider round"></span>
            </label>
          </div>

          {form.trackDirectStock && (
            <div className="frow2" style={{ marginTop: '10px', gap: '15px' }}>
              <div className="fgroup" style={{ flex: 1 }}>
                <label className="lbl">Current Stock</label>
                <input
                  type="number"
                  min="0"
                  value={form.directStock}
                  onChange={e => setForm({ ...form, directStock: e.target.value })}
                  placeholder="e.g. 50"
                />
              </div>
              <div className="fgroup" style={{ flex: 1 }}>
                <label className="lbl">Stock Reduction</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={form.stockDeductionQty}
                  onChange={e => setForm({ ...form, stockDeductionQty: e.target.value })}
                  placeholder="e.g. 1"
                />
              </div>
            </div>
          )}
        </div>
        {error && <div style={{ color: 'var(--red)', fontSize: '12px', marginTop: '10px', fontWeight: '500' }}>{error}</div>}
        <div className="m-actions" style={{ marginTop: '20px' }}>
          <button className="btn btn-ghost " style={{ marginRight: '10px' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MenuPage() {
  const { menuItems, saveMenuItem, deleteMenuItem, settings, inventory, reorderMenuItems } = useApp();
  const menuCategories = Array.isArray(settings.menuCategories) && settings.menuCategories.length > 0
    ? settings.menuCategories
    : ['General'];
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('All');
  const [confirmDel, setConfirmDel] = useState(null); // stores ID of item being deleted

  useEffect(() => {
    if (catFilter !== 'All' && menuCategories.length > 0 && !menuCategories.includes(catFilter)) {
      setCatFilter('All');
    }
  }, [menuCategories, catFilter]);

  const filtered = useMemo(() => {
    const invNames = new Set((inventory || []).map(inv => (inv.name || '').toLowerCase().trim()));
    return menuItems.filter(i => {
      if (invNames.has((i.name || '').toLowerCase().trim())) return false;
      const ms = i.name.toLowerCase().includes(search.toLowerCase());
      const mc = catFilter === 'All' || i.category === catFilter;
      return ms && mc;
    });
  }, [menuItems, inventory, search, catFilter]);

  const cats = ['All', ...menuCategories];

  const onDragEnd = (result) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.index === destination.index) return;

    const itemsOfCategory = Array.from(filtered);
    const [removed] = itemsOfCategory.splice(source.index, 1);
    itemsOfCategory.splice(destination.index, 0, removed);

    const orderedIds = itemsOfCategory.map(item => item._id);
    reorderMenuItems(orderedIds);
  };

  const handleShiftItem = async (index, direction) => {
    if (direction === 'up' && index > 0) {
      const newItems = [...filtered];
      [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
      const orderedIds = newItems.map(item => item._id);
      reorderMenuItems(orderedIds);
    } else if (direction === 'down' && index < filtered.length - 1) {
      const newItems = [...filtered];
      [newItems[index + 1], newItems[index]] = [newItems[index], newItems[index + 1]];
      const orderedIds = newItems.map(item => item._id);
      reorderMenuItems(orderedIds);
    }
  };

  return (
    <div className="fi fade-in">


      {/* FILTER BAR - ALIGNED */}
      <div className="menu-filters-row">
        <div style={{ display: 'flex', flex: 1, gap: 8 }}>
          <div className="searchBox-unified" style={{ flex: 1 }}>
            <Search size={16} className="search-icon" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search menu..."
            />
            {search && (
              <button className="search-clear-btn" onClick={() => setSearch('')} title="Clear">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="select-wrapper-unified hide-on-desktop" style={{ width: '110px', flexShrink: 0 }}>
            <select value={catFilter} onChange={e => setCatFilter(e.target.value)} style={{ paddingLeft: '14px' }}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* ADD ITEM BUTTON */}
        <button className="btn btn-primary menu-add-btn mobile-fab-btn" onClick={() => setModal('add')}>
          <Plus size={14} /> <span>Add Item</span>
        </button>
      </div>

      {/* DESKTOP CATEGORY CHIPS */}
      <div className="chipsWrap hide-on-mobile" style={{ marginTop: '0px' }}>
        {cats.map(c => (
          <button
            key={c}
            className={`chip ${catFilter === c ? 'on' : ''}`}
            onClick={() => setCatFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      {/* MOBILE CARDS */}
      <div className="mobileView">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="menu-mobile-list">
            {(provided) => (
              <div ref={provided.innerRef} {...provided.droppableProps}>
                {filtered.map((item, index) => (
                  <Draggable key={item._id} draggableId={item._id} index={index} isDragDisabled={!!search || catFilter === 'All'}>
                    {(provided) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        {...provided.dragHandleProps}
                        className={`menu-mobile-card ${confirmDel === item._id ? 'deleting' : ''}`}
                        style={{
                          ...provided.draggableProps.style,
                          cursor: (!!search || catFilter === 'All') ? 'default' : 'grab'
                        }}
                      >
                        {confirmDel === item._id ? (
                          <div className="del-confirm-overlay">
                            <AlertCircle size={18} color="var(--red)" />
                            <span>Delete "{item.name}"?</span>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn-mini-ghost" onClick={() => setConfirmDel(null)}>No</button>
                              <button className="btn-mini-red" onClick={() => { deleteMenuItem(item._id); setConfirmDel(null); }}>Yes</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {!item.available && (
                              <div className="sold-out-badge">SOLD OUT</div>
                            )}
                            <div className="menu-card-top">
                              <div>
                                <div className="menu-item-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                <span className="badge-mini">{item.category}</span>
                                {item.trackStock && item.inventoryId && (
                                  <div style={{ fontSize: '9px', color: 'var(--accent)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <span>📦 {
                                      typeof item.inventoryId === 'object' 
                                        ? item.inventoryId.name 
                                        : (inventory?.find(inv => inv._id === item.inventoryId)?.name || 'Loading...')
                                    } ({
                                      Number(item.stockDeductionQty) < 1 
                                        ? Number(item.stockDeductionQty).toFixed(3).replace(/\.?0+$/, '') 
                                        : item.stockDeductionQty
                                    })</span>
                                  </div>
                                )}
                              </div>
                              <div className="menu-item-price">₹{item.price.toFixed(0)}</div>
                            </div>
                            <div className="menu-card-bottom">
                              <label className="switch mini">
                                <input type="checkbox" checked={item.available} onChange={e => saveMenuItem({ available: e.target.checked }, item._id)} />
                                <span className="slider round"></span>
                              </label>
                              <div style={{ display: 'flex', gap: 4, marginLeft: 12 }}>
                                <button className="iBtn-round" disabled={index === 0 || !!search || catFilter === 'All'} onClick={() => handleShiftItem(index, 'up')} title="Move up" style={{ fontSize: 10, cursor: index === 0 || !!search || catFilter === 'All' ? 'not-allowed' : 'pointer', opacity: (index === 0 || !!search || catFilter === 'All') ? 0.3 : 1 }}>▲</button>
                                <button className="iBtn-round" disabled={index === filtered.length - 1 || !!search || catFilter === 'All'} onClick={() => handleShiftItem(index, 'down')} title="Move down" style={{ fontSize: 10, cursor: index === filtered.length - 1 || !!search || catFilter === 'All' ? 'not-allowed' : 'pointer', opacity: (index === filtered.length - 1 || !!search || catFilter === 'All') ? 0.3 : 1 }}>▼</button>
                              </div>
                              <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                                <button className="iBtn-round edit" onClick={() => setModal(item)}><Pencil size={12} /></button>
                                <button className="iBtn-round del" onClick={() => setConfirmDel(item._id)}><Trash2 size={12} /></button>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>

      {/* DESKTOP VIEW */}
      <div className="desktopView">
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="dtable">
            <thead>
              <tr><th>Item Name</th><th>Category</th><th style={{ textAlign: 'right' }}>Price</th><th style={{ textAlign: 'center' }}>Shortcut</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'center' }}>Actions</th></tr>
            </thead>
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="menu-desktop-list">
                {(provided) => (
                  <tbody ref={provided.innerRef} {...provided.droppableProps}>
                    {filtered.map((item, index) => (
                      <Draggable key={item._id} draggableId={item._id} index={index} isDragDisabled={!!search || catFilter === 'All'}>
                        {(provided) => (
                          <tr
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            style={{
                              ...provided.draggableProps.style,
                              cursor: (!!search || catFilter === 'All') ? 'default' : 'grab'
                            }}
                          >
                            <td style={{ fontWeight: 600 }}>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                {item.trackDirectStock && (
                                  <span style={{ 
                                    fontSize: '11px', 
                                    fontWeight: 'bold', 
                                    color: (item.directStock || 0) <= (item.minDirectStock || 5) ? '#ef4444' : '#10b981', 
                                    display: 'inline-flex', 
                                    alignItems: 'center', 
                                    gap: '4px', 
                                    marginTop: '3px' 
                                  }}>
                                    <span>📦 Stock:</span>
                                    <span>{item.directStock || 0} units</span>
                                    {(item.directStock || 0) <= (item.minDirectStock || 5) && (
                                      <span className="badge b-red" style={{ fontSize: '9px', padding: '1px 5px' }}>LOW</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td><span className="badge">{item.category}</span></td>
                            <td style={{ textAlign: 'right', fontWeight: 800 }}>₹{item.price.toFixed(2)}</td>
                            <td style={{ textAlign: 'center' }}><span className="menu-shortcut">{item.shortcut || '—'}</span></td>
                            <td style={{ textAlign: 'center' }}>
                              <label className="switch">
                                <input type="checkbox" checked={item.available} onChange={e => saveMenuItem({ available: e.target.checked }, item._id)} />
                                <span className="slider round"></span>
                              </label>
                              {!item.available && <span style={{ color: 'var(--red)', fontSize: 9, fontWeight: 800, marginLeft: 5 }}>SOLD OUT</span>}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {confirmDel === item._id ? (
                                <div className="row-del-confirm">
                                  <button className="confirm-y" onClick={() => { deleteMenuItem(item._id); setConfirmDel(null); }}>Delete</button>
                                  <button className="confirm-n" onClick={() => setConfirmDel(null)}>Cancel</button>
                                </div>
                              ) : (
                                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                                    <button className="iBtn" disabled={index === 0 || !!search || catFilter === 'All'} onClick={() => handleShiftItem(index, 'up')} title="Move up" style={{ opacity: (index === 0 || !!search || catFilter === 'All') ? 0.3 : 1 }}>▲</button>
                                    <button className="iBtn" disabled={index === filtered.length - 1 || !!search || catFilter === 'All'} onClick={() => handleShiftItem(index, 'down')} title="Move down" style={{ opacity: (index === filtered.length - 1 || !!search || catFilter === 'All') ? 0.3 : 1 }}>▼</button>
                                    <span style={{ color: 'var(--b1)', margin: '0 2px' }}>|</span>
                                  <button className="iBtn" onClick={() => setModal(item)}><Pencil size={13} /></button>
                                  <button className="iBtn" style={{ color: 'var(--red)' }} onClick={() => setConfirmDel(item._id)}><Trash2 size={13} /></button>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                  </tbody>
                )}
              </Droppable>
            </DragDropContext>
          </table>
        </div>
      </div>

      {modal && <ItemModal item={modal === 'add' ? null : modal} onClose={() => setModal(null)} onSave={(data) => saveMenuItem(data, modal !== 'add' ? modal._id : null)} />}
    </div>
  );
}