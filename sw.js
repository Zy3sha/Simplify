// ══════════════════════════════════════════════════════════════════
// OBubba Service Worker — Offline-first with smart caching
// ══════════════════════════════════════════════════════════════════

const CACHE_NAME = 'obubba-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.jsx',
  '/styles.css',
  '/theme.js',
  '/loader.js',
  '/firebase.js',
  '/native-plugins.js',
  '/manifest.json',
  '/icon.png',
  '/obubba-happy.png',
  '/obubba-loading.png',
  '/sleep-baby.png',
];

const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js',
  'https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js',
  'https://cdn.jsdelivr.net/npm/@babel/standalone/babel.min.js',
];

// ── Install: pre-cache static assets ────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache local assets (fail gracefully)
      const localPromise = Promise.allSettled(
        STATIC_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
      // Cache CDN assets
      const cdnPromise = Promise.allSettled(
        CDN_ASSETS.map((url) => cache.add(url).catch(() => {}))
      );
      return Promise.all([localPromise, cdnPromise]);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean old caches ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for API, cache-first for assets ────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Firebase/Firestore API calls: network only (don't cache)
  if (url.hostname.includes('firestore.googleapis.com') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('identitytoolkit')) {
    return;
  }

  // Google Fonts: cache-first (they rarely change)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // CDN assets: cache-first
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'www.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Local assets: stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Network failed, return cached or offline page
          if (cached) return cached;
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });

      return cached || fetchPromise;
    })
  );
});

// ── Push Notification handling ───────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'OBubba', body: 'You have a new reminder' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [
      { action: 'open', title: 'Open OBubba' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
    tag: data.tag || 'obubba-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(data.title, options));
});

// ── Notification click handling ──────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes('obubba') && 'focus' in client) {
          client.postMessage({
            type: 'notification_action',
            action: event.notification.data?.action || 'open',
            data: event.notification.data,
          });
          return client.focus();
        }
      }
      // Otherwise open new window
      return self.clients.openWindow(urlToOpen);
    })
  );
});

// ── Background Sync (for offline entries) ────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-entries') {
    event.waitUntil(syncOfflineEntries());
  }
});

async function syncOfflineEntries() {
  // This would sync localStorage entries to Firestore
  // Actual implementation runs in the main app context
  const clients = await self.clients.matchAll();
  for (const client of clients) {
    client.postMessage({ type: 'sync_requested' });
  }
}
