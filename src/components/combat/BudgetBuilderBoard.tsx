'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  addBudgetLine,
  createBudgetPreset,
  deleteBudgetPreset,
  duplicateBudgetPreset,
  getBudgetPresets,
  removeBudgetLine,
  updateBudgetLine,
  updateBudgetPreset,
  useLocalState,
} from '@/lib/local-state';
import { formatRoubles } from '@/lib/format';
import { EmptyState, ErrorState, PartialDataNotice } from '@/components/status/StatusUI';
import {
  BUDGET_GEAR_CATEGORIES,
  calculateBudgetPreset,
  categoryFromItemTypes,
  categoryMessageKey,
  type BudgetGearCategory,
} from '@/lib/loadout-budget';
import {
  WATCHLIST_FETCH_CHUNK,
  chunkIds,
  isWatchPriceStale,
  type WatchPriceType,
} from '@/lib/watchlist';
import type { MarketItem } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';

const PRICE_TYPES: WatchPriceType[] = ['flea-net', 'flea', 'trader', 'best-value'];

export function BudgetBuilderBoard() {
  const t = useTranslations('budgetBuilder');
  const locale = useLocale() as Locale;
  const { gameMode } = useGameMode();
  useLocalState();
  const presets = getBudgetPresets(gameMode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [pickerCategory, setPickerCategory] = useState<BudgetGearCategory | 'all'>('all');
  const [pickerHits, setPickerHits] = useState<MarketItem[]>([]);
  const [itemsById, setItemsById] = useState<Map<string, MarketItem>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const selected = presets.find((p) => p.id === selectedId) ?? presets[0] ?? null;

  useEffect(() => {
    if (selected && !presets.some((p) => p.id === selected.id)) {
      setSelectedId(presets[0]?.id ?? null);
    }
  }, [presets, selected]);

  const lineIds = useMemo(
    () => (selected ? [...new Set(selected.lines.map((l) => l.itemId))] : []),
    [selected],
  );
  const lineIdsKey = lineIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (lineIds.length === 0) {
      setItemsById(new Map());
      setError(false);
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      setError(false);
      const found = new Map<string, MarketItem>();
      try {
        for (const chunk of chunkIds(lineIds, WATCHLIST_FETCH_CHUNK)) {
          const params = new URLSearchParams({
            ids: chunk.join(','),
            detail: 'market',
            mode: gameMode,
            locale,
            feeRate: '5',
          });
          const res = await fetch(`/api/items?${params}`);
          if (!res.ok) throw new Error('fail');
          const body = (await res.json()) as { items?: MarketItem[] };
          for (const item of body.items ?? []) found.set(item.id, item);
        }
        if (!cancelled) setItemsById(found);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [lineIdsKey, gameMode, locale, lineIds]);

  const calc = useMemo(() => {
    if (!selected) return null;
    const stale = new Set<string>();
    for (const [id, item] of itemsById) {
      if (isWatchPriceStale(item.freshnessHours)) stale.add(id);
    }
    return calculateBudgetPreset(selected, itemsById, { staleItemIds: stale });
  }, [selected, itemsById]);

  async function searchPicker() {
    const params = new URLSearchParams({
      q: pickerQuery.trim(),
      mode: gameMode,
      locale,
      domain: 'item',
      limit: '20',
    });
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) {
      setPickerHits([]);
      return;
    }
    const body = (await res.json()) as {
      groups?: Array<{ domain: string; results: Array<{ id: string }> }>;
    };
    const ids = (body.groups ?? [])
      .filter((g) => g.domain === 'item')
      .flatMap((g) => g.results.map((r) => r.id))
      .slice(0, 20);
    if (ids.length === 0) {
      setPickerHits([]);
      return;
    }
    const marketParams = new URLSearchParams({
      ids: ids.join(','),
      detail: 'market',
      mode: gameMode,
      locale,
      feeRate: '5',
    });
    const marketRes = await fetch(`/api/items?${marketParams}`);
    if (!marketRes.ok) {
      setPickerHits([]);
      return;
    }
    const marketBody = (await marketRes.json()) as { items?: MarketItem[] };
    let items = marketBody.items ?? [];
    if (pickerCategory !== 'all') {
      items = items.filter((item) => item.types.includes(pickerCategory));
    }
    setPickerHits(items);
  }

  function handleCreate() {
    const { preset } = createBudgetPreset(gameMode, {
      name: t('newPreset'),
      budget: 100000,
    });
    if (preset) setSelectedId(preset.id);
  }

  return (
    <div className="space-y-6">
      <p className="rounded-lg border border-border bg-surface px-4 py-3 text-sm text-muted">
        {t('compatibilityNotice')}
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleCreate}
          className="min-h-touch rounded-md border border-border bg-surface px-4 text-sm text-fg hover:border-accent"
        >
          {t('newPreset')}
        </button>
        {selected ? (
          <>
            <button
              type="button"
              onClick={() => {
                const { preset } = duplicateBudgetPreset(gameMode, selected.id, ' (copy)');
                if (preset) setSelectedId(preset.id);
              }}
              className="min-h-touch rounded-md border border-border bg-surface px-4 text-sm text-fg"
            >
              {t('duplicate')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t('deleteConfirm'))) {
                  deleteBudgetPreset(gameMode, selected.id);
                  setSelectedId(null);
                }
              }}
              className="min-h-touch rounded-md border border-border bg-surface px-4 text-sm text-fg"
            >
              {t('delete')}
            </button>
          </>
        ) : null}
      </div>

      {presets.length === 0 ? (
        <EmptyState title={t('noPresets')} hint={t('empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <ul className="space-y-1 rounded-lg border border-border p-2">
            {presets.map((preset) => (
              <li key={preset.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(preset.id)}
                  className={`w-full min-h-touch truncate rounded-md px-3 text-left text-sm ${
                    selected?.id === preset.id ? 'bg-accent/10 text-fg' : 'text-muted hover:bg-surface-2'
                  }`}
                >
                  {preset.name}
                </button>
              </li>
            ))}
          </ul>

          {selected && calc ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-muted">
                  {t('presetName')}
                  <input
                    className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
                    value={selected.name}
                    onChange={(e) =>
                      updateBudgetPreset(gameMode, selected.id, () => ({ name: e.target.value }))
                    }
                  />
                </label>
                <label className="block text-sm text-muted">
                  {t('budget')}
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
                    value={selected.budget ?? ''}
                    onChange={(e) => {
                      const n = e.target.value === '' ? undefined : Number(e.target.value);
                      updateBudgetPreset(gameMode, selected.id, () => ({
                        budget: n === undefined || Number.isFinite(n) ? n : selected.budget,
                      }));
                    }}
                  />
                </label>
              </div>

              <div className="grid gap-2 rounded-lg border border-border bg-surface p-4 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted">{t('knownSubtotal')}: </span>
                  {formatRoubles(calc.knownSubtotal, locale)}
                </p>
                <p>
                  <span className="text-muted">{t('totalPrice')}: </span>
                  {calc.totalPrice == null ? t('missingPrice') : formatRoubles(calc.totalPrice, locale)}
                </p>
                <p>
                  <span className="text-muted">{t('totalWeight')}: </span>
                  {calc.totalWeight == null
                    ? t('missingWeight')
                    : `${calc.knownWeight.toFixed(2)} kg`}
                </p>
                <p>
                  <span className="text-muted">{t('totalSlots')}: </span>
                  {calc.totalSlots == null ? '—' : calc.totalSlots}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted">
                    {calc.budgetStatus === 'within'
                      ? t('statusWithin')
                      : calc.budgetStatus === 'over'
                        ? t('statusOver')
                        : t('statusUnknownLabel')}
                    :{' '}
                  </span>
                  {calc.budgetStatus === 'within' && calc.remainingBudget != null
                    ? formatRoubles(calc.remainingBudget, locale)
                    : calc.budgetStatus === 'over' && calc.overBudgetBy != null
                      ? formatRoubles(calc.overBudgetBy, locale)
                      : t('statusUnknown')}
                </p>
              </div>

              {loading ? <p className="text-sm text-muted">{t('loading')}</p> : null}
              {error ? <ErrorState title={t('error')} /> : null}
              {calc.partial ? (
                <PartialDataNotice message={t('missingPrice')} hint={t('compatibilityNotice')} />
              ) : null}

              <button
                type="button"
                onClick={() => {
                  setPickerOpen(true);
                  setPickerHits([]);
                }}
                className="min-h-touch rounded-md border border-accent bg-accent/10 px-4 text-sm text-accent"
              >
                {t('addItem')}
              </button>

              {selected.lines.length === 0 ? (
                <EmptyState title={t('empty')} />
              ) : (
                <ul className="space-y-2">
                  {selected.lines.map((line) => {
                    const item = itemsById.get(line.itemId) ?? null;
                    const lineCalc = calc.lines.find((l) => l.lineId === line.id);
                    return (
                      <li
                        key={line.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-3"
                      >
                        {item?.iconLink ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.iconLink} alt="" className="size-10 object-contain" />
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-fg">
                            {item?.name ?? t('orphan')}
                          </p>
                          <p className="text-xs text-muted">
                            {(() => {
                              const key = categoryMessageKey(line.category);
                              return key ? t(`categories.${key}`) : line.category;
                            })()}
                            {lineCalc?.stale ? ` · ${t('stale')}` : ''}
                            {lineCalc?.orphan ? ` · ${t('orphan')}` : ''}
                          </p>
                        </div>
                        <label className="text-xs text-muted">
                          {t('quantity')}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            className="ml-1 w-16 min-h-touch rounded-md border border-border bg-bg px-2 text-fg"
                            value={line.quantity}
                            onChange={(e) =>
                              updateBudgetLine(gameMode, selected.id, line.id, {
                                quantity: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                          />
                        </label>
                        <label className="text-xs text-muted">
                          {t('priceType')}
                          <select
                            className="ml-1 min-h-touch rounded-md border border-border bg-bg px-2 text-fg"
                            value={line.priceType}
                            onChange={(e) =>
                              updateBudgetLine(gameMode, selected.id, line.id, {
                                priceType: e.target.value as WatchPriceType,
                              })
                            }
                          >
                            {PRICE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {t(`priceTypes.${type}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <span className="text-sm text-fg">
                          {lineCalc?.subtotal == null
                            ? t('missingPrice')
                            : formatRoubles(lineCalc.subtotal, locale)}
                        </span>
                        <button
                          type="button"
                          className="min-h-touch rounded-md border border-border px-3 text-sm text-muted"
                          onClick={() => removeBudgetLine(gameMode, selected.id, line.id)}
                          aria-label={t('delete')}
                        >
                          {t('delete')}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}

              <label className="block text-sm text-muted">
                {t('notes')}
                <textarea
                  className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-fg"
                  rows={3}
                  value={selected.notes}
                  onChange={(e) =>
                    updateBudgetPreset(gameMode, selected.id, () => ({ notes: e.target.value }))
                  }
                />
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted">{t('selectPreset')}</p>
          )}
        </div>
      )}

      {pickerOpen && selected ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('pickerTitle')}
          className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-4 sm:items-center"
        >
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-border bg-bg">
            <div className="border-b border-border p-4">
              <h2 className="text-base font-medium text-fg">{t('pickerTitle')}</h2>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <label className="block min-w-0 flex-1 text-sm text-muted">
                  {t('pickerSearch')}
                  <input
                    className="mt-1 w-full min-h-touch rounded-md border border-border bg-surface px-3 text-fg"
                    value={pickerQuery}
                    onChange={(e) => setPickerQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void searchPicker();
                    }}
                  />
                </label>
                <label className="block text-sm text-muted">
                  {t('category')}
                  <select
                    className="mt-1 w-full min-h-touch rounded-md border border-border bg-surface px-3 text-fg"
                    value={pickerCategory}
                    onChange={(e) =>
                      setPickerCategory(e.target.value as BudgetGearCategory | 'all')
                    }
                  >
                    <option value="all">—</option>
                    {BUDGET_GEAR_CATEGORIES.map((cat) => {
                      const key = categoryMessageKey(cat);
                      return (
                        <option key={cat} value={cat}>
                          {key ? t(`categories.${key}`) : cat}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <button
                  type="button"
                  className="min-h-touch rounded-md border border-accent bg-accent/10 px-4 text-sm text-accent"
                  onClick={() => void searchPicker()}
                >
                  {t('pickerSearch')}
                </button>
              </div>
            </div>
            <ul className="flex-1 overflow-y-auto p-2">
              {pickerHits.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">{t('pickerEmpty')}</li>
              ) : (
                pickerHits.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      className="flex w-full min-h-touch items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-surface-2"
                      onClick={() => {
                        const category =
                          categoryFromItemTypes(item.types) ??
                          (pickerCategory !== 'all' ? pickerCategory : 'armor');
                        addBudgetLine(gameMode, selected.id, {
                          itemId: item.id,
                          category,
                          quantity: 1,
                          priceType: 'flea-net',
                        });
                        setItemsById((prev) => new Map(prev).set(item.id, item));
                        setPickerOpen(false);
                      }}
                    >
                      {item.iconLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.iconLink} alt="" className="size-8 object-contain" />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">{item.name}</span>
                      <span className="text-xs text-muted">
                        {item.estimatedFleaNet != null
                          ? formatRoubles(item.estimatedFleaNet, locale)
                          : t('missingPrice')}
                      </span>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="border-t border-border p-3">
              <button
                type="button"
                className="min-h-touch w-full rounded-md border border-border text-sm text-muted"
                onClick={() => setPickerOpen(false)}
              >
                {t('deleteCancel')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
