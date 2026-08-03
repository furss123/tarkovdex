'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  getCraftPreferences,
  getOwnedItemCount,
  setOwnedItemCount,
  updateCraftPreferences,
  useLocalState,
} from '@/lib/local-state';
import {
  calculatePersonalizedCraft,
  craftMeetsStationLevel,
  sortCraftResults,
  type CraftSortKey,
  type FuelCostInput,
  type ManualFeeInput,
  type OwnedMaterialCostMode,
} from '@/lib/personalized-craft';
import type { EconomyDataset } from '@/types/tools';
import type { WatchPriceType } from '@/lib/watchlist';
import { formatChance, formatDuration, formatRoubles } from '@/lib/format';
import { EmptyState } from '@/components/status/StatusUI';
import { Link } from '@/i18n/navigation';
import { useLocale } from 'next-intl';
import type { Locale } from '@/i18n/routing';

const PRICE_TYPES: WatchPriceType[] = ['best-value', 'flea', 'flea-net', 'trader'];

type Props = {
  pvpData: EconomyDataset;
  pveData: EconomyDataset;
};

export function CraftCalculatorBoard({ pvpData, pveData }: Props) {
  const t = useTranslations('craftCalculator');
  const locale = useLocale() as Locale;
  const { gameMode } = useGameMode();
  const state = useLocalState();
  const data = gameMode === 'pve' ? pveData : pvpData;
  const prefs = getCraftPreferences(gameMode);

  const [query, setQuery] = useState('');
  const [stationId, setStationId] = useState('all');
  const [sort, setSort] = useState<CraftSortKey>('cash-profit');
  const [onlyCalculable, setOnlyCalculable] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stations = useMemo(() => {
    const map = new Map<string, string>();
    for (const craft of data.crafts) map.set(craft.station.id, craft.station.name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.crafts]);

  const ownedSnapshot = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const craft of data.crafts) {
      for (const part of craft.requiredItems) {
        counts[part.item.id] = getOwnedItemCount(gameMode, part.item.id);
      }
    }
    return counts;
    // `state` ensures owned counts refresh after store writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.crafts, gameMode, state]);

  const rows = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    const computed = data.crafts
      .filter((craft) => craft.active !== false)
      .filter((craft) => craftMeetsStationLevel(craft, prefs.stationLevels))
      .filter((craft) => (stationId === 'all' ? true : craft.station.id === stationId))
      .filter((craft) => {
        if (!q) return true;
        return (
          craft.productItem.item.name.toLocaleLowerCase().includes(q) ||
          craft.station.name.toLocaleLowerCase().includes(q) ||
          craft.id.toLocaleLowerCase().includes(q)
        );
      })
      .map((craft) => ({
        craft,
        result: calculatePersonalizedCraft({
          craft,
          preferences: prefs,
          ownedCounts: ownedSnapshot,
          feeRatePercent: 5,
        }),
      }))
      .filter((row) => (onlyCalculable ? row.result.calculable : true));
    return sortCraftResults(computed, sort);
  }, [data.crafts, ownedSnapshot, prefs, query, sort, stationId, onlyCalculable]);

  const selected = rows.find((row) => row.craft.id === selectedId) ?? rows[0] ?? null;

  function patchPrefs(patch: Parameters<typeof updateCraftPreferences>[1]) {
    updateCraftPreferences(gameMode, patch);
  }

  function formatCraftDuration(seconds: number) {
    return formatDuration(Math.max(0, seconds) * 1000);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        <Link href="/economy/barters" className="text-accent hover:underline">
          {t('linkFromBarters')}
        </Link>
      </p>

      <section
        aria-label={t('modeLabel')}
        className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label className="block text-sm text-muted">
          {t('ingredientPriceMode')}
          <select
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={prefs.ingredientPriceMode}
            onChange={(e) =>
              patchPrefs({ ingredientPriceMode: e.target.value as WatchPriceType })
            }
          >
            {PRICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`priceTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted">
          {t('outputSaleMode')}
          <select
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={prefs.outputSaleMode}
            onChange={(e) => patchPrefs({ outputSaleMode: e.target.value as WatchPriceType })}
          >
            {PRICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`priceTypes.${type}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted">
          {t('ownedCostMode')}
          <select
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={prefs.ownedMaterialCostMode}
            onChange={(e) =>
              patchPrefs({ ownedMaterialCostMode: e.target.value as OwnedMaterialCostMode })
            }
          >
            <option value="cash-only">{t('cashOnly')}</option>
            <option value="opportunity-cost">{t('opportunityCost')}</option>
          </select>
        </label>

        <FuelControls
          value={prefs.fuelCost}
          onChange={(fuelCost) => patchPrefs({ fuelCost })}
          t={t}
        />
        <FeeControls
          value={prefs.manualFee}
          onChange={(manualFee) => patchPrefs({ manualFee })}
          t={t}
        />

        <div className="sm:col-span-2 lg:col-span-3">
          <p className="text-sm text-muted">{t('stationLevelHint')}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {stations.map(([id, name]) => (
              <label key={id} className="block text-sm text-muted">
                {name}
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={6}
                  className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
                  value={prefs.stationLevels[id] ?? ''}
                  placeholder={t('stationLevel')}
                  onChange={(e) => {
                    const next = { ...prefs.stationLevels };
                    const n = Number(e.target.value);
                    if (!e.target.value) delete next[id];
                    else if (Number.isFinite(n) && n >= 0) next[id] = Math.floor(n);
                    patchPrefs({ stationLevels: next });
                  }}
                />
              </label>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1 text-sm text-muted">
          {t('searchCrafts')}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
          />
        </label>
        <label className="block text-sm text-muted">
          {t('filterStation')}
          <select
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={stationId}
            onChange={(e) => setStationId(e.target.value)}
          >
            <option value="all">{t('includeAllStations')}</option>
            {stations.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm text-muted">
          {t('sortLabel')}
          <select
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={sort}
            onChange={(e) => setSort(e.target.value as CraftSortKey)}
          >
            <option value="cash-profit">{t('sortCashProfit')}</option>
            <option value="economic-profit">{t('sortEconomicProfit')}</option>
            <option value="profit-per-hour">{t('sortPerHour')}</option>
            <option value="additional-cost">{t('sortAdditionalCost')}</option>
          </select>
        </label>
        <label className="flex min-h-touch items-center gap-2 text-sm text-fg">
          <input
            type="checkbox"
            checked={onlyCalculable}
            onChange={(e) => setOnlyCalculable(e.target.checked)}
          />
          {t('filterCalculable')}
        </label>
      </div>

      <p className="sr-only" aria-live="polite">
        {t('resultsLive')} ({rows.length})
      </p>

      {rows.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <ul className="max-h-[70vh] space-y-2 overflow-y-auto rounded-lg border border-border">
            {rows.map(({ craft, result }) => (
              <li key={craft.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(craft.id)}
                  className={`flex w-full min-h-touch items-start gap-3 border-b border-border px-3 py-3 text-left ${
                    selected?.craft.id === craft.id ? 'bg-accent/10' : 'bg-surface hover:bg-surface-2'
                  }`}
                >
                  {craft.productItem.item.iconLink ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={craft.productItem.item.iconLink}
                      alt=""
                      className="size-10 shrink-0 object-contain"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fg">
                      {craft.productItem.item.name}
                    </span>
                    <span className="block text-xs text-muted">
                      {craft.station.name} · Lv.{craft.level} · {formatCraftDuration(craft.duration)}
                    </span>
                    <span className="block text-xs text-muted">
                      {result.calculable
                        ? formatRoubles(result.cashProfit ?? 0, locale)
                        : result.partial
                          ? t('partialCalc')
                          : t('notCalculable')}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <CraftDetail
              craft={selected.craft}
              result={selected.result}
              gameMode={gameMode}
              locale={locale}
              t={t}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function CraftDetail({
  craft,
  result,
  gameMode,
  locale,
  t,
}: {
  craft: EconomyDataset['crafts'][number];
  result: ReturnType<typeof calculatePersonalizedCraft>;
  gameMode: 'regular' | 'pve';
  locale: Locale;
  t: ReturnType<typeof useTranslations<'craftCalculator'>>;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <h2 className="text-base font-medium text-fg">{craft.productItem.item.name}</h2>
      <p className="mt-1 text-sm text-muted">
        {craft.station.name} · {t('level')} {craft.level} · {t('duration')}{' '}
        {formatDuration(Math.max(0, craft.duration) * 1000)}
      </p>

      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <Stat label={t('additionalCash')} value={result.additionalPurchaseCost} locale={locale} />
        <Stat label={t('ownedValue')} value={result.ownedMaterialValue} locale={locale} />
        <Stat label={t('economicCost')} value={result.totalEconomicCost} locale={locale} />
        <Stat label={t('grossSale')} value={result.grossOutputValue} locale={locale} />
        <Stat label={t('netSale')} value={result.netOutputValue} locale={locale} />
        <Stat label={t('cashProfit')} value={result.cashProfit} locale={locale} />
        <Stat label={t('economicProfit')} value={result.economicProfit} locale={locale} />
        <div>
          <dt className="text-muted">{t('roi')}</dt>
          <dd className="text-fg">
            {result.roi == null ? '—' : formatChance(result.roi, locale)}
          </dd>
        </div>
        <Stat label={t('profitPerHour')} value={result.profitPerHour} locale={locale} />
      </dl>

      {!result.calculable ? (
        <p className="mt-3 text-sm text-muted">
          {result.partial ? t('partialCalc') : t('notCalculable')}
          {result.missingInputPriceItemIds.length || result.missingOutputPriceItemIds.length
            ? ` · ${t('missingPrice')}`
            : ''}
        </p>
      ) : null}
      {result.reasons.includes('manual-fuel') || result.reasons.includes('manual-fee') ? (
        <p className="mt-2 text-xs text-muted">{t('userInput')}</p>
      ) : (
        <p className="mt-2 text-xs text-muted">{t('autoConfirmed')}</p>
      )}

      <ul className="mt-4 space-y-2">
        {result.lines.map((line) => (
          <li
            key={`${line.itemId}:${line.isTool ? 'tool' : 'mat'}`}
            className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2"
          >
            <span className="min-w-0 flex-1 text-sm text-fg">
              {line.name}
              <span className="ml-2 text-xs text-muted">
                {line.isTool ? t('reusableTool') : t('consumedMaterial')} ×{line.required}
              </span>
            </span>
            <label className="flex items-center gap-2 text-xs text-muted">
              {t('ownedQuantity')}
              <input
                type="number"
                inputMode="numeric"
                min={0}
                className="w-20 min-h-touch rounded-md border border-border bg-bg px-2 text-fg"
                value={getOwnedItemCount(gameMode, line.itemId)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setOwnedItemCount(gameMode, line.itemId, Number.isFinite(n) ? n : 0);
                }}
              />
            </label>
            <span className="text-xs text-muted">
              {t('purchaseQuantity')}: {line.purchaseQuantity}
              {line.unitPrice != null ? ` · ${formatRoubles(line.unitPrice, locale)}` : ` · ${t('missingPrice')}`}
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function Stat({
  label,
  value,
  locale,
}: {
  label: string;
  value: number | null;
  locale: Locale;
}) {
  return (
    <div>
      <dt className="text-muted">{label}</dt>
      <dd className="text-fg">{value == null ? '—' : formatRoubles(value, locale)}</dd>
    </div>
  );
}

function FuelControls({
  value,
  onChange,
  t,
}: {
  value: FuelCostInput;
  onChange: (next: FuelCostInput) => void;
  t: ReturnType<typeof useTranslations<'craftCalculator'>>;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-muted">
        {t('fuelNone')}
        <select
          className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
          value={value.mode}
          onChange={(e) => {
            const mode = e.target.value as FuelCostInput['mode'];
            if (mode === 'none') onChange({ mode: 'none' });
            else if (mode === 'per-hour') onChange({ mode: 'per-hour', rublesPerHour: 0 });
            else onChange({ mode: 'fixed', fixedCost: 0 });
          }}
        >
          <option value="none">{t('fuelNone')}</option>
          <option value="per-hour">{t('fuelPerHour')}</option>
          <option value="fixed">{t('fuelFixed')}</option>
        </select>
      </label>
      {value.mode === 'per-hour' ? (
        <label className="block text-sm text-muted">
          {t('fuelPerHourLabel')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={value.rublesPerHour}
            onChange={(e) =>
              onChange({ mode: 'per-hour', rublesPerHour: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
      ) : null}
      {value.mode === 'fixed' ? (
        <label className="block text-sm text-muted">
          {t('fuelFixedLabel')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={value.fixedCost}
            onChange={(e) =>
              onChange({ mode: 'fixed', fixedCost: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
      ) : null}
    </div>
  );
}

function FeeControls({
  value,
  onChange,
  t,
}: {
  value: ManualFeeInput;
  onChange: (next: ManualFeeInput) => void;
  t: ReturnType<typeof useTranslations<'craftCalculator'>>;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-sm text-muted">
        {t('manualFeeNone')}
        <select
          className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
          value={value.mode}
          onChange={(e) => {
            const mode = e.target.value as ManualFeeInput['mode'];
            if (mode === 'none') onChange({ mode: 'none' });
            else onChange({ mode, value: 0 });
          }}
        >
          <option value="none">{t('manualFeeNone')}</option>
          <option value="fixed">{t('manualFeeFixed')}</option>
          <option value="percent">{t('manualFeePercent')}</option>
        </select>
      </label>
      {value.mode !== 'none' ? (
        <label className="block text-sm text-muted">
          {t('feeValueLabel')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className="mt-1 w-full min-h-touch rounded-md border border-border bg-bg px-3 text-fg"
            value={value.value}
            onChange={(e) =>
              onChange({ mode: value.mode, value: Math.max(0, Number(e.target.value) || 0) })
            }
          />
        </label>
      ) : null}
    </div>
  );
}
