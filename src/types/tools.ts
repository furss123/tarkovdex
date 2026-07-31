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
}

export interface GunsmithPartCandidate {
  requirement: 'item' | 'category';
  requirementId: string;
  item: ToolItem;
  compatible: boolean;
  pathComplete: boolean;
  path: ToolItem[];
  alternatives: ToolItem[];
  alternativePaths: ToolItem[][];
}

export interface GunsmithTask {
  id: string;
  name: string;
  weapon: ToolItem;
  containsAll: string[];
  containsCategory: string[];
  conditions: GunsmithCondition[];
  candidates: GunsmithPartCandidate[];
  structuralComplete: boolean;
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
