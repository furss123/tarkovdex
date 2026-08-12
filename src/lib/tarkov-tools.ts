import 'server-only';
import type { Locale } from '@/i18n/routing';
import {
  fetchTarkovJson,
  getTranslationDict,
  getTraders,
  modePath,
  translate,
} from '@/lib/tarkov';
import { localizeTaskText } from '@/lib/game-localization';
import gunsmithBuildsJson from '@/lib/gunsmith-builds.json';
import {
  finiteNonNegative,
  finitePositive,
  isReturnedCraftTool,
} from './tool-calculations';
import type { GameMode } from '@/types/tarkov';
import type {
  CraftPartAttributes,
  CraftDeal,
  EconomyDataset,
  GunsmithCondition,
  GunsmithTask,
  ToolItem,
} from '@/types/tools';

/**
 * Hideout craft and Gunsmith dataset builders.
 *
 * Scope note: this module also used to assemble the combat (ammo/armor)
 * dataset. That route is gone, so the raw shapes below are narrowed to the
 * fields the craft ranking and the Gunsmith guide actually read.
 */

type RawOffer = {
  priceRUB?: number | null;
};

/** Only the slot's display name is read here: it is a dictionary key like any
 * other translatable field, but it appears solely nested inside item
 * documents, so `slotNameIndex` collects them in one pass. */
type RawSlot = {
  name?: string;
};

type RawItem = {
  id: string;
  name: string;
  shortName: string;
  iconLink?: string | null;
  updated?: string | null;
  types?: string[];
  categories?: string[];
  avg24hPrice?: number | null;
  buyFromTrader?: RawOffer[];
  sellToTrader?: RawOffer[];
  properties?: {
    slots?: RawSlot[];
  };
};

type RawTask = {
  id: string;
  name: string;
  trader?: string | null;
  minPlayerLevel?: number | null;
};
type RawTasksDoc = { data?: { tasks?: Record<string, RawTask> } };

/** One solved build, exactly as `scripts/generate-gunsmith-builds.mjs` writes
 * it. Ids only — nothing localized is baked into the snapshot, so a new
 * language costs no regeneration. */
type GunsmithBuildSnapshot = {
  weapon: string;
  parts: Array<{
    id: string;
    parent: string | null;
    slot: string;
    required: boolean;
  }>;
  stats: Record<string, number>;
  conditions: Array<{ key: string; value: number; compareMethod: string }>;
};

const gunsmithBuilds = gunsmithBuildsJson as Record<
  string,
  Record<string, GunsmithBuildSnapshot>
>;

type RawItemsDoc = { data?: { items?: Record<string, RawItem> } };
type RawPart = {
  item?: string;
  count?: number;
  attributes?: CraftPartAttributes;
};
type RawCraft = {
  id?: string;
  requiredItems?: RawPart[];
  requiredQuestItems?: RawPart[];
  station?: string;
  duration?: number;
  level?: number;
  productItem?: RawPart;
  active?: boolean;
  available?: boolean;
};
type RawArrayDoc<T> = { data?: T[] };
type RawHideoutDoc = {
  data?: Record<string, {
    id?: string;
    name?: string;
    imageLink?: string | null;
  }>;
};
const DEFAULT_MODE: GameMode = 'regular';
function minPrice(offers: RawOffer[] | undefined): number | null {
  const values = (offers ?? [])
    .map((offer) => finitePositive(offer.priceRUB))
    .filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}

function maxPrice(offers: RawOffer[] | undefined): number | null {
  const values = (offers ?? [])
    .map((offer) => finitePositive(offer.priceRUB))
    .filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

function itemIndex(
  items: Record<string, RawItem>,
  dict: Record<string, string>,
): Map<string, ToolItem> {
  return new Map(
    Object.values(items).map((raw) => [
      raw.id,
      {
        id: raw.id,
        name: translate(dict, raw.name),
        shortName: translate(dict, raw.shortName),
        iconLink: raw.iconLink ?? null,
        types: raw.types ?? [],
        categories: raw.categories ?? [],
        price: {
          flea: finitePositive(raw.avg24hPrice),
          traderBuy: minPrice(raw.buyFromTrader),
          traderSell: maxPrice(raw.sellToTrader),
          updated:
            typeof raw.updated === 'string' && Number.isFinite(Date.parse(raw.updated))
              ? raw.updated
              : null,
        },
      } satisfies ToolItem,
    ]),
  );
}

function validPart(
  raw: RawPart | undefined,
  items: Map<string, ToolItem>,
  missingCount: number | null = null,
): { item: ToolItem; count: number; tool?: boolean } | null {
  if (!raw?.item) return null;
  const item = items.get(raw.item);
  const count = raw.count === undefined ? missingCount : finitePositive(raw.count);
  if (!item || count === null) return null;
  return { item, count, ...(isReturnedCraftTool(raw.attributes) ? { tool: true } : {}) };
}

function latestUpdated(items: Iterable<ToolItem>): string | null {
  let latest = 0;
  let value: string | null = null;
  for (const item of items) {
    const time = item.price.updated ? Date.parse(item.price.updated) : Number.NaN;
    if (Number.isFinite(time) && time > latest) {
      latest = time;
      value = item.price.updated;
    }
  }
  return value;
}

/**
 * The item catalog with prices resolved. Traders were dropped from this fetch
 * along with the trader-restock widget: the craft ranking prices inputs and
 * outputs from `buyFromTrader`/`sellToTrader` offers already embedded in the
 * items document, so the separate traders request was pure latency.
 */
async function fetchCore(locale: Locale, gameMode: GameMode) {
  const [itemsDoc, itemDict] = await Promise.all([
    fetchTarkovJson<RawItemsDoc>(`/${modePath(gameMode)}/items`),
    getTranslationDict('items', locale, gameMode),
  ]);
  const rawItems = itemsDoc.data?.items ?? {};
  return { rawItems, itemDict, items: itemIndex(rawItems, itemDict) };
}

/**
 * Slot names ("MOD_PISTOL_GRIP") are dictionary keys like any other
 * translatable field, but they only ever appear nested inside item documents —
 * so they are collected once here rather than looked up per part.
 */
function slotNameIndex(
  rawItems: Record<string, RawItem>,
  itemDict: Record<string, string>,
): Map<string, string> {
  const index = new Map<string, string>();
  for (const item of Object.values(rawItems)) {
    for (const slot of item.properties?.slots ?? []) {
      if (slot.name && !index.has(slot.name)) {
        index.set(slot.name, translate(itemDict, slot.name));
      }
    }
  }
  return index;
}

/**
 * Gunsmith guides are read from `src/lib/gunsmith-builds.json`, a complete
 * verified build per quest generated offline by
 * `scripts/generate-gunsmith-builds.mjs` (see that file for the stat model and
 * for why the solver does not run at request time). Everything resolved here
 * is presentation: ids to localized names and icons, plus the quest's own
 * trader and level gate, which come from the live tasks document rather than
 * the snapshot so they stay current between regenerations.
 *
 * A game mode with no snapshot — the seasonal wipe, until the solver has been
 * re-run against it — yields an empty list, and the page says so. It does not
 * fall through to another mode's builds: the parts a seasonal quest demands
 * are not guaranteed to be the parts the PvP quest demands.
 */
export async function getGunsmithTasks(
  locale: Locale,
  gameMode: GameMode = DEFAULT_MODE,
): Promise<GunsmithTask[]> {
  const builds = gunsmithBuilds[gameMode] ?? {};
  if (Object.keys(builds).length === 0) return [];

  const [{ rawItems, itemDict, items }, tasksDoc, taskDict, taskDictEn, traders] =
    await Promise.all([
      fetchCore(locale, gameMode),
      fetchTarkovJson<RawTasksDoc>(`/${modePath(gameMode)}/tasks`),
      getTranslationDict('tasks', locale, gameMode),
      getTranslationDict('tasks', 'en', gameMode),
      getTraders(locale, gameMode),
    ]);
  const slotNames = slotNameIndex(rawItems, itemDict);

  const result: GunsmithTask[] = [];
  for (const task of Object.values(tasksDoc.data?.tasks ?? {})) {
    const build = builds[task.id];
    const weapon = build ? items.get(build.weapon) : undefined;
    if (!build || !weapon) continue;

    const name = localizeTaskText(translate(taskDict, task.name), locale);
    const nameEn = translate(taskDictEn, task.name);
    const conditions: GunsmithCondition[] = build.conditions.map((condition) => {
      const actual = build.stats[condition.key] ?? 0;
      return {
        ...condition,
        actual,
        satisfied:
          condition.compareMethod === '<='
            ? actual <= condition.value
            : actual >= condition.value,
      };
    });

    result.push({
      id: task.id,
      name,
      nameEn: nameEn === name ? null : nameEn,
      part:
        Number.parseInt(
          nameEn.match(/^Gunsmith - Part (\d+)$/)?.[1] ?? '',
          10,
        ) || null,
      trader: task.trader ? (traders[task.trader]?.name ?? null) : null,
      minPlayerLevel: task.minPlayerLevel ?? null,
      weapon,
      build: build.parts.flatMap((part) => {
        const item = items.get(part.id);
        if (!item) return [];
        return [
          {
            item,
            slot: slotNames.get(part.slot) ?? part.slot,
            parent: part.parent ? (items.get(part.parent) ?? null) : null,
            required: part.required,
          },
        ];
      }),
      conditions,
      verified: conditions.every((condition) => condition.satisfied),
    });
  }

  // "Part 1 … Part 25" first in order, then the named one-offs.
  return result.sort((a, b) => {
    if (a.part !== null && b.part !== null) return a.part - b.part;
    if (a.part !== null) return -1;
    if (b.part !== null) return 1;
    return a.name.localeCompare(b.name, locale);
  });
}

export async function getEconomyDataset(
  locale: Locale,
  gameMode: GameMode = DEFAULT_MODE,
): Promise<EconomyDataset> {
  const [{ items }, craftDoc, hideout, hideoutDict] =
    await Promise.all([
      fetchCore(locale, gameMode),
      fetchTarkovJson<RawArrayDoc<RawCraft>>(`/${modePath(gameMode)}/crafts`),
      fetchTarkovJson<RawHideoutDoc>(`/${modePath(gameMode)}/hideout`),
      getTranslationDict('hideout', locale, gameMode),
    ]);
  const stations = new Map(
    Object.values(hideout.data ?? {}).map((station) => [
      station.id ?? '',
      {
        name: translate(hideoutDict, station.name),
        imageLink: station.imageLink ?? null,
      },
    ]),
  );
  const crafts: CraftDeal[] = [];
  for (const raw of Array.isArray(craftDoc.data) ? craftDoc.data : []) {
    const productItem = validPart(raw.productItem, items);
    if (!raw.id || !raw.station || !productItem) continue;
    const level = finiteNonNegative(raw.level);
    const duration = finitePositive(raw.duration);
    if (level === null || duration === null) continue;
    const requiredItems = (raw.requiredItems ?? [])
      .map((part) => validPart(part, items));
    // Quest-item gates omit count in the current document. They are not
    // consumed or priced; a default cardinality of one preserves the gate for
    // display without fabricating a material cost.
    const requiredQuestItems = (raw.requiredQuestItems ?? [])
      .map((part) => validPart(part, items, 1));
    const unresolvedQuestRequirements = (raw.requiredQuestItems ?? [])
      .filter((_part, index) => requiredQuestItems[index] === null)
      .map((part) => part.item)
      .filter((id): id is string => typeof id === 'string' && id !== '');
    // Dropping one malformed input would silently understate the cost. Skip
    // the whole recipe instead and let the remaining valid crafts compete.
    // An unresolved quest gate is different: it has no material cost, so keep
    // the recipe with an explicit issue that disqualifies its profit ranking.
    if (requiredItems.some((part) => part === null)) continue;
    const station = stations.get(raw.station);
    crafts.push({
      id: raw.id,
      station: {
        id: raw.station,
        name: station?.name ?? raw.station,
        imageLink: station?.imageLink ?? null,
      },
      level,
      duration,
      requiredItems: requiredItems.filter(
        (part): part is NonNullable<typeof part> => part !== null,
      ),
      requiredQuestItems: requiredQuestItems.filter(
        (part): part is NonNullable<typeof part> => part !== null,
      ),
      unresolvedQuestRequirements,
      productItem,
      productItems: [productItem],
      active: raw.active !== false && raw.available !== false,
      updated: productItem.item.price.updated,
    });
  }
  return {
    crafts,
    gameMode,
    generatedAt: new Date().toISOString(),
    sourceUpdatedAt: latestUpdated(items.values()),
  };
}
