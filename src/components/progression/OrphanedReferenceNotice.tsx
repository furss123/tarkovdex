'use client';

import { useTranslations } from 'next-intl';
import { PartialDataNotice } from '@/components/status/StatusUI';

/**
 * "Some of what you saved no longer resolves against current game data" —
 * never auto-deletes, only names what is stale. Reused wherever a raid plan
 * or the quest tracker references a quest/map id the current dataset no
 * longer has (an upstream patch removed or renamed something).
 */
export function OrphanedReferenceNotice({
  orphanedQuestIds,
  orphanedMapIds,
  onCleanUp,
}: {
  orphanedQuestIds: string[];
  orphanedMapIds: string[];
  onCleanUp?: () => void;
}) {
  const t = useTranslations('questTracker');
  const total = orphanedQuestIds.length + orphanedMapIds.length;
  if (total === 0) return null;

  return (
    <PartialDataNotice
      message={t('orphanedTitle')}
      hint={t('orphanedHint')}
      action={
        onCleanUp ? (
          <button
            type="button"
            onClick={onCleanUp}
            className="inline-flex min-h-touch shrink-0 items-center rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {t('cleanUpOrphaned')}
          </button>
        ) : undefined
      }
    />
  );
}
