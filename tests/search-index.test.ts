import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  buildAmmoDocuments,
  buildItemDocuments,
  buildMapDocuments,
  buildTaskDocuments,
  collectItemTaskLinks,
  deduplicateResults,
  editDistanceAtMost,
  enrichSearchHit,
  findRelatedDocuments,
  groupSearchResults,
  normalizeSearchText,
  pushRecentSearch,
  recoverRecentSearches,
  scoreSearchDocument,
  searchDocuments,
  tokenizeSearchText,
  truncateQuery,
  type SearchDocument,
} from '../src/lib/search/index';
import type { Item, Task } from '../src/types/tarkov';

function doc(partial: Partial<SearchDocument> & Pick<SearchDocument, 'id' | 'domain' | 'title'>): SearchDocument {
  return {
    aliases: [],
    keywords: [],
    href: '/x',
    gameModes: ['regular'],
    ...partial,
  };
}

describe('normalizeSearchText', () => {
  test('lowercases and trims', () => {
    assert.equal(normalizeSearchText('  Salewa  ', 'en'), 'salewa');
  });
  test('collapses separators and punctuation', () => {
    assert.equal(normalizeSearchText('M4A1-S_mod!!', 'en'), 'm4a1 s mod');
  });
  test('keeps hangul', () => {
    assert.equal(normalizeSearchText('살레와', 'ko'), '살레와');
  });
  test('keeps chinese', () => {
    assert.equal(normalizeSearchText('医疗包', 'zh'), '医疗包');
  });
  test('empty and long strings', () => {
    assert.equal(normalizeSearchText(''), '');
    assert.equal(truncateQuery('x'.repeat(200)).truncated, true);
    assert.equal(truncateQuery('x'.repeat(200)).query.length, 100);
  });
  test('tokenize', () => {
    assert.deepEqual(tokenizeSearchText('salewa first aid'), ['salewa', 'first', 'aid']);
  });
});

describe('scoreSearchDocument', () => {
  const salewa = doc({
    id: '1',
    domain: 'item',
    title: 'Salewa first aid kit',
    shortName: 'Salewa',
    aliases: ['salewa'],
    titleEn: 'Salewa first aid kit',
  });

  test('exact title beats substring', () => {
    const exact = scoreSearchDocument(doc({ id: 'a', domain: 'item', title: 'Salewa' }), 'salewa');
    const sub = scoreSearchDocument(salewa, 'salewa');
    assert.ok(exact && sub);
    assert.ok(exact.score >= sub.score);
  });

  test('short name exact', () => {
    const hit = scoreSearchDocument(salewa, 'salewa');
    assert.equal(hit?.matchKind, 'exact-short');
  });

  test('prefix and substring', () => {
    assert.equal(scoreSearchDocument(salewa, 'salewa first')?.matchKind, 'prefix-title');
    assert.ok(scoreSearchDocument(salewa, 'first aid'));
  });

  test('typo distance helper', () => {
    assert.equal(editDistanceAtMost('salewa', 'salewa', 1), 0);
    assert.equal(editDistanceAtMost('salewa', 'saleva', 1), 1);
    assert.equal(editDistanceAtMost('salewa', 'xxxxxx', 1), null);
  });
});

describe('searchDocuments limits', () => {
  const documents: SearchDocument[] = [];
  for (let i = 0; i < 20; i += 1) {
    documents.push(doc({ id: `i${i}`, domain: 'item', title: `Salewa pack ${i}` }));
    documents.push(doc({ id: `t${i}`, domain: 'task', title: `Salewa quest ${i}` }));
  }

  test('applies per-domain and total limits', () => {
    const result = searchDocuments(documents, 'salewa', {
      perDomainLimit: 3,
      totalLimit: 5,
    });
    assert.ok(result.total <= 5);
    for (const group of result.groups) {
      assert.ok(group.results.length <= 3);
    }
  });

  test('dedupe by domain:id', () => {
    const hits = [
      { document: documents[0], score: 10, matchKind: 'exact-title' as const },
      { document: documents[0], score: 5, matchKind: 'substring-title' as const },
    ];
    assert.equal(deduplicateResults(hits).length, 1);
  });

  test('mode filter', () => {
    const mixed = [
      doc({ id: '1', domain: 'task', title: 'Only PvE', gameModes: ['pve'] }),
      doc({ id: '2', domain: 'task', title: 'Shared Salewa', gameModes: ['regular', 'pve'] }),
    ];
    const result = searchDocuments(mixed, 'salewa', { gameMode: 'regular' });
    assert.equal(result.total, 1);
    assert.equal(result.groups[0]?.results[0]?.document.id, '2');
  });
});

describe('relations and enrichment', () => {
  test('collectItemTaskLinks uses representative item id', () => {
    const tasks = [
      {
        id: 'task1',
        objectives: [
          { id: 'o1', type: 'giveItem', items: ['itemA', 'itemB'], count: 1, optional: false, description: '', foundInRaid: true },
          { id: 'o2', type: 'kill', items: null, count: null, optional: false, description: '', foundInRaid: null },
        ],
      },
    ] as unknown as Task[];
    assert.deepEqual(collectItemTaskLinks(tasks), [{ itemId: 'itemA', taskId: 'task1' }]);
  });

  test('findRelatedDocuments links item to tasks and crafts', () => {
    const item = doc({
      id: 'salewa',
      domain: 'item',
      title: 'Salewa',
      relations: { taskIds: ['t1'], craftIds: ['c1'] },
    });
    const task = doc({ id: 't1', domain: 'task', title: 'Shortage' });
    const craft = doc({ id: 'c1', domain: 'craft', title: 'Craft Salewa' });
    const related = findRelatedDocuments([item, task, craft], item);
    assert.equal(related.length, 2);
  });

  test('enrichSearchHit attaches owned and quest status', () => {
    const hit = {
      document: doc({ id: 'salewa', domain: 'item', title: 'Salewa' }),
      score: 100,
      matchKind: 'exact-short' as const,
    };
    const enriched = enrichSearchHit(
      hit,
      {
        activeQuestIds: new Set(['t1']),
        completedQuestIds: new Set(),
        ownedItemCounts: { salewa: 2 },
        requiredItemTaskIds: new Map([['salewa', ['t1']]]),
      },
      'regular',
    );
    assert.equal(enriched.ownedCount, 2);
    assert.equal(enriched.requiredByActiveQuests, true);
  });
});

describe('document builders', () => {
  test('buildItemDocuments skips ammo/armor types', () => {
    const items = [
      { id: '1', name: 'Salewa', shortName: 'Salewa', width: 2, height: 2, weight: 0.4, types: ['meds'], avg24hPrice: 1000, bestVendorSellRUB: 500, low24hPrice: null, high24hPrice: null, changeLast48hPercent: null, updated: null, iconLink: null },
      { id: '2', name: 'M855', shortName: 'M855', width: 1, height: 1, weight: 0.01, types: ['ammo'], avg24hPrice: 100, bestVendorSellRUB: null, low24hPrice: null, high24hPrice: null, changeLast48hPercent: null, updated: null, iconLink: null },
    ] as Item[];
    const docs = buildItemDocuments(items, 'regular', new Map(), new Map(), new Set());
    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.id, '1');
  });

  test('buildAmmoDocuments includes caliber alias', () => {
    const docs = buildAmmoDocuments(
      [
        {
          id: 'a1',
          name: '5.45x39mm PS',
          shortName: 'PS',
          iconLink: null,
          caliber: 'Caliber545x39',
          damage: 50,
          penetrationPower: 30,
          armorDamage: 40,
          initialSpeed: null,
          fragmentationChance: null,
          ricochetChance: null,
          accuracyModifier: null,
          recoilModifier: null,
          heavyBleedModifier: null,
          lightBleedModifier: null,
          tracer: false,
        },
      ],
      'regular',
      'en',
      new Map(),
    );
    assert.ok(docs[0]?.aliases.some((alias) => alias.toLowerCase().includes('5.45')));
  });

  test('buildTaskDocuments carry nameEn', () => {
    const tasks = [
      {
        id: '5a27d2af86f7744e111b0000',
        name: '맛있는 소시지',
        nameEn: 'The Delicious Sausage',
        trader: { id: 'tr', name: 'Therapist', imageLink: null, hasStore: true, resetTime: null },
        map: null,
        minPlayerLevel: 1,
        kappaRequired: null,
        experience: null,
        taskImageLink: null,
        wikiLink: null,
        requirements: [],
        objectives: [],
      },
    ] as Task[];
    const docs = buildTaskDocuments(tasks, 'regular');
    assert.equal(docs[0]?.titleEn, 'The Delicious Sausage');
    assert.match(docs[0]?.href ?? '', /progression\/tasks\//);
  });

  test('buildMapDocuments omit zero quest counts', () => {
    const docs = buildMapDocuments(
      [
        {
          id: 'customs',
          name: 'Customs',
          description: null,
          wiki: null,
          players: '8-12',
          raidDuration: 45,
          bosses: [],
        },
      ],
      'regular',
      new Map([['customs', 0]]),
      new Map(),
    );
    assert.equal(docs[0]?.numeric?.questCount, undefined);
  });
});

describe('recent searches', () => {
  test('push dedupes and caps at 10', () => {
    let list: ReturnType<typeof pushRecentSearch> = [];
    for (let i = 0; i < 12; i += 1) {
      list = pushRecentSearch(list, {
        query: `query ${i}`,
        searchedAt: `2026-08-03T12:00:${String(i).padStart(2, '0')}.000Z`,
      });
    }
    assert.equal(list.length, 10);
    list = pushRecentSearch(list, {
      query: 'query 11',
      searchedAt: '2026-08-03T13:00:00.000Z',
    });
    assert.equal(list[0]?.query, 'query 11');
    assert.equal(list.filter((row) => row.normalizedQuery === normalizeSearchText('query 11')).length, 1);
  });

  test('rejects empty query', () => {
    assert.deepEqual(pushRecentSearch([], { query: '   ', searchedAt: '2026-08-03T12:00:00.000Z' }), []);
  });

  test('recoverRecentSearches drops invalid entries', () => {
    const recovered = recoverRecentSearches([
      { query: 'ok', normalizedQuery: 'ok', searchedAt: '2026-08-03T12:00:00.000Z' },
      { query: '', normalizedQuery: 'x', searchedAt: '2026-08-03T12:00:00.000Z' },
      null,
    ]);
    assert.equal(recovered.length, 1);
  });
});

describe('groupSearchResults promotion', () => {
  test('exact domain floats up', () => {
    const groups = groupSearchResults([
      { document: doc({ id: '1', domain: 'map', title: 'Factory' }), score: 300, matchKind: 'keyword' },
      { document: doc({ id: '2', domain: 'item', title: 'Factory key' }), score: 1000, matchKind: 'exact-title' },
    ]);
    assert.equal(groups[0]?.domain, 'item');
  });
});
