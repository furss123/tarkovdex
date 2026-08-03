const baseUrl = 'https://tarkovdex.dev';

const routes: Array<{
  path: string;
  status: number;
  kind: 'html' | 'xml' | 'text' | 'json';
  noStore?: boolean;
}> = [
  { path: '/ko', status: 200, kind: 'html' },
  { path: '/en', status: 200, kind: 'html' },
  { path: '/zh', status: 200, kind: 'html' },
  { path: '/ko/news', status: 200, kind: 'html' },
  { path: '/en/news', status: 200, kind: 'html' },
  { path: '/zh/news', status: 200, kind: 'html' },
  { path: '/ko/economy/items', status: 200, kind: 'html' },
  { path: '/ko/economy/barters', status: 200, kind: 'html' },
  { path: '/ko/progression/tasks', status: 200, kind: 'html' },
  {
    path: '/ko/progression/tasks/first-in-line-657315ddab5a49b71f098853',
    status: 200,
    kind: 'html',
  },
  { path: '/ko/progression/gunsmith', status: 200, kind: 'html' },
  { path: '/ko/combat/ammo', status: 200, kind: 'html' },
  { path: '/ko/combat/armor', status: 200, kind: 'html' },
  { path: '/ko/maps', status: 200, kind: 'html' },
  { path: '/ko/about', status: 200, kind: 'html' },
  { path: '/ko/definitely-not-a-route', status: 404, kind: 'html' },
  { path: '/sitemap.xml', status: 200, kind: 'xml' },
  { path: '/robots.txt', status: 200, kind: 'text' },
  { path: '/api/cron/tarkov-live', status: 401, kind: 'json', noStore: true },
  { path: '/ko/admin/live', status: 200, kind: 'html', noStore: true },
];

function contentTypeMatches(kind: (typeof routes)[number]['kind'], contentType: string): boolean {
  if (kind === 'html') return contentType.includes('text/html');
  if (kind === 'xml') return contentType.includes('xml');
  if (kind === 'json') return contentType.includes('application/json');
  return contentType.includes('text/plain');
}

async function main() {
  const results = [];
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route.path}`, {
      redirect: 'manual',
      cache: 'no-store',
      headers: { 'user-agent': 'TarkovDex production smoke' },
    });
    const body = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const cacheControl = response.headers.get('cache-control') ?? '';
    const ok =
      response.status === route.status &&
      contentTypeMatches(route.kind, contentType) &&
      body.length > 0 &&
      (!route.noStore || cacheControl.includes('no-store'));
    results.push({
      path: route.path,
      ok,
      status: response.status,
      contentType: contentType.split(';', 1)[0],
      cacheControl,
      bytes: Buffer.byteLength(body),
    });
  }

  const ok = results.every((result) => result.ok);
  console.log(JSON.stringify({ ok, checked: results.length, results }));
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'smoke_failed' }));
  process.exitCode = 1;
});
