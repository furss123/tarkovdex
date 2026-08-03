import { defineRouting } from 'next-intl/routing';

/**
 * Central i18n routing definition. Imported by the middleware, the navigation
 * helpers, and the request config so all three stay in sync.
 *
 * Decisions (see CLAUDE.md > i18n):
 *   - locales: ko / zh / en remain registered so Chinese messages, types, and
 *     page trees stay intact. Public exposure (switcher, sitemap, hreflang) is
 *     limited to ko/en via `lib/locale-availability.ts`; `/zh` redirects to `/ko`.
 *   - localePrefix: 'always' — every URL is prefixed (/ko, /zh, /en), including
 *     the default. Consistent, unambiguous URLs and clean hreflang alternates.
 *   - alternateLinks: false — page metadata and sitemap.ts are the single
 *     hreflang source. Their stable English x-default must not be contradicted
 *     by middleware Link headers derived from the Korean default locale.
 */
export const locales = ['ko', 'zh', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'ko';

export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: 'always',
  alternateLinks: false,
});

/** Type guard used by the middleware/request config to validate the segment. */
export function isValidLocale(value: string | undefined): value is Locale {
  return value != null && (locales as readonly string[]).includes(value);
}
