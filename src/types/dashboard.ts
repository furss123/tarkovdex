import type { GameMode, MapBossSpawn } from './tarkov';
import type { CraftProfitLeader } from './tools';

/**
 * The payload every board renders from — server-rendered once for the first
 * paint, then re-fetched by the live poll from `/api/board`. One shape for
 * both delivery paths so a polled update can replace the initial render
 * wholesale and the two can never disagree about what a field means.
 *
 * All three game modes travel together on purpose: craft prices and boss
 * compositions genuinely differ between PvP, PvE and the seasonal wipe, and
 * the Header's mode switch must not trigger a network request.
 */

/** Which page asked. The server trims the payload to what that page renders,
 * so the boss page never ships a craft ranking and vice versa. */
export type BoardView = 'home' | 'hideout' | 'bosses';

export interface CraftLeaderGroups {
  /** Ranked on prices recent enough to act on. */
  current: CraftProfitLeader[];
  /** Dated reference only — never interleaved with `current`. */
  stale: CraftProfitLeader[];
}

export type BoardBossMap = {
  id: string;
  name: string;
  bosses: MapBossSpawn[];
};

export interface BoardModeData {
  gameMode: GameMode;
  /**
   * Three distinct states, and the difference matters:
   *   - `undefined` — this view does not render crafts at all.
   *   - `null` — this mode's upstream fetch failed, or the mode has no
   *     upstream document. Another mode may still have data, and the UI says
   *     "couldn't load" rather than rendering an empty ranking.
   *   - a value — real data, possibly with zero rows.
   */
  crafts?: CraftLeaderGroups | null;
  bosses?: BoardBossMap[] | null;
  /**
   * Oldest upstream price stamp behind this mode's craft ranking. This is a
   * *content* timestamp — how current the underlying prices are — and is
   * deliberately distinct from `generatedAt` below, which only says when we
   * last asked. Conflating them is how a cached page claims to be live.
   */
  priceUpdatedAt: string | null;
}

export interface BoardData {
  view: BoardView;
  modes: Record<GameMode, BoardModeData>;
  /** ISO instant this payload was assembled on the server. */
  generatedAt: string;
}
