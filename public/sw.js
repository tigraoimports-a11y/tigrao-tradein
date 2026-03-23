const CACHE_VERSION = 'tigrao-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;

const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

// Admin pages to pre-cache on first visit
const ADMIN_PAGES = [
  '/admin',
  '/admin/vendas',
  '/admin/estoque',
  '/admin/analytics-vendas',
  '/admin/mapa-vendas',
  '/admin/precos',
  '/admin/gastos',
  '/admin/saldos',
  '/admin/recebiveis',
  '/admin/relatorio',
  '/admin/fornecedores',
  '/admin/entregas',
  '/admin/encomendas',
  '/admin/conciliacao',
  '/admin/cotacao',
  '/admin/usados',
  '/admin/etiquetas',
  '/admin/mostruario',
];

// Critical API routes to cache proactively
const CRITICAL_APIS = [
  '/api/produtos',
  '/api/usados',
  '/api/config',
  '/api/loja?format=grouped',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Listen for cache warm-up messages from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WARM_CACHE') {
    warmCache();
  }
});

// Warm cache: pre-fetch admin pages and critical APIs
async function warmCache() {
  try {
    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    const apiCache = await caches.open(API_CACHE);

    // Cache admin pages
    const pagePromises = ADMIN_PAGES.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) {
          await dynamicCache.put(new Request(url), response);
        }
      } catch { /* skip failed pages */ }
    });

    // Cache critical APIs
    const apiPromises = CRITICAL_APIS.map(async (url) => {
      try {
        const response = await fetch(url, { credentials: 'same-origin' });
        if (response.ok) {
          await apiCache.put(new Request(url), response);
        }
      } catch { /* skip failed APIs */ }
    });

    await Promise.allSettled([...pagePromises, ...apiPromises]);

    // Notify clients that cache is warm
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({ type: 'CACHE_WARMED' });
    });
  } catch { /* warm cache failed silently */ }
}

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome-extension, etc.
  if (!url.protocol.startsWith('http')) return;

  // API calls: network-first, fallback to cache
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(async () => {
          // Try API cache first, then dynamic cache
          const cached = await caches.match(request, { cacheName: API_CACHE });
          if (cached) return cached;
          const dynamicCached = await caches.match(request, { cacheName: DYNAMIC_CACHE });
          if (dynamicCached) return dynamicCached;
          // Return empty JSON so the app doesn't crash
          return new Response(JSON.stringify({ error: 'offline', cached: false }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // Static assets (JS, CSS, images, fonts): cache-first
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf|eot)$/) ||
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com'
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        }).catch(() => {
          // Return empty response for non-critical assets
          return new Response('', { status: 404 });
        });
      })
    );
    return;
  }

  // Page navigation: network-first, fallback to cache, then offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, clone);
            });
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          // Try matching without query params
          const cleanUrl = url.origin + url.pathname;
          const cleanCached = await caches.match(new Request(cleanUrl));
          if (cleanCached) return cleanCached;
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // Everything else: network with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then((cache) => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
