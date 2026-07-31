import assert from 'node:assert/strict';
import test from 'node:test';
import { localizeTaskText } from '../src/lib/game-localization';
import glossary from '../src/lib/task-ko.json';

test('fills in ko quest text the API dictionary leaves in English', () => {
  assert.equal(localizeTaskText('The Delicious Sausage', 'ko'), '맛있는 소시지');
  assert.equal(
    localizeTaskText('Eliminate Scavs at the old gas station on Customs', 'ko'),
    '세관의 구 주유소 근처에서 스캐브 처치',
  );
});

test('leaves already-Korean text alone, so upstream wins once it catches up', () => {
  assert.equal(localizeTaskText('노크 노크', 'ko'), '노크 노크');
});

test('never touches non-ko locales', () => {
  assert.equal(localizeTaskText('The Delicious Sausage', 'en'), 'The Delicious Sausage');
  assert.equal(localizeTaskText('The Delicious Sausage', 'zh'), 'The Delicious Sausage');
});

test('unknown strings pass through instead of blanking', () => {
  assert.equal(localizeTaskText('Some Brand New Quest', 'ko'), 'Some Brand New Quest');
});

test('every glossary entry actually produces Hangul', () => {
  const missing = Object.entries(glossary as Record<string, string>)
    .filter(([, value]) => !/[가-힣]/.test(value))
    .map(([key]) => key);
  assert.deepEqual(missing, []);
});
