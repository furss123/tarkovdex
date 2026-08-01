import type { LiveGameMode, ReliabilityLevel } from '@/types/live';

/**
 * Validation for whatever the interpretation provider returns. Split out of
 * `interpret.ts` (which is `server-only` because it holds the API key path)
 * so the schema itself stays testable without a server runtime — the point of
 * a guard you can't run is limited.
 *
 * This is where "the model may not invent facts" stops being a prompt request
 * and becomes a property of the code: a time survives only if it is explicit
 * ISO-8601 *and* the model quoted the source text it came from *and* that quote
 * actually appears in the source. Anything else is dropped to null.
 */

export interface InterpretResult {
  summary: string | null;
  playerImpact: string | null;
  recommendedAction: string | null;
  /** Only modes the source text names explicitly; `[]` when it names none. */
  gameModes: LiveGameMode[];
}

export const EMPTY_INTERPRETATION: InterpretResult = {
  summary: null,
  playerImpact: null,
  recommendedAction: null,
  gameModes: [],
};

export const SCHEMA_VERSION = 'live-schema-2';

export type LocaleKey = 'ko' | 'en' | 'zh';
export type EventIntent = 'start' | 'update' | 'end' | 'teaser' | 'maintenance' | 'patch' | 'unknown';

/** A value the model may only report together with the source text it read it
 * out of. No evidence, no value. */
export interface EvidenceField<T> {
  value: T | null;
  evidenceText: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface InterpretEnvelope {
  locales: Partial<Record<LocaleKey, InterpretResult>>;
  gameModes: LiveGameMode[];
  eventIntent: EventIntent;
  maps: string[];
  bosses: string[];
  traders: string[];
  items: string[];
  quests: string[];
  startsAt: EvidenceField<string>;
  endsAt: EvidenceField<string>;
  reliabilitySuggestion: ReliabilityLevel | null;
  requiresReview: boolean;
  reviewReason: string | null;
  ambiguity: string[];
}

const VALID_MODES = new Set<LiveGameMode>(['pvp', 'pve', 'arena']);
const VALID_INTENTS = new Set<EventIntent>([
  'start',
  'update',
  'end',
  'teaser',
  'maintenance',
  'patch',
  'unknown',
]);
const VALID_RELIABILITY = new Set<ReliabilityLevel>([
  'official_confirmed',
  'official_statement',
  'developer_hint',
  'tarkovdex_inference',
  'unverified',
]);

function str(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed && trimmed.toLowerCase() !== 'unknown' ? trimmed : null;
}

function stringList(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(str).filter((item): item is string => Boolean(item)))].slice(0, limit);
}

function modes(value: unknown): LiveGameMode[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((mode): mode is LiveGameMode => VALID_MODES.has(mode as LiveGameMode)))];
}

function stripFence(text: string): string {
  return text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
}

/**
 * Single-locale parse. Kept as the original shape because it is what the
 * envelope parser below uses per language, and what the existing tests cover.
 */
export function parseInterpretation(text: string): InterpretResult {
  const parsed = JSON.parse(stripFence(text)) as Record<string, unknown>;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('interpretation is not an object');
  }
  return fromObject(parsed);
}

function fromObject(parsed: Record<string, unknown>): InterpretResult {
  return {
    summary: str(parsed.summary),
    playerImpact: str(parsed.playerImpact),
    recommendedAction: str(parsed.recommendedAction),
    gameModes: modes(parsed.gameModes),
  };
}

/** Whitespace/punctuation-insensitive containment — a model quoting a source
 * span rarely reproduces its line breaks byte-for-byte. */
function quotes(source: string, evidence: string): boolean {
  const flatten = (value: string) => value.toLowerCase().replace(/[\s\p{P}]+/gu, '');
  const needle = flatten(evidence);
  return needle.length >= 4 && flatten(source).includes(needle);
}

/**
 * A timestamp is accepted only if it is unambiguous: full ISO-8601 carrying an
 * offset or `Z`. A bare `2026-08-05 18:00` is rejected outright rather than
 * assumed to be KST — guessing a timezone is how a board ends up counting down
 * to the wrong hour.
 */
export function parseExplicitInstant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) return null;
  const parsed = Date.parse(trimmed.replace(' ', 'T'));
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function evidenceField(value: unknown, source: string): EvidenceField<string> {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const evidenceText = str(raw.evidenceText);
  const instant = parseExplicitInstant(raw.value);
  const confidence = ['high', 'medium', 'low'].includes(String(raw.confidence))
    ? (String(raw.confidence) as EvidenceField<string>['confidence'])
    : 'low';

  // Both halves are required. A time with no quoted source, or a quote that
  // isn't in the source, is a fabrication and is discarded — not downgraded.
  if (!instant || !evidenceText || !quotes(source, evidenceText)) {
    return { value: null, evidenceText: evidenceText && quotes(source, evidenceText) ? evidenceText : null, confidence: 'low' };
  }
  return { value: instant, evidenceText, confidence };
}

/**
 * The full envelope: prose for all three locales plus the structured
 * extraction, validated against the source text it claims to come from.
 * Throws on anything unparseable — the caller treats a throw as "no
 * interpretation", which is never published and never cached as a success.
 */
export function parseEnvelope(text: string, sourceText: string): InterpretEnvelope {
  const parsed = JSON.parse(stripFence(text)) as Record<string, unknown>;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('interpretation is not an object');
  }

  const locales: InterpretEnvelope['locales'] = {};
  for (const locale of ['ko', 'en', 'zh'] as const) {
    const value = parsed[locale];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      locales[locale] = fromObject(value as Record<string, unknown>);
    }
  }
  if (Object.keys(locales).length === 0) throw new Error('interpretation has no localized text');

  const intent = VALID_INTENTS.has(parsed.eventIntent as EventIntent)
    ? (parsed.eventIntent as EventIntent)
    : 'unknown';
  const startsAt = evidenceField(parsed.startsAt, sourceText);
  const endsAt = evidenceField(parsed.endsAt, sourceText);
  const ambiguity = stringList(parsed.ambiguity, 6);

  return {
    locales,
    gameModes: modes(parsed.gameModes),
    eventIntent: intent,
    maps: stringList(parsed.maps),
    bosses: stringList(parsed.bosses),
    traders: stringList(parsed.traders),
    items: stringList(parsed.items),
    quests: stringList(parsed.quests),
    startsAt,
    endsAt,
    reliabilitySuggestion: VALID_RELIABILITY.has(parsed.reliabilitySuggestion as ReliabilityLevel)
      ? (parsed.reliabilitySuggestion as ReliabilityLevel)
      : null,
    // The model may only ever *raise* suspicion. It cannot clear a review by
    // saying so — every other gate still applies downstream.
    requiresReview: parsed.requiresReview !== false || ambiguity.length > 0 || intent === 'teaser',
    reviewReason: str(parsed.reviewReason),
    ambiguity,
  };
}
