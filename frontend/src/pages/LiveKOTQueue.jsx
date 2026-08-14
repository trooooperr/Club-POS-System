import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { Clock, RefreshCw, Volume2, VolumeX, Search, Filter, CheckCircle, AlertTriangle, ChefHat, GlassWater } from 'lucide-react';
import { apiUrl, authFetch } from '../lib/api';

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

function parseKotSeq(kotNo) {
  if (!kotNo) return 0;
  const match = String(kotNo).match(/KOT-(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

export default function LiveKOTQueue() {
  const { socket, showToast } = useApp();
  const [kots, setKots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [, setNow] = useState(Date.now());

  // Dynamic elapsed-time ticker update every 10s
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const loadLiveKOTs = async () => {
    setRefreshing(true);
    try {
      const res = await authFetch(apiUrl('/api/kots/kitchen/display'));
      if (!res.ok) throw new Error('Failed to load live KOT queue');
      const data = await res.json();
      // Keep only active / pending / preparing / ready KOTs
      const active = (Array.isArray(data) ? data : []).filter(k => !['COMPLETED', 'SERVED', 'CANCELLED'].includes(k.status));
      setKots(active);
    } catch (err) {
      console.error('Error loading live KOT queue:', err);
      showToast('Failed to sync live KOT queue', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const playChime = () => {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880; // A5 tone
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {}
  };

  useEffect(() => {
    loadLiveKOTs();

    if (socket) {
      const handleNewKot = (data) => {
        playChime();
        loadLiveKOTs();
      };
      const handleStatusChanged = () => {
        loadLiveKOTs();
      };

      socket.on('kot-created', handleNewKot);
      socket.on('kot-status-changed', handleStatusChanged);
      socket.on('table-session-updated', loadLiveKOTs);
      socket.on('order-completed', loadLiveKOTs);

      return () => {
        socket.off('kot-created', handleNewKot);
        socket.off('kot-status-changed', handleStatusChanged);
        socket.off('table-session-updated', loadLiveKOTs);
        socket.off('order-completed', loadLiveKOTs);
      };
    }
  }, [socket, soundEnabled]);

  // FIFO Sorting: Sort by KOT sequence ascending (fallback createdAt ascending)
  const sortedKots = useMemo(() => {
    let list = [...kots].sort((a, b) => {
      const seqA = parseKotSeq(a.kotNo);
      const seqB = parseKotSeq(b.kotNo);
      if (seqA !== seqB) return seqA - seqB;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });

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
    <div className="live-kot-queue-page" style={{ padding: '20px', color: 'var(--t0)', height: '100%', overflowY: 'auto' }}>
      {/* HEADER BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '10px', width: '42px', height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#F59E0B' }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: '20px', fontWeight: 900, margin: 0, letterSpacing: '0.3px' }}>Waiters Live Order Queue</h1>
              <span className="badge" style={{ background: '#10B981', color: '#fff', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', animation: 'pulse 1.5s infinite' }}></span> LIVE
              </span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--t2)', margin: 0 }}>Orders sorted by earliest time created (First-In, First-Out)</p>
          </div>
        </div>

        {/* CONTROLS */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', width: '180px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--t2)' }} />
            <input 
              type="text" 
              placeholder="Table or KOT No..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '8px', border: '1px solid var(--b1)', background: 'var(--s1)', color: 'var(--t0)', fontSize: '12px' }}
            />
          </div>

          {/* Department Selector */}
          <div style={{ display: 'flex', background: 'var(--s1)', borderRadius: '8px', border: '1px solid var(--b1)', padding: '2px' }}>
            <button 
              onClick={() => setDepartmentFilter('all')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', background: departmentFilter === 'all' ? 'var(--a)' : 'transparent', color: departmentFilter === 'all' ? '#fff' : 'var(--t1)', cursor: 'pointer' }}
            >
              All
            </button>
            <button 
              onClick={() => setDepartmentFilter('kitchen')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', background: departmentFilter === 'kitchen' ? 'var(--a)' : 'transparent', color: departmentFilter === 'kitchen' ? '#fff' : 'var(--t1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ChefHat size={12} /> Food
            </button>
            <button 
              onClick={() => setDepartmentFilter('bar')}
              style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, border: 'none', background: departmentFilter === 'bar' ? 'var(--a)' : 'transparent', color: departmentFilter === 'bar' ? '#fff' : 'var(--t1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <GlassWater size={12} /> Bar
            </button>
          </div>

          {/* Sound Toggle */}
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)} 
            title={soundEnabled ? 'Sound alerts ON' : 'Sound alerts OFF'}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--b1)', background: 'var(--s1)', color: soundEnabled ? '#10B981' : 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          {/* Manual Refresh */}
          <button 
            onClick={loadLiveKOTs} 
            disabled={refreshing}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--b1)', background: 'var(--s1)', color: 'var(--t0)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600 }}
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* QUEUE GRID */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--t2)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
          <div>Loading live order queue...</div>
        </div>
      ) : sortedKots.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'var(--s1)', border: '1px solid var(--b1)', borderRadius: '14px', color: 'var(--t2)' }}>
          <CheckCircle size={36} style={{ color: '#10B981', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 6px 0', color: 'var(--t0)' }}>All Orders Served!</h3>
          <p style={{ fontSize: '13px', margin: 0 }}>No pending KOTs in the queue right now.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
          {sortedKots.map((kot, index) => {
            const isFirst = index === 0;
            const elapsedTime = getElapsedTimeStr(kot.createdAt);
            const isLongWait = (Date.now() - new Date(kot.createdAt || 0).getTime()) > (10 * 60 * 1000); // 10 mins

            return (
              <div 
                key={kot._id || index}
                style={{
                  background: isFirst ? 'var(--s2)' : 'var(--s1)',
                  border: isFirst ? '2px solid #F59E0B' : '1px solid var(--b1)',
                  borderRadius: '12px',
                  padding: '16px',
                  position: 'relative',
                  boxShadow: isFirst ? '0 4px 20px rgba(245,158,11,0.2)' : '0 2px 8px rgba(0,0,0,0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  transition: 'all 0.2s ease'
                }}
              >
                {/* PRIORITY TAG FOR FIRST KOT */}
                {isFirst && (
                  <div style={{ position: 'absolute', top: '-10px', left: '16px', background: '#F59E0B', color: '#000', fontSize: '10px', fontWeight: 900, padding: '2px 8px', borderRadius: '6px', letterSpacing: '0.8px', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}>
                    🔥 SERVE FIRST (PRIORITY #1)
                  </div>
                )}

                {/* CARD TOP BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: isFirst ? '4px' : '0' }}>
                  <div>
                    <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--t0)', lineHeight: 1 }}>
                      {kot.tableNo ? `TABLE ${kot.tableNo}` : (kot.orderType ? kot.orderType.toUpperCase() : 'TAKEAWAY / GUEST')}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--a)', marginTop: '4px' }}>
                      {kot.kotNo || `KOT-${kot._id?.slice(-4)}`}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: '11px', 
                      fontWeight: 800, 
                      padding: '3px 8px', 
                      borderRadius: '6px',
                      background: isLongWait ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                      color: isLongWait ? '#EF4444' : '#10B981',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Clock size={11} /> {elapsedTime}
                    </div>
                    {kot.waiterName && (
                      <div style={{ fontSize: '11px', color: 'var(--t2)', marginTop: '4px' }}>
                        👤 {kot.waiterName}
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ borderTop: '1px dashed var(--b1)' }} />

                {/* ITEMS LIST */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  {(kot.items || []).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--t0)' }}>
                        {item.name}
                        {item.notes && <span style={{ display: 'block', fontSize: '10px', color: '#F59E0B', fontStyle: 'italic' }}>Note: {item.notes}</span>}
                      </span>
                      <span style={{ fontWeight: 900, background: 'var(--s3)', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
                        x{item.quantity}
                      </span>
                    </div>
                  ))}
                </div>

                {kot.notes && (
                  <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', color: '#F59E0B' }}>
                    ⚠️ {kot.notes}
                  </div>
                )}

                {/* FOOTER STATUS */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid var(--b1)' }}>
                  <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--t2)' }}>
                    Order Time: {new Date(kot.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </span>
                  <span style={{ 
                    fontSize: '11px', 
                    fontWeight: 800, 
                    padding: '2px 8px', 
                    borderRadius: '4px',
                    background: kot.status === 'READY' ? '#10B981' : (kot.status === 'PREPARING' ? '#F59E0B' : 'var(--s3)'),
                    color: kot.status === 'READY' || kot.status === 'PREPARING' ? '#fff' : 'var(--t1)'
                  }}>
                    {kot.status || 'KOT SENT'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
