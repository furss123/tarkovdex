import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BEGINNER_QUESTION_SUPPORT,
  filterActiveQuestRequiredItems,
  filterAmmoForArmorClass,
  filterGearWithinBudget,
  filterHighValuePerSlotItems,
  filterLightAffordableArmor,
  type BeginnerQuestionId,
} from '../src/lib/beginner-queries';
import type { MarketItem } from '../src/types/tarkov';
import type { AmmoRound, ArmorItem } from '../src/types/tools';
import type { RequiredItemLine } from '../src/lib/quest-requirements';

function ammo(overrides: Partial<AmmoRound> = {}): AmmoRound {
  return {
    id: 'ammo-1',
    name: '5.45 BT',
    shortName: 'BT',
    iconLink: null,
    caliber: 'Caliber545x39',
    damage: 50,
    penetrationPower: 45,
    armorDamage: 30,
    initialSpeed: 880,
    fragmentationChance: 0.1,
    ricochetChance: 0.2,
    accuracyModifier: 0,
    recoilModifier: 0,
    heavyBleedModifier: 0,
    lightBleedModifier: 0,
    tracer: false,
    ...overrides,
  };
}

function market(overrides: Partial<MarketItem> = {}): MarketItem {
  return {
    id: 'item-1',
    name: 'Gear',
    shortName: 'G',
    iconLink: null,
    avg24hPrice: 50000,
    low24hPrice: 40000,
    high24hPrice: 60000,
    changeLast48hPercent: 0,
    types: ['armor'],
    width: 3,
    height: 3,
    weight: 5,
    bestVendorSellRUB: 20000,
    updated: '2026-08-03T12:00:00.000Z',
    slotCount: 9,
    estimatedFleaNet: 47500,
    referenceValue: 47500,
    valuePerSlot: 5277,
    valueSource: 'flea',
    freshnessHours: 1,
    ...overrides,
  };
}

function armor(overrides: Partial<ArmorItem> = {}): ArmorItem {
  return {
    id: 'armor-1',
    name: 'Light vest',
    iconLink: null,
    weight: 3.5,
    armorClass: 3,
    durability: 80,
    material: 'Aramid',
    bluntThroughput: 0.2,
    speedPenalty: -0.01,
    turnPenalty: -0.01,
    ergoPenalty: -2,
    zones: [],
    normalizedZones: ['thorax', 'stomach'],
    unknownZones: [],
    softArmor: [],
    slots: [],
    ...overrides,
  };
}

test('BEGINNER_QUESTION_SUPPORT marks level-15 as unsupported and others as usable', () => {
  const ids = Object.keys(BEGINNER_QUESTION_SUPPORT) as BeginnerQuestionId[];
  assert.deepEqual(ids.sort(), [
    'ammo-for-armor-class',
    'gear-within-budget',
    'high-value-per-slot',
    'level-15-gear',
    'light-affordable-armor',
    'quest-keep-items',
  ]);
  assert.equal(BEGINNER_QUESTION_SUPPORT['level-15-gear'].support, 'unsupported');
  assert.equal(BEGINNER_QUESTION_SUPPORT['ammo-for-armor-class'].support, 'supported');
  assert.equal(BEGINNER_QUESTION_SUPPORT['gear-within-budget'].support, 'partially-supported');
  assert.equal(BEGINNER_QUESTION_SUPPORT['light-affordable-armor'].support, 'partially-supported');
});

test('filterAmmoForArmorClass keeps graded rounds and attaches reasons', () => {
  const results = filterAmmoForArmorClass({
    ammo: [
      ammo({ id: 'good', penetrationPower: 45 }), // class 4 → good (45-40=5? wait 4*10=40, 45-40=5 → excellent)
      ammo({ id: 'poor', penetrationPower: 20 }), // class 4 → poor
      ammo({ id: 'null-pen', penetrationPower: null }),
      ammo({ id: 'other-cal', caliber: 'Caliber556x45', penetrationPower: 50 }),
    ],
    armorClass: 4,
    caliber: 'Caliber545x39',
    pricesById: new Map([['good', 800]]),
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, 'good');
  assert.ok(results[0]?.reasons.some((r) => r.id === 'penMeetsClass'));
  assert.ok(results[0]?.reasons.some((r) => r.id === 'priceWithinBudget'));
  assert.notEqual(results[0]?.grade, 'poor');
});

test('filterGearWithinBudget excludes over-budget, wrong type, and null price', () => {
  const results = filterGearWithinBudget({
    items: [
      market({ id: 'ok', referenceValue: 40000, types: ['armor'] }),
      market({ id: 'pricey', referenceValue: 90000, types: ['armor'] }),
      market({ id: 'no-price', referenceValue: null, types: ['armor'] }),
      market({ id: 'gun', referenceValue: 10000, types: ['gun'] }),
    ],
    maxBudget: 50000,
  });
  assert.deepEqual(
    results.map((r) => r.id),
    ['ok'],
  );
  assert.ok(results[0]?.reasons.some((r) => r.id === 'priceWithinBudget'));
  assert.ok(results[0]?.reasons.some((r) => r.id === 'categoryMatch'));
});

test('filterActiveQuestRequiredItems reports shortfall against owned counts', () => {
  const requirements: RequiredItemLine[] = [
    {
      itemId: 'salewa',
      totalRequired: 3,
      questIds: ['t1'],
      objectiveCount: 1,
      hasAlternatives: false,
      foundInRaid: true,
    },
  ];
  const results = filterActiveQuestRequiredItems({
    requirements,
    ownedCounts: { salewa: 1 },
  });
  assert.equal(results.length, 1);
  assert.equal(results[0]?.reasons[0]?.values?.shortfall, 2);
  assert.equal(results[0]?.reasons[0]?.id, 'neededByActiveQuest');
});

test('filterHighValuePerSlotItems requires valuePerSlot and referenceValue', () => {
  const results = filterHighValuePerSlotItems({
    items: [
      market({ id: 'high', valuePerSlot: 10000, referenceValue: 40000 }),
      market({ id: 'low', valuePerSlot: 100, referenceValue: 900 }),
      market({ id: 'null-vps', valuePerSlot: null, referenceValue: 50000 }),
    ],
    minValuePerSlot: 1000,
  });
  assert.deepEqual(
    results.map((r) => r.id),
    ['high'],
  );
  assert.ok(results[0]?.reasons.some((r) => r.id === 'valuePerSlotMeets'));
});

test('filterLightAffordableArmor respects weight, class, area, and price', () => {
  const results = filterLightAffordableArmor({
    armor: [
      armor({ id: 'fit', weight: 2, armorClass: 4 }),
      armor({ id: 'heavy', weight: 12, armorClass: 4 }),
      armor({ id: 'low-class', weight: 2, armorClass: 2 }),
      armor({
        id: 'wrong-area',
        weight: 2,
        armorClass: 4,
        normalizedZones: ['arms'],
      }),
    ],
    pricesById: new Map([
      ['fit', 30000],
      ['heavy', 20000],
      ['low-class', 10000],
      ['wrong-area', 15000],
    ]),
    maxPrice: 50000,
    maxWeight: 5,
    minClass: 3,
    requiredArea: 'thorax',
  });
  assert.deepEqual(
    results.map((r) => r.id),
    ['fit'],
  );
  assert.ok(results[0]?.reasons.some((r) => r.id === 'armorClassMeets'));
});

test('level-15-gear remains unsupported — no filter invents level data', () => {
  assert.equal(BEGINNER_QUESTION_SUPPORT['level-15-gear'].support, 'unsupported');
  assert.equal(BEGINNER_QUESTION_SUPPORT['level-15-gear'].reasonKey, 'support.level15');
});
