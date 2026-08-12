import 'server-only';
import type { Locale } from '@/i18n/routing';
import {
  fetchTarkovJson,
  getTranslationDict,
  translate,
} from '@/lib/tarkov';
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
  ToolItem,
} from '@/types/tools';

/**
 * Hideout craft dataset builder.
 *
 * Scope note (single-page redesign): this module used to also assemble the
 * gunsmith and combat datasets for their own routes. Those routes are gone,
 * so only the craft path remains — the raw shapes below are deliberately
 * narrowed to the fields the craft profit ranking actually reads.
 */

type RawOffer = {
  priceRUB?: number | null;
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
};

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
    fetchTarkovJson<RawItemsDoc>(`/${gameMode}/items`),
    getTranslationDict('items', locale, gameMode),
  ]);
  const rawItems = itemsDoc.data?.items ?? {};
  return { items: itemIndex(rawItems, itemDict) };
}

export async function getEconomyDataset(
  locale: Locale,
  gameMode: GameMode = DEFAULT_MODE,
): Promise<EconomyDataset> {
  const [{ items }, craftDoc, hideout, hideoutDict] =
    await Promise.all([
      fetchCore(locale, gameMode),
      fetchTarkovJson<RawArrayDoc<RawCraft>>(`/${gameMode}/crafts`),
      fetchTarkovJson<RawHideoutDoc>(`/${gameMode}/hideout`),
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
