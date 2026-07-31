import 'server-only';
import { unstable_cache } from 'next/cache';
import { GoogleGenAI } from '@google/genai';
import type { NewsItem, SteamNewsFeed } from './steam-news';
import { getSteamNews } from './steam-news';

/**
 * Real translation of Steam's English-only news posts into ko/zh — Steam
 * itself doesn't provide this (see steam-news.ts's locale note), and the
 * site's own audience is majority Korean, so leaving every post in English
 * was judged not good enough. Uses the Gemini API (previously Claude API —
 * switched per explicit request; same rationale of translation quality on
 * gaming-specific phrasing/tone over a dedicated translation API applies).
 *
 * **Requires `GEMINI_API_KEY`** to be set (e.g. in Vercel's project env
 * vars). Without it, this silently falls back to the original English text
 * — translation is a nice-to-have layered on top of a working English
 * fallback, not something that should take the whole news page down if
 * unconfigured or if the API call fails for any reason.
 */

const MODEL = 'gemini-3.5-flash-lite';
const TRANSLATION_DEADLINE_MS = 40_000;

const LANGUAGE_NAME: Record<'ko' | 'zh', string> = {
  ko: 'Korean',
  zh: 'Simplified Chinese',
};

let client: GoogleGenAI | null = null;
function getClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

interface Translated {
  title: string;
  content: string;
}

/**
 * Extracts the server-suggested retry delay from a 429 ApiError, e.g. a
 * `{"@type":".../RetryInfo","retryDelay":"46s"}` entry buried in the error's
 * JSON `message` string (the SDK's `ApiError` only types `.status`/`.message`
 * — there's no structured field for this, so it's parsed defensively).
 * Falls back to a fixed 15s if the shape ever changes or parsing fails.
 */
function retryDelayMs(err: unknown): number {
  const FALLBACK_MS = 15_000;
  const MAX_MS = 60_000;
  try {
    const message = (err as { message?: string } | null)?.message ?? '';
    const parsed = JSON.parse(message) as {
      error?: { details?: Array<{ retryDelay?: string }> };
    };
    const retryDelay = parsed.error?.details?.find((d) => typeof d.retryDelay === 'string')?.retryDelay;
    const seconds = retryDelay ? Number(retryDelay.replace(/s$/, '')) : NaN;
    if (!Number.isFinite(seconds)) return FALLBACK_MS;
    return Math.min(Math.ceil(seconds) * 1000 + 2000, MAX_MS);
  } catch {
    return FALLBACK_MS;
  }
}

/**
 * Throws on any failure (no client, exhausted retries, bad JSON, network
 * error) instead of returning an English fallback — deliberately, so that
 * `unstable_cache` below (which only ever caches a *resolved* value, never a
 * thrown rejection — confirmed by reading Next's own `unstable-cache.js`)
 * never permanently commits a failure to the forever-cache. `translateItem`
 * is what actually applies the English fallback, one layer outside the
 * cache, so a transient failure gets a real retry on the *next* revalidate
 * instead of being stuck until a manual cache-key bump.
 */
async function translateUncached(
  id: string,
  locale: 'ko' | 'zh',
  title: string,
  content: string,
): Promise<Translated> {
  const gemini = getClient();
  if (!gemini) throw new Error('GEMINI_API_KEY not configured');

  const targetLanguage = LANGUAGE_NAME[locale];
  // ko glossary: terms the game's official Korean localization uses, so the
  // translation matches what players actually see in-game / on this site.
  const glossary = locale === 'ko'
    ? `
Use the official Korean game terms for recurring Tarkov vocabulary, e.g.:
Flea Market=플리마켓, Hideout=은신처, quest/task=퀘스트, raid=레이드, Scav=스캐브, PMC=PMC,
maps: Streets of Tarkov=타르코프 시내, Customs=세관, Factory=공장, Woods=삼림, Shoreline=해안선, Reserve=리저브, Interchange=인터체인지, Lighthouse=등대, The Lab/Laboratory=연구소, Ground Zero=그라운드 제로,
traders: Prapor=프라퍼, Therapist=테라피스트, Fence=펜스, Skier=스키어, Peacekeeper=피스키퍼, Mechanic=메카닉, Ragman=래그맨, Jaeger=예거, Ref=레프,
bosses: Killa=킬라, Tagilla=타길라, Reshala=르샬라, Glukhar=글루하, Shturman=슈트르만, Sanitar=세니타, Kaban=카반, Kollontay=콜론타이, Partisan=파르티잔.`
    : '';
  const prompt = `Translate the following Escape from Tarkov (a video game) news post into natural, fluent ${targetLanguage}, matching the tone of a gaming news/community site.

Rules:
- Translate faithfully: do not summarize, shorten, reorder, or add anything.
- Preserve every patch version number, date, time, number, unit, percentage, and event condition exactly.
- Keep the original paragraph and line-break structure.
- Keep weapon model names, brand names, and cartridge designations (e.g. 5.45x39) in their original form.
- Use the names ${targetLanguage}-speaking Escape from Tarkov players actually use for game terms instead of literal translations.${glossary}

Respond with ONLY a raw JSON object of the shape {"title": string, "content": string} — no markdown fences, no commentary.

Title: ${title}

Content: ${content}`;

  // Retried up to 3 attempts, but ONLY on 429 (rate limit) — discovered live
  // (both in local testing and in the first production deploy) that
  // translateFeed's Promise.all fires one request per post concurrently
  // (~10 posts × 2 locales, worse in a Vercel build where multiple locale
  // pages can generate concurrently too), which trivially bursts past the
  // Gemini free tier's 15-requests/minute cap. A fixed short backoff
  // (originally 6s/12s) was not enough headroom — the API's own error
  // reliably reports the quota resetting ~46-48s out, well past that — so
  // this parses the server's own suggested `retryDelay` and waits (roughly)
  // that long instead of guessing. Non-429 failures (bad JSON, network
  // error, etc.) are not retried — there's no reason to expect a second
  // attempt to parse better.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await gemini.models.generateContent({
        model: MODEL,
        contents: prompt,
      });
      // Gemini sometimes wraps JSON in ```json fences despite being told
      // not to — strip them before parsing.
      const text = (response.text ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
      const parsed = JSON.parse(text) as Partial<Translated>;
      return {
        title: typeof parsed.title === 'string' && parsed.title ? parsed.title : title,
        content: typeof parsed.content === 'string' && parsed.content ? parsed.content : content,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number } | null)?.status;
      if (status === 429 && attempt < 2) {
        // Each retry re-reads the delay off its own error rather than a
        // multiplied fixed schedule — the server reports how long *this*
        // attempt's quota window needs, which doesn't necessarily grow
        // attempt-over-attempt.
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs(err)));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Cached indefinitely per (id, locale) — a published news post's content
 * never changes, so once translated it never needs to be translated again.
 * This is the difference between a handful of API calls total (one per new
 * Steam post, ever) and re-translating the whole feed every revalidate. Only
 * a *successful* translation ever reaches this point (see the throw-not-
 * return-fallback note on `translateUncached` above) — a failed attempt is
 * never cached, so it's retried fresh on the next revalidate rather than
 * stuck in English forever.
 */
const translateCached = unstable_cache(translateUncached, ['news-translation'], {
  revalidate: false,
});

async function translateItem(item: NewsItem, locale: 'ko' | 'zh'): Promise<NewsItem> {
  try {
    const translated = await translateCached(item.id, locale, item.title, item.content);
    return { ...item, ...translated };
  } catch {
    // No key configured, retries exhausted, bad JSON, network error, etc. —
    // fall back to English rather than breaking the page. Deliberately not
    // cached (see translateUncached) so this is retried on the next
    // revalidate instead of stuck in English forever.
    return item;
  }
}

/**
 * Sequential, not Promise.all — firing every post's translation at once
 * reliably bursts past Gemini's free-tier 15-requests/minute quota (worse
 * with ko+zh generating concurrently), and a 429'd item that isn't the
 * request currently in flight when the shared deadline (below) fires never
 * gets a real attempt at all. One at a time keeps well under the quota, so
 * the 429 retry path becomes the rare case instead of the common one.
 */
async function translateAll(items: NewsItem[], locale: 'ko' | 'zh'): Promise<NewsItem[]> {
  const translated: NewsItem[] = [];
  for (const item of items) {
    translated.push(await translateItem(item, locale));
  }
  return translated;
}

async function translateFeed(feed: SteamNewsFeed, locale: 'ko' | 'zh'): Promise<SteamNewsFeed> {
  const patchNotes = await translateAll(feed.patchNotes, locale);
  const events = await translateAll(feed.events, locale);
  return { patchNotes, events };
}

/**
 * Steam news, localized: English passes through untouched; ko/zh get
 * translated (or fall back to English if `GEMINI_API_KEY` is unset or a
 * call fails). This is the function the news page actually calls.
 */
export async function getLocalizedNews(locale: 'ko' | 'zh' | 'en'): Promise<SteamNewsFeed> {
  const feed = await getSteamNews();
  if (locale === 'en') return feed;

  // Next's static page worker aborts a page after 60 seconds. Gemini can
  // legitimately recommend a 46-48s rate-limit retry, and a slow follow-up
  // request can otherwise push the whole news page past that hard limit.
  // Resolve with the existing English baseline first, while successful
  // per-item translations still retain their indefinite cache entries for
  // the next ISR attempt.
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const fallback = new Promise<SteamNewsFeed>((resolve) => {
    deadline = setTimeout(() => resolve(feed), TRANSLATION_DEADLINE_MS);
  });

  try {
    return await Promise.race([translateFeed(feed, locale), fallback]);
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}
