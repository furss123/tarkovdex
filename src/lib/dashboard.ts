import 'server-only';
import type { Locale } from '@/i18n/routing';
import { GAME_MODES, type GameMode } from '@/types/tarkov';
import type {
  BoardData,
  BoardModeData,
  BoardView,
  BoardBossMap,
  CraftLeaderGroups,
} from '@/types/dashboard';
import { getMaps } from '@/lib/tarkov';
import { getEconomyDataset } from '@/lib/tarkov-tools';
import {
  partitionCraftLeadersByFreshness,
  selectBestCraftsByStation,
} from '@/lib/tool-calculations';

/**
 * Assembles every board's payload — hideout craft leaders and boss spawn
 * rates, for all three game modes — in one place.
 *
 * This is the single producer for both delivery paths (the server-rendered
 * first paint and `/api/board`'s polled refresh) and for all three views, so a
 * value can never mean one thing on the home summary and another on the full
 * page.
 *
 * Cost note: the underlying documents are large (the maps dump is ~9.5MB per
 * mode), but `fetchTarkovJson` holds a parsed per-runtime promise cache —
 * 15 minutes for price-backed documents, 6 hours for structural ones. A poll
 * arriving inside those windows therefore costs a Map lookup and this
 * projection, not an upstream download. The seasonal mode adds a third set of
 * requests; when upstream has no document for it those fail immediately and
 * cost nothing but a round trip.
 */

/** Popular mainline maps, in the order the boards render them. Stable ids
 * rather than localized names or live spawn rates, so ko/en and every game
 * mode produce the same sequence. Maps outside this list still appear on the
 * dedicated boss page — they sort after these. */
const POPULAR_MAP_IDS = [
  '56f40101d2720b2a4d8b45d6', // Customs
  '5714dc692459777137212e12', // Streets of Tarkov
  '5714dbc024597771384a510d', // Interchange
  '5704e5fad2720bc05b8b4567', // Reserve
  '5704e3c2d2720bac5b8b4567', // Woods
  '5704e554d2720bac5b8b456e', // Shoreline
  '55f2d3fd4bdc2d5f408b4567', // Factory
  '653e6760052c01c1c805532f', // Ground Zero
  '5704e4dad2720bb55b8b4567', // Lighthouse
] as const;

const POPULAR_MAP_RANK = new Map<string, number>(
  POPULAR_MAP_IDS.map((id, index) => [id, index]),
);

/** How many maps and crafts the home summary shows before handing off to the
 * dedicated page. Measured on the previous single-page build: all 17 maps ran
 * to 2944px on a 375px phone for one section, which is why the summary is
 * capped and the full list lives on its own route. */
const HOME_MAP_LIMIT = 9;
const HOME_CRAFT_LIMIT = 6;

/**
 * json.tarkov.dev's `maps.bosses` array also carries PMC, Raider, Rogue and
 * stationary-weapon spawn roles. BSG's own role ids reserve the `boss*` prefix
 * for actual bosses, so use that upstream classification rather than
 * maintaining a brittle name exclusion list.
 */
const ACTUAL_BOSS_ROLE = /^boss/i;

async function optional<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch {
    return null;
  }
}

/** Oldest contributing price stamp across the ranked crafts — the honest
 * "how current is this" figure, and null when any contributor is unstamped. */
function oldestPriceStamp(isos: Array<string | null>): string | null {
  let oldest: { iso: string; time: number } | null = null;
  for (const iso of isos) {
    if (!iso) continue;
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) continue;
    if (!oldest || time < oldest.time) oldest = { iso, time };
  }
  return oldest?.iso ?? null;
}

function mapRank(id: string): number {
  return POPULAR_MAP_RANK.get(id) ?? Number.POSITIVE_INFINITY;
}

async function buildCrafts(
  locale: Locale,
  gameMode: GameMode,
  now: number,
  view: BoardView,
): Promise<CraftLeaderGroups | null> {
  const economy = await optional(getEconomyDataset(locale, gameMode));
  if (!economy) return null;

  const groups = partitionCraftLeadersByFreshness(
    selectBestCraftsByStation(economy.crafts),
    now,
  );

  if (view !== 'home') return groups;

  // The home summary answers "what is worth starting right now", so it ranks
  // by profit and truncates. The full per-station board — including the dated
  // reference group — is the hideout page's job, which is why the stale group
  // is dropped here rather than truncated alongside: a summary that shows two
  // dated rows and hides five is more misleading than one that shows none and
  // links out.
  return {
    current: [...groups.current]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, HOME_CRAFT_LIMIT),
    stale: [],
  };
}

async function buildBosses(
  locale: Locale,
  gameMode: GameMode,
  view: BoardView,
): Promise<BoardBossMap[] | null> {
  const maps = await optional(getMaps({ locale, gameMode }));
  if (!maps) return null;

  const projected = maps
    .map((map) => ({
      id: map.id,
      name: map.name,
      bosses: map.bosses.filter(
        (spawn) =>
          spawn.boss !== null &&
          ACTUAL_BOSS_ROLE.test(spawn.boss.id) &&
          typeof spawn.spawnChance === 'number' &&
          Number.isFinite(spawn.spawnChance) &&
          spawn.spawnChance > 0,
      ),
    }))
    .filter((map) => map.bosses.length > 0)
    // Popular maps first in their curated order; everything else after, by
    // highest spawn chance and then name, so the tail is deterministic across
    // locales and modes rather than following upstream's object order.
    .sort(
      (a, b) =>
        mapRank(a.id) - mapRank(b.id) ||
        (b.bosses[0]?.spawnChance ?? 0) - (a.bosses[0]?.spawnChance ?? 0) ||
        a.name.localeCompare(b.name, locale),
    );

  return view === 'home' ? projected.slice(0, HOME_MAP_LIMIT) : projected;
}

async function buildMode(
  locale: Locale,
  gameMode: GameMode,
  now: number,
  view: BoardView,
): Promise<BoardModeData> {
  const wantsCrafts = view === 'home' || view === 'hideout';
  const wantsBosses = view === 'home' || view === 'bosses';

  const [crafts, bosses] = await Promise.all([
    wantsCrafts ? buildCrafts(locale, gameMode, now, view) : undefined,
    wantsBosses ? buildBosses(locale, gameMode, view) : undefined,
  ]);

  return {
    gameMode,
    ...(wantsCrafts ? { crafts } : {}),
    ...(wantsBosses ? { bosses } : {}),
    priceUpdatedAt: crafts
      ? oldestPriceStamp(
          [...crafts.current, ...crafts.stale].map(
            (leader) => leader.priceUpdatedAt,
          ),
        )
      : null,
  };
}

export async function getBoardData(
  locale: Locale,
  view: BoardView,
): Promise<BoardData> {
  // One instant for every freshness decision in this payload, so the craft
  // split and the age label cannot disagree about "now".
  const now = Date.now();
  const built = await Promise.all(
    GAME_MODES.map((gameMode) => buildMode(locale, gameMode, now, view)),
  );

  return {
    view,
    modes: Object.fromEntries(
      GAME_MODES.map((gameMode, index) => [gameMode, built[index]]),
    ) as Record<GameMode, BoardModeData>,
    generatedAt: new Date(now).toISOString(),
  };
}
