import type {
  EnrichedSearchHit,
  ScoredSearchDocument,
  SearchResultSet,
  SearchUserState,
} from './types';

export function emptySearchUserState(): SearchUserState {
  return {
    activeQuestIds: new Set(),
    completedQuestIds: new Set(),
    ownedItemCounts: {},
    requiredItemTaskIds: new Map(),
  };
}

/**
 * Build the itemId → active-taskIds map from relation data already on
 * documents plus the player's active quest set. Pure — no storage access.
 */
export function buildRequiredItemIndex(
  itemTaskPairs: ReadonlyArray<{ itemId: string; taskId: string }>,
  activeQuestIds: ReadonlySet<string>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const { itemId, taskId } of itemTaskPairs) {
    if (!activeQuestIds.has(taskId)) continue;
    const list = map.get(itemId) ?? [];
    if (!list.includes(taskId)) list.push(taskId);
    map.set(itemId, list);
  }
  return map;
}

export function enrichSearchHit(
  hit: ScoredSearchDocument,
  user: SearchUserState,
  currentMode: 'regular' | 'pve',
): EnrichedSearchHit {
  const { document } = hit;
  const enriched: EnrichedSearchHit = { ...hit };

  if (!document.gameModes.includes(currentMode)) {
    enriched.otherModeOnly = true;
  }

  if (document.domain === 'task') {
    if (user.activeQuestIds.has(document.id)) enriched.questStatus = 'active';
    else if (user.completedQuestIds.has(document.id)) enriched.questStatus = 'completed';
    else enriched.questStatus = null;
  }

  if (document.domain === 'item' || document.domain === 'ammo' || document.domain === 'armor') {
    const owned = user.ownedItemCounts[document.id];
    if (typeof owned === 'number' && owned > 0) enriched.ownedCount = owned;

    const requiredBy = user.requiredItemTaskIds.get(document.id);
    if (requiredBy && requiredBy.length > 0) {
      enriched.requiredByActiveQuests = true;
      enriched.requiredByTaskIds = [...requiredBy];
    }
  }

  if (document.domain === 'gunsmith') {
    if (user.activeQuestIds.has(document.id)) enriched.questStatus = 'active';
    else if (user.completedQuestIds.has(document.id)) enriched.questStatus = 'completed';
    else enriched.questStatus = null;
  }

  return enriched;
}

export function enrichSearchResults(
  results: SearchResultSet,
  user: SearchUserState,
  currentMode: 'regular' | 'pve',
): Array<{ domain: SearchResultSet['groups'][number]['domain']; results: EnrichedSearchHit[] }> {
  return results.groups.map((group) => ({
    domain: group.domain,
    results: group.results.map((hit) => enrichSearchHit(hit, user, currentMode)),
  }));
}

/** Related documents for a primary hit — same ids, different domains. */
export function findRelatedDocuments(
  documents: readonly import('./types').SearchDocument[],
  primary: import('./types').SearchDocument,
  limit = 5,
): import('./types').SearchDocument[] {
  const related: import('./types').SearchDocument[] = [];
  const seen = new Set<string>([`${primary.domain}:${primary.id}`]);

  const push = (doc: import('./types').SearchDocument | undefined) => {
    if (!doc) return;
    const key = `${doc.domain}:${doc.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    related.push(doc);
  };

  const byId = new Map<string, import('./types').SearchDocument[]>();
  for (const doc of documents) {
    const list = byId.get(doc.id) ?? [];
    list.push(doc);
    byId.set(doc.id, list);
  }

  if (primary.domain === 'item') {
    for (const taskId of primary.relations?.taskIds ?? []) {
      const tasks = documents.filter((d) => d.domain === 'task' && d.id === taskId);
      for (const t of tasks) push(t);
      if (related.length >= limit) return related.slice(0, limit);
    }
    for (const craftId of primary.relations?.craftIds ?? []) {
      const crafts = documents.filter((d) => d.domain === 'craft' && d.id === craftId);
      for (const c of crafts) push(c);
      if (related.length >= limit) return related.slice(0, limit);
    }
  }

  if (primary.domain === 'task') {
    for (const itemId of primary.relations?.itemIds ?? []) {
      for (const doc of byId.get(itemId) ?? []) {
        if (doc.domain === 'item' || doc.domain === 'ammo' || doc.domain === 'armor') {
          push(doc);
        }
      }
      if (related.length >= limit) return related.slice(0, limit);
    }
  }

  if (primary.domain === 'map') {
    for (const taskId of primary.relations?.taskIds ?? []) {
      for (const doc of documents) {
        if (doc.domain === 'task' && doc.id === taskId) push(doc);
      }
      if (related.length >= limit) return related.slice(0, limit);
    }
  }

  if (primary.domain === 'gunsmith') {
    for (const doc of documents) {
      if (doc.domain === 'task' && doc.id === primary.id) push(doc);
    }
  }

  if (primary.domain === 'craft') {
    for (const itemId of primary.relations?.itemIds ?? []) {
      for (const doc of byId.get(itemId) ?? []) {
        if (doc.domain === 'item') push(doc);
      }
    }
  }

  return related.slice(0, limit);
}
