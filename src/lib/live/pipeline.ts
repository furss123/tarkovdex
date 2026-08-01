import 'server-only';
import { revalidatePath } from 'next/cache';
import type { AffectedArea, LiveGameMode, NewsSource } from '@/types/live';
import { allCollectors, backoffMs, errorCode, type SourceCollector } from './collectors';
import { liveConfig } from './config';
import { getInterpreter, isInterpretEnabled, PROMPT_VERSION } from './interpret';
import type { EventIntent } from './interpret-schema';
import { classify, detectAffects, detectModes, reliabilityFor } from './normalize';
import { decidePublication, linkPost, type LinkCandidate } from './publish-rules';
import type {
  EventContent,
  LiveEventRow,
  LiveRepository,
  LocalizedText,
  StoredInterpretation,
  StoredRawPost,
} from './repository';

/**
 * The whole background pipeline: collect -> store -> interpret -> classify ->
 * link -> publish -> revalidate. It runs from the authenticated cron endpoint
 * and from the admin's manual buttons, and from nowhere else.
 *
 * Everything is per-source isolated and idempotent. A run that dies halfway
 * leaves stored posts stored, cursors only advanced past posts that were
 * actually written, and the next run picks up where it stopped.
 */

export interface SourceOutcome {
  key: string;
  source: NewsSource;
  ok: boolean;
  skipped: string | null;
  requests: number;
  fetched: number;
  newPosts: number;
  duplicates: number;
  errorCode: string | null;
}

export interface IngestionSummary {
  ok: boolean;
  trigger: string;
  startedAt: string;
  durationMs: number;
  locked: boolean;
  sources: SourceOutcome[];
  interpreted: number;
  interpretFailures: number;
  eventsUpserted: number;
  revalidated: boolean;
  error: string | null;
}

const LOCK_KEY = 'tarkov-live:ingestion';
const LOCALES = ['ko', 'en', 'zh'] as const;

/** Invalidates all three locale pages in one call — they are the same route,
 * so an operator's approval reaches ko, en and zh together. */
export function revalidateNews(): boolean {
  try {
    revalidatePath('/[locale]/news', 'page');
    return true;
  } catch {
    // A failed revalidation is a staleness problem, never a reason to roll back
    // an approval that is already committed. The next scheduled run retries.
    return false;
  }
}

function localizedFromPayload(post: StoredRawPost): Record<string, { title: string; content: string }> {
  const payload = post.payload as { localized?: Record<string, { title: string; content: string }> } | null;
  return payload?.localized ?? {};
}

function buildContent(post: StoredRawPost, interpretation: StoredInterpretation | null): EventContent {
  const localized = localizedFromPayload(post);
  const content: EventContent = { original: { title: post.title, content: post.content } };
  for (const locale of LOCALES) {
    const text = localized[locale];
    const prose = interpretation?.content?.[locale];
    const entry: LocalizedText = {
      title: text?.title ?? post.title,
      content: text?.content ?? post.content,
      translated: Boolean(text) && (text.title !== post.title || text.content !== post.content),
      summary: prose?.summary ?? null,
      playerImpact: prose?.playerImpact ?? null,
      recommendedAction: prose?.recommendedAction ?? null,
    };
    content[locale] = entry;
  }
  return content;
}

function slugFor(post: StoredRawPost): string {
  const base = post.title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return `${base || 'post'}-${post.contentHash}`;
}

/** Fixture posts carry the curated overrides the seed data is meant to
 * demonstrate. Applied only when the event is first created, and only outside
 * production (`liveConfig.fixtures`), so they behave exactly like a human's
 * curation would rather than like an automated claim. */
function fixtureOverrides(post: StoredRawPost): Record<string, unknown> | null {
  const payload = post.payload as { fixture?: boolean; overrides?: Record<string, unknown> } | null;
  if (!payload?.fixture || !payload.overrides) return null;
  return payload.overrides;
}

/**
 * Returns the event this post ended up on, so the caller can add it to the
 * candidate list. Without that, two mirrors of the same announcement collected
 * in the *same* run can't see each other — the first creates an event, the
 * second is compared against a snapshot taken before it existed, and the board
 * shows the announcement twice. Found in a real run, not in review.
 */
async function buildEventForPost(
  repo: LiveRepository,
  post: StoredRawPost,
  candidates: LinkCandidate[],
): Promise<LiveEventRow | null> {
  const interpretation = await repo.getInterpretation(post.id, PROMPT_VERSION);
  const category = classify(post.source, post.title, post.content);
  const reliability = reliabilityFor(post.source, category);
  const intent = (interpretation?.eventIntent as EventIntent | undefined) ?? 'unknown';

  const verdict = linkPost(
    {
      title: post.title,
      contentHash: post.contentHash,
      url: post.url,
      publishedAt: post.publishedAt,
      maps: interpretation?.maps ?? [],
      bosses: interpretation?.bosses ?? [],
      gameModes: interpretation?.gameModes ?? [],
      intent,
    },
    candidates,
  );

  if (verdict.kind === 'same') {
    await repo.linkPostToEvent(verdict.eventId, post.id, verdict.role);
    if (verdict.role === 'end') {
      // An end notice that matched exactly still goes to a human before the
      // board says an event is over — matching text is not a schedule.
      await repo.updateEventFields(
        verdict.eventId,
        { reviewStatus: 'pending_review', reviewNote: `end_notice:${post.id}` },
        { manual: false, actor: 'pipeline' },
      );
    }
    return null;
  }

  const startsAt = interpretation?.startsAt ?? null;
  const endsAt = interpretation?.endsAt ?? null;
  const claimedWindow = Boolean(startsAt || endsAt || interpretation?.startsAtEvidence || interpretation?.endsAtEvidence);
  const windowEvidenced =
    (!interpretation?.startsAtEvidence || Boolean(startsAt)) &&
    (!interpretation?.endsAtEvidence || Boolean(endsAt));

  const decision = decidePublication({
    source: post.source,
    reliability,
    category,
    intent,
    hasWindow: claimedWindow,
    windowEvidenced,
    requiresReview: interpretation?.requiresReview ?? false,
    interpreted: interpretation != null,
  });

  const suggestion = verdict.kind === 'review' ? verdict : null;
  const gameModes = (interpretation?.gameModes?.length
    ? interpretation.gameModes
    : detectModes(post.title, post.content)) as LiveGameMode[];

  const event = await repo.createOrUpdateEvent({
    id: post.id,
    slug: slugFor(post),
    category,
    reliability,
    reviewStatus: suggestion ? 'pending_review' : decision.reviewStatus,
    gameModes,
    affects: detectAffects(post.title, post.content) as AffectedArea[],
    maps: interpretation?.maps ?? [],
    bosses: interpretation?.bosses ?? [],
    traders: interpretation?.traders ?? [],
    items: interpretation?.items ?? [],
    quests: interpretation?.quests ?? [],
    startsAt,
    endsAt,
    endConfirmed: Boolean(endsAt),
    content: buildContent(post, interpretation),
    primaryPostId: post.id,
    publishedAt: decision.reviewStatus === 'auto_published' && !suggestion ? new Date().toISOString() : null,
  });
  await repo.linkPostToEvent(event.id, post.id, 'initial');

  const note = suggestion
    ? `link_candidate:${suggestion.eventId}:${suggestion.role}`
    : decision.reason;
  if (note) {
    await repo.updateEventFields(event.id, { reviewNote: note }, { manual: false, actor: 'pipeline' });
  }

  const overrides = fixtureOverrides(post);
  if (overrides) {
    await repo.updateEventFields(event.id, overrides, { manual: true, actor: 'fixtures', note: 'seed' });
  }

  return repo.getEvent(event.id);
}

function toCandidate(event: LiveEventRow): LinkCandidate {
  return {
    id: event.id,
    title: event.content.original?.title ?? '',
    contentHashes: event.sources.map((source) => source.contentHash).filter(Boolean),
    urls: event.sources.map((source) => source.url).filter((url): url is string => Boolean(url)),
    publishedAt: event.postedAt,
    maps: event.maps ?? [],
    bosses: event.bosses ?? [],
    gameModes: event.gameModes,
  };
}

async function candidateEvents(repo: LiveRepository): Promise<LinkCandidate[]> {
  return (await repo.listEvents({ limit: 60 })).map(toCandidate);
}

/** Interpretation, bounded three ways: only unprocessed posts, only
 * `LIVE_INTERPRET_MAX_ITEMS` of them, and only until the run's own deadline.
 * A failure is recorded against the post and retried on a later run — never
 * cached as a success, the bug this project has already fixed twice. */
async function interpretPending(
  repo: LiveRepository,
  deadline: number,
): Promise<{ interpreted: number; failures: number }> {
  if (!isInterpretEnabled()) return { interpreted: 0, failures: 0 };

  const interpreter = getInterpreter();
  const pending = await repo.getPendingInterpretations(liveConfig.interpret.maxItems);
  const openEvents = (await repo.listEvents({ limit: 20 })).map((event) => event.content.original?.title ?? '');

  let interpreted = 0;
  let failures = 0;
  for (const post of pending) {
    if (Date.now() > deadline) break;
    try {
      const envelope = await interpreter.interpret({
        id: post.id,
        source: post.source,
        account: post.account || null,
        title: post.title,
        content: post.content,
        publishedAt: post.publishedAt,
        url: post.url,
        category: classify(post.source, post.title, post.content),
        openEvents,
      });
      await repo.saveInterpretation({
        rawPostId: post.id,
        provider: interpreter.provider,
        model: interpreter.model,
        promptVersion: interpreter.promptVersion,
        schemaVersion: interpreter.schemaVersion,
        content: envelope.locales,
        gameModes: envelope.gameModes,
        category: null,
        eventIntent: envelope.eventIntent,
        maps: envelope.maps,
        bosses: envelope.bosses,
        traders: envelope.traders,
        items: envelope.items,
        quests: envelope.quests,
        startsAt: envelope.startsAt.value,
        startsAtEvidence: envelope.startsAt.evidenceText,
        endsAt: envelope.endsAt.value,
        endsAtEvidence: envelope.endsAt.evidenceText,
        reliabilitySuggestion: envelope.reliabilitySuggestion,
        requiresReview: envelope.requiresReview,
        reviewReason: envelope.reviewReason,
        ambiguity: envelope.ambiguity,
      });
      await repo.setInterpretStatus(post.id, 'done');
      interpreted += 1;
    } catch (error) {
      failures += 1;
      await repo.setInterpretStatus(post.id, 'failed', errorCode(error));
    }
  }
  return { interpreted, failures };
}

async function runCollector(
  repo: LiveRepository,
  collector: SourceCollector,
  trigger: string,
): Promise<SourceOutcome> {
  const outcome: SourceOutcome = {
    key: collector.key,
    source: collector.source,
    ok: true,
    skipped: null,
    requests: 0,
    fetched: 0,
    newPosts: 0,
    duplicates: 0,
    errorCode: null,
  };

  if (!collector.enabled()) {
    outcome.skipped = 'disabled';
    return outcome;
  }

  const state = await repo.getSourceState(collector.key);
  const runId = await repo.startRun(collector.key, trigger);
  const startedAt = Date.now();

  try {
    await repo.saveSourceState({
      sourceKey: collector.key,
      sourceType: collector.source,
      account: collector.account,
      lastAttemptAt: new Date().toISOString(),
    });

    const result = await collector.collect(state);
    outcome.requests = result.requests;
    outcome.fetched = result.posts.length;

    if (result.skipped) {
      outcome.skipped = result.skipped;
    } else {
      for (const post of result.posts) {
        const stored = await repo.upsertRawPost(post);
        if (stored.inserted) outcome.newPosts += 1;
        else outcome.duplicates += 1;
      }
      // The cursor moves only now, after every post is durably stored — a crash
      // mid-write costs a re-read, never a skipped announcement.
      await repo.saveSourceState({
        sourceKey: collector.key,
        sourceType: collector.source,
        account: collector.account,
        // Recorded here rather than left to each collector: freshness is
        // computed from this column, so a collector that forgets it would make
        // the whole board look like it had never been checked.
        lastSuccessAt: new Date().toISOString(),
        ...result.nextState,
        lastError: null,
        lastErrorAt: null,
        consecutiveFailures: 0,
        nextRetryAt: null,
      });
    }

    await repo.finishRun(runId, {
      ok: true,
      requests: outcome.requests,
      fetched: outcome.fetched,
      newPosts: outcome.newPosts,
      duplicates: outcome.duplicates,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    outcome.ok = false;
    outcome.errorCode = errorCode(error);
    const failures = (state?.consecutiveFailures ?? 0) + 1;
    await repo.saveSourceState({
      sourceKey: collector.key,
      sourceType: collector.source,
      account: collector.account,
      lastError: outcome.errorCode,
      lastErrorAt: new Date().toISOString(),
      consecutiveFailures: failures,
      nextRetryAt: new Date(Date.now() + backoffMs(failures, error)).toISOString(),
    });
    await repo.finishRun(runId, {
      ok: false,
      requests: outcome.requests,
      errorCode: outcome.errorCode,
      // Only a classified code is stored — an upstream message can echo request
      // details, and this string is shown in the admin UI.
      errorMessage: outcome.errorCode,
      durationMs: Date.now() - startedAt,
    });
  }

  return outcome;
}

export async function runIngestion(
  repo: LiveRepository,
  options: {
    trigger: string;
    only?: string[];
    holder?: string;
    /** Injected by the test suite so a real run — locking, cursors, dedup,
     * event building — can be exercised without touching Steam or X. */
    collectors?: SourceCollector[];
  } = { trigger: 'cron' },
): Promise<IngestionSummary> {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const deadline = started + liveConfig.ingestion.maxRunMs;
  const holder = options.holder ?? `run-${started}`;

  const summary: IngestionSummary = {
    ok: false,
    trigger: options.trigger,
    startedAt,
    durationMs: 0,
    locked: false,
    sources: [],
    interpreted: 0,
    interpretFailures: 0,
    eventsUpserted: 0,
    revalidated: false,
    error: null,
  };

  await repo.migrate();

  // Cross-instance, expiring. A module-scope boolean would only stop a second
  // run inside the same runtime, and Vercel happily runs two.
  if (!(await repo.acquireLock(LOCK_KEY, liveConfig.ingestion.maxRunMs + 30_000, holder))) {
    summary.locked = true;
    summary.error = 'already_running';
    summary.durationMs = Date.now() - started;
    return summary;
  }

  try {
    const collectors = (options.collectors ?? allCollectors()).filter(
      (collector) => !options.only?.length || options.only.includes(collector.key),
    );
    for (const collector of collectors) {
      summary.sources.push(await runCollector(repo, collector, options.trigger));
      if (Date.now() > deadline) break;
    }

    const interpretation = await interpretPending(repo, deadline);
    summary.interpreted = interpretation.interpreted;
    summary.interpretFailures = interpretation.failures;

    // Any stored post that isn't on the board yet becomes one (or joins one).
    // Oldest first, so an announcement's original post creates the event and
    // later mirrors attach to it rather than the other way round.
    const candidates = await candidateEvents(repo);
    const unlinked = (await repo.listRawPosts(80)).reverse();
    for (const post of unlinked) {
      if (Date.now() > deadline) break;
      if (await repo.findEventIdForPost(post.id)) continue;
      const created = await buildEventForPost(repo, post, candidates);
      if (created) candidates.push(toCandidate(created));
      summary.eventsUpserted += 1;
    }

    summary.ok = summary.sources.every((source) => source.ok);
    summary.revalidated = revalidateNews();
  } catch (error) {
    summary.error = errorCode(error);
  } finally {
    await repo.releaseLock(LOCK_KEY, holder);
    summary.durationMs = Date.now() - started;
  }

  return summary;
}
