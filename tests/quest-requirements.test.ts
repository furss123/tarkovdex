import assert from 'node:assert/strict';
import test from 'node:test';
import type { Task, TaskObjective } from '../src/types/tarkov';
import {
  aggregateRequiredItems,
  findOrphanedIds,
  withOwnedAndMissing,
} from '../src/lib/quest-requirements';

function objective(overrides: Partial<TaskObjective> & { id: string; type: string }): TaskObjective {
  return {
    description: '',
    optional: false,
    count: null,
    items: null,
    foundInRaid: null,
    ...overrides,
  };
}

function task(id: string, objectives: TaskObjective[]): Task {
  return {
    id,
    name: id,
    nameEn: null,
    trader: null,
    map: null,
    minPlayerLevel: null,
    kappaRequired: null,
    experience: null,
    taskImageLink: null,
    wikiLink: null,
    requirements: [],
    objectives,
  };
}

test('empty task list produces no lines and no skips', () => {
  const result = aggregateRequiredItems([], false);
  assert.deepEqual(result.lines, []);
  assert.deepEqual(result.skipped, []);
});

test('a single giveItem objective aggregates to one line', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveItem', count: 3, items: ['item-a'], foundInRaid: true }),
  ]);
  const { lines } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines, [
    { itemId: 'item-a', totalRequired: 3, questIds: ['q1'], objectiveCount: 1, hasAlternatives: false, foundInRaid: true },
  ]);
});

test('the same item across two different quests sums', () => {
  const a = task('q1', [objective({ id: 'o1', type: 'giveItem', count: 2, items: ['item-a'] })]);
  const b = task('q2', [objective({ id: 'o2', type: 'findItem', count: 5, items: ['item-a'] })]);
  const { lines } = aggregateRequiredItems([a, b], false);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].totalRequired, 7);
  assert.deepEqual(lines[0].questIds.sort(), ['q1', 'q2']);
});

test('two different item ids are never merged, even with the same count', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveItem', count: 1, items: ['item-a'] }),
    objective({ id: 'o2', type: 'giveItem', count: 1, items: ['item-b'] }),
  ]);
  const { lines } = aggregateRequiredItems([t], false);
  assert.equal(lines.length, 2);
});

test('sellItem and useItem objectives are never aggregated as required items', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'sellItem', count: 50, items: ['item-a', 'item-b', 'item-c'] }),
    objective({ id: 'o2', type: 'useItem', count: 1, items: ['item-d'] }),
  ]);
  const { lines, skipped } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines, []);
  assert.deepEqual(skipped, [], 'not aggregatable types are silently out of scope, not reported as skipped');
});

test('quest-item objectives (giveQuestItem/findQuestItem/plantQuestItem) are never aggregated', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveQuestItem', count: 1, items: null }),
    objective({ id: 'o2', type: 'findQuestItem', count: 1, items: null }),
  ]);
  const { lines } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines, []);
});

test('a giveItem objective with no items[] is recorded as skipped, not assumed', () => {
  const t = task('q1', [objective({ id: 'o1', type: 'giveItem', count: 3, items: null })]);
  const { lines, skipped } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines, []);
  assert.deepEqual(skipped, [{ taskId: 'q1', objectiveId: 'o1', reason: 'no-items' }]);
});

test('a giveItem objective with no count is recorded as skipped, never assumed to be 1', () => {
  const t = task('q1', [objective({ id: 'o1', type: 'giveItem', count: null, items: ['item-a'] })]);
  const { lines, skipped } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines, []);
  assert.deepEqual(skipped, [{ taskId: 'q1', objectiveId: 'o1', reason: 'no-count' }]);
});

test('a zero or negative count is treated the same as missing — never included', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveItem', count: 0, items: ['item-a'] }),
    objective({ id: 'o2', type: 'giveItem', count: -1, items: ['item-b'] }),
  ]);
  const { lines, skipped } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines, []);
  assert.equal(skipped.length, 2);
});

test('optional objectives are excluded by default and included when requested', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveItem', count: 2, items: ['item-a'], optional: true }),
  ]);
  const excluded = aggregateRequiredItems([t], false);
  assert.deepEqual(excluded.lines, []);
  const included = aggregateRequiredItems([t], true);
  assert.equal(included.lines.length, 1);
  assert.equal(included.lines[0].totalRequired, 2);
});

test('an objective with multiple alternative items uses items[0] as representative and flags alternatives', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveItem', count: 3, items: ['item-a', 'item-b', 'item-c'] }),
  ]);
  const { lines } = aggregateRequiredItems([t], false);
  assert.equal(lines[0].itemId, 'item-a');
  assert.equal(lines[0].hasAlternatives, true);
});

test('foundInRaid is true only when every contributing objective agrees; null when they disagree', () => {
  const a = task('q1', [objective({ id: 'o1', type: 'giveItem', count: 1, items: ['item-a'], foundInRaid: true })]);
  const b = task('q2', [objective({ id: 'o2', type: 'giveItem', count: 1, items: ['item-a'], foundInRaid: false })]);
  const { lines } = aggregateRequiredItems([a, b], false);
  assert.equal(lines[0].foundInRaid, null, 'disagreement is honestly reported as unknown, not guessed');
});

test('foundInRaid is null (not false) when no contributing objective reports a value', () => {
  const t = task('q1', [objective({ id: 'o1', type: 'giveItem', count: 1, items: ['item-a'], foundInRaid: null })]);
  const { lines } = aggregateRequiredItems([t], false);
  assert.equal(lines[0].foundInRaid, null);
});

test('duplicate objective ids across two different tasks (the real audit finding) both contribute', () => {
  // Confirmed live: the same objective id can be reused by unrelated quests.
  // Both must still count — objective identity for aggregation purposes is
  // (taskId, objective), not the bare objective id.
  const a = task('q1', [objective({ id: 'shared-obj', type: 'giveItem', count: 1, items: ['item-a'] })]);
  const b = task('q2', [objective({ id: 'shared-obj', type: 'giveItem', count: 1, items: ['item-a'] })]);
  const { lines } = aggregateRequiredItems([a, b], false);
  assert.equal(lines[0].totalRequired, 2);
  assert.equal(lines[0].objectiveCount, 2);
});

test('an unknown objective type is simply not aggregated, never throws', () => {
  const t = task('q1', [objective({ id: 'o1', type: 'someBrandNewType', count: 1, items: ['item-a'] })]);
  assert.doesNotThrow(() => aggregateRequiredItems([t], false));
  assert.deepEqual(aggregateRequiredItems([t], false).lines, []);
});

test('lines are sorted by total required, descending', () => {
  const t = task('q1', [
    objective({ id: 'o1', type: 'giveItem', count: 1, items: ['item-a'] }),
    objective({ id: 'o2', type: 'giveItem', count: 9, items: ['item-b'] }),
  ]);
  const { lines } = aggregateRequiredItems([t], false);
  assert.deepEqual(lines.map((l) => l.itemId), ['item-b', 'item-a']);
});

// ---------------------------------------------------------------------------
// owned / missing
// ---------------------------------------------------------------------------

test('withOwnedAndMissing computes missing as max(required - owned, 0)', () => {
  const rows = withOwnedAndMissing(
    [{ itemId: 'item-a', totalRequired: 5, questIds: ['q1'], objectiveCount: 1, hasAlternatives: false, foundInRaid: null }],
    { 'item-a': 2 },
  );
  assert.equal(rows[0].owned, 2);
  assert.equal(rows[0].missing, 3);
});

test('missing never goes negative when owned exceeds required', () => {
  const rows = withOwnedAndMissing(
    [{ itemId: 'item-a', totalRequired: 2, questIds: ['q1'], objectiveCount: 1, hasAlternatives: false, foundInRaid: null }],
    { 'item-a': 10 },
  );
  assert.equal(rows[0].missing, 0);
});

test('an item with no owned entry defaults owned to 0, not undefined', () => {
  const rows = withOwnedAndMissing(
    [{ itemId: 'item-a', totalRequired: 4, questIds: ['q1'], objectiveCount: 1, hasAlternatives: false, foundInRaid: null }],
    {},
  );
  assert.equal(rows[0].owned, 0);
  assert.equal(rows[0].missing, 4);
});

// ---------------------------------------------------------------------------
// orphan detection
// ---------------------------------------------------------------------------

test('findOrphanedIds reports quest and map ids absent from current data', () => {
  const report = findOrphanedIds(
    ['q1', 'q2', 'q3'],
    ['map1', null, 'map2'],
    new Set(['q1', 'q3']),
    new Set(['map1']),
  );
  assert.deepEqual(report.orphanedQuestIds, ['q2']);
  assert.deepEqual(report.orphanedMapIds, ['map2']);
});

test('findOrphanedIds reports nothing when everything still resolves', () => {
  const report = findOrphanedIds(['q1'], ['map1', null], new Set(['q1']), new Set(['map1']));
  assert.deepEqual(report.orphanedQuestIds, []);
  assert.deepEqual(report.orphanedMapIds, []);
});

test('findOrphanedIds never treats a null mapId as orphaned', () => {
  const report = findOrphanedIds([], [null, null], new Set(), new Set());
  assert.deepEqual(report.orphanedMapIds, []);
});
