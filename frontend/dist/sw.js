// HUMTUM POS Service Worker (PWA Offline Boot Cache)
const CACHE_NAME = 'humtum-pos-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo.webp',
  '/bill-logo.webp'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('⚡ [ServiceWorker] Pre-caching offline app shell');
      await Promise.allSettled(
        STATIC_ASSETS.map(async (url) => {
          try {
            const res = await fetch(url);
            if (res && res.ok) {
              await cache.put(url, res);
            }
          } catch {}
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('🧹 [ServiceWorker] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-first with cache fallback for same-origin HTML/assets only
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // ── CRITICAL: Skip ALL cross-origin requests ───────────────────
  // Do NOT intercept Google Fonts, CDN, or any external domain.
  // Intercepting them causes CSP 'Failed to convert value to Response' errors.
  if (url.origin !== self.location.origin) return;

  // Skip API, Socket.IO, and local print agent
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.hostname === 'localhost' ||
    url.port === '5001'
  ) {
    return;
  }

  // Only handle GET requests
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed — serve from cache (offline cold-start boot)
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          // SPA fallback: any navigate request gets index.html
          if (request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});
