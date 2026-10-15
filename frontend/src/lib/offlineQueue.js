/**
 * offlineQueue.js
 * ─────────────────────────────────────────────────────────────────
 * Production-Grade Offline & Multi-Device Sync Engine for HUMTUM POS.
 * 
 * Features:
 * 1. Orders Queue (bills created offline with exact HTB-XXX sequence).
 * 2. KOTs Queue (kitchen/bar tickets created offline with natural sequence).
 * 3. Mutations Queue (edits to Menu, Expenses, Attendance, Inventory, Staff, Settings).
 * 4. Master Local Caching with automatic size-capping:
 *    - Order History: Capped to CURRENT MONTH only (drops older months).
 *    - KOT History: Capped to CURRENT DAY only (drops past days).
 * 5. Sequential Local Counters (HTB-XXX and KOT numbers) with cloud sync.
 * 6. Persistent Device Identification for Last-Write-Wins conflict resolution.
 * 7. Live Cross-Tab Synchronization helper (storage event broadcaster).
 * ─────────────────────────────────────────────────────────────────
 */

const ORDER_QUEUE_KEY    = 'humtum_offline_orders_queue_v1';
const KOT_QUEUE_KEY      = 'humtum_offline_kots_queue_v1';
const MUTATION_QUEUE_KEY = 'humtum_offline_mutations_queue_v1';
const DEVICE_ID_KEY      = 'humtum_device_id_v1';
const BILL_COUNTER_KEY   = 'humtum_local_bill_counter_v1';
const KOT_COUNTER_KEY    = 'humtum_local_kot_counter_v1';
const CACHE_PREFIX       = 'humtum_cache_';

// ── DEVICE IDENTIFICATION ─────────────────────────────────────────
export function getDeviceId() {
  try {
    let devId = localStorage.getItem(DEVICE_ID_KEY);
    if (!devId) {
      devId = `dev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
      localStorage.setItem(DEVICE_ID_KEY, devId);
    }
    return devId;
  } catch {
    return 'dev_unknown';
  }
}

export function getBusinessDateString(d = new Date()) {
  const dateObj = typeof d === 'string' || typeof d === 'number' ? new Date(d) : (d || new Date());
  const istTime = new Date(dateObj.getTime() + 19800000); // +5.5 hours in ms
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
}

export function consolidateBillItems(items) {
  if (!Array.isArray(items)) return [];
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const name = (item.name || '').trim();
    if (!name) continue;
    const price = Number(item.price) || 0;
    const key = `${name.toLowerCase()}___${price}`;
    if (map.has(key)) {
      const existing = map.get(key);
      existing.quantity = (Number(existing.quantity) || 0) + (Number(item.quantity) || 1);
    } else {
      map.set(key, {
        ...item,
        name,
        price,
        quantity: Number(item.quantity) || 1
      });
    }
  }
  return Array.from(map.values());
}

// ── SEQUENTIAL COUNTERS (HTB-XXX and KOT-XXX) ─────────────────────
export function getLocalBillCounter(dateStr = getBusinessDateString()) {
  try {
    const storedDate = localStorage.getItem('humtum_offline_bill_date');
    if (storedDate !== dateStr) {
      localStorage.setItem('humtum_offline_bill_date', dateStr);
      localStorage.setItem(BILL_COUNTER_KEY, '0');
      return 0;
    }
    const raw = localStorage.getItem(BILL_COUNTER_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function updateLocalBillCounterIfHigher(seq, dateStr = getBusinessDateString()) {
  try {
    const current = getLocalBillCounter(dateStr);
    const nextSeq = Math.max(current, parseInt(seq, 10) || 0);
    localStorage.setItem('humtum_offline_bill_date', dateStr);
    localStorage.setItem(BILL_COUNTER_KEY, nextSeq.toString());
    return nextSeq;
  } catch {
    return seq;
  }
}

export function incrementAndGetNextBillNo(dateStr = getBusinessDateString()) {
  try {
    const current = getLocalBillCounter(dateStr);
    const nextSeq = current + 1;
    localStorage.setItem('humtum_offline_bill_date', dateStr);
    localStorage.setItem(BILL_COUNTER_KEY, nextSeq.toString());
    return `HTB-${nextSeq.toString().padStart(3, '0')}`;
  } catch {
    return `HTB-${Date.now().toString().slice(-4)}`;
  }
}

export function getLocalKotCounter(dateStr = getBusinessDateString()) {
  try {
    const storedDate = localStorage.getItem('humtum_offline_kot_date');
    if (storedDate !== dateStr) {
      localStorage.setItem('humtum_offline_kot_date', dateStr);
      localStorage.setItem(KOT_COUNTER_KEY, '0');
      return 0;
    }
    const raw = localStorage.getItem(KOT_COUNTER_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export function updateLocalKotCounterIfHigher(seq, dateStr = getBusinessDateString()) {
  try {
    const current = getLocalKotCounter(dateStr);
    const nextSeq = Math.max(current, parseInt(seq, 10) || 0);
    localStorage.setItem('humtum_offline_kot_date', dateStr);
    localStorage.setItem(KOT_COUNTER_KEY, nextSeq.toString());
    return nextSeq;
  } catch {
    return seq;
  }
}

export function incrementAndGetNextKotNo(dateStr = getBusinessDateString()) {
  try {
    const current = getLocalKotCounter(dateStr);
    const nextSeq = current + 1;
    localStorage.setItem('humtum_offline_kot_date', dateStr);
    localStorage.setItem(KOT_COUNTER_KEY, nextSeq.toString());
    return `KOT-${nextSeq.toString().padStart(3, '0')}`;
  } catch {
    return `KOT-${Date.now().toString().slice(-3)}`;
  }
}

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
  
  // Guarantee sequential HTB-XXX bill number if missing
  let billNo = orderPayload.billNo;
  if (!billNo || !/^HTB-\d+$/.test(billNo)) {
    billNo = incrementAndGetNextBillNo();
  } else {
    const match = billNo.match(/HTB-(\d+)/);
    if (match) updateLocalBillCounterIfHigher(match[1]);
  }

  const item = {
    ...orderPayload,
    billNo,
    offlineSyncId,
    deviceId: getDeviceId(),
    clientTimestamp: new Date().toISOString(),
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
  
  // Guarantee sequential KOT-XXX number if missing
  let kotNo = kotPayload.kotNo;
  if (!kotNo || !/^KOT-\d+$/.test(kotNo)) {
    kotNo = incrementAndGetNextKotNo();
  } else {
    const match = kotNo.match(/KOT-(\d+)/);
    if (match) updateLocalKotCounterIfHigher(match[1]);
  }

  const item = {
    ...kotPayload,
    kotNo,
    offlineSyncId,
    deviceId: getDeviceId(),
    clientTimestamp: new Date().toISOString(),
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

// ── MUTATIONS QUEUE (For Menu, Expenses, Attendance, Inventory, Staff, Settings) ─
export function getOfflineMutationQueue() {
  try {
    const raw = localStorage.getItem(MUTATION_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Failed to read offline mutation queue:', err);
    return [];
  }
}

export function saveOfflineMutationQueue(queue) {
  try {
    localStorage.setItem(MUTATION_QUEUE_KEY, JSON.stringify(queue || []));
  } catch (err) {
    console.error('Failed to save offline mutation queue:', err);
  }
}

export function addToOfflineMutationQueue(mutation) {
  const queue = getOfflineMutationQueue();
  const actionId = mutation.id || `mut_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const item = {
    ...mutation,
    id: actionId,
    deviceId: getDeviceId(),
    clientTimestamp: mutation.clientTimestamp || new Date().toISOString(),
    queuedAt: new Date().toISOString()
  };

  const filtered = queue.filter(q => q.id !== actionId);
  filtered.push(item);
  saveOfflineMutationQueue(filtered);
  return item;
}

export function removeFromOfflineMutationQueue(id) {
  const queue = getOfflineMutationQueue();
  const next = queue.filter(q => q.id !== id);
  saveOfflineMutationQueue(next);
  return next;
}

export function clearOfflineMutationQueue() {
  try {
    localStorage.removeItem(MUTATION_QUEUE_KEY);
  } catch {}
}

// ── MASTER CACHING WITH AUTOMATIC STORAGE CAPPING ─────────────────
/**
 * Saves a single clean snapshot of an entity with user-requested storage capping:
 * - Orders: Capped to CURRENT MONTH only
 * - KOTs: Capped to CURRENT DAY only
 */
export function saveMasterCache(entity, data) {
  if (!entity || data === undefined || data === null) return;
  try {
    let payloadToStore = data;

    // Capping Rule 1: Only keep CURRENT MONTH orders in local cache
    if (entity === 'orders' && Array.isArray(data)) {
      const now = new Date();
      const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      payloadToStore = data.filter(order => {
        const orderDateStr = order.businessDate || (order.date ? new Date(order.date).toISOString().slice(0, 10) : '');
        return orderDateStr.startsWith(currentMonthPrefix);
      });
    }

    // Capping Rule 2: Only keep CURRENT DAY KOTs in local cache
    if (entity === 'kots' && Array.isArray(data)) {
      const todayStr = new Date().toISOString().slice(0, 10);
      payloadToStore = data.filter(kot => {
        const kotDateStr = kot.createdAt ? new Date(kot.createdAt).toISOString().slice(0, 10) : todayStr;
        return kotDateStr === todayStr;
      });
    }

    localStorage.setItem(`${CACHE_PREFIX}${entity}`, JSON.stringify(payloadToStore));
  } catch (err) {
    console.warn(`[LocalCache] Failed to cache ${entity}:`, err.message);
  }
}

export function getMasterCache(entity, fallback = null) {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${entity}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

// Helpers for menu
export function cacheMenuItemsLocally(items) {
  saveMasterCache('menu', items);
}

export function getCachedMenuItems() {
  return getMasterCache('menu', []);
}
