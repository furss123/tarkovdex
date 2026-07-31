import 'server-only';
import type { Locale } from '@/i18n/routing';
import {
  fetchTarkovJson,
  getTranslationDict,
  getTraders,
  translate,
} from '@/lib/tarkov';
import { finiteNonNegative, normalizeArmorZones } from './tool-calculations';
import type { GameMode } from '@/types/tarkov';
import type {
  ArmorItem,
  ArmorLayer,
  ArmorPlate,
  CombatDataset,
  CraftDeal,
  EconomyDataset,
  GunsmithCondition,
  GunsmithPartCandidate,
  GunsmithTask,
  ToolItem,
} from '@/types/tools';

type RawOffer = {
  trader?: string;
  priceRUB?: number | null;
  minTraderLevel?: number | null;
  taskUnlock?: string | null;
};

type RawSlot = {
  id?: string;
  name?: string;
  nameId?: string;
  required?: boolean;
  zones?: string[];
  allowedPlates?: string[];
  filters?: {
    allowedItems?: string[];
    allowedCategories?: string[];
    excludedItems?: string[];
    excludedCategories?: string[];
  };
  class?: number;
  durability?: number;
  armorMaterial?: string;
  material?: string;
  bluntThroughput?: number;
  speedPenalty?: number;
  turnPenalty?: number;
  ergoPenalty?: number;
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
  weight?: number | null;
  buyFromTrader?: RawOffer[];
  sellToTrader?: RawOffer[];
  conflictingItems?: string[];
  conflictingSlotIds?: string[];
  conflictingCategories?: string[];
  containsItems?: Array<{ item?: string; count?: number }>;
  properties?: {
    propertiesType?: string;
    slots?: RawSlot[];
    caliber?: string;
    damage?: number;
    penetrationPower?: number;
    armorDamage?: number;
    initialSpeed?: number;
    fragmentationChance?: number;
    ricochetChance?: number;
    accuracyModifier?: number;
    recoilModifier?: number;
    heavyBleedModifier?: number;
    lightBleedModifier?: number;
    tracer?: boolean;
    class?: number;
    durability?: number;
    material?: string;
    armorMaterial?: string;
    bluntThroughput?: number;
    speedPenalty?: number;
    turnPenalty?: number;
    ergoPenalty?: number;
    zones?: string[];
    armorSlots?: RawSlot[];
  };
};

type RawItemsDoc = { data?: { items?: Record<string, RawItem> } };
type RawPart = {
  item?: string;
  count?: number;
  attributes?: { tool?: boolean };
};
type RawCraft = {
  id?: string;
  requiredItems?: RawPart[];
  requiredQuestItems?: RawPart[];
  station?: string;
  duration?: number;
  level?: number;
  productItem?: RawPart;
};
type RawArrayDoc<T> = { data?: T[] };
type RawHideoutDoc = {
  data?: Record<string, {
    id?: string;
    name?: string;
  }>;
};
type RawObjective = {
  id?: string;
  type?: string;
  count?: number;
  items?: string[];
  item?: string;
  containsAll?: string[];
  containsCategory?: string[];
  buildAttributes?: Record<string, { value?: number; compareMethod?: string }>;
};
type RawTask = {
  id: string;
  name: string;
  minPlayerLevel?: number | null;
  objectives?: RawObjective[];
};
type RawTasksDoc = { data?: { tasks?: Record<string, RawTask> } };

const DEFAULT_MODE: GameMode = 'regular';
function minPrice(offers: RawOffer[] | undefined): number | null {
  const values = (offers ?? [])
    .map((offer) => finiteNonNegative(offer.priceRUB))
    .filter((value): value is number => value !== null);
  return values.length ? Math.min(...values) : null;
}

function maxPrice(offers: RawOffer[] | undefined): number | null {
  const values = (offers ?? [])
    .map((offer) => finiteNonNegative(offer.priceRUB))
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
          flea: finiteNonNegative(raw.avg24hPrice),
          traderBuy: minPrice(raw.buyFromTrader),
          traderSell: maxPrice(raw.sellToTrader),
          updated: raw.updated ?? null,
        },
      } satisfies ToolItem,
    ]),
  );
}

function validPart(
  raw: RawPart | undefined,
  items: Map<string, ToolItem>,
): { item: ToolItem; count: number; tool?: boolean } | null {
  if (!raw?.item) return null;
  const item = items.get(raw.item);
  const count = finiteNonNegative(raw.count);
  if (!item || count === null) return null;
  return { item, count, ...(raw.attributes?.tool ? { tool: true } : {}) };
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

async function fetchCore(locale: Locale, gameMode: GameMode) {
  const [itemsDoc, itemDict, traders] = await Promise.all([
    fetchTarkovJson<RawItemsDoc>(`/${gameMode}/items`),
    getTranslationDict('items', locale, gameMode),
    getTraders(locale, gameMode),
  ]);
  const rawItems = itemsDoc.data?.items ?? {};
  return {
    rawItems,
    items: itemIndex(rawItems, itemDict),
    itemDict,
    traders,
  };
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
  const stationNames = new Map(
    Object.values(hideout.data ?? {}).map((station) => [
      station.id ?? '',
      translate(hideoutDict, station.name),
    ]),
  );
  const crafts: CraftDeal[] = [];
  for (const raw of Array.isArray(craftDoc.data) ? craftDoc.data : []) {
    const productItem = validPart(raw.productItem, items);
    if (!raw.id || !raw.station || !productItem) continue;
    crafts.push({
      id: raw.id,
      station: {
        id: raw.station,
        name: stationNames.get(raw.station) ?? raw.station,
      },
      level: finiteNonNegative(raw.level) ?? 0,
      duration: finiteNonNegative(raw.duration) ?? 0,
      requiredItems: (raw.requiredItems ?? [])
        .map((part) => validPart(part, items))
        .filter((part): part is NonNullable<typeof part> => part !== null),
      requiredQuestItems: (raw.requiredQuestItems ?? [])
        .map((part) => validPart(part, items))
        .filter((part): part is NonNullable<typeof part> => part !== null),
      productItem,
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

function categoryIndex(rawItems: Record<string, RawItem>): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const item of Object.values(rawItems)) {
    for (const category of item.categories ?? []) {
      const items = index.get(category) ?? [];
      items.push(item.id);
      index.set(category, items);
    }
  }
  return index;
}

function allowedChildren(
  parent: RawItem,
  rawItems: Record<string, RawItem>,
  categories: Map<string, string[]>,
): string[] {
  const allowed = new Set<string>();
  for (const slot of parent.properties?.slots ?? []) {
    const filters = slot.filters;
    if (!filters) continue;
    for (const id of filters.allowedItems ?? []) allowed.add(id);
    for (const category of filters.allowedCategories ?? []) {
      for (const id of categories.get(category) ?? []) allowed.add(id);
    }
    for (const id of filters.excludedItems ?? []) allowed.delete(id);
    for (const id of [...allowed]) {
      if ((rawItems[id]?.categories ?? []).some((category) => filters.excludedCategories?.includes(category))) {
        allowed.delete(id);
      }
    }
  }
  return [...allowed].filter((id) => Boolean(rawItems[id]));
}

function reachablePartPaths(
  weapon: RawItem,
  rawItems: Record<string, RawItem>,
  categories: Map<string, string[]>,
  maxDepth = 4,
): Map<string, string[]> {
  const paths = new Map<string, string[]>();
  const visited = new Set<string>([weapon.id]);
  const queue: Array<{ item: RawItem; path: string[] }> = [{ item: weapon, path: [] }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.path.length >= maxDepth) continue;
    for (const childId of allowedChildren(current.item, rawItems, categories)) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      const path = [...current.path, childId];
      paths.set(childId, path);
      queue.push({ item: rawItems[childId], path });
    }
  }
  return paths;
}

export async function getGunsmithTasks(
  locale: Locale,
  gameMode: GameMode = DEFAULT_MODE,
): Promise<GunsmithTask[]> {
  const [{ rawItems, items }, tasksDoc, taskDict] = await Promise.all([
    fetchCore(locale, gameMode),
    fetchTarkovJson<RawTasksDoc>(`/${gameMode}/tasks`),
    getTranslationDict('tasks', locale, gameMode),
  ]);
  const result: GunsmithTask[] = [];
  const categories = categoryIndex(rawItems);
  for (const task of Object.values(tasksDoc.data?.tasks ?? {})) {
    const objective = (task.objectives ?? []).find((item) => item.type === 'buildWeapon');
    if (!objective?.item) continue;
    const weapon = items.get(objective.item);
    const rawWeapon = rawItems[objective.item];
    if (!weapon || !rawWeapon) continue;
    const reachable = reachablePartPaths(rawWeapon, rawItems, categories);
    const candidates: GunsmithPartCandidate[] = [];
    const requirements: Array<{ type: 'item' | 'category'; id: string }> = [
      ...(objective.containsAll ?? []).map((id) => ({ type: 'item' as const, id })),
      ...(objective.containsCategory ?? []).map((id) => ({ type: 'category' as const, id })),
    ];
    for (const requirement of requirements) {
      const reachableMatches = [...reachable.entries()]
        .filter(([id]) => {
          const raw = rawItems[id];
          return (
          requirement.type === 'item'
            ? raw.id === requirement.id
            : raw.categories?.includes(requirement.id)
          );
        })
        .map(([id, path]) => ({
          item: items.get(id),
          path: path.map((partId) => items.get(partId)).filter((part): part is ToolItem => Boolean(part)),
        }))
        .filter((entry): entry is { item: ToolItem; path: ToolItem[] } => Boolean(entry.item))
        .sort((a, b) => a.item.name.localeCompare(b.item.name, locale, { numeric: true }));

      let pathComplete = reachableMatches.length > 0;
      if (reachableMatches.length === 0 && requirement.type === 'item') {
        const requiredItem = items.get(requirement.id);
        if (requiredItem) {
          reachableMatches.push({ item: requiredItem, path: [requiredItem] });
          pathComplete = false;
        }
      }

      const selected = reachableMatches[0];
      if (!selected) continue;
      candidates.push({
        requirement: requirement.type,
        requirementId: requirement.id,
        item: selected.item,
        compatible: pathComplete && selected.path.length === 1,
        pathComplete,
        path: selected.path,
        alternatives: reachableMatches.slice(1, 4).map((entry) => entry.item),
        alternativePaths: reachableMatches.slice(1, 4).map((entry) => entry.path),
      });
    }
    const conditions: GunsmithCondition[] = Object.entries(objective.buildAttributes ?? {})
      .filter((entry): entry is [string, { value: number; compareMethod?: string }] =>
        typeof entry[1]?.value === 'number',
      )
      .map(([key, condition]) => ({
        key,
        value: condition.value,
        compareMethod: condition.compareMethod ?? '=',
      }));
    const translatedName = translate(taskDict, task.name);
    // Skip "Old Friend's Request" (early Gunsmith quest)
    if (translatedName.includes('Old Friend') || translatedName.includes('생지옥')) continue;
    result.push({
      id: task.id,
      name: translatedName,
      weapon,
      containsAll: objective.containsAll ?? [],
      containsCategory: objective.containsCategory ?? [],
      conditions,
      candidates,
      structuralComplete:
        candidates.length === requirements.length &&
        candidates.every((candidate) => candidate.pathComplete),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, locale, { numeric: true }));
}

function armorPlate(raw: RawItem, tool: ToolItem): ArmorPlate {
  const properties = raw.properties ?? {};
  const zones = properties.zones ?? [];
  const normalized = normalizeArmorZones(zones);
  return {
    id: raw.id,
    name: tool.name,
    iconLink: tool.iconLink,
    armorClass: finiteNonNegative(properties.class),
    durability: finiteNonNegative(properties.durability),
    material: properties.material ?? properties.armorMaterial ?? null,
    bluntThroughput: finiteNonNegative(properties.bluntThroughput),
    speedPenalty: typeof properties.speedPenalty === 'number' ? properties.speedPenalty : null,
    turnPenalty: typeof properties.turnPenalty === 'number' ? properties.turnPenalty : null,
    ergoPenalty: typeof properties.ergoPenalty === 'number' ? properties.ergoPenalty : null,
    weight: finiteNonNegative(raw.weight),
    zones,
    normalizedZones: normalized.normalized,
  };
}

export async function getCombatDataset(
  locale: Locale,
  gameMode: GameMode = DEFAULT_MODE,
): Promise<CombatDataset> {
  const { rawItems, items, itemDict } = await fetchCore(locale, gameMode);
  const ammo: CombatDataset['ammo'] = [];
  const plates = new Map<string, ArmorPlate>();
  for (const raw of Object.values(rawItems)) {
    const tool = items.get(raw.id);
    if (!tool) continue;
    if (raw.properties?.propertiesType === 'ItemPropertiesAmmo') {
      const p = raw.properties;
      ammo.push({
        id: raw.id,
        name: tool.name,
        shortName: tool.shortName,
        iconLink: tool.iconLink,
        caliber: p.caliber ?? 'unknown',
        damage: finiteNonNegative(p.damage),
        penetrationPower: finiteNonNegative(p.penetrationPower),
        armorDamage: finiteNonNegative(p.armorDamage),
        initialSpeed: finiteNonNegative(p.initialSpeed),
        fragmentationChance: finiteNonNegative(p.fragmentationChance),
        ricochetChance: finiteNonNegative(p.ricochetChance),
        accuracyModifier: typeof p.accuracyModifier === 'number' ? p.accuracyModifier : null,
        recoilModifier: typeof p.recoilModifier === 'number' ? p.recoilModifier : null,
        heavyBleedModifier: typeof p.heavyBleedModifier === 'number' ? p.heavyBleedModifier : null,
        lightBleedModifier: typeof p.lightBleedModifier === 'number' ? p.lightBleedModifier : null,
        tracer: p.tracer === true,
      });
    }
    if (raw.types?.includes('armorPlate')) plates.set(raw.id, armorPlate(raw, tool));
  }
  const armor: ArmorItem[] = [];
  for (const raw of Object.values(rawItems)) {
    if (!raw.types?.includes('armor') || raw.types.includes('armorPlate')) continue;
    const tool = items.get(raw.id);
    if (!tool) continue;
    const p = raw.properties ?? {};
    const zones = p.zones ?? [];
    const mapped = normalizeArmorZones(zones);
    const softArmor: ArmorLayer[] = (p.armorSlots ?? [])
      .filter((slot) => typeof slot.class === 'number')
      .map((slot) => {
        const slotZones = slot.zones ?? [];
        return {
          // empty name → components render their localized fallback label
          name: translate(itemDict, slot.name ?? slot.nameId) || '',
          armorClass: finiteNonNegative(slot.class),
          durability: finiteNonNegative(slot.durability),
          material: slot.armorMaterial ?? slot.material ?? null,
          zones: slotZones,
          normalizedZones: normalizeArmorZones(slotZones).normalized,
        };
      });
    armor.push({
      id: raw.id,
      name: tool.name,
      iconLink: tool.iconLink,
      weight: finiteNonNegative(raw.weight),
      armorClass: finiteNonNegative(p.class),
      durability: finiteNonNegative(p.durability),
      material: p.material ?? p.armorMaterial ?? null,
      bluntThroughput: finiteNonNegative(p.bluntThroughput),
      speedPenalty: typeof p.speedPenalty === 'number' ? p.speedPenalty : null,
      turnPenalty: typeof p.turnPenalty === 'number' ? p.turnPenalty : null,
      ergoPenalty: typeof p.ergoPenalty === 'number' ? p.ergoPenalty : null,
      zones,
      normalizedZones: mapped.normalized,
      unknownZones: mapped.unknown,
      softArmor,
      slots: (p.armorSlots ?? [])
        .filter((slot) => (slot.allowedPlates?.length ?? 0) > 0)
        .map((slot) => {
          const slotZones = slot.zones ?? [];
          return {
            name: translate(itemDict, slot.name ?? slot.nameId) || '',
            zones: slotZones,
            normalizedZones: normalizeArmorZones(slotZones).normalized,
            allowedPlates: (slot.allowedPlates ?? [])
              .map((id) => plates.get(id))
              .filter((plate): plate is ArmorPlate => Boolean(plate)),
          };
        }),
    });
  }
  return {
    ammo: ammo.sort((a, b) =>
      a.caliber.localeCompare(b.caliber) ||
      (b.penetrationPower ?? -1) - (a.penetrationPower ?? -1),
    ),
    armor: armor.sort((a, b) => (b.armorClass ?? -1) - (a.armorClass ?? -1)),
    gameMode,
  };
}
