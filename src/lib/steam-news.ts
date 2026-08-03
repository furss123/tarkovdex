import 'server-only';

/**
 * Escape from Tarkov's official Steam News RSS feed — the news/patch-notes
 * page's only data source. json.tarkov.dev has no patch-notes/events
 * endpoint (confirmed via its own `/endpoints` manifest: items/tasks/maps/
 * traders/barters/crafts/hideout/prices/status, nothing news-shaped), and
 * this project's decision log already rejected fragile HTML scraping once
 * (the old GraphQL endpoint) in favor of a stable, structured source. Steam's
 * RSS feed for BSG's own Steam page is that: an official, stable, versioned
 * XML format — not a scrape of a page that can be redesigned without notice.
 *
 * App ID 3932890 confirmed live (Escape from Tarkov's Steam store page).
 *
 * **Locale note**: passing Steam's `?l=` query param (e.g. `koreana`,
 * `schinese`) only translates the feed's own chrome (channel title/
 * description) — confirmed live by fetching all three and diffing. Every
 * actual news item's title/body stayed identical, byte-for-byte, in English
 * regardless of `l=`. BSG simply doesn't publish translated Steam posts, so
 * this module only ever fetches the single default (English) feed. Real
 * ko/zh translation is a separate, explicit step — see
 * `lib/translate-news.ts` — not something Steam provides.
 */

const STEAM_NEWS_URL = 'https://store.steampowered.com/feeds/news/app/3932890/';
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;

/** News/events change far more often than the game's static data dumps. Five
 * minutes keeps maintenance and server notices useful while Next still
 * collapses traffic from every locale into one cached Steam request. */
const REVALIDATE_SECONDS = 5 * 60;

export interface NewsItem {
  id: string;
  title: string;
  /** Full plain-text, HTML-stripped body — not truncated here. The news
   * page's UI truncates for the collapsed preview and shows this in full
   * once expanded; truncating at the source would throw away content the
   * translation step (`translate-news.ts`) also needs in full. */
  content: string;
  url: string;
  /** ISO timestamp. */
  publishedAt: string;
}

export interface SteamNewsFeed {
  patchNotes: NewsItem[];
  events: NewsItem[];
}

function unwrapCdata(value: string): string {
  const match = value.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  return match ? match[1] : value;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Converts paragraph/line-break tags to real newlines before stripping the
 * rest, so the full expanded content still reads as paragraphs instead of
 * one run-on line — the original bbcode-derived HTML has no other
 * whitespace to preserve that structure. */
function stripHtml(html: string): string {
  return html
    .replace(/<\/(p|div|li)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return match ? match[1] : null;
}

/** BSG consistently titles patch-note posts "Patch 1.2.3.4" — confirmed
 * against a live fetch of the last 10 posts (exactly one matched, the rest
 * were events/announcements/surveys). Everything else is treated as an
 * event/announcement. */
function isPatchNote(title: string): boolean {
  return /^patch\s+[\d.]+/i.test(title);
}

/**
 * Fetch + parse the Steam news RSS feed into patch notes vs. events. A
 * small hand-rolled regex parser, not a full XML library — Steam's feed
 * format is simple and fixed (confirmed by inspecting a live response), and
 * adding an XML dependency for five fields felt like the wrong trade.
 */
export async function getSteamNews(): Promise<SteamNewsFeed> {
  const res = await fetch(STEAM_NEWS_URL, {
    next: { revalidate: REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`Steam news feed responded ${res.status} ${res.statusText}`);
  }

  const declaredLength = Number(res.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FEED_BYTES) {
    throw new Error('Steam news feed exceeded the maximum allowed size');
  }

  const xml = await res.text();
  if (new TextEncoder().encode(xml).byteLength > MAX_FEED_BYTES) {
    throw new Error('Steam news feed exceeded the maximum allowed size');
  }
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  const items: NewsItem[] = [];
  for (const block of blocks) {
    const rawTitle = extractTag(block, 'title');
    const rawLink = extractTag(block, 'link');
    const rawDescription = extractTag(block, 'description');
    const rawPubDate = extractTag(block, 'pubDate');
    const rawGuid = extractTag(block, 'guid');

    if (!rawTitle || !rawLink || !rawPubDate) continue;

    const title = decodeEntities(unwrapCdata(rawTitle)).trim();
    const url = unwrapCdata(rawLink).trim();
    const publishedAtMs = Date.parse(rawPubDate);
    if (!Number.isFinite(publishedAtMs)) continue;
    const publishedAt = new Date(publishedAtMs).toISOString();

    const content = rawDescription
      ? stripHtml(decodeEntities(unwrapCdata(rawDescription)))
      : '';

    items.push({
      id: rawGuid ? unwrapCdata(rawGuid).trim() : url,
      title,
      content,
      url,
      publishedAt,
    });
  }

  return {
    patchNotes: items.filter((item) => isPatchNote(item.title)),
    events: items.filter((item) => !isPatchNote(item.title)),
  };
}
