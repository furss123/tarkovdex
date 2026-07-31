/**
 * Types describing the subset of the json.tarkov.dev static JSON API that
 * TarkovDex consumes. These are our own normalized shapes — hand-written from
 * real fetched responses (see lib/tarkov.ts), not a 1:1 mirror of the raw API.
 *
 * Raw response shapes (as actually observed, not the GraphQL schema this
 * project used before) live as `Raw*` interfaces alongside the fetch/mapping
 * code in lib/tarkov.ts, since they're an implementation detail of the
 * translation + extraction step, not something components should see.
 */

/** PvP ("regular") vs PvE. Declared here (not in lib/tarkov.ts, which is
 * `server-only`) so client components — like the global game-mode context —
 * can import the type without pulling in server-only fetch code. */
export type GameMode = 'regular' | 'pve';

/**
 * A single tradable item with flea-market price signals — deliberately trimmed
 * to only the fields the items page renders. This is the exact shape shipped
 * to the client (see CLAUDE.md > "items — client-side search"); every field
 * here has a measured cost, so don't add one back without checking payload
 * size again.
 */
export interface Item {
  id: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
  types: string[];
  avg24hPrice: number | null;
  low24hPrice: number | null;
  high24hPrice: number | null;
  changeLast48hPercent: number | null;
  /** ISO timestamp of the last price update. */
  updated: string | null;
  iconLink: string | null;
  /** Best (highest) vendor sell price in RUB, precomputed server-side from the
   * raw `sellToTrader[]` array — used only as the flea-banned fallback. No
   * vendor name — see CLAUDE.md > Traders (scope note) for why items
   * intentionally doesn't join against traders data. */
  bestVendorSellRUB: number | null;
}

export interface MarketItem extends Item {
  slotCount: number;
  estimatedFleaNet: number | null;
  referenceValue: number | null;
  valuePerSlot: number | null;
  valueSource: 'flea' | 'trader' | null;
  freshnessHours: number | null;
}

export interface MarketItemsResponse {
  items: MarketItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
  meta: {
    source: 'json.tarkov.dev';
    sourceUpdatedAt: string | null;
    generatedAt: string;
    gameMode: GameMode;
    feeRate: number;
  };
}

export interface TaskTrader {
  id: string;
  name: string;
  imageLink: string | null;
  /** Whether this trader has an actual item storefront. Derived from the
   * trader's loyalty-level data and used to exclude service/quest-only
   * characters from the homepage restock board. */
  hasStore: boolean;
  /** ISO timestamp of this trader's next stock refresh. Unused by the tasks
   * page (which only needs id→name/image) — added for the homepage's trader
   * restock board, which reuses this same trader lookup rather than adding a
   * second fetch/type for the same entity. See CLAUDE.md > Traders. */
  resetTime: string | null;
}

export interface TaskMap {
  id: string;
  name: string;
}

export interface TaskObjective {
  id: string;
  type: string;
  description: string;
  optional: boolean;
  count: number | null;
}

export interface TaskRequirement {
  taskId: string;
  taskName: string;
  statuses: string[];
}

/** A single quest ("task" in the API's terminology). */
export interface Task {
  id: string;
  name: string;
  trader: TaskTrader | null;
  /** The task's single target map, if any (many tasks — hideout/trader-only
   * — have none). Resolved from the `maps` endpoint by id. */
  map: TaskMap | null;
  minPlayerLevel: number | null;
  kappaRequired: boolean | null;
  experience: number | null;
  taskImageLink: string | null;
  requirements: TaskRequirement[];
  objectives: TaskObjective[];
}

export interface MapBossRef {
  id: string;
  name: string;
  /** Portrait art used by the compact homepage boss rows. Null-safe like
   * every other image field — not every mob entry has one. */
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
 *
 * The API has no "difficulty" field, so `description` stands in for it on the
 * maps page — see CLAUDE.md > Maps page.
 */
export interface GameMap {
  id: string;
  name: string;
  description: string | null;
  wiki: string | null;
  players: string | null;
  /** Minutes. */
  raidDuration: number | null;
  /** Deduped by boss id, keeping the highest spawnChance seen, sorted
   * descending — see CLAUDE.md > Maps page for why. */
  bosses: MapBossSpawn[];
}
