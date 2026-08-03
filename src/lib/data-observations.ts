import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { GameMode } from '@/types/tarkov';
import {
  contentFreshness,
  domainPolicy,
  type AvailabilityStatus,
  type DataDomainId,
  type DataHealth,
  type DeliveryStatus,
} from '@/lib/data-status';

/**
 * Per-instance observation of `fetchTarkovJson`'s cache.
 *
 * ### What this is NOT
 *
 * This is **in-process memory on one server instance**. On Vercel every
 * instance has its own copy, a cold start begins empty, instances never share
 * it, and it is destroyed on recycle. It therefore does **not** mean "the last
 * time the deployment successfully reached json.tarkov.dev" and must never be
 * presented that way. The UI copy says "current server response" / "this
 * server instance's cache" for exactly this reason. Any global uptime record
 * would need persistent storage, which Phase 1 deliberately does not add.
 *
 * ### Accuracy caveat
 *
 * `lastServedFrom` is written on every call, so a render that awaits a loader
 * and then reads this back sees its own delivery path in the normal single
 * render case. Two concurrent renders on one instance touching the same path
 * can interleave, in which case the later write wins. The one distinction that
 * matters most — `stale-cache` — is sticky until a fetch actually succeeds, so
 * it cannot be lost to that race.
 */

export interface FetchObservation {
  path: string;
  /** ms epoch of the last completed successful fetch on this instance. */
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  /** ms epoch at which the currently-served value entered the cache. */
  cacheStoredAt: number | null;
  /** True while the value being served came from the stale-on-error path. */
  servedStale: boolean;
  lastServedFrom: DeliveryStatus;
  /** Coarse classification only — never an error message, URL or stack. */
  errorCode: string | null;
  retryable: boolean;
}

const observations = new Map<string, FetchObservation>();

function entry(path: string): FetchObservation {
  const existing = observations.get(path);
  if (existing) return existing;
  const created: FetchObservation = {
    path,
    lastSuccessAt: null,
    lastErrorAt: null,
    cacheStoredAt: null,
    servedStale: false,
    lastServedFrom: 'unknown',
    errorCode: null,
    retryable: true,
  };
  observations.set(path, created);
  return created;
}

/**
 * Classify a thrown fetch/parse failure into a short, safe code. Deliberately
 * derived from shape rather than kept as the error object: holding the original
 * indefinitely in a module-level map risks leaking a URL or response detail
 * into a render, and nothing downstream needs more than this.
 */
export function classifyFetchError(error: unknown): {
  code: string;
  retryable: boolean;
} {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'TimeoutError' || name === 'AbortError') {
    return { code: 'timeout', retryable: true };
  }
  const status = /responded (\d{3})/.exec(message)?.[1];
  if (status) {
    const numeric = Number(status);
    const retryable = numeric >= 500 || numeric === 408 || numeric === 429;
    return { code: `http_${status}`, retryable };
  }
  if (/invalid (?:document|data shape)/.test(message)) {
    return { code: 'invalid_document', retryable: false };
  }
  return { code: 'network', retryable: true };
}

export function recordFetchSuccess(path: string, at: number): void {
  const record = entry(path);
  record.lastSuccessAt = at;
  record.cacheStoredAt = at;
  record.servedStale = false;
  record.lastServedFrom = 'network';
  // A success clears the previous failure: keeping it would make a recovered
  // path read as still broken.
  record.errorCode = null;
  record.retryable = true;
}

/** A hit on a still-valid cache entry. Never resets a live stale-serve. It
 * carries no time of its own on purpose: reusing a cached value is not a new
 * observation of the upstream document. */
export function recordCacheHit(path: string): void {
  const record = entry(path);
  record.lastServedFrom = record.servedStale ? 'stale-cache' : 'cache';
}

/** The fetch failed but a cached value inside `staleUntil` was re-served. */
export function recordStaleServed(path: string, at: number, error: unknown): void {
  const record = entry(path);
  const { code, retryable } = classifyFetchError(error);
  record.lastErrorAt = at;
  record.errorCode = code;
  record.retryable = retryable;
  record.servedStale = true;
  record.lastServedFrom = 'stale-cache';
}

/** The fetch failed and there was nothing to fall back to. */
export function recordFetchError(path: string, at: number, error: unknown): void {
  const record = entry(path);
  const { code, retryable } = classifyFetchError(error);
  record.lastErrorAt = at;
  record.errorCode = code;
  record.retryable = retryable;
  record.servedStale = false;
  record.cacheStoredAt = null;
  record.lastServedFrom = 'unknown';
}

export function readFetchObservation(path: string): FetchObservation | null {
  const record = observations.get(path);
  return record ? { ...record } : null;
}

/** Test-only. Production code has no reason to forget an observation. */
export function resetFetchObservations(): void {
  observations.clear();
}

// ---------------------------------------------------------------------------
// domain -> cache key mapping
// ---------------------------------------------------------------------------

/**
 * Explicit mapping, not substring inference: a domain names the endpoints its
 * loader actually fetches. `getItems`, `getCombatDataset` and the price side of
 * `getEconomyDataset` all read the same `items` document, and both the maps
 * page and the boss board read `maps` — sharing an endpoint is normal and is
 * recorded here rather than guessed from a path.
 */
const DOMAIN_ENDPOINTS: Record<DataDomainId, readonly string[]> = {
  itemPrices: ['items'],
  traderPrices: ['traders'],
  crafts: ['crafts', 'items'],
  barters: ['barters', 'items'],
  quests: ['tasks'],
  ammunition: ['items'],
  armor: ['items'],
  maps: ['maps'],
  bosses: ['maps'],
  gunsmith: ['tasks'],
  // DB-backed; nothing goes through fetchTarkovJson.
  news: [],
  events: [],
};

/** Endpoints that also have a `_{locale}` translation dictionary document. */
const TRANSLATED_ENDPOINTS = new Set(['items', 'tasks', 'maps', 'traders', 'hideout']);

export function cachePathsForDomain(
  domain: DataDomainId,
  gameMode: GameMode,
  locale: Locale,
): string[] {
  return DOMAIN_ENDPOINTS[domain].flatMap((endpoint) =>
    TRANSLATED_ENDPOINTS.has(endpoint)
      ? [`/${gameMode}/${endpoint}`, `/${gameMode}/${endpoint}_${locale}`]
      : [`/${gameMode}/${endpoint}`],
  );
}

function iso(ms: number | null | undefined): string | undefined {
  return ms == null ? undefined : new Date(ms).toISOString();
}

/**
 * Merge every observation a domain depends on into one `DataHealth`.
 *
 * `availability` is supplied by the caller because only the caller knows
 * whether it actually got usable data — a page that rendered successfully is
 * `available` no matter what the cache map says, and a page whose loader threw
 * is `unavailable` even if a sibling path is fine.
 */
export function domainHealth({
  domain,
  gameMode,
  locale,
  availability,
  sourceUpdatedAt,
  totalCount,
  staleCount,
  missingCount,
  now = Date.now(),
}: {
  domain: DataDomainId;
  gameMode: GameMode;
  locale: Locale;
  availability: AvailabilityStatus;
  /** Upstream content stamp. Omit unless the domain genuinely has one. */
  sourceUpdatedAt?: string | null;
  totalCount?: number;
  staleCount?: number;
  missingCount?: number;
  now?: number;
}): DataHealth {
  const policy = domainPolicy(domain);
  const records = cachePathsForDomain(domain, gameMode, locale)
    .map(readFetchObservation)
    .filter((record): record is FetchObservation => record !== null);

  const servedStale = records.some((record) => record.servedStale);
  const delivery: DeliveryStatus = servedStale
    ? 'stale-cache'
    : records.length === 0
      ? 'unknown'
      : records.every((record) => record.lastServedFrom === 'cache')
        ? 'cache'
        : records.some((record) => record.lastServedFrom === 'network')
          ? 'network'
          : 'unknown';

  // The oldest component decides how old the whole domain is, so a fresh
  // dictionary cannot make a stale base document look current. Requiring every
  // record to have the value also means a half-observed domain reports nothing
  // rather than the one time it happens to know.
  const minOf = (pick: (record: FetchObservation) => number | null) => {
    const values = records.map(pick).filter((value): value is number => value != null);
    return values.length === records.length && values.length ? Math.min(...values) : null;
  };

  const failed = records.find((record) => record.errorCode !== null);

  return {
    domain,
    availability,
    freshness: policy.supportsSourceTimestamp
      ? contentFreshness({
          sourceUpdatedAt,
          warningAfterMs: policy.warningAfterMs,
          staleAfterMs: policy.staleAfterMs,
          now,
        })
      : 'unknown',
    delivery,
    timestamps: {
      ...(policy.supportsSourceTimestamp && sourceUpdatedAt
        ? { sourceUpdatedAt }
        : {}),
      ...(minOf((record) => record.lastSuccessAt) != null
        ? { fetchedAt: iso(minOf((record) => record.lastSuccessAt)) }
        : {}),
      ...(minOf((record) => record.cacheStoredAt) != null
        ? { cacheStoredAt: iso(minOf((record) => record.cacheStoredAt)) }
        : {}),
      observedAt: new Date(now).toISOString(),
    },
    ...(totalCount != null ? { totalCount } : {}),
    ...(staleCount != null ? { staleCount } : {}),
    ...(missingCount != null ? { missingCount } : {}),
    retryable: availability === 'available' ? true : (failed?.retryable ?? true),
    ...(failed?.errorCode ? { internalErrorCode: failed.errorCode } : {}),
  };
}
