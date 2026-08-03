'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  BEGINNER_QUESTION_SUPPORT,
  filterActiveQuestRequiredItems,
  filterAmmoForArmorClass,
  filterGearWithinBudget,
  filterHighValuePerSlotItems,
  filterLightAffordableArmor,
  type BeginnerQuestionId,
  type BeginnerReason,
} from '@/lib/beginner-queries';
import { aggregateRequiredItems } from '@/lib/quest-requirements';
import { getQuestProgress, useLocalState } from '@/lib/local-state';
import type { CombatDataset } from '@/types/tools';
import type { MarketItem, Task } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { formatRoubles } from '@/lib/format';
import { EmptyState, ErrorState, PartialDataNotice } from '@/components/status/StatusUI';
import { AddToBudgetButton } from '@/components/combat/AddToBudgetButton';

const QUESTIONS: BeginnerQuestionId[] = [
  'ammo-for-armor-class',
  'gear-within-budget',
  'high-value-per-slot',
  'light-affordable-armor',
  'quest-keep-items',
  'level-15-gear',
];

type Props = {
  regularCombat: CombatDataset | null;
  pveCombat: CombatDataset | null;
  regularTasks: Task[];
  pveTasks: Task[];
};

export function BeginnerFlow({
  regularCombat,
  pveCombat,
  regularTasks,
  pveTasks,
}: Props) {
  const t = useTranslations('beginner');
  const locale = useLocale() as Locale;
  const { gameMode } = useGameMode();
  const state = useLocalState();
  const [question, setQuestion] = useState<BeginnerQuestionId | null>(null);

  const combat = gameMode === 'pve' ? pveCombat : regularCombat;
  const tasks = gameMode === 'pve' ? pveTasks : regularTasks;
  const progress = getQuestProgress(gameMode);
  void state.schemaVersion;

  if (!question) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">{t('pickQuestion')}</p>
        <ul className="space-y-2">
          {QUESTIONS.map((id) => {
            const support = BEGINNER_QUESTION_SUPPORT[id];
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setQuestion(id)}
                  className="flex min-h-touch w-full flex-col items-start rounded-lg border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <span className="text-sm font-medium text-fg">
                    {t(`questions.${id}.label`)}
                  </span>
                  <span className="mt-1 text-xs text-muted">{t(`questions.${id}.hint`)}</span>
                  {support.support !== 'supported' ? (
                    <span className="mt-2 text-xs text-accent">
                      {t(support.reasonKey as 'support.level15')}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const support = BEGINNER_QUESTION_SUPPORT[question];

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setQuestion(null)}
        className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-sm text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        {t('back')}
      </button>
      <header>
        <h2 className="text-lg font-medium text-fg">{t(`questions.${question}.label`)}</h2>
        <p className="mt-1 text-sm text-muted">{t(`questions.${question}.hint`)}</p>
      </header>

      {support.support === 'unsupported' ? (
        <EmptyState title={t('unsupportedTitle')} hint={t('support.level15')} />
      ) : (
        <QuestionPanel
          question={question}
          combat={combat}
          tasks={tasks}
          ownedCounts={progress.ownedItemCounts}
          activeQuestIds={progress.activeQuestIds}
          locale={locale}
          partial={support.support === 'partially-supported'}
        />
      )}
    </div>
  );
}

function QuestionPanel({
  question,
  combat,
  tasks,
  ownedCounts,
  activeQuestIds,
  locale,
  partial,
}: {
  question: BeginnerQuestionId;
  combat: CombatDataset | null;
  tasks: Task[];
  ownedCounts: Record<string, number>;
  activeQuestIds: string[];
  locale: Locale;
  partial: boolean;
}) {
  const t = useTranslations('beginner');

  if (question === 'ammo-for-armor-class') {
    return (
      <AmmoQuestion combat={combat} locale={locale} partial={partial} />
    );
  }
  if (question === 'gear-within-budget' || question === 'high-value-per-slot') {
    return <MarketQuestion question={question} locale={locale} partial={partial} />;
  }
  if (question === 'light-affordable-armor') {
    return <ArmorQuestion combat={combat} locale={locale} partial={partial} />;
  }
  if (question === 'quest-keep-items') {
    const active = tasks.filter((task) => activeQuestIds.includes(task.id));
    if (active.length === 0) {
      return (
        <EmptyState
          title={t('noActiveQuests')}
          action={
            <Link
              href="/progression/tasks/tracker"
              className="inline-flex min-h-touch items-center rounded-md border border-border px-3 text-sm text-fg hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('goToTracker')}
            </Link>
          }
        />
      );
    }
    const { lines } = aggregateRequiredItems(active, false);
    const results = filterActiveQuestRequiredItems({
      requirements: lines,
      ownedCounts,
    });
    return (
      <ResultList
        title={t('results')}
        empty={t('empty')}
        rows={results.map((row) => ({
          id: row.id,
          title: row.requirement.itemId,
          reasons: row.reasons,
        }))}
        locale={locale}
        partial={partial}
      />
    );
  }
  return null;
}

function AmmoQuestion({
  combat,
  locale,
  partial,
}: {
  combat: CombatDataset | null;
  locale: Locale;
  partial: boolean;
}) {
  const t = useTranslations('beginner');
  const [armorClass, setArmorClass] = useState(4);
  const [maxPrice, setMaxPrice] = useState('');

  if (!combat) return <ErrorState title={t('error')} />;

  const results = filterAmmoForArmorClass({
    ammo: combat.ammo,
    armorClass,
    maxPrice: maxPrice ? Number(maxPrice) : null,
  });

  return (
    <div className="space-y-4">
      {partial ? <PartialDataNotice message={t('partialNote')} /> : null}
      <div className="flex flex-wrap gap-3">
        <label className="flex min-h-touch flex-col gap-1 text-sm text-muted">
          {t('form.armorClass')}
          <select
            value={armorClass}
            onChange={(e) => setArmorClass(Number(e.target.value))}
            className="min-h-touch rounded-md border border-border bg-bg px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-touch flex-col gap-1 text-sm text-muted">
          {t('form.maxBudget')}
          <input
            type="number"
            min={0}
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="min-h-touch rounded-md border border-border bg-bg px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
        </label>
      </div>
      <ResultList
        title={t('results')}
        empty={t('empty')}
        rows={results.map((row) => ({
          id: row.id,
          title: row.ammo.name,
          reasons: row.reasons,
        }))}
        locale={locale}
        expertHref="/combat/ammo"
        partial={partial}
      />
    </div>
  );
}

function ArmorQuestion({
  combat,
  locale,
  partial,
}: {
  combat: CombatDataset | null;
  locale: Locale;
  partial: boolean;
}) {
  const t = useTranslations('beginner');
  const [maxPrice, setMaxPrice] = useState('80000');
  const [maxWeight, setMaxWeight] = useState('8');
  const [minClass, setMinClass] = useState(3);
  const [marketError, setMarketError] = useState(false);
  const [prices, setPrices] = useState<Map<string, number | null>>(new Map());

  useEffect(() => {
    if (!combat) return;
    let cancelled = false;
    void (async () => {
      try {
        const params = new URLSearchParams({
          category: 'armor',
          sort: 'referenceValue',
          direction: 'asc',
          page: '1',
          locale,
          mode: combat.gameMode,
        });
        const res = await fetch(`/api/items?${params.toString()}`);
        if (!res.ok) throw new Error('fail');
        const json = (await res.json()) as { items: MarketItem[] };
        if (cancelled) return;
        const map = new Map<string, number | null>();
        for (const item of json.items) map.set(item.id, item.referenceValue);
        setPrices(map);
      } catch {
        if (!cancelled) setMarketError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [combat, locale]);

  if (!combat) return <ErrorState title={t('error')} />;
  if (marketError) return <ErrorState title={t('error')} />;

  const results = filterLightAffordableArmor({
    armor: combat.armor,
    pricesById: prices,
    maxPrice: maxPrice ? Number(maxPrice) : null,
    maxWeight: maxWeight ? Number(maxWeight) : null,
    minClass,
  });

  return (
    <div className="space-y-4">
      <PartialDataNotice message={t('partialNote')} />
      <div className="flex flex-wrap gap-3">
        <NumberField label={t('form.maxBudget')} value={maxPrice} onChange={setMaxPrice} />
        <NumberField label={t('form.maxWeight')} value={maxWeight} onChange={setMaxWeight} />
        <label className="flex min-h-touch flex-col gap-1 text-sm text-muted">
          {t('form.minClass')}
          <select
            value={minClass}
            onChange={(e) => setMinClass(Number(e.target.value))}
            className="min-h-touch rounded-md border border-border bg-bg px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ResultList
        title={t('results')}
        empty={t('empty')}
        rows={results.map((row) => ({
          id: row.id,
          title: row.armor.name,
          reasons: row.reasons,
        }))}
        locale={locale}
        expertHref="/combat/armor"
        partial={partial}
      />
    </div>
  );
}

function MarketQuestion({
  question,
  locale,
  partial,
}: {
  question: 'gear-within-budget' | 'high-value-per-slot';
  locale: Locale;
  partial: boolean;
}) {
  const t = useTranslations('beginner');
  const { gameMode } = useGameMode();
  const [maxBudget, setMaxBudget] = useState('100000');
  const [minVps, setMinVps] = useState('5000');
  const [items, setItems] = useState<MarketItem[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(false);
      try {
        const collected: MarketItem[] = [];
        for (let page = 1; page <= 4; page += 1) {
          const params = new URLSearchParams({
            sort: question === 'high-value-per-slot' ? 'valuePerSlot' : 'referenceValue',
            direction: question === 'high-value-per-slot' ? 'desc' : 'asc',
            category: question === 'gear-within-budget' ? 'armor' : 'all',
            page: String(page),
            locale,
            mode: gameMode,
          });
          const res = await fetch(`/api/items?${params.toString()}`);
          if (!res.ok) throw new Error('fail');
          const json = (await res.json()) as { items: MarketItem[]; hasMore: boolean };
          collected.push(...json.items);
          if (!json.hasMore) break;
        }
        if (!cancelled) setItems(collected);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [question, locale, gameMode]);

  if (error) return <ErrorState title={t('error')} />;
  if (loading) return <p className="text-sm text-muted">{t('loading')}</p>;

  const results =
    question === 'gear-within-budget'
      ? filterGearWithinBudget({
          items,
          maxBudget: Number(maxBudget) || 0,
        }).map((row) => ({
          id: row.id,
          title: row.item.name,
          reasons: row.reasons,
          price: row.item.referenceValue,
        }))
      : filterHighValuePerSlotItems({
          items,
          minValuePerSlot: Number(minVps) || 0,
        }).map((row) => ({
          id: row.id,
          title: row.item.name,
          reasons: row.reasons,
          price: row.item.referenceValue,
        }));

  return (
    <div className="space-y-4">
      {partial ? <PartialDataNotice message={t('partialNote')} /> : null}
      {question === 'gear-within-budget' ? (
        <NumberField label={t('form.maxBudget')} value={maxBudget} onChange={setMaxBudget} />
      ) : (
        <NumberField
          label={t('form.minValuePerSlot')}
          value={minVps}
          onChange={setMinVps}
        />
      )}
      <ResultList
        title={t('results')}
        empty={t('empty')}
        rows={results}
        locale={locale}
        expertHref="/economy/items"
        partial={partial}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-h-touch flex-col gap-1 text-sm text-muted">
      {label}
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-touch rounded-md border border-border bg-bg px-3 text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
    </label>
  );
}

function ResultList({
  title,
  empty,
  rows,
  locale,
  expertHref,
  partial,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; title: string; reasons: BeginnerReason[]; price?: number | null }>;
  locale: Locale;
  expertHref?: string;
  partial: boolean;
}) {
  const t = useTranslations('beginner');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-fg">{title}</h3>
        {expertHref ? (
          <Link
            href={expertHref}
            className="inline-flex min-h-touch items-center text-sm text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {t('expertLink')}
          </Link>
        ) : null}
      </div>
      {partial ? <p className="text-xs text-muted">{t('criteria')}</p> : null}
      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-lg border border-border bg-surface px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-fg">{row.title}</p>
                <div className="flex shrink-0 items-center gap-2">
                  {row.price != null ? (
                    <p className="text-sm tabular-nums text-muted">
                      {formatRoubles(row.price, locale)}
                    </p>
                  ) : null}
                  <AddToBudgetButton itemId={row.id} />
                </div>
              </div>
              <ul className="mt-2 space-y-1">
                {row.reasons.map((reason) => (
                  <li key={reason.id} className="text-xs text-muted">
                    {formatReason(t, reason)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatReason(
  t: ReturnType<typeof useTranslations<'beginner'>>,
  reason: BeginnerReason,
): string {
  const values: Record<string, string | number> = {};
  if (reason.values) {
    for (const [key, value] of Object.entries(reason.values)) {
      if (typeof value === 'string' || typeof value === 'number') values[key] = value;
      else if (typeof value === 'boolean') values[key] = value ? 'true' : 'false';
    }
  }
  try {
    return t(`reasons.${reason.id}` as 'reasons.penMeetsClass', values);
  } catch {
    return reason.id;
  }
}
