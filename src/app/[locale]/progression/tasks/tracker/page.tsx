import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { Link } from '@/i18n/navigation';
import { QuestTracker } from '@/components/progression/QuestTracker';

type Props = { params: Promise<{ locale: string }> };

/**
 * `noindex`, not `Disallow`ed — unlike `/admin/live` this needs no auth and
 * has nothing sensitive; it's excluded from search results only because its
 * entire content is a fresh visitor's *own* empty local state (no active
 * quests, no plans) until they use it, which is not something worth
 * indexing. Kept in the normal sitemap/footer link surface and left
 * crawlable/followable otherwise — see
 * docs/architecture/tarkovdex-local-state.md §6.8 for the full reasoning.
 */
export async function generateMetadata({ params }: Props) {
  const locale = (await params).locale as Locale;
  const base = await buildPageMetadata({
    locale,
    page: 'questTracker',
    path: '/progression/tasks/tracker',
  });
  return { ...base, robots: { index: false, follow: true } };
}

export default async function QuestTrackerPage({ params }: Props) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations('questTracker');

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <header className="mb-6">
        <Link
          href="/progression/tasks"
          className="inline-flex min-h-touch items-center text-[14px] text-muted underline-offset-4 hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('backToList')}
        </Link>
        <h1 className="mt-2 text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {t('title')}
        </h1>
        <p className="mt-2 max-w-3xl text-[16px] leading-6 text-muted">{t('description')}</p>
      </header>
      <QuestTracker locale={locale} />
    </section>
  );
}
