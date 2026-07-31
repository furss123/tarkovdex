'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Database,
  Filter,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { MarketItemsResponse } from '@/types/tarkov';
import { useGameMode } from '@/contexts/GameModeContext';
import { formatRelativeTime } from '@/lib/format';
import { ItemSearch } from './ItemSearch';
import { ItemsTable, type ItemSort } from './ItemsTable';

const DEFAULT_SORT: ItemSort = 'valuePerSlot';
const DEFAULT_DIRECTION = 'desc';
const DEFAULT_FEE = 5;

const EMPTY_RESPONSE: MarketItemsResponse = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 50,
  hasMore: false,
  meta: {
    source: 'json.tarkov.dev',
    sourceUpdatedAt: null,
    generatedAt: new Date(0).toISOString(),
    gameMode: 'regular',
    feeRate: DEFAULT_FEE,
  },
};

const SORT_VALUES: ItemSort[] = [
  'valuePerSlot',
  'referenceValue',
  'change',
  'freshness',
  'name',
];

type FilterFieldsProps = {
  category: string;
  setCategory: (value: string) => void;
  sale: string;
  setSale: (value: string) => void;
  sort: ItemSort;
  setSort: (value: ItemSort) => void;
  direction: 'asc' | 'desc';
  setDirection: (value: 'asc' | 'desc') => void;
  feeRate: number;
  setFeeRate: (value: number) => void;
};

function FilterFields({
  category,
  setCategory,
  sale,
  setSale,
  sort,
  setSort,
  direction,
  setDirection,
  feeRate,
  setFeeRate,
}: FilterFieldsProps) {
  const t = useTranslations('items');
  const fieldClass =
    'h-[44px] w-full rounded-md border border-border bg-bg px-3 text-[14px] leading-5 text-fg focus:border-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

  return (
    <>
      <label className="block text-[12px] leading-4 text-muted">
        <span className="mb-1 block">{t('categoryLabel')}</span>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className={fieldClass}
        >
          {['all', 'barter', 'ammo', 'gun', 'armor', 'provisions', 'meds', 'keys'].map(
            (value) => (
              <option key={value} value={value}>
                {t(`categories.${value}`)}
              </option>
            ),
          )}
        </select>
      </label>

      <label className="block text-[12px] leading-4 text-muted">
        <span className="mb-1 block">{t('saleLabel')}</span>
        <select
          value={sale}
          onChange={(event) => setSale(event.target.value)}
          className={fieldClass}
        >
          {['all', 'flea', 'trader'].map((value) => (
            <option key={value} value={value}>
              {t(`saleOptions.${value}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-[12px] leading-4 text-muted">
        <span className="mb-1 block">{t('sortLabel')}</span>
        <div className="flex">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as ItemSort)}
            className={`${fieldClass} min-w-0 flex-1 rounded-r-none`}
          >
            {SORT_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`sortOptions.${value}`)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setDirection(direction === 'desc' ? 'asc' : 'desc')}
            className="flex size-[44px] shrink-0 items-center justify-center rounded-r-md border border-l-0 border-border bg-bg text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`${t('toggleDirection')}: ${t(
              direction === 'desc' ? 'directionDesc' : 'directionAsc',
            )}`}
          >
            {direction === 'desc' ? (
              <ArrowDown className="size-[16px]" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-[16px]" aria-hidden="true" />
            )}
          </button>
        </div>
      </label>

      <label className="block text-[12px] leading-4 text-muted">
        <span className="mb-1 block">{t('feeLabel')}</span>
        <div className="flex h-[44px] items-center rounded-md border border-border bg-bg px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/50">
          <input
            type="number"
            min={0}
            max={25}
            step={1}
            value={feeRate}
            onChange={(event) =>
              setFeeRate(Math.min(25, Math.max(0, Number(event.target.value))))
            }
            className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 text-fg outline-none"
            aria-label={t('feeLabel')}
          />
          <span className="text-[13px] text-muted">%</span>
        </div>
      </label>
    </>
  );
}

function ItemsSkeleton() {
  return (
    <>
      <div className="space-y-2 lg:hidden" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[180px] animate-pulse rounded-lg border border-border bg-surface p-[14px]"
          >
            <div className="flex gap-3">
              <div className="size-[52px] rounded bg-surface-2" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-4 w-3/4 rounded bg-surface-2" />
                <div className="h-3 w-1/3 rounded bg-surface-2" />
              </div>
            </div>
            <div className="mt-3 h-7 w-1/2 rounded bg-surface-2" />
            <div className="mt-3 h-10 rounded border-t border-border bg-surface-2/50" />
          </div>
        ))}
      </div>
      <div
        className="hidden overflow-hidden rounded-lg border border-border lg:block"
        aria-hidden="true"
      >
        <div className="h-[48px] animate-pulse border-b border-border bg-surface-2" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="flex h-[68px] animate-pulse items-center gap-3 border-b border-border/70 bg-surface px-3 last:border-0"
          >
            <div className="size-[40px] rounded bg-surface-2" />
            <div className="h-4 w-1/4 rounded bg-surface-2" />
            <div className="ml-auto h-4 w-1/2 rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </>
  );
}

export function ItemsExplorer({ locale }: { locale: Locale }) {
  const t = useTranslations('items');
  const { gameMode } = useGameMode();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<ItemSort>(DEFAULT_SORT);
  const [direction, setDirection] = useState<'asc' | 'desc'>(DEFAULT_DIRECTION);
  const [sale, setSale] = useState('all');
  const [category, setCategory] = useState('all');
  const [feeRate, setFeeRate] = useState(DEFAULT_FEE);
  const [data, setData] = useState<MarketItemsResponse>(EMPTY_RESPONSE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [queryReady, setQueryReady] = useState(false);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get('q') ?? '';
    const initialSort = params.get('sort');
    const initialDirection = params.get('direction');
    const initialFee = Number(params.get('feeRate'));
    setSearch(initialSearch);
    setDebouncedSearch(initialSearch);
    setCategory(params.get('category') ?? 'all');
    setSale(params.get('sale') ?? 'all');
    if (initialSort && SORT_VALUES.includes(initialSort as ItemSort)) {
      setSort(initialSort as ItemSort);
    }
    if (initialDirection === 'asc' || initialDirection === 'desc') {
      setDirection(initialDirection);
    }
    if (Number.isFinite(initialFee) && params.has('feeRate')) {
      setFeeRate(Math.min(25, Math.max(0, initialFee)));
    }
    setQueryReady(true);
  }, []);

  useEffect(() => {
    if (!queryReady) return;
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [queryReady, search]);

  useEffect(() => {
    if (!queryReady) return;
    const params = new URLSearchParams(window.location.search);
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) params.delete(key);
      else params.set(key, value);
    };
    setOrDelete('q', debouncedSearch.trim(), '');
    setOrDelete('category', category, 'all');
    setOrDelete('sale', sale, 'all');
    setOrDelete('sort', sort, DEFAULT_SORT);
    setOrDelete('direction', direction, DEFAULT_DIRECTION);
    setOrDelete('feeRate', String(feeRate), String(DEFAULT_FEE));
    const query = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${query ? `?${query}` : ''}`,
    );
  }, [
    queryReady,
    debouncedSearch,
    category,
    sale,
    sort,
    direction,
    feeRate,
  ]);

  useEffect(() => {
    if (!filterOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const panel = sheetRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled])',
    );
    focusable?.[0]?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setFilterOpen(false);
        filterButtonRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [filterOpen]);

  const baseParams = useMemo(
    () =>
      new URLSearchParams({
        locale,
        mode: gameMode,
        q: debouncedSearch,
        sort,
        direction,
        sale,
        category,
        feeRate: String(feeRate),
      }),
    [locale, gameMode, debouncedSearch, sort, direction, sale, category, feeRate],
  );

  useEffect(() => {
    if (!queryReady) return;
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const params = new URLSearchParams(baseParams);
    params.set('page', '1');

    fetch(`/api/items?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('market request failed');
        return response.json() as Promise<MarketItemsResponse>;
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
  }, [baseParams, queryReady]);

  const resetFilters = useCallback(() => {
    setCategory('all');
    setSale('all');
    setSort(DEFAULT_SORT);
    setDirection(DEFAULT_DIRECTION);
    setFeeRate(DEFAULT_FEE);
  }, []);

  const resetAll = useCallback(() => {
    setSearch('');
    setDebouncedSearch('');
    resetFilters();
    document.getElementById('item-search')?.focus();
  }, [resetFilters]);

  async function loadMore() {
    if (!data.hasMore || loadingMore) return;
    setLoadingMore(true);
    const params = new URLSearchParams(baseParams);
    params.set('page', String(data.page + 1));
    try {
      const response = await fetch(`/api/items?${params.toString()}`);
      if (!response.ok) throw new Error('market request failed');
      const next = (await response.json()) as MarketItemsResponse;
      setData((current) => ({
        ...next,
        items: [...current.items, ...next.items],
      }));
    } catch {
      setFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function handleSort(nextSort: ItemSort) {
    if (sort === nextSort) {
      setDirection((current) => (current === 'desc' ? 'asc' : 'desc'));
    } else {
      setSort(nextSort);
      setDirection(nextSort === 'name' ? 'asc' : 'desc');
    }
  }

  const now = Date.now();
  const sourceAge =
    data.meta.sourceUpdatedAt == null
      ? null
      : (now - Date.parse(data.meta.sourceUpdatedAt)) / 3_600_000;
  const sourceState =
    sourceAge == null
      ? 'unknown'
      : sourceAge <= 12
        ? 'fresh'
        : sourceAge <= 24
          ? 'aging'
          : 'stale';
  const activeFilterCount =
    Number(category !== 'all') +
    Number(sale !== 'all') +
    Number(sort !== DEFAULT_SORT || direction !== DEFAULT_DIRECTION) +
    Number(feeRate !== DEFAULT_FEE);
  const hasAnyCriteria = Boolean(search.trim()) || activeFilterCount > 0;
  const directionLabel = t(direction === 'desc' ? 'directionDesc' : 'directionAsc');
  const filterProps: FilterFieldsProps = {
    category,
    setCategory,
    sale,
    setSale,
    sort,
    setSort,
    direction,
    setDirection,
    feeRate,
    setFeeRate,
  };

  return (
    <div className="min-w-0">
      <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[24px] font-medium leading-8 text-fg sm:text-[28px]">
              {t('title')}
            </h1>
            <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[12px] font-medium leading-none text-accent">
              {gameMode === 'regular' ? 'PvP' : 'PvE'}
            </span>
          </div>
          <p className="mt-1 max-w-2xl text-[13px] leading-5 text-muted">{t('subtitle')}</p>
        </div>
        <div
          className={`inline-flex min-h-[32px] shrink-0 items-center gap-2 self-start rounded-full border px-3 py-1.5 text-[12px] leading-4 sm:self-auto ${
            sourceState === 'fresh'
              ? 'border-positive/40 bg-positive/10 text-positive'
              : sourceState === 'aging'
                ? 'border-accent/40 bg-accent/10 text-accent'
                : sourceState === 'stale'
                  ? 'border-negative/40 bg-negative/10 text-negative'
                  : 'border-border bg-surface text-muted'
          }`}
          title={`${t('dataSource')}: ${data.meta.source}`}
        >
          <Database className="size-[14px]" aria-hidden="true" />
          <span>{t(`freshness.${sourceState}`)}</span>
          <span aria-hidden="true">·</span>
          <span>
            {data.meta.sourceUpdatedAt
              ? formatRelativeTime(data.meta.sourceUpdatedAt, locale, now)
              : t('dataUnknown')}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:grid-cols-[minmax(320px,2fr)_auto]">
          <ItemSearch value={search} onChange={setSearch} onClear={() => setSearch('')} />
          <button
            ref={filterButtonRef}
            type="button"
            onClick={() => setFilterOpen(true)}
            className="flex h-[44px] min-w-[112px] items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 text-[14px] font-medium text-fg hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
            aria-expanded={filterOpen}
            aria-controls="mobile-item-filters"
          >
            <Filter className="size-[16px]" aria-hidden="true" />
            {t('filterButton')}
            {activeFilterCount > 0 ? (
              <span className="flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[12px] leading-5 text-accent-fg">
                {activeFilterCount}
              </span>
            ) : null}
          </button>
        </div>

        {activeFilterCount > 0 ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 lg:hidden">
            {category !== 'all' ? (
              <button
                type="button"
                onClick={() => setCategory('all')}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-[12px] leading-4 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t('removeFilter', { filter: t(`categories.${category}`) })}
              >
                {t(`categories.${category}`)}
                <X className="size-[12px]" aria-hidden="true" />
              </button>
            ) : null}
            {sale !== 'all' ? (
              <button
                type="button"
                onClick={() => setSale('all')}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-[12px] leading-4 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t('removeFilter', { filter: t(`saleOptions.${sale}`) })}
              >
                {t(`saleOptions.${sale}`)}
                <X className="size-[12px]" aria-hidden="true" />
              </button>
            ) : null}
            {sort !== DEFAULT_SORT || direction !== DEFAULT_DIRECTION ? (
              <button
                type="button"
                onClick={() => {
                  setSort(DEFAULT_SORT);
                  setDirection(DEFAULT_DIRECTION);
                }}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-[12px] leading-4 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t('removeFilter', { filter: t('sortLabel') })}
              >
                {t(`sortOptions.${sort}`)} · {directionLabel}
                <X className="size-[12px]" aria-hidden="true" />
              </button>
            ) : null}
            {feeRate !== DEFAULT_FEE ? (
              <button
                type="button"
                onClick={() => setFeeRate(DEFAULT_FEE)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-full border border-border bg-surface px-2.5 text-[12px] leading-4 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t('removeFilter', { filter: t('feeLabel') })}
              >
                {t('feeChip', { rate: feeRate })}
                <X className="size-[12px]" aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[32px] rounded px-2 text-[12px] leading-4 text-muted underline underline-offset-4 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t('clearAll')}
            </button>
          </div>
        ) : null}
      </div>

      <div className="mb-4 hidden rounded-lg border border-border bg-surface p-3 lg:block">
        <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.35fr)_minmax(0,1.25fr)_minmax(150px,.8fr)] gap-3">
          <FilterFields {...filterProps} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="text-[12px] leading-4 text-muted">{t('feeHint')}</p>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded px-2 text-[12px] text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RotateCcw className="size-[13px]" aria-hidden="true" />
              {t('resetFilters')}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mb-2 flex min-h-[32px] flex-wrap items-center justify-between gap-x-6 gap-y-1 text-[13px] leading-5 text-muted">
        <p aria-live="polite">
          {loading ? t('loading') : t('resultCount', { count: data.total })}
        </p>
        <p className="truncate text-right">
          {t('sortSummary', {
            sort: t(`sortOptions.${sort}`),
            direction: directionLabel,
          })}
        </p>
      </div>
      <p className="mb-3 text-[13px] leading-5 text-muted">{t('valueHelp')}</p>

      <section aria-busy={loading} aria-label={t('resultsLabel')}>
        {failed ? (
          <div className="rounded-lg border border-negative/50 bg-negative/5 px-4 py-10 text-center">
            <p className="text-[14px] leading-5 text-fg">{t('error')}</p>
            <p className="mt-1 text-[12px] leading-4 text-muted">{t('errorHint')}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md border border-border bg-surface px-4 text-[14px] text-fg hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <RefreshCw className="size-[16px]" aria-hidden="true" />
              {t('retry')}
            </button>
          </div>
        ) : loading ? (
          <ItemsSkeleton />
        ) : data.items.length === 0 ? (
          <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center">
            <p className="text-[15px] font-medium leading-6 text-fg">{t('empty')}</p>
            {search.trim() ? (
              <p className="mt-1 text-[13px] leading-5 text-muted">
                {t('emptyQuery', { query: search.trim() })}
              </p>
            ) : null}
            <p className="mt-1 text-[13px] leading-5 text-muted">{t('emptyHint')}</p>
            {hasAnyCriteria ? (
              <button
                type="button"
                onClick={resetAll}
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-md bg-accent px-4 text-[14px] font-medium text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
              >
                <RotateCcw className="size-[16px]" aria-hidden="true" />
                {t('resetAll')}
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <ItemsTable
              items={data.items}
              locale={locale}
              now={now}
              sort={sort}
              direction={direction}
              onSort={handleSort}
            />
            {data.hasMore ? (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="min-h-[44px] rounded-md border border-border bg-surface px-5 text-[14px] text-fg hover:border-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {loadingMore ? t('loading') : t('loadMore')}
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {filterOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 size-full bg-black/70"
            onClick={() => {
              setFilterOpen(false);
              filterButtonRef.current?.focus();
            }}
            aria-label={t('closeFilters')}
          />
          <div
            id="mobile-item-filters"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-filter-title"
            className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-xl border-t border-border bg-surface"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h2
                  id="mobile-filter-title"
                  className="text-[17px] font-medium leading-6 text-fg"
                >
                  {t('filtersTitle')}
                </h2>
                <p className="text-[12px] leading-4 text-muted">
                  {t('activeFilters', { count: activeFilterCount })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFilterOpen(false);
                  filterButtonRef.current?.focus();
                }}
                className="flex size-[44px] items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label={t('closeFilters')}
              >
                <X className="size-[18px]" aria-hidden="true" />
              </button>
            </div>
            <div className="grid gap-4 overflow-y-auto px-4 py-4 sm:grid-cols-2">
              <FilterFields {...filterProps} />
              <p className="text-[12px] leading-4 text-muted sm:col-span-2">{t('feeHint')}</p>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-2 border-t border-border bg-surface px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
              <button
                type="button"
                onClick={resetFilters}
                className="min-h-[44px] rounded-md border border-border px-4 text-[14px] text-fg hover:border-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('resetFilters')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterOpen(false);
                  filterButtonRef.current?.focus();
                }}
                className="min-h-[44px] rounded-md bg-accent px-4 text-[14px] font-medium text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {loading ? t('loading') : t('applyResults', { count: data.total })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
