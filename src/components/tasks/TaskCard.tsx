'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ClipboardList,
  ExternalLink,
  LockKeyhole,
  MapPin,
  Trophy,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Task } from '@/types/tarkov';
import { Link } from '@/i18n/navigation';
import { taskSlugFor } from '@/lib/task-slug';
import { QuestStatusToggle } from '@/components/progression/QuestStatusToggle';

export function TaskCard({
  task,
  sequence,
  focused = false,
  onOpenTask,
}: {
  task: Task;
  sequence: number;
  /** Set when this card is the target of a prerequisite click — opens its
   * guide and scrolls it into view. */
  focused?: boolean;
  onOpenTask?: (taskId: string, taskName: string) => void;
}) {
  const t = useTranslations('tasks');
  const [expanded, setExpanded] = useState(focused);
  const article = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focused) return;
    setExpanded(true);
    article.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focused]);

  return (
    <article
      ref={article}
      data-task-id={task.id}
      className="scroll-mt-4 border-b border-border/60 bg-bg/30 last:border-0"
    >
      <div className="flex items-start gap-3 px-4 py-4">
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
          <h2>
            <Link
              href={`/progression/tasks/${taskSlugFor(task)}`}
              className="flex min-h-touch min-w-0 items-center rounded text-sm font-medium text-fg underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {task.name}
              {task.nameEn ? (
                <span className="ml-1 font-normal text-muted">({task.nameEn})</span>
              ) : null}
            </Link>
          </h2>
          {task.wikiLink ? (
            <a
              href={task.wikiLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex min-h-touch items-center gap-1.5 text-xs text-muted underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('viewWiki')}
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          ) : null}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`guide-${task.id}`}
            onClick={() => setExpanded((current) => !current)}
            className="mt-1 flex min-h-touch w-full items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {task.trader ? <span>{task.trader.name}</span> : null}
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" aria-hidden="true" />
                {task.map ? task.map.name : t('anyMap')}
              </span>
              {task.minPlayerLevel ? (
                <span>{t('minLevel', { level: task.minPlayerLevel })}</span>
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted">
              {expanded ? t('closeGuide') : t('openGuide')}
              <ChevronDown
                className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </span>
          </button>
          <div className="mt-2">
            <QuestStatusToggle questId={task.id} />
          </div>
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
                      <span
                        aria-hidden="true"
                        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent"
                      >
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="leading-relaxed text-fg">{objective.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {objective.optional ? (
                            <span className="rounded-full border border-border px-2 py-0.5 text-[14px] leading-5 text-muted">
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
                        <li key={requirement.taskId}>
                          <button
                            type="button"
                            onClick={() =>
                              onOpenTask?.(requirement.taskId, requirement.taskName)
                            }
                            className="inline-flex min-h-touch items-center text-left text-fg underline-offset-4 hover:text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                          >
                            · {requirement.taskName}
                            {requirement.taskNameEn ? (
                              <span className="ml-1 text-muted">
                                ({requirement.taskNameEn})
                              </span>
                            ) : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t('noPrerequisite')}</p>
                  )}
                </div>
              </section>

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
