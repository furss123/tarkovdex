import { permanentRedirect } from 'next/navigation';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'tasks', path: '/progression/tasks' });
}

/**
 * Fetches both PvP (regular) and PvE task lists — the two genuinely differ
 * (confirmed live: 27 tasks are PvP-only, 23 are PvE-only out of ~500), not
 * just a translation-dictionary quirk. See CLAUDE.md > "Global PvP/PvE mode".
 */
export default async function TasksPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  permanentRedirect(`/${locale}/progression/tasks`);
}
