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

export interface ExchangePart {
  item: ToolItem;
  count: number;
  tool?: boolean;
}

export interface BarterDeal {
  id: string;
  trader: { id: string; name: string };
  minTraderLevel: number | null;
  restockAmount: number | null;
  buyLimit: number | null;
  taskUnlock: string | null;
  requiredItems: ExchangePart[];
  offeredItem: ExchangePart;
  updated: string | null;
}

export interface CraftDeal {
  id: string;
  station: { id: string; name: string };
  level: number;
  duration: number;
  requiredItems: ExchangePart[];
  requiredQuestItems: ExchangePart[];
  productItem: ExchangePart;
  updated: string | null;
}

export interface EconomyDataset {
  crafts: CraftDeal[];
  gameMode: GameMode;
  generatedAt: string;
  sourceUpdatedAt: string | null;
}

export interface GunsmithCondition {
  key: string;
  value: number;
  compareMethod: string;
  /** What the shipped build actually reaches. */
  actual: number;
  satisfied: boolean;
}

export interface GunsmithBuildPart {
  item: ToolItem;
  /** Localized name of the slot it goes into. */
  slot: string;
  /** The part it attaches to, or null when it goes straight on the weapon. */
  parent: ToolItem | null;
  /** True when the quest itself names this part (or its category). */
  required: boolean;
}

export interface GunsmithTask {
  id: string;
  name: string;
  /** English name, shown alongside the localized one; null when identical. */
  nameEn: string | null;
  /** "Gunsmith - Part N" ordinal, null for the named one-offs. */
  part: number | null;
  trader: string | null;
  minPlayerLevel: number | null;
  weapon: ToolItem;
  /** A complete build, parents before children — install it top to bottom. */
  build: GunsmithBuildPart[];
  conditions: GunsmithCondition[];
  /** Every condition met by `build`. False means the guide is incomplete. */
  verified: boolean;
}

export interface AmmoRound {
  id: string;
  name: string;
  shortName: string;
  iconLink: string | null;
  caliber: string;
  damage: number | null;
  penetrationPower: number | null;
  armorDamage: number | null;
  initialSpeed: number | null;
  fragmentationChance: number | null;
  ricochetChance: number | null;
  accuracyModifier: number | null;
  recoilModifier: number | null;
  heavyBleedModifier: number | null;
  lightBleedModifier: number | null;
  tracer: boolean;
}

export interface ArmorLayer {
  name: string;
  armorClass: number | null;
  durability: number | null;
  material: string | null;
  zones: string[];
  normalizedZones: string[];
}

export interface ArmorPlate {
  id: string;
  name: string;
  iconLink: string | null;
  armorClass: number | null;
  durability: number | null;
  material: string | null;
  bluntThroughput: number | null;
  speedPenalty: number | null;
  turnPenalty: number | null;
  ergoPenalty: number | null;
  weight: number | null;
  zones: string[];
  normalizedZones: string[];
}

export interface ArmorSlot {
  name: string;
  zones: string[];
  normalizedZones: string[];
  allowedPlates: ArmorPlate[];
}

export interface ArmorItem {
  id: string;
  name: string;
  iconLink: string | null;
  weight: number | null;
  armorClass: number | null;
  durability: number | null;
  material: string | null;
  bluntThroughput: number | null;
  speedPenalty: number | null;
  turnPenalty: number | null;
  ergoPenalty: number | null;
  zones: string[];
  normalizedZones: string[];
  unknownZones: string[];
  softArmor: ArmorLayer[];
  slots: ArmorSlot[];
}

export interface CombatDataset {
  ammo: AmmoRound[];
  armor: ArmorItem[];
  gameMode: GameMode;
}
