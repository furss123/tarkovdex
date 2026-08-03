import assert from 'node:assert/strict';
import test from 'node:test';
import { dedupeBosses } from '../src/lib/tarkov';

test('boss spawns keep the highest known chance and preserve missing chance as null', () => {
  const result = dedupeBosses(
    [
      { mob: 'bossA', spawnChance: null },
      { mob: 'bossA', spawnChance: 0.4 },
      { mob: 'bossA', spawnChance: 0.2 },
      { mob: 'bossUnknown', spawnChance: null },
      { mob: 'bossInvalid', spawnChance: 1.2 },
    ],
    {
      bossA: { id: 'bossA', name: 'name-a', imagePortraitLink: null },
      bossUnknown: { id: 'bossUnknown', name: 'name-unknown', imagePortraitLink: null },
      bossInvalid: { id: 'bossInvalid', name: 'name-invalid', imagePortraitLink: null },
    },
    {
      'name-a': 'Boss A',
      'name-unknown': 'Unknown chance',
      'name-invalid': 'Invalid chance',
    },
    'en',
  );

  assert.equal(result.find((spawn) => spawn.boss?.id === 'bossA')?.spawnChance, 0.4);
  assert.equal(result.find((spawn) => spawn.boss?.id === 'bossUnknown')?.spawnChance, null);
  assert.equal(result.find((spawn) => spawn.boss?.id === 'bossInvalid')?.spawnChance, null);
  assert.deepEqual(result.map((spawn) => spawn.boss?.id), [
    'bossA',
    'bossInvalid',
    'bossUnknown',
  ]);
});

test('different upstream role ids with the same display name render once', () => {
  const result = dedupeBosses(
    [
      { mob: 'vsRFSniper', spawnChance: 1 },
      { mob: 'vsRF', spawnChance: 1 },
      { mob: 'blackDivision', spawnChance: 0.8 },
    ],
    {
      vsRFSniper: { id: 'vsRFSniper', name: 'af-sniper', imagePortraitLink: null },
      vsRF: { id: 'vsRF', name: 'af', imagePortraitLink: null },
      blackDivision: { id: 'blackDivision', name: 'black-div', imagePortraitLink: null },
    },
    {
      'af-sniper': 'AF',
      af: 'AF',
      'black-div': 'Black Div.',
    },
    'en',
  );

  assert.deepEqual(result.map((spawn) => spawn.boss?.name), ['AF', 'Black Div.']);
  assert.equal(result[0]?.boss?.id, 'vsRF');
});
