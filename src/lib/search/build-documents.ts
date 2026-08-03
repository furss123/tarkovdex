import { formatCaliber } from '@/lib/game-localization';
import { calculateCraftProfit } from '@/lib/tool-calculations';
import { taskSlugFor } from '@/lib/task-slug';
import type { GameMap, GameMode, Item, MarketItem, Task } from '@/types/tarkov';
import type { AmmoRound, ArmorItem, CraftDeal, GunsmithTask } from '@/types/tools';
import type { SearchDocument, SearchDomain } from './types';

const AGGREGATABLE = new Set(['giveItem', 'findItem', 'plantItem']);

function positive(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

export interface ItemTaskLink {
  itemId: string;
  taskId: string;
}

/** Collect representative item→task links from aggregatable objectives. */
export function collectItemTaskLinks(tasks: readonly Task[]): ItemTaskLink[] {
  const links: ItemTaskLink[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    for (const objective of task.objectives) {
      if (!AGGREGATABLE.has(objective.type)) continue;
      const itemId = objective.items?.[0];
      if (!itemId) continue;
      const key = `${itemId}:${task.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ itemId, taskId: task.id });
    }
  }
  return links;
}

function toMarketFields(item: Item, feeRate = 5): Pick<MarketItem, 'valuePerSlot' | 'freshnessHours' | 'slotCount'> & {
  estimatedFleaNet: number | null;
} {
  const slotCount = Math.max(1, (item.width || 1) * (item.height || 1));
  const flea =
    typeof item.avg24hPrice === 'number' && item.avg24hPrice > 0 ? item.avg24hPrice : null;
  const estimatedFleaNet =
    flea === null ? null : Math.max(0, Math.round(flea * (1 - feeRate / 100)));
  const trader =
    typeof item.bestVendorSellRUB === 'number' && item.bestVendorSellRUB > 0
      ? item.bestVendorSellRUB
      : null;
  const reference =
    estimatedFleaNet == null
      ? trader
      : trader == null
        ? estimatedFleaNet
        : Math.max(estimatedFleaNet, trader);
  let freshnessHours: number | null = null;
  if (item.updated) {
    const ts = Date.parse(item.updated);
    if (Number.isFinite(ts)) {
      freshnessHours = Math.max(0, Math.round(((Date.now() - ts) / 3_600_000) * 10) / 10);
    }
  }
  return {
    slotCount,
    estimatedFleaNet,
    valuePerSlot: reference == null ? null : Math.round(reference / slotCount),
    freshnessHours,
  };
}

export function buildItemDocuments(
  items: readonly Item[],
  gameMode: GameMode,
  itemTaskLinks: ReadonlyMap<string, string[]>,
  itemCraftLinks: ReadonlyMap<string, string[]>,
  excludeIds: ReadonlySet<string>,
): SearchDocument[] {
  const docs: SearchDocument[] = [];
  for (const item of items) {
    if (excludeIds.has(item.id)) continue;
    // Skip ammo/armor catalog rows — they get dedicated domain documents.
    if (item.types.includes('ammo') || item.types.includes('armor')) continue;
    const market = toMarketFields(item);
    const category = item.types.find((type) =>
      ['barter', 'gun', 'provisions', 'meds', 'keys', 'wearable'].includes(type),
    );
    docs.push({
      id: item.id,
      domain: 'item',
      title: item.name,
      shortName: item.shortName || undefined,
      aliases: uniqueStrings([item.shortName]),
      keywords: uniqueStrings([...(item.types ?? []), category]),
      href: `/economy/items?q=${encodeURIComponent(item.shortName || item.name)}`,
      gameModes: [gameMode],
      category: category ?? item.types[0],
      subtitle: category ?? undefined,
      numeric: {
        price: positive(item.avg24hPrice) ?? undefined,
        traderPrice: positive(item.bestVendorSellRUB) ?? undefined,
        valuePerSlot: market.valuePerSlot ?? undefined,
        freshnessHours: market.freshnessHours ?? undefined,
      },
      relations: {
        taskIds: itemTaskLinks.get(item.id),
        craftIds: itemCraftLinks.get(item.id),
      },
    });
  }
  return docs;
}

export function buildAmmoDocuments(
  ammo: readonly AmmoRound[],
  gameMode: GameMode,
  locale: string,
  itemTaskLinks: ReadonlyMap<string, string[]>,
): SearchDocument[] {
  return ammo.map((round) => {
    const caliberLabel = formatCaliber(round.caliber, locale);
    return {
      id: round.id,
      domain: 'ammo' as const,
      title: round.name,
      shortName: round.shortName || undefined,
      aliases: uniqueStrings([round.shortName, caliberLabel, round.caliber]),
      keywords: uniqueStrings([round.caliber, caliberLabel, 'ammo']),
      href: `/combat/ammo?q=${encodeURIComponent(round.shortName || round.name)}`,
      gameModes: [gameMode],
      category: caliberLabel,
      subtitle: caliberLabel,
      numeric: {
        damage: round.damage ?? undefined,
        penetration: round.penetrationPower ?? undefined,
        armorDamage: round.armorDamage ?? undefined,
      },
      relations: { taskIds: itemTaskLinks.get(round.id) },
    };
  });
}

export function buildArmorDocuments(
  armor: readonly ArmorItem[],
  gameMode: GameMode,
  itemTaskLinks: ReadonlyMap<string, string[]>,
): SearchDocument[] {
  return armor.map((piece) => {
    const classLabel =
      piece.armorClass != null ? `class ${piece.armorClass}` : undefined;
    return {
      id: piece.id,
      domain: 'armor' as const,
      title: piece.name,
      aliases: uniqueStrings([classLabel, piece.material ?? undefined]),
      keywords: uniqueStrings([
        'armor',
        classLabel,
        piece.material ?? undefined,
        ...piece.normalizedZones,
      ]),
      href: `/combat/armor?q=${encodeURIComponent(piece.name)}`,
      gameModes: [gameMode],
      category: classLabel,
      subtitle: classLabel,
      numeric: {
        armorClass: piece.armorClass ?? undefined,
        weight: piece.weight ?? undefined,
      },
      relations: { taskIds: itemTaskLinks.get(piece.id) },
    };
  });
}

export function buildTaskDocuments(tasks: readonly Task[], gameMode: GameMode): SearchDocument[] {
  return tasks.map((task) => {
    const itemIds = uniqueStrings(
      task.objectives.flatMap((objective) =>
        AGGREGATABLE.has(objective.type) ? [objective.items?.[0] ?? null] : [],
      ),
    );
    return {
      id: task.id,
      domain: 'task' as const,
      title: task.name,
      titleEn: task.nameEn ?? undefined,
      aliases: uniqueStrings([task.nameEn ?? undefined, task.trader?.name]),
      keywords: uniqueStrings([
        task.trader?.name,
        task.map?.name,
        task.minPlayerLevel != null ? `lvl ${task.minPlayerLevel}` : null,
      ]),
      href: `/progression/tasks/${taskSlugFor(task)}`,
      gameModes: [gameMode],
      category: task.trader?.name,
      subtitle: [task.trader?.name, task.map?.name].filter(Boolean).join(' · ') || undefined,
      numeric: {
        level: task.minPlayerLevel ?? undefined,
      },
      relations: {
        itemIds,
        mapIds: task.map ? [task.map.id] : undefined,
        traderIds: task.trader ? [task.trader.id] : undefined,
      },
    };
  });
}

export function buildCraftDocuments(
  crafts: readonly CraftDeal[],
  gameMode: GameMode,
): { documents: SearchDocument[]; itemCraftLinks: Map<string, string[]> } {
  const itemCraftLinks = new Map<string, string[]>();
  const documents: SearchDocument[] = [];

  for (const craft of crafts) {
    if (craft.active === false) continue;
    const profit = calculateCraftProfit(craft, 'best', 0);
    const product = craft.productItem;
    const itemIds = uniqueStrings([
      product.item.id,
      ...craft.requiredItems.map((part) => part.item.id),
    ]);
    for (const itemId of itemIds) {
      const list = itemCraftLinks.get(itemId) ?? [];
      if (!list.includes(craft.id)) list.push(craft.id);
      itemCraftLinks.set(itemId, list);
    }

    documents.push({
      id: craft.id,
      domain: 'craft',
      title: product.item.name,
      shortName: product.item.shortName || undefined,
      aliases: uniqueStrings([product.item.shortName, craft.station.name]),
      keywords: uniqueStrings([
        craft.station.name,
        'craft',
        ...craft.requiredItems.map((part) => part.item.name),
      ]),
      href: `/economy/barters#station-section-${craft.station.id}`,
      gameModes: [gameMode],
      category: craft.station.name,
      subtitle: craft.station.name,
      numeric: {
        profit: profit.profit ?? undefined,
        profitPerHour: profit.hourlyProfit ?? undefined,
        duration: craft.duration,
        level: craft.level,
      },
      relations: { itemIds },
    });
  }

  return { documents, itemCraftLinks };
}

export function buildGunsmithDocuments(
  tasks: readonly GunsmithTask[],
  gameMode: GameMode,
): SearchDocument[] {
  return tasks.map((task) => {
    const partLabel = task.part != null ? `Gunsmith ${task.part}` : undefined;
    return {
      id: task.id,
      domain: 'gunsmith' as const,
      title: task.name,
      titleEn: task.nameEn ?? undefined,
      aliases: uniqueStrings([task.nameEn ?? undefined, partLabel, task.weapon.shortName]),
      keywords: uniqueStrings([
        'gunsmith',
        partLabel,
        task.weapon.name,
        task.weapon.shortName,
        task.trader ?? undefined,
      ]),
      href: `/progression/gunsmith#gunsmith-${task.id}`,
      gameModes: [gameMode],
      category: partLabel ?? 'gunsmith',
      subtitle: task.weapon.name,
      numeric: {
        level: task.minPlayerLevel ?? undefined,
      },
      relations: {
        itemIds: uniqueStrings([task.weapon.id, ...task.build.map((part) => part.item.id)]),
        taskIds: [task.id],
      },
    };
  });
}

export function buildMapDocuments(
  maps: readonly GameMap[],
  gameMode: GameMode,
  mapTaskCounts: ReadonlyMap<string, number>,
  mapTaskIds: ReadonlyMap<string, string[]>,
): SearchDocument[] {
  return maps.map((map) => {
    const bossNames = uniqueStrings(map.bosses.map((entry) => entry.boss?.name));
    const activeQuestCount = mapTaskCounts.get(map.id);
    return {
      id: map.id,
      domain: 'map' as const,
      title: map.name,
      aliases: uniqueStrings(bossNames),
      keywords: uniqueStrings(['map', ...bossNames]),
      href: `/maps#map-${map.id}`,
      gameModes: [gameMode],
      subtitle:
        map.raidDuration != null ? `${map.raidDuration} min` : map.players ?? undefined,
      numeric: {
        raidDuration: map.raidDuration ?? undefined,
        bossCount: map.bosses.length || undefined,
        // Omit rather than invent 0 when the map has no linked quests.
        questCount:
          activeQuestCount != null && activeQuestCount > 0 ? activeQuestCount : undefined,
      },
      relations: { taskIds: mapTaskIds.get(map.id) },
    };
  });
}

export function mergeDocumentsByMode(
  regular: SearchDocument[],
  pve: SearchDocument[],
): SearchDocument[] {
  const map = new Map<string, SearchDocument>();
  const keyOf = (doc: SearchDocument) => `${doc.domain}:${doc.id}`;

  for (const doc of regular) {
    map.set(keyOf(doc), { ...doc, gameModes: ['regular'] });
  }
  for (const doc of pve) {
    const key = keyOf(doc);
    const existing = map.get(key);
    if (existing) {
      map.set(key, {
        ...existing,
        gameModes: uniqueStrings([...existing.gameModes, 'pve']) as GameMode[],
        // Prefer regular locale text already stored; keep richer relations.
        relations: {
          itemIds: uniqueStrings([
            ...(existing.relations?.itemIds ?? []),
            ...(doc.relations?.itemIds ?? []),
          ]),
          taskIds: uniqueStrings([
            ...(existing.relations?.taskIds ?? []),
            ...(doc.relations?.taskIds ?? []),
          ]),
          craftIds: uniqueStrings([
            ...(existing.relations?.craftIds ?? []),
            ...(doc.relations?.craftIds ?? []),
          ]),
          mapIds: uniqueStrings([
            ...(existing.relations?.mapIds ?? []),
            ...(doc.relations?.mapIds ?? []),
          ]),
          traderIds: uniqueStrings([
            ...(existing.relations?.traderIds ?? []),
            ...(doc.relations?.traderIds ?? []),
          ]),
        },
      });
    } else {
      map.set(key, { ...doc, gameModes: ['pve'] });
    }
  }
  return [...map.values()];
}

export function countByDomain(
  documents: readonly SearchDocument[],
): Partial<Record<SearchDomain, number>> {
  const counts: Partial<Record<SearchDomain, number>> = {};
  for (const doc of documents) {
    counts[doc.domain] = (counts[doc.domain] ?? 0) + 1;
  }
  return counts;
}
