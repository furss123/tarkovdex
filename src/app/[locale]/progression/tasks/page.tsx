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
type Props = { params: Promise<{ locale: string }> };
// Structural quest data (not price data) — matches the 6h cadence getTasks()
// already caches at, so the SSR'd first page doesn't go stale between builds.
export const revalidate = 21600;
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

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <ToolIntro title={t('title')} description={t('subtitle')} />
      <Link href="/progression/gunsmith" className={RELATED_LINK_CLASS}>{t('relatedLink')}</Link>
      <TasksExplorer locale={locale} initialResponse={initialResponse} />
    </section>
  );
}
