'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  LockKeyhole,
  MapPin,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Task } from '@/types/tarkov';

export function TaskCard({ task, sequence }: { task: Task; sequence: number }) {
  const t = useTranslations('tasks');
  const [expanded, setExpanded] = useState(false);

  return (
    <article
      data-task-id={task.id}
      className="border-b border-border/60 bg-bg/30 last:border-0"
    >
      <div className="flex items-start gap-3 px-4 py-4 hover:bg-surface-2/50">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-xs font-medium tabular-nums text-muted">
          {sequence}
        </span>
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface">
          {task.trader?.imageLink ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={task.trader.imageLink}
              alt=""
              width={44}
              height={44}
              loading="lazy"
              className="size-full object-contain"
            />
          ) : null}
        </span>

        <div className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`guide-${task.id}`}
            onClick={() => setExpanded((current) => !current)}
            className="group flex min-h-touch w-full items-start justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-fg underline-offset-4 group-hover:text-accent group-hover:underline">
                {task.name}
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                {task.trader ? <span>{task.trader.name}</span> : null}
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3" aria-hidden="true" />
                  {task.map ? task.map.name : t('anyMap')}
                </span>
                {task.minPlayerLevel ? (
                  <span>{t('minLevel', { level: task.minPlayerLevel })}</span>
                ) : null}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
              {expanded ? t('closeGuide') : t('openGuide')}
              <ChevronDown
                className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </span>
          </button>
        </div>
      </div>

      {expanded ? (
        <div
          id={`guide-${task.id}`}
          className="border-t border-border/60 bg-surface/20 px-4 py-5 sm:px-6"
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
            <div className="space-y-5">
              <section>
                <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
                  <ClipboardList className="size-4 text-accent" aria-hidden="true" />
                  {t('guideSteps')}
                </h3>
                <ol className="mt-3 space-y-2">
                  {task.objectives.map((objective, index) => (
                    <li
                      key={objective.id}
                      className="flex gap-3 rounded-md border border-border/70 bg-bg/60 p-3 text-sm"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="leading-relaxed text-fg">{objective.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {objective.optional ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[12px] leading-4 text-muted">
                              {t('optional')}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="flex items-center gap-2 text-sm font-medium text-fg">
                  <LockKeyhole className="size-4 text-accent" aria-hidden="true" />
                  {t('requirements')}
                </h3>
                <div className="mt-3 rounded-md border border-border/70 bg-bg/60 p-3 text-sm text-muted">
                  {task.minPlayerLevel ? (
                    <p>{t('requiredLevel', { level: task.minPlayerLevel })}</p>
                  ) : null}
                  {task.requirements.length ? (
                    <ul className="mt-2 space-y-1">
                      {task.requirements.map((requirement) => (
                        <li key={requirement.taskId} className="text-fg">
                          · {requirement.taskName}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('noPrerequisite')}</p>
                  )}
                </div>
              </section>

              <aside className="rounded-md border border-accent/25 bg-accent/5 p-3">
                <h3 className="flex items-center gap-2 text-sm font-medium text-accent">
                  <Sparkles className="size-4" aria-hidden="true" />
                  {t('guideTipTitle')}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {t('guideTip', {
                    map: task.map?.name ?? t('anyMap'),
                  })}
                </p>
              </aside>
            </div>

            <aside className="space-y-3">
              {task.taskImageLink ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={task.taskImageLink}
                  alt=""
                  width={240}
                  height={135}
                  loading="lazy"
                  className="w-full rounded-lg border border-border bg-bg object-cover"
                />
              ) : null}
              <div className="rounded-lg border border-border bg-bg/60 p-4">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
                  {t('questInfo')}
                </h3>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t('filterTrader')}</dt>
                    <dd className="text-right text-fg">{task.trader?.name ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t('filterMap')}</dt>
                    <dd className="text-right text-fg">
                      {task.map?.name ?? t('anyMap')}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted">{t('experience')}</dt>
                    <dd className="text-right tabular-nums text-fg">
                      {task.experience === null
                        ? '—'
                        : t('experienceValue', {
                            value: task.experience.toLocaleString(),
                          })}
                    </dd>
                  </div>
                </dl>
                {task.kappaRequired ? (
                  <p className="mt-3 flex items-center gap-1.5 border-t border-border pt-3 text-xs text-accent">
                    <Trophy className="size-3.5" aria-hidden="true" />
                    {t('kappaRequired')}
                  </p>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </article>
  );
}
