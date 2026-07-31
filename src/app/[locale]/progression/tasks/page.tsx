import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { TasksExplorer } from '@/components/tasks/TasksExplorer';
import { QuestToolNav } from '@/components/progression/QuestToolNav';
import { ToolIntro } from '@/components/tools/ToolShell';
type Props = { params: Promise<{ locale: string }> };
export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'tasks', path: '/progression/tasks' });
}
export default async function TasksPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('tasks');
  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <QuestToolNav active="tasks" />
      <ToolIntro title={t('title')} description={t('subtitle')} />
      <TasksExplorer locale={locale} />
    </section>
  );
}
