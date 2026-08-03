/**
 * Connectivity / offline presentation contract (Phase 8).
 *
 * `navigator.onLine` alone never asserts "online". Combine browser signals with
 * real fetch outcomes and service-worker cache delivery.
 */

export type ConnectivityState = 'online' | 'offline' | 'degraded' | 'unknown';

export type OfflineResponseInfo = {
  servedFromOfflineCache: boolean;
  cachedAt?: string;
  requestUrl?: string;
};

export type ConnectivitySignals = {
  browserOnline: boolean | null;
  lastNetworkSuccessAt: number | null;
  lastNetworkFailureAt: number | null;
  servingFromOfflineCache: boolean;
  now: number;
  /** How long a successful fetch remains evidence of being online. */
  onlineGraceMs?: number;
};

const DEFAULT_ONLINE_GRACE_MS = 60_000;

export function deriveConnectivityState(signals: ConnectivitySignals): ConnectivityState {
  const grace = signals.onlineGraceMs ?? DEFAULT_ONLINE_GRACE_MS;
  const successRecent =
    signals.lastNetworkSuccessAt != null &&
    signals.now - signals.lastNetworkSuccessAt <= grace;
  const failureRecent =
    signals.lastNetworkFailureAt != null &&
    (signals.lastNetworkSuccessAt == null ||
      signals.lastNetworkFailureAt > signals.lastNetworkSuccessAt);

  if (signals.servingFromOfflineCache) {
    if (signals.browserOnline === false) return 'offline';
    return 'degraded';
  }

  if (signals.browserOnline === false && failureRecent) return 'offline';
  if (signals.browserOnline === false && !successRecent) return 'offline';

  if (successRecent && !signals.servingFromOfflineCache) return 'online';

  if (failureRecent && signals.browserOnline !== false) return 'degraded';

  if (signals.lastNetworkSuccessAt == null && signals.lastNetworkFailureAt == null) {
    return 'unknown';
  }

  if (successRecent) return 'online';
  if (failureRecent) return signals.browserOnline === false ? 'offline' : 'degraded';
  return 'unknown';
}

export function readCachedAtHeader(headers: Headers | null | undefined): string | undefined {
  if (!headers) return undefined;
  const value = headers.get('X-TarkovDex-Cached-At') ?? headers.get('x-tarkovdex-cached-at');
  return value && Number.isFinite(Date.parse(value)) ? value : undefined;
}

export function readServedFromSwCache(headers: Headers | null | undefined): boolean {
  if (!headers) return false;
  const value = headers.get('X-TarkovDex-From-SW-Cache') ?? headers.get('x-tarkovdex-from-sw-cache');
  return value === '1' || value === 'true';
}

export function offlineResponseInfoFromHeaders(
  headers: Headers | null | undefined,
  requestUrl?: string,
): OfflineResponseInfo {
  const servedFromOfflineCache = readServedFromSwCache(headers);
  return {
    servedFromOfflineCache,
    cachedAt: servedFromOfflineCache ? readCachedAtHeader(headers) : undefined,
    requestUrl,
  };
}

/**
 * Prices/news served from SW cache must never be labelled as a live reading.
 * Content age (`sourceUpdatedAt`) and offline storage time (`cachedAt`) stay separate.
 */
export function shouldWarnCachedMarketData(info: OfflineResponseInfo): boolean {
  return info.servedFromOfflineCache;
}
