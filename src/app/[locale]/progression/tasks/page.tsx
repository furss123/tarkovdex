import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getTasks } from '@/lib/tarkov';
import { queryTasks } from '@/lib/task-query';
import { TasksExplorer } from '@/components/tasks/TasksExplorer';
import { ToolIntro } from '@/components/tools/ToolShell';
import { Link } from '@/i18n/navigation';
import { RELATED_LINK_CLASS } from '@/components/tools/relatedLinkClass';
import type { TasksResponse } from '@/types/tarkov';
import { domainHealth } from '@/lib/data-observations';
type Props = { params: Promise<{ locale: string }> };
// Structural quest data (not price data) — matches the 6h cadence getTasks()
// already caches at, so the SSR'd first page doesn't go stale between builds.
// `force-static` is the deterministic guarantee that this route builds as
// static/ISR rather than executing per request — see Phase 1.5 caching audit:
// getTasks() also pulls the maps endpoint (via getMapNameIndex) for map-name
// resolution, and that fetch is large enough that `revalidate` alone was
// empirically flaky across repeated builds.
export const revalidate = 21600;
export const dynamic = 'force-static';
export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'tasks', path: '/progression/tasks' });
}
export default async function TasksPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('tasks');

  // Server-render the same default first page TasksExplorer would otherwise
  // fetch client-side on mount (regular/PvP mode, no search/trader/map
  // filter) — see src/lib/task-query.ts, shared with /api/tasks so the two
  // never compute "the first page" differently.
  let initialResponse: TasksResponse | null = null;
  try {
    const tasks = await getTasks({ locale, gameMode: 'regular' });
    initialResponse = queryTasks(tasks, 'regular', {
      query: '',
      locale,
      traderId: '',
      mapId: '',
      page: 1,
    });
  } catch {
    // Initial SSR fetch is a progressive enhancement — TasksExplorer's own
    // client fetch (and its existing error/retry UI) still runs if this fails.
  }

  // Quests carry no upstream content timestamp at all, so the badge reports
  // observation and availability only. A failed server render is `partial`
  // rather than `unavailable` because TasksExplorer's own client fetch still
  // has a chance to fill the list in.
  const health = domainHealth({
    domain: 'quests',
    gameMode: 'regular',
    locale,
    availability: initialResponse ? 'available' : 'partial',
    ...(initialResponse ? { totalCount: initialResponse.total } : {}),
  });

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <ToolIntro
        title={t('title')}
        description={t('subtitle')}
        locale={locale}
        health={health}
      />
      <Link href="/progression/gunsmith" className={RELATED_LINK_CLASS}>{t('relatedLink')}</Link>
      <Link href="/progression/tasks/tracker" className={RELATED_LINK_CLASS}>{t('trackerLink')}</Link>
      <TasksExplorer locale={locale} initialResponse={initialResponse} />
    </section>
  );
}
