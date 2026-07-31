import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

test('no FIR feature references remain anywhere in src/', () => {
  const pattern = /\bFIR\b|foundInRaid|Found in Raid|progression\/fir|ProgressionChecklist/;
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!pattern.test(text), `FIR reference found in ${file}`);
  }
});

test('combat DTOs expose no price fields', () => {
  const source = readFileSync(join(SRC, 'types', 'tools.ts'), 'utf8');
  const block = (name: string) => {
    const match = source.match(new RegExp(`interface ${name} \\{[^}]*\\}`));
    assert.ok(match, `interface ${name} not found`);
    return match![0];
  };
  for (const name of ['AmmoRound', 'ArmorItem', 'ArmorPlate', 'ArmorLayer', 'CombatDataset']) {
    assert.ok(!/price/i.test(block(name)), `${name} still carries a price field`);
  }
});
