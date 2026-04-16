const CACHE_VERSION = 'tigrao-v5';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const API_CACHE = `${CACHE_VERSION}-api`;
const NEXT_CACHE = `${CACHE_VERSION}-next`;

const STATIC_ASSETS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/manifest.json',
];

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

const CRITICAL_APIS = [
  '/api/produtos',
  '/api/usados',
  '/api/config',
  '/api/loja?format=grouped',
];

// ─── Install ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ─── Activate ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ─── Messages ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'WARM_CACHE') warmCache();
});

// ─── Warm cache ───
async function warmCache() {
  try {
    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    const apiCache = await caches.open(API_CACHE);
    const nextCache = await caches.open(NEXT_CACHE);

    // 1. Cache admin pages (HTML)
    const pagePromises = ADMIN_PAGES.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (res.ok) await dynamicCache.put(new Request(url), res);
      } catch {}
    });

    // 2. Cache critical APIs
    const apiPromises = CRITICAL_APIS.map(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (res.ok) await apiCache.put(new Request(url), res);
      } catch {}
    });

    await Promise.allSettled([...pagePromises, ...apiPromises]);

    // 3. Cache all Next.js build chunks from the page HTML
    // Parse cached admin pages to find _next/static references
    const cachedPages = await dynamicCache.keys();
    const chunkUrls = new Set();

    for (const req of cachedPages) {
      try {
        const res = await dynamicCache.match(req);
        if (!res) continue;
        const html = await res.clone().text();
        // Find all _next/static references
        const matches = html.matchAll(/\/_next\/static\/[^"'\s)]+/g);
        for (const m of matches) {
          chunkUrls.add(m[0]);
        }
      } catch {}
    }

    // Also fetch the build manifest to get ALL chunks
    try {
      const buildManifestUrl = '/_next/static/' + await getBuildId() + '/_buildManifest.js';
      chunkUrls.add(buildManifestUrl);
    } catch {}

    // Cache all discovered chunks
    const chunkPromises = [...chunkUrls].map(async (url) => {
      try {
        const existing = await nextCache.match(url);
        if (existing) return; // Already cached
        const res = await fetch(url, { credentials: 'same-origin' });
        if (res.ok) await nextCache.put(new Request(url), res);
      } catch {}
    });

    await Promise.allSettled(chunkPromises);

    // Notify clients
    const clients = await self.clients.matchAll();
    clients.forEach((c) => c.postMessage({ type: 'CACHE_WARMED', chunks: chunkUrls.size }));
  } catch {}
}

async function getBuildId() {
  // Try to get build ID from __NEXT_DATA__
  try {
    const res = await caches.match('/admin');
    if (!res) return null;
    const html = await res.text();
    const match = html.match(/"buildId":"([^"]+)"/);
    return match ? match[1] : null;
  } catch { return null; }
}

// ─── Fetch Strategy ───
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // ── Next.js chunks (_next/static): cache-first (immutable, hashed) ──
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(NEXT_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // ── Next.js data routes (_next/data): network-first ──
  if (url.pathname.startsWith('/_next/data/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DYNAMIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request).then((c) => c || new Response('{}', {
          status: 503, headers: { 'Content-Type': 'application/json' }
        })))
    );
    return;
  }

  // ── APIs de admin: bypass total (sempre fresh, nunca cacheia) ──
  // Links preenchidos/encaminhados sumiam da listagem porque o SW estava
  // servindo resposta cacheada em certas condicoes. Admin precisa de tempo-real.
  if (url.pathname.startsWith('/api/admin/')) {
    return; // deixa o browser handlear direto, sem interceptar
  }

  // ── API calls (publicas): network-first, cache fallback ──
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(API_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request, { cacheName: API_CACHE });
          if (cached) return cached;
          return new Response(JSON.stringify({ error: 'offline', cached: false }), {
            status: 503, headers: { 'Content-Type': 'application/json' },
          });
        })
    );
    return;
  }

  // ── Static assets (images, fonts, css): cache-first ──
  if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|gif|ico|woff|woff2|ttf|eot)$/) ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        }).catch(() => new Response('', { status: 404 }));
      })
    );
    return;
  }

  // ── Page navigation: network-first → cache → offline.html ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(DYNAMIC_CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () => {
          // Try exact URL
          let cached = await caches.match(request);
          if (cached) return cached;
          // Try without query params
          cached = await caches.match(new Request(url.origin + url.pathname));
          if (cached) return cached;
          // Try matching admin base
          if (url.pathname.startsWith('/admin')) {
            cached = await caches.match('/admin');
            if (cached) return cached;
          }
          // Fallback to offline page
          return caches.match('/offline.html');
        })
    );
    return;
  }

  // ── Everything else: network → cache ──
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
