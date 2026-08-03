'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, ExternalLink, Link2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import { formatDate, formatKst } from '@/lib/format';
import type { PatchNotePageModel } from '@/lib/newsroom/patch-note-page';
import type { PatchCategoryKey, PatchChangeType, PatchImportance, PatchNoteItem } from '@/types/patch-notes';

const CHANGE_TYPES: Array<PatchChangeType | 'all'> = ['all', 'new', 'changed', 'removed', 'fixed', 'other'];
const IMPORTANCE: Array<PatchImportance | 'all'> = ['all', 'critical', 'high', 'medium', 'low'];
const MODES = ['all', 'pvp', 'pve', 'seasonal', 'arena'] as const;

function EntryCard({
  item,
  expanded,
  onToggle,
}: {
  item: PatchNoteItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations('patchNotes');
  const anchor = item.id.replace(/[^a-zA-Z0-9_-]/g, '-');
  const copyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${anchor}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard can be unavailable in locked-down contexts.
    }
  };
  return (
    <article id={anchor} className="scroll-mt-24 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-medium text-fg">{item.title}</h3>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {item.statuses.map((status) => (
              <span key={status} className="rounded border border-accent/40 px-2 py-1 text-accent">
                {t(`status.${status}`)}
              </span>
            ))}
            <span className="rounded border border-border px-2 py-1 text-muted">{t(`category.${item.category}`)}</span>
            <span className="rounded border border-border px-2 py-1 text-muted">{t(`changeType.${item.changeType}`)}</span>
            <span className="rounded border border-border px-2 py-1 text-muted">{t(`importance.${item.importance}`)}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex size-touch items-center justify-center rounded border border-border text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-label={t('copyLink')}
          >
            <Copy className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex min-h-touch items-center gap-1 rounded border border-border px-3 text-xs text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            aria-expanded={expanded}
          >
            {expanded ? t('collapse') : t('expand')}
            {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          </button>
        </div>
      </div>

      <section className="mt-4 rounded-lg border border-border bg-bg/40 p-3" aria-labelledby={`${anchor}-official`}>
        <h4 id={`${anchor}-official`} className="text-xs font-medium text-fg">
          {t('officialChange')}
        </h4>
        <p className="mt-2 whitespace-pre-line text-sm text-muted">{item.officialContent}</p>
      </section>

      {(item.beforeValue || item.afterValue) && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
          <div className="rounded border border-border px-3 py-2">
            <dt className="text-xs text-muted">{t('before')}</dt>
            <dd className="mt-1 font-medium tabular-nums text-fg">{item.beforeValue ?? '—'}</dd>
          </div>
          <div className="hidden text-center text-muted sm:block" aria-hidden="true">
            ↓
          </div>
          <div className="rounded border border-border px-3 py-2">
            <dt className="text-xs text-muted">{t('after')}</dt>
            <dd className="mt-1 font-medium tabular-nums text-fg">{item.afterValue ?? '—'}</dd>
          </div>
        </dl>
      )}

      {expanded && (
        <div className="mt-3 space-y-3">
          {item.affectedModes && item.affectedModes.length > 0 ? (
            <p className="text-xs text-muted">
              <span className="text-fg">{t('affectedModes')} </span>
              {item.affectedModes.map((mode) => t(`mode.${mode}`)).join(' · ')}
            </p>
          ) : null}
          {item.detailedExplanation ? (
            <section className="rounded-lg border border-border p-3" aria-label={t('explanation')}>
              <h4 className="text-xs font-medium text-fg">{t('explanation')}</h4>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{item.detailedExplanation}</p>
            </section>
          ) : null}
          {item.playerImpact ? (
            <section className="rounded-lg border border-dashed border-border p-3" aria-label={t('impact')}>
              <h4 className="text-xs font-medium text-fg">{t('impact')}</h4>
              <p className="mt-2 whitespace-pre-line text-sm text-muted">{item.playerImpact}</p>
            </section>
          ) : null}
        </div>
      )}
    </article>
  );
}

export function PatchNoteExplorer({ model, locale }: { model: PatchNotePageModel; locale: Locale }) {
  const t = useTranslations('patchNotes');
  const { structured, entry, explanation, playerImpact, officialSources, validation } = model;
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PatchCategoryKey | 'all'>('all');
  const [changeType, setChangeType] = useState<(typeof CHANGE_TYPES)[number]>('all');
  const [importance, setImportance] = useState<(typeof IMPORTANCE)[number]>('all');
  const [mode, setMode] = useState<(typeof MODES)[number]>('all');
  const [importantOnly, setImportantOnly] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tocOpen, setTocOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return structured.items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (changeType !== 'all' && item.changeType !== changeType) return false;
      if (importance !== 'all' && item.importance !== importance) return false;
      if (mode !== 'all' && !(item.affectedModes ?? []).includes(mode)) return false;
      if (importantOnly && !['critical', 'high'].includes(item.importance)) return false;
      if (!q) return true;
      return `${item.title}\n${item.officialContent}`.toLowerCase().includes(q);
    });
  }, [structured.items, query, category, changeType, importance, mode, importantOnly]);

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    for (const item of filtered) next[item.id] = true;
    setExpanded(next);
  };
  const collapseAll = () => setExpanded({});

  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <button
          type="button"
          className="flex min-h-touch w-full items-center justify-between rounded-lg border border-border px-3 text-sm text-fg lg:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          onClick={() => setTocOpen((value) => !value)}
          aria-expanded={tocOpen}
        >
          {t('toc')}
          {tocOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        <nav
          aria-label={t('toc')}
          className={`${tocOpen ? 'mt-3 block' : 'hidden'} space-y-1 lg:mt-0 lg:block`}
        >
          {structured.categories.map((row) => (
            <a
              key={row.key}
              href={`#cat-${row.key}`}
              className="flex min-h-touch items-center justify-between rounded px-2 text-xs text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <span>{t(`category.${row.key}`)}</span>
              <span className="tabular-nums">{row.count}</span>
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-8">
        <header className="space-y-3 border-b border-border pb-6">
          <p className="text-xs text-muted">{structured.version ? `Patch ${structured.version}` : t('untitledVersion')}</p>
          <h1 className="break-words text-2xl font-medium text-fg sm:text-3xl">{structured.title}</h1>
          <dl className="grid gap-2 text-xs text-muted sm:grid-cols-2">
            <div>
              <dt className="inline text-fg">{t('published')} </dt>
              <dd className="inline">{formatKst(entry.publishedAt, locale)}</dd>
            </div>
            <div>
              <dt className="inline text-fg">{t('verified')} </dt>
              <dd className="inline">{formatDate(entry.lastCheckedAt, locale)}</dd>
            </div>
          </dl>
          <ul className="flex flex-wrap gap-2 text-xs">
            {officialSources.map((source) => (
              <li key={source.url}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-touch items-center gap-1.5 rounded border border-border px-2 text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <ExternalLink className="size-3.5" aria-hidden="true" />
                  {source.title ?? source.type}
                </a>
              </li>
            ))}
          </ul>
        </header>

        <section aria-labelledby="patch-summary">
          <h2 id="patch-summary" className="text-sm font-medium text-fg">
            {t('summary')}
          </h2>
          <p className="mt-2 text-xs text-muted">{t('summaryNotice')}</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
            {structured.summary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        {(explanation || playerImpact) && (
          <section className="grid gap-3 sm:grid-cols-2">
            {explanation ? (
              <div className="rounded-lg border border-border p-4">
                <h2 className="text-xs font-medium text-fg">{t('explanation')}</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-muted">{explanation}</p>
              </div>
            ) : null}
            {playerImpact ? (
              <div className="rounded-lg border border-dashed border-border p-4">
                <h2 className="text-xs font-medium text-fg">{t('impact')}</h2>
                <p className="mt-2 whitespace-pre-line text-sm text-muted">{playerImpact}</p>
              </div>
            ) : null}
          </section>
        )}

        <section className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="grid gap-1 text-xs text-muted sm:col-span-2">
            <span>{t('search')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              placeholder={t('searchPlaceholder')}
            />
          </label>
          <label className="grid gap-1 text-xs text-muted">
            <span>{t('categoryFilter')}</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as PatchCategoryKey | 'all')}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg"
            >
              <option value="all">{t('all')}</option>
              {structured.categories.map((row) => (
                <option key={row.key} value={row.key}>
                  {t(`category.${row.key}`)} ({row.count})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            <span>{t('changeTypeFilter')}</span>
            <select
              value={changeType}
              onChange={(event) => setChangeType(event.target.value as (typeof CHANGE_TYPES)[number])}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg"
            >
              {CHANGE_TYPES.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? t('all') : t(`changeType.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            <span>{t('importanceFilter')}</span>
            <select
              value={importance}
              onChange={(event) => setImportance(event.target.value as (typeof IMPORTANCE)[number])}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg"
            >
              {IMPORTANCE.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? t('all') : t(`importance.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-muted">
            <span>{t('modeFilter')}</span>
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as (typeof MODES)[number])}
              className="min-h-touch rounded-lg border border-border bg-surface px-3 text-fg"
            >
              {MODES.map((value) => (
                <option key={value} value={value}>
                  {value === 'all' ? t('all') : t(`mode.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-touch items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={importantOnly}
              onChange={(event) => setImportantOnly(event.target.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t('importantOnly')}
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={expandAll}
              className="min-h-touch rounded border border-border px-3 text-xs text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('expandAll')}
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="min-h-touch rounded border border-border px-3 text-xs text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('collapseAll')}
            </button>
            <p className="flex min-h-touch items-center text-xs text-muted">
              {t('resultCount', { count: filtered.length })}
            </p>
          </div>
        </section>

        {!validation.ok ? (
          <p role="status" className="rounded-lg border border-border px-4 py-3 text-xs text-muted">
            {t('validationCaution')}
          </p>
        ) : null}

        {filtered.length === 0 ? (
          <p role="status" className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
            {t('emptyFilter')}
          </p>
        ) : (
          <div className="space-y-8">
            {structured.categories.map((row) => {
              const items = filtered.filter((item) => item.category === row.key);
              if (items.length === 0) return null;
              return (
                <section key={row.key} id={`cat-${row.key}`} className="scroll-mt-24 space-y-3">
                  <h2 className="flex items-center gap-2 text-sm font-medium text-fg">
                    <Link2 className="size-4 text-accent" aria-hidden="true" />
                    {t(`category.${row.key}`)}
                    <span className="text-xs text-muted tabular-nums">{items.length}</span>
                  </h2>
                  <div className="space-y-3">
                    {items.map((item) => (
                      <EntryCard
                        key={item.id}
                        item={item}
                        expanded={Boolean(expanded[item.id])}
                        onToggle={() =>
                          setExpanded((current) => ({ ...current, [item.id]: !current[item.id] }))
                        }
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
