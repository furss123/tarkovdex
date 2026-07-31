'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useGameMode } from '@/contexts/GameModeContext';

/**
 * Switches between two pre-rendered sets of `MapCard`s based on the
 * site-wide PvP/PvE selection. `MapCard` is an async Server Component (uses
 * `getTranslations` from `next-intl/server`), so it can't be imported and
 * instantiated inside a Client Component's render body — instead
 * `app/[locale]/maps/page.tsx` renders **both** modes' full card lists
 * server-side and passes the finished JSX in as children; this component's
 * only job is picking which pre-rendered set to display. See CLAUDE.md >
 * "Global PvP/PvE mode".
 */
export function MapsModeBoard({
  regularCards,
  pveCards,
  regularCount,
  pveCount,
}: {
  regularCards: ReactNode;
  pveCards: ReactNode;
  regularCount: number;
  pveCount: number;
}) {
  const t = useTranslations('maps');
  const { gameMode } = useGameMode();
  const count = gameMode === 'regular' ? regularCount : pveCount;

  if (count === 0) {
    return (
      <div className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
        {t('empty')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {gameMode === 'regular' ? regularCards : pveCards}
    </div>
  );
}
