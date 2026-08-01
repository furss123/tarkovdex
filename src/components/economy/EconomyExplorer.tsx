'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bitcoin,
  Check,
  ChevronDown,
  CookingPot,
  Droplets,
  Hammer,
  HeartPulse,
  RadioTower,
  Toilet,
  Wine,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import { calculateCraftProfit } from '@/lib/tool-calculations';
import type { EconomyDataset, PriceStrategy } from '@/types/tools';

type Props = { regular: EconomyDataset; pve: EconomyDataset };

const money = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 });
const INITIAL_STATION_LIMIT = 6;
const HEADER_HEIGHT = 68; // Header.tsx's fixed sticky bar height
const NAV_GAP = 16;

/** Per-station icons keyed by the API's stable station id (never by the
 * translated display name). Stations without a mapping fall back to Hammer. */
const STATION_ICONS: Record<string, LucideIcon> = {
  '5d494a445b56502f18c98a10': Bitcoin, // bitcoin-farm
  '5d484fda654e7600681d9315': Wrench, // workbench
  '5d484fd1654e76006732bf2e': CookingPot, // nutrition-unit
  '5d494a3f5b56502f18c98a0e': Wine, // booze-generator
  '5d484fcd654e7668ec2ec322': HeartPulse, // medstation
  '5d484fc8654e760065037abf': Droplets, // water-collector
  '5d484fba654e7600691aadf7': Toilet, // lavatory
  '5d484fdf654e7600691aadf8': RadioTower, // intelligence-center
};

function stationIcon(stationId: string): LucideIcon {
  return STATION_ICONS[stationId] ?? Hammer;
}

export function EconomyExplorer({ regular, pve }: Props) {
  const t = useTranslations('economy');
  const { gameMode } = useGameMode();
  const data = gameMode === 'pve' ? pve : regular;
  const [query, setQuery] = useState('');
  const [strategy, setStrategy] = useState<PriceStrategy>('best');
  const [profitableOnly, setProfitableOnly] = useState(false);
  const [completeOnly, setCompleteOnly] = useState(false);
  const [hourlyCost, setHourlyCost] = useState(0);
  const [expandedStations, setExpandedStations] = useState<string[]>([]);
  const [activeStationId, setActiveStationId] = useState('');
  const navRef = useRef<HTMLElement>(null);
  const [navOffset, setNavOffset] = useState(HEADER_HEIGHT + NAV_GAP);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawStrategy = params.get('strategy');
    if (rawStrategy === 'flea' || rawStrategy === 'trader' || rawStrategy === 'best') {
      setStrategy(rawStrategy);
    }
    setQuery(params.get('q') ?? '');
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    params.delete('tab');
    params.delete('sort');
    if (query) params.set('q', query);
    else params.delete('q');
    params.set('strategy', strategy);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }, [query, strategy]);

  const stationGroups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        station: { id: string; name: string };
        entries: Array<{
          deal: EconomyDataset['crafts'][number];
          result: ReturnType<typeof calculateCraftProfit>;
        }>;
      }
    >();

    for (const deal of data.crafts) {
      const result = calculateCraftProfit(deal, strategy, hourlyCost);
      const searchText = [
        deal.productItem.item.name,
        deal.station.name,
        ...deal.requiredItems.map((part) => part.item.name),
      ].join(' ').toLocaleLowerCase();
      const matches = !query || searchText.includes(query.toLocaleLowerCase());
      if (
        !matches ||
        (profitableOnly && (result.profit ?? -1) <= 0) ||
        (completeOnly && result.missing.length > 0)
      ) {
        continue;
      }

      const group = grouped.get(deal.station.id) ?? {
        station: deal.station,
        entries: [],
      };
      group.entries.push({ deal, result });
      grouped.set(deal.station.id, group);
    }

    return [...grouped.values()]
      .map((group) => ({
        ...group,
        entries: group.entries.sort(
          (a, b) =>
            (b.result.profit ?? Number.NEGATIVE_INFINITY) -
              (a.result.profit ?? Number.NEGATIVE_INFINITY) ||
            (b.result.hourlyProfit ?? Number.NEGATIVE_INFINITY) -
              (a.result.hourlyProfit ?? Number.NEGATIVE_INFINITY),
        ),
      }))
      .sort(
        (a, b) =>
          (b.entries[0]?.result.profit ?? Number.NEGATIVE_INFINITY) -
            (a.entries[0]?.result.profit ?? Number.NEGATIVE_INFINITY) ||
          a.station.name.localeCompare(b.station.name),
      );
  }, [completeOnly, data.crafts, hourlyCost, profitableOnly, query, strategy]);

  useEffect(() => {
    if (!stationGroups.length) {
      setActiveStationId('');
      return;
    }

    setActiveStationId((current) =>
      stationGroups.some((group) => group.station.id === current)
        ? current
        : stationGroups[0].station.id,
    );

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const stationId = visible[0]?.target.getAttribute('data-station-id');
        if (stationId) setActiveStationId(stationId);
      },
      { rootMargin: `-${navOffset}px 0px -60% 0px`, threshold: 0 },
    );

    for (const group of stationGroups) {
      const section = document.getElementById(`station-section-${group.station.id}`);
      if (section) observer.observe(section);
    }

    return () => observer.disconnect();
  }, [stationGroups, navOffset]);

  // The station nav's height varies with viewport width (its grid wraps to
  // more/fewer rows), so the scroll offset it reserves is measured, not guessed.
  const hasStations = stationGroups.length > 0;
  useEffect(() => {
    const node = navRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      setNavOffset(HEADER_HEIGHT + node.getBoundingClientRect().height + NAV_GAP);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasStations]);

  function toggleStation(stationId: string) {
    setExpandedStations((current) =>
      current.includes(stationId)
        ? current.filter((id) => id !== stationId)
        : [...current, stationId],
    );
  }

  return (
    <div>
      <div className="grid gap-3 rounded-lg border border-border bg-surface/30 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-muted sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block">{t('search')}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </label>
        <label className="text-xs text-muted">
          <span className="mb-1 block">{t('strategy')}</span>
          <select
            value={strategy}
            onChange={(event) => setStrategy(event.target.value as PriceStrategy)}
            className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
          >
            <option value="best">{t('best')}</option>
            <option value="flea">{t('flea')}</option>
            <option value="trader">{t('trader')}</option>
          </select>
        </label>
        <label className="text-xs text-muted">
          <span className="mb-1 block">{t('hourlyCost')}</span>
          <input
            type="number"
            min={0}
            value={hourlyCost}
            onChange={(event) => setHourlyCost(Number(event.target.value))}
            className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
          <FilterToggle
            pressed={profitableOnly}
            onToggle={() => setProfitableOnly((value) => !value)}
            label={t('profitableOnly')}
          />
          <FilterToggle
            pressed={completeOnly}
            onToggle={() => setCompleteOnly((value) => !value)}
            label={t('completeOnly')}
          />
        </div>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">{t('operatingNote')}</p>

      {stationGroups.length ? (
        <nav
          ref={navRef}
          aria-label={t('stationTabs')}
          className="sticky top-[68px] z-10 -mx-4 mt-4 border-y border-border bg-bg px-4 py-3 sm:-mx-6 sm:px-6"
        >
          <p className="sr-only">{t('stationTabsHint')}</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {stationGroups.map((group) => {
              const active = activeStationId === group.station.id;
              const Icon = stationIcon(group.station.id);
              return (
                <a
                  key={group.station.id}
                  href={`#station-section-${group.station.id}`}
                  aria-current={active ? 'location' : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    setActiveStationId(group.station.id);
                    document
                      .getElementById(`station-section-${group.station.id}`)
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`flex min-h-touch items-center gap-2 rounded-md border px-3 py-2 text-[13px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                    active
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-surface text-muted hover:border-accent/50 hover:text-fg'
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{group.station.name}</span>
                  <span className={`shrink-0 tabular-nums ${active ? 'text-accent/80' : 'text-muted'}`}>
                    {group.entries.length}
                  </span>
                </a>
              );
            })}
          </div>
        </nav>
      ) : null}

      <div className="mt-6 space-y-7">
        {stationGroups.map((group) => {
          const expanded = expandedStations.includes(group.station.id);
          const entries = expanded
            ? group.entries
            : group.entries.slice(0, INITIAL_STATION_LIMIT);
          const bestProfit = group.entries[0]?.result.profit ?? null;
          const bestHourly = group.entries.reduce<number | null>(
            (best, entry) =>
              entry.result.hourlyProfit !== null &&
              (best === null || entry.result.hourlyProfit > best)
                ? entry.result.hourlyProfit
                : best,
            null,
          );
          const StationIcon = stationIcon(group.station.id);

          return (
            <section
              key={group.station.id}
              id={`station-section-${group.station.id}`}
              data-station-id={group.station.id}
              aria-labelledby={`station-${group.station.id}`}
              style={{ scrollMarginTop: navOffset }}
              className="overflow-hidden rounded-xl border border-border bg-surface/10"
            >
              <header className="flex flex-col gap-3 border-b border-border bg-surface/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">
                    <StationIcon className="size-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2 id={`station-${group.station.id}`} className="text-base font-medium text-fg">
                      {group.station.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      {t('craftCount', { count: group.entries.length })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 sm:text-right">
                  <div>
                    <p className="text-xs text-muted">{t('bestProfit')}</p>
                    <p className={`mt-0.5 text-lg font-medium tabular-nums ${
                      bestProfit !== null && bestProfit >= 0 ? 'text-positive' : 'text-negative'
                    }`}>
                      {bestProfit === null ? '—' : `₽${money.format(bestProfit)}`}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">{t('bestHourly')}</p>
                    <p className={`mt-0.5 text-lg font-medium tabular-nums ${
                      bestHourly !== null && bestHourly >= 0 ? 'text-positive' : 'text-negative'
                    }`}>
                      {bestHourly === null ? '—' : `₽${money.format(bestHourly)}`}
                    </p>
                  </div>
                </div>
              </header>

              <div className="grid gap-3 p-3 lg:grid-cols-2">
                {entries.map(({ deal, result }, index) => (
                  <article
                    key={deal.id}
                    data-profit={result.profit ?? ''}
                    className="rounded-lg border border-border bg-bg/50 p-4 transition-colors hover:border-accent/40"
                  >
                    <div className="flex items-start gap-3">
                      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        index === 0
                          ? 'bg-accent text-black'
                          : 'border border-border bg-surface text-muted'
                      }`}>
                        {index + 1}
                      </span>
                      {deal.productItem.item.iconLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={deal.productItem.item.iconLink}
                          alt=""
                          width={48}
                          height={48}
                          loading="lazy"
                          className="size-12 shrink-0 object-contain"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-fg">
                          {deal.productItem.count}× {deal.productItem.item.name}
                        </h3>
                        <p className="mt-1 text-xs text-muted">
                          {t('levelDuration', { level: deal.level, minutes: Math.round(deal.duration / 60) })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-base font-medium tabular-nums ${
                          result.profit !== null && result.profit >= 0
                            ? 'text-positive'
                            : 'text-negative'
                        }`}>
                          {result.profit === null ? '—' : `₽${money.format(result.profit)}`}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted">{t('profit')}</p>
                      </div>
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs sm:grid-cols-4">
                      <div>
                        <dt className="text-muted">{t('roi')}</dt>
                        <dd className="mt-1 font-medium tabular-nums text-fg">
                          {result.roi === null ? '—' : percent.format(result.roi)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t('perHour')}</dt>
                        <dd className="mt-1 font-medium tabular-nums text-fg">
                          {result.hourlyProfit === null
                            ? '—'
                            : `₽${money.format(result.hourlyProfit)}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t('inputCost')}</dt>
                        <dd className="mt-1 font-medium tabular-nums text-fg">
                          {result.inputCost === null
                            ? '—'
                            : `₽${money.format(result.inputCost)}`}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-muted">{t('outputValue')}</dt>
                        <dd className="mt-1 font-medium tabular-nums text-fg">
                          {result.outputGross === null
                            ? '—'
                            : `₽${money.format(result.outputGross)}`}
                        </dd>
                      </div>
                    </dl>

                    <details className="mt-3 border-t border-border pt-2">
                      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 text-xs text-muted">
                        <ChevronDown className="size-4 transition-transform" />
                        {t('materialsAndTools')}
                      </summary>
                      <div className="space-y-1 pb-1 text-xs leading-relaxed text-muted">
                        <p>
                          <span className="text-fg">{t('materials')}:</span>{' '}
                          {deal.requiredItems
                            .filter((part) => !part.tool)
                            .map((part) => `${part.count}× ${part.item.name}`)
                            .join(' · ') || '—'}
                        </p>
                        <p>
                          <span className="text-fg">{t('tools')}:</span>{' '}
                          {result.tools.join(' · ') || '—'}
                        </p>
                        {deal.requiredQuestItems.length ? (
                          <p className="text-warning">
                            {t('questItems')}: {deal.requiredQuestItems
                              .map((part) => part.item.name)
                              .join(' · ')}
                          </p>
                        ) : null}
                      </div>
                    </details>

                    {result.missing.length ? (
                      <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
                        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                        <span>{t('missing')}: {result.missing.join(', ')}</span>
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>

              {group.entries.length > INITIAL_STATION_LIMIT ? (
                <button
                  type="button"
                  onClick={() => toggleStation(group.station.id)}
                  className="flex min-h-touch w-full items-center justify-center border-t border-border text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
                >
                  {expanded
                    ? t('showTopOnly')
                    : t('showAllInStation', { count: group.entries.length })}
                </button>
              ) : null}
            </section>
          );
        })}
      </div>

      {stationGroups.length === 0 ? (
        <p className="mt-8 text-center text-sm text-muted">{t('empty')}</p>
      ) : null}
    </div>
  );
}

/** Design-system toggle chip replacing the browser-default checkbox: selected
 * state uses border + background + check mark, not colour alone. */
function FilterToggle({
  pressed,
  onToggle,
  label,
}: {
  pressed: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`inline-flex min-h-touch items-center gap-1.5 rounded-md border px-3 text-[13px] font-medium leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        pressed
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-bg text-muted hover:text-fg'
      }`}
    >
      <span
        aria-hidden="true"
        className={`flex size-4 items-center justify-center rounded-sm border ${
          pressed ? 'border-accent bg-accent text-accent-fg' : 'border-border'
        }`}
      >
        {pressed ? <Check className="size-3" /> : null}
      </span>
      {label}
    </button>
  );
}
