const CACHE_NAME = 'srh-toda-v188';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
    OFFLINE_URL,
    '/favicon.png?v=20',
    '/favicon.ico?v=20',
    '/badge.png?v=20',
    '/images/srh-logo.png?v=20',
    '/images/tricycle-marker.png',
    '/srh-map-style.json',
    '/map-assets/sprites/sprite@2x.json',
    '/map-assets/sprites/sprite@2x.png',
    '/map-assets/fonts/Noto%20Sans%20Regular/0-255.pbf',
    '/map-assets/fonts/Noto%20Sans%20Bold/0-255.pbf',
    '/vendor/echo/pusher.min.js',
    '/vendor/echo/echo.iife.js',
    '/vendor/lucide/lucide.min.js',
    '/vendor/sortable/Sortable.min.js',
    '/vendor/maplibre/maplibre-gl.js',
    '/vendor/maplibre/maplibre-gl.css',
    '/vendor/remixicon/remixicon.css',
    '/vendor/remixicon/remixicon.woff2',
    '/fonts/figtree-latin-400-normal.woff2',
    '/fonts/figtree-latin-500-normal.woff2',
    '/fonts/figtree-latin-600-normal.woff2'
];

function offlineResponse() {
    return caches.match(OFFLINE_URL).then((r) => {
        return r || new Response('You are offline.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
        });
    });
}

function putInCache(req, res) {
    if (res && (res.ok || res.type === 'opaque' || res.status === 200 || res.status === 304)) {
        caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone())).catch(() => { });
    }
    return res;
}

// Stale-While-Revalidate: Return cached response in 0ms, revalidate in background
function staleWhileRevalidateStrategy(req) {
    return caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
            .then((res) => putInCache(req, res))
            .catch(() => cached || offlineResponse());

        return cached || fetchPromise;
    });
}

// Pure Cache-First for static assets, map tiles & font glyphs (0ms, zero background data transfer)
function staticStrategy(req) {
    return caches.match(req).then((cached) => {
        if (cached) {
            return cached;
        }
        return fetch(req)
            .then((res) => putInCache(req, res))
            .catch(() => caches.match(req).then((c) => c || offlineResponse()));
    });
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch(() => { });
        })
    );
    self.skipWaiting();
});

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (e) { }

    const title = data.title || 'SRH LINK-TODA';
    const body = data.body || 'You have a new dispatch update.';
    const isIncomingRide = data.type === 'incoming_ride' || (data.tag && String(data.tag).includes('searching'));

    const options = {
        body: body,
        icon: data.icon || '/favicon.png?v=20',
        badge: data.badge || '/badge.png?v=20',
        data: { url: data.url || '/dashboard', type: isIncomingRide ? 'incoming_ride' : (data.type || 'standard') },
        vibrate: isIncomingRide ? [600, 200, 600, 200, 600, 200, 1000, 300, 600, 200, 600, 200, 1000] : [300, 100, 300],
        silent: false,
        requireInteraction: isIncomingRide || !!data.requireInteraction,
        renotify: true
    };

    if (data.tag) {
        options.tag = String(data.tag);
    }

    if (isIncomingRide) {
        options.tag = 'incoming-ride-dispatch';
        options.actions = [
            { action: 'open', title: '🚖 VIEW PASSENGER' }
        ];
    }

    event.waitUntil(
        self.registration.showNotification(title, options).catch(() => { })
    );

    clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((list) => {
            for (const client of list) {
                try {
                    client.postMessage({
                        type: isIncomingRide ? 'srh-incoming-dispatch' : 'srh-push-shown',
                        title: title,
                        body: body,
                        data: data
                    });
                } catch (e) { }
            }
        })
        .catch(() => { });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const isIncoming = event.notification.data && event.notification.data.type === 'incoming_ride';
    const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard';
    const incomingUrl = targetUrl.includes('?') ? (targetUrl + '&srh_incoming=1') : (targetUrl + '?srh_incoming=1');

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    try {
                        client.postMessage({ type: 'srh-incoming-dispatch', force: true });
                    } catch (e) { }
                    if (isIncoming && !client.url.includes('/dashboard')) {
                        if ('navigate' in client) {
                            client.navigate(incomingUrl).catch(() => { });
                        }
                    }
                    return;
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(isIncoming ? incomingUrl : targetUrl);
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => {
            return self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        }).then((list) => {
            for (const client of list) {
                try { client.postMessage({ type: 'srh-sw-updated' }); } catch (e) { }
            }
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    const url = new URL(req.url);

    if (req.method !== 'GET' || !/^https?:$/.test(url.protocol)) return;

    let strategy = null;

    // 1. Navigation requests: Network-First, NEVER cached. Page HTML must
    //    always reflect the live ride/queue state. Only the offline page is used as a fallback.
    if (req.mode === 'navigate') {
        strategy = () => fetch(req).catch(() => offlineResponse());
    }

    // 2. Map Style & Core Static Assets: Cache-First for instant 0ms map creation
    else if (url.pathname === '/srh-map-style.json') {
        strategy = () => staleWhileRevalidateStrategy(req);
    }

    // 3. Images (Logo, Favicons, Markers, Avatars): Stale-While-Revalidate for instant render with 0ms lag
    else if (
        url.pathname.endsWith('.png') ||
        url.pathname.endsWith('.jpg') ||
        url.pathname.endsWith('.jpeg') ||
        url.pathname.endsWith('.webp') ||
        url.pathname.endsWith('.ico') ||
        url.pathname.endsWith('.svg') ||
        url.pathname.includes('/images/') ||
        url.pathname.includes('/storage/avatars/') ||
        url.pathname.includes('favicon') ||
        url.pathname.includes('srh-logo')
    ) {
        strategy = () => staleWhileRevalidateStrategy(req);
    }

    // 4. Static Code & Map Tiles (CSS, JS, Fonts, Vector Tiles .pbf, Sprites, Glyph PBFs): Cache-First
    else if (
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.js') ||
        url.pathname.endsWith('.woff2') ||
        url.pathname.endsWith('.pbf') ||
        url.pathname.includes('sprite') ||
        url.origin.includes('maptiler.com') ||
        url.origin.includes('cartocdn.com') ||
        url.origin.includes('openstreetmap.org') ||
        url.origin.includes('cdnjs.cloudflare.com') ||
        url.origin.includes('unpkg.com') ||
        url.origin.includes('jsdelivr.net') ||
        url.origin.includes('fonts.bunny.net')
    ) {
        strategy = () => staticStrategy(req);
    }

    if (strategy) {
        event.respondWith(
            Promise.resolve()
                .then(strategy)
                .catch(() => offlineResponse())
                .then((res) => (res instanceof Response ? res : offlineResponse()))
        );
    }
});