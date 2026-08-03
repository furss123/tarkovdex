'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Shield } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import { localizeArmorLayerName, localizeMaterial } from '@/lib/game-localization';
import type { ArmorItem, ArmorPlate, CombatDataset } from '@/types/tools';

// The API's 15 collider zones are more granularity than anyone shops with;
// what players actually ask is "does it cover my stomach / arms / sides".
const AREAS = ['thorax', 'stomach', 'sides', 'arms', 'neck'] as const;
const ZONE_AREA: Record<string, (typeof AREAS)[number]> = {
  upperChest: 'thorax', lowerChest: 'thorax', upperBack: 'thorax', lowerBack: 'thorax',
  frontPlate: 'thorax', backPlate: 'thorax',
  pelvis: 'stomach',
  leftSide: 'sides', rightSide: 'sides', leftPlate: 'sides', rightPlate: 'sides',
  leftArm: 'arms', rightArm: 'arms',
  neckFront: 'neck', neckBack: 'neck',
};

function areasOf(zones: string[]): string[] {
  const found = new Set(zones.map((zone) => ZONE_AREA[zone]).filter(Boolean));
  return AREAS.filter((area) => found.has(area));
}

function coveredAreas(item: ArmorItem): string[] {
  return areasOf([
    ...item.normalizedZones,
    ...item.softArmor.flatMap((layer) => layer.normalizedZones),
  ]);
}

/** The API's item-level class describes its default configuration. Compatible
 * plates are possibilities, not installed armor, so they must never raise it. */
function defaultConfigClass(item: ArmorItem): number | null {
  if (typeof item.armorClass === 'number' && item.armorClass > 0) return item.armorClass;
  return softArmorClass(item);
}

function softArmorClass(item: ArmorItem): number | null {
  const values = item.softArmor
    .map((layer) => layer.armorClass)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  return values.length ? Math.max(...values) : null;
}

const pct = (value: number | null) => {
  if (value === null) return '—';
  const scaled = Math.round(value * 10_000) / 100;
  return `${Object.is(scaled, -0) ? 0 : scaled}%`;
};

export function ArmorExplorer({ regular, pve }: { regular: CombatDataset; pve: CombatDataset }) {
  const t = useTranslations('armor');
  const { gameMode } = useGameMode();
  const source = gameMode === 'pve' ? pve.armor : regular.armor;
  const [query, setQuery] = useState('');
  const [armorClass, setArmorClass] = useState(0);
  const [area, setArea] = useState('');
  const [replaceable, setReplaceable] = useState(false);
  const [limit, setLimit] = useState(30);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get('q');
    if (initial) setQuery(initial);
  }, []);

  const armor = useMemo(
    () => source
      .map((item) => ({
        item,
        cls: defaultConfigClass(item),
        softCls: softArmorClass(item),
        areas: coveredAreas(item),
      }))
      .sort((a, b) => (b.cls ?? -1) - (a.cls ?? -1) || a.item.name.localeCompare(b.item.name)),
    [source],
  );
  const visible = useMemo(() => armor.filter(({ item, cls, areas }) =>
    (!query || item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
    (!armorClass || cls === armorClass) &&
    (!replaceable || item.slots.length > 0) &&
    (!area || areas.includes(area)),
  ), [armor, armorClass, area, query, replaceable]);
  const hasActiveFilters = Boolean(query || armorClass || area || replaceable);

  useEffect(() => {
    setLimit(30);
  }, [query, armorClass, area, replaceable, gameMode]);

  return (
    <div>
      <div className="grid gap-3 rounded-lg border border-border bg-surface/30 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-muted"><span className="mb-1 block">{t('search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg" /></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('class')}</span><select value={armorClass} onChange={(event) => setArmorClass(Number(event.target.value))} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value={0}>{t('all')}</option>{[6,5,4,3,2,1].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('area')}</span><select value={area} onChange={(event) => setArea(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value="">{t('all')}</option>{AREAS.map((value) => <option key={value} value={value}>{t(`areas.${value}`)}</option>)}</select></label>
        <label className="flex min-h-touch cursor-pointer items-center gap-2 self-end text-xs text-muted">
          <span className="inline-flex size-touch shrink-0 items-center justify-center">
            <input
              type="checkbox"
              checked={replaceable}
              onChange={(event) => setReplaceable(event.target.checked)}
              className="size-4 accent-accent"
            />
          </span>
          {t('replaceable')}
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span aria-live="polite">{t('resultCount', { count: visible.length })}</span>
        {hasActiveFilters ? <button type="button" onClick={() => { setQuery(''); setArmorClass(0); setArea(''); setReplaceable(false); }} className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{t('reset')}</button> : null}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{t('defaultConfigNote')}</p>

      <div className="mt-5 space-y-3">
        {visible.slice(0, limit).map(({ item, cls, softCls, areas }) => <ArmorCard key={item.id} item={item} cls={cls} softCls={softCls} areas={areas} />)}
      </div>
      {visible.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 30)} className="mt-5 min-h-touch w-full rounded-md border border-border text-sm text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{t('loadMore')}</button> : null}
      {!visible.length ? <p className="py-12 text-center text-sm text-muted">{t('empty')}</p> : null}
    </div>
  );
}

function CoverageChips({ areas }: { areas: string[] }) {
  const t = useTranslations('armor');
  return (
    <p className="flex flex-wrap gap-1">
      {AREAS.map((value) => {
        const on = areas.includes(value);
        return (
          <span
            key={value}
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[14px] leading-5 ${on ? 'border-accent/50 bg-accent/10 text-accent' : 'border-border/60 text-muted/60'}`}
          >
            {t(`areas.${value}`)}
          </span>
        );
      })}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm tabular-nums text-fg">{value}</dd>
    </div>
  );
}

function ArmorCard({ item, cls, softCls, areas }: { item: ArmorItem; cls: number | null; softCls: number | null; areas: string[] }) {
  const t = useTranslations('armor');
  const locale = useLocale();

  // Front/back slots almost always accept the same plate set — listing it twice
  // is the single biggest source of noise in the detail panel.
  const plateGroups = useMemo(() => {
    const groups = new Map<string, { names: string[]; plates: ArmorPlate[] }>();
    for (const slot of item.slots) {
      const key = slot.allowedPlates.map((plate) => plate.id).sort().join(',');
      const name = slot.name ? localizeArmorLayerName(slot.name, locale) : t('plateSlot');
      const group = groups.get(key);
      if (group) group.names.push(name);
      else groups.set(key, { names: [name], plates: [...slot.allowedPlates].sort((a, b) => (b.armorClass ?? -1) - (a.armorClass ?? -1) || a.name.localeCompare(b.name)) });
    }
    return [...groups.values()];
  }, [item.slots, locale, t]);

  return (
    <details className="group rounded-lg border border-border bg-surface/20 open:border-accent/30">
      <summary className="grid min-h-touch cursor-pointer list-none grid-cols-[auto_auto_1fr_auto] items-center gap-x-2.5 gap-y-2 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 sm:gap-x-3 sm:p-4">
        <span className="flex size-[52px] flex-col items-center justify-center rounded-md border border-border bg-bg leading-none sm:size-[56px]">
          <span className="text-[14px] leading-4 text-muted">{t('baseClassShort')}</span>
          <span className="mt-0.5 text-lg tabular-nums text-accent">{cls ?? '—'}</span>
        </span>
        {item.iconLink ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.iconLink} alt="" width={56} height={56} loading="lazy" className="size-[52px] object-contain sm:size-[56px]" />
        </> : <Shield className="size-[52px] p-2 text-muted sm:size-[56px]" />}
        <div className="min-w-0">
          <h2 className="break-words text-sm font-medium text-fg">{item.name}</h2>
          <p className="mt-1 text-xs text-muted">
            {item.weight === null ? '—' : `${item.weight} kg`} · {softCls === null ? t('noSoftArmor') : `${t('softArmor')} ${t('classShort')} ${softCls}`} · {t('speed')} {pct(item.speedPenalty)} · {t('turn')} {pct(item.turnPenalty)} · {t('ergo')} {pct(item.ergoPenalty)}
            {item.slots.length ? ` · ${t('replaceableBadge')}` : ''}
          </p>
        </div>
        <ChevronDown className="size-5 text-muted transition-transform group-open:rotate-180" />
        <div className="col-span-4"><CoverageChips areas={areas} /></div>
      </summary>

      <div className="border-t border-border p-4">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t('durability')} value={item.durability === null ? '—' : String(item.durability)} />
          <Stat label={t('weight')} value={item.weight === null ? '—' : `${item.weight} kg`} />
          <Stat label={t('blunt')} value={pct(item.bluntThroughput)} />
          <Stat label={t('speed')} value={pct(item.speedPenalty)} />
          <Stat label={t('turn')} value={pct(item.turnPenalty)} />
          <Stat label={t('ergo')} value={pct(item.ergoPenalty)} />
        </dl>

        {item.softArmor.length ? <>
          <h3 className="mt-5 text-xs uppercase tracking-wide text-muted">{t('softArmor')}</h3>
          <ul className="mt-2 space-y-1.5">
            {item.softArmor.map((layer, index) => (
              <li key={`${layer.name}-${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 rounded-md border border-border px-3 py-2 text-xs text-muted">
                <span className="text-sm text-fg">{layer.name ? localizeArmorLayerName(layer.name, locale) : t('softArmor')}</span>
                <span className="text-accent">{t('classShort')} {layer.armorClass ?? '—'}</span>
                <span>{t('durabilityShort')} {layer.durability ?? '—'}</span>
                <span>{localizeMaterial(layer.material, locale) ?? '—'}</span>
                <span className="basis-full sm:basis-auto">{areasOf(layer.normalizedZones).map((value) => t(`areas.${value}`)).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </> : <p className="mt-5 text-xs text-muted">{t('noSoftArmor')}</p>}

        <h3 className="mt-5 text-xs uppercase tracking-wide text-muted">{t('plateSlots')}</h3>
        {plateGroups.length ? (
          <div className="mt-2 space-y-3">
            {plateGroups.map((group, index) => (
              <div key={index} className="rounded-md border border-border p-3">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-fg">
                  {group.names.join(' / ')}
                  <span className="text-xs text-muted">{t('plateCount', { count: group.plates.length })}</span>
                </p>
                <ul className="mt-2 grid gap-x-4 gap-y-1.5 md:grid-cols-2 xl:grid-cols-3">
                  {group.plates.map((plate) => (
                    <li key={plate.id} className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-0.5 text-xs">
                      <span className="w-12 tabular-nums text-accent">{t('classShort')} {plate.armorClass ?? '—'}</span>
                      <span className="min-w-0 flex-1 break-words text-fg">{plate.name}</span>
                      <span className="col-span-2 break-words pl-14 tabular-nums text-muted">{plate.weight === null ? '—' : `${plate.weight} kg`} · {t('durabilityShort')} {plate.durability ?? '—'} · {localizeMaterial(plate.material, locale) ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-xs text-muted">{t('fixedArmor')}</p>}
      </div>
    </details>
  );
}
