import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  extractComparableTokens,
  extractPatchVersion,
  parseOfficialPatchText,
  validateStructuredAgainstSource,
} from '../src/lib/newsroom/parse-patch-notes';
import { NewsSourceValidationError } from '../src/lib/newsroom/news-source-normalize';
import { articleFetchHosts, fetchOfficialArticle } from '../src/lib/newsroom/fetch-official-article';
import { decidePublication } from '../src/lib/live/publish-rules';
import { isPublishable } from '../src/lib/live/status';
import { projectOfficialEntry } from '../src/lib/newsroom/newsroom-projection';
import type { LiveEntry } from '../src/types/live';

test('steam timeless official posts stage-1 auto-publish', () => {
  const decision = decidePublication({
    source: 'steam',
    reliability: 'official_confirmed',
    category: 'patch',
    intent: 'patch',
    hasWindow: false,
    windowEvidenced: true,
    requiresReview: false,
    interpreted: false,
  });
  assert.equal(decision.reviewStatus, 'auto_published');
  assert.equal(decision.reason, 'stage1_official_timeless');
});

test('claimed event windows still require an operator', () => {
  const decision = decidePublication({
    source: 'steam',
    reliability: 'official_confirmed',
    category: 'event',
    intent: 'start',
    hasWindow: true,
    windowEvidenced: true,
    requiresReview: false,
    interpreted: true,
  });
  assert.equal(decision.reviewStatus, 'pending_review');
});

test('auto_published entries are publicly publishable', () => {
  assert.equal(
    isPublishable({
      reviewStatus: 'auto_published',
    } as LiveEntry),
    true,
  );
  assert.equal(
    isPublishable({
      reviewStatus: 'pending_review',
    } as LiveEntry),
    false,
  );
});

test('patch parser retains bullets, numbers, and before/after values', () => {
  const structured = parseOfficialPatchText({
    eventId: 'steam:1',
    title: 'Patch 1.1.0.0',
    content: `
Bug Fixes
- Fixed a quest progress blocker on Customs
Economy
- Flea market fee increased from 3% to 5%
- Added new ammo 5.45x39mm BT
`,
  });
  assert.equal(structured.version, '1.1.0.0');
  assert.ok(structured.items.length >= 3);
  assert.ok(structured.items.some((item) => item.changeType === 'fixed'));
  assert.ok(structured.items.some((item) => item.beforeValue === '3%' && item.afterValue === '5%'));
  assert.ok(structured.items.some((item) => item.category === 'economy'));
  const validation = validateStructuredAgainstSource(
    structured.items.map((item) => item.officialContent).join('\n'),
    structured,
  );
  assert.equal(validation.ok, true);
  assert.deepEqual(extractComparableTokens('3% to 5%').sort(), ['3%', '5%'].sort());
  assert.equal(extractPatchVersion('Patch 1.1.0.0'), '1.1.0.0');
});

test('official article fetch rejects non-allowlisted hosts', async () => {
  await assert.rejects(
    () =>
      fetchOfficialArticle('https://evil.example/page', {
        telegramEn: 'escapefromtarkovEN',
        telegramRu: 'escapefromtarkovRU',
        officialHosts: ['escapefromtarkov.com', 'telegra.ph'],
      }),
    (error: unknown) => error instanceof NewsSourceValidationError && error.code === 'invalid_linked_host',
  );
});

test('official article fetch follows allowlisted HTML', async () => {
  const html = `<html><head><title>Patch notes</title></head><body><article><h2>Economy</h2><ul><li>Fee 3% to 5%</li></ul></article></body></html>`;
  const result = await fetchOfficialArticle(
    'https://telegra.ph/patch-notes',
    {
      telegramEn: 'escapefromtarkovEN',
      telegramRu: 'escapefromtarkovRU',
      officialHosts: ['escapefromtarkov.com', 'telegra.ph'],
    },
    async () =>
      new Response(html, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
  );
  assert.match(result.text, /Fee 3% to 5%/);
  assert.ok(articleFetchHosts({
    telegramEn: 'a',
    telegramRu: 'b',
    officialHosts: ['escapefromtarkov.com'],
  }).includes('telegra.ph'));
});

test('newsroom projection includes steam patch cards with detail slug', () => {
  const entry = {
    id: 'steam:abc',
    source: 'steam',
    account: null,
    sourcePostId: 'abc',
    url: 'https://store.steampowered.com/news/app/3932890/view/1',
    title: 'Patch 1.1.0.0',
    content: '- Fee from 3% to 5%\n- Fixed quest blocker',
    originalTitle: 'Patch 1.1.0.0',
    originalContent: '- Fee from 3% to 5%\n- Fixed quest blocker',
    translated: true,
    summary: null,
    playerImpact: null,
    recommendedAction: null,
    category: 'patch',
    reliability: 'official_confirmed',
    reviewStatus: 'auto_published',
    gameModes: ['pvp'],
    affects: ['item'],
    maps: [],
    bosses: [],
    traders: [],
    items: [],
    quests: [],
    tags: [],
    startsAt: null,
    endsAt: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    collectedAt: '2026-08-01T00:01:00.000Z',
    lastCheckedAt: '2026-08-01T00:01:00.000Z',
    imageUrl: null,
    youtubeVideoId: null,
    contentHash: 'hash',
    manualFields: [],
    interpretation: null,
    confirmations: [],
  } satisfies LiveEntry;

  const card = projectOfficialEntry(entry, 'ko');
  assert.ok(card);
  assert.equal(card?.story.category, 'patch');
  assert.equal(card?.patchSlug, '1-1-0-0');
});

test('versioned installation notices also get a patch detail slug', () => {
  const entry = {
    id: 'steam:install',
    source: 'steam',
    account: null,
    sourcePostId: 'install',
    url: 'https://store.steampowered.com/news/app/3932890/view/2',
    title: 'Escape from Tarkov 1.1.0.0 업데이트 설치 안내',
    content: 'A'.repeat(500),
    originalTitle: 'Escape from Tarkov 1.1.0.0 Update Installation',
    originalContent: 'A'.repeat(500),
    translated: true,
    summary: null,
    playerImpact: null,
    recommendedAction: null,
    category: 'announcement',
    reliability: 'official_confirmed',
    reviewStatus: 'auto_published',
    gameModes: ['unknown'],
    affects: [],
    maps: [],
    bosses: [],
    traders: [],
    items: [],
    quests: [],
    tags: [],
    startsAt: null,
    endsAt: null,
    publishedAt: '2026-08-01T00:00:00.000Z',
    collectedAt: '2026-08-01T00:01:00.000Z',
    lastCheckedAt: '2026-08-01T00:01:00.000Z',
    imageUrl: null,
    youtubeVideoId: null,
    contentHash: 'hash2',
    manualFields: [],
    interpretation: null,
    confirmations: [],
  } satisfies LiveEntry;

  const card = projectOfficialEntry(entry, 'ko');
  assert.equal(card?.patchSlug, '1-1-0-0');
});
