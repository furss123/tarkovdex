import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultState, type LocalState } from '../src/lib/local-state/schema';
import * as reducers from '../src/lib/local-state/quest-reducers';

const NOW = '2026-08-03T12:00:00.000Z';

function fresh(): LocalState {
  return createDefaultState(NOW);
}

// ---------------------------------------------------------------------------
// active / completed
// ---------------------------------------------------------------------------

test('setQuestActive adds a quest to the active list', () => {
  const next = reducers.setQuestActive(fresh(), 'regular', 'q1', true);
  assert.deepEqual(next.modeData.regular.quests.activeQuestIds, ['q1']);
});

test('setQuestActive removing a quest not present is a no-op (same reference)', () => {
  const state = fresh();
  const next = reducers.setQuestActive(state, 'regular', 'q1', false);
  assert.equal(next, state);
});

test('setQuestActive setting the same value twice returns the same reference (no redundant write)', () => {
  const once = reducers.setQuestActive(fresh(), 'regular', 'q1', true);
  const twice = reducers.setQuestActive(once, 'regular', 'q1', true);
  assert.equal(twice, once);
});

test('an empty or whitespace-only quest id is rejected', () => {
  const state = fresh();
  assert.equal(reducers.setQuestActive(state, 'regular', '', true), state);
  assert.equal(reducers.setQuestActive(state, 'regular', '   ', true), state);
});

test('activating the same quest id twice does not duplicate it', () => {
  let state = fresh();
  state = reducers.setQuestActive(state, 'regular', 'q1', true);
  state = reducers.setQuestActive(state, 'regular', 'q1', true);
  assert.deepEqual(state.modeData.regular.quests.activeQuestIds, ['q1']);
});

test('completing a quest removes it from active (documented policy)', () => {
  let state = fresh();
  state = reducers.setQuestActive(state, 'regular', 'q1', true);
  state = reducers.setQuestCompleted(state, 'regular', 'q1', true);
  assert.deepEqual(state.modeData.regular.quests.activeQuestIds, []);
  assert.deepEqual(state.modeData.regular.quests.completedQuestIds, ['q1']);
});

test('un-completing a quest does NOT restore it to active (documented policy)', () => {
  let state = fresh();
  state = reducers.setQuestActive(state, 'regular', 'q1', true);
  state = reducers.setQuestCompleted(state, 'regular', 'q1', true);
  state = reducers.setQuestCompleted(state, 'regular', 'q1', false);
  assert.deepEqual(state.modeData.regular.quests.completedQuestIds, []);
  assert.deepEqual(state.modeData.regular.quests.activeQuestIds, [], 'must not silently reappear as active');
});

test('bulkSetQuestStatus applies several updates as one transition', () => {
  const state = fresh();
  const next = reducers.bulkSetQuestStatus(state, 'regular', [
    { questId: 'q1', active: true },
    { questId: 'q2', active: true },
    { questId: 'q3', active: true, completed: true },
  ]);
  assert.deepEqual(next.modeData.regular.quests.activeQuestIds.sort(), ['q1', 'q2']);
  assert.deepEqual(next.modeData.regular.quests.completedQuestIds, ['q3']);
});

test('activeQuestIds is capped and stops accepting more past the limit', () => {
  let state = fresh();
  // Cheaply exercise the cap without 1000 real calls: seed activeQuestIds
  // near the ceiling directly via the reducer's own normalization.
  const nearLimit = Array.from({ length: 999 }, (_, i) => `seed-${i}`);
  state = {
    ...state,
    modeData: {
      ...state.modeData,
      regular: {
        ...state.modeData.regular,
        quests: { ...state.modeData.regular.quests, activeQuestIds: nearLimit },
      },
    },
  };
  const withOneMore = reducers.setQuestActive(state, 'regular', 'the-1000th', true);
  assert.equal(withOneMore.modeData.regular.quests.activeQuestIds.length, 1000);
  const withOverflow = reducers.setQuestActive(withOneMore, 'regular', 'overflow', true);
  assert.equal(withOverflow.modeData.regular.quests.activeQuestIds.length, 1000, 'the 1001st id is dropped, not appended');
});

// ---------------------------------------------------------------------------
// owned item counts
// ---------------------------------------------------------------------------

test('setOwnedItemCount stores a positive integer count', () => {
  const next = reducers.setOwnedItemCount(fresh(), 'regular', 'item1', 5);
  assert.equal(next.modeData.regular.quests.ownedItemCounts.item1, 5);
});

test('setOwnedItemCount of 0 removes the key entirely rather than storing a zero', () => {
  let state = reducers.setOwnedItemCount(fresh(), 'regular', 'item1', 5);
  state = reducers.setOwnedItemCount(state, 'regular', 'item1', 0);
  assert.equal('item1' in state.modeData.regular.quests.ownedItemCounts, false);
});

test('setOwnedItemCount rejects negative and non-finite values by clamping to 0', () => {
  const negative = reducers.setOwnedItemCount(fresh(), 'regular', 'item1', -5);
  assert.equal('item1' in negative.modeData.regular.quests.ownedItemCounts, false);
  const nan = reducers.setOwnedItemCount(fresh(), 'regular', 'item1', Number.NaN);
  assert.equal('item1' in nan.modeData.regular.quests.ownedItemCounts, false);
});

test('setOwnedItemCount clamps an absurdly large value to the maximum', () => {
  const next = reducers.setOwnedItemCount(fresh(), 'regular', 'item1', 50_000_000);
  assert.equal(next.modeData.regular.quests.ownedItemCounts.item1, 999_999);
});

test('setOwnedItemCount with the same value twice is a no-op', () => {
  const once = reducers.setOwnedItemCount(fresh(), 'regular', 'item1', 5);
  const twice = reducers.setOwnedItemCount(once, 'regular', 'item1', 5);
  assert.equal(twice, once);
});

test('resetQuestProgress clears active/completed/owned but leaves raid plans alone', () => {
  let state = fresh();
  state = reducers.setQuestActive(state, 'regular', 'q1', true);
  state = reducers.setOwnedItemCount(state, 'regular', 'item1', 3);
  const { state: withPlan } = reducers.createRaidPlan(state, 'regular', { name: 'Customs run', mapId: 'map1' }, NOW);
  const reset = reducers.resetQuestProgress(withPlan, 'regular');
  assert.deepEqual(reset.modeData.regular.quests, {
    activeQuestIds: [],
    completedQuestIds: [],
    ownedItemCounts: {},
  });
  assert.equal(reset.modeData.regular.raidPlans.length, 1, 'raid plans are untouched by a quest-progress reset');
});

// ---------------------------------------------------------------------------
// mode isolation — the contract the brief explicitly requires be tested
// ---------------------------------------------------------------------------

test('activating a quest in regular never appears in pve', () => {
  const next = reducers.setQuestActive(fresh(), 'regular', 'q1', true);
  assert.deepEqual(next.modeData.pve.quests.activeQuestIds, []);
});

test('completing a quest in pve never appears in regular', () => {
  const next = reducers.setQuestCompleted(fresh(), 'pve', 'q1', true);
  assert.deepEqual(next.modeData.regular.quests.completedQuestIds, []);
});

test('owned item counts are stored per mode independently', () => {
  let state = fresh();
  state = reducers.setOwnedItemCount(state, 'regular', 'item1', 5);
  state = reducers.setOwnedItemCount(state, 'pve', 'item1', 9);
  assert.equal(state.modeData.regular.quests.ownedItemCounts.item1, 5);
  assert.equal(state.modeData.pve.quests.ownedItemCounts.item1, 9);
});

test('a write to one mode returns the other mode ModeState by identity (proves no copy/mutation)', () => {
  const state = fresh();
  const next = reducers.setQuestActive(state, 'regular', 'q1', true);
  assert.equal(next.modeData.pve, state.modeData.pve, 'untouched mode is the exact same object reference');
});

test('raid plans created in one mode do not appear in the other', () => {
  const { state } = reducers.createRaidPlan(fresh(), 'regular', { name: 'Reserve', mapId: 'map1' }, NOW);
  assert.equal(state.modeData.pve.raidPlans.length, 0);
});

// ---------------------------------------------------------------------------
// raid plans
// ---------------------------------------------------------------------------

test('createRaidPlan produces a plan with normalized quest ids and empty extras', () => {
  const { plan } = reducers.createRaidPlan(
    fresh(),
    'regular',
    { name: '  Customs run  ', mapId: 'map1', activeQuestIds: ['q1', 'q1', 'q2'] },
    NOW,
  );
  assert.ok(plan);
  assert.equal(plan?.name, 'Customs run');
  assert.deepEqual(plan?.activeQuestIds, ['q1', 'q2'], 'duplicate quest id deduped');
  assert.deepEqual(plan?.customItems, []);
  assert.deepEqual(plan?.checkedObjectiveKeys, []);
  assert.equal(plan?.createdAt, NOW);
  assert.equal(plan?.updatedAt, NOW);
});

test('createRaidPlan refuses past the per-mode cap', () => {
  let state = fresh();
  for (let i = 0; i < 100; i++) {
    state = reducers.createRaidPlan(state, 'regular', { name: `Plan ${i}`, mapId: null }, NOW).state;
  }
  const result = reducers.createRaidPlan(state, 'regular', { name: 'One too many', mapId: null }, NOW);
  assert.equal(result.plan, null);
  assert.equal(result.state, state, 'no change when the cap is already hit');
});

test('updateRaidPlan renames a plan and bumps updatedAt only on real change', () => {
  const { state, plan } = reducers.createRaidPlan(fresh(), 'regular', { name: 'Draft', mapId: null }, NOW);
  const later = '2026-08-03T13:00:00.000Z';
  const renamed = reducers.updateRaidPlan(state, 'regular', plan!.id, () => ({ name: 'Final' }), later);
  const found = renamed.modeData.regular.raidPlans[0];
  assert.equal(found.name, 'Final');
  assert.equal(found.updatedAt, later);

  const noop = reducers.updateRaidPlan(renamed, 'regular', plan!.id, () => ({ name: 'Final' }), '2026-08-03T14:00:00.000Z');
  assert.equal(noop, renamed, 'setting the same name again is a no-op, updatedAt unchanged');
});

test('updateRaidPlan on an unknown plan id is a no-op', () => {
  const state = fresh();
  assert.equal(reducers.updateRaidPlan(state, 'regular', 'nope', () => ({ name: 'x' }), NOW), state);
});

test('deleteRaidPlan removes exactly the targeted plan', () => {
  let state = fresh();
  const a = reducers.createRaidPlan(state, 'regular', { name: 'A', mapId: null }, NOW);
  state = a.state;
  const b = reducers.createRaidPlan(state, 'regular', { name: 'B', mapId: null }, NOW);
  state = b.state;
  state = reducers.deleteRaidPlan(state, 'regular', a.plan!.id);
  assert.equal(state.modeData.regular.raidPlans.length, 1);
  assert.equal(state.modeData.regular.raidPlans[0].id, b.plan!.id);
});

test('duplicateRaidPlan copies contents with a new id and fresh timestamps', () => {
  const created = reducers.createRaidPlan(fresh(), 'regular', { name: 'Original', mapId: 'map1' }, NOW);
  const withItem = reducers.addCustomItem(created.state, 'regular', created.plan!.id, 'Grenades', NOW);
  const later = '2026-08-03T15:00:00.000Z';
  const dup = reducers.duplicateRaidPlan(withItem, 'regular', created.plan!.id, later, '(copy)');
  assert.ok(dup.plan);
  assert.notEqual(dup.plan?.id, created.plan?.id);
  assert.equal(dup.plan?.name, 'Original (copy)');
  assert.equal(dup.plan?.customItems.length, 1);
  assert.notEqual(dup.plan?.customItems[0].id, withItem.modeData.regular.raidPlans[0].customItems[0].id);
  assert.equal(dup.plan?.createdAt, later);
});

test('duplicateRaidPlan of an unknown id is a no-op', () => {
  const state = fresh();
  const result = reducers.duplicateRaidPlan(state, 'regular', 'nope', NOW, '(copy)');
  assert.equal(result.plan, null);
  assert.equal(result.state, state);
});

test('custom items: add, update quantity, toggle checked, remove', () => {
  const created = reducers.createRaidPlan(fresh(), 'regular', { name: 'Plan', mapId: null }, NOW);
  let state = reducers.addCustomItem(created.state, 'regular', created.plan!.id, 'Bandages', NOW);
  const itemId = state.modeData.regular.raidPlans[0].customItems[0].id;

  state = reducers.updateCustomItem(state, 'regular', created.plan!.id, itemId, { quantity: 3 }, NOW);
  assert.equal(state.modeData.regular.raidPlans[0].customItems[0].quantity, 3);

  state = reducers.updateCustomItem(state, 'regular', created.plan!.id, itemId, { checked: true }, NOW);
  assert.equal(state.modeData.regular.raidPlans[0].customItems[0].checked, true);

  state = reducers.removeCustomItem(state, 'regular', created.plan!.id, itemId, NOW);
  assert.deepEqual(state.modeData.regular.raidPlans[0].customItems, []);
});

test('custom items are capped per plan', () => {
  let state = reducers.createRaidPlan(fresh(), 'regular', { name: 'Plan', mapId: null }, NOW).state;
  const planId = state.modeData.regular.raidPlans[0].id;
  for (let i = 0; i < 200; i++) {
    state = reducers.addCustomItem(state, 'regular', planId, `Item ${i}`, NOW);
  }
  assert.equal(state.modeData.regular.raidPlans[0].customItems.length, 200);
  const overflowed = reducers.addCustomItem(state, 'regular', planId, 'One too many', NOW);
  assert.equal(overflowed.modeData.regular.raidPlans[0].customItems.length, 200);
});

test('toggleObjectiveChecked uses the composite taskId:objectiveId key, not a bare objective id', () => {
  const created = reducers.createRaidPlan(fresh(), 'regular', { name: 'Plan', mapId: null }, NOW);
  const state = reducers.toggleObjectiveChecked(
    created.state,
    'regular',
    created.plan!.id,
    'task-a:objective-1',
    true,
    NOW,
  );
  assert.deepEqual(state.modeData.regular.raidPlans[0].checkedObjectiveKeys, ['task-a:objective-1']);
  // The same bare objective id under a DIFFERENT task is a different key,
  // and must not already read as checked — this is exactly the scenario the
  // live audit found (one objective id shared by 3 unrelated quests).
  assert.ok(!state.modeData.regular.raidPlans[0].checkedObjectiveKeys.includes('task-b:objective-1'));
});

test('notes and plan name are clamped to their length caps', () => {
  const created = reducers.createRaidPlan(fresh(), 'regular', { name: 'x'.repeat(500), mapId: null }, NOW);
  assert.equal(created.plan!.name.length, 100);

  const withNotes = reducers.updateRaidPlan(
    created.state,
    'regular',
    created.plan!.id,
    () => ({ notes: 'y'.repeat(10_000) }),
    NOW,
  );
  assert.equal(withNotes.modeData.regular.raidPlans[0].notes.length, 5000);
});
