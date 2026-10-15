/**
 * offlineQueue.js
 * ─────────────────────────────────────────────────────────────────
 * Handles local caching and queueing of orders, bills, and KOTs
 * created while the restaurant/bar is disconnected from the internet.
 * ─────────────────────────────────────────────────────────────────
 */

const ORDER_QUEUE_KEY = 'humtum_offline_orders_queue_v1';
const KOT_QUEUE_KEY   = 'humtum_offline_kots_queue_v1';
const MENU_CACHE_KEY  = 'humtum_offline_menu_cache_v1';

// ── ORDERS QUEUE ─────────────────────────────────────────────────
export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(ORDER_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline order queue:', err);
    return [];
  }
}

export function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(ORDER_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (err) {
    console.error('Failed to save offline order queue:', err);
  }
}

export function addToOfflineQueue(orderPayload) {
  const queue = getOfflineQueue();
  const offlineSyncId = orderPayload.offlineSyncId || `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item = {
    ...orderPayload,
    offlineSyncId,
    queuedAt: new Date().toISOString()
  };

  const filtered = queue.filter(q => q.offlineSyncId !== offlineSyncId);
  filtered.push(item);
  saveOfflineQueue(filtered);
  return item;
}

export function removeFromOfflineQueue(offlineSyncId) {
  const queue = getOfflineQueue();
  const next = queue.filter(q => q.offlineSyncId !== offlineSyncId);
  saveOfflineQueue(next);
  return next;
}

export function clearOfflineQueue() {
  try {
    localStorage.removeItem(ORDER_QUEUE_KEY);
  } catch {}
}

// ── KOTS QUEUE ───────────────────────────────────────────────────
export function getOfflineKotQueue() {
  try {
    const raw = localStorage.getItem(KOT_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline KOT queue:', err);
    return [];
  }
}

export function saveOfflineKotQueue(queue) {
  try {
    localStorage.setItem(KOT_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (err) {
    console.error('Failed to save offline KOT queue:', err);
  }
}

export function addToOfflineKotQueue(kotPayload) {
  const queue = getOfflineKotQueue();
  const offlineSyncId = kotPayload.offlineSyncId || `offline_kot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item = {
    ...kotPayload,
    offlineSyncId,
    queuedAt: new Date().toISOString()
  };

  const filtered = queue.filter(q => q.offlineSyncId !== offlineSyncId);
  filtered.push(item);
  saveOfflineKotQueue(filtered);
  return item;
}

export function removeFromOfflineKotQueue(offlineSyncId) {
  const queue = getOfflineKotQueue();
  const next = queue.filter(q => q.offlineSyncId !== offlineSyncId);
  saveOfflineKotQueue(next);
  return next;
}

export function clearOfflineKotQueue() {
  try {
    localStorage.removeItem(KOT_QUEUE_KEY);
  } catch {}
}

// ── MENU LOCAL MIRROR ─────────────────────────────────────────────
export function cacheMenuItemsLocally(items) {
  if (!Array.isArray(items) || items.length === 0) return;
  try {
    localStorage.setItem(MENU_CACHE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Failed to cache menu items locally:', err.message);
  }
}

export function getCachedMenuItems() {
  try {
    const raw = localStorage.getItem(MENU_CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
