import assert from 'node:assert/strict';
import test from 'node:test';
import {
  errorForStatus,
  fetchXTimeline,
  keepTweet,
  newerId,
  retryAfterMs,
  XApiError,
  type XFetchOptions,
} from '../src/lib/live/x';
import { contentHash } from '../src/lib/live/normalize';

/**
 * The X collector, exercised without a token and without touching X. The
 * network call is injected, so cursor handling, pagination, filtering and every
 * error branch are covered by real assertions rather than by inspection.
 */

const BASE: XFetchOptions = {
  source: 'official_x',
  username: 'tarkov',
  userId: null,
  sinceId: null,
  maxResults: 10,
  maxPages: 3,
  includeReplies: false,
  includeReposts: false,
  includeQuotes: true,
};

function tweet(id: string, text: string, extra: Record<string, unknown> = {}) {
  return { id, text, created_at: `2030-05-0${id.slice(-1)}T12:00:00.000Z`, ...extra };
}

/** Records every path requested so the assertions can check what was asked for,
 * not just what came back. */
function fakeApi(pages: Array<Record<string, unknown>>, user = { data: { id: '999' } }) {
  const calls: string[] = [];
  let page = 0;
  return {
    calls,
    request: async (path: string) => {
      calls.push(path);
      if (path.startsWith('/users/by/username/')) return user;
      return pages[Math.min(page++, pages.length - 1)];
    },
  };
}

test('the first sync resolves the user id, pulls one page, and reports a cursor', async () => {
  const api = fakeApi([{ data: [tweet('101', 'Patch is live'), tweet('102', 'Event started')], meta: { newest_id: '102' } }]);
  const result = await fetchXTimeline(BASE, api.request, contentHash);

  assert.equal(result.userId, '999');
  assert.equal(result.posts.length, 2);
  assert.equal(result.newestId, '102');
  assert.equal(result.requests, 2, 'one lookup + one timeline page');
  assert.ok(api.calls[1].includes('exclude=replies%2Cretweets'), 'replies and reposts excluded server-side');
  assert.ok(!api.calls[1].includes('since_id'), 'no cursor on a first sync');
  assert.equal(result.posts[0].url, 'https://x.com/tarkov/status/102');
  assert.equal(result.posts[0].account, '@tarkov');
});

test('a first sync never pages, so a fresh deployment cannot pull a whole timeline', async () => {
  const api = fakeApi([
    { data: [tweet('101', 'one')], meta: { next_token: 'p2' } },
    { data: [tweet('102', 'two')], meta: { next_token: 'p3' } },
  ]);
  const result = await fetchXTimeline(BASE, api.request, contentHash);
  assert.equal(result.requests, 2, 'user lookup + exactly one page despite next_token');
  assert.equal(result.posts.length, 1);
});

test('a second sync passes since_id, reuses the stored user id, and pages', async () => {
  const api = fakeApi([
    { data: [tweet('201', 'newer')], meta: { next_token: 'p2', newest_id: '201' } },
    { data: [tweet('202', 'newest')], meta: { newest_id: '202' } },
  ]);
  const result = await fetchXTimeline(
    { ...BASE, userId: '999', sinceId: '200', maxPages: 2 },
    api.request,
    contentHash,
  );

  assert.ok(!api.calls.some((path) => path.startsWith('/users/by/username/')), 'user id is not re-resolved');
  assert.equal(api.calls.length, 2, 'two timeline pages, no lookup');
  assert.ok(api.calls[0].includes('since_id=200'));
  assert.ok(api.calls[1].includes('pagination_token=p2'));
  assert.equal(result.posts.length, 2);
  assert.equal(result.newestId, '202');
});

test('the cursor never moves backwards and compares numerically, not lexically', () => {
  // '9' > '10' as strings; ids are decimal, so length wins first.
  assert.equal(newerId('9', '10'), '10');
  assert.equal(newerId('1890000000000000002', '1890000000000000001'), '1890000000000000002');
  assert.equal(newerId(null, '5'), '5');
  assert.equal(newerId('5', null), '5');
  assert.equal(newerId(null, null), null);
});

test('a page with nothing new leaves the cursor where it was', async () => {
  const api = fakeApi([{ data: [], meta: { result_count: 0 } }]);
  const result = await fetchXTimeline({ ...BASE, userId: '999', sinceId: '500' }, api.request, contentHash);
  assert.deepEqual(result.posts, []);
  assert.equal(result.newestId, null, 'the caller keeps its stored cursor when nothing is returned');
});

test('replies, reposts and quotes are filtered by configuration', () => {
  const reply = tweet('1', 'a', { referenced_tweets: [{ type: 'replied_to', id: '0' }] });
  const repost = tweet('2', 'b', { referenced_tweets: [{ type: 'retweeted', id: '0' }] });
  const quote = tweet('3', 'c', { referenced_tweets: [{ type: 'quoted', id: '0' }] });
  const original = tweet('4', 'd');

  const defaults = { includeReplies: false, includeReposts: false, includeQuotes: true };
  assert.equal(keepTweet(reply, defaults), false);
  assert.equal(keepTweet(repost, defaults), false);
  assert.equal(keepTweet(quote, defaults), true, 'official accounts quote real announcements');
  assert.equal(keepTweet(original, defaults), true);

  const strict = { includeReplies: false, includeReposts: false, includeQuotes: false };
  assert.equal(keepTweet(quote, strict), false);
  const loose = { includeReplies: true, includeReposts: true, includeQuotes: true };
  assert.equal(keepTweet(reply, loose), true);
  assert.equal(keepTweet(repost, loose), true);
});

test('a filtered-out post still advances the cursor past itself', async () => {
  const api = fakeApi([
    {
      data: [
        tweet('301', 'a repost', { referenced_tweets: [{ type: 'retweeted', id: '0' }] }),
        tweet('302', 'a real post'),
      ],
    },
  ]);
  const result = await fetchXTimeline({ ...BASE, userId: '999', sinceId: '300' }, api.request, contentHash);
  assert.equal(result.posts.length, 1);
  assert.equal(result.newestId, '302', 'otherwise the same repost is re-downloaded forever');
});

test('media is captured as metadata and never as a rendered URL', async () => {
  const api = fakeApi([
    {
      data: [tweet('401', 'look', { attachments: { media_keys: ['m1'] } })],
      includes: { media: [{ media_key: 'm1', type: 'photo', url: 'https://pbs.example.invalid/a.jpg' }] },
    },
  ]);
  const result = await fetchXTimeline({ ...BASE, userId: '999' }, api.request, contentHash);
  assert.deepEqual(result.posts[0].media, [{ type: 'photo', url: 'https://pbs.example.invalid/a.jpg' }]);
});

test('every HTTP failure maps to a classified, body-free error', () => {
  assert.equal(errorForStatus(401).code, 'auth');
  assert.equal(errorForStatus(403).code, 'auth');
  assert.equal(errorForStatus(404).code, 'not_found');
  assert.equal(errorForStatus(429).code, 'rate_limited');
  assert.equal(errorForStatus(500).code, 'server');
  assert.equal(errorForStatus(503).code, 'server');
  assert.equal(errorForStatus(418).code, 'bad_response');
  // The message carries a code and a status, never an upstream body.
  assert.equal(errorForStatus(429).message, 'x_rate_limited_429');
});

test('a 429 uses the server’s own retry hint, capped', () => {
  assert.equal(retryAfterMs(new Headers({ 'retry-after': '90' })), 90_000);
  const reset = Math.floor(Date.now() / 1000) + 120;
  const fromReset = retryAfterMs(new Headers({ 'x-rate-limit-reset': String(reset) }));
  assert.ok(fromReset !== null && fromReset > 100_000 && fromReset <= 121_000);
  assert.equal(retryAfterMs(new Headers({ 'retry-after': '999999' })), 60 * 60 * 1000, 'capped at an hour');
  assert.equal(retryAfterMs(new Headers()), null);
});

test('a missing account and a malformed body are distinguishable failures', async () => {
  await assert.rejects(
    () => fetchXTimeline(BASE, async () => ({ data: {} }), contentHash),
    (error: XApiError) => error.code === 'not_found',
  );
  await assert.rejects(
    () => fetchXTimeline({ ...BASE, userId: '999' }, async () => 'not an object', contentHash),
    (error: XApiError) => error.code === 'bad_response',
  );
});

test('a partial page is still usable and malformed entries are skipped', async () => {
  const api = fakeApi([{ data: [{ id: '501' }, tweet('502', 'fine'), { text: 'no id' }] }]);
  const result = await fetchXTimeline({ ...BASE, userId: '999' }, api.request, contentHash);
  assert.equal(result.posts.length, 1);
  assert.equal(result.posts[0].postId, '502');
});

test('a post with no created_at still gets a timestamp rather than being dropped', async () => {
  const api = fakeApi([{ data: [{ id: '601', text: 'undated' }] }]);
  const result = await fetchXTimeline({ ...BASE, userId: '999' }, api.request, contentHash);
  assert.equal(result.posts.length, 1);
  assert.ok(!Number.isNaN(Date.parse(result.posts[0].publishedAt)));
});
