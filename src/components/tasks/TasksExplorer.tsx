'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { Task } from '@/types/tarkov';
import { useGameMode } from '@/contexts/GameModeContext';
import { TaskSearch } from './TaskSearch';
import { TaskFilters, type FilterOption } from './TaskFilters';
import { TaskCard } from './TaskCard';
import {
  TraderPortraitFilter,
  type TraderFilterOption,
} from './TraderPortraitFilter';

type TaskSearchResponse = {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  filters: {
    traders: TraderFilterOption[];
    maps: FilterOption[];
  };
};

export function TasksExplorer({ locale }: { locale: Locale }) {
  const t = useTranslations('tasks');
  const { gameMode } = useGameMode();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [traderId, setTraderId] = useState('');
  const [mapId, setMapId] = useState('');
  const [focusTaskId, setFocusTaskId] = useState('');
  const [data, setData] = useState<TaskSearchResponse>({
    tasks: [],
    total: 0,
    page: 1,
    pageSize: 40,
    hasMore: false,
    filters: { traders: [], maps: [] },
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

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

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams(baseParams);
    params.set('page', '1');
    setLoading(true);
    setFailed(false);

    fetch(`/api/tasks?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('task request failed');
        return response.json() as Promise<TaskSearchResponse>;
      })
      .then(setData)
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setFailed(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [baseParams]);

  async function loadMore() {
    if (!data.hasMore || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams(baseParams);
    params.set('page', String(data.page + 1));
    try {
      const response = await fetch(`/api/tasks?${params.toString()}`);
      if (!response.ok) throw new Error('task request failed');
      const next = (await response.json()) as TaskSearchResponse;
      setData((current) => ({
        ...next,
        tasks: [...current.tasks, ...next.tasks],
      }));
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
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
                    sequence={(data.page - 1) * data.pageSize + index + 1}
                    focused={task.id === focusTaskId}
                    onOpenTask={openTask}
                  />
                ))}
              </div>
              {data.hasMore ? (
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
