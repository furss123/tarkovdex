import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseOfficialXTimeline,
  toOfficialXEntry,
  youtubeVideoId,
} from '../src/lib/live/official-x-profile';
import { mergeEntries } from '../src/lib/live/normalize';

const payload = {
  props: {
    pageProps: {
      timeline: {
        entries: [
          {
            content: {
              tweet: {
                id_str: '2083811421016478193',
                created_at: 'Sun Aug 02 07:05:32 +0000 2026',
                full_text: 'Kord Breach Trailer #EscapefromTarkov\n\nhttps://t.co/video https://t.co/media',
                user: { screen_name: 'tarkov' },
                entities: {
                  urls: [{ url: 'https://t.co/video', expanded_url: 'https://youtu.be/r3AVrOG58XQ' }],
                  media: [{ url: 'https://t.co/media' }],
                },
              },
            },
          },
          {
            content: {
              tweet: {
                id_str: '2083811421016478000',
                created_at: 'Sun Aug 02 06:05:32 +0000 2026',
                full_text: 'Wrong account',
                user: { screen_name: 'someone_else' },
                entities: {},
              },
            },
          },
        ],
      },
    },
  },
};

test('the public profile parser keeps only validated @tarkov posts and expands YouTube media', () => {
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></html>`;
  const posts = parseOfficialXTimeline(html);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].id, '2083811421016478193');
  assert.equal(posts[0].content, 'Kord Breach Trailer #EscapefromTarkov');
  assert.equal(posts[0].youtubeVideoId, 'r3AVrOG58XQ');
  assert.equal(posts[0].url, 'https://x.com/tarkov/status/2083811421016478193');
});

test('the public profile parser keeps enough posts for the five-item preview and load-more', () => {
  const entries = Array.from({ length: 8 }, (_, index) => ({
    content: {
      tweet: {
        id_str: String(2083811421016478100n + BigInt(index)),
        created_at: `Sun Aug 02 ${String(index).padStart(2, '0')}:05:32 +0000 2026`,
        full_text: `Official update ${index}`,
        user: { screen_name: 'tarkov' },
        entities: {},
      },
    },
  }));
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { timeline: { entries } } },
  })}</script></html>`;

  const posts = parseOfficialXTimeline(html);
  assert.equal(posts.length, 8);
  assert.equal(posts[0].content, 'Official update 7');
});

test('profile presentation keeps ordinary posts as statements pending review', () => {
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></html>`;
  const [tweet] = parseOfficialXTimeline(html);
  const entry = toOfficialXEntry(tweet, 'ko', '2026-08-03T00:00:00.000Z');

  assert.equal(entry.source, 'official_x');
  assert.equal(entry.account, '@tarkov');
  assert.equal(entry.originalTitle, 'Kord Breach Trailer #EscapefromTarkov');
  assert.equal(entry.translated, true, 'the reviewed static translation remains available');
  assert.equal(entry.reliability, 'official_statement');
  assert.equal(entry.reviewStatus, 'pending_review');
  assert.equal(entry.youtubeVideoId, 'r3AVrOG58XQ');
});

test('an untranslated profile post stays in English without being presented as confirmed', () => {
  const entry = toOfficialXEntry(
    {
      id: '2083811421016478999',
      url: 'https://x.com/tarkov/status/2083811421016478999',
      title: 'A look behind the scenes',
      content: 'A look behind the scenes',
      publishedAt: '2026-08-03T00:00:00.000Z',
      youtubeVideoId: null,
    },
    'zh',
    '2026-08-03T00:05:00.000Z',
  );

  assert.equal(entry.title, entry.originalTitle);
  assert.equal(entry.content, entry.originalContent);
  assert.equal(entry.translated, false);
  assert.equal(entry.reliability, 'official_statement');
  assert.equal(entry.reviewStatus, 'pending_review');
});

test('the profile stream never promotes a patch-shaped post into the situation panel', () => {
  const entry = toOfficialXEntry(
    {
      id: '2083811421016478998',
      url: 'https://x.com/tarkov/status/2083811421016478998',
      title: 'Patch 1.2.3 is available',
      content: 'Patch 1.2.3 is available now.',
      publishedAt: '2026-08-03T00:00:00.000Z',
      youtubeVideoId: null,
    },
    'en',
    '2026-08-03T00:05:00.000Z',
  );

  assert.equal(entry.category, 'patch');
  assert.equal(entry.reliability, 'official_statement');
  assert.equal(entry.reviewStatus, 'pending_review');
});

test('a profile copy enriches a stored review without downgrading it', () => {
  const [tweet] = parseOfficialXTimeline(
    `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></html>`,
  );
  const profile = toOfficialXEntry(tweet, 'en', '2026-08-03T00:05:00.000Z');
  const stored = {
    ...profile,
    title: 'Stored reviewed title',
    reviewStatus: 'reviewed' as const,
    youtubeVideoId: null,
  };

  const [merged] = mergeEntries([stored, profile]);
  assert.equal(merged.title, 'Stored reviewed title');
  assert.equal(merged.reviewStatus, 'reviewed');
  assert.equal(merged.youtubeVideoId, 'r3AVrOG58XQ');
});

test('only canonical YouTube hosts and valid video ids are accepted', () => {
  assert.equal(youtubeVideoId('https://youtu.be/r3AVrOG58XQ'), 'r3AVrOG58XQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/watch?v=r3AVrOG58XQ'), 'r3AVrOG58XQ');
  assert.equal(youtubeVideoId('https://www.youtube.com/shorts/r3AVrOG58XQ'), 'r3AVrOG58XQ');
  assert.equal(youtubeVideoId('https://youtube.example/watch?v=r3AVrOG58XQ'), null);
  assert.equal(youtubeVideoId('https://youtu.be/not-valid'), null);
});
