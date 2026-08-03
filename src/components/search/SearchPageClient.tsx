'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  buildRequiredItemIndex,
  enrichSearchHit,
  isSearchDomain,
  type SearchDocument,
  type SearchDomain,
  type SearchResultSet,
} from '@/lib/search';
import {
  getQuestProgress,
  recordRecentSearch,
  useLocalState,
} from '@/lib/local-state';
import {
  EmptyState,
  ErrorState,
  PartialDataNotice,
} from '@/components/status/StatusUI';
import { SearchHitButton, SearchRelatedList } from '@/components/search/SearchResults';
import { SEARCH_DOMAINS } from '@/lib/search';

type SearchApiResponse = SearchResultSet & {
  related?: SearchDocument[];
  meta?: { partial: boolean; failedDomains: SearchDomain[] };
};

export function SearchPageClient({
  initialQuery,
  initialDomain,
}: {
  initialQuery: string;
  initialDomain: string | null;
}) {
  const t = useTranslations('search');
  const locale = useLocale();
  const router = useRouter();
  const { gameMode } = useGameMode();
  useLocalState();

  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [domain, setDomain] = useState<SearchDomain | null>(
    initialDomain && isSearchDomain(initialDomain) ? initialDomain : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [response, setResponse] = useState<SearchApiResponse | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debounced) params.set('q', debounced);
    if (domain) params.set('domain', domain);
    const next = params.toString();
    const path = next ? `/search?${next}` : '/search';
    window.history.replaceState(window.history.state, '', `/${locale}${path}`);
  }, [debounced, domain, locale]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      if (!debounced) {
        setResponse(null);
        setLoading(false);
        setError(false);
        return;
      }
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({
          q: debounced,
          locale,
          mode: gameMode,
        });
        if (domain) params.set('domain', domain);
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('failed');
        const data = (await res.json()) as SearchApiResponse;
        if (cancelled) return;
        setResponse(data);
        recordRecentSearch({ query: debounced, locale });
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(true);
        setResponse(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [debounced, domain, locale, gameMode]);

  const questProgress = getQuestProgress(gameMode);
  const requiredItemTaskIds = useMemo(() => {
    const pairs: Array<{ itemId: string; taskId: string }> = [];
    for (const group of response?.groups ?? []) {
      for (const hit of group.results) {
        for (const taskId of hit.document.relations?.taskIds ?? []) {
          pairs.push({ itemId: hit.document.id, taskId });
        }
      }
    }
    return buildRequiredItemIndex(pairs, new Set(questProgress.activeQuestIds));
  }, [response, questProgress.activeQuestIds]);

  const enrichedGroups = useMemo(() => {
    if (!response) return [];
    const user = {
      activeQuestIds: new Set(questProgress.activeQuestIds),
      completedQuestIds: new Set(questProgress.completedQuestIds),
      ownedItemCounts: questProgress.ownedItemCounts,
      requiredItemTaskIds,
    };
    return response.groups.map((group) => ({
      domain: group.domain,
      results: group.results.map((hit) => enrichSearchHit(hit, user, gameMode)),
    }));
  }, [response, questProgress, requiredItemTaskIds, gameMode]);

  return (
    <div className="mx-auto max-w-content px-4 py-8 sm:px-6">
      <h1 className="text-xl text-fg">{t('title')}</h1>
      <p className="mt-1 text-sm text-muted">{t('hint')}</p>

      <label className="mt-6 block">
        <span className="sr-only">{t('placeholder')}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('placeholder')}
          className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-base text-fg placeholder:text-muted focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      </label>

      <div
        role="group"
        aria-label={t('filterAll')}
        className="mt-4 flex flex-wrap gap-2"
      >
        <button
          type="button"
          onClick={() => setDomain(null)}
          className={`min-h-touch rounded-md border px-3 text-sm ${
            domain === null
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border text-muted hover:text-fg'
          }`}
        >
          {t('filterAll')}
        </button>
        {SEARCH_DOMAINS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setDomain(value)}
            className={`min-h-touch rounded-md border px-3 text-sm ${
              domain === value
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border text-muted hover:text-fg'
            }`}
          >
            {t(`domains.${value}`)}
          </button>
        ))}
      </div>

      <div className="mt-6 space-y-4">
        {response?.meta?.partial ? <PartialDataNotice message={t('partial')} /> : null}
        {error ? (
          <ErrorState title={t('noResults')} hint={t('tryDifferent')} />
        ) : null}
        {!debounced ? <EmptyState title={t('emptyPrompt')} hint={t('hint')} /> : null}
        {debounced && loading ? (
          <p className="py-8 text-center text-sm text-muted">{t('loading')}</p>
        ) : null}
        {debounced && !loading && response && response.total === 0 ? (
          <EmptyState title={t('noResults')} hint={t('tryDifferent')} />
        ) : null}

        {enrichedGroups.map((group) => (
          <section key={group.domain}>
            <h2 className="mb-2 text-sm text-muted">{t(`domains.${group.domain}`)}</h2>
            <div className="space-y-1">
              {group.results.map((hit) => (
                <SearchHitButton
                  key={`${hit.document.domain}:${hit.document.id}`}
                  id={`search-page-${hit.document.domain}-${hit.document.id}`}
                  hit={hit}
                  active={false}
                  onSelect={() => {
                    recordRecentSearch({
                      query: debounced,
                      locale,
                      selectedDomain: hit.document.domain,
                      selectedId: hit.document.id,
                    });
                    router.push(hit.document.href);
                  }}
                />
              ))}
            </div>
          </section>
        ))}

        {response?.related?.length ? (
          <SearchRelatedList
            related={response.related}
            onSelect={(doc) => router.push(doc.href)}
          />
        ) : null}
      </div>
    </div>
  );
}
