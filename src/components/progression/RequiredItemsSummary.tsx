'use client';

import { Minus, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GameMode } from '@/types/tarkov';
import { getQuestProgress, setOwnedItemCount } from '@/lib/local-state';
import { withOwnedAndMissing, type RequiredItemLine } from '@/lib/quest-requirements';
import { EmptyState } from '@/components/status/StatusUI';

export interface ItemDisplayInfo {
  name: string;
  shortName: string;
  iconLink: string | null;
}

/**
 * A bounded numeric input with +/- buttons, all at the 44px touch floor,
 * `inputMode="numeric"` for the mobile keypad. The one place owned counts
 * are edited.
 *
 * `onStep` (not `onChange(value +/- 1)`) is deliberate: two clicks dispatched
 * in the same JS macrotask (confirmed live — a rapid double-click) land in
 * the same React batch, so a handler computing "current prop value + 1"
 * reads the **same** pre-click `value` twice and both clicks resolve to +1
 * instead of +2. `onStep` instead asks the caller for a fresh read of the
 * live store value at the moment each click is handled, which is correct
 * regardless of batching because it never depends on this component's own
 * possibly-stale prop.
 */
function OwnedCountInput({
  value,
  onStep,
  onChange,
}: {
  value: number;
  onStep: (delta: 1 | -1) => void;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onStep(-1)}
        aria-label="-1"
        className="flex size-touch shrink-0 items-center justify-center rounded-md border border-border text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Minus className="size-[14px]" aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={999999}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(Number.isFinite(next) ? Math.max(0, Math.min(999_999, Math.floor(next))) : 0);
        }}
        className="h-touch w-16 rounded-md border border-border bg-bg px-2 text-center text-[14px] tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      <button
        type="button"
        onClick={() => onStep(1)}
        aria-label="+1"
        className="flex size-touch shrink-0 items-center justify-center rounded-md border border-border text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Plus className="size-[14px]" aria-hidden="true" />
      </button>
    </div>
  );
}

export function RequiredItemsSummary({
  mode,
  lines,
  skippedCount,
  ownedItemCounts,
  itemsById,
  includeOptional,
  onIncludeOptionalChange,
}: {
  mode: GameMode;
  lines: RequiredItemLine[];
  skippedCount: number;
  ownedItemCounts: Record<string, number>;
  itemsById: Map<string, ItemDisplayInfo>;
  includeOptional: boolean;
  onIncludeOptionalChange: (next: boolean) => void;
}) {
  const t = useTranslations('questTracker');
  const rows = withOwnedAndMissing(lines, ownedItemCounts).sort((a, b) => b.missing - a.missing);

  function handleOwnedChange(itemId: string, next: number) {
    setOwnedItemCount(mode, itemId, next);
  }

  // Reads the store directly rather than a React prop, specifically so two
  // +/- clicks landing in the same batch (see OwnedCountInput's own comment)
  // each see the other's result instead of both computing from one stale
  // starting value.
  function handleStep(itemId: string, delta: 1 | -1) {
    const current = getQuestProgress(mode).ownedItemCounts[itemId] ?? 0;
    setOwnedItemCount(mode, itemId, Math.max(0, current + delta));
  }

  return (
    <section aria-labelledby="required-items-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="required-items-heading" className="text-base font-medium text-fg">
            {t('requiredItemsTitle')}
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-muted">{t('requiredItemsDescription')}</p>
        </div>
        <label className="flex min-h-touch items-center gap-2 text-[14px] text-fg">
          <input
            type="checkbox"
            checked={includeOptional}
            onChange={(event) => onIncludeOptionalChange(event.target.checked)}
            className="size-4 accent-accent"
          />
          {t('includeOptional')}
        </label>
      </div>

      {rows.length === 0 ? (
        <EmptyState title={t('noRequiredItems')} hint={t('noRequiredItemsHint')} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[36rem] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-border bg-surface/40 text-left text-muted">
                <th className="px-3 py-2 font-medium">{t('itemColumn')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('requiredColumn')}</th>
                <th className="px-3 py-2 font-medium">{t('ownedColumn')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('missingColumn')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const info = itemsById.get(row.itemId);
                return (
                  <tr key={row.itemId} className="border-b border-border/60 last:border-0">
                    <td className="min-w-0 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {info?.iconLink ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={info.iconLink}
                            alt=""
                            width={32}
                            height={32}
                            loading="lazy"
                            className="size-8 shrink-0 rounded border border-border bg-bg object-contain"
                          />
                        ) : (
                          <span className="size-8 shrink-0 rounded border border-border bg-bg" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-fg">{info?.name ?? row.itemId}</p>
                          {row.hasAlternatives ? (
                            <p className="text-xs text-muted">
                              {t('alternativesNote', { count: row.objectiveCount > 1 ? row.objectiveCount : 1 })}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted">
                            {row.foundInRaid === true
                              ? t('foundInRaidYes')
                              : row.foundInRaid === false
                                ? t('foundInRaidNo')
                                : t('foundInRaidUnknown')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{row.totalRequired}</td>
                    <td className="px-3 py-2">
                      <OwnedCountInput
                        value={row.owned}
                        onStep={(delta) => handleStep(row.itemId, delta)}
                        onChange={(next) => handleOwnedChange(row.itemId, next)}
                      />
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${row.missing > 0 ? 'font-medium text-accent' : 'text-muted'}`}
                    >
                      {row.missing}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {skippedCount > 0 ? (
        <p className="text-xs text-muted">
          {t('unresolvedObjectivesTitle')} ({skippedCount}) — {t('unresolvedObjectivesHint')}
        </p>
      ) : null}
    </section>
  );
}
