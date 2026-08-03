import 'server-only';
import { unstable_cache } from 'next/cache';
import type { Locale } from '@/i18n/routing';
import type { LiveEntry } from '@/types/live';
import { toLiveEntry } from './normalize';

const PROFILE_URL = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/tarkov?dnt=true&lang=en';
const PROFILE_HANDLE = '@tarkov';
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_TWEETS = 20;

interface SyndicationUrl {
  url?: unknown;
  expanded_url?: unknown;
}

interface SyndicationMedia {
  url?: unknown;
}

interface SyndicationTweet {
  id_str?: unknown;
  full_text?: unknown;
  created_at?: unknown;
  user?: { screen_name?: unknown };
  entities?: {
    urls?: unknown;
    media?: unknown;
  };
}

export interface OfficialXTweet {
  id: string;
  url: string;
  title: string;
  content: string;
  publishedAt: string;
  youtubeVideoId: string | null;
}

interface LocalizedPostText {
  title: string;
  content: string;
  translated: boolean;
}

/** Verified snapshot of the linked profile's current post. X's public embed
 * endpoint applies short rate-limit windows, so a deploy during one of those
 * windows should still render the post the user asked to feature. */
const REVIEWED_FALLBACK: OfficialXTweet[] = [{
  id: '2083811421016478193',
  url: 'https://x.com/tarkov/status/2083811421016478193',
  title: 'Kord Breach Trailer #EscapefromTarkov',
  content: 'Kord Breach Trailer #EscapefromTarkov',
  publishedAt: '2026-08-02T07:05:32.000Z',
  youtubeVideoId: 'r3AVrOG58XQ',
}];

/** The current official post is reviewed by hand so the first render is
 * natural without invoking a translation provider. New posts stay in their
 * original language until an offline or ingestion translation is reviewed. */
const REVIEWED_TRANSLATIONS: Partial<Record<Locale, Record<string, LocalizedPostText>>> = {
  ko: {
    '2083811421016478193': {
      title: 'Kord Breach 트레일러',
      content: 'Kord Breach 트레일러 #EscapefromTarkov',
      translated: true,
    },
  },
  zh: {
    '2083811421016478193': {
      title: 'Kord Breach 预告片',
      content: 'Kord Breach 预告片 #EscapefromTarkov',
      translated: true,
    },
  },
};

function entityArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export function youtubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    let id: string | null = null;
    if (parsed.hostname === 'youtu.be') id = parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    if (parsed.hostname === 'youtube.com' || parsed.hostname === 'www.youtube.com') {
      if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
      else if (/^\/(?:shorts|embed)\//.test(parsed.pathname)) id = parsed.pathname.split('/')[2] ?? null;
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function displayText(tweet: SyndicationTweet, urls: SyndicationUrl[], media: SyndicationMedia[]): string {
  let text = typeof tweet.full_text === 'string' ? tweet.full_text.slice(0, 10_000) : '';
  for (const entity of urls) {
    if (typeof entity.url !== 'string') continue;
    const expanded = typeof entity.expanded_url === 'string' ? entity.expanded_url : '';
    text = text.replaceAll(entity.url, expanded && !youtubeVideoId(expanded) ? expanded : '');
  }
  for (const entity of media) {
    if (typeof entity.url === 'string') text = text.replaceAll(entity.url, '');
  }
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function titleOf(text: string): string {
  const firstLine = text.split('\n').find((line) => line.trim())?.trim() ?? text.trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 79).trim()}…` : firstLine;
}

/** Parse data only from X's official public profile embed response. Scripts in
 * the response are never evaluated, and every rendered URL is reconstructed
 * from a numeric post id or validated YouTube id. */
export function parseOfficialXTimeline(html: string): OfficialXTweet[] {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match?.[1]) return [];

  let payload: unknown;
  try {
    payload = JSON.parse(match[1]);
  } catch {
    return [];
  }

  const entries = (payload as {
    props?: { pageProps?: { timeline?: { entries?: unknown } } };
  })?.props?.pageProps?.timeline?.entries;
  if (!Array.isArray(entries)) return [];

  const tweets: OfficialXTweet[] = [];
  for (const entry of entries) {
    const tweet = (entry as { content?: { tweet?: SyndicationTweet } })?.content?.tweet;
    if (!tweet) continue;
    const id = typeof tweet.id_str === 'string' && /^\d{8,24}$/.test(tweet.id_str) ? tweet.id_str : null;
    const screenName = typeof tweet.user?.screen_name === 'string' ? tweet.user.screen_name.toLowerCase() : '';
    const published = typeof tweet.created_at === 'string' ? Date.parse(tweet.created_at) : Number.NaN;
    if (!id || screenName !== 'tarkov' || !Number.isFinite(published)) continue;

    const urls = entityArray<SyndicationUrl>(tweet.entities?.urls);
    const media = entityArray<SyndicationMedia>(tweet.entities?.media);
    const content = displayText(tweet, urls, media);
    if (!content) continue;
    const youtubeId = urls
      .map((entity) => typeof entity.expanded_url === 'string' ? youtubeVideoId(entity.expanded_url) : null)
      .find((value): value is string => Boolean(value)) ?? null;

    tweets.push({
      id,
      url: `https://x.com/tarkov/status/${id}`,
      title: titleOf(content),
      content,
      publishedAt: new Date(published).toISOString(),
      youtubeVideoId: youtubeId,
    });
  }

  return [...new Map(tweets.map((tweet) => [tweet.id, tweet])).values()]
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, MAX_TWEETS);
}

async function fetchSyndicatedOfficialXTweets(): Promise<OfficialXTweet[]> {
  try {
    const response = await fetch(PROFILE_URL, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
      return [];
    }
    const html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) return [];
    return parseOfficialXTimeline(html);
  } catch {
    return [];
  }
}

async function fetchOfficialXTweets(): Promise<OfficialXTweet[]> {
  const syndicated = await fetchSyndicatedOfficialXTweets();
  return syndicated.length > 0 ? syndicated : REVIEWED_FALLBACK;
}

const cachedOfficialXTweets = unstable_cache(fetchOfficialXTweets, ['official-x-profile-tarkov-v3'], {
  revalidate: 300,
});

function localize(tweet: OfficialXTweet, locale: Locale): LocalizedPostText {
  if (locale === 'en') {
    return { title: tweet.title, content: tweet.content, translated: true };
  }
  const reviewed = REVIEWED_TRANSLATIONS[locale]?.[tweet.id];
  if (reviewed) return reviewed;

  return { title: tweet.title, content: tweet.content, translated: false };
}

/**
 * Present a public-profile post as a post, not as a confirmed situation.
 * This presentation-only path has not passed through ingestion or review, so
 * every new profile copy remains an official statement pending review. When a
 * persisted copy exists, `feed.ts` keeps that stored review decision instead.
 */
export function toOfficialXEntry(
  tweet: OfficialXTweet,
  locale: Locale,
  checkedAt: string,
): LiveEntry {
  const localized = localize(tweet, locale);
  const entry = toLiveEntry(
    {
      source: 'official_x',
      account: PROFILE_HANDLE,
      postId: tweet.id,
      url: tweet.url,
      title: tweet.title,
      content: tweet.content,
      publishedAt: tweet.publishedAt,
      translated:
        locale !== 'en' && localized.translated
          ? { title: localized.title, content: localized.content }
          : null,
      youtubeVideoId: tweet.youtubeVideoId,
    },
    checkedAt,
  );

  return {
    ...entry,
    reliability: 'official_statement',
    reviewStatus: 'pending_review',
    // English is already the requested locale; reviewed ko/zh text records an
    // actual translation, while a new untranslated post is clearly marked.
    translated: locale === 'en' || localized.translated,
  };
}

export async function getOfficialXEntries(locale: Locale, checkedAt: string): Promise<LiveEntry[]> {
  const tweets = await cachedOfficialXTweets();
  return tweets.map((tweet) => toOfficialXEntry(tweet, locale, checkedAt));
}
