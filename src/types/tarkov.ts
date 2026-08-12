/**
 * Types describing the subset of the json.tarkov.dev static JSON API that
 * TarkovDex consumes. These are our own normalized shapes — hand-written from
 * real fetched responses (see lib/tarkov.ts), not a 1:1 mirror of the raw API.
 *
 * Raw response shapes live as `Raw*` interfaces alongside the fetch/mapping
 * code in lib/tarkov.ts, since they're an implementation detail of the
 * translation + extraction step, not something components should see.
 *
 * Scope note (single-page redesign): the item, task and trader shapes that
 * used to live here were removed with the routes that rendered them. Only the
 * map/boss shapes the dashboard's spawn board reads remain.
 */

/** PvP ("regular") vs PvE. Declared here (not in lib/tarkov.ts, which is
 * `server-only`) so client components — like the global game-mode context —
 * can import the type without pulling in server-only fetch code. */
export type GameMode = 'regular' | 'pve';

export interface MapBossRef {
  id: string;
  name: string;
  /** Portrait art used by the compact boss rows. Null-safe like every other
   * image field — not every mob entry has one. */
  imageLink: string | null;
}

export interface MapBossSpawn {
  boss: MapBossRef | null;
  /** Fraction 0–1 (e.g. 0.2 = 20%). Confirmed against live data. */
  spawnChance: number | null;
}

/**
 * A raid map. `players` is a free-form string from the API (e.g. "4-6"), not a
 * number, so it's rendered as-is rather than passed through Intl.NumberFormat.
 */
export interface GameMap {
  id: string;
  name: string;
  description: string | null;
  players: string | null;
  /** Minutes. */
  raidDuration: number | null;
  /** Deduped by boss id, keeping the highest spawnChance seen, sorted
   * descending — the raw data lists one entry per spawn location/condition. */
  bosses: MapBossSpawn[];
}
