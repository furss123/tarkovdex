import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSearchDomain, searchDocuments, MAX_QUERY_LENGTH } from '../src/lib/search';
import type { SearchDocument } from '../src/lib/search';

/**
 * API-shaped contract tests without spinning Next — mirrors the validation
 * and result limits enforced by `/api/search`.
 */

test('rejects unknown domains the same way the route does', () => {
  assert.equal(isSearchDomain('item'), true);
  assert.equal(isSearchDomain('trader'), false);
  assert.equal(isSearchDomain(''), false);
});

test('empty and oversized queries stay bounded', () => {
  const docs: SearchDocument[] = [
    {
      id: '1',
      domain: 'item',
      title: 'Salewa',
      aliases: [],
      keywords: [],
      href: '/economy/items?q=Salewa',
      gameModes: ['regular'],
    },
  ];
  assert.equal(searchDocuments(docs, '').total, 0);
  const long = 's'.repeat(MAX_QUERY_LENGTH + 50);
  const result = searchDocuments(docs, long);
  assert.ok(result.query.length <= MAX_QUERY_LENGTH);
});

test('partial domain filter does not invent cross-domain hits', () => {
  const docs: SearchDocument[] = [
    {
      id: '1',
      domain: 'item',
      title: 'Salewa',
      aliases: [],
      keywords: [],
      href: '/x',
      gameModes: ['regular'],
    },
    {
      id: '2',
      domain: 'task',
      title: 'Salewa quest',
      aliases: [],
      keywords: [],
      href: '/y',
      gameModes: ['regular'],
    },
  ];
  const result = searchDocuments(docs, 'salewa', { domain: 'item' });
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.domain, 'item');
});
