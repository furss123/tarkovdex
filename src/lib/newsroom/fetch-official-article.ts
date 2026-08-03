import 'server-only';
import {
  DEFAULT_OFFICIAL_HOSTS,
  NewsSourceValidationError,
  normalizeNewsText,
  type OfficialSourceAllowlist,
} from './news-source-normalize';

const FETCH_TIMEOUT_MS = 12_000;
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

const EXTRA_OFFICIAL_HOSTS = ['telegra.ph', 'www.telegra.ph'] as const;

export function articleFetchHosts(allowlist: OfficialSourceAllowlist): string[] {
  return [...new Set([...allowlist.officialHosts, ...EXTRA_OFFICIAL_HOSTS, ...DEFAULT_OFFICIAL_HOSTS])];
}

function hostAllowed(hostname: string, hosts: string[]): boolean {
  const normalized = hostname.toLowerCase();
  return hosts.some((item) => normalized === item || normalized.endsWith(`.${item}`));
}

function assertPublicHttps(url: URL, hosts: string[]): void {
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new NewsSourceValidationError('unsafe_url');
  }
  if (!hostAllowed(url.hostname, hosts)) {
    throw new NewsSourceValidationError('invalid_linked_host');
  }
  // Block obvious SSRF targets even if somehow allowlisted later.
  if (
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|::1|\[::1\])/i.test(url.hostname) ||
    url.hostname.endsWith('.local') ||
    url.hostname.endsWith('.internal')
  ) {
    throw new NewsSourceValidationError('unsafe_url');
  }
}

function extractTitle(html: string): string | undefined {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1];
  if (og) return normalizeNewsText(og);
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? normalizeNewsText(title) : undefined;
}

/** Prefer article body; fall back to full HTML text. Keeps heading/list cues. */
function extractBodyHtml(html: string): string {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  if (article) return article;
  const telegraph = html.match(/<div[^>]+class=["'][^"']*tl_article[^"']*["'][\s\S]*?<\/div>\s*<\/div>/i)?.[0];
  if (telegraph) return telegraph;
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0];
  return main ?? html;
}

function htmlToStructuredText(html: string): string {
  return normalizeNewsText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<\/(h[1-6])>/gi, '\n\n')
      .replace(/<(h[1-6])[^>]*>/gi, '\n\n## ')
      .replace(/<\/(p|div|section|li)>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<[^>]+>/g, ' '),
  );
}

export interface OfficialArticleFetch {
  url: string;
  finalUrl: string;
  title?: string;
  text: string;
  fetchedAt: string;
}

export async function fetchOfficialArticle(
  rawUrl: string,
  allowlist: OfficialSourceAllowlist,
  fetchImpl: typeof fetch = fetch,
): Promise<OfficialArticleFetch> {
  const hosts = articleFetchHosts(allowlist);
  let current = new URL(rawUrl);
  assertPublicHttps(current, hosts);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(current.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location || hop === MAX_REDIRECTS) throw new NewsSourceValidationError('redirect_failed');
        current = new URL(location, current);
        assertPublicHttps(current, hosts);
        continue;
      }
      if (!response.ok) throw new NewsSourceValidationError('fetch_failed');
      const type = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml|text\/plain/i.test(type)) {
        throw new NewsSourceValidationError('unsupported_content_type');
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.byteLength > MAX_BYTES) throw new NewsSourceValidationError('body_too_large');
      const html = buffer.toString('utf8');
      const text = htmlToStructuredText(extractBodyHtml(html));
      if (!text) throw new NewsSourceValidationError('empty_article');
      return {
        url: rawUrl,
        finalUrl: current.toString(),
        title: extractTitle(html),
        text,
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new NewsSourceValidationError('redirect_failed');
}
