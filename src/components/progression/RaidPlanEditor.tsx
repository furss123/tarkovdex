'use client';

import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { GameMode, Task } from '@/types/tarkov';
import type { RaidPlanEntry } from '@/lib/local-state';
import {
  addCustomItem,
  removeCustomItem,
  toggleObjectiveChecked,
  updateCustomItem,
  updateRaidPlan,
} from '@/lib/local-state';

const AGGREGATABLE_TYPES = new Set(['giveItem', 'findItem', 'plantItem']);

/**
 * Edits one raid plan. Every mutation goes straight through the store's
 * public API (no local "unsaved changes" buffer) — Phase 2's store already
 * makes same-value writes a no-op, so re-saving an untouched field costs
 * nothing, and there is no separate save step for the user to remember.
 */
export function RaidPlanEditor({
  mode,
  plan,
  activeTasks,
  mapOptions,
}: {
  mode: GameMode;
  plan: RaidPlanEntry;
  /** Full Task objects for every quest currently marked active — the pool
   * the quest picker offers, independent of what's already in this plan. */
  activeTasks: Task[];
  mapOptions: Array<{ id: string; name: string }>;
}) {
  const t = useTranslations('questTracker');
  const [name, setName] = useState(plan.name);
  const [notes, setNotes] = useState(plan.notes);
  const [newItemLabel, setNewItemLabel] = useState('');
  const notesTimer = useRef<number | null>(null);

  // Keep local text buffers in sync when the selected plan itself changes
  // (switching plans, or an external tab editing this same plan).
  useEffect(() => {
    setName(plan.name);
    setNotes(plan.notes);
  }, [plan.id, plan.name, plan.notes]);

  function commitName(next: string) {
    setName(next);
    updateRaidPlan(mode, plan.id, () => ({ name: next }));
  }

  function commitNotes(next: string) {
    setNotes(next);
    if (notesTimer.current) window.clearTimeout(notesTimer.current);
    // Debounced — a note is typed character by character, and every one of
    // those must not become its own localStorage write.
    notesTimer.current = window.setTimeout(() => {
      updateRaidPlan(mode, plan.id, () => ({ notes: next }));
    }, 400);
  }

  const includedTasks = activeTasks.filter((task) => plan.activeQuestIds.includes(task.id));
  const questsForMap = plan.mapId
    ? activeTasks.filter((task) => task.map?.id === plan.mapId)
    : activeTasks;

  function toggleQuest(taskId: string, included: boolean) {
    updateRaidPlan(mode, plan.id, (current) => ({
      activeQuestIds: included
        ? [...current.activeQuestIds, taskId]
        : current.activeQuestIds.filter((id) => id !== taskId),
    }));
  }

  return (
    <div className="space-y-6">
      <div>
        <label className="sr-only" htmlFor="plan-name">
          {t('renamePlaceholder')}
        </label>
        <input
          id="plan-name"
          type="text"
          value={name}
          maxLength={100}
          onChange={(event) => commitName(event.target.value)}
          placeholder={t('newPlanNamePlaceholder')}
          className="w-full min-h-touch rounded-md border border-border bg-bg px-3 text-[16px] font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      </div>

      <div>
        <label className="text-[14px] font-medium text-fg" htmlFor="plan-map">
          {t('planMapLabel')}
        </label>
        <select
          id="plan-map"
          value={plan.mapId ?? ''}
          onChange={(event) =>
            updateRaidPlan(mode, plan.id, () => ({ mapId: event.target.value || null }))
          }
          className="mt-1 block min-h-touch w-full max-w-xs rounded-md border border-border bg-bg px-3 text-[14px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <option value="">{t('noMapSelected')}</option>
          {mapOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <section aria-labelledby="plan-quests-heading">
        <h3 id="plan-quests-heading" className="text-[14px] font-medium text-fg">
          {t('planQuestsTitle')}
        </h3>
        {questsForMap.length === 0 ? (
          <p className="mt-2 text-[14px] text-muted">{t('noActiveQuestsForMap')}</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {questsForMap.map((task) => {
              const included = plan.activeQuestIds.includes(task.id);
              return (
                <li key={task.id}>
                  <label className="flex min-h-touch items-center gap-2 rounded-md border border-border/70 bg-bg/60 px-3 py-1.5 text-[14px] text-fg">
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={(event) => toggleQuest(task.id, event.target.checked)}
                      className="size-4 accent-accent"
                    />
                    <span className="min-w-0 truncate">{task.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {includedTasks.length > 0 ? (
        <section aria-labelledby="plan-objectives-heading">
          <h3 id="plan-objectives-heading" className="text-[14px] font-medium text-fg">
            {t('planObjectivesTitle')}
          </h3>
          <p className="mt-1 text-xs text-muted">{t('autoDetected')}</p>
          <ul className="mt-2 space-y-3">
            {includedTasks.map((task) => (
              <li key={task.id}>
                <p className="text-[14px] font-medium text-fg">{task.name}</p>
                <ul className="mt-1 space-y-1">
                  {task.objectives.map((objective) => {
                    const key = `${task.id}:${objective.id}`;
                    const checked = plan.checkedObjectiveKeys.includes(key);
                    const supported = AGGREGATABLE_TYPES.has(objective.type) || objective.type === 'visit';
                    return (
                      <li key={key}>
                        <label className="flex min-h-touch items-start gap-2 rounded-md border border-border/60 bg-bg/40 px-3 py-1.5 text-[14px] text-fg">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) =>
                              toggleObjectiveChecked(mode, plan.id, key, event.target.checked)
                            }
                            className="mt-1 size-4 shrink-0 accent-accent"
                          />
                          <span className="min-w-0">
                            {objective.description}
                            {!supported ? (
                              <span className="mt-0.5 block text-xs text-muted">
                                {t('notAvailableInData')}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="plan-custom-items-heading">
        <h3 id="plan-custom-items-heading" className="text-[14px] font-medium text-fg">
          {t('customItemsTitle')}
        </h3>
        <p className="mt-1 text-xs text-muted">{t('userEntered')}</p>
        <ul className="mt-2 space-y-1.5">
          {plan.customItems.map((item) => (
            <li key={item.id} className="flex items-center gap-1">
              {/* A bare checkbox's own hit area is its rendered glyph size —
                  a `min-h-touch` sibling row does not extend it. Wrapped in a
                  same-size label so the tappable area is genuinely 44px, not
                  just the row's visual height (the 24px checkbox gap this
                  project has fixed once already on the ammo/armor pages). */}
              <label className="flex size-touch shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={(event) =>
                    updateCustomItem(mode, plan.id, item.id, { checked: event.target.checked })
                  }
                  className="size-4 accent-accent"
                />
              </label>
              <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{item.label}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={item.quantity}
                onChange={(event) =>
                  updateCustomItem(mode, plan.id, item.id, { quantity: Number(event.target.value) || 0 })
                }
                className="h-touch w-16 shrink-0 rounded-md border border-border bg-bg px-2 text-center text-[14px] tabular-nums text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              />
              <button
                type="button"
                onClick={() => removeCustomItem(mode, plan.id, item.id)}
                aria-label={t('removeCustomItem')}
                className="flex size-touch shrink-0 items-center justify-center rounded-md border border-border text-muted hover:border-negative/50 hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
              >
                <Trash2 className="size-[14px]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!newItemLabel.trim()) return;
            addCustomItem(mode, plan.id, newItemLabel);
            setNewItemLabel('');
          }}
        >
          <label className="sr-only" htmlFor="new-custom-item">
            {t('customItemPlaceholder')}
          </label>
          <input
            id="new-custom-item"
            type="text"
            value={newItemLabel}
            maxLength={100}
            onChange={(event) => setNewItemLabel(event.target.value)}
            placeholder={t('customItemPlaceholder')}
            className="min-h-touch flex-1 rounded-md border border-border bg-bg px-3 text-[14px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          />
          <button
            type="submit"
            className="inline-flex min-h-touch items-center rounded-md border border-accent/50 bg-accent/10 px-3 text-[14px] font-medium text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {t('addCustomItem')}
          </button>
        </form>
      </section>

      <section aria-labelledby="plan-notes-heading">
        <h3 id="plan-notes-heading" className="text-[14px] font-medium text-fg">
          {t('notesTitle')}
        </h3>
        <label className="sr-only" htmlFor="plan-notes">
          {t('notesTitle')}
        </label>
        <textarea
          id="plan-notes"
          value={notes}
          maxLength={5000}
          onChange={(event) => commitNotes(event.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={4}
          className="mt-2 w-full rounded-md border border-border bg-bg px-3 py-2 text-[14px] text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        />
      </section>
    </div>
  );
}
