import type { NewsCategory, NewsSource, ReliabilityLevel, ReviewStatus } from '@/types/live';
import type { EventIntent } from './interpret-schema';
import { titleSimilarity, NEAR_DUPLICATE_WINDOW_MS, TITLE_SIMILARITY_THRESHOLD } from './normalize';

/**
 * The two decisions a machine is allowed to make on its own: may this be shown
 * as fact, and is this the same thing as something already on the board.
 *
 * Both are pure and rule-based, and both default to "ask a human". The
 * expensive failure here is not a missed post — it is a confident wrong banner
 * saying an event is running when it isn't.
 */

export interface PublicationInput {
  source: NewsSource;
  reliability: ReliabilityLevel;
  category: NewsCategory;
  intent: EventIntent;
  /** A claimed start or end time exists at all. */
  hasWindow: boolean;
  /** Every claimed time came with a quote that really appears in the source. */
  windowEvidenced: boolean;
  /** The interpreter flagged ambiguity. It may set this; it may never clear it. */
  requiresReview: boolean;
  /** False when no interpretation exists (no key, provider down, not yet run).
   * Intent-based rules are skipped then — an absent opinion is not a red flag,
   * and treating it as one would silently empty the board whenever Gemini is
   * unavailable. */
  interpreted: boolean;
}

export interface PublicationDecision {
  reviewStatus: ReviewStatus;
  reason: string | null;
}

/**
 * Conservative review gate. Claimed schedules and ambiguous events still wait
 * for an operator. Stage 1 publishes only timeless, official-confirmed Steam /
 * website posts so Latest News can show verified source text immediately —
 * before optional interpretation finishes.
 */
export function decidePublication(input: PublicationInput): PublicationDecision {
  if (input.source === 'nikita_x') {
    return { reviewStatus: 'pending_review', reason: 'developer_personal_account' };
  }
  if (input.reliability !== 'official_confirmed') {
    return { reviewStatus: 'pending_review', reason: 'not_official_confirmed' };
  }
  if (input.intent === 'teaser') {
    return { reviewStatus: 'pending_review', reason: 'teaser' };
  }
  if (input.interpreted && input.intent === 'unknown' && input.category === 'event') {
    return { reviewStatus: 'pending_review', reason: 'event_intent_unclear' };
  }
  if (input.hasWindow && !input.windowEvidenced) {
    return { reviewStatus: 'pending_review', reason: 'unevidenced_event_window' };
  }
  if (input.requiresReview) {
    return { reviewStatus: 'pending_review', reason: 'interpreter_flagged' };
  }
  if (
    (input.source === 'steam' || input.source === 'official_website') &&
    !input.hasWindow
  ) {
    return { reviewStatus: 'auto_published', reason: 'stage1_official_timeless' };
  }
  return { reviewStatus: 'pending_review', reason: 'operator_approval_required' };
}

export interface LinkCandidate {
  id: string;
  title: string;
  contentHashes: string[];
  urls: string[];
  publishedAt: string;
  maps: string[];
  bosses: string[];
  gameModes: string[];
}

export interface LinkSubject {
  title: string;
  contentHash: string;
  url: string | null;
  publishedAt: string;
  maps: string[];
  bosses: string[];
  gameModes: string[];
  intent: EventIntent;
}

export type LinkVerdict =
  | { kind: 'same'; eventId: string; role: 'confirmation' | 'update' | 'end' }
  | { kind: 'review'; eventId: string; role: 'update' | 'end' }
  | { kind: 'new' };

function overlaps(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a.map((value) => value.toLowerCase()));
  return b.some((value) => set.has(value.toLowerCase()));
}

/**
 * Decide whether a newly collected post belongs to an event already on the
 * board.
 *
 * Certain matches (identical content hash or identical URL) attach silently.
 * A same-subject *end* notice is the case worth being careful about: getting it
 * right ends an event correctly, getting it wrong ends the wrong one, so it
 * only auto-attaches on an exact-content match and otherwise routes to review
 * with the candidate already picked out for the operator.
 */
export function linkPost(subject: LinkSubject, candidates: LinkCandidate[]): LinkVerdict {
  const exact = candidates.find(
    (candidate) =>
      candidate.contentHashes.includes(subject.contentHash) ||
      (subject.url != null && candidate.urls.includes(subject.url)),
  );
  if (exact) {
    return {
      kind: 'same',
      eventId: exact.id,
      role: subject.intent === 'end' ? 'end' : subject.intent === 'update' ? 'update' : 'confirmation',
    };
  }

  const subjectTime = Date.parse(subject.publishedAt);
  const scored = candidates
    .map((candidate) => {
      const gap = Math.abs(subjectTime - Date.parse(candidate.publishedAt));
      const similarity = titleSimilarity(subject.title, candidate.title);
      const entityMatch =
        overlaps(subject.maps, candidate.maps) || overlaps(subject.bosses, candidate.bosses);
      return { candidate, gap, similarity, entityMatch };
    })
    .filter((row) => Number.isFinite(row.gap) && row.gap <= NEAR_DUPLICATE_WINDOW_MS)
    .sort((a, b) => b.similarity - a.similarity)[0];

  if (!scored) return { kind: 'new' };

  if (subject.intent === 'end' || subject.intent === 'update') {
    // Same wording plus a shared map/boss is a strong hint, not proof. An
    // operator confirms it; nothing silently changes state.
    if (scored.similarity >= TITLE_SIMILARITY_THRESHOLD || scored.entityMatch) {
      return { kind: 'review', eventId: scored.candidate.id, role: subject.intent };
    }
    return { kind: 'new' };
  }

  if (scored.similarity >= TITLE_SIMILARITY_THRESHOLD) {
    return { kind: 'same', eventId: scored.candidate.id, role: 'confirmation' };
  }
  return { kind: 'new' };
}
