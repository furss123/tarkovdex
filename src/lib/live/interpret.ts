import 'server-only';
import { GoogleGenAI } from '@google/genai';
import { liveConfig } from './config';
import {
  parseEnvelope,
  SCHEMA_VERSION,
  type InterpretEnvelope,
} from './interpret-schema';

/**
 * The interpretation layer: "what does this post actually mean for me right
 * now". It runs **only inside the cron pipeline**, never during a page render —
 * that separation is the whole point of the storage layer, and it is why three
 * locale pages no longer cost three sets of API calls.
 *
 * **Hard rules, enforced in the prompt and then again in validation:**
 *  - a time survives only with a quote from the source that really contains it
 *    (`interpret-schema.ts`);
 *  - the model may raise `requiresReview`, never clear it;
 *  - nothing it returns is ever presented as confirmed fact on its own — the
 *    publication gate never bypasses operator review.
 *
 * One call produces all three languages. The alternative (one call per locale)
 * tripled spend against the same free-tier quota this project has already been
 * bitten by twice, for prose that is a translation of itself.
 */

export interface InterpretInput {
  id: string;
  source: string;
  account: string | null;
  title: string;
  content: string;
  publishedAt: string;
  url: string | null;
  category: string;
  /** Titles of events already on the board, so the model can say "this looks
   * like an update to that" instead of inventing a new one. Names only — it is
   * never given, and can never echo back, their stored times. */
  openEvents: string[];
}

export interface ContentInterpreter {
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly schemaVersion: string;
  interpret(input: InterpretInput): Promise<InterpretEnvelope>;
}

/** Bump when the prompt changes: stored interpretations are keyed by it, so a
 * bump re-runs everything rather than mixing outputs from two prompts. */
export const PROMPT_VERSION = 'live-v2';

const CALL_TIMEOUT_MS = 20_000;

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

function buildPrompt(input: InterpretInput): string {
  const context = input.openEvents.length
    ? `\nEvents already tracked on the board (titles only): ${input.openEvents.slice(0, 10).join(' | ')}`
    : '';

  return `You are analyzing an Escape from Tarkov announcement for a Korean-first fan site.

Return ONLY a raw JSON object, no markdown fences, with exactly this shape:
{
  "ko": {"summary": string, "playerImpact": string, "recommendedAction": string},
  "en": {"summary": string, "playerImpact": string, "recommendedAction": string},
  "zh": {"summary": string, "playerImpact": string, "recommendedAction": string},
  "gameModes": string[],
  "eventIntent": "start" | "update" | "end" | "teaser" | "maintenance" | "patch" | "unknown",
  "maps": string[], "bosses": string[], "traders": string[], "items": string[], "quests": string[],
  "startsAt": {"value": string | null, "evidenceText": string | null, "confidence": "high"|"medium"|"low"},
  "endsAt":   {"value": string | null, "evidenceText": string | null, "confidence": "high"|"medium"|"low"},
  "reliabilitySuggestion": "official_confirmed"|"official_statement"|"developer_hint"|"unverified",
  "requiresReview": boolean,
  "reviewReason": string,
  "ambiguity": string[]
}

Absolute rules — breaking any of them makes the answer unusable:
- Never state a number, percentage, multiplier, date, time, or duration that is not literally in the source text.
- "startsAt"/"endsAt": fill "value" ONLY if the source text states an explicit calendar date AND time AND timezone. Write it as full ISO-8601 with an offset or Z. Put the exact source sentence you read it from in "evidenceText". If the source says "this weekend", "soon", "in a few days", or gives no timezone, set value to null.
- Never guess a timezone. A time with no timezone in the source is not a usable time.
- "gameModes" may contain only values the source names, from ["pvp","pve","arena"]; otherwise an empty array.
- Never invent boss names, map names, event names, spawn rates, experience multipliers, or rewards. The entity arrays list only names the source text contains.
- Never turn a joke, teaser, image caption, or a developer's personal remark into a confirmed announcement. Set "eventIntent" to "teaser" and "requiresReview" to true for those.
- Set "requiresReview" to true whenever anything is ambiguous, the applicable mode is unclear, an end time is unstated, or the post only hints at something.
- If you are not sure about a field, return an empty string or null for it.
- Korean output must use this site's terms: 플리마켓, 은신처, 퀘스트, 레이드, 스캐브, 상인, 경험치, 등장 확률.

"summary": one short sentence, the single most important fact.
"playerImpact": one or two sentences on what actually changes in game.
"recommendedAction": one sentence on what a player might prioritize now, or "" if the post implies no action.
"eventIntent": does this post start something, update something already running, end something, tease something, announce maintenance, or ship a patch?

Source: ${input.source}${input.account ? ` (${input.account})` : ''}
Published: ${input.publishedAt}
Category (already determined, do not change it): ${input.category}${context}

Title: ${input.title}

Body: ${input.content}`;
}

export const geminiInterpreter: ContentInterpreter = {
  provider: 'gemini',
  get model() {
    return liveConfig.interpret.model;
  },
  promptVersion: PROMPT_VERSION,
  schemaVersion: SCHEMA_VERSION,
  async interpret(input) {
    const gemini = getClient();
    if (!gemini) throw new Error('GEMINI_API_KEY not configured');

    const response = await Promise.race([
      gemini.models.generateContent({
        model: liveConfig.interpret.model,
        contents: buildPrompt(input),
        // Low creativity: this is extraction, not writing.
        config: { temperature: 0.1 },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('interpret_timeout')), CALL_TIMEOUT_MS),
      ),
    ]);

    return parseEnvelope(response.text ?? '', `${input.title}\n${input.content}`);
  },
};

/** The no-provider implementation. Every interpreted field stays empty rather
 * than being invented; the board then shows the original post and says the
 * commentary isn't ready. */
export const nullInterpreter: ContentInterpreter = {
  provider: 'none',
  model: 'none',
  promptVersion: PROMPT_VERSION,
  schemaVersion: SCHEMA_VERSION,
  interpret: async () => {
    throw new Error('interpretation is disabled');
  },
};

export function getInterpreter(): ContentInterpreter {
  return liveConfig.interpret.enabled ? geminiInterpreter : nullInterpreter;
}

export function isInterpretEnabled(): boolean {
  return liveConfig.interpret.enabled;
}
