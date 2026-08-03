'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Search, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  buildRequiredItemIndex,
  enrichSearchHit,
  type EnrichedSearchHit,
  type SearchDocument,
  type SearchDomain,
  type SearchResultSet,
  isSearchDomain,
} from '@/lib/search';
import {
  clearRecentSearches,
  getQuestProgress,
  recordRecentSearch,
  removeRecentSearch,
  useLocalState,
} from '@/lib/local-state';
import { EmptyState, ErrorState, PartialDataNotice } from '@/components/status/StatusUI';
import { SearchHitButton, SearchRelatedList } from './SearchResults';

type SearchApiResponse = SearchResultSet & {
  related?: SearchDocument[];
  meta?: {
    partial: boolean;
    failedDomains: SearchDomain[];
  };
  error?: string;
};

function flattenHits(groups: SearchResultSet['groups']): EnrichedSearchHit[] {
  return groups.flatMap((group) => group.results);
}

export function SearchDialog({
  open,
  onClose,
  initialQuery = '',
}: {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}) {
  const t = useTranslations('search');
  const locale = useLocale();
  const router = useRouter();
  const { gameMode } = useGameMode();
  const localState = useLocalState();
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const listId = useId();

  const [query, setQuery] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [response, setResponse] = useState<SearchApiResponse | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery(initialQuery);
    setDebounced(initialQuery);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, initialQuery]);

  // Mobile soft keyboards shrink the visual viewport; pin the dialog to that
  // height so the sticky input stays visible and results remain scrollable.
  // Desktop keeps the CSS max-height and never receives inline overrides.
  useEffect(() => {
    if (!open) return;
    const el = dialogRef.current;
    const vv = window.visualViewport;
    if (!el || !vv) return;

    function sync() {
      if (!el) return;
      const isMobileLayout = window.matchMedia('(max-width: 639px)').matches;
      if (!isMobileLayout || !vv) {
        el.style.height = '';
        el.style.maxHeight = '';
        el.style.transform = '';
        return;
      }
      const height = Math.max(240, Math.round(vv.height));
      el.style.height = `${height}px`;
      el.style.maxHeight = `${height}px`;
      el.style.transform = vv.offsetTop ? `translateY(${Math.round(vv.offsetTop)}px)` : '';
    }

    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      el.style.height = '';
      el.style.maxHeight = '';
      el.style.transform = '';
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const controller = new AbortController();

    async function run() {
      if (!debounced) {
        setResponse(null);
        setError(false);
        setLoading(false);
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
        const res = await fetch(`/api/search?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error('search failed');
        const data = (await res.json()) as SearchApiResponse;
        if (cancelled) return;
        setResponse(data);
        setActiveIndex(0);
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
  }, [debounced, locale, gameMode, open]);

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

  const flat = useMemo(() => flattenHits(enrichedGroups), [enrichedGroups]);

  const selectDocument = useCallback(
    (doc: SearchDocument) => {
      recordRecentSearch({
        query: debounced || doc.title,
        locale,
        selectedDomain: doc.domain,
        selectedId: doc.id,
      });
      onClose();
      router.push(doc.href);
    },
    [debounced, locale, onClose, router],
  );

  const goToFullResults = useCallback(() => {
    if (!debounced) return;
    recordRecentSearch({ query: debounced, locale });
    onClose();
    router.push(`/search?q=${encodeURIComponent(debounced)}`);
  }, [debounced, locale, onClose, router]);

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, Math.max(flat.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const hit = flat[activeIndex];
      if (hit) selectDocument(hit.document);
      else if (debounced) goToFullResults();
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    goToFullResults();
  }

  if (!open) return null;

  const recent = localState.recentSearches;

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-bg/80 p-0 sm:items-start sm:bg-bg/70 sm:p-6 sm:pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('title')}
        className="flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col border-border bg-bg sm:h-auto sm:max-h-[min(80vh,720px)] sm:rounded-lg sm:border"
        onKeyDown={onKeyDown}
      >
        <form
          onSubmit={onSubmit}
          className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-bg px-3 py-2"
          style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
        >
          <Search className="size-4 shrink-0 text-muted" aria-hidden="true" />
          <label htmlFor="unified-search-input" className="sr-only">
            {t('placeholder')}
          </label>
          <input
            ref={inputRef}
            id="unified-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('placeholder')}
            autoComplete="off"
            aria-controls={listId}
            aria-autocomplete="list"
            className="min-h-touch w-full bg-transparent text-base text-fg placeholder:text-muted focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="flex size-touch shrink-0 items-center justify-center rounded-md text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <div className="sr-only" aria-live="polite">
            {loading ? t('loading') : null}
            {response ? t('resultCount', { count: response.total }) : null}
          </div>

          {response?.meta?.partial ? (
            <div className="mb-3">
              <PartialDataNotice message={t('partial')} />
            </div>
          ) : null}

          {error ? (
            <ErrorState
              title={t('noResults')}
              hint={t('tryDifferent')}
              action={
                <button
                  type="button"
                  className="min-h-touch rounded-md border border-border px-3 text-sm text-fg"
                  onClick={() => setDebounced(query.trim())}
                >
                  {t('retry')}
                </button>
              }
            />
          ) : null}

          {!debounced && recent.length ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs text-muted">{t('recent')}</p>
                <button
                  type="button"
                  onClick={() => clearRecentSearches()}
                  className="min-h-touch text-xs text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  {t('clearRecent')}
                </button>
              </div>
              <ul className="space-y-1">
                {recent.map((entry) => (
                  <li key={entry.normalizedQuery} className="flex items-stretch gap-1">
                    <button
                      type="button"
                      className="min-h-touch flex-1 rounded-md px-2 text-left text-sm text-fg hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      onClick={() => {
                        setQuery(entry.query);
                        setDebounced(entry.query);
                      }}
                    >
                      {entry.query}
                    </button>
                    <button
                      type="button"
                      aria-label={t('removeRecent')}
                      className="flex size-touch items-center justify-center text-muted hover:text-fg"
                      onClick={() => removeRecentSearch(entry.normalizedQuery)}
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!debounced && !recent.length ? (
            <EmptyState title={t('emptyPrompt')} hint={t('hint')} />
          ) : null}

          {debounced && !loading && !error && response && response.total === 0 ? (
            <EmptyState title={t('noResults')} hint={t('tryDifferent')} />
          ) : null}

          {debounced && loading ? (
            <p className="py-8 text-center text-sm text-muted">{t('loading')}</p>
          ) : null}

          <div id={listId} role="listbox" aria-label={t('results')} className="space-y-4">
            {enrichedGroups.map((group) => (
              <section key={group.domain}>
                <h2 className="mb-1 text-xs text-muted">
                  {t(`domains.${group.domain}`)}
                </h2>
                <div className="space-y-1">
                  {group.results.map((hit) => {
                    const flatIndex = flat.findIndex(
                      (row) =>
                        row.document.domain === hit.document.domain &&
                        row.document.id === hit.document.id,
                    );
                    return (
                      <SearchHitButton
                        key={`${hit.document.domain}:${hit.document.id}`}
                        id={`${listId}-${flatIndex}`}
                        hit={hit}
                        active={flatIndex === activeIndex}
                        onSelect={() => selectDocument(hit.document)}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {response?.related?.length ? (
            <SearchRelatedList
              related={response.related}
              onSelect={selectDocument}
            />
          ) : null}

          {debounced && response && response.total > 0 ? (
            <button
              type="button"
              onClick={goToFullResults}
              className="mt-4 flex min-h-touch w-full items-center justify-center rounded-md border border-border text-sm text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('viewAll')}
            </button>
          ) : null}
        </div>

        <p className="hidden border-t border-border px-3 py-2 text-xs text-muted sm:block">
          {t('shortcutHint')}
        </p>
      </div>
    </div>
  );
}

export function isSearchDomainParam(value: string | null): value is SearchDomain {
  return value !== null && isSearchDomain(value);
}
