/**
 * Site-wide constants that must stay identical across all locales.
 *
 * SITE_AUTHOR is intentionally a hardcoded literal (not a translation key): the
 * creator name "NightScav" is shown verbatim in every language — footer, the
 * About page, and the `<meta name="author">` tag — and must never be localized
 * or transliterated.
 */
export const SITE_AUTHOR = 'NightScav';

/**
 * Production origin, used by robots.ts/sitemap.ts to build absolute URLs and
 * by generateMetadata's metadataBase. The canonical domain is
 * https://tarkovdex.dev (`www` 308-redirects to it at the Vercel edge);
 * `NEXT_PUBLIC_SITE_URL` remains configurable for previews/local overrides.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'https://tarkovdex.dev';
