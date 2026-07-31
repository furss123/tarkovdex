import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOCALES = ['ko', 'en', 'zh'] as const;

function flatKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix.slice(0, -1)];
  return Object.entries(value).flatMap(([key, child]) => flatKeys(child, `${prefix}${key}.`));
}

const messages = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Record<string, unknown>,
  ]),
);

test('all three message files parse and share an identical key structure', () => {
  const [ko, en, zh] = LOCALES.map((locale) => flatKeys(messages[locale]).sort());
  assert.deepEqual(en, ko);
  assert.deepEqual(zh, ko);
});

test('ICU placeholders match across locales for every key', () => {
  const flatEntries = (value: unknown, prefix = ''): Array<[string, string]> =>
    typeof value === 'object' && value !== null
      ? Object.entries(value).flatMap(([key, child]) => flatEntries(child, `${prefix}${key}.`))
      : [[prefix.slice(0, -1), String(value)]];
  const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();
  const ko = new Map(flatEntries(messages.ko));
  for (const locale of ['en', 'zh'] as const) {
    for (const [key, text] of flatEntries(messages[locale])) {
      assert.deepEqual(
        placeholders(text),
        placeholders(ko.get(key) ?? ''),
        `placeholder mismatch for ${locale}:${key}`,
      );
    }
  }
});

test('combat pages carry no price message keys and no FIR keys remain', () => {
  for (const locale of LOCALES) {
    const keys = flatKeys(messages[locale]);
    assert.ok(!keys.includes('ammo.price'), `${locale} still has ammo.price`);
    assert.ok(!keys.includes('armor.noPrice'), `${locale} still has armor.noPrice`);
    assert.ok(!keys.some((key) => /(^|\.)fir(\.|$)/i.test(key)), `${locale} still has FIR keys`);
  }
});

test('Korean copy uses the standard site glossary', () => {
  const koText = JSON.stringify(messages.ko);
  assert.ok(!koText.includes('벼룩'), 'use 플리마켓, not 벼룩');
  assert.ok(!koText.includes('하이드아웃'), 'use 은신처, not 하이드아웃');
  assert.ok(!koText.includes('트레이더'), 'use 상인, not 트레이더');
  assert.ok(!koText.includes('스폰'), 'use 등장 확률, not 스폰');
  assert.ok(!/\bXP\b/.test(koText), 'use 경험치, not XP');
  assert.ok(!/\bROI\b/.test(koText), 'use 투자 수익률, not ROI');
});

test('no raw API schema names leak into any locale', () => {
  for (const locale of LOCALES) {
    const text = JSON.stringify(messages[locale]);
    assert.ok(!text.includes('ItemPropertiesAmmo'), `${locale} exposes ItemPropertiesAmmo`);
    assert.ok(!text.includes('armorPlate'), `${locale} exposes armorPlate`);
  }
});
