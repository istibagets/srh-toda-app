/* ==========================================================================
   SRH LINK-TODA - Service Worker for PWA Offline & Background Web Push
   ========================================================================== */

const CACHE_NAME = 'srh-toda-pwa-v11';
const PRECACHE_ASSETS = ['/', '/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Handle Fetch (Mandatory for Chrome PWA Install Prompt)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Bypass API, Reverb WebSockets, Adminer, and external tiles
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/broadcasting') ||
    url.pathname.startsWith('/adminer.php') ||
    url.protocol === 'ws:' ||
    url.protocol === 'wss:'
  ) {
    return;
  }

  // Handle SPA page navigation requests
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cachedIndex = (await caches.match('/index.html')) || (await caches.match('/'));
        if (cachedIndex) return cachedIndex;
        return new Response('<!DOCTYPE html><html><head><title>SRH LINK TODA</title></head><body><script>location.reload();</script></body></html>', {
          headers: { 'Content-Type': 'text/html' }
        });
      })
    );
    return;
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const indexFallback = await caches.match('/index.html');
      if (indexFallback) return indexFallback;
      return new Response('', { status: 404, statusText: 'Not Found' });
    })
  );
});

// Handle Background Push Events from Laravel PushService
self.addEventListener('push', (event) => {
  let data = {
    title: 'SRH LINK-TODA 🚖',
    body: 'You have a new TODA update.',
    icon: '/assets/icon/icon-192.png',
    badge: '/assets/icon/badge-192.png',
    tag: 'srh-toda-notification',
    url: '/',
  };

  try {
    if (event.data) {
      const payload = event.data.json();
      data = { ...data, ...payload };
    }
  } catch (err) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  const notificationOptions = {
    body: data.body,
    icon: data.icon || '/assets/icon/icon-192.png',
    badge: data.badge || '/assets/icon/badge-192.png',
    data: {
      url: data.url || '/',
    },
    tag: (data.tag || 'srh-toda-push') + '-' + Date.now(),
    renotify: true,
    requireInteraction: true,
    silent: false,
    timestamp: Date.now(),
    actions: [
      { action: 'open', title: 'Open SRH TODA' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, notificationOptions)
  );
});

// Handle Notification Click to Focus or Open PWA App
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
