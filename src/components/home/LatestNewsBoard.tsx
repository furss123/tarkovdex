import { getTranslations } from 'next-intl/server';
import { ArrowRight } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { Link } from '@/i18n/navigation';
import { formatDate } from '@/lib/format';
import { newsEntryAnchorId } from '@/lib/live/status';
import type { LiveEntry } from '@/types/live';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

export async function LatestNewsBoard({
  entries,
  locale,
}: {
  entries: LiveEntry[] | null;
  locale: Locale;
}) {
  const t = await getTranslations('home');

  return (
    <section aria-labelledby="latest-news-heading">
      <div className="flex items-center justify-between gap-4">
        <h2 id="latest-news-heading" className="text-base font-medium text-fg">
          {t('latestNewsTitle')}
        </h2>
        <Link
          href="/news"
          className="flex min-h-touch shrink-0 items-center gap-1 rounded text-xs text-muted underline-offset-4 transition-colors hover:text-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('viewAllNews')}
          <ArrowRight className="size-4 text-accent" aria-hidden="true" />
        </Link>
      </div>

      {entries === null ? (
        <div className="mt-3">
          <ErrorState title={t('latestNewsError')} />
        </div>
      ) : entries.length === 0 ? (
        <div className="mt-3">
          <EmptyState title={t('latestNewsEmpty')} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {entries.map((entry) => {
            const preview = entry.summary ?? entry.content;
            const categoryKey = `newsCategory.${entry.category}` as const;
            return (
              <article
                key={entry.id}
                className="flex min-w-0 flex-col rounded-lg border border-border bg-surface/30 p-4"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded border border-border px-2 py-0.5 text-xs text-muted">
                    {t(categoryKey)}
                  </span>
                  <time dateTime={entry.publishedAt} className="text-xs text-muted">
                    {formatDate(entry.publishedAt, locale)}
                  </time>
                </div>
                <h3 className="mt-3 line-clamp-2 text-sm font-medium text-fg">
                  {entry.title}
                </h3>
                {preview ? (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
                    {preview}
                  </p>
                ) : null}
                <div className="mt-auto pt-3">
                  <Link
                    href={`/news#${newsEntryAnchorId(entry.id)}`}
                    className="inline-flex min-h-touch items-center gap-1.5 rounded text-xs text-muted underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    {t('readNews')}
                    <ArrowRight className="size-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
