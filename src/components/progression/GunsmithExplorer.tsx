'use client';

import { useState } from 'react';
import { Check, TriangleAlert, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import type { GunsmithTask } from '@/types/tools';

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

export function GunsmithExplorer({
  regular,
  pve,
}: {
  regular: GunsmithTask[];
  pve: GunsmithTask[];
}) {
  const t = useTranslations('gunsmith');
  const { gameMode } = useGameMode();
  const tasks = gameMode === 'pve' ? pve : regular;
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '');
  const task = tasks.find((item) => item.id === taskId) ?? tasks[0];

  if (!task) {
    return <p className="py-12 text-center text-sm text-muted">{t('empty')}</p>;
  }

  function conditionName(key: string) {
    const normalized = key.replace(/[^a-zA-Z]/g, '').toLowerCase();
    const translationKey = CONDITION_NAMES[normalized];
    if (translationKey) return t(`conditionNames.${translationKey}`);
    return key.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

  return (
    <div>
      <div className="rounded-lg border border-border bg-surface/30 p-4">
        <label className="block max-w-2xl text-xs text-muted">
          <span className="mb-1 block">{t('task')}</span>
          <select
            value={task.id}
            onChange={(event) => setTaskId(event.target.value)}
            className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
          >
            {tasks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.minPlayerLevel ? `${item.name} · Lv.${item.minPlayerLevel}` : item.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
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
              <h2 className="mt-1 break-words text-base font-medium text-fg">{task.weapon.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {task.nameEn ? `${task.name} (${task.nameEn})` : task.name}
                {task.trader ? ` · ${task.trader}` : ''}
                {task.minPlayerLevel ? ` · ${t('minLevel', { level: task.minPlayerLevel })}` : ''}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Wrench className="size-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-medium text-fg">
              {t('buildTitle', { count: task.build.length })}
            </h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">{t('buildIntro')}</p>

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
                  <p className="text-xs text-accent">{part.slot}</p>
                  <p className="mt-1 break-words text-sm font-medium text-fg">{part.item.name}</p>
                  <p className="mt-1 break-words text-xs leading-relaxed text-muted">
                    {part.parent
                      ? t('attachTo', { parent: part.parent.name })
                      : t('attachToWeapon', { weapon: task.weapon.name })}
                  </p>
                </div>
                {part.required ? (
                  <span className="shrink-0 rounded border border-accent/40 px-2 py-0.5 text-xs text-accent">
                    {t('questPart')}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>

        <aside className="min-w-0 space-y-4">
          <section className="rounded-lg border border-border bg-surface/20 p-4">
            <h2 className="text-sm font-medium text-fg">{t('conditions')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t('conditionsIntro')}</p>
            <ul className="mt-3 space-y-2">
              {task.conditions.map((condition) => (
                <li
                  key={condition.key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-xs"
                >
                  <span className="min-w-0 break-words text-muted">{conditionName(condition.key)}</span>
                  <span className="flex shrink-0 items-center gap-2 tabular-nums">
                    <span className="text-muted">
                      {condition.compareMethod} {conditionValue(condition.key, condition.value)}
                    </span>
                    <strong className="font-medium text-fg">
                      {conditionValue(condition.key, condition.actual)}
                    </strong>
                    {condition.satisfied ? (
                      <Check className="size-4 text-positive" aria-label={t('met')} />
                    ) : (
                      <TriangleAlert className="size-4 text-warning" aria-label={t('notMet')} />
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
                <Check className="mt-0.5 size-4 shrink-0 text-positive" aria-hidden="true" />
              ) : (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
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
