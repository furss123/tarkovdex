import type { MetadataRoute } from 'next';
import { defaultLocale, type Locale } from '@/i18n/routing';
import { publicLocales } from '@/lib/locale-availability';
import { SITE_URL } from '@/lib/site';
import { X_DEFAULT_LOCALE } from '@/lib/metadata';
import { SITEMAP_ROUTES } from '@/lib/navigation';
import { getTasks } from '@/lib/tarkov';
import { unionTaskEntries } from '@/lib/task-availability';
import { taskSlugFor } from '@/lib/task-slug';
import { settleModePair } from '@/lib/settle-mode-pair';

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
 * One entry per public locale x route, each carrying `alternates.languages`
 * pointing at its sibling public locales. Chinese stays implemented in the
 * app tree but is omitted from sitemap/hreflang while unpublished.
 *
 * Quest detail URLs are appended the same way: `getTasks()` is called once
 * for a single locale ('en') for both game modes — the canonical slug is
 * always built from the English name (see lib/task-slug.ts), so it's
 * identical across en/ko/zh and doesn't need fetching per-locale. Regular and
 * PvE are deduped by id via the same `unionTaskEntries` helper the detail
 * route's `generateStaticParams` uses. The two requests settle independently,
 * so a transient one-mode outage keeps the other mode's known task URLs;
 * under normal operation this produces the full 524-entry union.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const categoryEntries: MetadataRoute.Sitemap = SITEMAP_ROUTES.flatMap(
    (route) =>
      publicLocales.map((locale) => ({
        url: urlFor(locale, route),
        alternates: alternatesFor(route),
        ...(locale === defaultLocale
          ? { priority: route === '' ? 1 : 0.8 }
          : {}),
      })),
  );

  const tasks = await settleModePair({
    regular: getTasks({ locale: 'en', gameMode: 'regular' }),
    pve: getTasks({ locale: 'en', gameMode: 'pve' }),
  });
  // A one-mode outage should not remove the other mode's valid quest URLs.
  // If both fail, the essential category routes above still remain available.
  const taskRoutes = unionTaskEntries(tasks.regular ?? [], tasks.pve ?? []).map(
    (entry) => `/progression/tasks/${taskSlugFor(entry.task)}`,
  );

  const taskEntries: MetadataRoute.Sitemap = taskRoutes.flatMap((route) =>
    publicLocales.map((locale) => ({
      url: urlFor(locale, route),
      alternates: alternatesFor(route),
    })),
  );

  return [...categoryEntries, ...taskEntries];
}
