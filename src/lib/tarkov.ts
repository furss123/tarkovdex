import 'server-only';
import type {
  GameMap,
  GameMode,
  Item,
  MapBossSpawn,
  Task,
  TaskTrader,
} from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { localizeMobName, localizeTaskText } from '@/lib/game-localization';

/**
 * json.tarkov.dev static JSON API client.
 *
 * DEPRECATED/REPLACED: this project originally used the api.tarkov.dev
 * GraphQL API. That code was discarded in favor of json.tarkov.dev's
 * pre-generated JSON dumps after the GraphQL endpoint proved unreliable
 * (persistent 503s) during development. See CLAUDE.md > "json.tarkov.dev
 * migration" for the full rationale and the real response shapes this file
 * was built against.
 *
 * Every endpoint here follows the same two-part shape:
 *   1. `/{gameMode}/{endpoint}` — the base data, in the *default* language,
 *      but with every translatable field's value replaced by a **dictionary
 *      key** (not real text) — e.g. an item's `name` might literally be the
 *      string `"5447a9cd4bdc2dbd208b4567 Name"`.
 *   2. `/{gameMode}/{endpoint}_{lang}` — a FLAT key→string dictionary. Look
 *      up the base value in this dictionary to get the real, localized text.
 *      This applies to ko/zh/en (and other languages) equally — there is no
 *      "the base file already has English text" shortcut.
 *   This is confirmed by the base file's own `translations` field, a
 *   JSONPath manifest listing exactly which fields follow this pattern (e.g.
 *   `$.data.maps.*.name`). See {@link translate} for the lookup helper.
 */

const BASE_URL = 'https://json.tarkov.dev';

/** `GameMode` itself now lives in types/tarkov.ts (a plain, non-server-only
 * module) so the global game-mode context can import the type without
 * pulling this server-only fetch module into the client bundle. Re-exported
 * here so existing `import type { GameMode } from '@/lib/tarkov'` call sites
 * keep working. */
export type { GameMode };
const DEFAULT_GAME_MODE: GameMode = 'regular';

/** Structural game data changes slowly. Price-backed documents use the
 * shorter window requested by the economy/combat tools. */
const REVALIDATE_SECONDS = 6 * 60 * 60;
const PRICE_REVALIDATE_SECONDS = 15 * 60;

function cacheSecondsForPath(path: string): number {
  return /\/(?:items(?:_|$)|barters$|crafts$)/.test(path)
    ? PRICE_REVALIDATE_SECONDS
    : REVALIDATE_SECONDS;
}

type MemoryCacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

/**
 * Next's built-in Data Cache rejects individual entries larger than 2 MB,
 * while the static Tarkov dumps are 3-21 MB. Keep one parsed promise per
 * runtime instance instead. Route responses still receive CDN cache headers;
 * this layer prevents a new upstream download for every distinct search.
 */
const memoryCache = new Map<string, MemoryCacheEntry>();

export async function fetchTarkovJson<T>(path: string): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(path);
  if (cached && cached.expiresAt > now) return cached.value as Promise<T>;

  const value = fetch(`${BASE_URL}${path}`, { cache: 'no-store' }).then(
    async (res) => {
      if (!res.ok) {
        throw new Error(
          `json.tarkov.dev responded ${res.status} ${res.statusText} for ${path}`,
        );
      }
      return res.json() as Promise<T>;
    },
  );
  memoryCache.set(path, {
    expiresAt: now + cacheSecondsForPath(path) * 1000,
    value,
  });

  try {
    return await value;
  } catch (error) {
    memoryCache.delete(path);
    throw error;
  }
}

export type TranslationDict = Record<string, string>;

/** `{endpoint}_{lang}` files are `{ data: { [rawValue]: translatedValue } }`. */
interface TranslationDoc {
  data: TranslationDict;
}

export async function getTranslationDict(
  endpoint: string,
  locale: Locale,
  gameMode: GameMode,
): Promise<TranslationDict> {
  const doc = await fetchTarkovJson<TranslationDoc>(`/${gameMode}/${endpoint}_${locale}`);
  return doc.data;
}

/**
 * Resolve a translatable field's raw base-file value to real text. Falls
 * back to the raw value itself (rather than throwing or returning empty) if
 * the dictionary has no entry — better a stray placeholder string shows up
 * for one unusual field than the whole page breaks.
 */
export function translate(dict: TranslationDict, raw: string | null | undefined): string {
  if (!raw) return '';
  // Trimmed because upstream ships padding: every `items_ko` value carries a
  // trailing space, which shows up as a gap before any punctuation or particle
  // a template puts after the name.
  return (dict[raw] ?? raw).trim();
}

// ---------------------------------------------------------------------------
// traders — fetched only as an id→name/image lookup for the tasks page.
// There is no dedicated traders page/UI; see CLAUDE.md > Traders (scope note)
// for why this endpoint was added to an originally items/tasks/maps-only scope.
// ---------------------------------------------------------------------------

interface RawTrader {
  id: string;
  name: string;
  imageLink: string | null;
  /** Store traders have multiple loyalty levels; service/quest-only
   * characters currently expose a single placeholder level. Confirmed
   * against both regular/pve barter trader ids. */
  levels?: unknown[];
  /** ISO timestamp of this trader's next stock refresh — confirmed present
   * on every trader in a live fetch. Used by the homepage's restock board. */
  resetTime: string | null;
}

/** `regular/traders`'s `data` is `{ [traderId]: RawTrader }` directly — no
 * nested `traders` key, unlike items/tasks/maps. Confirmed against live data. */
interface RawTradersDoc {
  data: Record<string, RawTrader>;
}

/** Id-keyed map of resolved trader names, for joining into tasks. */
export async function getTraders(
  locale: Locale,
  gameMode: GameMode = DEFAULT_GAME_MODE,
): Promise<Record<string, TaskTrader>> {
  const [doc, dict] = await Promise.all([
    fetchTarkovJson<RawTradersDoc>(`/${gameMode}/traders`),
    getTranslationDict('traders', locale, gameMode),
  ]);

  const traders: Record<string, TaskTrader> = {};
  for (const raw of Object.values(doc.data)) {
    traders[raw.id] = {
      id: raw.id,
      name: translate(dict, raw.name),
      imageLink: raw.imageLink,
      hasStore: (raw.levels?.length ?? 0) > 1,
      resetTime: raw.resetTime,
    };
  }
  return traders;
}

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

interface RawSellOffer {
  trader: string;
  priceRUB: number | null;
}

/** Only the fields getItems() actually maps into `Item` are typed here —
 * the raw item also has basePrice/width/height/gridImageLink/wikiLink/types/
 * plus many weapon/armor-only property blocks, all unused by this page.
 * `sellToTrader` is marked optional deliberately: it comes from an externally
 * regenerated dump (all 5055 items currently have it, but a future
 * regeneration could omit one). The `?` forces the `?? []` guard in
 * bestVendorSellRUB(), so one malformed record degrades that one field
 * instead of throwing and blanking the entire list. See CLAUDE.md >
 * "Defensive mapping". */
interface RawItem {
  id: string;
  name: string;
  shortName: string;
  width: number;
  height: number;
  types?: string[];
  avg24hPrice: number | null;
  low24hPrice?: number | null;
  high24hPrice: number | null;
  changeLast48hPercent: number | null;
  updated: string;
  iconLink: string | null;
  sellToTrader?: RawSellOffer[];
}

interface RawItemsDoc {
  data: { items: Record<string, RawItem> };
}

/** Highest vendor sell price in RUB across a raw item's sell offers, or null
 * if there are none (e.g. quest-only items). Computed server-side so the
 * client never receives the full offer array — see "items — client-side
 * search" in CLAUDE.md. */
function bestVendorSellRUB(offers: RawSellOffer[] | undefined): number | null {
  const prices = (offers ?? [])
    .map((offer) => offer.priceRUB)
    .filter((p): p is number => typeof p === 'number');
  return prices.length ? Math.max(...prices) : null;
}

export interface GetItemsParams {
  locale: Locale;
  gameMode?: GameMode;
}

/**
 * Fetch every item with flea-price signals, localized to the given locale.
 *
 * Returns the **full** catalog (~5000 items) — there is no server-side name
 * filter or result cap anymore. Search/filtering happens entirely
 * client-side (see `ItemsExplorer`), the same pattern as
 * `getTasks`/`TasksExplorer`. This is a deliberate architecture change made
 * during the Step-2 migration review, not the original design: the earlier
 * version read `?q=` server-side and re-fetched + re-parsed the full 15.8MB
 * `items` endpoint on *every* request — confirmed via response headers
 * (`Cache-Control: no-cache, no-store`, no `x-nextjs-cache`), because reading
 * `searchParams` makes a Next.js route fully dynamic, bypassing ISR
 * entirely, unlike `tasks`/`maps` which showed `x-nextjs-cache: HIT`.
 * Removing the server-side search lets this page be static/ISR like its
 * siblings — the 15.8MB parse now happens once per `REVALIDATE_SECONDS`
 * window instead of once per request. See CLAUDE.md > "items — client-side
 * search" for the measured payload-size trade-off this introduces (the full
 * trimmed `Item[]` ships to the client: ~1.5MB raw / ~245KB gzipped,
 * measured against real data — see `Item`'s trimmed field set in
 * types/tarkov.ts).
 */
export async function getItems({
  locale,
  gameMode = DEFAULT_GAME_MODE,
}: GetItemsParams): Promise<Item[]> {
  const [doc, dict] = await Promise.all([
    fetchTarkovJson<RawItemsDoc>(`/${gameMode}/items`),
    getTranslationDict('items', locale, gameMode),
  ]);

  return Object.values(doc.data.items).map(
    (raw): Item => ({
      id: raw.id,
      name: translate(dict, raw.name),
      shortName: translate(dict, raw.shortName),
      width: Math.max(1, raw.width || 1),
      height: Math.max(1, raw.height || 1),
      types: raw.types ?? [],
      avg24hPrice: raw.avg24hPrice,
      low24hPrice: raw.low24hPrice ?? null,
      high24hPrice: raw.high24hPrice,
      changeLast48hPercent: raw.changeLast48hPercent,
      updated: raw.updated,
      iconLink: raw.iconLink,
      bestVendorSellRUB: bestVendorSellRUB(raw.sellToTrader),
    }),
  );
}

// ---------------------------------------------------------------------------
// maps
// ---------------------------------------------------------------------------

interface RawBossSpawn {
  spawnChance: number | null;
  /** Key into `data.mobs`, e.g. "bossTagilla". Also happens to equal that
   * mob's own translation key, confirmed against live data. */
  mob: string | null;
}

interface RawMob {
  id: string;
  name: string;
  /** Boss portrait art — confirmed present on boss-type mobs in a live fetch.
   * Used by the homepage's boss spawn board. */
  imagePortraitLink: string | null;
}

interface RawMapEntry {
  id: string;
  name: string;
  description: string | null;
  wiki: string | null;
  players: string | null;
  raidDuration: number | null;
  /** Optional for the same defensive reason as RawItem's arrays — guarded at
   * the dedupeBosses call site. */
  bosses?: RawBossSpawn[];
}

interface RawMapsDoc {
  data: {
    maps: Record<string, RawMapEntry>;
    mobs: Record<string, RawMob>;
  };
}

/** Dedupe a map's boss spawn list by mob id, keeping the highest spawnChance
 * seen (the raw data lists one entry per spawn location/condition, so the
 * same boss can appear many times with different chances — e.g. Lighthouse's
 * ExUsec appears 6 times). Sorted by chance, descending. A deliberate
 * simplification for a readable guide UI — see CLAUDE.md > Maps page. */
function dedupeBosses(
  raw: RawBossSpawn[],
  mobs: Record<string, RawMob>,
  dict: TranslationDict,
  locale: Locale,
): MapBossSpawn[] {
  const bestChanceByMob = new Map<string, number>();
  for (const spawn of raw) {
    if (!spawn.mob) continue;
    const current = bestChanceByMob.get(spawn.mob) ?? 0;
    bestChanceByMob.set(spawn.mob, Math.max(current, spawn.spawnChance ?? 0));
  }

  return Array.from(bestChanceByMob, ([mobId, spawnChance]) => ({
    spawnChance,
    boss: {
      id: mobId,
      name: localizeMobName(mobId, translate(dict, mobs?.[mobId]?.name ?? mobId), locale),
      imageLink: mobs?.[mobId]?.imagePortraitLink ?? null,
    },
  })).sort((a, b) => (b.spawnChance ?? 0) - (a.spawnChance ?? 0));
}

export interface GetMapsParams {
  locale: Locale;
  gameMode?: GameMode;
}

/** Fetch all raid maps, localized to the given locale. */
export async function getMaps({
  locale,
  gameMode = DEFAULT_GAME_MODE,
}: GetMapsParams): Promise<GameMap[]> {
  const [doc, dict] = await Promise.all([
    fetchTarkovJson<RawMapsDoc>(`/${gameMode}/maps`),
    getTranslationDict('maps', locale, gameMode),
  ]);

  return Object.values(doc.data.maps).map(
    (raw): GameMap => ({
      id: raw.id,
      name: translate(dict, raw.name),
      description: raw.description ? translate(dict, raw.description) : null,
      wiki: raw.wiki,
      players: raw.players,
      raidDuration: raw.raidDuration,
      bosses: dedupeBosses(raw.bosses ?? [], doc.data.mobs, dict, locale),
    }),
  );
}

/**
 * Lightweight id→translated-name index over the `maps` endpoint, used by
 * {@link getTasks} to resolve a task's target map. This fetches the same
 * ~9.5MB `maps` response the maps page uses (Next's fetch Data Cache dedupes
 * the network request across routes within the revalidate window; the
 * JSON.parse cost is still paid per call — see CLAUDE.md for the trade-off).
 */
async function getMapNameIndex(
  locale: Locale,
  gameMode: GameMode,
): Promise<Record<string, string>> {
  const [doc, dict] = await Promise.all([
    fetchTarkovJson<RawMapsDoc>(`/${gameMode}/maps`),
    getTranslationDict('maps', locale, gameMode),
  ]);

  const index: Record<string, string> = {};
  for (const raw of Object.values(doc.data.maps)) {
    index[raw.id] = translate(dict, raw.name);
  }
  return index;
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

interface RawObjective {
  id: string;
  description: string;
  type: string;
  optional: boolean;
  count?: number | null;
  items?: string[];
}

interface RawTask {
  id: string;
  name: string;
  /** Trader id — a plain string, not a nested object. Resolved via getTraders(). */
  trader: string | null;
  /** Target map id, or null for map-agnostic (e.g. hideout) tasks. */
  map: string | null;
  minPlayerLevel: number | null;
  wikiLink: string | null;
  kappaRequired: boolean | null;
  experience?: number | null;
  taskImageLink?: string | null;
  taskRequirements?: Array<{
    task: string;
    status?: string[];
  }>;
  /** Optional for the same defensive reason as RawItem's arrays — guarded below. */
  objectives?: RawObjective[];
}

interface RawTasksDoc {
  data: { tasks: Record<string, RawTask> };
}

export interface GetTasksParams {
  locale: Locale;
  gameMode?: GameMode;
}

/**
 * Fetch the full quest list, localized to the given locale, with trader and
 * map names resolved (both are id-only references in the raw data).
 */
export async function getTasks({
  locale,
  gameMode = DEFAULT_GAME_MODE,
}: GetTasksParams): Promise<Task[]> {
  const [doc, dict, traders, mapNames, englishDict] = await Promise.all([
    fetchTarkovJson<RawTasksDoc>(`/${gameMode}/tasks`),
    getTranslationDict('tasks', locale, gameMode),
    getTraders(locale, gameMode),
    getMapNameIndex(locale, gameMode),
    // The English name is shown in parentheses after the localized one so a
    // quest stays findable by the name English guides/videos use. On `en` the
    // localized name already *is* the English one, so skip the extra fetch.
    locale === 'en' ? null : getTranslationDict('tasks', 'en', gameMode),
  ]);

  const rawTasks = Object.values(doc.data.tasks);
  /** Localized name + English name, per task id — prerequisites are id-only
   * references, so both have to be resolvable by id for the requirement list. */
  const taskNames = new Map(
    rawTasks.map((raw) => [
      raw.id,
      {
        name: localizeTaskText(translate(dict, raw.name), locale),
        nameEn: englishDict ? translate(englishDict, raw.name) : null,
      },
    ]),
  );

  return rawTasks.map((raw): Task => {
    const trader = raw.trader ? traders[raw.trader] ?? null : null;
    const map =
      raw.map && mapNames[raw.map] ? { id: raw.map, name: mapNames[raw.map] } : null;
    const names = taskNames.get(raw.id);

    return {
      id: raw.id,
      name: names?.name ?? translate(dict, raw.name),
      // Suppressed when it would just repeat the localized name — either
      // because we're on `en`, or because upstream's own ko/zh entry is
      // already the untranslated English string.
      nameEn: names?.nameEn && names.nameEn !== names.name ? names.nameEn : null,
      trader,
      map,
      minPlayerLevel: raw.minPlayerLevel,
      kappaRequired: raw.kappaRequired,
      experience: raw.experience ?? null,
      taskImageLink: raw.taskImageLink ?? null,
      requirements: (raw.taskRequirements ?? []).map((requirement) => {
        const prerequisite = taskNames.get(requirement.task);
        return {
          taskId: requirement.task,
          taskName: prerequisite?.name ?? requirement.task,
          taskNameEn:
            prerequisite?.nameEn && prerequisite.nameEn !== prerequisite.name
              ? prerequisite.nameEn
              : null,
          statuses: requirement.status ?? [],
        };
      }),
      objectives: (raw.objectives ?? []).map((o) => ({
        id: o.id,
        type: o.type,
        description: localizeTaskText(translate(dict, o.description), locale),
        optional: o.optional,
        count: o.count ?? null,
      })),
    };
  });
}
