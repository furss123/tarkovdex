'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  getWatchlist,
  removeFromWatchlist,
  resetWatchlistBaseline,
  updateWatchlistObservation,
  useLocalState,
} from '@/lib/local-state';
import {
  WATCHLIST_FETCH_CHUNK,
  chunkIds,
  computeWatchPriceDelta,
  isWatchPriceStale,
  priceForType,
  type WatchPriceType,
} from '@/lib/watchlist';
import type { MarketItem } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { formatPercent, formatRoubles, formatSignedRoubles } from '@/lib/format';
import { EmptyState, ErrorState, PartialDataNotice } from '@/components/status/StatusUI';
import { CachedDataNotice } from '@/components/status/CachedDataNotice';
import {
  pwaFetch,
  useConnectivityOptional,
} from '@/contexts/ConnectivityContext';
import { offlineResponseInfoFromHeaders, type OfflineResponseInfo } from '@/lib/offline-status';
import { AddToBudgetButton } from '@/components/combat/AddToBudgetButton';
import type { WatchlistEntry } from '@/lib/local-state/schema';

type SortMode = 'recent' | 'rise' | 'fall';

type Row = {
  entry: WatchlistEntry;
  item: MarketItem | null;
  currentPrice: number | null;
  delta: ReturnType<typeof computeWatchPriceDelta>;
  stale: boolean;
  orphan: boolean;
};

export function WatchlistBoard() {
  const t = useTranslations('watchlist');
  const locale = useLocale() as Locale;
  const { gameMode } = useGameMode();
  const state = useLocalState();
  const entries = getWatchlist(gameMode);
  const [sort, setSort] = useState<SortMode>('recent');
  const [itemsById, setItemsById] = useState<Map<string, MarketItem>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [partial, setPartial] = useState(false);
  const [offlineInfo, setOfflineInfo] = useState<OfflineResponseInfo | null>(null);
  const connectivity = useConnectivityOptional();

  // Re-read when mode or store changes.
  const entryKey = `${gameMode}:${entries.map((e) => `${e.itemId}:${e.priceType}`).join(',')}`;

  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(entries.map((e) => e.itemId))];
    if (ids.length === 0) {
      setItemsById(new Map());
      setError(false);
      setPartial(false);
      setLoading(false);
      return;
    }

    async function load() {
      setLoading(true);
      setError(false);
      setPartial(false);
      const found = new Map<string, MarketItem>();
      let anyFail = false;
      let anyPartial = false;
      try {
        for (const chunk of chunkIds(ids, WATCHLIST_FETCH_CHUNK)) {
          const params = new URLSearchParams({
            ids: chunk.join(','),
            detail: 'market',
            mode: gameMode,
            locale,
            feeRate: '5',
          });
          const res = await pwaFetch(
            `/api/items?${params.toString()}`,
            undefined,
            connectivity?.noteFetchOutcome,
          );
          if (!res.ok) {
            anyFail = true;
            continue;
          }
          const info = offlineResponseInfoFromHeaders(res.headers, res.url);
          if (info.servedFromOfflineCache) setOfflineInfo(info);
          else setOfflineInfo(null);
          const json = (await res.json()) as {
            items?: MarketItem[];
            meta?: { requested?: number; found?: number };
          };
          for (const item of json.items ?? []) found.set(item.id, item);
          if (
            typeof json.meta?.requested === 'number' &&
            typeof json.meta?.found === 'number' &&
            json.meta.found < json.meta.requested
          ) {
            anyPartial = true;
          }
        }
      } catch {
        anyFail = true;
      }
      if (cancelled) return;
      setItemsById(found);
      setError(anyFail && found.size === 0);
      setPartial(anyPartial || (anyFail && found.size > 0));
      setLoading(false);

      const observations = entries
        .map((entry) => {
          const item = found.get(entry.itemId);
          if (!item) return null;
          const current = priceForType(item, entry.priceType);
          return {
            itemId: entry.itemId,
            priceType: entry.priceType,
            ...(current != null ? { lastSeenPrice: current } : {}),
            ...(item.updated ? { lastSeenUpdatedAt: item.updated } : {}),
            lastViewedAt: new Date().toISOString(),
          };
        })
        .filter((row): row is NonNullable<typeof row> => row != null);
      if (observations.length) updateWatchlistObservation(gameMode, observations);
    }

    void load();
    return () => {
      cancelled = true;
    };
    // entryKey encodes entries + mode; locale/gameMode covered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey, locale, gameMode]);

  const rows: Row[] = useMemo(() => {
    return entries.map((entry) => {
      const item = itemsById.get(entry.itemId) ?? null;
      const currentPrice = item ? priceForType(item, entry.priceType) : null;
      const delta = computeWatchPriceDelta({
        baselinePrice: entry.baselinePrice,
        currentPrice,
        baselineType: entry.priceType,
        currentType: entry.priceType,
      });
      return {
        entry,
        item,
        currentPrice,
        delta,
        stale: item ? isWatchPriceStale(item.freshnessHours) : false,
        orphan: !loading && !error && item == null && entries.length > 0,
      };
    });
  }, [entries, itemsById, loading, error]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    if (sort === 'recent') {
      copy.sort((a, b) => Date.parse(b.entry.addedAt) - Date.parse(a.entry.addedAt));
      return copy;
    }
    const score = (row: Row) =>
      row.delta.kind === 'ok' ? row.delta.absolute : sort === 'rise' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
    copy.sort((a, b) => (sort === 'rise' ? score(b) - score(a) : score(a) - score(b)));
    return copy;
  }, [rows, sort]);

  // Touch state.preferences so beginnerMode/etc. re-renders aren't required —
  // watchlist lives under modeData which useLocalState already tracks.
  void state.schemaVersion;

  if (entries.length === 0) {
    return (
      <EmptyState
        title={t('empty')}
        hint={t('emptyHint')}
        action={
          <Link
            href="/economy/items"
            className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-sm text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {t('goToItems')}
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <CachedDataNotice info={offlineInfo} locale={locale} variant="price" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">{t('sortLabel')}</span>
        {(
          [
            ['recent', 'sortRecent'],
            ['rise', 'sortRise'],
            ['fall', 'sortFall'],
          ] as const
        ).map(([value, key]) => (
          <button
            key={value}
            type="button"
            onClick={() => setSort(value)}
            className={`inline-flex min-h-touch items-center rounded-md border px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              sort === value
                ? 'border-accent/50 bg-accent/10 text-accent'
                : 'border-border text-muted hover:text-fg'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {loading ? <p className="text-sm text-muted">{t('loading')}</p> : null}
      {error ? <ErrorState title={t('error')} hint={t('errorHint')} /> : null}
      {partial ? <PartialDataNotice message={t('partial')} hint={t('partialHint')} /> : null}

      <ul className="space-y-3">
        {sorted.map((row) => (
          <WatchlistCard
            key={`${row.entry.itemId}:${row.entry.priceType}`}
            row={row}
            locale={locale}
            gameMode={gameMode}
          />
        ))}
      </ul>
    </div>
  );
}

function WatchlistCard({
  row,
  locale,
  gameMode,
}: {
  row: Row;
  locale: Locale;
  gameMode: 'regular' | 'pve';
}) {
  const t = useTranslations('watchlist');
  const { entry, item, currentPrice, delta, stale, orphan } = row;
  const name = item?.name ?? entry.itemId;

  function onReset() {
    if (currentPrice == null) return;
    resetWatchlistBaseline(
      gameMode,
      entry.itemId,
      entry.priceType,
      currentPrice,
      item?.updated ?? undefined,
    );
  }

  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {item?.iconLink ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.iconLink}
                alt=""
                width={40}
                height={40}
                className="size-10 rounded border border-border bg-bg object-contain"
              />
            ) : (
              <span className="size-10 rounded border border-border bg-bg" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{name}</p>
              <p className="text-xs text-muted">{t(`priceTypes.${entry.priceType}` as `priceTypes.${WatchPriceType}`)}</p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => removeFromWatchlist(gameMode, entry.itemId, entry.priceType)}
          className="inline-flex min-h-touch shrink-0 items-center rounded-md border border-border px-3 text-sm text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('remove')}
        </button>
      </div>
      <div className="mt-2">
        <AddToBudgetButton
          itemId={entry.itemId}
          types={item?.types ?? []}
          priceType={entry.priceType}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t('baseline')} value={formatRoubles(entry.baselinePrice, locale)} />
        <Metric label={t('current')} value={formatRoubles(currentPrice, locale)} />
        <div>
          <p className="text-xs text-muted">{t('delta')}</p>
          <DeltaText delta={delta} locale={locale} />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {stale ? (
            <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-xs text-accent">
              {t('stale')}
            </span>
          ) : null}
          {orphan ? (
            <span className="rounded border border-border bg-surface-2 px-2 py-1 text-xs text-muted">
              {t('orphan')}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3">
        <button
          type="button"
          onClick={onReset}
          disabled={currentPrice == null}
          className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-sm text-muted hover:text-fg disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('resetBaseline')}
        </button>
      </div>
    </li>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm tabular-nums text-fg">{value}</p>
    </div>
  );
}

function DeltaText({
  delta,
  locale,
}: {
  delta: ReturnType<typeof computeWatchPriceDelta>;
  locale: Locale;
}) {
  const t = useTranslations('watchlist');
  if (delta.kind === 'missing-baseline') {
    return <p className="text-sm text-muted">{t('missingBaseline')}</p>;
  }
  if (delta.kind === 'missing-current') {
    return <p className="text-sm text-muted">{t('missingCurrent')}</p>;
  }
  if (delta.kind === 'type-mismatch') {
    return <p className="text-sm text-muted">{t('typeMismatch')}</p>;
  }
  if (delta.kind === 'baseline-zero') {
    return <p className="text-sm text-muted">{t('baselineZero')}</p>;
  }
  const color =
    delta.direction === 'up'
      ? 'text-positive'
      : delta.direction === 'down'
        ? 'text-negative'
        : 'text-muted';
  return (
    <p className={`text-sm tabular-nums ${color}`}>
      {formatSignedRoubles(delta.absolute, locale)}
      {delta.percent != null ? ` (${formatPercent(delta.percent, locale)})` : null}
    </p>
  );
}
