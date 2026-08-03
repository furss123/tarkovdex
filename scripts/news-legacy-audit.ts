import { getRepository } from '../src/lib/live/repository-client';

const archive = process.argv.includes('--archive');
const dryRun = process.argv.includes('--dry-run');

if (archive && !dryRun) {
  console.error('Refusing to mutate news records. Re-run with --dry-run; production archival requires a separate backup-approved operation.');
  process.exitCode = 2;
} else {
  const repo = getRepository();
  if (!repo) {
    console.log(JSON.stringify({ database: 'not-configured', operation: archive ? 'archive-dry-run' : 'audit', records: 0 }, null, 2));
  } else {
    await repo.migrate();
    const events = await repo.listEvents({ limit: 500 });
    const result = events.reduce<Record<string, number>>((counts, event) => {
      const sources = new Set(event.sources.map((source) => source.source));
      const classification = sources.has('official_telegram') || sources.has('official_website')
        ? 'official-current' : sources.has('steam') || sources.has('official_x')
          ? 'official-legacy' : sources.has('manual') ? 'unknown' : 'unofficial';
      counts[classification] = (counts[classification] ?? 0) + 1;
      return counts;
    }, {});
    console.log(JSON.stringify({ operation: archive ? 'archive-dry-run' : 'audit', records: events.length, classifications: result,
      writesPerformed: false, note: archive ? 'Candidates only; no records were changed.' : undefined }, null, 2));
  }
}
