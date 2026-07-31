import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCaliber,
  localizeArmorLayerName,
  localizeMaterial,
  localizeMobName,
} from '../src/lib/game-localization';

test('caliber formatter maps raw enums to familiar designations', () => {
  assert.equal(formatCaliber('Caliber545x39', 'ko'), '5.45×39mm');
  assert.equal(formatCaliber('Caliber556x45NATO', 'ko'), '5.56×45mm NATO');
  assert.equal(formatCaliber('Caliber762x51', 'en'), '7.62×51mm');
  assert.equal(formatCaliber('Caliber9x19PARA', 'zh'), '9×19mm');
  assert.equal(formatCaliber('Caliber1143x23ACP', 'ko'), '.45 ACP');
});

test('shotgun gauges are localized per language', () => {
  assert.equal(formatCaliber('Caliber12g', 'ko'), '12 게이지');
  assert.equal(formatCaliber('Caliber12g', 'en'), '12 Gauge');
  assert.equal(formatCaliber('Caliber12g', 'zh'), '12号口径');
  assert.equal(formatCaliber('Caliber20g', 'ko'), '20 게이지');
});

test('unknown calibers degrade to a readable generic form, never the raw enum', () => {
  assert.equal(formatCaliber('Caliber999x99', 'ko'), '999×99');
  assert.equal(formatCaliber('CaliberFutureThing', 'ko'), 'FutureThing');
});

test('armor materials are localized with a safe passthrough for unknowns', () => {
  assert.equal(localizeMaterial('Aramid', 'ko'), '아라미드');
  assert.equal(localizeMaterial('ArmoredSteel', 'ko'), '장갑강');
  assert.equal(localizeMaterial('UHMWPE', 'ko'), '폴리에틸렌');
  assert.equal(localizeMaterial('Titan', 'en'), 'Titanium');
  assert.equal(localizeMaterial('Ceramic', 'zh'), '陶瓷');
  assert.equal(localizeMaterial('FutureMaterial', 'ko'), 'FutureMaterial');
  assert.equal(localizeMaterial(null, 'ko'), null);
});

test('soft-armor layer names are localized in Korean with safe passthrough', () => {
  assert.equal(localizeArmorLayerName('Aramid insert', 'ko'), '아라미드 인서트');
  assert.equal(localizeArmorLayerName('Layer of UHMWPE', 'ko'), '폴리에틸렌층');
  assert.equal(localizeArmorLayerName('BK. PLATE', 'ko'), 'BK. PLATE');
  assert.equal(localizeArmorLayerName('Aramid insert', 'en'), 'Aramid insert');
});

test('boss glossary fills only the Korean gaps the API dictionary leaves in English', () => {
  // API had no Korean name → glossary applies.
  assert.equal(localizeMobName('bossKnight', 'Knight', 'ko'), '나이트');
  assert.equal(localizeMobName('bossPartisan', 'Partisan', 'ko'), '파르티잔');
  assert.equal(localizeMobName('bossBoar', 'Kaban', 'ko'), '카반');
  assert.equal(localizeMobName('bossKolontay', 'Kollontay', 'ko'), '콜론타이');
  // API already returned Korean → keep the API's (official) name.
  assert.equal(localizeMobName('bossTagilla', '타길라', 'ko'), '타길라');
  // Unknown untranslated mob → safe passthrough, no invented name.
  assert.equal(localizeMobName('bossFuture', 'Future Boss', 'ko'), 'Future Boss');
  // Non-Korean locales are untouched.
  assert.equal(localizeMobName('bossKnight', 'Knight', 'en'), 'Knight');
  assert.equal(localizeMobName('bossKnight', 'Knight', 'zh'), 'Knight');
});
