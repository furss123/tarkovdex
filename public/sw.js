/* TarkovDex service worker — Phase 8.
 *
 * Mirrors `src/lib/pwa/sw-policy.ts`. Keep contracts in sync when changing
 * cache names, headers, or route classification.
 *
 * Kill switch: clients stop registering when NEXT_PUBLIC_PWA_ENABLED=false;
 * this file still self-cleans TarkovDex caches on CLEAR_CACHES / activate.
 */
const CACHE_VERSION = 1;
const CACHE_NAMES = {
  static: `tarkovdex-static-v${CACHE_VERSION}`,
  pages: `tarkovdex-pages-v${CACHE_VERSION}`,
  data: `tarkovdex-data-v${CACHE_VERSION}`,
  images: `tarkovdex-images-v${CACHE_VERSION}`,
};
const ALL_CACHE_NAMES = Object.values(CACHE_NAMES);
const CACHED_AT_HEADER = 'X-TarkovDex-Cached-At';
const FROM_SW_CACHE_HEADER = 'X-TarkovDex-From-SW-Cache';
const MAX_BODY = 2_500_000;
const LIMITS = { pages: 30, data: 80, search: 40, images: 100, news: 10 };
const TRACKING = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
]);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAMES.static);
      try {
        await cache.addAll(['/offline.html', '/icon-192.png', '/icon-512.png', '/favicon.ico']);
      } catch {
        // Precache is best-effort; runtime caching still works.
      }
      // Do not skipWaiting here — user applies updates explicitly.
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('tarkovdex-') && !ALL_CACHE_NAMES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (data.type === 'CLEAR_CACHES') {
    event.waitUntil(
      (async () => {
        const names = await caches.keys();
        await Promise.all(
          names.filter((n) => n.startsWith('tarkovdex-')).map((n) => caches.delete(n)),
        );
        if (event.source && 'postMessage' in event.source) {
          event.source.postMessage({ type: 'CACHE_CLEARED' });
        }
      })(),
    );
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  try {
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;
    if (request.headers.get('authorization')) return;

    const bucket = classify(url.pathname);
    if (bucket === 'bypass') return;

    if (bucket === 'static') {
      event.respondWith(cacheFirst(request, CACHE_NAMES.static, LIMITS.images));
      return;
    }
    if (bucket === 'images') {
      event.respondWith(cacheFirst(request, CACHE_NAMES.images, LIMITS.images));
      return;
    }
    if (bucket === 'data') {
      const limit = dataLimit(url.pathname);
      event.respondWith(networkFirst(request, CACHE_NAMES.data, limit, true));
      return;
    }
    // pages / navigation
    event.respondWith(networkFirstNavigation(request));
  } catch {
    // Never block the network on SW bugs.
  }
});

function classify(pathname) {
  if (
    pathname === '/sw.js' ||
    pathname.startsWith('/api/cron') ||
    pathname.includes('/admin')
  ) {
    return 'bypass';
  }
  if (pathname.startsWith('/_next/static/')) return 'static';
  if (
    pathname === '/manifest.webmanifest' ||
    pathname === '/favicon.ico' ||
    pathname === '/icon.svg' ||
    pathname.startsWith('/favicon-') ||
    pathname.startsWith('/icon-') ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/offline.html'
  ) {
    return 'static';
  }
  if (pathname.startsWith('/api/')) return 'data';
  if (
    pathname.startsWith('/images/') ||
    /\.(png|jpg|jpeg|webp|gif|svg|ico)$/i.test(pathname)
  ) {
    return 'images';
  }
  return 'pages';
}

function dataLimit(pathname) {
  if (pathname === '/api/search') return LIMITS.search;
  if (/\/(ko|zh|en)\/news\/?$/.test(pathname)) return LIMITS.news;
  return LIMITS.data;
}

function normalizeUrl(raw) {
  const url = new URL(raw);
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.hash = '';
  return url.href;
}

function cacheKey(request) {
  return new Request(normalizeUrl(request.url), { method: 'GET' });
}

function shouldCache(response) {
  if (!response || response.status < 200 || response.status >= 300) return false;
  const len = response.headers.get('content-length');
  if (len && Number(len) > MAX_BODY) return false;
  if (response.headers.get('set-cookie')) return false;
  return true;
}

async function putWithMeta(cache, request, response, maxEntries) {
  if (!shouldCache(response)) return;
  const headers = new Headers(response.headers);
  headers.set(CACHED_AT_HEADER, new Date().toISOString());
  const body = await response.clone().arrayBuffer();
  if (body.byteLength > MAX_BODY) return;
  await cache.put(
    cacheKey(request),
    new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }),
  );
  await trimCache(cache, maxEntries);
}

async function markFromCache(response) {
  if (!response) return null;
  const headers = new Headers(response.headers);
  headers.set(FROM_SW_CACHE_HEADER, '1');
  if (!headers.get(CACHED_AT_HEADER)) {
    headers.set(CACHED_AT_HEADER, new Date().toISOString());
  }
  const body = await response.clone().arrayBuffer();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function trimCache(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const overflow = keys.length - maxEntries;
  for (let i = 0; i < overflow; i += 1) {
    await cache.delete(keys[i]);
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  try {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(cacheKey(request));
    if (cached) {
      const marked = await markFromCache(cached);
      if (marked) return marked;
    }
    const response = await fetch(request);
    if (shouldCache(response)) {
      eventSafePut(cache, request, response.clone(), maxEntries);
    }
    return response;
  } catch (err) {
    try {
      const cache = await caches.open(cacheName);
      const cached = await cache.match(cacheKey(request));
      if (cached) {
        const marked = await markFromCache(cached);
        if (marked) return marked;
      }
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function eventSafePut(cache, request, response, maxEntries) {
  putWithMeta(cache, request, response, maxEntries).catch(() => {});
}

async function networkFirst(request, cacheName, maxEntries, markOffline) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (shouldCache(response)) {
      eventSafePut(cache, request, response.clone(), maxEntries);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey(request));
    if (cached) {
      return markOffline ? (await markFromCache(cached)) || cached : cached;
    }
    throw err;
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAMES.pages);
  const accept = request.headers.get('accept') || '';
  const isDocument =
    request.mode === 'navigate' || accept.includes('text/html');

  try {
    const response = await fetch(request);
    if (isDocument && shouldCache(response)) {
      eventSafePut(cache, request, response.clone(), LIMITS.pages);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(cacheKey(request));
    if (cached) {
      return (await markFromCache(cached)) || cached;
    }
    if (isDocument) {
      const fallback = await caches.match('/offline.html');
      if (fallback) {
        return (await markFromCache(fallback)) || fallback;
      }
    }
    throw err;
  }
}
