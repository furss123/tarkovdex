import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { buildPageMetadata } from '@/lib/metadata';
import { getLocalizedNews } from '@/lib/translate-news';
import type { SteamNewsFeed } from '@/lib/steam-news';
import { NewsCard } from '@/components/news/NewsCard';
import { ToolIntro } from '@/components/tools/ToolShell';

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  return buildPageMetadata({ locale, page: 'news', path: '/news' });
}

/**
 * Patch notes + events, sourced automatically from Escape from Tarkov's
 * official Steam News RSS feed and split into two sections by title pattern
 * (BSG consistently titles patch posts "Patch X.X.X.X" — see
 * lib/steam-news.ts). No manual curation: whatever Steam has posted most
 * recently is what renders here, refreshed on the same ISR model as every
 * other page. ko/zh are translated via `getLocalizedNews()` (see
 * lib/translate-news.ts); en renders Steam's original text as-is. See
 * CLAUDE.md > "News page (patch notes + events)".
 */
export default async function NewsPage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const t = await getTranslations('news');

  let feed: SteamNewsFeed = { patchNotes: [], events: [] };
  let failed = false;
  try {
    feed = await getLocalizedNews(locale);
  } catch {
    failed = true;
  }

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <ToolIntro title={t('title')} description={t('description')} showMode={false} />

      {failed ? (
        <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
          {t('error')}
        </div>
      ) : (
        <div className="space-y-10">
          <div>
            <h2 className="text-sm font-medium text-fg">{t('patchNotesTitle')}</h2>
            {feed.patchNotes.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                {feed.patchNotes.map((item) => (
                  <NewsCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{t('empty')}</p>
            )}
          </div>

          <div>
            <h2 className="text-sm font-medium text-fg">{t('eventsTitle')}</h2>
            {feed.events.length > 0 ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-border">
                {feed.events.map((item) => (
                  <NewsCard key={item.id} item={item} locale={locale} />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{t('empty')}</p>
            )}
          </div>

          <p className="text-xs text-muted">{t('sourceNote')}</p>
        </div>
      )}
    </section>
  );
}
