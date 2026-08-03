/**
 * Site-wide data-trust contract (Phase 1).
 *
 * Deliberately three independent axes instead of one enum, because collapsing
 * them loses the distinction the site most needs to make: "old but usable",
 * "partly missing", and "not available" are different answers, and so is "we
 * are showing you the previous cached copy". `summarizeHealth()` is the only
 * place they are reduced to a single word, and only for a badge.
 *
 * Pure module — no `server-only`, no mutable state — so client components may
 * import the types and the summariser. Instance-scoped observation lives in
 * `src/lib/data-observations.ts` instead.
 */

export type AvailabilityStatus = 'available' | 'partial' | 'unavailable';

/** Age of the *content*, which is only knowable where upstream stamps it. */
export type FreshnessStatus = 'fresh' | 'warning' | 'stale' | 'unknown';

/** How the value in front of the user reached it. */
export type DeliveryStatus = 'network' | 'cache' | 'stale-cache' | 'unknown';

/**
 * Four different clocks that are routinely confused. Every field is optional
 * except `observedAt` because absent stays absent — a missing upstream stamp
 * must never be back-filled from a fetch time.
 */
export interface DataTimestamps {
  /** Upstream's own "this content was updated at" value. Only items/prices and
   * Tarkov Live have one; every other domain must leave this undefined. */
  sourceUpdatedAt?: string;
  /** When this server instance last completed a successful fetch. Never a
   * content age. */
  fetchedAt?: string;
  /** When the currently-served value entered this instance's memory cache. */
  cacheStoredAt?: string;
  /** When the state was evaluated (render time). */
  observedAt: string;
}

export interface DataHealth {
  domain: DataDomainId;
  availability: AvailabilityStatus;
  freshness: FreshnessStatus;
  delivery: DeliveryStatus;
  timestamps: DataTimestamps;
  totalCount?: number;
  staleCount?: number;
  missingCount?: number;
  retryable: boolean;
  /** Message key under the `status` namespace. Never a raw error string. */
  publicMessageKey?: string;
  /** Coarse classification for logs/diagnostics. Never rendered. */
  internalErrorCode?: string;
}

/** The single word a badge shows. Ordered by the precedence used below. */
export type DataStatusSummary =
  | 'unavailable'
  | 'previous'
  | 'partial'
  | 'stale'
  | 'delayed'
  | 'unknownAge'
  | 'ok';

/**
 * Reduce the three axes to one label. Severity order is deliberate:
 * "cannot show" beats "showing the previous copy" beats "some of it is
 * missing" beats "the content is old" beats "the content is getting old"
 * beats "we cannot tell how old it is". Only when every axis is clean does
 * this say ok.
 */
export function summarizeHealth(health: DataHealth): DataStatusSummary {
  if (health.availability === 'unavailable') return 'unavailable';
  if (health.delivery === 'stale-cache') return 'previous';
  if (health.availability === 'partial') return 'partial';
  if (health.freshness === 'stale') return 'stale';
  if (health.freshness === 'warning') return 'delayed';
  if (health.freshness === 'unknown') return 'unknownAge';
  return 'ok';
}

/** The worst summary across several domains, for a combined page badge. */
const SUMMARY_ORDER: DataStatusSummary[] = [
  'unavailable',
  'previous',
  'partial',
  'stale',
  'delayed',
  'unknownAge',
  'ok',
];

export function worstSummary(summaries: DataStatusSummary[]): DataStatusSummary {
  for (const candidate of SUMMARY_ORDER) {
    if (summaries.includes(candidate)) return candidate;
  }
  return 'ok';
}

/** A clock skew this side of which a "future" timestamp is just skew. Beyond
 * it the value is not trustworthy as an age, so it reports `unknown` rather
 * than a negative one. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Content age from an upstream timestamp. Returns `unknown` — never a guess —
 * when there is no timestamp, it does not parse, it is implausibly in the
 * future, or the domain has no thresholds to judge it against.
 */
export function contentFreshness({
  sourceUpdatedAt,
  warningAfterMs,
  staleAfterMs,
  now,
}: {
  sourceUpdatedAt?: string | null;
  warningAfterMs?: number;
  staleAfterMs?: number;
  now: number;
}): FreshnessStatus {
  if (!sourceUpdatedAt) return 'unknown';
  if (warningAfterMs == null || staleAfterMs == null) return 'unknown';
  const parsed = Date.parse(sourceUpdatedAt);
  if (!Number.isFinite(parsed)) return 'unknown';
  const age = now - parsed;
  if (age < -FUTURE_TOLERANCE_MS) return 'unknown';
  if (age >= staleAfterMs) return 'stale';
  if (age >= warningAfterMs) return 'warning';
  return 'fresh';
}

// ---------------------------------------------------------------------------
// Domain registry — static documentation, not runtime state.
// ---------------------------------------------------------------------------

export type DataDomainId =
  | 'itemPrices'
  | 'traderPrices'
  | 'crafts'
  | 'barters'
  | 'quests'
  | 'ammunition'
  | 'armor'
  | 'maps'
  | 'bosses'
  | 'gunsmith'
  | 'news'
  | 'events';

export interface DataDomainPolicy {
  id: DataDomainId;
  /** Key under `status.domain.*`. */
  displayNameKey: string;
  provider: string;
  sourceUrl?: string;
  /** Key under `status.cachePolicy.*` — the policy is rendered as translated
   * prose, never as a raw TTL that could read as an observation. */
  cachePolicyKey: string;
  /** Key under `status.fallback.*`. */
  fallbackBehaviorKey: string;
  /**
   * True only where upstream actually stamps the content. Everything else
   * reports `unknown` content age forever; no cache TTL is ever promoted into
   * a content-refresh claim.
   */
  supportsSourceTimestamp: boolean;
  /** Only meaningful when `supportsSourceTimestamp` is true. */
  warningAfterMs?: number;
  staleAfterMs?: number;
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const TARKOV_JSON = 'json.tarkov.dev';
const TARKOV_JSON_URL = 'https://json.tarkov.dev';

/**
 * Price thresholds come from the flea market's own existing constant
 * (`MARKET_PRICE_STALE_HOURS = 24` in `market-items-query.ts`) and the 12-hour
 * warning the items header already used, not from a new invented policy.
 *
 * Every other json.tarkov.dev domain has `supportsSourceTimestamp: false`
 * because the audited documents carry no content timestamp at all — see
 * docs/architecture/tarkovdex-data-flow.md §5.
 */
export const DATA_DOMAINS: DataDomainPolicy[] = [
  {
    id: 'itemPrices',
    displayNameKey: 'domain.itemPrices',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.price',
    fallbackBehaviorKey: 'fallback.priceStale',
    supportsSourceTimestamp: true,
    warningAfterMs: 12 * HOUR,
    staleAfterMs: 24 * HOUR,
  },
  {
    id: 'traderPrices',
    displayNameKey: 'domain.traderPrices',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.structural',
    fallbackBehaviorKey: 'fallback.structuralStale',
    supportsSourceTimestamp: false,
  },
  {
    id: 'crafts',
    displayNameKey: 'domain.crafts',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.price',
    fallbackBehaviorKey: 'fallback.priceStale',
    // The craft itself has no stamp; its component item prices do, and
    // `EconomyDataset.sourceUpdatedAt` carries the newest of those.
    supportsSourceTimestamp: true,
    warningAfterMs: 12 * HOUR,
    staleAfterMs: 24 * HOUR,
  },
  {
    id: 'barters',
    displayNameKey: 'domain.barters',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.price',
    fallbackBehaviorKey: 'fallback.priceStale',
    supportsSourceTimestamp: true,
    warningAfterMs: 12 * HOUR,
    staleAfterMs: 24 * HOUR,
  },
  {
    id: 'quests',
    displayNameKey: 'domain.quests',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.structural',
    fallbackBehaviorKey: 'fallback.structuralStale',
    supportsSourceTimestamp: false,
  },
  {
    id: 'ammunition',
    displayNameKey: 'domain.ammunition',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.price',
    fallbackBehaviorKey: 'fallback.priceStale',
    // Ballistic stats ride the items document but the combat DTOs deliberately
    // carry no price and therefore no `updated` field to report.
    supportsSourceTimestamp: false,
  },
  {
    id: 'armor',
    displayNameKey: 'domain.armor',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.price',
    fallbackBehaviorKey: 'fallback.priceStale',
    supportsSourceTimestamp: false,
  },
  {
    id: 'maps',
    displayNameKey: 'domain.maps',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.structural',
    fallbackBehaviorKey: 'fallback.structuralStale',
    supportsSourceTimestamp: false,
  },
  {
    id: 'bosses',
    displayNameKey: 'domain.bosses',
    provider: TARKOV_JSON,
    sourceUrl: TARKOV_JSON_URL,
    cachePolicyKey: 'cachePolicy.structural',
    fallbackBehaviorKey: 'fallback.structuralStale',
    supportsSourceTimestamp: false,
  },
  {
    id: 'gunsmith',
    displayNameKey: 'domain.gunsmith',
    provider: 'TarkovDex + json.tarkov.dev',
    cachePolicyKey: 'cachePolicy.artifact',
    fallbackBehaviorKey: 'fallback.artifact',
    // `src/lib/gunsmith-builds.json` is a committed offline solver artifact and
    // carries no generated-at field, so its own age is genuinely unknowable
    // until the generator writes one. Reporting anything else would be a guess.
    supportsSourceTimestamp: false,
  },
  {
    id: 'news',
    displayNameKey: 'domain.news',
    provider: 'Steam / X / TarkovDex',
    cachePolicyKey: 'cachePolicy.live',
    fallbackBehaviorKey: 'fallback.live',
    supportsSourceTimestamp: true,
    // Align with the ~5-minute GitHub Actions scheduler + 20-minute stale gate.
    warningAfterMs: 10 * MINUTE,
    staleAfterMs: 20 * MINUTE,
  },
  {
    id: 'events',
    displayNameKey: 'domain.events',
    provider: 'Steam / X / TarkovDex',
    cachePolicyKey: 'cachePolicy.live',
    fallbackBehaviorKey: 'fallback.live',
    supportsSourceTimestamp: true,
    warningAfterMs: 10 * MINUTE,
    staleAfterMs: 20 * MINUTE,
  },
];

const DOMAIN_BY_ID = new Map(DATA_DOMAINS.map((policy) => [policy.id, policy]));

export function domainPolicy(id: DataDomainId): DataDomainPolicy {
  const policy = DOMAIN_BY_ID.get(id);
  if (!policy) throw new Error(`unknown data domain: ${id}`);
  return policy;
}

/**
 * Project Tarkov Live's own, older freshness model onto this one rather than
 * replacing it — `FeedFreshness` is load-bearing on the news board and has its
 * own tests, so this is an adapter, not a migration.
 */
export function availabilityFromFeedFreshness(
  freshness: 'ok' | 'partial' | 'stale' | 'down' | 'never' | 'unmanaged',
): AvailabilityStatus {
  if (freshness === 'down') return 'unavailable';
  if (freshness === 'partial') return 'partial';
  return 'available';
}
