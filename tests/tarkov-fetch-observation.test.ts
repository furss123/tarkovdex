import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTarkovJson } from '../src/lib/tarkov';
import {
  readFetchObservation,
  resetFetchObservations,
} from '../src/lib/data-observations';

/**
 * Drives the real `fetchTarkovJson` — its real memory cache, its real
 * stale-if-error window and its real 60s retry pin — with only the network and
 * the clock replaced. The recorder is worth nothing if it describes a
 * reimplementation of that logic rather than the code that actually runs, and
 * the stale-on-error path in particular cannot be reached from a browser
 * without taking the upstream down.
 */

/** `fetchTarkovJson`'s memory cache is module state shared by the whole run, so
 * each test uses its own path rather than reaching into production code for a
 * reset hook. Every `items*` path takes the same 15-minute / 2-hour price
 * policy, which is the behaviour under test. */
let pathCounter = 0;
const nextPath = () => `/regular/items_case${(pathCounter += 1)}`;
const VALID = { data: { items: { a: { id: 'a' } } } };

type FetchStub = (input: unknown) => Promise<Response>;

async function withEnvironment(
  run: (control: {
    setResponder: (responder: FetchStub) => void;
    advance: (ms: number) => void;
    calls: () => number;
  }) => Promise<void>,
) {
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  let clock = realNow();
  let count = 0;
  let responder: FetchStub = async () =>
    new Response(JSON.stringify(VALID), { status: 200 });

  Date.now = () => clock;
  globalThis.fetch = (async (input: unknown) => {
    count += 1;
    return responder(input);
  }) as typeof fetch;

  try {
    await run({
      setResponder: (next) => {
        responder = next;
      },
      advance: (ms) => {
        clock += ms;
      },
      calls: () => count,
    });
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
}

test('a real successful fetch records a network observation', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ calls }) => {
    await fetchTarkovJson(ITEMS);
    const record = readFetchObservation(ITEMS);
    assert.equal(calls(), 1);
    assert.equal(record?.lastServedFrom, 'network');
    assert.ok(record?.lastSuccessAt != null);
    assert.equal(record?.servedStale, false);
    assert.equal(record?.errorCode, null);
  });
});

test('inside the cache window nothing is refetched and delivery says cache', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ advance, calls }) => {
    await fetchTarkovJson(ITEMS);
    advance(5 * 60 * 1000);
    await fetchTarkovJson(ITEMS);
    assert.equal(calls(), 1, 'a cache hit must not add an upstream request');
    assert.equal(readFetchObservation(ITEMS)?.lastServedFrom, 'cache');
  });
});

test('an expired entry whose refetch fails is re-served and reported as the previous copy', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ setResponder, advance, calls }) => {
    const first = (await fetchTarkovJson(ITEMS)) as typeof VALID;
    // Past the 15-minute price window, well inside the 2-hour stale window.
    advance(16 * 60 * 1000);
    setResponder(async () => {
      throw new Error('json.tarkov.dev responded 503 Service Unavailable for /regular/items');
    });

    const second = (await fetchTarkovJson(ITEMS)) as typeof VALID;
    assert.deepEqual(second, first, 'the previous document is still served');
    assert.equal(calls(), 2);

    const record = readFetchObservation(ITEMS);
    assert.equal(record?.servedStale, true);
    assert.equal(record?.lastServedFrom, 'stale-cache');
    assert.equal(record?.errorCode, 'http_503');
    assert.equal(record?.retryable, true);
  });
});

test('the 60-second retry pin suppresses a retry storm and keeps saying previous copy', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ setResponder, advance, calls }) => {
    await fetchTarkovJson(ITEMS);
    advance(16 * 60 * 1000);
    setResponder(async () => {
      throw new Error('json.tarkov.dev responded 503 x for /regular/items');
    });
    await fetchTarkovJson(ITEMS);
    const afterFirstFailure = calls();

    advance(30 * 1000);
    await fetchTarkovJson(ITEMS);
    assert.equal(calls(), afterFirstFailure, 'a pinned entry must not hammer a failing upstream');
    assert.equal(
      readFetchObservation(ITEMS)?.lastServedFrom,
      'stale-cache',
      'the pinned hit must keep reporting the previous copy, not a normal cache hit',
    );

    advance(31 * 1000);
    await fetchTarkovJson(ITEMS);
    assert.equal(calls(), afterFirstFailure + 1, 'past the pin it tries again');
  });
});

test('past the stale-if-error window the failure propagates instead of serving old data', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ setResponder, advance }) => {
    await fetchTarkovJson(ITEMS);
    // Beyond PRICE_STALE_IF_ERROR_SECONDS (2 h).
    advance(3 * 60 * 60 * 1000);
    setResponder(async () => {
      throw new Error('json.tarkov.dev responded 503 x for /regular/items');
    });

    await assert.rejects(() => fetchTarkovJson(ITEMS));
    const record = readFetchObservation(ITEMS);
    assert.equal(record?.servedStale, false, 'nothing is being served, so nothing is stale');
    assert.equal(record?.cacheStoredAt, null);
    assert.equal(record?.lastServedFrom, 'unknown');
    assert.equal(record?.errorCode, 'http_503');
  });
});

test('recovery after an outage clears the previous-copy state', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ setResponder, advance }) => {
    await fetchTarkovJson(ITEMS);
    advance(16 * 60 * 1000);
    setResponder(async () => {
      throw new Error('json.tarkov.dev responded 503 x for /regular/items');
    });
    await fetchTarkovJson(ITEMS);
    assert.equal(readFetchObservation(ITEMS)?.servedStale, true);

    advance(61 * 1000);
    setResponder(async () => new Response(JSON.stringify(VALID), { status: 200 }));
    await fetchTarkovJson(ITEMS);

    const record = readFetchObservation(ITEMS);
    assert.equal(record?.servedStale, false);
    assert.equal(record?.lastServedFrom, 'network');
    assert.equal(record?.errorCode, null);
  });
});

test('a 200 carrying an invalid document is not cached as a success', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ setResponder }) => {
    setResponder(async () => new Response(JSON.stringify({ data: null }), { status: 200 }));
    await assert.rejects(() => fetchTarkovJson(ITEMS));
    const record = readFetchObservation(ITEMS);
    assert.equal(record?.errorCode, 'invalid_document');
    assert.equal(record?.retryable, false, 'a malformed document will not fix itself on retry');
    assert.equal(record?.lastSuccessAt, null);
  });
});

test('each path keeps its own observation while one of them is failing', async () => {
  const ITEMS = nextPath();
  resetFetchObservations();
  await withEnvironment(async ({ setResponder, advance }) => {
    const PVE = ITEMS.replace('/regular/', '/pve/');
    await fetchTarkovJson(ITEMS);
    await fetchTarkovJson(PVE);
    advance(16 * 60 * 1000);
    setResponder(async (input) =>
      String(input).includes('/pve/')
        ? Promise.reject(new Error('json.tarkov.dev responded 503 x for /pve/items'))
        : new Response(JSON.stringify(VALID), { status: 200 }),
    );
    await fetchTarkovJson(ITEMS);
    await fetchTarkovJson(PVE);

    assert.equal(readFetchObservation(ITEMS)?.lastServedFrom, 'network');
    assert.equal(readFetchObservation(PVE)?.lastServedFrom, 'stale-cache');
  });
});
