'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Shield } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import { localizeArmorLayerName, localizeMaterial } from '@/lib/game-localization';
import type { ArmorItem, CombatDataset } from '@/types/tools';

function Silhouette({ zones }: { zones: string[] }) {
  const active = (name: string) => zones.includes(name);
  const color = (name: string) => active(name) ? 'var(--color-accent, #d19a4b)' : '#31343a';
  return (
    <svg viewBox="0 0 220 260" role="img" aria-label={zones.join(', ')} className="mx-auto h-64 w-full max-w-[220px]">
      <circle cx="70" cy="25" r="18" fill="#31343a" />
      <rect x="60" y="43" width="20" height="18" rx="5" fill={color('neckFront')} />
      <path d="M42 63 Q70 50 98 63 L105 132 Q70 150 35 132Z" fill={color('upperChest')} stroke="#6b6f76" />
      <path d="M35 132 Q70 150 105 132 L98 185 Q70 198 42 185Z" fill={color('lowerChest')} stroke="#6b6f76" />
      <path d="M42 68 L20 80 L10 155 L28 158 L48 94Z" fill={color('leftArm')} stroke="#6b6f76" />
      <path d="M98 68 L120 80 L130 155 L112 158 L92 94Z" fill={color('rightArm')} stroke="#6b6f76" />
      <path d="M45 185 L95 185 L100 215 L40 215Z" fill={color('pelvis')} stroke="#6b6f76" />
      <circle cx="170" cy="25" r="18" fill="#31343a" />
      <rect x="160" y="43" width="20" height="18" rx="5" fill={color('neckBack')} />
      <path d="M142 63 Q170 50 198 63 L205 132 Q170 150 135 132Z" fill={color('upperBack')} stroke="#6b6f76" />
      <path d="M135 132 Q170 150 205 132 L198 185 Q170 198 142 185Z" fill={color('lowerBack')} stroke="#6b6f76" />
      <rect x="48" y="75" width="44" height="63" rx="6" fill={color('frontPlate')} fillOpacity=".75" stroke="#d6a85f" strokeDasharray="4 3" />
      <rect x="148" y="75" width="44" height="63" rx="6" fill={color('backPlate')} fillOpacity=".75" stroke="#d6a85f" strokeDasharray="4 3" />
    </svg>
  );
}

export function ArmorExplorer({ regular, pve }: { regular: CombatDataset; pve: CombatDataset }) {
  const t = useTranslations('armor');
  const locale = useLocale();
  const { gameMode } = useGameMode();
  const armor = gameMode === 'pve' ? pve.armor : regular.armor;
  const [query, setQuery] = useState('');
  const [armorClass, setArmorClass] = useState(0);
  const [material, setMaterial] = useState('');
  const [replaceable, setReplaceable] = useState(false);
  const [zone, setZone] = useState('');
  const [limit, setLimit] = useState(30);
  const materials = useMemo(() => [...new Set(armor.map((item) => item.material).filter((value): value is string => Boolean(value)))].sort(), [armor]);
  const visible = useMemo(() => armor.filter((item) =>
    (!query || item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
    (!armorClass || item.armorClass === armorClass || item.softArmor.some((layer) => layer.armorClass === armorClass)) &&
    (!material || item.material === material) &&
    (!replaceable || item.slots.length > 0) &&
    (!zone || item.normalizedZones.includes(zone) || item.softArmor.some((layer) => layer.normalizedZones.includes(zone)) || item.slots.some((slot) => slot.normalizedZones.includes(zone))),
  ), [armor, armorClass, material, query, replaceable, zone]);
  const hasActiveFilters = Boolean(query || armorClass || material || replaceable || zone);

  useEffect(() => {
    setLimit(30);
  }, [query, armorClass, material, replaceable, zone, gameMode]);

  function resetFilters() {
    setQuery('');
    setArmorClass(0);
    setMaterial('');
    setReplaceable(false);
    setZone('');
  }

  return (
    <div>
      <div className="grid gap-3 rounded-lg border border-border bg-surface/30 p-4 md:grid-cols-3 lg:grid-cols-5">
        <label className="text-xs text-muted lg:col-span-2"><span className="mb-1 block">{t('search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg" /></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('class')}</span><select value={armorClass} onChange={(event) => setArmorClass(Number(event.target.value))} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value={0}>{t('all')}</option>{[1,2,3,4,5,6].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('material')}</span><select value={material} onChange={(event) => setMaterial(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value="">{t('all')}</option>{materials.map((value) => <option key={value} value={value}>{localizeMaterial(value, locale)}</option>)}</select></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('zone')}</span><select value={zone} onChange={(event) => setZone(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value="">{t('all')}</option>{['neckFront','neckBack','upperChest','lowerChest','upperBack','lowerBack','leftSide','rightSide','pelvis','leftArm','rightArm','frontPlate','backPlate','leftPlate','rightPlate'].map((value) => <option key={value} value={value}>{t(`zones.${value}`)}</option>)}</select></label>
        <label className="flex min-h-touch items-center gap-2 text-xs text-muted"><input type="checkbox" checked={replaceable} onChange={(event) => setReplaceable(event.target.checked)} className="size-4 accent-accent" />{t('replaceable')}</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span aria-live="polite">{t('resultCount', { count: visible.length })}</span>
        {hasActiveFilters ? <button type="button" onClick={resetFilters} className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{t('reset')}</button> : null}
      </div>

      <div className="mt-5 space-y-3">
        {visible.slice(0, limit).map((item) => <ArmorCard key={item.id} item={item} />)}
      </div>
      {visible.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 30)} className="mt-5 min-h-touch w-full rounded-md border border-border text-sm text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{t('loadMore')}</button> : null}
      {!visible.length ? <p className="py-12 text-center text-sm text-muted">{t('empty')}</p> : null}
    </div>
  );
}

function ArmorCard({ item }: { item: ArmorItem }) {
  const t = useTranslations('armor');
  const locale = useLocale();
  const displayZones = [...new Set([...item.normalizedZones, ...item.softArmor.flatMap((layer) => layer.normalizedZones), ...item.slots.flatMap((slot) => slot.normalizedZones)])];
  // Collapsed card: primary zones only (plates + torso), full list when open.
  const primaryZones = displayZones.filter((value) => ['upperChest','lowerChest','upperBack','lowerBack','frontPlate','backPlate','leftPlate','rightPlate'].includes(value));
  const badgeZones = (primaryZones.length ? primaryZones : displayZones).slice(0, 4);
  const remainingZones = displayZones.length - badgeZones.length;
  return (
    <details className="group rounded-lg border border-border bg-surface/20">
      <summary className="flex min-h-touch cursor-pointer list-none items-center gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {item.iconLink ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.iconLink} alt="" width={52} height={52} loading="lazy" className="size-14 object-contain" />
        </> : <Shield className="size-10 text-muted" />}
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium text-fg">{item.name}</h2>
          <p className="mt-1 text-xs text-muted">{t('class')} {item.armorClass ?? '—'} · {localizeMaterial(item.material, locale) ?? '—'} · {item.weight ?? '—'} kg{item.slots.length ? ` · ${t('replaceableBadge')}` : ''}</p>
          <p className="mt-1.5 flex flex-wrap gap-1">
            {badgeZones.map((value) => <span key={value} className="inline-flex items-center rounded border border-border bg-bg px-1.5 py-0.5 text-[12px] leading-4 text-muted">{t(`zones.${value}`)}</span>)}
            {remainingZones > 0 ? <span className="inline-flex items-center px-1 py-0.5 text-[12px] leading-4 text-muted">+{remainingZones}</span> : null}
          </p>
        </div>
        <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-5 border-t border-border p-4 lg:grid-cols-[240px_1fr]">
        <Silhouette zones={displayZones} />
        <div className="min-w-0 max-w-full overflow-hidden">
          <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><div><dt className="text-muted">{t('durability')}</dt><dd className="mt-1 tabular-nums text-fg">{item.durability ?? '—'}</dd></div><div><dt className="text-muted">{t('blunt')}</dt><dd className="mt-1 tabular-nums text-fg">{item.bluntThroughput === null ? '—' : `${Math.round(item.bluntThroughput * 100)}%`}</dd></div><div><dt className="text-muted">{t('speed')}</dt><dd className="mt-1 tabular-nums text-fg">{item.speedPenalty === null ? '—' : `${Math.round(item.speedPenalty * 100)}%`}</dd></div><div><dt className="text-muted">{t('ergo')}</dt><dd className="mt-1 tabular-nums text-fg">{item.ergoPenalty === null ? '—' : `${Math.round(item.ergoPenalty * 100)}%`}</dd></div></dl>
          <h3 className="mt-5 text-sm font-medium text-fg">{t('softArmor')}</h3>
          <div className="mt-2 space-y-2">{item.softArmor.map((layer, index) => <div key={`${layer.name}-${index}`} className="rounded-md border border-border p-3 text-xs text-muted"><span className="text-fg">{layer.name ? localizeArmorLayerName(layer.name, locale) : t('softArmor')}</span> · {t('class')} {layer.armorClass ?? '—'} · {localizeMaterial(layer.material, locale) ?? '—'} · {layer.normalizedZones.map((zone) => t(`zones.${zone}`)).join(', ')}</div>)}{!item.softArmor.length ? <p className="text-xs text-muted">{t('noSoftArmor')}</p> : null}</div>
          <h3 className="mt-5 text-sm font-medium text-fg">{t('plateSlots')}</h3>
          <div className="mt-2 grid min-w-0 max-w-full gap-3 xl:grid-cols-2">{item.slots.map((slot, index) => <div key={`${slot.name}-${index}`} className="min-w-0 overflow-hidden rounded-md border border-border p-3"><p className="break-words text-xs font-medium text-fg">{slot.name ? localizeArmorLayerName(slot.name, locale) : t('plateSlot')} · {slot.normalizedZones.map((zone) => t(`zones.${zone}`)).join(', ')}</p><div className="mt-2 max-h-48 space-y-1.5 overflow-y-auto">{slot.allowedPlates.map((plate) => <div key={plate.id} className="flex min-w-0 flex-col gap-0.5 text-xs text-muted min-[560px]:flex-row min-[560px]:items-center min-[560px]:justify-between min-[560px]:gap-2"><span className="min-w-0 text-fg min-[560px]:truncate">{plate.name}</span><span className="shrink-0 tabular-nums">{t('class')} {plate.armorClass ?? '—'} · {localizeMaterial(plate.material, locale) ?? '—'} · {plate.weight === null ? '—' : `${plate.weight} kg`} · {t('durability')} {plate.durability ?? '—'}</span></div>)}</div></div>)}{!item.slots.length ? <p className="text-xs text-muted">{t('fixedArmor')}</p> : null}</div>
          {item.unknownZones.length ? <p className="mt-4 text-xs leading-relaxed text-muted">{t('unknownZonesNote', { count: item.unknownZones.length })}</p> : null}
          <div className="mt-4 max-w-full overflow-x-auto"><table className="min-w-full text-xs"><thead><tr className="text-left text-muted"><th className="border-b border-border py-2 pr-4">{t('layer')}</th><th className="border-b border-border py-2">{t('coverage')}</th></tr></thead><tbody>{item.softArmor.map((layer, index) => <tr key={`${layer.name}-matrix-${index}`}><td className="border-b border-border py-2 pr-4 text-fg">{layer.name ? localizeArmorLayerName(layer.name, locale) : t('softArmor')} ({layer.armorClass ?? '—'})</td><td className="border-b border-border py-2 text-muted">{layer.normalizedZones.map((zone) => t(`zones.${zone}`)).join(', ')}</td></tr>)}{item.slots.map((slot, index) => <tr key={`${slot.name}-matrix-${index}`}><td className="border-b border-border py-2 pr-4 text-fg">{slot.name ? localizeArmorLayerName(slot.name, locale) : t('plateSlot')}</td><td className="border-b border-border py-2 text-muted">{slot.normalizedZones.map((zone) => t(`zones.${zone}`)).join(', ')}</td></tr>)}</tbody></table></div>
        </div>
      </div>
    </details>
  );
}
