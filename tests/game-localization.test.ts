import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCaliber,
  localizeArmorItemName,
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
  assert.equal(localizeMaterial('UHMWPE', 'ko'), '초고분자량 폴리에틸렌(UHMWPE)');
  assert.equal(localizeMaterial('Titan', 'en'), 'Titanium');
  assert.equal(localizeMaterial('Ceramic', 'zh'), '陶瓷');
  assert.equal(localizeMaterial('FutureMaterial', 'ko'), 'FutureMaterial');
  assert.equal(localizeMaterial(null, 'ko'), null);
});

test('soft-armor layer names are localized in Korean with safe passthrough', () => {
  assert.equal(localizeArmorLayerName('Aramid insert', 'ko'), '아라미드 삽입재');
  assert.equal(localizeArmorLayerName('Layer of UHMWPE', 'ko'), '초고분자량 폴리에틸렌층');
  assert.equal(localizeArmorLayerName('BK. PLATE', 'ko'), '뒤쪽 방탄판');
  assert.equal(localizeArmorLayerName('Aramid insert', 'en'), 'Aramid insert');
});

test('armor and plate names fill Korean dictionary gaps and fix known mismatches', () => {
  assert.equal(
    localizeArmorItemName(
      '628b9784bcf6e2659e09b8a2',
      'S&S Precision PlateFrame plate carrier (Goons Edition)',
      'ko',
    ),
    'S&S Precision PlateFrame 플레이트 캐리어 (군즈 에디션)',
  );
  assert.equal(
    localizeArmorItemName(
      '64afc71497cf3a403c01ff38',
      'Granit Br5 ballistic plate',
      'ko',
    ),
    'Granit Br5 방탄판',
  );
  assert.equal(
    localizeArmorItemName(
      '5ab8dced86f774646209ec87',
      'ANA Tactical M2 플레이트 캐리어 (Digital Flora)',
      'ko',
    ),
    'ANA Tactical M2 플레이트 캐리어 (OD Green)',
  );
  assert.equal(
    localizeArmorItemName(
      '69cfef0d6242b966d40803e7',
      'FORT Redut-T5 방탄복 (흑색)',
      'ko',
    ),
    'FORT Redut-M 방탄복 (검정)',
  );
  assert.equal(
    localizeArmorItemName('id', 'Granit ballistic plate (Side)', 'en'),
    'Granit ballistic plate (Side)',
  );
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
