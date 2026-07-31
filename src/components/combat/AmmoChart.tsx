'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Pin, PinOff } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import { formatCaliber } from '@/lib/game-localization';
import { penetrationGrade } from '@/lib/tool-calculations';
import type { AmmoRound, CombatDataset } from '@/types/tools';

const ARMOR_CLASSES = [1, 2, 3, 4, 5, 6] as const;

/** Highest armor class this round still handles well (grade good/excellent);
 * 0 when it struggles even against class 1. */
function bestEffectiveClass(round: AmmoRound): number {
  let best = 0;
  for (const armorClass of ARMOR_CLASSES) {
    const grade = penetrationGrade(round.penetrationPower, armorClass);
    if (grade === 'excellent' || grade === 'good') best = armorClass;
  }
  return best;
}

type SortKey = 'penetration' | 'damage' | 'armorDamage' | 'speed';
const SORT_VALUE: Record<SortKey, (round: AmmoRound) => number | null> = {
  penetration: (round) => round.penetrationPower,
  damage: (round) => round.damage,
  armorDamage: (round) => round.armorDamage,
  speed: (round) => round.initialSpeed,
};
const MAX_PINNED = 4;

function Grade({ round, armorClass }: { round: AmmoRound; armorClass: number }) {
  const t = useTranslations('ammo');
  const grade = penetrationGrade(round.penetrationPower, armorClass);
  const colors = {
    excellent: 'border-positive/50 bg-positive/10 text-positive',
    good: 'border-lime-500/40 bg-lime-500/10 text-lime-300',
    limited: 'border-warning/50 bg-warning/10 text-warning',
    poor: 'border-negative/50 bg-negative/10 text-negative',
  };
  return <span className={`inline-flex min-h-8 w-full items-center justify-center whitespace-nowrap rounded border px-1.5 text-xs ${colors[grade]}`}>{t(`grades.${grade}`)}</span>;
}

export function AmmoChart({ regular, pve }: { regular: CombatDataset; pve: CombatDataset }) {
  const t = useTranslations('ammo');
  const locale = useLocale();
  const { gameMode } = useGameMode();
  const ammo = gameMode === 'pve' ? pve.ammo : regular.ammo;
  const [query, setQuery] = useState('');
  const [caliber, setCaliber] = useState('');
  const [sort, setSort] = useState<SortKey>('penetration');
  const [tracerOnly, setTracerOnly] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [pinLimitHit, setPinLimitHit] = useState(false);
  const [limit, setLimit] = useState(60);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? '');
    setCaliber(params.get('caliber') ?? '');
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (query) params.set('q', query);
    else params.delete('q');
    if (caliber) params.set('caliber', caliber);
    else params.delete('caliber');
    params.set('sort', sort);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  }, [caliber, query, sort]);
  // Filter changes reset paging so results never look truncated mid-list.
  useEffect(() => {
    setLimit(60);
  }, [query, caliber, tracerOnly, gameMode]);

  const calibers = useMemo(() => [...new Set(ammo.map((round) => round.caliber))].sort(), [ammo]);
  const visible = useMemo(() => ammo.filter((round) =>
    (!query || `${round.name} ${round.shortName} ${round.caliber} ${formatCaliber(round.caliber, locale)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) &&
    (!caliber || round.caliber === caliber) &&
    (!tracerOnly || round.tracer),
  ).sort((a, b) => (SORT_VALUE[sort](b) ?? -Infinity) - (SORT_VALUE[sort](a) ?? -Infinity)), [ammo, caliber, locale, query, sort, tracerOnly]);
  const displayed = [...visible.filter((round) => pinned.includes(round.id)), ...visible.filter((round) => !pinned.includes(round.id))].slice(0, limit);
  // Mobile shows pinned rounds in their own comparison section regardless of
  // the paging limit, so a pin never disappears behind "load more".
  const pinnedRounds = visible.filter((round) => pinned.includes(round.id));
  const hasActiveFilters = Boolean(query || caliber || tracerOnly);

  function togglePin(id: string) {
    const isPinned = pinned.includes(id);
    if (!isPinned && pinned.length >= MAX_PINNED) {
      setPinLimitHit(true);
      return;
    }
    setPinLimitHit(false);
    setPinned(isPinned ? pinned.filter((value) => value !== id) : [...pinned, id]);
  }

  function resetFilters() {
    setQuery('');
    setCaliber('');
    setTracerOnly(false);
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface/30 p-4 md:grid-cols-4">
        <label className="col-span-2 text-xs text-muted md:col-span-1"><span className="mb-1 block">{t('search')}</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg" /></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('caliber')}</span><select value={caliber} onChange={(event) => setCaliber(event.target.value)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value="">{t('all')}</option>{calibers.map((value) => <option key={value} value={value}>{formatCaliber(value, locale)}</option>)}</select></label>
        <label className="text-xs text-muted"><span className="mb-1 block">{t('sort')}</span><select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"><option value="penetration">{t('penetration')}</option><option value="damage">{t('damage')}</option><option value="armorDamage">{t('armorDamage')}</option><option value="speed">{t('speed')}</option></select></label>
        <label className="col-span-2 flex min-h-touch items-center gap-2 text-xs text-muted md:col-span-1 md:self-end"><input type="checkbox" checked={tracerOnly} onChange={(event) => setTracerOnly(event.target.checked)} className="size-4 accent-accent" />{t('tracerOnly')}</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted">
        <span aria-live="polite">{t('resultCount', { count: visible.length })}</span>
        {hasActiveFilters ? <button type="button" onClick={resetFilters} className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{t('reset')}</button> : null}
        {pinned.length ? <span>{t('pinnedNote', { count: pinned.length })}</span> : null}
        {pinLimitHit ? <span role="status" className="text-warning">{t('pinLimit', { max: MAX_PINNED })}</span> : null}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">{t('method')}</p>

      <div className="mt-5 hidden max-w-full overflow-x-auto rounded-lg border border-border lg:block">
        <table className="w-full min-w-[1160px] table-fixed border-collapse text-xs">
          <colgroup>
            <col className="w-[56px]" />
            <col className="w-[264px]" />
            <col className="w-[76px]" />
            <col className="w-[76px]" />
            <col className="w-[104px]" />
            <col className="w-[92px]" />
            {ARMOR_CLASSES.map((armorClass) => <col key={armorClass} className="w-[82px]" />)}
          </colgroup>
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th className="sticky left-0 z-30 whitespace-nowrap border-b border-border bg-surface-2 px-2 py-3 text-center font-medium">{t('pinColumn')}</th>
              <th className="sticky left-[56px] z-30 whitespace-nowrap border-b border-border bg-surface-2 px-2 py-3 text-left font-medium">{t('ammo')}</th>
              <th className="whitespace-nowrap border-b border-border px-2 py-3 text-center font-medium">{t('damage')}</th>
              <th className="whitespace-nowrap border-b border-border px-2 py-3 text-center font-medium">{t('penetration')}</th>
              <th className="whitespace-nowrap border-b border-border px-2 py-3 text-center font-medium">{t('armorDamage')}</th>
              <th className="whitespace-nowrap border-b border-border px-2 py-3 text-center font-medium">{t('speed')}</th>
              {ARMOR_CLASSES.map((value) => <th key={value} className="whitespace-nowrap border-b border-border px-2 py-3 text-center font-medium">{t('class')} {value}</th>)}
            </tr>
          </thead>
          <tbody>{displayed.map((round) => <tr key={round.id} className={pinned.includes(round.id) ? 'bg-accent/5' : 'hover:bg-surface/50'}>
            <td className="sticky left-0 z-10 border-b border-border bg-bg px-1 py-2 text-center"><button type="button" onClick={() => togglePin(round.id)} className="inline-flex size-touch items-center justify-center rounded text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label={pinned.includes(round.id) ? t('unpin') : t('pin')} aria-pressed={pinned.includes(round.id)}>{pinned.includes(round.id) ? <PinOff className="size-4 text-accent" /> : <Pin className="size-4" />}</button></td>
            <td className="sticky left-[56px] z-10 border-b border-border bg-bg px-2 py-2"><div className="flex min-w-0 items-center gap-2">{round.iconLink ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={round.iconLink} alt="" width={32} height={32} loading="lazy" className="size-8 shrink-0 object-contain" />
            </> : null}<div className="min-w-0"><p className="line-clamp-2 text-fg">{round.name}</p><p className="truncate text-muted">{formatCaliber(round.caliber, locale)}{round.tracer ? ` · ${t('tracer')}` : ''}</p></div></div></td>
            <td className="whitespace-nowrap border-b border-border px-2 text-center tabular-nums">{round.damage ?? '—'}</td><td className="whitespace-nowrap border-b border-border px-2 text-center tabular-nums">{round.penetrationPower ?? '—'}</td><td className="whitespace-nowrap border-b border-border px-2 text-center tabular-nums">{round.armorDamage === null ? '—' : `${round.armorDamage}%`}</td><td className="whitespace-nowrap border-b border-border px-2 text-center tabular-nums">{round.initialSpeed === null ? '—' : `${round.initialSpeed} m/s`}</td>
            {ARMOR_CLASSES.map((armorClass) => <td key={armorClass} className="border-b border-border px-2 py-2 text-center"><Grade round={round} armorClass={armorClass} /></td>)}
          </tr>)}</tbody>
        </table>
      </div>

      <div className="mt-5 lg:hidden">
        {pinnedRounds.length ? (
          <section aria-label={t('pinnedCompare')} className="mb-5 rounded-lg border border-accent/40 p-3">
            <h2 className="text-[13px] font-medium leading-5 text-accent">{t('pinnedCompare')}</h2>
            <div className="mt-2 space-y-3">
              {pinnedRounds.map((round) => (
                <MobileAmmoCard key={`pinned-${round.id}`} round={round} isPinned onTogglePin={togglePin} locale={locale} alwaysShowGrades />
              ))}
            </div>
          </section>
        ) : null}
        <div className="space-y-3">
          {displayed.filter((round) => !pinned.includes(round.id)).map((round) => (
            <MobileAmmoCard key={round.id} round={round} isPinned={false} onTogglePin={togglePin} locale={locale} />
          ))}
        </div>
      </div>
      {visible.length > limit ? <button type="button" onClick={() => setLimit((value) => value + 60)} className="mt-5 min-h-touch w-full rounded-md border border-border text-sm text-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50">{t('loadMore')}</button> : null}
      {!visible.length ? <p className="py-12 text-center text-sm text-muted">{t('empty')}</p> : null}
    </div>
  );
}

/** Compact mobile card: damage and penetration always share one line, the
 * recommended armor class is the only other default stat, and the full
 * class 1–6 grade grid (plus armor damage / velocity) sits behind an
 * expandable section. Pinned comparison cards show the grades directly. */
function MobileAmmoCard({
  round,
  isPinned,
  onTogglePin,
  locale,
  alwaysShowGrades = false,
}: {
  round: AmmoRound;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  locale: string;
  alwaysShowGrades?: boolean;
}) {
  const t = useTranslations('ammo');
  const best = bestEffectiveClass(round);

  const gradeGrid = (
    <div className="grid grid-cols-3 gap-2">
      {ARMOR_CLASSES.map((armorClass) => (
        <div key={armorClass} className="text-center">
          <p className="mb-1 text-[12px] leading-4 text-muted">{t('class')} {armorClass}</p>
          <Grade round={round} armorClass={armorClass} />
        </div>
      ))}
    </div>
  );

  return (
    <article className={`rounded-lg border p-4 ${isPinned ? 'border-accent/40 bg-accent/5' : 'border-border bg-surface/20'}`}>
      <div className="flex items-start gap-3">
        {round.iconLink ? <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={round.iconLink} alt="" width={44} height={44} loading="lazy" className="size-11 shrink-0 object-contain" />
        </> : null}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm text-fg">{round.name}</h3>
          <p className="text-xs text-muted">{formatCaliber(round.caliber, locale)}{round.tracer ? ` · ${t('tracer')}` : ''}</p>
        </div>
        <button type="button" onClick={() => onTogglePin(round.id)} className="flex size-touch shrink-0 items-center justify-center rounded border border-border text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50" aria-label={isPinned ? t('unpin') : t('pin')} aria-pressed={isPinned}>
          {isPinned ? <PinOff className="size-4 text-accent" /> : <Pin className="size-4" />}
        </button>
      </div>

      <p className="mt-3 whitespace-nowrap text-[14px] leading-5 text-muted">
        {t('damage')} <span className="font-medium tabular-nums text-fg">{round.damage ?? '—'}</span>
        {' · '}
        {t('penetration')} <span className="font-medium tabular-nums text-fg">{round.penetrationPower ?? '—'}</span>
      </p>
      <p className="mt-1.5 text-[13px] leading-5 text-muted">
        {t('bestClass')}:{' '}
        {best > 0 ? (
          <span className="font-medium text-fg">{t('class')} {best}</span>
        ) : (
          <span>{t('noEffectiveClass')}</span>
        )}
      </p>

      {alwaysShowGrades ? (
        <div className="mt-3 border-t border-border/60 pt-3">
          <p className="mb-2 text-[13px] leading-5 text-muted">
            {t('armorDamage')} <span className="tabular-nums text-fg">{round.armorDamage === null ? '—' : `${round.armorDamage}%`}</span>
            {' · '}
            {t('speed')} <span className="tabular-nums text-fg">{round.initialSpeed === null ? '—' : `${round.initialSpeed} m/s`}</span>
          </p>
          {gradeGrid}
        </div>
      ) : (
        <details className="group mt-3 border-t border-border/60 pt-2">
          <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 text-[13px] leading-5 text-muted">
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
            {t('gradeDetails')}
          </summary>
          <p className="mb-2 mt-1 text-[13px] leading-5 text-muted">
            {t('armorDamage')} <span className="tabular-nums text-fg">{round.armorDamage === null ? '—' : `${round.armorDamage}%`}</span>
            {' · '}
            {t('speed')} <span className="tabular-nums text-fg">{round.initialSpeed === null ? '—' : `${round.initialSpeed} m/s`}</span>
          </p>
          {gradeGrid}
        </details>
      )}
    </article>
  );
}
