'use client';

import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import type { BoardData } from '@/types/dashboard';
import { useGameMode } from '@/contexts/GameModeContext';
import { BossSpawnBoard } from './BossSpawnBoard';
import { CraftProfitBoard } from './CraftProfitBoard';
import { LiveStatusBar } from './LiveStatusBar';
import { useLiveBoard } from './useLiveBoard';

/**
 * Owns the live payload and the game-mode selection for every data board on
 * the site. The home page, the hideout page and the boss page all render this
 * — what differs is only which projections the server put in the payload.
 *
 * Both concerns sit here rather than in each board for the same reason: the
 * payload carries all three modes, so the Header's mode switch is a re-render
 * over data that is already in memory, and one refresh updates every mode at
 * once. If each board fetched for itself, switching modes would either refetch
 * or let two boards drift into showing different instants.
 *
 * The raid clock is deliberately not part of this — it is pure client-side
 * math with no data dependency, so it keeps running even if every fetch here
 * fails.
 */
export function LiveBoards({
  initialData,
  locale,
  craftHref,
  bossHref,
  slot,
}: {
  initialData: BoardData;
  locale: Locale;
  /** When set, the craft board renders a "see the full board" link. Home
   * passes it; the hideout page itself does not, because it *is* the target. */
  craftHref?: string;
  bossHref?: string;
  /**
   * Rendered between the two boards. Passed in as a node rather than imported
   * here so the ad unit sits at a section break instead of inside a board that
   * re-renders on every poll — see `AdSlot`'s once-only initialization.
   */
  slot?: ReactNode;
}) {
  const { gameMode } = useGameMode();
  const { data, status, now, lastSyncedAt, refresh } = useLiveBoard(
    initialData,
    locale,
    initialData.view,
  );
  const mode = data.modes[gameMode];

  return (
    <div className="space-y-8 sm:space-y-10">
      <LiveStatusBar
        locale={locale}
        gameMode={gameMode}
        priceUpdatedAt={mode?.priceUpdatedAt ?? null}
        showPriceAge={mode?.crafts !== undefined}
        now={now}
        lastSyncedAt={lastSyncedAt}
        status={status}
        onRefresh={refresh}
      />
      {mode?.crafts !== undefined ? (
        <CraftProfitBoard
          leaders={mode.crafts}
          locale={locale}
          moreHref={craftHref}
        />
      ) : null}
      {slot}
      {mode?.bosses !== undefined ? (
        <BossSpawnBoard
          maps={mode.bosses}
          locale={locale}
          moreHref={bossHref}
        />
      ) : null}
    </div>
  );
}
