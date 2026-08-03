'use client';

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { formatDate, formatDuration, formatKst } from '@/lib/format';
import { parseNewsFeedFilters, matchesNewsFilters } from '@/lib/newsroom/news-feed-filter';
import { selectLifecycleFeed } from '@/lib/newsroom/news-lifecycle';
import {
  excludeFeaturedStoryIds,
  hasNewerOfficialPost,
} from '@/lib/newsroom/news-refresh-signal';
import type { NewsroomCard } from '@/lib/newsroom/newsroom-projection';
import type { NewsCategoryV2, NewsStory } from '@/types/newsroom';
import { PatchImpactBlock } from './PatchImpactBlock';
import { projectLiveEntriesToPatchImpacts } from '@/lib/live/patch-impact';

const GAME_CATEGORIES: NewsCategoryV2[] = ['patch', 'hotfix', 'maintenance', 'outage', 'event', 'quest', 'trader', 'economy', 'item', 'ammo', 'armor', 'gameplay', 'map', 'boss', 'season-wipe', 'account-security'];
const MEDIA_CATEGORIES: NewsCategoryV2[] = ['video', 'trailer', 'teaser', 'broadcast', 'expo', 'tournament', 'esports', 'contest', 'drops', 'sale', 'merchandise', 'community', 'company'];
const ALL_CATEGORIES = [...GAME_CATEGORIES, ...MEDIA_CATEGORIES];
const IMPACT_CATEGORIES = new Set<NewsCategoryV2>(['patch', 'quest', 'economy', 'item', 'ammo', 'armor', 'map', 'boss', 'trader']);

function remaining(story: NewsStory, now: number | null): string | null {
  if (now == null) return null;
  const target = story.status === 'scheduled' ? story.startsAt : story.endsAt;
  if (!target) return null;
  const ms = Date.parse(target) - now;
  return ms > 0 ? formatDuration(ms) : null;
}

function StoryCard({ card, locale, now, featured = false }: { card: NewsroomCard; locale: Locale; now: number | null; featured?: boolean }) {
  const t = useTranslations('newsroom');
  const { story, translation, entry, processingStatus, patchSlug } = card;
  const impacts = IMPACT_CATEGORIES.has(story.category)
    ? projectLiveEntriesToPatchImpacts([entry], { now: now ?? Date.parse(entry.lastCheckedAt), observations: [] })
    : [];
  const countdown = remaining(story, now);
  return (
    <article id={`news-${story.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`} className={`min-w-0 rounded-lg border border-border bg-surface p-4 ${featured ? 'border-accent/40' : ''}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded border border-border px-2 py-1 text-muted">{t(`section.${story.section}`)}</span>
        <span className="rounded border border-border px-2 py-1 text-muted">{t(`category.${story.category}`)}</span>
        <span className="rounded border border-accent/40 px-2 py-1 text-accent">{t(`status.${story.status}`)}</span>
        <span className="rounded border border-border px-2 py-1 text-muted">{t(`game.${story.game}`)}</span>
        {story.gameModes.map((mode) => <span key={mode} className="rounded border border-border px-2 py-1 text-muted">{t(`mode.${mode}`)}</span>)}
        {processingStatus === 'partially_published' ? (
          <span className="rounded border border-border px-2 py-1 text-muted">{t('processing')}</span>
        ) : null}
      </div>
      <h3 className="mt-3 break-words text-base font-medium text-fg">{translation.title}</h3>
      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">{translation.summary}</p>
      {translation.facts.length > 0 ? <ul className="mt-3 space-y-1 pl-5 text-xs text-muted">{translation.facts.map((fact) => <li key={fact} className="list-disc">{fact}</li>)}</ul> : null}
      {(story.startsAt || story.endsAt || countdown) ? (
        <dl className="mt-3 grid gap-1 text-xs text-muted sm:grid-cols-2">
          {story.startsAt ? <div><dt className="inline text-fg">{t('starts')} </dt><dd className="inline">{formatKst(story.startsAt, locale)}</dd></div> : null}
          {story.endsAt ? <div><dt className="inline text-fg">{t('ends')} </dt><dd className="inline">{formatKst(story.endsAt, locale)}</dd></div> : null}
          {countdown ? <div><dt className="inline text-fg">{t('remaining')} </dt><dd className="inline tabular-nums">{countdown}</dd></div> : null}
        </dl>
      ) : null}
      {impacts[0] ? <PatchImpactBlock impact={impacts[0]} /> : null}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-border/60 pt-3 text-xs text-muted">
        <div>
          <p>{t('published')} {formatDate(story.publishedAt, locale)}</p>
          <p>{t('updated')} {formatDate(story.updatedAt, locale)} · {t(`translation.${translation.translationStatus}`)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {patchSlug ? (
            <Link
              href={`/news/patch/${patchSlug}`}
              className="inline-flex min-h-touch items-center gap-1.5 rounded px-2 text-fg underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('openPatch')}
            </Link>
          ) : null}
          <a href={story.sourceUrls[0]} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center gap-1.5 rounded px-2 text-fg underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
            {t('viewSource')}<ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </article>
  );
}

export function NewsroomBoard({ cards, locale, renderedAt }: { cards: NewsroomCard[]; locale: Locale; renderedAt: string }) {
  const t = useTranslations('newsroom');
  const router = useRouter();
  const pathname = usePathname();
  const [now, setNow] = useState<number | null>(null);
  const [filters, setFilters] = useState(() => parseNewsFeedFilters({}, ALL_CATEGORIES));
  const [latestSeen, setLatestSeen] = useState<string | null>(null);
  const [refreshAvailable, setRefreshAvailable] = useState(false);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setFilters(parseNewsFeedFilters({ section: params.get('section'), category: params.get('category'), game: params.get('game'), status: params.get('status') }, ALL_CATEGORIES));
    };
    read(); window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const newest = cards[0]?.story.publishedAt ?? null;
    if (!latestSeen) {
      setLatestSeen(newest);
      return;
    }
    if (hasNewerOfficialPost(latestSeen, newest)) {
      setRefreshAvailable(true);
    }
  }, [cards, latestSeen]);

  useEffect(() => {
    const onFocus = () => router.refresh();
    window.addEventListener('focus', onFocus);
    const timer = setInterval(() => router.refresh(), 300_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(timer);
    };
  }, [router]);

  const stories = useMemo(
    () => selectLifecycleFeed(cards.map((card) => card.story), now ?? Date.parse(renderedAt)),
    [cards, now, renderedAt],
  );
  const byId = useMemo(() => new Map(cards.map((card) => [card.story.id, card])), [cards]);
  const important = stories
    .filter((story) => ['critical', 'high'].includes(story.importance) && !['resolved', 'completed', 'cancelled'].includes(story.status))
    .slice(0, 3);
  const featuredIds = new Set(important.map((story) => story.id));
  const visible = excludeFeaturedStoryIds(
    stories.filter((story) => matchesNewsFilters(story, filters)),
    featuredIds,
  );
  const setQuery = (patch: Partial<typeof filters>) => {
    const next = { ...filters, ...patch };
    if (patch.section) next.category = 'all';
    setFilters(next);
    const params = new URLSearchParams();
    if (next.section !== 'game') params.set('section', next.section);
    if (next.category !== 'all') params.set('category', next.category);
    if (next.game !== 'all') params.set('game', next.game);
    if (next.status !== 'all') params.set('status', next.status);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  const sectionCategories =
    filters.section === 'media-promo' ? MEDIA_CATEGORIES : filters.section === 'game' ? GAME_CATEGORIES : ALL_CATEGORIES;

  return (
    <div className="space-y-10">
      {refreshAvailable ? (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-surface px-4 py-3 text-sm text-fg">
          <p>{t('newOfficialAvailable')}</p>
          <button
            type="button"
            className="min-h-touch rounded border border-border px-3 text-xs text-accent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            onClick={() => {
              setRefreshAvailable(false);
              setLatestSeen(cards[0]?.story.publishedAt ?? latestSeen);
              router.refresh();
            }}
          >
            {t('refreshNow')}
          </button>
        </div>
      ) : null}
      {important.length > 0 ? (
        <section aria-labelledby="important-news">
          <h2 id="important-news" className="text-sm font-medium text-fg">{t('important')}</h2>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {important.map((story) => {
              const card = byId.get(story.id);
              return card ? <StoryCard key={story.id} card={card} locale={locale} now={now} featured /> : null;
            })}
          </div>
        </section>
      ) : null}
      <section aria-labelledby="official-news">
        <h2 id="official-news" className="text-sm font-medium text-fg">{t('latest')}</h2>
        <div className="mt-3 grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[1fr_auto_auto]">
          <div role="tablist" aria-label={t('sectionFilter')} className="grid grid-cols-3 gap-1 rounded-lg bg-surface-2 p-1">
            {(['game', 'media-promo', 'all'] as const).map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={filters.section === section}
                onClick={() => setQuery({ section })}
                className={`min-h-touch rounded px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${filters.section === section ? 'bg-surface text-accent' : 'text-muted hover:text-fg'}`}
              >
                {t(`section.${section}`)}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs text-muted">
            <span>{t('categoryFilter')}</span>
            <select
              value={filters.category}
              onChange={(event) => setQuery({ category: event.target.value as NewsCategoryV2 | 'all' })}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg"
            >
              <option value="all">{t('all')}</option>
              {sectionCategories.map((category) => (
                <option key={category} value={category}>
                  {t(`category.${category}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            <span>{t('gameFilter')}</span>
            <select
              value={filters.game}
              onChange={(event) => setQuery({ game: event.target.value as typeof filters.game })}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg"
            >
              <option value="all">{t('all')}</option>
              <option value="eft">EFT</option>
              <option value="arena">Arena</option>
            </select>
          </label>
        </div>
        {visible.length > 0 ? (
          <div role="tabpanel" className="mt-4 grid gap-3">
            {visible.map((story) => {
              const card = byId.get(story.id);
              return card ? <StoryCard key={story.id} card={card} locale={locale} now={now} /> : null;
            })}
          </div>
        ) : (
          <p role="status" className="mt-4 rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
            {cards.length === 0 ? t('emptyOfficial') : t('emptyFilter')}
          </p>
        )}
      </section>
    </div>
  );
}
