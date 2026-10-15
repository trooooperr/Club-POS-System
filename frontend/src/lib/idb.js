/**
 * idb.js
 * ─────────────────────────────────────────────────────────────────
 * Lightweight IndexedDB helper for HUMTUM POS.
 *
 * Why IndexedDB instead of localStorage for orders?
 *  - localStorage cap: ~5 MB total (orders alone were 270 KB and growing)
 *  - IndexedDB cap: ~20% of free disk space (effectively unlimited)
 *  - Speed: Both read from local hard disk — equally fast offline
 *  - IndexedDB is faster for large datasets (no giant JSON.parse overhead)
 *
 * Stores:
 *  - orders     → all order history (no size limit, no time restriction)
 *  - analytics  → today's analytics snapshot for offline
 *  - expenses   → today's expenses snapshot
 *  - due        → due payments snapshot
 *  - attendance → today's attendance snapshot
 * ─────────────────────────────────────────────────────────────────
 */

const DB_NAME    = 'humtum_idb';
const DB_VERSION = 2;

const STORES = {
  ORDERS:     'orders',
  ANALYTICS:  'analytics',
  EXPENSES:   'expenses',
  DUE:        'due',
  ATTENDANCE: 'attendance',
};

// ── Open / Upgrade DB ─────────────────────────────────────────────
let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.ORDERS)) {
        const store = db.createObjectStore(STORES.ORDERS, { keyPath: '_id' });
        store.createIndex('date', 'date', { unique: false });
        store.createIndex('businessDate', 'businessDate', { unique: false });
      }
      for (const name of [STORES.ANALYTICS, STORES.EXPENSES, STORES.DUE, STORES.ATTENDANCE]) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };

    req.onsuccess  = (e) => resolve(e.target.result);
    req.onerror    = (e) => { _dbPromise = null; reject(e.target.error); };
  });
  return _dbPromise;
}

// ── Generic helpers ───────────────────────────────────────────────
async function putAll(storeName, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear();
    for (const item of items) {
      if (item._id || item.id) store.put(item);
    }
    tx.oncomplete = () => resolve();
    tx.onerror    = (e) => reject(e.target.error);
  });
}

async function getAllFromStore(storeName) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[IDB] getAllFromStore(' + storeName + ') failed:', err.message);
    return [];
  }
}

async function putDoc(storeName, doc) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(doc);
      tx.oncomplete = () => resolve();
      tx.onerror    = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[IDB] putDoc(' + storeName + ') failed:', err.message);
  }
}

async function getDoc(storeName, id) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx  = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[IDB] getDoc(' + storeName + ') failed:', err.message);
    return null;
  }
}

// ── ORDERS ────────────────────────────────────────────────────────
export async function saveOrdersToIDB(orders) {
  if (!Array.isArray(orders)) return;
  try { await putAll(STORES.ORDERS, orders); }
  catch (err) { console.warn('[IDB] saveOrdersToIDB failed:', err.message); }
}

export async function getOrdersFromIDB() {
  return getAllFromStore(STORES.ORDERS);
}

export async function upsertOrderInIDB(order) {
  if (!order || !order._id) return;
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.ORDERS, 'readwrite');
      tx.objectStore(STORES.ORDERS).put(order);
      tx.oncomplete = () => resolve();
      tx.onerror    = (e) => reject(e.target.error);
    });
  } catch (err) { console.warn('[IDB] upsertOrderInIDB failed:', err.message); }
}

// ── ANALYTICS SNAPSHOT ────────────────────────────────────────────
export async function saveAnalyticsToIDB(data) {
  await putDoc(STORES.ANALYTICS, { id: 'today', ...data, cachedAt: new Date().toISOString() });
}
export async function getAnalyticsFromIDB() {
  return getDoc(STORES.ANALYTICS, 'today');
}

// ── EXPENSES SNAPSHOT ─────────────────────────────────────────────
export async function saveExpensesToIDB(expenses, meta = {}) {
  await putDoc(STORES.EXPENSES, { id: 'snapshot', expenses: expenses || [], ...meta, cachedAt: new Date().toISOString() });
}
export async function getExpensesFromIDB() {
  return getDoc(STORES.EXPENSES, 'snapshot');
}

// ── DUE PAYMENTS SNAPSHOT ─────────────────────────────────────────
export async function saveDuePaymentsToIDB(data) {
  await putDoc(STORES.DUE, { id: 'snapshot', ...data, cachedAt: new Date().toISOString() });
}
export async function getDuePaymentsFromIDB() {
  return getDoc(STORES.DUE, 'snapshot');
}

// ── ATTENDANCE SNAPSHOT ───────────────────────────────────────────
export async function saveAttendanceToIDB(records, meta = {}) {
  await putDoc(STORES.ATTENDANCE, { id: 'snapshot', records: records || [], ...meta, cachedAt: new Date().toISOString() });
}
export async function getAttendanceFromIDB() {
  return getDoc(STORES.ATTENDANCE, 'snapshot');
}

// ── UTILITY ───────────────────────────────────────────────────────
export async function getIDBSizeEstimateKB() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return ((est.usage || 0) / 1024).toFixed(2);
    }
  } catch {}
  return null;
}
