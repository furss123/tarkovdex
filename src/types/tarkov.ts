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

/**
 * The three selectable game modes. Declared here (not in lib/tarkov.ts, which
 * is `server-only`) so client components — like the global game-mode context —
 * can import the type without pulling in server-only fetch code.
 *
 * - `regular`  — PvP, the default and the mode most visitors want.
 * - `pve`      — PvE.
 * - `seasonal` — the seasonal PvP wipe ("PvP S"). Its upstream path segment is
 *   configurable (see `MODE_PATH` in lib/tarkov.ts) because json.tarkov.dev
 *   publishes it separately from the two permanent modes; when upstream has no
 *   document for it, every board reports "no data for this mode" rather than
 *   quietly falling back to PvP numbers, which would be worse than an empty
 *   board — a seasonal wipe has its own economy and its own boss table.
 */
export type GameMode = 'regular' | 'pve' | 'seasonal';

/** Render/iteration order. The switcher and every `Record<GameMode, …>`
 * builder walk this, so adding a mode is a one-line change. */
export const GAME_MODES = ['regular', 'pve', 'seasonal'] as const;

export function isGameMode(value: unknown): value is GameMode {
  return (GAME_MODES as readonly unknown[]).includes(value);
}

/** Trader identity, resolved from the `traders` endpoint. Task documents carry
 * only a trader id, and that id does not resolve through the task translation
 * dictionary — the separate endpoint is the only way to a name. */
export interface TaskTrader {
  id: string;
  name: string;
  imageLink: string | null;
}

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
