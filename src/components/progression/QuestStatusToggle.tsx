'use client';

import { Check, ListPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';
import {
  setQuestActive,
  setQuestCompleted,
  useLocalState,
} from '@/lib/local-state';

/**
 * The one active/complete control, used both inline on the quest list
 * (`TaskCard`) and in the tracker's quest picker — one component, one
 * behavior, per Phase 3's "don't re-implement the same role" rule.
 *
 * Reads `useGameMode()` itself rather than taking `mode` as a prop: every
 * caller already needs the current mode's quest to be the one in scope, and
 * this keeps callers from having to thread it through.
 */
export function QuestStatusToggle({ questId }: { questId: string }) {
  const t = useTranslations('questTracker');
  const { gameMode } = useGameMode();
  const state = useLocalState();
  const quests = state.modeData[gameMode].quests;
  const active = quests.activeQuestIds.includes(questId);
  const completed = quests.completedQuestIds.includes(questId);

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('questStatus')}>
      <button
        type="button"
        aria-pressed={active}
        onClick={() => setQuestActive(gameMode, questId, !active)}
        className={`inline-flex min-h-touch items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          active
            ? 'border-accent/60 bg-accent/10 text-accent'
            : 'border-border text-fg hover:border-accent/50 hover:text-accent'
        }`}
      >
        <ListPlus className="size-[14px]" aria-hidden="true" />
        {active ? t('removeFromActive') : t('addToActive')}
      </button>
      <button
        type="button"
        aria-pressed={completed}
        onClick={() => setQuestCompleted(gameMode, questId, !completed)}
        className={`inline-flex min-h-touch items-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
          // Deliberately not the green `positive` token — that hue is
          // reserved for signed price deltas only (design system rule). A
          // filled neutral treatment reads as "done" through fill + icon,
          // not through introducing a second color.
          completed
            ? 'border-fg/50 bg-fg/10 text-fg'
            : 'border-border text-fg hover:border-accent/50 hover:text-accent'
        }`}
      >
        <Check className="size-[14px]" aria-hidden="true" />
        {completed ? t('unmarkCompleted') : t('markCompleted')}
      </button>
    </div>
  );
}
