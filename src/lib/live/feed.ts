import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { LiveEntry, LiveFeed, LiveSourceHealth, NewsSource } from '@/types/live';
import { collectFrom } from './collect';
import { liveConfig } from './config';
import { freshnessOf } from './feed-freshness';
import { mergeEntries, toLiveEntry } from './normalize';
import { getRepository } from './repository-client';
import type { LiveEventRow, LiveRepository } from './repository';
import { ADAPTERS } from './sources';
import { SOURCE_PRIORITY, sortLiveEntries } from './status';

/**
 * The **read** side, and nothing else.
 *
 * This module talks to the database and to committed files. It does not call X,
 * it does not call Gemini, and it does not collect anything — that is the whole
 * point of the split. Rendering `/ko/news`, `/en/news` and `/zh/news` therefore
 * costs three database reads, not three sets of metered API calls, and a page
 * that nobody visits still gets fresh data because the cron does the work.
 */

/** Page payload ceiling. The board is a situation dashboard, not an archive. */
const MAX_ENTRIES = 40;

function primarySource(event: LiveEventRow): LiveEventRow['sources'][number] | null {
  return (
    [...event.sources].sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source])[0] ?? null
  );
}

function toEntry(event: LiveEventRow, locale: Locale): LiveEntry {
  const text = event.content[locale] ?? {
    title: event.content.original?.title ?? '',
    content: event.content.original?.content ?? '',
    translated: false,
  };
  const primary = primarySource(event);
  const source: NewsSource = primary?.source ?? 'manual';

  return {
    id: event.id,
    source,
    account: primary?.account ?? null,
    sourcePostId: primary?.postId ?? event.id,
    url: primary?.url ?? null,
    title: text.title,
    content: text.content,
    originalTitle: event.content.original?.title ?? text.title,
    originalContent: event.content.original?.content ?? text.content,
    translated: locale === 'en' ? true : Boolean(text.translated),
    summary: text.summary ?? null,
    playerImpact: text.playerImpact ?? null,
    recommendedAction: text.recommendedAction ?? null,
    category: event.category,
    reliability: event.reliability,
    reviewStatus: event.reviewStatus,
    status: event.status,
    gameModes: event.gameModes.length > 0 ? event.gameModes : ['unknown'],
    affects: event.affects,
    maps: event.maps ?? [],
    bosses: event.bosses ?? [],
    traders: event.traders ?? [],
    items: event.items ?? [],
    quests: event.quests ?? [],
    tags: event.tags ?? [],
    startsAt: event.startsAt ?? null,
    endsAt: event.endsAt ?? null,
    publishedAt: event.postedAt,
    collectedAt: event.firstSeenAt,
    lastCheckedAt: event.updatedAt,
    imageUrl: null,
    contentHash: event.slug,
    manualFields: event.manualFields,
    interpretation: null,
    confirmations: event.sources
      .filter((item) => item.postId !== primary?.postId)
      .map((item) => ({
        source: item.source,
        account: item.account,
        postId: item.postId,
        url: item.url ?? '',
        publishedAt: item.publishedAt,
      })),
  };
}

function healthOf(states: Awaited<ReturnType<LiveRepository['listSourceStates']>>): LiveSourceHealth[] {
  return states.map((state) => ({
    key: state.sourceKey,
    source: state.sourceType,
    account: state.account || null,
    enabled: state.active,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorAt: state.lastErrorAt,
    errorCode: state.lastError,
    consecutiveFailures: state.consecutiveFailures,
  }));
}

async function fromDatabase(repo: LiveRepository, locale: Locale): Promise<LiveFeed> {
  const [events, states] = await Promise.all([
    repo.listEvents({ reviewStatus: ['auto_published', 'reviewed', 'pending_review'], limit: 120 }),
    repo.listSourceStates(),
  ]);

  const now = Date.now();
  const sources = healthOf(states);
  const successes = sources
    .map((source) => source.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  const entries = sortLiveEntries(
    events.filter((event) => event.reviewStatus !== 'rejected').map((event) => toEntry(event, locale)),
    now,
  ).slice(0, MAX_ENTRIES);

  return {
    entries,
    degradedSources: [
      ...new Set(sources.filter((source) => source.consecutiveFailures > 0).map((source) => source.source)),
    ],
    lastCheckedAt: successes.at(-1) ?? null,
    renderedAt: new Date(now).toISOString(),
    freshness: freshnessOf(sources, now, liveConfig.ingestion.staleAfterMinutes * 60_000),
    sources,
  };
}

/**
 * No-database path: Steam's feed plus committed files, exactly the board this
 * project had before the storage layer existed. Reported as `unmanaged` so the
 * UI never claims a collection schedule it isn't running.
 */
async function fromFiles(locale: Locale): Promise<LiveFeed> {
  const now = new Date().toISOString();
  const { posts, degraded } = await collectFrom(ADAPTERS, locale);
  const merged = mergeEntries(posts.map((post) => toLiveEntry(post, now)));

  return {
    entries: sortLiveEntries(merged, Date.parse(now)).slice(0, MAX_ENTRIES),
    degradedSources: degraded,
    lastCheckedAt: now,
    renderedAt: now,
    freshness: 'unmanaged',
    sources: [],
  };
}

export async function getLiveFeed(locale: Locale): Promise<LiveFeed> {
  const repo = getRepository();
  if (!repo) return fromFiles(locale);
  try {
    return await fromDatabase(repo, locale);
  } catch {
    // A database outage must not take the news page down with it — fall through
    // to the file-backed board rather than rendering an error state.
    return fromFiles(locale);
  }
}
