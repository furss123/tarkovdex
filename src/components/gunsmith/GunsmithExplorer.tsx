'use client';

import { useEffect, useState } from 'react';
import { Check, TriangleAlert, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import type { GameMode } from '@/types/tarkov';
import type { GunsmithTask } from '@/types/tools';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

const CONDITION_NAMES: Record<string, string> = {
  accuracy: 'accuracy',
  ergonomics: 'ergonomics',
  effectivedistance: 'effectiveDistance',
  recoil: 'recoil',
  weight: 'weight',
  height: 'height',
  width: 'width',
  durability: 'durability',
  magazinecapacity: 'magazineCapacity',
  muzzlevelocity: 'muzzleVelocity',
  sightingrange: 'sightingRange',
};

// Units are symbols, not copy — they read the same in ko/zh/en.
const CONDITION_UNITS: Record<string, string> = {
  weight: 'kg',
  effectiveDistance: 'm',
  sightingRange: 'm',
};

function conditionValue(key: string, value: number) {
  const unit = CONDITION_UNITS[key] ?? '';
  return `${value}${unit}`;
}

function taskButtonLabel(task: GunsmithTask) {
  if (task.part !== null) return task.part;

  const englishName = task.nameEn ?? task.name;
  if (englishName.startsWith('Gunsmith - ')) {
    return task.name.split(' - ').slice(1).join(' - ') || task.name;
  }

  return task.name.replace(' - ', ' ');
}

/**
 * Gunsmith build guide.
 *
 * Every quest is a chip, all visible at once; picking one shows a complete
 * install list beside the requirement panel with demanded-vs-reached values.
 * The builds themselves are solved offline (see
 * `scripts/generate-gunsmith-builds.mjs`) — nothing here computes a stat, it
 * only renders what the snapshot already verified.
 *
 * Per game mode this receives one of three things, and they are not the same
 * answer: a list, `[]` (no solved builds exist for that mode yet — the
 * seasonal wipe until the solver has been re-run against it), or `null` (the
 * mode's upstream documents could not be read). Collapsing the last two into
 * one "empty" message would tell a visitor their mode has no Gunsmith quests
 * when in fact we just failed to load them.
 */
export function GunsmithExplorer({
  tasksByMode,
}: {
  tasksByMode: Record<GameMode, GunsmithTask[] | null>;
}) {
  const t = useTranslations('gunsmith');
  const { gameMode } = useGameMode();
  const tasks = tasksByMode[gameMode];
  const [taskId, setTaskId] = useState('');

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash.startsWith('gunsmith-')) return;
    setTaskId(hash.slice('gunsmith-'.length));
  }, []);

  if (tasks === null) {
    return <ErrorState title={t('error')} />;
  }
  if (tasks.length === 0) {
    return <EmptyState title={t('emptyForMode')} hint={t('emptyForModeHint')} />;
  }

  const task = tasks.find((item) => item.id === taskId) ?? tasks[0];

  function conditionName(key: string) {
    const normalized = key.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const translationKey = CONDITION_NAMES[normalized];
    if (translationKey) return t(`conditionNames.${translationKey}`);
    return key.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  return (
    <div>
      {/* Every quest is visible at once as a chip; the visible "task" label is
        * dropped and kept only as the group's accessible name. Numbered parts
        * show just their ordinal — the page title supplies the "Gunsmith"
        * context, and the selected quest's full name sits in the panel below. */}
      <div
        role="group"
        aria-label={t('task')}
        className="grid grid-cols-4 gap-2 rounded-lg border border-border bg-surface/30 p-3 sm:grid-cols-6 lg:grid-cols-9"
      >
        {tasks.map((item) => {
          const active = item.id === task.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-label={item.name}
              aria-pressed={active}
              onClick={() => setTaskId(item.id)}
              className={`flex h-14 w-full min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1 text-center leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                active
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-surface text-muted hover:border-accent/50 hover:text-fg'
              }`}
            >
              <span
                className={`${item.part !== null ? 'text-sm' : 'text-[14px]'} max-w-full break-words font-medium tabular-nums`}
              >
                {taskButtonLabel(item)}
              </span>
              {item.minPlayerLevel ? (
                <span
                  className={`text-[14px] leading-5 tabular-nums ${active ? 'text-accent/80' : 'text-muted'}`}
                >
                  Lv.{item.minPlayerLevel}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        id={`gunsmith-${task.id}`}
        className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]"
      >
        <section className="min-w-0 rounded-lg border border-border bg-surface/20 p-4 sm:p-5">
          <div className="flex items-center gap-3 border-b border-border pb-4">
            {task.weapon.iconLink ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={task.weapon.iconLink}
                alt=""
                width={64}
                height={64}
                className="size-16 shrink-0 object-contain"
              />
            ) : null}
            <div className="min-w-0">
              <p className="text-xs text-accent">{t('baseWeapon')}</p>
              <h2 className="mt-1 break-words text-base font-medium text-fg">
                {task.weapon.name}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {task.nameEn ? `${task.name} (${task.nameEn})` : task.name}
                {task.trader ? ` · ${task.trader}` : ''}
                {task.minPlayerLevel
                  ? ` · ${t('minLevel', { level: task.minPlayerLevel })}`
                  : ''}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Wrench className="size-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-medium text-fg">
              {t('buildTitle', { count: task.build.length })}
            </h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {t('buildIntro')}
          </p>

          <ol className="mt-3 space-y-2">
            {task.build.map((part, index) => (
              <li
                key={`${part.parent?.id ?? 'weapon'}:${part.slot}:${part.item.id}`}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <span className="mt-1 w-6 shrink-0 text-xs tabular-nums text-muted">
                  {index + 1}
                </span>
                {part.item.iconLink ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={part.item.iconLink}
                    alt=""
                    width={44}
                    height={44}
                    loading="lazy"
                    className="size-11 shrink-0 object-contain"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="min-w-0 break-words text-xs text-accent">
                      {part.slot}
                    </p>
                    {part.required ? (
                      <span className="inline-flex max-w-full shrink-0 rounded border border-accent/40 px-2 py-0.5 text-xs text-accent">
                        {t('questPart')}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-sm font-medium text-fg">
                    {part.item.name}
                  </p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-muted">
                    {part.parent
                      ? t('attachTo', { parent: part.parent.name })
                      : t('attachToWeapon', { weapon: task.weapon.name })}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-lg border border-border bg-surface/20 p-4">
            <h2 className="text-sm font-medium text-fg">{t('conditions')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {t('conditionsIntro')}
            </p>
            <ul className="mt-3 space-y-2">
              {task.conditions.map((condition) => (
                <li
                  key={condition.key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 break-words text-muted">
                    {conditionName(condition.key)}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-muted">
                      {condition.compareMethod}{' '}
                      {conditionValue(condition.key, condition.value)}
                    </span>
                    <strong className="font-medium text-fg">
                      {conditionValue(condition.key, condition.actual)}
                    </strong>
                    {condition.satisfied ? (
                      <Check className="size-4 text-positive" aria-label={t('met')} />
                    ) : (
                      <TriangleAlert
                        className="size-4 text-warning"
                        aria-label={t('notMet')}
                      />
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p
              className={`mt-3 flex items-start gap-2 text-xs leading-relaxed ${
                task.verified ? 'text-muted' : 'text-warning'
              }`}
            >
              {task.verified ? (
                <Check
                  className="mt-0.5 size-4 shrink-0 text-positive"
                  aria-hidden="true"
                />
              ) : (
                <TriangleAlert
                  className="mt-0.5 size-4 shrink-0 text-warning"
                  aria-hidden="true"
                />
              )}
              {task.verified ? t('verified') : t('unverified')}
            </p>
          </section>

          <section className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <h2 className="text-sm font-medium text-accent">{t('notesTitle')}</h2>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
              <li>{t('noteDurability')}</li>
              <li>{t('noteAmmo')}</li>
              <li>{t('noteAlternatives')}</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
