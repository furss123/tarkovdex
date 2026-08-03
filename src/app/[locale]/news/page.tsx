import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getLiveFeed } from '@/lib/live/feed';
import type { LiveFeed } from '@/types/live';
import { NewsroomBoard } from '@/components/news/NewsroomBoard';
import { projectOfficialFeed } from '@/lib/newsroom/newsroom-projection';
import { ToolIntro } from '@/components/tools/ToolShell';

type PageProps = {
  params: Promise<{ locale: string }>;
};

/**
 * Regenerated every 5 minutes. The client refreshes this Server Component on
 * the same cadence, while event status/countdowns continue to update locally
 * every second between source checks.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'news', path: '/news' });
}

/**
 * Tarkov Live — the situation board that replaced the plain Steam news list.
 *
 * Answers, top-down: what's running right now, which mode it applies to, when
 * it ends in Korean time, what it changes, what to do about it, and how
 * trustworthy the claim is. Steam's official feed is still the primary
 * source and still uses the committed ko/zh translations; X, Telegram and
 * hand-curated entries merge into the same board through
 * `lib/live/sources.ts`. See CLAUDE.md > "Tarkov Live".
 *
 * Phase 7 adds a PatchImpact projection over the same entries (impact areas,
 * review/confidence, conservative data-sync status) without a second pipeline.
 */
export default async function NewsPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const t = await getTranslations('newsroom');

  let feed: LiveFeed | null = null;
  try {
    feed = await getLiveFeed(locale);
  } catch {
    feed = null;
  }

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <ToolIntro title={t('title')} description={t('description')} showMode={false} />

      {feed ? (
        <NewsroomBoard cards={projectOfficialFeed(feed.entries, locale)} locale={locale} renderedAt={feed.renderedAt} />
      ) : (
        <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
          {t('error')}
        </div>
      )}

      <p className="mt-10 text-xs text-muted">{t('sourceNote')}</p>
    </section>
  );
}
