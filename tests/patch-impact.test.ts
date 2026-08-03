import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiveEntry } from '@/types/live';
import {
  applyPatchImpactOverride,
  detectDuplicateOverrideIds,
  detectOrphanOverrides,
  type PatchImpactOverride,
} from '@/lib/live/patch-impact-overrides';
import {
  buildRelatedToolLinks,
  calculatePatchConfidence,
  classifyGameModeScope,
  classifyImpactAreas,
  determineEventState,
  determinePatchDataSync,
  extractPatchVersion,
  filterPatchImpacts,
  normalizePatchImpact,
  parsePatchImpactFilters,
  projectLiveEntriesToPatchImpacts,
  resolvePatchSummary,
  selectCurrentPatchImpact,
  sortPatchImpacts,
} from '@/lib/live/patch-impact';

function entry(partial: Partial<LiveEntry> & Pick<LiveEntry, 'id' | 'title'>): LiveEntry {
  return {
    source: 'steam',
    account: null,
    sourcePostId: partial.id,
    url: 'https://example.com/post',
    content: partial.content ?? '',
    originalTitle: partial.originalTitle ?? partial.title,
    originalContent: partial.originalContent ?? partial.content ?? '',
    translated: true,
    summary: null,
    playerImpact: null,
    recommendedAction: null,
    category: 'announcement',
    reliability: 'official_confirmed',
    reviewStatus: 'reviewed',
    gameModes: ['unknown'],
    affects: [],
    maps: [],
    bosses: [],
    traders: [],
    items: [],
    quests: [],
    tags: [],
    startsAt: null,
    endsAt: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    collectedAt: '2026-08-01T01:00:00.000Z',
    lastCheckedAt: '2026-08-01T01:00:00.000Z',
    imageUrl: null,
    youtubeVideoId: null,
    contentHash: 'abcd',
    manualFields: [],
    interpretation: null,
    confirmations: [],
    ...partial,
  };
}

test('extractPatchVersion reads Patch N.N from titles only', () => {
  assert.equal(extractPatchVersion('Patch 0.16.8.1'), '0.16.8.1');
  assert.equal(extractPatchVersion('Weekly sale'), undefined);
});

test('classifyImpactAreas prefers structured affects over category', () => {
  const fromAffects = classifyImpactAreas({
    affects: ['quest', 'trader'],
    category: 'patch',
    manualFields: [],
  });
  assert.deepEqual(fromAffects.areas.sort(), ['quests', 'traders']);

  const fromPatch = classifyImpactAreas({
    affects: [],
    category: 'patch',
    manualFields: [],
  });
  assert.deepEqual(fromPatch.areas, ['unknown']);
});

test('classifyGameModeScope maps pvp/pve without guessing', () => {
  assert.equal(classifyGameModeScope(['pvp']), 'regular');
  assert.equal(classifyGameModeScope(['pve']), 'pve');
  assert.equal(classifyGameModeScope(['pvp', 'pve']), 'both');
  assert.equal(classifyGameModeScope(['arena']), 'unknown');
  assert.equal(classifyGameModeScope(['unknown']), 'unknown');
});

test('determineEventState covers window boundaries', () => {
  const now = Date.parse('2026-08-03T12:00:00.000Z');
  assert.equal(
    determineEventState(
      { startsAt: '2026-08-04T00:00:00.000Z', endsAt: '2026-08-05T00:00:00.000Z', manualFields: [] },
      now,
    ),
    'upcoming',
  );
  assert.equal(
    determineEventState(
      { startsAt: '2026-08-01T00:00:00.000Z', endsAt: '2026-08-10T00:00:00.000Z', manualFields: [] },
      now,
    ),
    'active',
  );
  assert.equal(
    determineEventState(
      { startsAt: '2026-07-01T00:00:00.000Z', endsAt: '2026-07-02T00:00:00.000Z', manualFields: [] },
      now,
    ),
    'ended',
  );
  assert.equal(
    determineEventState({ startsAt: null, endsAt: null, manualFields: [] }, now),
    'unknown',
  );
});

test('determinePatchDataSync never treats missing stamps as reflected', () => {
  const unknown = determinePatchDataSync({
    effectiveAt: '2026-08-01T00:00:00.000Z',
    impactAreas: ['economy'],
    observations: [],
  });
  assert.equal(unknown.overall, 'unknown');

  const noContentContract = determinePatchDataSync({
    effectiveAt: '2026-08-01T00:00:00.000Z',
    impactAreas: ['quests'],
    observations: [{ domain: 'quests', supportsSourceTimestamp: false }],
  });
  assert.equal(noContentContract.overall, 'unknown');
  assert.equal(noContentContract.domains[0]?.reasonCode, 'no-content-timestamp-contract');

  const reflected = determinePatchDataSync({
    effectiveAt: '2026-08-01T00:00:00.000Z',
    impactAreas: ['economy'],
    observations: [
      {
        domain: 'itemPrices',
        supportsSourceTimestamp: true,
        sourceUpdatedAt: '2026-08-02T00:00:00.000Z',
      },
      {
        domain: 'traderPrices',
        supportsSourceTimestamp: false,
      },
    ],
  });
  assert.equal(reflected.overall, 'partially-reflected');

  const notYet = determinePatchDataSync({
    effectiveAt: '2026-08-03T00:00:00.000Z',
    impactAreas: ['economy'],
    observations: [
      {
        domain: 'itemPrices',
        supportsSourceTimestamp: true,
        sourceUpdatedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        domain: 'traderPrices',
        supportsSourceTimestamp: true,
        sourceUpdatedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
  });
  assert.equal(notYet.overall, 'not-yet-confirmed');
});

test('human override wins and marks human-reviewed', () => {
  const override: PatchImpactOverride = {
    entryId: 'steam:1',
    impactAreas: ['ammo', 'armor'],
    gameModeScope: 'both',
    shortSummary: 'Ballistics pass for both modes.',
    reviewStatus: 'human-reviewed',
  };
  const base = {
    impactAreas: ['unknown'] as const,
    gameModeScope: 'unknown' as const,
    shortSummary: undefined,
    evidenceCodes: ['category:patch-unscoped'],
    reviewStatus: 'machine-classified' as const,
  };
  const applied = applyPatchImpactOverride({ ...base, impactAreas: ['unknown'] }, override);
  assert.deepEqual(applied.impactAreas, ['ammo', 'armor']);
  assert.equal(applied.reviewStatus, 'human-reviewed');
  assert.ok(applied.evidenceCodes.includes('override:steam:1'));
});

test('resolvePatchSummary prefers human then existing summary then template', () => {
  assert.equal(
    resolvePatchSummary({
      overrideSummary: 'Reviewed note',
      entrySummary: 'Auto summary',
      kind: 'patch',
      impactAreas: ['economy'],
      gameModeScope: 'regular',
    }),
    'Reviewed note',
  );
  assert.equal(
    resolvePatchSummary({
      entrySummary: 'Safe summary',
      kind: 'patch',
      impactAreas: ['economy'],
      gameModeScope: 'unknown',
    }),
    'Safe summary',
  );
  assert.match(
    resolvePatchSummary({
      kind: 'patch',
      patchVersion: '0.16.8.1',
      impactAreas: ['unknown'],
      gameModeScope: 'unknown',
    }) ?? '',
    /Patch 0\.16\.8\.1/,
  );
  assert.equal(
    resolvePatchSummary({
      kind: 'announcement',
      impactAreas: ['unknown'],
      gameModeScope: 'unknown',
    }),
    undefined,
  );
});

test('normalizePatchImpact projects LiveEntry without inventing mode scope', () => {
  const impact = normalizePatchImpact(
    entry({
      id: 'steam:patch-1',
      title: 'Patch 0.16.8.1',
      category: 'patch',
      affects: ['item', 'quest'],
      gameModes: ['pvp'],
      summary: 'Item and quest adjustments.',
    }),
    { now: Date.parse('2026-08-03T12:00:00.000Z') },
  );
  assert.equal(impact.patchVersion, '0.16.8.1');
  assert.deepEqual(impact.impactAreas.sort(), ['items', 'quests']);
  assert.equal(impact.gameModeScope, 'regular');
  assert.equal(impact.shortSummary, 'Item and quest adjustments.');
  assert.equal(impact.confidence, 'high');
});

test('filter and sort helpers', () => {
  const impacts = projectLiveEntriesToPatchImpacts(
    [
      entry({
        id: 'a',
        title: 'Patch 1.0.0',
        category: 'patch',
        affects: ['item'],
        publishedAt: '2026-08-02T00:00:00.000Z',
      }),
      entry({
        id: 'b',
        title: 'Double XP weekend',
        category: 'event',
        affects: ['xp'],
        gameModes: ['pve'],
        startsAt: '2026-08-01T00:00:00.000Z',
        endsAt: '2026-08-10T00:00:00.000Z',
        publishedAt: '2026-08-01T00:00:00.000Z',
      }),
    ],
    { now: Date.parse('2026-08-03T12:00:00.000Z') },
  );
  const sorted = sortPatchImpacts(impacts);
  assert.equal(sorted[0]?.liveEntryId, 'a');
  const economyOnly = filterPatchImpacts(impacts, { area: 'items' });
  assert.equal(economyOnly.length, 1);
  const pveEvents = filterPatchImpacts(impacts, { mode: 'pve', kind: 'event' });
  assert.equal(pveEvents.length, 1);
  assert.equal(selectCurrentPatchImpact(impacts)?.patchVersion, '1.0.0');
});

test('parsePatchImpactFilters ignores invalid values', () => {
  const parsed = parsePatchImpactFilters({
    area: 'not-real',
    mode: 'regular',
    type: 'hotfix',
    state: 'active',
    review: 'machine-classified',
  });
  assert.equal(parsed.area, 'all');
  assert.equal(parsed.mode, 'regular');
  assert.equal(parsed.kind, 'hotfix');
  assert.equal(parsed.state, 'active');
  assert.equal(parsed.review, 'machine-classified');
});

test('related tools only for known areas', () => {
  const links = buildRelatedToolLinks(['economy', 'ammo', 'technical', 'unknown']);
  assert.deepEqual(
    links.map((l) => l.href),
    ['/economy/items', '/combat/ammo'],
  );
});

test('override registry duplicate and orphan detection', () => {
  const overrides: PatchImpactOverride[] = [
    { entryId: 'a', reviewStatus: 'human-reviewed' },
    { entryId: 'a', reviewStatus: 'human-reviewed' },
    { entryId: 'missing', reviewStatus: 'human-reviewed' },
  ];
  assert.deepEqual(detectDuplicateOverrideIds(overrides), ['a']);
  assert.deepEqual(detectOrphanOverrides(['a'], overrides), ['missing']);
});

test('confidence stays low for unscoped patch titles', () => {
  assert.equal(
    calculatePatchConfidence({
      reviewStatus: 'unreviewed',
      evidenceCodes: ['category:patch-unscoped'],
      impactAreas: ['unknown'],
      gameModeScope: 'unknown',
    }),
    'low',
  );
});
