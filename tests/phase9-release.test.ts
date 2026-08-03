import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_CACHE_NAMES,
  CACHE_NAMES,
  cachesToDelete,
  isPwaEnabled,
  PWA_CACHE_VERSION,
  SW_MESSAGE,
} from '../src/lib/pwa/sw-policy';
import { SCHEMA_VERSION } from '../src/lib/local-state/schema';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

test('Phase 9: Gunsmith questPart badge is inside the flexible text column', () => {
  const source = readFileSync(
    join(SRC, 'components/progression/GunsmithExplorer.tsx'),
    'utf8',
  );
  // Regression: a sibling shrink-0 badge next to flex-1 content overflowed at 320px.
  assert.match(source, /flex flex-wrap items-center gap-x-2 gap-y-1/);
  assert.match(source, /\{t\('questPart'\)\}/);
  // Badge must not sit as a trailing flex sibling outside the text column.
  assert.doesNotMatch(
    source,
    /attachToWeapon[\s\S]{0,200}\)\}\s*<\/p>\s*<\/div>\s*\{part\.required/,
  );
});

test('Phase 9: ammo and armor checkboxes use a 44px touch wrapper', () => {
  const ammo = readFileSync(join(SRC, 'components/combat/AmmoChart.tsx'), 'utf8');
  const armor = readFileSync(join(SRC, 'components/combat/ArmorExplorer.tsx'), 'utf8');
  for (const [name, source] of [
    ['AmmoChart', ammo],
    ['ArmorExplorer', armor],
  ] as const) {
    assert.match(source, /size-touch/, `${name} missing size-touch wrapper`);
    assert.match(source, /type="checkbox"/, `${name} missing checkbox`);
    assert.match(
      source,
      /inline-flex size-touch shrink-0 items-center justify-center/,
      `${name} checkbox hit target wrapper missing`,
    );
  }
});

test('Phase 9: local-data and personal tools are noindex', () => {
  const files = [
    'app/[locale]/local-data/page.tsx',
    'app/[locale]/search/page.tsx',
    'app/[locale]/economy/watchlist/page.tsx',
    'app/[locale]/economy/craft-calculator/page.tsx',
    'app/[locale]/combat/budget-builder/page.tsx',
    'app/[locale]/progression/tasks/tracker/page.tsx',
  ];
  for (const rel of files) {
    const source = readFileSync(join(SRC, rel), 'utf8');
    assert.match(
      source,
      /robots:\s*\{\s*index:\s*false/,
      `${rel} must set robots.index false`,
    );
  }
});

test('Phase 9: schemaVersion remains 5 and PWA version contracts hold', () => {
  assert.equal(SCHEMA_VERSION, 5);
  assert.equal(PWA_CACHE_VERSION, 1);
  assert.equal(CACHE_NAMES.static, 'tarkovdex-static-v1');
  assert.deepEqual(
    cachesToDelete(['tarkovdex-static-v0', ...ALL_CACHE_NAMES, 'other']),
    ['tarkovdex-static-v0'],
  );
  assert.equal(isPwaEnabled({ NODE_ENV: 'production', NEXT_PUBLIC_PWA_ENABLED: 'false' }), false);
  assert.equal(SW_MESSAGE.SKIP_WAITING, 'SKIP_WAITING');
  assert.equal(SW_MESSAGE.CLEAR_CACHES, 'CLEAR_CACHES');
});

test('Phase 9: SW update is message-driven and kill-switch env is documented', () => {
  const sw = readFileSync(join(ROOT, 'public/sw.js'), 'utf8');
  const manager = readFileSync(
    join(SRC, 'components/pwa/ServiceWorkerManager.tsx'),
    'utf8',
  );
  const envExample = readFileSync(join(ROOT, '.env.example'), 'utf8');
  assert.match(sw, /SKIP_WAITING/);
  assert.match(manager, /SKIP_WAITING/);
  assert.match(manager, /reloadOnceRef/);
  assert.match(envExample, /NEXT_PUBLIC_PWA_ENABLED/);
  assert.match(manager, /NEXT_PUBLIC_PWA_ENABLED/);
});
