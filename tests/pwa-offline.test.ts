import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALL_CACHE_NAMES,
  CACHE_NAMES,
  cachesToDelete,
  classifyRequest,
  dataCacheLimitForPath,
  hasAuthorizationHeader,
  isMutatingMethod,
  isPwaEnabled,
  isSameOrigin,
  localeFromPathname,
  normalizeCacheUrl,
  PWA_CACHE_VERSION,
  shouldCacheResponse,
} from '../src/lib/pwa/sw-policy';
import {
  deriveConnectivityState,
  offlineResponseInfoFromHeaders,
  shouldWarnCachedMarketData,
} from '../src/lib/offline-status';
import manifest from '../src/app/manifest';

const ROOT = join(import.meta.dirname, '..');

test('manifest has required install fields and real icon sizes', () => {
  const m = manifest();
  assert.equal(m.id, '/');
  assert.equal(m.name, 'TarkovDex');
  assert.equal(m.short_name, 'TarkovDex');
  assert.equal(m.start_url, '/ko');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons && m.icons.length >= 2);
  for (const icon of m.icons ?? []) {
    const path = join(ROOT, 'public', icon.src.replace(/^\//, ''));
    assert.ok(existsSync(path), `missing icon ${icon.src}`);
    const buf = readFileSync(path);
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    assert.equal(`${w}x${h}`, icon.sizes);
  }
});

test('cache version and namespace are TarkovDex-prefixed', () => {
  assert.equal(PWA_CACHE_VERSION, 1);
  for (const name of ALL_CACHE_NAMES) {
    assert.match(name, /^tarkovdex-/);
  }
  assert.equal(CACHE_NAMES.static, 'tarkovdex-static-v1');
});

test('classifyRequest routes known buckets and bypasses admin/cron/sw', () => {
  assert.equal(classifyRequest('/_next/static/chunks/app.js'), 'static');
  assert.equal(classifyRequest('/api/items'), 'data');
  assert.equal(classifyRequest('/api/search'), 'data');
  assert.equal(classifyRequest('/api/tasks'), 'data');
  assert.equal(classifyRequest('/ko/news'), 'pages');
  assert.equal(classifyRequest('/images/atmosphere/customs.webp'), 'images');
  assert.equal(classifyRequest('/sw.js'), 'bypass');
  assert.equal(classifyRequest('/api/cron/tarkov-live'), 'bypass');
  assert.equal(classifyRequest('/ko/admin/live'), 'bypass');
  assert.equal(classifyRequest('/manifest.webmanifest'), 'static');
  assert.equal(classifyRequest('/offline.html'), 'static');
});

test('mutating methods, external origins, and auth headers are rejected', () => {
  assert.equal(isMutatingMethod('POST'), true);
  assert.equal(isMutatingMethod('GET'), false);
  assert.equal(isSameOrigin('https://tarkovdex.dev/api/items', 'https://tarkovdex.dev'), true);
  assert.equal(isSameOrigin('https://evil.example/x', 'https://tarkovdex.dev'), false);
  assert.equal(hasAuthorizationHeader({ authorization: 'Bearer x' }), true);
  assert.equal(hasAuthorizationHeader(new Headers()), false);
});

test('normalizeCacheUrl strips tracking but keeps significant query keys', () => {
  const url =
    'https://tarkovdex.dev/api/search?q=salewa&mode=pve&locale=ko&utm_source=x&fbclid=1';
  const normalized = normalizeCacheUrl(url);
  assert.match(normalized, /q=salewa/);
  assert.match(normalized, /mode=pve/);
  assert.match(normalized, /locale=ko/);
  assert.doesNotMatch(normalized, /utm_source/);
  assert.doesNotMatch(normalized, /fbclid/);
});

test('shouldCacheResponse only accepts successful GET bodies under size cap', () => {
  assert.equal(shouldCacheResponse({ status: 200, method: 'GET' }), true);
  assert.equal(shouldCacheResponse({ status: 404, method: 'GET' }), false);
  assert.equal(shouldCacheResponse({ status: 200, method: 'POST' }), false);
  assert.equal(
    shouldCacheResponse({ status: 200, method: 'GET', contentLength: 3_000_000 }),
    false,
  );
});

test('data cache limits differ for search vs generic APIs', () => {
  assert.equal(dataCacheLimitForPath('/api/search'), 40);
  assert.equal(dataCacheLimitForPath('/api/items'), 80);
});

test('cachesToDelete only removes stale TarkovDex caches', () => {
  const names = [
    'tarkovdex-static-v0',
    'tarkovdex-static-v1',
    'other-app-cache',
    'workbox-precache-v2',
  ];
  assert.deepEqual(cachesToDelete(names), ['tarkovdex-static-v0']);
});

test('isPwaEnabled is production-only with kill switch', () => {
  assert.equal(isPwaEnabled({ NODE_ENV: 'development' }), false);
  assert.equal(isPwaEnabled({ NODE_ENV: 'production' }), true);
  assert.equal(
    isPwaEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_PWA_ENABLED: 'false' }),
    false,
  );
});

test('localeFromPathname defaults to ko', () => {
  assert.equal(localeFromPathname('/en/news'), 'en');
  assert.equal(localeFromPathname('/zh/maps'), 'zh');
  assert.equal(localeFromPathname('/offline.html'), 'ko');
});

test('deriveConnectivityState never treats navigator.onLine alone as online', () => {
  assert.equal(
    deriveConnectivityState({
      browserOnline: true,
      lastNetworkSuccessAt: null,
      lastNetworkFailureAt: null,
      servingFromOfflineCache: false,
      now: 1000,
    }),
    'unknown',
  );
  assert.equal(
    deriveConnectivityState({
      browserOnline: true,
      lastNetworkSuccessAt: 900,
      lastNetworkFailureAt: null,
      servingFromOfflineCache: false,
      now: 1000,
    }),
    'online',
  );
  assert.equal(
    deriveConnectivityState({
      browserOnline: false,
      lastNetworkSuccessAt: null,
      lastNetworkFailureAt: 900,
      servingFromOfflineCache: false,
      now: 1000,
    }),
    'offline',
  );
  assert.equal(
    deriveConnectivityState({
      browserOnline: true,
      lastNetworkSuccessAt: null,
      lastNetworkFailureAt: 900,
      servingFromOfflineCache: false,
      now: 1000,
    }),
    'degraded',
  );
  assert.equal(
    deriveConnectivityState({
      browserOnline: true,
      lastNetworkSuccessAt: 500,
      lastNetworkFailureAt: null,
      servingFromOfflineCache: true,
      now: 1000,
    }),
    'degraded',
  );
});

test('offlineResponseInfoFromHeaders separates SW cache delivery', () => {
  const headers = new Headers({
    'X-TarkovDex-From-SW-Cache': '1',
    'X-TarkovDex-Cached-At': '2026-08-03T10:00:00.000Z',
  });
  const info = offlineResponseInfoFromHeaders(headers, '/api/items');
  assert.equal(info.servedFromOfflineCache, true);
  assert.equal(info.cachedAt, '2026-08-03T10:00:00.000Z');
  assert.equal(shouldWarnCachedMarketData(info), true);
  assert.equal(
    shouldWarnCachedMarketData({ servedFromOfflineCache: false }),
    false,
  );
});

test('public offline.html and sw.js exist', () => {
  assert.ok(existsSync(join(ROOT, 'public/offline.html')));
  assert.ok(existsSync(join(ROOT, 'public/sw.js')));
  const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
  assert.match(sw, /tarkovdex-static-v\$\{CACHE_VERSION\}/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /CLEAR_CACHES/);
  assert.match(sw, /CACHE_VERSION = 1/);
  // skipWaiting only after an explicit SKIP_WAITING message, not on install.
  const installIdx = sw.indexOf("addEventListener('install'");
  const messageIdx = sw.indexOf("addEventListener('message'");
  const skipIdx = sw.indexOf('self.skipWaiting()');
  assert.ok(installIdx >= 0 && messageIdx > installIdx && skipIdx > messageIdx);
});

test('pwa and offline message keys match across locales', () => {
  function leafKeys(obj: unknown, prefix = ''): string[] {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [prefix];
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
      leafKeys(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  const ko = JSON.parse(readFileSync(join(ROOT, 'messages/ko.json'), 'utf8'));
  const en = JSON.parse(readFileSync(join(ROOT, 'messages/en.json'), 'utf8'));
  const zh = JSON.parse(readFileSync(join(ROOT, 'messages/zh.json'), 'utf8'));
  const koKeys = leafKeys(ko).sort();
  assert.deepEqual(leafKeys(en).sort(), koKeys);
  assert.deepEqual(leafKeys(zh).sort(), koKeys);
  assert.ok(koKeys.includes('pwa.installApp'));
  assert.ok(koKeys.includes('offline.clearOfflineCache'));
  assert.ok(koKeys.length >= 1021);
});
