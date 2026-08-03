/**
 * Pure PWA / service-worker policy (Phase 8).
 *
 * Authoritative rules for tests and documentation. `public/sw.js` mirrors these
 * contracts at runtime (service workers cannot import this module).
 */

export const PWA_CACHE_VERSION = 1;

export const CACHE_NAMES = {
  static: `tarkovdex-static-v${PWA_CACHE_VERSION}`,
  pages: `tarkovdex-pages-v${PWA_CACHE_VERSION}`,
  data: `tarkovdex-data-v${PWA_CACHE_VERSION}`,
  images: `tarkovdex-images-v${PWA_CACHE_VERSION}`,
} as const;

export const ALL_CACHE_NAMES = Object.values(CACHE_NAMES);

export const CACHED_AT_HEADER = 'X-TarkovDex-Cached-At';
export const FROM_SW_CACHE_HEADER = 'X-TarkovDex-From-SW-Cache';

export const RUNTIME_LIMITS = {
  pages: 30,
  data: 80,
  search: 40,
  images: 100,
  news: 10,
  maxBodyBytes: 2_500_000,
} as const;

export const RUNTIME_MAX_AGE_MS = {
  pages: 7 * 24 * 60 * 60 * 1000,
  data: 24 * 60 * 60 * 1000,
  images: 14 * 24 * 60 * 60 * 1000,
} as const;

export type CacheBucket = 'static' | 'pages' | 'data' | 'images' | 'bypass';

export type SwMessageType = 'SKIP_WAITING' | 'CLEAR_CACHES' | 'GET_CACHE_STATS';

export const SW_MESSAGE = {
  SKIP_WAITING: 'SKIP_WAITING',
  CLEAR_CACHES: 'CLEAR_CACHES',
  GET_CACHE_STATS: 'GET_CACHE_STATS',
  CACHE_CLEARED: 'CACHE_CLEARED',
  CACHE_STATS: 'CACHE_STATS',
} as const;

/** Query keys that change response identity — never strip these. */
export const SIGNIFICANT_QUERY_KEYS = new Set([
  'q',
  'domain',
  'mode',
  'locale',
  'ids',
  'detail',
  'page',
  'sort',
  'sale',
  'category',
  'direction',
  'feeRate',
  'area',
  'kind',
  'type',
  'state',
  'review',
]);

const TRACKING_QUERY_KEYS = new Set([
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

export function isSameOrigin(requestUrl: string, origin: string): boolean {
  try {
    return new URL(requestUrl).origin === origin;
  } catch {
    return false;
  }
}

export function isMutatingMethod(method: string): boolean {
  return method !== 'GET' && method !== 'HEAD';
}

export function hasAuthorizationHeader(headers: Headers | Record<string, string | null | undefined>): boolean {
  if (headers instanceof Headers) {
    return Boolean(headers.get('authorization') || headers.get('Authorization'));
  }
  return Boolean(headers.authorization || headers.Authorization);
}

/**
 * Normalize a request URL for cache keys: drop tracking params only.
 * Never drop significant query keys.
 */
export function normalizeCacheUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  const keys = [...url.searchParams.keys()];
  for (const key of keys) {
    if (TRACKING_QUERY_KEYS.has(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.hash = '';
  return url.href;
}

export function classifyRequest(pathname: string): CacheBucket {
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
    pathname === '/manifest.webmanifest/' ||
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
  // HTML navigations and RSC payloads under locale routes.
  return 'pages';
}

export function shouldCacheResponse(input: {
  status: number;
  method: string;
  contentLength?: number | null;
}): boolean {
  if (input.method !== 'GET') return false;
  if (input.status < 200 || input.status >= 300) return false;
  if (input.contentLength != null && input.contentLength > RUNTIME_LIMITS.maxBodyBytes) {
    return false;
  }
  return true;
}

export function isSearchApiPath(pathname: string): boolean {
  return pathname === '/api/search';
}

export function isNewsPath(pathname: string): boolean {
  return /\/(ko|zh|en)\/news\/?$/.test(pathname) || pathname === '/news';
}

export function isItemsApiPath(pathname: string): boolean {
  return pathname === '/api/items';
}

export function isTasksApiPath(pathname: string): boolean {
  return pathname === '/api/tasks';
}

export function dataCacheLimitForPath(pathname: string): number {
  if (isSearchApiPath(pathname)) return RUNTIME_LIMITS.search;
  if (isNewsPath(pathname)) return RUNTIME_LIMITS.news;
  return RUNTIME_LIMITS.data;
}

export function isTarkovDexCacheName(name: string): boolean {
  return name.startsWith('tarkovdex-');
}

export function cachesToDelete(existingNames: string[], keep: string[] = ALL_CACHE_NAMES): string[] {
  const keepSet = new Set(keep);
  return existingNames.filter((name) => isTarkovDexCacheName(name) && !keepSet.has(name));
}

export function isPwaEnabled(env: {
  NODE_ENV?: string | null;
  NEXT_PUBLIC_PWA_ENABLED?: string | null;
}): boolean {
  if (env.NODE_ENV !== 'production') return false;
  if (env.NEXT_PUBLIC_PWA_ENABLED === 'false' || env.NEXT_PUBLIC_PWA_ENABLED === '0') {
    return false;
  }
  return true;
}

export function offlineFallbackUrl(origin: string): string {
  return new URL('/offline.html', origin).href;
}

export function localeFromPathname(pathname: string): 'ko' | 'en' | 'zh' {
  const first = pathname.split('/').filter(Boolean)[0];
  if (first === 'en' || first === 'zh' || first === 'ko') return first;
  return 'ko';
}
