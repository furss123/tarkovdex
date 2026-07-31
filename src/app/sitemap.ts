import type { MetadataRoute } from 'next';
import { locales, defaultLocale, type Locale } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';
import { X_DEFAULT_LOCALE } from '@/lib/metadata';

/** Every static route in the app, relative to a locale segment. */
const ROUTES = [
  '',
  '/about',
  '/news',
  '/economy/items',
  '/economy/barters',
  '/progression/tasks',
  '/progression/gunsmith',
  '/combat/ammo',
  '/combat/armor',
  '/maps',
  '/support',
] as const;

function urlFor(locale: Locale, route: (typeof ROUTES)[number]): string {
  return `${SITE_URL}/${locale}${route}`;
}

/**
 * One entry per locale x route, each carrying `alternates.languages` pointing
 * at its sibling locales — mirrors the hreflang symmetry decision in
 * CLAUDE.md (`localePrefix: 'always'`, so every locale's URL shape matches).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.flatMap((route) =>
    locales.map((locale) => ({
      url: urlFor(locale, route),
      alternates: {
        languages: Object.fromEntries([
          ...locales.map((l) => [l, urlFor(l, route)]),
          ['x-default', urlFor(X_DEFAULT_LOCALE, route)],
        ]),
      },
      ...(locale === defaultLocale ? { priority: route === '' ? 1 : 0.8 } : {}),
    })),
  );
}
