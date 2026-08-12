import 'server-only';
import type { Locale } from '@/i18n/routing';
import type { GameMode } from '@/types/tarkov';
import type { DashboardData, DashboardModeData } from '@/types/dashboard';
import { getMaps } from '@/lib/tarkov';
import { getEconomyDataset } from '@/lib/tarkov-tools';
import {
  partitionCraftLeadersByFreshness,
  selectBestCraftsByStation,
} from '@/lib/tool-calculations';

/**
 * Assembles the whole dashboard payload: hideout craft leaders and boss spawn
 * rates, for both game modes, in one place.
 *
 * This is the single producer for both delivery paths — the server-rendered
 * first paint and `/api/dashboard`'s polled refresh — so a value can never
 * mean one thing on load and another after an update.
 *
 * Cost note: the underlying documents are large (the maps dump is ~9.5MB per
 * mode), but `fetchTarkovJson` holds a parsed per-runtime promise cache —
 * 15 minutes for price-backed documents, 6 hours for structural ones. A poll
 * arriving inside those windows therefore costs a Map lookup and this
 * projection, not an upstream download.
 */

/** Popular mainline maps, in the order the board renders them. Stable ids
 * rather than localized names or live spawn rates, so ko/en and PvP/PvE all
 * produce the same sequence. */
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

async function buildMode(
  locale: Locale,
  gameMode: GameMode,
  now: number,
): Promise<DashboardModeData> {
  const [economy, maps] = await Promise.all([
    optional(getEconomyDataset(locale, gameMode)),
    optional(getMaps({ locale, gameMode })),
  ]);

  const crafts = economy
    ? partitionCraftLeadersByFreshness(
        selectBestCraftsByStation(economy.crafts),
        now,
      )
    : null;

  const bosses = maps
    ? maps
        .filter((map) => POPULAR_MAP_RANK.has(map.id))
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
        .sort(
          (a, b) =>
            (POPULAR_MAP_RANK.get(a.id) ?? Number.POSITIVE_INFINITY) -
            (POPULAR_MAP_RANK.get(b.id) ?? Number.POSITIVE_INFINITY),
        )
    : null;

  return {
    gameMode,
    crafts,
    bosses,
    priceUpdatedAt: crafts
      ? oldestPriceStamp(
          [...crafts.current, ...crafts.stale].map(
            (leader) => leader.priceUpdatedAt,
          ),
        )
      : null,
  };
}

export async function getDashboardData(locale: Locale): Promise<DashboardData> {
  // One instant for every freshness decision in this payload, so the craft
  // split and the age label cannot disagree about "now".
  const now = Date.now();
  const [regular, pve] = await Promise.all([
    buildMode(locale, 'regular', now),
    buildMode(locale, 'pve', now),
  ]);
  return { regular, pve, generatedAt: new Date(now).toISOString() };
}
