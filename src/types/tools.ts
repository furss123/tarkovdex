import type { GameMode } from './tarkov';

export type PriceStrategy = 'flea' | 'trader' | 'best';

export interface PriceOption {
  flea: number | null;
  traderBuy: number | null;
  traderSell: number | null;
  updated: string | null;
}

export interface ToolItem {
  id: string;
  name: string;
  shortName: string;
  iconLink: string | null;
  types: string[];
  categories: string[];
  price: PriceOption;
}

/** Craft input attributes arrive as boolean flags from json.tarkov.dev. The
 * legacy GraphQL shape exposes the same flags as ItemAttribute entries. Keep
 * both raw boundary shapes explicit; ExchangePart below remains normalized. */
export interface ItemAttribute {
  type?: string | null;
  name?: string | null;
  value?: boolean | string | number | null;
}

export interface CraftAttributeFlags {
  tool?: boolean | string | number | null;
  functional?: boolean | string | number | null;
  [name: string]: unknown;
}

export type CraftPartAttributes =
  | CraftAttributeFlags
  | ItemAttribute[]
  | null
  | undefined;

export interface ExchangePart {
  item: ToolItem;
  count: number;
  tool?: boolean;
}

export interface CraftDeal {
  id: string;
  station: { id: string; name: string; imageLink?: string | null };
  level: number;
  duration: number;
  requiredItems: ExchangePart[];
  requiredQuestItems: ExchangePart[];
  /** Upstream gate ids that are not present in the item catalog. Keeping the
   * ids makes the partial-data state explicit and prevents profit ranking
   * without inventing a price or localized item name. */
  unresolvedQuestRequirements?: string[];
  productItem: ExchangePart;
  /** The current API exposes one productItem. Keeping an optional collection
   * lets the calculator correctly handle a future multi-output document
   * without changing the compact economy UI's primary product field. */
  productItems?: ExchangePart[];
  /** Explicit upstream availability wins when a seasonal craft provides it.
   * Undefined means the API did not expose an availability flag. */
  active?: boolean;
  updated: string | null;
}

export interface CraftProfitLeader {
  craftId: string;
  station: { id: string; name: string; imageLink: string | null };
  level: number;
  duration: number;
  product: {
    id: string;
    name: string;
    iconLink: string | null;
    count: number;
  };
  inputCost: number;
  outputValue: number;
  profit: number;
  hourlyProfit: number | null;
  /**
   * Oldest upstream `price.updated` among the items this profit was actually
   * computed from — every priced non-tool input plus every output. Null when
   * any contributor carries no stamp, which is a distinct answer from "recent"
   * and keeps the craft out of the current ranking.
   *
   * This is a content timestamp only. Fetch, cache and observation times live
   * in `DataHealth.timestamps` and are never substituted here.
   */
  priceUpdatedAt: string | null;
}

export interface EconomyDataset {
  crafts: CraftDeal[];
  gameMode: GameMode;
  generatedAt: string;
  sourceUpdatedAt: string | null;
}
