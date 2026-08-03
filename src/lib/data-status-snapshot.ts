import 'server-only';
import type { Locale } from '@/i18n/routing';
import { fetchTarkovJson } from '@/lib/tarkov';
import {
  DATA_DOMAINS,
  contentFreshness,
  domainPolicy,
  type AvailabilityStatus,
  type DataDomainId,
  type DataTimestamps,
  type DeliveryStatus,
  type FreshnessStatus,
} from '@/lib/data-status';
import {
  cachePathsForDomain,
  readFetchObservation,
  type FetchObservation,
} from '@/lib/data-observations';

/**
 * What `/status` can actually establish about one domain, on this instance, now.
 *
 * Deliberately not `DataHealth`: `availability` is nullable here because
 * "nothing has been observed on this instance" is a real third answer, and the
 * page used to render that absence inside its Availability row — so a missing
 * per-instance record read as an availability verdict. The two are separate
 * fields now, and `observed` is what the delivery-observation row reports.
 */
export interface DomainStatus {
  domain: DataDomainId;
  /** Null when this instance has observed nothing to judge availability by. */
  availability: AvailabilityStatus | null;
  freshness: FreshnessStatus;
  delivery: DeliveryStatus;
  timestamps: DataTimestamps;
  retryable: boolean;
  internalErrorCode?: string;
  /** True when at least one fetch observation for this domain exists here. */
  observed: boolean;
}

/** Resolves the upstream content stamp shared by the price-backed domains.
 * Injected so tests never touch the network. */
export type PriceSourceLoader = () => Promise<string | null>;

/**
 * The three domains whose content age is genuinely knowable: they all read the
 * same items document, whose records carry an `updated` field. Every other
 * json.tarkov.dev document has no content stamp at all, and a cache TTL must
 * never be promoted into one — see docs/architecture/tarkovdex-data-flow.md §5.
 */
const PRICE_BACKED: readonly DataDomainId[] = ['itemPrices', 'crafts', 'barters'];

const DEFAULT_SNAPSHOT_MODE = 'regular';

interface RawPriceDoc {
  data?: { items?: Record<string, { updated?: unknown }> };
}

/**
 * One document, one mode. This is the same `/regular/items` path `/economy/items`
 * already warms, so on a normal instance this resolves from the existing
 * 15-minute runtime cache rather than a new download.
 */
async function loadPriceSourceUpdatedAtFromItems(): Promise<string | null> {
  const doc = await fetchTarkovJson<RawPriceDoc>(
    `/${DEFAULT_SNAPSHOT_MODE}/items`,
  );
  let newest = 0;
  let value: string | null = null;
  for (const raw of Object.values(doc.data?.items ?? {})) {
    if (typeof raw?.updated !== 'string') continue;
    const time = Date.parse(raw.updated);
    if (Number.isFinite(time) && time > newest) {
      newest = time;
      value = raw.updated;
    }
  }
  return value;
}

function observationsFor(
  domain: DataDomainId,
  locale: Locale,
): FetchObservation[] {
  return (['regular', 'pve'] as const)
    .flatMap((gameMode) => cachePathsForDomain(domain, gameMode, locale))
    .map(readFetchObservation)
    .filter((record): record is FetchObservation => record !== null);
}

/**
 * `available` means every observation this instance holds for the domain
 * succeeded — not that every possible path has been observed. An unobserved
 * path is unknown, never a failure, so a domain nobody has loaded yet reports
 * `null` rather than `unavailable`.
 */
function availabilityOf(records: FetchObservation[]): AvailabilityStatus | null {
  if (records.length === 0) return null;
  const successes = records.filter((record) => record.lastSuccessAt != null);
  if (successes.length === 0) return 'unavailable';
  return successes.length === records.length ? 'available' : 'partial';
}

function deliveryOf(records: FetchObservation[]): DeliveryStatus {
  if (records.some((record) => record.servedStale)) return 'stale-cache';
  if (records.some((record) => record.lastServedFrom === 'network')) return 'network';
  if (records.some((record) => record.lastServedFrom === 'cache')) return 'cache';
  return 'unknown';
}

function statusFor({
  domain,
  locale,
  now,
  sourceUpdatedAt,
}: {
  domain: DataDomainId;
  locale: Locale;
  now: number;
  sourceUpdatedAt: string | null;
}): DomainStatus {
  const policy = domainPolicy(domain);
  const records = observationsFor(domain, locale);
  const successes = records
    .map((record) => record.lastSuccessAt)
    .filter((value): value is number => value != null);
  const failed = records.find((record) => record.errorCode !== null);
  // Priority: a real upstream stamp, then this instance's observation, then
  // unknown. The two kinds never substitute for each other — a fetch time is
  // never reported as a content age, so `sourceUpdatedAt` stays absent when
  // only an observation exists.
  const stamp = policy.supportsSourceTimestamp ? sourceUpdatedAt : null;

  return {
    domain,
    availability: availabilityOf(records),
    freshness: stamp
      ? contentFreshness({
          sourceUpdatedAt: stamp,
          warningAfterMs: policy.warningAfterMs,
          staleAfterMs: policy.staleAfterMs,
          now,
        })
      : 'unknown',
    delivery: deliveryOf(records),
    timestamps: {
      ...(stamp ? { sourceUpdatedAt: stamp } : {}),
      ...(successes.length
        ? { fetchedAt: new Date(Math.min(...successes)).toISOString() }
        : {}),
      observedAt: new Date(now).toISOString(),
    },
    retryable: failed?.retryable ?? true,
    ...(failed?.errorCode ? { internalErrorCode: failed.errorCode } : {}),
    observed: records.length > 0,
  };
}

/**
 * Status for every json.tarkov.dev domain. Tarkov Live's two domains are not
 * included: their state is stored deployment-wide rather than per instance, so
 * the page builds those from the feed itself.
 *
 * Bounded on purpose — at most one document read, shared by three domains, and
 * isolated in its own `try/catch`. A failure there costs those three cards
 * their content age and nothing else; it can never fail the page.
 */
export async function getDomainStatusSnapshot({
  locale,
  now = Date.now(),
  loadPriceSourceUpdatedAt = loadPriceSourceUpdatedAtFromItems,
}: {
  locale: Locale;
  now?: number;
  loadPriceSourceUpdatedAt?: PriceSourceLoader;
}): Promise<Map<DataDomainId, DomainStatus>> {
  let priceSourceUpdatedAt: string | null = null;
  try {
    priceSourceUpdatedAt = await loadPriceSourceUpdatedAt();
  } catch {
    // Leaves the price-backed cards reporting an unknown content age, which is
    // exactly what is true when the document could not be read.
  }

  const snapshot = new Map<DataDomainId, DomainStatus>();
  for (const policy of DATA_DOMAINS) {
    if (policy.id === 'news' || policy.id === 'events') continue;
    snapshot.set(
      policy.id,
      statusFor({
        domain: policy.id,
        locale,
        now,
        sourceUpdatedAt: PRICE_BACKED.includes(policy.id)
          ? priceSourceUpdatedAt
          : null,
      }),
    );
  }
  return snapshot;
}
