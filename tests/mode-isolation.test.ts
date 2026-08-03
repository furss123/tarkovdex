import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settleModePair } from '../src/lib/settle-mode-pair';

/**
 * The `?? fallback` pattern on the mode-split tool pages hands the *other*
 * mode's dataset to a component when one mode fails, and relies on
 * `ModeAvailabilityBoundary` never rendering it while that mode is selected.
 * Phase 1 deliberately does not restructure that — it locks the current
 * contract down instead, the same way `tests/live-security.test.ts` asserts
 * the collector/read-path separation as source text rather than by comment.
 */

const FALLBACK_PAGES = [
  'src/app/[locale]/economy/barters/page.tsx',
  'src/app/[locale]/combat/ammo/page.tsx',
  'src/app/[locale]/combat/armor/page.tsx',
  'src/app/[locale]/progression/gunsmith/page.tsx',
];

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('every page using the opposite-mode fallback also renders the availability boundary', () => {
  for (const path of FALLBACK_PAGES) {
    const text = source(path);
    assert.match(text, /\?\?\s*fallback/, `${path} no longer uses the fallback pattern`);
    assert.match(
      text,
      /<ModeAvailabilityBoundary/,
      `${path} passes opposite-mode data with no boundary to hide it`,
    );
  }
});

test('the boundary is told about both modes separately, never a single flag', () => {
  for (const path of FALLBACK_PAGES) {
    const text = source(path);
    assert.match(
      text,
      /regularAvailable=\{[^}]*regular[^}]*!==\s*null\s*\}/,
      `${path} must derive regular availability from the regular result`,
    );
    assert.match(
      text,
      /pveAvailable=\{[^}]*pve[^}]*!==\s*null\s*\}/,
      `${path} must derive PvE availability from the PvE result`,
    );
  }
});

test('the boundary renders the error state instead of the children for the missing mode', () => {
  const text = source('src/components/tools/ModeAvailabilityBoundary.tsx');
  assert.match(text, /selectedModeAvailable \? children : <DataError/);
  assert.match(
    text,
    /gameMode === 'pve' \? pveAvailable : regularAvailable/,
    'the selected mode, not the fallback mode, decides what renders',
  );
});

test('the maps page reports mode availability without a cross-mode fallback at all', () => {
  const text = source('src/app/[locale]/maps/page.tsx');
  assert.doesNotMatch(
    text,
    /\?\?\s*fallback/,
    'maps renders each mode from its own list; do not introduce a fallback here',
  );
  assert.match(text, /<ModeAvailabilityBoundary/);
});

test('a one-mode outage keeps the other mode and nulls the failing one', async () => {
  const result = await settleModePair({
    regular: Promise.resolve('pvp-data'),
    pve: Promise.reject(new Error('upstream')),
  });
  assert.deepEqual(result, { regular: 'pvp-data', pve: null });

  const inverse = await settleModePair({
    regular: Promise.reject(new Error('upstream')),
    pve: Promise.resolve('pve-data'),
  });
  assert.deepEqual(inverse, { regular: null, pve: 'pve-data' });
});

test('a mode outage is availability, not a data error, in the health contract', async () => {
  const { domainHealth, resetFetchObservations } = await import(
    '../src/lib/data-observations'
  );
  resetFetchObservations();
  const state = domainHealth({
    domain: 'ammunition',
    gameMode: 'regular',
    locale: 'ko',
    availability: 'partial',
  });
  assert.equal(state.availability, 'partial');
  assert.notEqual(state.availability, 'unavailable');
  assert.equal(state.internalErrorCode, undefined, 'an absent mode is not an error code');
});
