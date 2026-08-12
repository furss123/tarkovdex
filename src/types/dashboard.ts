import type { GameMode, MapBossSpawn } from './tarkov';
import type { CraftProfitLeader } from './tools';

/**
 * The single payload the dashboard renders from — server-rendered once for the
 * first paint, then re-fetched by the live poll from `/api/dashboard`. One
 * shape for both delivery paths so the polled update can replace the initial
 * render wholesale and the two can never disagree about what a field means.
 *
 * Both game modes travel together on purpose: boss compositions and craft
 * prices genuinely differ between PvP and PvE, and the Header's mode switch
 * must not trigger a network request.
 */

export interface CraftLeaderGroups {
  /** Ranked on prices recent enough to act on. */
  current: CraftProfitLeader[];
  /** Dated reference only — never interleaved with `current`. */
  stale: CraftProfitLeader[];
}

export type DashboardBossMap = {
  id: string;
  name: string;
  bosses: MapBossSpawn[];
};

export interface DashboardModeData {
  gameMode: GameMode;
  /** Null means this mode's upstream fetch failed; the other mode may still
   * have data, and the UI says so rather than rendering an empty ranking. */
  crafts: CraftLeaderGroups | null;
  bosses: DashboardBossMap[] | null;
  /**
   * Oldest upstream price stamp behind this mode's craft ranking. This is a
   * *content* timestamp — how current the underlying prices are — and is
   * deliberately distinct from `generatedAt` below, which only says when we
   * last asked. Conflating them is how a cached page claims to be live.
   */
  priceUpdatedAt: string | null;
}

export interface DashboardData {
  regular: DashboardModeData;
  pve: DashboardModeData;
  /** ISO instant this payload was assembled on the server. */
  generatedAt: string;
}
