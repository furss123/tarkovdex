import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeJsonLd } from '../src/lib/json-ld';

test('serializeJsonLd neutralizes script-closing text from external data', () => {
  const serialized = serializeJsonLd({ name: '</script><script>alert(1)</script>' });

  assert.equal(serialized.includes('</script>'), false);
  assert.equal(serialized.includes('\\u003c/script>'), true);
  assert.deepEqual(JSON.parse(serialized), {
    name: '</script><script>alert(1)</script>',
  });
});
