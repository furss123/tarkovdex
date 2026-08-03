const ALLOWED_WIKI_HOSTS = new Set([
  'escapefromtarkov.fandom.com',
]);

// The upstream tasks document currently assigns this missing Fandom article
// to four tasks. Keep the source fact explicit here instead of emitting four
// known-broken links or guessing a replacement article.
const KNOWN_UNAVAILABLE_WIKI_PATHS = new Set([
  '/wiki/Neuanfang',
]);

// The PvE task document appends an internal zone marker and a newline to this
// otherwise valid quest URL. The canonical Fandom article is verified and the
// rewrite is intentionally exact so no other upstream typo is guessed.
const KNOWN_WIKI_PATH_REWRITES = new Map([
  ['/wiki/Arena_Business_%5BPVE_ZONE%5D%0A', '/wiki/Arena_Business'],
]);

function isKnownUnavailablePath(url: URL): boolean {
  return (
    ALLOWED_WIKI_HOSTS.has(url.hostname) &&
    KNOWN_UNAVAILABLE_WIKI_PATHS.has(url.pathname.replace(/\/$/, ''))
  );
}

/** Classify a source URL that is trusted in shape but known to have no page. */
export function isKnownUnavailableTarkovWikiUrl(value: unknown): boolean {
  if (typeof value !== 'string' || value.trim() === '') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      url.port === '' &&
      isKnownUnavailablePath(url)
    );
  } catch {
    return false;
  }
}

/**
 * Accept only the HTTPS wiki origin Tarkov's upstream documents currently
 * use. Wiki URLs are external input and are rendered directly into anchors,
 * so an unexpected protocol, credential, port, or look-alike host must
 * degrade to a missing link rather than becoming executable navigation.
 */
export function safeTarkovWikiUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;

  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username !== '' ||
      url.password !== '' ||
      url.port !== '' ||
      !ALLOWED_WIKI_HOSTS.has(url.hostname) ||
      isKnownUnavailablePath(url)
    ) {
      return null;
    }
    const rewrittenPath = KNOWN_WIKI_PATH_REWRITES.get(url.pathname);
    if (rewrittenPath) url.pathname = rewrittenPath;
    return url.toString();
  } catch {
    return null;
  }
}
