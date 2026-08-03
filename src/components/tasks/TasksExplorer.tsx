'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { TasksResponse } from '@/types/tarkov';
import { useGameMode } from '@/contexts/GameModeContext';
import { TaskSearch } from './TaskSearch';
import { TaskFilters } from './TaskFilters';
import { TaskCard } from './TaskCard';
import { TraderPortraitFilter } from './TraderPortraitFilter';

const EMPTY_RESPONSE: TasksResponse = {
  tasks: [],
  total: 0,
  page: 1,
  pageSize: 40,
  hasMore: false,
  filters: { traders: [], maps: [] },
  gameMode: 'regular',
  source: 'json.tarkov.dev',
};

export function TasksExplorer({
  locale,
  initialResponse,
}: {
  locale: Locale;
  /** Server-rendered default-query first page (regular mode, no search/trader/
   * map filter, page 1) — see progression/tasks/page.tsx. Lets the initial
   * HTML contain real quest names and lets hydration skip re-fetching the
   * exact same query. */
  initialResponse?: TasksResponse | null;
}) {
  const t = useTranslations('tasks');
  const { gameMode } = useGameMode();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchComposing, setSearchComposing] = useState(false);
  const [traderId, setTraderId] = useState('');
  const [mapId, setMapId] = useState('');
  const [focusTaskId, setFocusTaskId] = useState('');
  const [data, setData] = useState<TasksResponse>(initialResponse ?? EMPTY_RESPONSE);
  const [loading, setLoading] = useState(!initialResponse);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const skippableInitialFetch = useRef(Boolean(initialResponse));
  const loadMoreControllerRef = useRef<AbortController | null>(null);
  const activeQueryKeyRef = useRef('');

  useEffect(() => {
    if (searchComposing) return;
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search, searchComposing]);

  /**
   * Jump to a prerequisite quest from an open quest's requirement list: search
   * for it by name (clearing the trader/map filters, which would otherwise
   * hide it) and mark it focused so its card opens and scrolls into view.
   */
  function openTask(taskId: string, taskName: string) {
    setTraderId('');
    setMapId('');
    setSearch(taskName);
    setDebouncedSearch(taskName);
    setFocusTaskId(taskId);
  }

  const baseParams = useMemo(
    () =>
      new URLSearchParams({
        view: 'guide-v2',
        locale,
        mode: gameMode,
        q: debouncedSearch,
        trader: traderId,
        map: mapId,
      }),
    [locale, gameMode, debouncedSearch, traderId, mapId],
  );
  const queryKey = baseParams.toString();
  activeQueryKeyRef.current = queryKey;

  useEffect(
    () => () => {
      loadMoreControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = null;
    setLoadingMore(false);
    setLoadMoreFailed(false);

    if (skippableInitialFetch.current) {
      skippableInitialFetch.current = false;
      const isDefaultQuery =
        baseParams.get('mode') === 'regular' &&
        baseParams.get('q') === '' &&
        baseParams.get('trader') === '' &&
        baseParams.get('map') === '';
      // The server already rendered this exact default query as `data`'s
      // initial state — don't immediately re-fetch the same page on mount.
      if (isDefaultQuery) return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams(baseParams);
    params.set('page', '1');
    setLoading(true);
    setFailed(false);

    fetch(`/api/tasks?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('task request failed');
        return response.json() as Promise<TasksResponse>;
      })
      .then((next) => {
        if (activeQueryKeyRef.current === queryKey) setData(next);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [baseParams, queryKey]);

  async function loadMore() {
    if (!data.hasMore || loadingMore) return;
    const requestQueryKey = queryKey;
    const controller = new AbortController();
    loadMoreControllerRef.current?.abort();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setLoadMoreFailed(false);
    const params = new URLSearchParams(baseParams);
    params.set('page', String(data.page + 1));
    try {
      const response = await fetch(`/api/tasks?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('task request failed');
      const next = (await response.json()) as TasksResponse;
      if (controller.signal.aborted || activeQueryKeyRef.current !== requestQueryKey) {
        return;
      }
      setData((current) => {
        if (current.page + 1 !== next.page) return current;
        return {
          ...next,
          tasks: [...current.tasks, ...next.tasks],
        };
      });
    } catch (error: unknown) {
      if (
        !(error instanceof DOMException && error.name === 'AbortError') &&
        activeQueryKeyRef.current === requestQueryKey
      ) {
        setLoadMoreFailed(true);
      }
    } finally {
      if (loadMoreControllerRef.current === controller) {
        loadMoreControllerRef.current = null;
        if (activeQueryKeyRef.current === requestQueryKey) setLoadingMore(false);
      }
    }
  }

  return (
    <div>
      {failed ? (
        <div className="rounded-lg border border-negative/40 px-4 py-12 text-center text-sm text-muted">
          <p>{t('error')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex min-h-touch items-center gap-2 rounded-md border border-border px-4 text-fg"
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('retry')}
          </button>
        </div>
      ) : loading ? (
        <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
          {t('loading')}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TaskSearch
              value={search}
              onChange={(value) => {
                setSearch(value);
                setFocusTaskId('');
              }}
              onCompositionStart={() => setSearchComposing(true)}
              onCompositionEnd={() => setSearchComposing(false)}
            />
            <TaskFilters
              maps={data.filters.maps}
              mapId={mapId}
              onMapChange={setMapId}
            />
          </div>

          <TraderPortraitFilter
            traders={data.filters.traders}
            selectedId={traderId}
            onChange={setTraderId}
          />

          {data.tasks.length === 0 ? (
            <div className="rounded-lg border border-border px-4 py-12 text-center">
              <p className="text-sm text-fg">{t('empty')}</p>
              <p className="mt-1 text-sm text-muted">{t('emptyHint')}</p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-muted">
                {t('resultCount', { count: data.total })}
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                {data.tasks.map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    sequence={index + 1}
                    focused={task.id === focusTaskId}
                    onOpenTask={openTask}
                  />
                ))}
              </div>
              {loadMoreFailed ? (
                <div
                  role="alert"
                  className="mt-4 flex flex-wrap items-center justify-center gap-3 rounded-md border border-negative/40 px-4 py-3 text-sm text-muted"
                >
                  <span>{t('error')}</span>
                  <button
                    type="button"
                    onClick={loadMore}
                    className="min-h-touch rounded-md border border-border px-4 text-fg hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                  >
                    {t('retry')}
                  </button>
                </div>
              ) : data.hasMore ? (
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="min-h-touch rounded-md border border-border px-5 text-sm text-fg hover:border-accent disabled:opacity-50"
                  >
                    {loadingMore ? t('loading') : t('loadMore')}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}
