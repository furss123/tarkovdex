import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTarkovJson, getMaps, getTraders } from '../src/lib/tarkov';
import { getEconomyDataset } from '../src/lib/tarkov-tools';
import { getLiveFeed } from '../src/lib/live/feed';
import { setRepository } from '../src/lib/live/repository-client';

function tarkovDocument(url: string): unknown {
  if (/\/(?:items|traders|maps|hideout)_ko$/.test(url)) return { data: {} };
  if (/\/items$/.test(url)) return { data: { items: {} } };
  if (/\/traders$/.test(url)) return { data: {} };
  if (/\/maps$/.test(url)) return { data: { maps: {}, mobs: {} } };
  if (/\/crafts$/.test(url)) return { data: [] };
  if (/\/hideout$/.test(url)) return { data: {} };
  throw new Error(`Unexpected test URL: ${url}`);
}

test('home data graph fetches every Tarkov document once per mode', async () => {
  const originalFetch = globalThis.fetch;
  const calls = new Map<string, number>();
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.set(url, (calls.get(url) ?? 0) + 1);
    return new Response(JSON.stringify(tarkovDocument(url)), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  try {
    await Promise.all([
      getTraders('ko', 'regular'),
      getTraders('ko', 'pve'),
      getMaps({ locale: 'ko', gameMode: 'regular' }),
      getMaps({ locale: 'ko', gameMode: 'pve' }),
      getEconomyDataset('ko', 'regular'),
      getEconomyDataset('ko', 'pve'),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(calls.size, 18);
  for (const [url, count] of calls) {
    assert.equal(count, 1, `${url} should be fetched once`);
  }
});

test('file-backed home news feed requests Steam once without exposing an unreviewed post', async () => {
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalPostgresUrl = process.env.POSTGRES_URL;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  setRepository(null);

  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      '<rss><channel><item><title>Patch 1.0</title><link>https://example.test/news</link>' +
        '<description>Notes</description><pubDate>Sun, 02 Aug 2026 00:00:00 GMT</pubDate>' +
        '<guid>news-1</guid></item></channel></rss>',
      { status: 200, headers: { 'content-type': 'application/rss+xml' } },
    );
  };

  try {
    const feed = await getLiveFeed('en');
    assert.ok(!feed.entries.some((entry) => entry.sourcePostId === 'news-1'));
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
    else process.env.POSTGRES_URL = originalPostgresUrl;
    setRepository(null);
  }
});

test('expired Tarkov documents fall back to the last good value for concurrent readers', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse('2026-08-03T00:00:00.000Z');
  let calls = 0;
  const path = `/cache-fallback-test-${process.pid}-${Math.random()}`;

  Date.now = () => now;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ data: { version: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('upstream unavailable', { status: 503 });
  };

  try {
    assert.deepEqual(await fetchTarkovJson(path), { data: { version: 1 } });
    now += 6 * 60 * 60 * 1000 + 1;
    const results = await Promise.all([
      fetchTarkovJson(path),
      fetchTarkovJson(path),
      fetchTarkovJson(path),
    ]);
    assert.deepEqual(results, [
      { data: { version: 1 } },
      { data: { version: 1 } },
      { data: { version: 1 } },
    ]);
    assert.equal(calls, 2, 'one failed refresh should be shared by all readers');

    now += 30 * 1000;
    assert.deepEqual(await fetchTarkovJson(path), { data: { version: 1 } });
    assert.equal(calls, 2, 'fallback should suppress a retry storm');
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('an initial Tarkov document failure is not hidden as an empty value', async () => {
  const originalFetch = globalThis.fetch;
  const path = `/cache-initial-failure-test-${process.pid}-${Math.random()}`;
  globalThis.fetch = async () => new Response('upstream unavailable', { status: 503 });

  try {
    await assert.rejects(
      () => fetchTarkovJson(path),
      /json\.tarkov\.dev responded 503/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a successful HTTP response with an invalid data shape cannot replace cache', async () => {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = Date.parse('2026-08-03T00:00:00.000Z');
  let calls = 0;
  const path = `/cache-shape-test-${process.pid}-${Math.random()}`;
  Date.now = () => now;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify(calls === 1 ? { data: { valid: true } } : { error: 'rate limited' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };

  try {
    assert.deepEqual(await fetchTarkovJson(path), { data: { valid: true } });
    now += 6 * 60 * 60 * 1000 + 1;
    assert.deepEqual(await fetchTarkovJson(path), { data: { valid: true } });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  }
});
