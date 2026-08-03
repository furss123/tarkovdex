import { notFound, permanentRedirect } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { ChevronRight, ClipboardList, ExternalLink, LockKeyhole, Trophy } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { getTasks } from '@/lib/tarkov';
import { buildDetailPageMetadata } from '@/lib/metadata';
import { SITE_URL } from '@/lib/site';
import { serializeJsonLd } from '@/lib/json-ld';
import { taskSlugFor, requirementSlugFor, parseTaskIdFromSlug } from '@/lib/task-slug';
import { buildTaskEntry, unionTaskEntries, type TaskDiffField, type TaskEntry } from '@/lib/task-availability';
import { Link } from '@/i18n/navigation';
import { RELATED_LINK_CLASS } from '@/components/tools/relatedLinkClass';
import type { Task } from '@/types/tarkov';

type Props = { params: Promise<{ locale: string; slug: string }> };

// Structural quest data, same 6h cadence as the tasks list — see Phase 1.5
// caching audit for why `revalidate` alone isn't enough for pages whose data
// also touches the large `maps` endpoint (via getTasks' map-name resolution).
export const revalidate = 21600;
export const dynamic = 'force-static';

export async function generateStaticParams({ params }: { params: { locale: string } }) {
  const locale = params.locale as Locale;
  const [regularTasks, pveTasks] = await Promise.all([
    getTasks({ locale, gameMode: 'regular' }),
    getTasks({ locale, gameMode: 'pve' }),
  ]);
  return unionTaskEntries(regularTasks, pveTasks).map((entry) => ({
    slug: taskSlugFor(entry.task),
  }));
}

/** Routing is always by the trailing ObjectId (see lib/task-slug.ts) — the
 * name part of the slug is cosmetic, so a stale name still resolves to the
 * same task and gets redirected to its current canonical slug below. Fetches
 * both modes so a PvE-only task (23 of the 524 unique ids) still resolves —
 * see lib/task-availability.ts for the shared regular/PvE union logic. */
async function resolveTask(
  locale: Locale,
  slug: string,
): Promise<{ entry: TaskEntry; canonicalSlug: string } | null> {
  const id = parseTaskIdFromSlug(slug);
  if (!id) return null;
  const [regularTasks, pveTasks] = await Promise.all([
    getTasks({ locale, gameMode: 'regular' }),
    getTasks({ locale, gameMode: 'pve' }),
  ]);
  const regular = regularTasks.find((candidate) => candidate.id === id) ?? null;
  const pve = pveTasks.find((candidate) => candidate.id === id) ?? null;
  const entry = buildTaskEntry(regular, pve);
  if (!entry) return null;
  return { entry, canonicalSlug: taskSlugFor(entry.task) };
}

export async function generateMetadata({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  const resolved = await resolveTask(locale, slug);
  if (!resolved) return {};
  const { entry, canonicalSlug } = resolved;
  const { task } = entry;

  const t = await getTranslations({ locale, namespace: 'tasks' });
  const fullTitle = t('detailTitle', { name: task.name });
  const title = fullTitle.length > 65 ? t('detailTitleShort', { name: task.name }) : fullTitle;
  let description = t('detailDescription', {
    name: task.name,
    trader: task.trader?.name ?? '',
  });
  if (task.minPlayerLevel) {
    description += t('detailDescLevel', { level: task.minPlayerLevel });
  }
  if (entry.availability === 'regular-only') {
    description += t('detailDescPvpOnly');
  } else if (entry.availability === 'pve-only') {
    description += t('detailDescPveOnly');
  }

  return buildDetailPageMetadata({
    locale,
    path: `/progression/tasks/${canonicalSlug}`,
    title,
    description,
  });
}

function modeFieldLabel(field: TaskDiffField, t: (key: string) => string): string {
  switch (field) {
    case 'level':
      return t('levelLabel');
    case 'trader':
      return t('filterTrader');
    case 'map':
      return t('filterMap');
    case 'experience':
      return t('experience');
    case 'prerequisites':
      return t('requirements');
    case 'objectives':
      return t('objectives');
  }
}

function modeFieldValue(
  field: TaskDiffField,
  task: Task,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  switch (field) {
    case 'level':
      return task.minPlayerLevel ? String(task.minPlayerLevel) : '—';
    case 'trader':
      return task.trader?.name ?? '—';
    case 'map':
      return task.map?.name ?? t('anyMap');
    case 'experience':
      return task.experience != null
        ? t('experienceValue', { value: task.experience.toLocaleString() })
        : '—';
    case 'prerequisites':
      return task.requirements.length
        ? task.requirements.map((requirement) => requirement.taskName).join(', ')
        : '—';
    case 'objectives':
      return String(task.objectives.length);
  }
}

export default async function TaskDetailPage({ params }: Props) {
  const { locale: rawLocale, slug } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);

  const resolved = await resolveTask(locale, slug);
  if (!resolved) notFound();
  const { entry, canonicalSlug } = resolved;
  const { task } = entry;
  if (slug !== canonicalSlug) {
    permanentRedirect(`/${locale}/progression/tasks/${canonicalSlug}`);
  }

  const t = await getTranslations({ locale, namespace: 'tasks' });
  const common = await getTranslations({ locale, namespace: 'common' });
  const nav = await getTranslations({ locale, namespace: 'nav' });

  const breadcrumb = [
    { name: nav('brand'), path: '' },
    { name: nav('tasks'), path: '/progression/tasks' },
    { name: task.name, path: `/progression/tasks/${canonicalSlug}` },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: task.name,
        url: `${SITE_URL}/${locale}/progression/tasks/${canonicalSlug}`,
        inLanguage: locale,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumb.map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.name,
          item: `${SITE_URL}/${locale}${item.path}`,
        })),
      },
    ],
  };

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />

      <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        <Link href="/" className="underline-offset-4 hover:text-fg hover:underline">
          {nav('brand')}
        </Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <Link href="/progression/tasks" className="underline-offset-4 hover:text-fg hover:underline">
          {nav('tasks')}
        </Link>
        <ChevronRight className="size-3" aria-hidden="true" />
        <span aria-current="page" className="text-fg">
          {task.name}
        </span>
      </nav>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-[24px] font-medium leading-8 text-fg sm:text-[28px]">
          {task.name}
          {task.nameEn ? (
            <span className="ml-2 text-[16px] font-normal text-muted">({task.nameEn})</span>
          ) : null}
        </h1>
        {entry.availability === 'regular-only' ? (
          <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[12px] font-medium leading-none text-accent">
            {t('pvpOnlyBadge')}
          </span>
        ) : null}
        {entry.availability === 'pve-only' ? (
          <span className="rounded border border-accent/40 bg-accent/10 px-2 py-1 text-[12px] font-medium leading-none text-accent">
            {t('pveOnlyBadge')}
          </span>
        ) : null}
      </div>

      <Link href="/progression/tasks" className={RELATED_LINK_CLASS}>
        {t('allQuestsLink')}
      </Link>

      {task.wikiLink ? (
        <a
          href={task.wikiLink}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-3 inline-flex min-h-touch items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-fg hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          {t('viewWiki')}
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-4 rounded-lg border border-border bg-surface/30 p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">{t('filterTrader')}</dt>
          <dd className="mt-1 text-fg">{task.trader?.name ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('filterMap')}</dt>
          <dd className="mt-1 text-fg">{task.map?.name ?? t('anyMap')}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('experience')}</dt>
          <dd className="mt-1 tabular-nums text-fg">
            {task.experience === null ? '—' : t('experienceValue', { value: task.experience.toLocaleString() })}
          </dd>
        </div>
      </dl>

      {task.minPlayerLevel || task.kappaRequired ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {task.minPlayerLevel ? <span>{t('requiredLevel', { level: task.minPlayerLevel })}</span> : null}
          {task.kappaRequired ? (
            <span className="inline-flex items-center gap-1.5 text-accent">
              <Trophy className="size-3.5" aria-hidden="true" />
              {t('kappaRequired')}
            </span>
          ) : null}
        </p>
      ) : null}

      {entry.availability === 'both-different' && entry.regular && entry.pve ? (
        <section className="mt-6 rounded-lg border border-border/70 bg-surface/20 p-4">
          <h2 className="text-sm font-medium text-fg">{t('modeDifferencesTitle')}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            {entry.modeDiffFields.map((field) => (
              <div key={field} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <dt className="text-muted">{modeFieldLabel(field, t)}</dt>
                <dd className="text-fg">
                  {common('pvpShort')}: {modeFieldValue(field, entry.regular as Task, t)}
                  <span className="mx-1.5 text-muted">·</span>
                  {common('pveShort')}: {modeFieldValue(field, entry.pve as Task, t)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
          <ClipboardList className="size-4 text-accent" aria-hidden="true" />
          {t('guideSteps')}
        </h2>
        <ol className="mt-3 space-y-2">
          {task.objectives.map((objective, index) => (
            <li
              key={objective.id}
              className="flex gap-3 rounded-md border border-border/70 bg-surface/30 p-3 text-sm"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-medium text-accent">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="leading-relaxed text-fg">{objective.description}</p>
                {objective.optional ? (
                  <span className="mt-1 inline-block rounded-full border border-border px-2 py-0.5 text-[12px] leading-4 text-muted">
                    {t('optional')}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {task.requirements.length > 0 ? (
        <section className="mt-8">
          <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
            <LockKeyhole className="size-4 text-accent" aria-hidden="true" />
            {t('requirements')}
          </h2>
          <ul className="mt-3 space-y-1">
            {task.requirements.map((requirement) => (
              <li key={requirement.taskId}>
                <Link
                  href={`/progression/tasks/${requirementSlugFor(requirement)}`}
                  className="text-fg underline-offset-4 hover:text-accent hover:underline"
                >
                  · {requirement.taskName}
                  {requirement.taskNameEn ? (
                    <span className="ml-1 text-muted">({requirement.taskNameEn})</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
