import { performance } from 'node:perf_hooks';
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { getSearchIndex, clearSearchIndexCache } from '../src/lib/search/build-index.ts';
import { searchDocuments } from '../src/lib/search/index.ts';

clearSearchIndexCache();
const t0 = performance.now();
const index = await getSearchIndex('ko', 'regular');
const buildMs = performance.now() - t0;
const raw = Buffer.from(JSON.stringify(index));
const gzip = zlib.gzipSync(raw);
const queries = ['s', 'sal', 'salewa', 'M855', '공장', 'gunsmith'];
const times = [];
for (const q of queries) {
  const samples = [];
  for (let i = 0; i < 30; i += 1) {
    const a = performance.now();
    searchDocuments(index.documents, q, { locale: 'ko', gameMode: 'regular' });
    samples.push(performance.now() - a);
  }
  samples.sort((x, y) => x - y);
  times.push({
    q,
    avg: +(samples.reduce((a, b) => a + b, 0) / samples.length).toFixed(3),
    p95: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
    total: searchDocuments(index.documents, q, { locale: 'ko' }).total,
  });
}
const salewa = searchDocuments(index.documents, 'salewa', { locale: 'ko' });
const report = {
  documentCount: index.meta.documentCount,
  domainCounts: index.meta.domainCounts,
  failedDomains: index.meta.failedDomains,
  buildMs: +buildMs.toFixed(1),
  rawKB: +(raw.length / 1024).toFixed(1),
  gzipKB: +(gzip.length / 1024).toFixed(1),
  times,
  salewaGroups: salewa.groups.map((g) => ({
    domain: g.domain,
    n: g.results.length,
    top: g.results[0]?.document.title,
    score: g.results[0]?.score,
  })),
};
writeFileSync('artifacts/phase4-search-perf.json', JSON.stringify(report, null, 2));
console.log('wrote artifacts/phase4-search-perf.json');
