import 'server-only';

import { getItems, getMaps, getTasks } from '@/lib/tarkov';
import {
  getCombatDataset,
  getEconomyDataset,
  getGunsmithTasks,
} from '@/lib/tarkov-tools';
import type { GameMode, Task } from '@/types/tarkov';
import type { Locale } from '@/i18n/routing';
import {
  buildAmmoDocuments,
  buildArmorDocuments,
  buildCraftDocuments,
  buildGunsmithDocuments,
  buildItemDocuments,
  buildMapDocuments,
  buildTaskDocuments,
  collectItemTaskLinks,
  countByDomain,
} from './build-documents';
import type { SearchDomain, SearchDocument, SearchIndexPayload } from './types';

type CacheEntry = {
  payload: SearchIndexPayload;
  builtAt: number;
};

const INDEX_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

function cacheKey(locale: Locale, gameMode: GameMode): string {
  return `${locale}:${gameMode}`;
}

function mapTaskMeta(tasks: Task[]): {
  counts: Map<string, number>;
  ids: Map<string, string[]>;
} {
  const counts = new Map<string, number>();
  const ids = new Map<string, string[]>();
  for (const task of tasks) {
    const mapId = task.map?.id;
    if (!mapId) continue;
    counts.set(mapId, (counts.get(mapId) ?? 0) + 1);
    const list = ids.get(mapId) ?? [];
    list.push(task.id);
    ids.set(mapId, list);
  }
  return { counts, ids };
}

/**
 * Build (or return a cached) search index for one locale+mode. Partial domain
 * failures still produce an index — `meta.partial` / `failedDomains` tell the
 * UI which groups are missing. Never throws for a single-domain failure.
 */
export async function getSearchIndex(
  locale: Locale,
  gameMode: GameMode,
): Promise<SearchIndexPayload> {
  const key = cacheKey(locale, gameMode);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.builtAt < INDEX_TTL_MS) {
    return hit.payload;
  }

  const failed: SearchDomain[] = [];

  const [itemsResult, tasksResult, mapsResult, combatResult, economyResult, gunsmithResult] =
    await Promise.allSettled([
      getItems({ locale, gameMode }),
      getTasks({ locale, gameMode }),
      getMaps({ locale, gameMode }),
      getCombatDataset(locale, gameMode),
      getEconomyDataset(locale, gameMode),
      getGunsmithTasks(locale, gameMode),
    ]);

  const items = itemsResult.status === 'fulfilled' ? itemsResult.value : null;
  const tasks = tasksResult.status === 'fulfilled' ? tasksResult.value : null;
  const maps = mapsResult.status === 'fulfilled' ? mapsResult.value : null;
  const combat = combatResult.status === 'fulfilled' ? combatResult.value : null;
  const economy = economyResult.status === 'fulfilled' ? economyResult.value : null;
  const gunsmith = gunsmithResult.status === 'fulfilled' ? gunsmithResult.value : null;

  if (!items) failed.push('item');
  if (!tasks) failed.push('task');
  if (!maps) failed.push('map');
  if (!combat) {
    failed.push('ammo');
    failed.push('armor');
  }
  if (!economy) failed.push('craft');
  if (!gunsmith) failed.push('gunsmith');

  const itemTaskLinks = new Map<string, string[]>();
  if (tasks) {
    for (const link of collectItemTaskLinks(tasks)) {
      const list = itemTaskLinks.get(link.itemId) ?? [];
      list.push(link.taskId);
      itemTaskLinks.set(link.itemId, list);
    }
  }

  const craftBuilt = economy
    ? buildCraftDocuments(economy.crafts, gameMode)
    : { documents: [] as SearchDocument[], itemCraftLinks: new Map<string, string[]>() };

  const combatIds = new Set<string>();
  if (combat) {
    for (const round of combat.ammo) combatIds.add(round.id);
    for (const piece of combat.armor) combatIds.add(piece.id);
  }

  const documents: SearchDocument[] = [];
  if (items) {
    documents.push(
      ...buildItemDocuments(items, gameMode, itemTaskLinks, craftBuilt.itemCraftLinks, combatIds),
    );
  }
  if (combat) {
    documents.push(...buildAmmoDocuments(combat.ammo, gameMode, locale, itemTaskLinks));
    documents.push(...buildArmorDocuments(combat.armor, gameMode, itemTaskLinks));
  }
  if (tasks) documents.push(...buildTaskDocuments(tasks, gameMode));
  documents.push(...craftBuilt.documents);
  if (gunsmith) documents.push(...buildGunsmithDocuments(gunsmith, gameMode));
  if (maps) {
    const meta = tasks ? mapTaskMeta(tasks) : { counts: new Map(), ids: new Map() };
    documents.push(...buildMapDocuments(maps, gameMode, meta.counts, meta.ids));
  }

  const uniqueFailed = [...new Set(failed)];
  const payload: SearchIndexPayload = {
    meta: {
      locale,
      gameMode,
      generatedAt: new Date().toISOString(),
      documentCount: documents.length,
      domainCounts: countByDomain(documents),
      failedDomains: uniqueFailed,
      partial: uniqueFailed.length > 0,
    },
    documents,
  };

  cache.set(key, { payload, builtAt: Date.now() });
  return payload;
}

export function clearSearchIndexCache(): void {
  cache.clear();
}
