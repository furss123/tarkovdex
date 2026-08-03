import assert from 'node:assert/strict';
import test from 'node:test';
import { settleModePair } from '../src/lib/settle-mode-pair';

test('settleModePair preserves the successful mode when its sibling fails', async () => {
  const result = await settleModePair({
    regular: Promise.resolve(['available']),
    pve: Promise.reject(new Error('temporary upstream failure')),
  });

  assert.deepEqual(result, { regular: ['available'], pve: null });
});

test('settleModePair reports both modes unavailable when both requests fail', async () => {
  const result = await settleModePair({
    regular: Promise.reject(new Error('regular failed')),
    pve: Promise.reject(new Error('pve failed')),
  });

  assert.deepEqual(result, { regular: null, pve: null });
});
