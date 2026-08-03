import assert from 'node:assert/strict';
import test from 'node:test';
import { selectActionableRestocks } from '../src/lib/trader-restock';
import type { TaskTrader } from '../src/types/tarkov';

const NOW = Date.parse('2026-08-03T12:00:00.000Z');
const MINUTE = 60 * 1000;

function trader(id: string, resetTime: string | null): TaskTrader {
  return { id, name: id, imageLink: null, resetTime, hasStore: true };
}

test('a future restock is actionable with its exact remaining time', () => {
  const { actionable, unusable } = selectActionableRestocks(
    [trader('prapor', new Date(NOW + 25 * MINUTE).toISOString())],
    NOW,
  );
  assert.equal(actionable.length, 1);
  assert.equal(actionable[0]?.remaining, 25 * MINUTE);
  assert.deepEqual(unusable, []);
});

test('a past restock is unusable rather than reported as restocking now', () => {
  const { actionable, unusable } = selectActionableRestocks(
    [trader('skier', new Date(NOW - MINUTE).toISOString())],
    NOW,
  );
  assert.deepEqual(actionable, []);
  assert.deepEqual(unusable.map((entry) => entry.id), ['skier']);
});

test('the exact boundary instant is not actionable', () => {
  const { actionable } = selectActionableRestocks(
    [trader('fence', new Date(NOW).toISOString())],
    NOW,
  );
  assert.deepEqual(actionable, []);
});

test('a missing or unparseable timestamp is unusable, never zero', () => {
  const { actionable, unusable } = selectActionableRestocks(
    [trader('no-time', null), trader('bad-time', 'soon')],
    NOW,
  );
  assert.deepEqual(actionable, []);
  assert.deepEqual(unusable.map((entry) => entry.id), ['no-time', 'bad-time']);
});

test('actionable restocks sort soonest-first with a stable tiebreak', () => {
  const { actionable } = selectActionableRestocks(
    [
      trader('late', new Date(NOW + 90 * MINUTE).toISOString()),
      trader('b-tie', new Date(NOW + 10 * MINUTE).toISOString()),
      trader('a-tie', new Date(NOW + 10 * MINUTE).toISOString()),
      trader('soon', new Date(NOW + MINUTE).toISOString()),
    ],
    NOW,
  );
  assert.deepEqual(actionable.map((entry) => entry.trader.id), [
    'soon',
    'a-tie',
    'b-tie',
    'late',
  ]);
});

test('the production case — every published reset time already past — yields none', () => {
  const hoursPast = [3, 4, 5, 6, 3.5, 4.5, 5.5, 6.5, 4.25].map((hours) =>
    trader(`t${hours}`, new Date(NOW - hours * 60 * MINUTE).toISOString()),
  );
  const { actionable, unusable } = selectActionableRestocks(hoursPast, NOW);
  assert.deepEqual(actionable, []);
  assert.equal(unusable.length, 9);
});

test('the same traders and instant always produce the same selection', () => {
  const traders = [
    trader('a', new Date(NOW + 5 * MINUTE).toISOString()),
    trader('b', null),
    trader('c', new Date(NOW - 5 * MINUTE).toISOString()),
  ];
  const first = selectActionableRestocks(traders, NOW);
  const second = selectActionableRestocks(traders, NOW);
  assert.deepEqual(
    first.actionable.map((entry) => [entry.trader.id, entry.remaining]),
    second.actionable.map((entry) => [entry.trader.id, entry.remaining]),
  );
  assert.deepEqual(
    first.unusable.map((entry) => entry.id),
    second.unusable.map((entry) => entry.id),
  );
});

test('an empty trader list is empty, not an error', () => {
  assert.deepEqual(selectActionableRestocks([], NOW), { actionable: [], unusable: [] });
});
