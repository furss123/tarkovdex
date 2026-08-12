import 'server-only';
import type { GameMap, GameMode, MapBossSpawn } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import { localizeMobName } from '@/lib/game-localization';

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
const REQUEST_TIMEOUT_MS = 15_000;

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
const RETRY_AFTER_ERROR_SECONDS = 60;
const STRUCTURAL_STALE_IF_ERROR_SECONDS = 24 * 60 * 60;
const PRICE_STALE_IF_ERROR_SECONDS = 2 * 60 * 60;

function cacheSecondsForPath(path: string): number {
  return /\/(?:items(?:_|$)|barters$|crafts$)/.test(path)
    ? PRICE_REVALIDATE_SECONDS
    : REVALIDATE_SECONDS;
}

function staleIfErrorSecondsForPath(path: string): number {
  return /\/(?:items(?:_|$)|barters$|crafts$)/.test(path)
    ? PRICE_STALE_IF_ERROR_SECONDS
    : STRUCTURAL_STALE_IF_ERROR_SECONDS;
}

type MemoryCacheEntry = {
  expiresAt: number;
  staleUntil: number;
  value: Promise<unknown>;
};

/**
 * Next's built-in Data Cache rejects individual entries larger than 2 MB,
 * while the static Tarkov dumps are 3-21 MB. Keep one parsed promise per
 * runtime instance instead. Route responses still receive CDN cache headers;
 * this layer prevents a new upstream download for every distinct search.
 */
const memoryCache = new Map<string, MemoryCacheEntry>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Minimal endpoint-aware shape gate before a response can replace a known
 * good cache entry. Field-level normalization remains with each mapper, but a
 * 200 response containing an error object or a missing collection is not a
 * valid empty Tarkov document. */
function validateTarkovDocument(path: string, value: unknown): unknown {
  if (!isRecord(value) || !Object.hasOwn(value, 'data')) {
    throw new Error(`json.tarkov.dev returned an invalid document for ${path}`);
  }

  const data = value.data;
  const endpoint = path.split('/').filter(Boolean).at(-1) ?? '';
  const translation = /_(?:ko|en|zh)$/.test(endpoint);
  let valid = false;

  if (translation || endpoint === 'traders' || endpoint === 'hideout') {
    valid = isRecord(data);
  } else if (endpoint === 'items') {
    valid = isRecord(data) && isRecord(data.items);
  } else if (endpoint === 'maps') {
    valid = isRecord(data) && isRecord(data.maps) && isRecord(data.mobs);
  } else if (endpoint === 'tasks') {
    valid = isRecord(data) && isRecord(data.tasks);
  } else if (endpoint === 'crafts' || endpoint === 'barters') {
    valid = Array.isArray(data);
  } else {
    // Test/forward-compatible endpoints still need an explicit, non-null data
    // payload even when this client has no more specific schema for them.
    valid = data !== null && data !== undefined;
  }

  if (!valid) {
    throw new Error(`json.tarkov.dev returned an invalid data shape for ${path}`);
  }
  return value;
}

export async function fetchTarkovJson<T>(path: string): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.value as Promise<T>;
  }

  const stale = cached && cached.staleUntil > now ? cached : null;

  const request = fetch(`${BASE_URL}${path}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).then(
    async (res) => {
      if (!res.ok) {
        throw new Error(
          `json.tarkov.dev responded ${res.status} ${res.statusText} for ${path}`,
        );
      }
      const parsed: unknown = await res.json();
      return validateTarkovDocument(path, parsed) as T;
    },
  );
  // On failure, a previously good document is served for a grace window
  // rather than collapsing the board — the caller still sees the content
  // timestamp, so a dated answer is never mistaken for a current one.
  const value: Promise<T> = request.catch((error: unknown) => {
    if (stale) {
      memoryCache.set(path, {
        ...stale,
        expiresAt: now + RETRY_AFTER_ERROR_SECONDS * 1000,
      });
      return stale.value as Promise<T>;
    }
    if (memoryCache.get(path)?.value === value) memoryCache.delete(path);
    throw error;
  });
  const replacement: MemoryCacheEntry = {
    expiresAt: now + cacheSecondsForPath(path) * 1000,
    staleUntil: now + staleIfErrorSecondsForPath(path) * 1000,
    value,
  };
  memoryCache.set(path, replacement);
  return value as Promise<T>;
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
export function dedupeBosses(
  raw: RawBossSpawn[],
  mobs: Record<string, RawMob>,
  dict: TranslationDict,
  locale: Locale,
): MapBossSpawn[] {
  const bestChanceByMob = new Map<string, number | null>();
  for (const spawn of raw) {
    if (!spawn.mob) continue;
    const mobId = mobs?.[spawn.mob]?.id || spawn.mob;
    const chance =
      typeof spawn.spawnChance === 'number' &&
      Number.isFinite(spawn.spawnChance) &&
      spawn.spawnChance >= 0 &&
      spawn.spawnChance <= 1
        ? spawn.spawnChance
        : null;
    const current = bestChanceByMob.get(mobId);
    if (current === undefined || (chance !== null && (current === null || chance > current))) {
      bestChanceByMob.set(mobId, chance);
    }
  }

  // A few upstream role ids intentionally share one display name (Terminal's
  // vsRF/vsRFSniper both translate to "AF"). Rendering those as separate
  // bosses is indistinguishable duplication, so collapse the normalized
  // display name after the stable-id pass as well.
  const byDisplayName = new Map<string, MapBossSpawn>();
  for (const [mobId, spawnChance] of bestChanceByMob) {
    const mob = mobs?.[mobId];
    const translated = translate(dict, mob?.name ?? mobId) || mobId;
    const name = localizeMobName(mobId, translated, locale) || mobId;
    const candidate: MapBossSpawn = {
      spawnChance,
      boss: {
        id: mobId,
        name,
        imageLink: mob?.imagePortraitLink ?? null,
      },
    };
    const key = name.trim().toLocaleLowerCase(locale);
    const current = byDisplayName.get(key);
    const currentChance = current?.spawnChance;
    if (
      !current ||
      (spawnChance !== null && (currentChance == null || spawnChance > currentChance)) ||
      (spawnChance === currentChance && mobId < (current.boss?.id ?? ''))
    ) {
      byDisplayName.set(key, candidate);
    }
  }

  return [...byDisplayName.values()].sort((a, b) => {
    if (a.spawnChance === null && b.spawnChance !== null) return 1;
    if (a.spawnChance !== null && b.spawnChance === null) return -1;
    return (
      (b.spawnChance ?? 0) - (a.spawnChance ?? 0) ||
      (a.boss?.name ?? '').localeCompare(b.boss?.name ?? '', locale) ||
      (a.boss?.id ?? '').localeCompare(b.boss?.id ?? '')
    );
  });
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
      players: raw.players,
      raidDuration: raw.raidDuration,
      bosses: dedupeBosses(raw.bosses ?? [], doc.data.mobs, dict, locale),
    }),
  );
}
