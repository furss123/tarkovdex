'use client';

import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import type { DashboardData } from '@/types/dashboard';
import { useGameMode } from '@/contexts/GameModeContext';
import { BossSpawnBoard } from './BossSpawnBoard';
import { CraftProfitBoard } from './CraftProfitBoard';
import { LiveStatusBar } from './LiveStatusBar';
import { useLiveDashboard } from './useLiveDashboard';

/**
 * Owns the live payload and the PvP/PvE selection for both data boards.
 *
 * Both concerns sit here rather than in each board for the same reason: the
 * payload carries both modes, so the Header's mode switch is a re-render over
 * data that is already in memory, and a refresh updates both modes at once. If
 * each board fetched for itself, switching modes would either refetch or let
 * the two boards drift into showing different instants.
 *
 * The raid clock is deliberately not part of this — it is pure client-side
 * math with no data dependency, so it keeps running even if every fetch here
 * fails.
 */
export function LiveDashboard({
  initialData,
  locale,
  slot,
}: {
  initialData: DashboardData;
  locale: Locale;
  /**
   * Rendered between the two boards. Passed in as a node rather than imported
   * here so the ad unit sits at a section break instead of inside a board that
   * re-renders on every poll — see `AdSlot`'s once-only initialization.
   */
  slot?: ReactNode;
}) {
  const { gameMode } = useGameMode();
  const { data, status, now, lastSyncedAt, refresh } = useLiveDashboard(
    initialData,
    locale,
  );
  const mode = gameMode === 'regular' ? data.regular : data.pve;

  return (
    <div className="space-y-8 sm:space-y-10">
      <LiveStatusBar
        locale={locale}
        priceUpdatedAt={mode.priceUpdatedAt}
        now={now}
        lastSyncedAt={lastSyncedAt}
        status={status}
        onRefresh={refresh}
      />
      <CraftProfitBoard leaders={mode.crafts} locale={locale} />
      {slot}
      <BossSpawnBoard maps={mode.bosses} locale={locale} />
    </div>
  );
}
