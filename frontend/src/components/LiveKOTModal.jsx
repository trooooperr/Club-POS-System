import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, RefreshCw, Search, X, ChefHat, GlassWater } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';

function cleanNotes(notes) {
  if (!notes) return '';
  return String(notes)
    .replace(/pos_print_[a-z0-9]+/gi, '')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .trim();
}

function getElapsedTimeStr(createdAt) {
  if (!createdAt) return 'Just now';
  const created = new Date(createdAt).getTime();
  const diffSec = Math.floor((Date.now() - created) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ${diffMin % 60}m ago`;
}

export default function LiveKOTModal({ onClose }) {
  const { socket, showToast } = useApp();
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Listen to Esc key to close modal
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

  const loadLiveKOTs = async () => {
    setRefreshing(true);
    try {
      const res = await authFetch(apiUrl('/api/kots/kitchen/display'));
      if (!res.ok) throw new Error('Failed to load live KOT display');
      const data = await res.json();
      const active = (Array.isArray(data) ? data : []).filter(k => !['COMPLETED', 'SERVED', 'CANCELLED'].includes(k.status));
      setKots(active);
    } catch (err) {
      console.error('Error loading live KOT display:', err);
      showToast('Failed to sync live KOT queue', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadLiveKOTs();

    if (socket) {
      const handleSync = () => loadLiveKOTs();
      socket.on('kot-created', handleSync);
      socket.on('kot-status-changed', handleSync);
      socket.on('table-session-updated', handleSync);
      socket.on('order-completed', handleSync);

      return () => {
        socket.off('kot-created', handleSync);
        socket.off('kot-status-changed', handleSync);
        socket.off('table-session-updated', handleSync);
        socket.off('order-completed', handleSync);
      };
    }
  }, [socket]);

  // Reverse Order Sorting: Latest generated KOT at the top (createdAt descending)
  const sortedKots = useMemo(() => {
    let list = [...kots].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (departmentFilter !== 'all') {
      list = list.filter(k => {
        const items = k.items || [];
        return items.some(item => (item.department || 'kitchen').toLowerCase() === departmentFilter);
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(k => 
        String(k.tableNo).includes(q) || 
        String(k.kotNo || '').toLowerCase().includes(q) ||
        (k.waiterName || '').toLowerCase().includes(q)
      );
    }

    return list;
  }, [kots, departmentFilter, searchQuery]);

  return (
    <div 
      className="moverlay" 
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.82)', zIndex: 1150 }}
      onClick={onClose}
    >
      <div 
        className="mbox" 
        style={{ maxWidth: '820px', width: '94%', maxHeight: '88vh', padding: '20px', position: 'relative', borderRadius: '16px', background: 'var(--s1)', border: '1px solid var(--b1)', color: 'var(--t0)', display: 'flex', flexDirection: 'column', gap: '14px' }}
        onClick={e => e.stopPropagation()}
      >
        {/* HEADER BAR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '8px', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
              <Clock size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3 style={{ fontSize: '17px', fontWeight: 900, margin: 0 }}>Live KOT Display</h3>
                <span style={{ background: '#10B981', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 7px', borderRadius: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }}></span> LIVE
                </span>
              </div>
              <p style={{ fontSize: '11px', color: 'var(--t2)', margin: 0 }}>Latest orders on top · Auto-refreshing</p>
            </div>
          </div>

          {/* CONTROLS & CLOSE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', width: '150px' }}>
              <Search size={13} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
              <input 
                type="text" 
                placeholder="Table / KOT..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '5px 8px 5px 26px', borderRadius: '6px', border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', fontSize: '11px' }}
              />
            </div>

            {/* Department Filter */}
            <div style={{ display: 'flex', background: 'var(--s2)', borderRadius: '6px', border: '1px solid var(--b1)', padding: '2px' }}>
              <button 
                type="button"
                onClick={() => setDepartmentFilter('all')}
                style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: 'none', background: departmentFilter === 'all' ? 'var(--a)' : 'transparent', color: departmentFilter === 'all' ? '#fff' : 'var(--t1)', cursor: 'pointer' }}
              >
                All
              </button>
              <button 
                type="button"
                onClick={() => setDepartmentFilter('kitchen')}
                style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: 'none', background: departmentFilter === 'kitchen' ? 'var(--a)' : 'transparent', color: departmentFilter === 'kitchen' ? '#fff' : 'var(--t1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <ChefHat size={11} /> Food
              </button>
              <button 
                type="button"
                onClick={() => setDepartmentFilter('bar')}
                style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, border: 'none', background: departmentFilter === 'bar' ? 'var(--a)' : 'transparent', color: departmentFilter === 'bar' ? '#fff' : 'var(--t1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
              >
                <GlassWater size={11} /> Bar
              </button>
            </div>

            {/* Refresh */}
            <button 
              type="button"
              onClick={loadLiveKOTs} 
              disabled={refreshing}
              style={{ padding: '5px 9px', borderRadius: '6px', border: '1px solid var(--b1)', background: 'var(--s2)', color: 'var(--t0)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 600 }}
            >
              <RefreshCw size={12} className={refreshing ? 'spin' : ''} />
            </button>

            {/* Close Button */}
            <button 
              type="button"
              onClick={onClose} 
              style={{ background: 'var(--s2)', border: '1px solid var(--b1)', color: 'var(--t1)', borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--b1)' }} />

        {/* COMPACT CARDS LIST (LATEST ON TOP) */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t2)', fontSize: '13px' }}>
              <RefreshCw size={20} className="spin" style={{ marginBottom: '8px' }} />
              <div>Loading live KOT display...</div>
            </div>
          ) : sortedKots.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: 'var(--s2)', border: '1px dashed var(--b1)', borderRadius: '10px', color: 'var(--t2)', fontSize: '13px' }}>
              No active KOTs found in queue.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {sortedKots.map((kot, index) => {
                const isLatest = index === 0;
                const cleanedKotNotes = cleanNotes(kot.notes);

                return (
                  <div 
                    key={kot._id || index}
                    style={{
                      background: 'var(--s1)',
                      border: '1px solid var(--b1)',
                      borderRadius: '10px',
                      padding: '12px',
                      position: 'relative',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    {/* TOP INFO */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--t0)', lineHeight: 1 }}>
                          TABLE {kot.tableNo}
                        </div>
                        <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--a)', marginTop: '3px' }}>
                          {kot.kotNo || `KOT-${kot._id?.slice(-4)}`}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'var(--s3)', color: 'var(--t1)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={10} /> {getElapsedTimeStr(kot.createdAt)}
                        </div>
                        {kot.waiterName && (
                          <div style={{ fontSize: '10px', color: 'var(--t2)', marginTop: '3px' }}>
                            👤 {kot.waiterName}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--b1)' }} />

                    {/* ITEMS LIST */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {(kot.items || []).map((item, idx) => {
                        const cleanedItemNote = cleanNotes(item.notes);
                        return (
                          <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: '12px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--t0)', flex: 1, paddingRight: '6px' }}>
                              {item.name}
                              {cleanedItemNote && <span style={{ display: 'block', fontSize: '10px', color: '#F59E0B', fontStyle: 'italic' }}>Note: {cleanedItemNote}</span>}
                            </span>
                            <span style={{ fontWeight: 900, background: 'var(--s3)', padding: '1px 6px', borderRadius: '4px', fontSize: '11px', flexShrink: 0 }}>
                              x{item.quantity}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {cleanedKotNotes && (
                      <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '5px 8px', borderRadius: '5px', fontSize: '10px', color: '#F59E0B' }}>
                        Note: {cleanedKotNotes}
                      </div>
                    )}

                    <div style={{ fontSize: '10px', color: 'var(--t2)', textAlign: 'right', borderTop: '1px solid var(--b1)', paddingTop: '4px', marginTop: 'auto' }}>
                      {new Date(kot.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
