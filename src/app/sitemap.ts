import type { MetadataRoute } from 'next';
import { defaultLocale, type Locale } from '@/i18n/routing';
import { publicLocales } from '@/lib/locale-availability';
import { SITE_URL } from '@/lib/site';
import { X_DEFAULT_LOCALE } from '@/lib/metadata';
import { SITEMAP_ROUTES } from '@/lib/navigation';

export const dynamic = 'force-static';
export const revalidate = 21600;

function urlFor(locale: Locale, route: string): string {
  return `${SITE_URL}/${locale}${route}`;
}

function alternatesFor(route: string) {
  return {
    languages: Object.fromEntries([
      ...publicLocales.map((l) => [l, urlFor(l, route)]),
      ['x-default', urlFor(X_DEFAULT_LOCALE, route)],
    ]),
  };
}

/**
 * One entry per public locale × route, each carrying `alternates.languages`
 * pointing at its sibling public locales. Chinese stays implemented in the app
 * tree but is omitted from sitemap/hreflang while unpublished.
 *
 * No data fetch any more: the quest detail URLs this used to enumerate went
 * with the routes that rendered them, so the sitemap is now a pure function of
 * `SITEMAP_ROUTES`.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.flatMap((route) =>
    publicLocales.map((locale) => ({
      url: urlFor(locale, route),
      alternates: alternatesFor(route),
      ...(locale === defaultLocale
        ? { priority: route === '' ? 1 : 0.5 }
        : {}),
    })),
  );
}
