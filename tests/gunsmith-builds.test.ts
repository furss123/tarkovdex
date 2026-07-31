import assert from 'node:assert/strict';
import test from 'node:test';
import builds from '../src/lib/gunsmith-builds.json';

/**
 * Guards the generated artifact, not the solver: `src/lib/gunsmith-builds.json`
 * is what the page actually ships, and a build that is structurally impossible
 * or misses a threshold would send a player down a dead end. Regenerate with
 * `node scripts/generate-gunsmith-builds.mjs` when a patch moves the data.
 */
type Snapshot = {
  name: string;
  weapon: string;
  parts: Array<{ id: string; parent: string | null; slot: string; slotId: string; required: boolean }>;
  stats: Record<string, number>;
  conditions: Array<{ key: string; value: number; compareMethod: string }>;
  unmet: string[];
  missingRequired: string[];
};

const modes = Object.entries(builds as unknown as Record<string, Record<string, Snapshot>>);

test('both game modes are present', () => {
  assert.deepEqual(modes.map(([mode]) => mode).sort(), ['pve', 'regular']);
});

for (const [mode, tasks] of modes) {
  const entries = Object.values(tasks);

  test(`${mode}: every Gunsmith part 1-25 has a build`, () => {
    const parts = new Set(
      entries.map((task) => task.name.match(/^Gunsmith - Part (\d+)$/)?.[1]).filter(Boolean),
    );
    const missing = Array.from({ length: 25 }, (_, index) => String(index + 1)).filter(
      (part) => !parts.has(part),
    );
    assert.deepEqual(missing, [], `missing Gunsmith parts: ${missing.join(', ')}`);
  });

  test(`${mode}: every build is a valid attachment tree`, () => {
    for (const task of entries) {
      const installed = new Set([task.weapon]);
      const occupied = new Set<string>();
      for (const part of task.parts) {
        const parent = part.parent ?? task.weapon;
        assert.ok(
          installed.has(parent),
          `${task.name}: ${part.id} attaches to ${parent}, which is not installed before it`,
        );
        const slotKey = `${parent}/${part.slotId}`;
        assert.ok(!occupied.has(slotKey), `${task.name}: ${slotKey} filled twice`);
        occupied.add(slotKey);
        installed.add(part.id);
      }
    }
  });

  test(`${mode}: every build meets every quest condition`, () => {
    for (const task of entries) {
      assert.deepEqual(task.unmet, [], `${task.name}: unmet ${task.unmet.join(', ')}`);
      assert.deepEqual(task.missingRequired, [], `${task.name}: could not place a required part`);
      assert.ok(task.parts.length > 0, `${task.name}: empty build`);
      for (const condition of task.conditions) {
        const actual = task.stats[condition.key];
        assert.equal(
          typeof actual,
          'number',
          `${task.name}: no computed value for ${condition.key}`,
        );
        const ok = condition.compareMethod === '<=' ? actual <= condition.value : actual >= condition.value;
        assert.ok(
          ok,
          `${task.name}: ${condition.key} is ${actual}, needs ${condition.compareMethod} ${condition.value}`,
        );
      }
    }
  });
}
