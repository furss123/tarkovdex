'use client';

import { useState } from 'react';
import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { RaidPlanEntry } from '@/lib/local-state';
import { EmptyState } from '@/components/status/StatusUI';

export function RaidPlanList({
  plans,
  selectedPlanId,
  onSelect,
  onCreate,
  onDelete,
  onDuplicate,
  mapName,
}: {
  plans: RaidPlanEntry[];
  selectedPlanId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  mapName: (mapId: string | null) => string;
}) {
  const t = useTranslations('questTracker');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const sorted = [...plans].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onCreate}
        className="inline-flex min-h-touch w-full items-center justify-center gap-1.5 rounded-md border border-accent/50 bg-accent/10 px-3 py-2 text-[14px] font-medium text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        <Plus className="size-4" aria-hidden="true" />
        {t('newPlan')}
      </button>

      {sorted.length === 0 ? (
        <EmptyState title={t('noPlans')} hint={t('selectPlanHint')} />
      ) : (
        <ul className="space-y-2">
          {sorted.map((plan) => {
            const selected = plan.id === selectedPlanId;
            const confirming = confirmingDeleteId === plan.id;
            return (
              <li
                key={plan.id}
                className={`rounded-lg border p-3 transition-colors ${
                  selected ? 'border-accent/60 bg-accent/5' : 'border-border bg-surface/30'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(plan.id)}
                  className="flex min-h-touch w-full flex-col items-start rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                >
                  <span className="truncate text-[14px] font-medium text-fg">{plan.name}</span>
                  <span className="text-xs text-muted">
                    {mapName(plan.mapId)} · {plan.activeQuestIds.length}
                  </span>
                </button>

                {confirming ? (
                  <div
                    role="alertdialog"
                    aria-label={t('deletePlanConfirmTitle')}
                    className="mt-2 rounded-md border border-negative/40 bg-negative/5 p-2"
                  >
                    <p className="text-xs text-fg">{t('deletePlanConfirmBody')}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(plan.id);
                          setConfirmingDeleteId(null);
                        }}
                        className="inline-flex min-h-touch items-center rounded-md border border-negative/60 bg-negative/10 px-2.5 py-1 text-xs font-medium text-negative hover:bg-negative/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
                      >
                        {t('continue')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        className="inline-flex min-h-touch items-center rounded-md border border-border px-2.5 py-1 text-xs text-fg hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => onDuplicate(plan.id)}
                      aria-label={t('duplicatePlan')}
                      className="inline-flex min-h-touch items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      {t('duplicatePlan')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(plan.id)}
                      aria-label={t('deletePlan')}
                      className="inline-flex min-h-touch items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-fg hover:border-negative/50 hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      {t('deletePlan')}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
