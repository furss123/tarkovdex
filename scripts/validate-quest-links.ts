import {
  isKnownUnavailableTarkovWikiUrl,
  safeTarkovWikiUrl,
} from '../src/lib/wiki-url';

const TASKS_URLS = [
  { mode: 'regular', url: 'https://json.tarkov.dev/regular/tasks' },
  { mode: 'pve', url: 'https://json.tarkov.dev/pve/tasks' },
] as const;
const WIKI_API = 'https://escapefromtarkov.fandom.com/api.php';
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 20_000;

type RawTask = { id?: string; name?: string; wikiLink?: unknown };
type TaskDocument = { data?: { tasks?: Record<string, RawTask> } };
type TaskLink = {
  mode: (typeof TASKS_URLS)[number]['mode'];
  id: string;
  name: string;
  url: string;
};
type WikiPage = { title?: string; missing?: string; invalid?: string };
type WikiQuery = {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Record<string, WikiPage>;
  };
};

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function pageTitle(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.startsWith('/wiki/')) return null;
    const encoded = parsed.pathname.slice('/wiki/'.length);
    return decodeURIComponent(encoded).replaceAll('_', ' ').trim() || null;
  } catch {
    return null;
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TarkovDex-LinkValidator/1.0 (+https://tarkovdex.dev)',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json() as Promise<T>;
}

async function loadQuestLinks(): Promise<TaskLink[]> {
  const documents = await Promise.all(
    TASKS_URLS.map(async ({ mode, url }) => ({
      mode,
      document: await fetchJson<TaskDocument>(url),
    })),
  );

  return documents.flatMap(({ mode, document }) => {
    const tasks = Object.entries(document.data?.tasks ?? {});
    if (tasks.length === 0) {
      throw new Error(`The Tarkov ${mode} task document contained no tasks.`);
    }
    return tasks.map(([key, task]) => ({
      mode,
      id: task.id ?? key,
      name: task.name ?? key,
      url: typeof task.wikiLink === 'string' ? task.wikiLink : '',
    }));
  });
}

function printSummary(mode: 'static' | 'network', result: {
  taskReferences: number;
  uniqueTasks: number;
  uniqueUrls: number;
  activeReferences: number;
  activeUrls: number;
  needsReviewReferences: number;
  needsReviewUrls: number;
  unverifiedReferences: number;
  unverifiedUrls: number;
  brokenReferences: number;
  brokenUrls: number;
}) {
  process.stdout.write(
    `quest-link-validation mode=${mode} task-references=${result.taskReferences} ` +
      `unique-tasks=${result.uniqueTasks} ` +
      `unique-urls=${result.uniqueUrls} active-references=${result.activeReferences} ` +
      `active-urls=${result.activeUrls} needs-review-references=${result.needsReviewReferences} ` +
      `needs-review-urls=${result.needsReviewUrls} ` +
      `unverified-references=${result.unverifiedReferences} unverified-urls=${result.unverifiedUrls} ` +
      `broken-references=${result.brokenReferences} broken-urls=${result.brokenUrls}\n`,
  );
}

async function validateStatic() {
  const tasks = await loadQuestLinks();
  const suppressed = tasks.filter(({ url }) => isKnownUnavailableTarkovWikiUrl(url));
  const invalid = tasks.filter(
    ({ url }) => !isKnownUnavailableTarkovWikiUrl(url) && safeTarkovWikiUrl(url) === null,
  );
  for (const task of suppressed) {
    process.stdout.write(
      `[needs-review] [${task.mode}] ${task.id} ${task.name}: ${task.url} ` +
        '(known upstream page unavailable; link suppressed)\n',
    );
  }
  for (const task of invalid) {
    process.stdout.write(
      `[broken] [${task.mode}] ${task.id} ${task.name}: ${task.url || '(missing)'}\n`,
    );
  }
  const result = {
    taskReferences: tasks.length,
    uniqueTasks: new Set(tasks.map(({ id }) => id)).size,
    uniqueUrls: new Set(tasks.map(({ url }) => url).filter(Boolean)).size,
    activeReferences: tasks.length - invalid.length - suppressed.length,
    activeUrls: new Set(
      tasks.map(({ url }) => safeTarkovWikiUrl(url)).filter((url): url is string => url !== null),
    ).size,
    needsReviewReferences: suppressed.length,
    needsReviewUrls: new Set(suppressed.map(({ url }) => url)).size,
    unverifiedReferences: 0,
    unverifiedUrls: 0,
    brokenReferences: invalid.length,
    brokenUrls: new Set(invalid.map(({ url }) => url || '(missing)')).size,
  };
  printSummary('static', result);
  if (result.brokenReferences > 0) process.exitCode = 1;
}

async function validateNetwork() {
  const tasks = await loadQuestLinks();
  const suppressedTasks = tasks.filter(({ url }) => isKnownUnavailableTarkovWikiUrl(url));
  const candidateTasks = tasks.filter(({ url }) => !isKnownUnavailableTarkovWikiUrl(url));
  const sanitizedTasks = candidateTasks.map((task) => ({
    ...task,
    sanitizedUrl: safeTarkovWikiUrl(task.url),
  }));
  const invalidTasks = sanitizedTasks.filter(({ sanitizedUrl }) => sanitizedUrl === null);
  const usageCounts = new Map<string, number>();
  for (const { sanitizedUrl } of sanitizedTasks) {
    if (sanitizedUrl !== null) {
      usageCounts.set(sanitizedUrl, (usageCounts.get(sanitizedUrl) ?? 0) + 1);
    }
  }
  const entries = [...usageCounts.entries()].map(([url, count]) => ({
    url,
    count,
    title: pageTitle(url),
  }));
  const malformed = entries.filter((entry) => entry.title === null);
  const pending = entries.filter(
    (entry): entry is { url: string; title: string; count: number } => entry.title !== null,
  );
  let active = 0;
  let activeUrls = 0;
  let needsReview = suppressedTasks.length;
  const needsReviewUrls = new Set(suppressedTasks.map(({ url }) => url));
  let unverified = 0;
  let unverifiedUrls = 0;
  let broken = invalidTasks.length + malformed.reduce((sum, entry) => sum + entry.count, 0);
  let brokenUrls = new Set(invalidTasks.map(({ url }) => url || '(missing)')).size + malformed.length;

  for (const task of suppressedTasks) {
    process.stdout.write(
      `[needs-review] [${task.mode}] ${task.id} ${task.name}: ${task.url} ` +
        '(known upstream page unavailable; link suppressed)\n',
    );
  }
  for (const task of invalidTasks) {
    process.stdout.write(
      `[broken] [${task.mode}] ${task.id} ${task.name}: ${task.url || '(missing)'}\n`,
    );
  }
  for (const entry of malformed) {
    process.stdout.write(`[broken] ${entry.url} (${entry.count} task links)\n`);
  }

  for (const batch of chunks(pending, BATCH_SIZE)) {
    const url = new URL(WIKI_API);
    url.searchParams.set('action', 'query');
    url.searchParams.set('format', 'json');
    url.searchParams.set('redirects', '1');
    url.searchParams.set('titles', batch.map(({ title }) => title).join('|'));

    try {
      const document = await fetchJson<WikiQuery>(url.toString());
      const normalized = new Map(document.query?.normalized?.map(({ from, to }) => [from, to]));
      const redirects = new Map(document.query?.redirects?.map(({ from, to }) => [from, to]));
      const pages = Object.values(document.query?.pages ?? {});
      const pagesByTitle = new Map(pages.map((page) => [page.title, page]));

      for (const entry of batch) {
        let resolved = normalized.get(entry.title) ?? entry.title;
        const seen = new Set<string>();
        while (redirects.has(resolved) && !seen.has(resolved)) {
          seen.add(resolved);
          resolved = redirects.get(resolved) as string;
        }
        const page = pagesByTitle.get(resolved);
        if (!page) {
          unverified += entry.count;
          unverifiedUrls += 1;
          process.stdout.write(`[unverified] ${entry.url} (no page result)\n`);
        } else if (
          Object.prototype.hasOwnProperty.call(page, 'missing') ||
          Object.prototype.hasOwnProperty.call(page, 'invalid')
        ) {
          broken += entry.count;
          brokenUrls += 1;
          process.stdout.write(`[broken] ${entry.url}\n`);
        } else {
          active += entry.count;
          activeUrls += 1;
        }
      }
    } catch (error) {
      unverified += batch.reduce((sum, entry) => sum + entry.count, 0);
      unverifiedUrls += batch.length;
      const reason = error instanceof Error ? error.message : String(error);
      process.stdout.write(`[unverified] batch of ${batch.length}: ${reason}\n`);
    }
  }

  const result = {
    taskReferences: tasks.length,
    uniqueTasks: new Set(tasks.map(({ id }) => id)).size,
    uniqueUrls: new Set(tasks.map(({ url }) => url).filter(Boolean)).size,
    activeReferences: active,
    activeUrls,
    needsReviewReferences: needsReview,
    needsReviewUrls: needsReviewUrls.size,
    unverifiedReferences: unverified,
    unverifiedUrls,
    brokenReferences: broken,
    brokenUrls,
  };
  printSummary('network', result);
  if (broken > 0 || unverifiedUrls > 0 || activeUrls === 0) process.exitCode = 1;
}

const network = process.argv.includes('--network');
(network ? validateNetwork() : validateStatic()).catch((error) => {
  const reason = error instanceof Error ? error.message : String(error);
  process.stderr.write(`quest-link-validation failed: ${reason}\n`);
  process.exitCode = 1;
});
