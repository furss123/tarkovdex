'use client';

import { useState } from 'react';
import { CheckCircle2, CircleHelp, ListOrdered, Wrench } from 'lucide-react';
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
  const [selections, setSelections] = useState<Record<string, string>>({});
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
            onChange={(event) => {
              setTaskId(event.target.value);
              setSelections({});
            }}
            className="min-h-touch w-full rounded-md border border-border bg-bg px-3 text-sm text-fg"
          >
            {tasks.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <section className="rounded-lg border border-border bg-surface/20 p-4 sm:p-5">
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
              <h2 className="mt-1 text-base font-medium text-fg">{task.weapon.name}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {t('prepareWeapon', { weapon: task.weapon.name })}
              </p>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <ListOrdered className="size-4 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-medium text-fg">{t('guideTitle')}</h3>
          </div>

          <ol className="mt-3 space-y-3">
            <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md border border-border p-3">
              <span className="flex size-8 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">1</span>
              <div>
                <p className="text-sm font-medium text-fg">{t('baseWeapon')}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {t('prepareWeapon', { weapon: task.weapon.name })}
                </p>
              </div>
            </li>

            {task.candidates.map((candidate, index) => {
              const options = [candidate.item, ...candidate.alternatives];
              const selected =
                options.find((item) => item.id === selections[candidate.requirementId]) ??
                candidate.item;
              const selectedIndex = options.findIndex((item) => item.id === selected.id);
              const selectedPath =
                selectedIndex === 0
                  ? candidate.path
                  : candidate.alternativePaths[selectedIndex - 1] ?? [selected];

              return (
                <li
                  key={`${candidate.requirement}:${candidate.requirementId}`}
                  className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 rounded-md border border-border p-3"
                >
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent/10 text-xs font-medium text-accent">
                    {index + 2}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-start gap-3">
                      {selected.iconLink ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selected.iconLink}
                          alt=""
                          width={44}
                          height={44}
                          className="size-11 shrink-0 object-contain"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted">
                          {candidate.requirement === 'item'
                            ? t('requiredItem')
                            : t('requiredCategory')}
                        </p>
                        {options.length > 1 ? (
                          <label className="mt-1 block">
                            <span className="sr-only">{t('selectPart')}</span>
                            <select
                              value={selected.id}
                              onChange={(event) =>
                                setSelections((current) => ({
                                  ...current,
                                  [candidate.requirementId]: event.target.value,
                                }))
                              }
                              className="min-h-touch w-full rounded-md border border-border bg-bg px-2 text-sm text-fg"
                            >
                              {options.map((option) => (
                                <option key={option.id} value={option.id}>{option.name}</option>
                              ))}
                            </select>
                          </label>
                        ) : (
                          <p className="mt-1 text-sm font-medium text-fg">{selected.name}</p>
                        )}
                      </div>
                      {candidate.compatible ? (
                        <CheckCircle2
                          className="mt-1 size-4 shrink-0 text-positive"
                          aria-label={t('compatible')}
                        />
                      ) : candidate.pathComplete ? (
                        <Wrench
                          className="mt-1 size-4 shrink-0 text-accent"
                          aria-label={t('adapterPathFound')}
                        />
                      ) : (
                        <CircleHelp
                          className="mt-1 size-4 shrink-0 text-warning"
                          aria-label={t('requiresAdapter')}
                        />
                      )}
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-muted">
                      {candidate.compatible
                        ? t('installPart', { part: selected.name, weapon: task.weapon.name })
                        : candidate.pathComplete
                          ? t('installPartPath', {
                              path: [task.weapon.name, ...selectedPath.map((part) => part.name)].join(' → '),
                            })
                          : t('installPartWithAdapter', {
                            part: selected.name,
                            weapon: task.weapon.name,
                          })}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {!task.candidates.length ? (
            <p className="mt-4 text-sm text-warning">{t('noStructuralCandidate')}</p>
          ) : null}
        </section>

        <aside className="space-y-4">
          <section className="rounded-lg border border-border bg-surface/20 p-4">
            <h2 className="text-sm font-medium text-fg">{t('conditions')}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t('conditionsIntro')}</p>
            <ul className="mt-3 space-y-2">
              {task.conditions.map((condition) => (
                <li
                  key={condition.key}
                  className="flex items-start justify-between gap-3 rounded-md border border-border/70 px-3 py-2 text-xs"
                >
                  <span className="text-muted">{conditionName(condition.key)}</span>
                  <strong className="shrink-0 font-medium tabular-nums text-fg">
                    {condition.compareMethod} {condition.value}
                  </strong>
                </li>
              ))}
            </ul>
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
              <CircleHelp className="mt-0.5 size-4 shrink-0 text-warning" />
              {t('finalCheck')}
            </p>
          </section>

          <section className="rounded-lg border border-border p-4">
            <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
              <Wrench className="mt-0.5 size-4 shrink-0 text-accent" />
              {task.structuralComplete ? t('structuralComplete') : t('structuralPartial')}
            </p>
          </section>

          <section className="rounded-lg border border-accent/30 bg-accent/5 p-4">
            <h2 className="text-sm font-medium text-accent">{t('guideNoteTitle')}</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t('guideNote')}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}
