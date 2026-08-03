import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isKnownUnavailableTarkovWikiUrl,
  safeTarkovWikiUrl,
} from '../src/lib/wiki-url';

test('Tarkov wiki URLs require the exact trusted HTTPS origin', () => {
  assert.equal(
    safeTarkovWikiUrl('https://escapefromtarkov.fandom.com/wiki/Factory'),
    'https://escapefromtarkov.fandom.com/wiki/Factory',
  );
  assert.equal(safeTarkovWikiUrl('http://escapefromtarkov.fandom.com/wiki/Factory'), null);
  assert.equal(safeTarkovWikiUrl('https://evil.example/wiki/Factory'), null);
  assert.equal(
    safeTarkovWikiUrl('https://escapefromtarkov.fandom.com.evil.example/wiki/Factory'),
    null,
  );
  assert.equal(safeTarkovWikiUrl('javascript:alert(1)'), null);
  assert.equal(safeTarkovWikiUrl('data:text/html,test'), null);
});

test('Tarkov wiki URLs reject credentials, custom ports, and malformed input', () => {
  assert.equal(
    safeTarkovWikiUrl('https://user@escapefromtarkov.fandom.com/wiki/Factory'),
    null,
  );
  assert.equal(
    safeTarkovWikiUrl('https://escapefromtarkov.fandom.com:8443/wiki/Factory'),
    null,
  );
  assert.equal(safeTarkovWikiUrl('not a url'), null);
  assert.equal(safeTarkovWikiUrl(null), null);
});

test('known unavailable upstream wiki pages are suppressed without guessing a replacement', () => {
  assert.equal(
    safeTarkovWikiUrl('https://escapefromtarkov.fandom.com/wiki/Neuanfang'),
    null,
  );
  assert.equal(
    safeTarkovWikiUrl('https://escapefromtarkov.fandom.com/wiki/Neuanfang/'),
    null,
  );
  assert.equal(
    isKnownUnavailableTarkovWikiUrl(
      'https://escapefromtarkov.fandom.com/wiki/Neuanfang',
    ),
    true,
  );
  assert.equal(
    isKnownUnavailableTarkovWikiUrl('https://evil.example/wiki/Neuanfang'),
    false,
  );
});

test('a verified malformed PvE quest URL rewrites to its canonical article', () => {
  assert.equal(
    safeTarkovWikiUrl(
      'https://escapefromtarkov.fandom.com/wiki/Arena_Business_%5BPVE_ZONE%5D%0A',
    ),
    'https://escapefromtarkov.fandom.com/wiki/Arena_Business',
  );
});
