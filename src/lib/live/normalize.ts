import type {
  AffectedArea,
  LiveEntry,
  LiveGameMode,
  NewsCategory,
  NewsSource,
  ReliabilityLevel,
  ReviewStatus,
} from '@/types/live';
import { SOURCE_PRIORITY } from './status';

/**
 * Source-agnostic normalization: raw adapter output -> `LiveEntry`, plus the
 * dedup/merge pass that collapses the same announcement published to Steam,
 * X and Telegram into one card.
 *
 * Everything here is pure and rule-based on purpose. Classification by
 * keyword is dumb but auditable; an LLM classifier would be one more thing
 * that can hallucinate an event into existence. The LLM layer
 * (`interpret.ts`) only ever *adds* prose to an already-classified entry.
 */

/** Raw shape an adapter returns. Everything derived (category, reliability,
 * hash, review status) is computed here, not by the adapter. */
export interface RawPost {
  source: NewsSource;
  account: string | null;
  postId: string;
  url: string | null;
  title: string;
  content: string;
  publishedAt: string;
  imageUrl?: string | null;
  youtubeVideoId?: string | null;
  /** Pre-translated display text, when the source pipeline already has one
   * (Steam posts reuse the existing committed ko/zh translations). */
  translated?: { title: string; content: string } | null;
  /**
   * Whether the **body** is genuinely translated, independent of the title.
   *
   * Some committed entries carry a reviewed Korean/Chinese title over a body
   * that is still the English original. Reporting those as translated is what
   * suppressed the untranslated notice on `/zh/news`, so the flag the UI reads
   * is derived from the content alone. Absent means "same as `translated`".
   */
  contentTranslated?: boolean;
  /** Manual-store overrides. Nothing else may set these. */
  overrides?: Partial<LiveEntry> | null;
}

/** FNV-1a over the normalized text. Not crypto — this is a dedup key, and a
 * non-`node:crypto` hash keeps this module importable from client code. */
export function contentHash(text: string): string {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Ordered — first match wins, so "Patch 1.2.3" never falls through to the
 * broader event keywords. */
const CATEGORY_RULES: Array<[NewsCategory, RegExp]> = [
  ['patch', /^patch\s+[\d.]|patch\s+notes|hotfix/i],
  ['maintenance', /maintenance|technical work|servers? will be (?:down|unavailable|shut)|downtime/i],
  ['server_status', /ddos|server (?:issues|instability|problems|status)|connection (?:issues|problems)|rollback/i],
  ['sale', /\bsale\b|discount|% off|special offer/i],
  [
    'event',
    /\bevent\b|double (?:xp|experience|loot)|increased (?:spawn|loot|experience|xp)|boosted|halloween|christmas|new year|anniversary/i,
  ],
  ['announcement', /announce|wipe|release|available now|coming soon|update/i],
];

export function classify(source: NewsSource, title: string, content: string): NewsCategory {
  if (source === 'nikita_x') return 'developer_comment';
  const text = `${title}\n${content}`;
  for (const [category, pattern] of CATEGORY_RULES) {
    if (pattern.test(text)) return category;
  }
  return source === 'manual' ? 'unknown' : 'community';
}

/**
 * Source trust, *not* content trust — kept separate from `reviewStatus` on
 * purpose (see CLAUDE.md). A joke or a teaser from the official account is
 * still an official statement; it just isn't a confirmed fact, which is what
 * the review status decides.
 */
export function reliabilityFor(source: NewsSource, category: NewsCategory): ReliabilityLevel {
  switch (source) {
    case 'steam':
    case 'official_website':
      return 'official_confirmed';
    case 'official_x':
    case 'official_telegram':
      // A patch/maintenance notice on an official channel is a fact; anything
      // else there (teasers, images, one-liners) is a statement, not a
      // confirmation.
      return category === 'patch' || category === 'maintenance' || category === 'server_status'
        ? 'official_confirmed'
        : 'official_statement';
    case 'nikita_x':
      return 'developer_hint';
    case 'manual':
      return 'tarkovdex_inference';
  }
}

/** Committed manual entries are already reviewed. Timeless official Steam /
 * website posts Stage-1 auto-publish so Latest News is not empty while an
 * operator is offline. Everything else waits in the private queue. */
export function decideReview(
  reliability: ReliabilityLevel,
  hasWindow: boolean,
  manual: boolean,
  source?: NewsSource,
): ReviewStatus {
  if (manual) return 'reviewed';
  if (
    (source === 'steam' || source === 'official_website') &&
    reliability === 'official_confirmed' &&
    !hasWindow
  ) {
    return 'auto_published';
  }
  return 'pending_review';
}

const MODE_RULES: Array<[LiveGameMode, RegExp]> = [
  ['arena', /\barena\b/i],
  ['pve', /\bpve\b|co-?op/i],
  ['pvp', /\bpvp\b/i],
];

/** Only ever reports modes the text actually names — never a default guess. */
export function detectModes(title: string, content: string): LiveGameMode[] {
  const text = `${title}\n${content}`;
  const modes = MODE_RULES.filter(([, pattern]) => pattern.test(text)).map(([mode]) => mode);
  return modes.length > 0 ? modes : ['unknown'];
}

const AFFECT_RULES: Array<[AffectedArea, RegExp]> = [
  ['xp', /\b(xp|experience|skill gain)\b/i],
  ['boss', /\bboss(es)?\b|killa|tagilla|reshala|glukhar|shturman|sanitar|kaban|kollontay|partisan|cultist/i],
  ['map', /\bmap(s)?\b|customs|factory|woods|shoreline|reserve|interchange|lighthouse|streets|ground zero|labs?\b/i],
  ['quest', /\bquest(s)?\b|\btask(s)?\b/i],
  ['trader', /\btrader(s)?\b|prapor|therapist|fence|skier|peacekeeper|mechanic|ragman|jaeger|\bref\b/i],
  ['item', /\bitem(s)?\b|loot|weapon|ammo|armor/i],
  ['spawn', /\bspawn(s|ed|ing|rate)?\b/i],
  ['server', /\bserver(s)?\b|matchmaking|queue/i],
];

export function detectAffects(title: string, content: string): AffectedArea[] {
  const text = `${title}\n${content}`;
  return AFFECT_RULES.filter(([, pattern]) => pattern.test(text)).map(([area]) => area);
}

/** Adapter output -> full entry. `collectedAt`/`lastCheckedAt` are injected
 * rather than read from the clock so this stays pure and testable. */
export function toLiveEntry(post: RawPost, now: string): LiveEntry {
  const overrides = post.overrides ?? {};
  const manualFields = Object.keys(overrides);
  const category = (overrides.category as NewsCategory | undefined) ?? classify(post.source, post.title, post.content);
  const reliability =
    (overrides.reliability as ReliabilityLevel | undefined) ?? reliabilityFor(post.source, category);
  const startsAt = overrides.startsAt ?? null;
  const endsAt = overrides.endsAt ?? null;

  const entry: LiveEntry = {
    id: `${post.source}:${post.postId}`,
    source: post.source,
    account: post.account,
    sourcePostId: post.postId,
    url: post.url,
    title: post.translated?.title ?? post.title,
    content: post.translated?.content ?? post.content,
    originalTitle: post.title,
    originalContent: post.content,
    translated: post.contentTranslated ?? Boolean(post.translated),
    summary: null,
    playerImpact: null,
    recommendedAction: null,
    category,
    reliability,
    reviewStatus: decideReview(reliability, Boolean(startsAt || endsAt), manualFields.length > 0, post.source),
    gameModes: detectModes(post.title, post.content),
    affects: detectAffects(post.title, post.content),
    maps: [],
    bosses: [],
    traders: [],
    items: [],
    quests: [],
    tags: [],
    startsAt,
    endsAt,
    publishedAt: post.publishedAt,
    collectedAt: now,
    lastCheckedAt: now,
    imageUrl: post.imageUrl ?? null,
    youtubeVideoId: post.youtubeVideoId ?? null,
    contentHash: contentHash(`${post.title} ${post.content}`),
    manualFields,
    interpretation: null,
    confirmations: [],
  };

  // Human values win over every derived one, and `manualFields` records which
  // so a later re-collection can't quietly overwrite them.
  return { ...entry, ...overrides, manualFields };
}

/** Cheap title similarity for the "same announcement, different wording"
 * case — token overlap, no dependency, no fuzzy-match library. */
export function titleSimilarity(a: string, b: string): number {
  const tokens = (value: string) =>
    new Set(
      value
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(' ')
        .filter((token) => token.length > 2),
    );
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.min(left.size, right.size);
}

export const NEAR_DUPLICATE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const TITLE_SIMILARITY_THRESHOLD = 0.6;

function sameAnnouncement(a: LiveEntry, b: LiveEntry): boolean {
  if (a.id === b.id) return true;
  if (a.url && b.url && a.url === b.url) return true;
  if (a.contentHash === b.contentHash) return true;
  const gap = Math.abs(new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  return (
    Number.isFinite(gap) &&
    gap <= NEAR_DUPLICATE_WINDOW_MS &&
    titleSimilarity(a.originalTitle, b.originalTitle) >= TITLE_SIMILARITY_THRESHOLD
  );
}

function sourceRef(entry: LiveEntry) {
  return {
    source: entry.source,
    account: entry.account,
    postId: entry.sourcePostId,
    url: entry.url ?? '',
    publishedAt: entry.publishedAt,
  };
}

/**
 * Collapse duplicates into one card per announcement.
 *
 * The winner is the highest-priority source (official patch note over a tweet
 * over a dev aside), but the *union* of what everyone said is kept: any
 * confirmed event window, the best available reliability, the merged
 * affected-area list, and every source as a "also reported by" reference. A
 * later official post can therefore end an event that an earlier post
 * started, which is the one case where recency beats source priority.
 */
export function mergeEntries(entries: LiveEntry[]): LiveEntry[] {
  const merged: LiveEntry[] = [];

  for (const entry of entries) {
    const existing = merged.find((candidate) => sameAnnouncement(candidate, entry));
    if (!existing) {
      merged.push({ ...entry });
      continue;
    }

    const [primary, secondary] =
      SOURCE_PRIORITY[entry.source] < SOURCE_PRIORITY[existing.source]
        ? [entry, existing]
        : [existing, entry];

    const confirmations = [...primary.confirmations, ...secondary.confirmations, sourceRef(secondary)]
      .filter(
        (ref, index, all) =>
          ref.source !== primary.source &&
          all.findIndex((other) => other.source === ref.source && other.postId === ref.postId) === index,
      );

    const combined: LiveEntry = {
      ...primary,
      // A confirmed window from any source is better than none; a human-set
      // one always wins (manual is priority 0, so it's already `primary`).
      startsAt: primary.startsAt ?? secondary.startsAt,
      endsAt: primary.endsAt ?? secondary.endsAt,
      affects: [...new Set([...primary.affects, ...secondary.affects])],
      gameModes: [...new Set([...primary.gameModes, ...secondary.gameModes])].filter(
        (mode, _index, all) => mode !== 'unknown' || all.length === 1,
      ),
      // The public profile presentation can carry safe, validated YouTube
      // metadata even when the persisted event is the primary record.
      youtubeVideoId: primary.youtubeVideoId ?? secondary.youtubeVideoId,
      confirmations,
      // Newest sighting wins for freshness reporting.
      lastCheckedAt:
        primary.lastCheckedAt > secondary.lastCheckedAt ? primary.lastCheckedAt : secondary.lastCheckedAt,
    };

    merged[merged.indexOf(existing)] = combined;
  }

  return merged;
}
