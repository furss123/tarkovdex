'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Locale } from '@/i18n/routing';
import type { Task } from '@/types/tarkov';
import { Link } from '@/i18n/navigation';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  resetQuestProgress,
  setQuestCompleted,
  useLocalState,
  type RaidPlanEntry,
} from '@/lib/local-state';
import { createRaidPlan, deleteRaidPlan, duplicateRaidPlan } from '@/lib/local-state';
import { aggregateRequiredItems, findOrphanedIds } from '@/lib/quest-requirements';
import { QuestStatusToggle } from './QuestStatusToggle';
import { RequiredItemsSummary, type ItemDisplayInfo } from './RequiredItemsSummary';
import { RaidPlanList } from './RaidPlanList';
import { RaidPlanEditor } from './RaidPlanEditor';
import { OrphanedReferenceNotice } from './OrphanedReferenceNotice';
import { EmptyState, ErrorState } from '@/components/status/StatusUI';

/**
 * Everything on this page depends on the browser's local state — the server
 * shell (`tracker/page.tsx`) renders only the static header; this component
 * fetches full quest data for whatever the player has saved once mounted,
 * the same "client-only after hydration" shape `/local-data` already uses.
 */
export function QuestTracker({ locale }: { locale: Locale }) {
  const t = useTranslations('questTracker');
  const { gameMode } = useGameMode();
  const state = useLocalState();
  const questState = state.modeData[gameMode].quests;
  const raidPlans = state.modeData[gameMode].raidPlans;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksFailed, setTasksFailed] = useState(false);
  const [itemsById, setItemsById] = useState<Map<string, ItemDisplayInfo>>(new Map());
  const [includeOptional, setIncludeOptional] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Every quest id this page could possibly need full data for: the active
  // list, the completed list (so a completed quest's name still renders),
  // and every raid plan's own quest selection (which can outlive removal
  // from the active list — see schema.ts's RaidPlanEntry comment).
  const neededTaskIds = useMemo(() => {
    const ids = new Set<string>([...questState.activeQuestIds, ...questState.completedQuestIds]);
    for (const plan of raidPlans) for (const id of plan.activeQuestIds) ids.add(id);
    return [...ids].sort();
  }, [questState.activeQuestIds, questState.completedQuestIds, raidPlans]);
  const taskIdsKey = neededTaskIds.join(',');

  useEffect(() => {
    if (neededTaskIds.length === 0) {
      setTasks([]);
      setTasksFailed(false);
      return;
    }
    const controller = new AbortController();
    setTasksFailed(false);
    fetch(`/api/tasks?ids=${encodeURIComponent(neededTaskIds.join(','))}&mode=${gameMode}&locale=${locale}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('tasks lookup failed');
        return response.json() as Promise<{ tasks: Task[] }>;
      })
      .then((data) => setTasks(data.tasks))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setTasksFailed(true);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsKey, gameMode, locale]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => questState.activeQuestIds.includes(task.id)),
    [tasks, questState.activeQuestIds],
  );
  const completedTasks = useMemo(
    () => tasks.filter((task) => questState.completedQuestIds.includes(task.id)),
    [tasks, questState.completedQuestIds],
  );

  const aggregation = useMemo(
    () => aggregateRequiredItems(activeTasks, includeOptional),
    [activeTasks, includeOptional],
  );
  const requiredItemIds = useMemo(
    () => aggregation.lines.map((line) => line.itemId),
    [aggregation.lines],
  );
  const requiredItemIdsKey = requiredItemIds.join(',');

  useEffect(() => {
    if (requiredItemIds.length === 0) {
      setItemsById(new Map());
      return;
    }
    const controller = new AbortController();
    fetch(`/api/items?ids=${encodeURIComponent(requiredItemIds.join(','))}&locale=${locale}`, {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('items lookup failed');
        return response.json() as Promise<{ items: ItemDisplayInfo[] & { id: string }[] }>;
      })
      .then((data) => {
        const map = new Map<string, ItemDisplayInfo>();
        for (const item of data.items as unknown as Array<ItemDisplayInfo & { id: string }>) {
          map.set(item.id, item);
        }
        setItemsById(map);
      })
      .catch(() => {
        // Non-fatal — rows fall back to showing the raw item id.
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requiredItemIdsKey, locale]);

  const mapOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const task of activeTasks) {
      if (task.map) options.set(task.map.id, task.map.name);
    }
    return [...options.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeTasks]);

  const orphans = useMemo(() => {
    const knownTaskIds = new Set(tasks.map((task) => task.id));
    const knownMapIds = new Set(mapOptions.map((option) => option.id));
    return findOrphanedIds(
      [...questState.activeQuestIds, ...questState.completedQuestIds],
      raidPlans.map((plan) => plan.mapId),
      knownTaskIds,
      knownMapIds,
    );
  }, [tasks, mapOptions, questState.activeQuestIds, questState.completedQuestIds, raidPlans]);

  const selectedPlan: RaidPlanEntry | undefined = raidPlans.find((plan) => plan.id === selectedPlanId);

  function handleCreatePlan() {
    const { plan } = createRaidPlan(gameMode, { name: t('newPlan'), mapId: null });
    if (plan) setSelectedPlanId(plan.id);
  }

  function mapNameFor(mapId: string | null): string {
    if (!mapId) return t('noMapSelected');
    return mapOptions.find((option) => option.id === mapId)?.name ?? mapId;
  }

  return (
    <div className="space-y-10">
      {questState.activeQuestIds.length === 0 && questState.completedQuestIds.length === 0 ? (
        <EmptyState
          title={t('noActiveQuests')}
          hint={t('noActiveQuestsHint')}
          action={
            <Link
              href="/progression/tasks"
              className="inline-flex min-h-touch items-center rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-[14px] font-medium text-accent hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              {t('goToQuestList')}
            </Link>
          }
        />
      ) : (
        <>
          {tasksFailed ? <ErrorState title={t('saveFailed')} /> : null}

          <OrphanedReferenceNotice
            orphanedQuestIds={orphans.orphanedQuestIds}
            orphanedMapIds={orphans.orphanedMapIds}
          />

          <section aria-labelledby="active-quests-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 id="active-quests-heading" className="text-base font-medium text-fg">
                {t('activeQuestsTitle')} ({questState.activeQuestIds.length})
              </h2>
              {!confirmingReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmingReset(true)}
                  className="inline-flex min-h-touch items-center rounded-md border border-negative/40 px-3 py-1.5 text-[14px] text-negative hover:bg-negative/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
                >
                  {t('resetProgress')}
                </button>
              ) : (
                <div role="alertdialog" className="rounded-md border border-negative/40 bg-negative/5 p-2">
                  <p className="text-xs text-fg">{t('resetProgressConfirmBody')}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        resetQuestProgress(gameMode);
                        setConfirmingReset(false);
                      }}
                      className="inline-flex min-h-touch items-center rounded-md border border-negative/60 bg-negative/10 px-2.5 py-1 text-xs font-medium text-negative hover:bg-negative/20"
                    >
                      {t('continue')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      className="inline-flex min-h-touch items-center rounded-md border border-border px-2.5 py-1 text-xs text-fg"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <ul className="space-y-2">
              {activeTasks.map((task) => (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface/30 p-3"
                >
                  <span className="min-w-0 truncate text-[14px] text-fg">{task.name}</span>
                  <QuestStatusToggle questId={task.id} />
                </li>
              ))}
            </ul>
          </section>

          <RequiredItemsSummary
            mode={gameMode}
            lines={aggregation.lines}
            skippedCount={aggregation.skipped.length}
            ownedItemCounts={questState.ownedItemCounts}
            itemsById={itemsById}
            includeOptional={includeOptional}
            onIncludeOptionalChange={setIncludeOptional}
          />

          <section aria-labelledby="raid-planner-heading" className="space-y-3">
            <div>
              <h2 id="raid-planner-heading" className="text-base font-medium text-fg">
                {t('raidPlannerTitle')}
              </h2>
              <p className="mt-1 text-[14px] leading-5 text-muted">{t('raidPlannerDescription')}</p>
            </div>
            <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <RaidPlanList
                plans={raidPlans}
                selectedPlanId={selectedPlanId}
                onSelect={setSelectedPlanId}
                onCreate={handleCreatePlan}
                onDelete={(id) => {
                  deleteRaidPlan(gameMode, id);
                  if (selectedPlanId === id) setSelectedPlanId(null);
                }}
                onDuplicate={(id) => {
                  const { plan } = duplicateRaidPlan(gameMode, id, '(copy)');
                  if (plan) setSelectedPlanId(plan.id);
                }}
                mapName={mapNameFor}
              />
              <div className="rounded-lg border border-border bg-surface/30 p-4">
                {selectedPlan ? (
                  <RaidPlanEditor
                    mode={gameMode}
                    plan={selectedPlan}
                    activeTasks={activeTasks}
                    mapOptions={mapOptions}
                  />
                ) : (
                  <EmptyState title={t('selectPlanHint')} />
                )}
              </div>
            </div>
          </section>

          {questState.completedQuestIds.length > 0 ? (
            <section aria-labelledby="completed-quests-heading" className="space-y-3">
              <h2 id="completed-quests-heading" className="text-base font-medium text-fg">
                {t('completedQuestsTitle')} ({questState.completedQuestIds.length})
              </h2>
              <ul className="space-y-2">
                {completedTasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-bg/40 p-3"
                  >
                    <span className="min-w-0 truncate text-[14px] text-muted line-through">{task.name}</span>
                    <button
                      type="button"
                      onClick={() => setQuestCompleted(gameMode, task.id, false)}
                      className="inline-flex min-h-touch items-center rounded-md border border-border px-3 py-1.5 text-[14px] text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
                    >
                      {t('unmarkCompleted')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
