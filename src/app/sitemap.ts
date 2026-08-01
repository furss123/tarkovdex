import type { MetadataRoute } from 'next';
import { locales, defaultLocale, type Locale } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';
import { X_DEFAULT_LOCALE } from '@/lib/metadata';
import { getTasks } from '@/lib/tarkov';
import { unionTaskEntries } from '@/lib/task-availability';
import { taskSlugFor } from '@/lib/task-slug';

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

function urlFor(locale: Locale, route: string): string {
  return `${SITE_URL}/${locale}${route}`;
}

function alternatesFor(route: string) {
  return {
    languages: Object.fromEntries([
      ...locales.map((l) => [l, urlFor(l, route)]),
      ['x-default', urlFor(X_DEFAULT_LOCALE, route)],
    ]),
  };
}

/**
 * One entry per locale x route, each carrying `alternates.languages` pointing
 * at its sibling locales — mirrors the hreflang symmetry decision in
 * CLAUDE.md (`localePrefix: 'always'`, so every locale's URL shape matches).
 *
 * Quest detail URLs are appended the same way: `getTasks()` is called once
 * for a single locale ('en') for both game modes — the canonical slug is
 * always built from the English name (see lib/task-slug.ts), so it's
 * identical across en/ko/zh and doesn't need fetching per-locale. Regular and
 * PvE are deduped by id via the same `unionTaskEntries` helper the detail
 * route's `generateStaticParams` uses, so this list can never disagree with
 * what's actually prerendered — see CLAUDE.md > Phase 2B for the 524-unique
 * (501 regular + 23 PvE-only) count this produces.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const categoryEntries: MetadataRoute.Sitemap = ROUTES.flatMap((route) =>
    locales.map((locale) => ({
      url: urlFor(locale, route),
      alternates: alternatesFor(route),
      ...(locale === defaultLocale ? { priority: route === '' ? 1 : 0.8 } : {}),
    })),
  );

  const [regularTasks, pveTasks] = await Promise.all([
    getTasks({ locale: 'en', gameMode: 'regular' }),
    getTasks({ locale: 'en', gameMode: 'pve' }),
  ]);
  const taskRoutes = unionTaskEntries(regularTasks, pveTasks).map(
    (entry) => `/progression/tasks/${taskSlugFor(entry.task)}`,
  );

  const taskEntries: MetadataRoute.Sitemap = taskRoutes.flatMap((route) =>
    locales.map((locale) => ({
      url: urlFor(locale, route),
      alternates: alternatesFor(route),
    })),
  );

  return [...categoryEntries, ...taskEntries];
}
