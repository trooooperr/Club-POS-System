/**
 * offlineQueue.js
 * ─────────────────────────────────────────────────────────────────
 * Handles local caching and queueing of orders/bills created while
 * the restaurant/bar is disconnected from the internet.
 * ─────────────────────────────────────────────────────────────────
 */

const QUEUE_KEY = 'humtum_offline_orders_queue_v1';
const MENU_CACHE_KEY = 'humtum_offline_menu_cache_v1';

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline queue:', err);
    return [];
  }
}

export function saveOfflineQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
  } catch (err) {
    console.error('Failed to save offline queue:', err);
  }
}

export function addToOfflineQueue(orderPayload) {
  const queue = getOfflineQueue();
  // Ensure unique offlineSyncId
  const offlineSyncId = orderPayload.offlineSyncId || `offline_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item = {
    ...orderPayload,
    offlineSyncId,
    queuedAt: new Date().toISOString()
  };

  // Avoid duplicates
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
    localStorage.removeItem(QUEUE_KEY);
  } catch {}
}

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
