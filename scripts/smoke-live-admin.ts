import postgres from 'postgres';

const baseUrl = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://tarkovdex.dev');
const adminUrl = new URL('/ko/admin/live', baseUrl);
const adminSecret = process.env.TARKOV_LIVE_ADMIN_SECRET ?? '';

if (baseUrl.protocol !== 'https:' || baseUrl.hostname !== 'tarkovdex.dev') {
  throw new Error('production_site_url_invalid');
}
if (!adminSecret) throw new Error('admin_secret_not_configured');

function databaseUrl(): string {
  const value =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!value) throw new Error('database_url_not_configured');
  return value;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([:$\w-]+)(?:="([^"]*)")?/g)) {
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? '');
  }
  return result;
}

function formDataFromHtml(form: string): FormData {
  const data = new FormData();
  for (const match of form.matchAll(/<input\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    if (!attrs.name) continue;
    const type = attrs.type || 'text';
    if ((type === 'checkbox' || type === 'radio') && !('checked' in attrs)) continue;
    data.append(attrs.name, attrs.value ?? 'on');
  }
  for (const match of form.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const attrs = attributes(match[1]);
    if (attrs.name) data.append(attrs.name, decodeHtml(match[2]));
  }
  for (const match of form.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs.name) continue;
    const options = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)];
    const selected = options.filter((option) => 'selected' in attributes(option[1]));
    for (const option of selected.length ? selected : options.slice(0, 1)) {
      const optionAttrs = attributes(option[1]);
      data.append(attrs.name, optionAttrs.value ?? decodeHtml(option[2].replace(/<[^>]+>/g, '')).trim());
    }
  }
  return data;
}

function cookieHeader(response: Response, previous = ''): string {
  const values = response.headers.getSetCookie?.() ?? [];
  const next = values.map((value) => value.split(';', 1)[0]).filter(Boolean);
  if (next.length === 0) return previous;
  const cookies = new Map<string, string>();
  for (const pair of [...previous.split('; '), ...next]) {
    const separator = pair.indexOf('=');
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function main() {
  const sql = postgres(databaseUrl(), {
    max: 1,
    prepare: false,
    connect_timeout: 10,
    idle_timeout: 5,
    onnotice: () => {},
  });

  try {
    const [event] = await sql<Array<{ id: string; title: string }>>
      `select id, coalesce(content -> 'original' ->> 'title', slug) as title
         from live_events where review_status = 'pending_review'
        order by first_seen_at, id limit 1`;
    if (!event) throw new Error('pending_event_not_found');

    const before = await Promise.all(
      ['ko', 'en', 'zh'].map(async (locale) => {
        const response = await fetch(new URL(`/${locale}/news?smoke=before`, baseUrl), { cache: 'no-store' });
        const html = await response.text();
        return { locale, status: response.status, visible: html.includes(event.title) };
      }),
    );
    if (before.some((page) => page.status !== 200 || page.visible)) {
      throw new Error('pending_event_public_before_review');
    }

    const loginPage = await fetch(adminUrl, { cache: 'no-store' });
    const loginHtml = await loginPage.text();
    const [loginForm] = loginHtml.match(/<form\b[\s\S]*?<\/form>/i) ?? [];
    if (!loginForm || !loginForm.includes('name="password"')) throw new Error('login_form_not_found');
    const loginData = formDataFromHtml(loginForm);
    loginData.set('password', adminSecret);
    const loginResponse = await fetch(adminUrl, {
      method: 'POST',
      body: loginData,
      redirect: 'manual',
    });
    let cookie = cookieHeader(loginResponse);
    if (!cookie) throw new Error('admin_session_cookie_missing');

    const dashboardResponse = await fetch(adminUrl, {
      headers: { cookie },
      cache: 'no-store',
    });
    cookie = cookieHeader(dashboardResponse, cookie);
    const dashboardHtml = await dashboardResponse.text();
    if (dashboardResponse.status !== 200 || !dashboardHtml.includes('검수 대기')) {
      throw new Error('admin_login_failed');
    }

    const forms = [...dashboardHtml.matchAll(/<form\b[\s\S]*?<\/form>/gi)].map((match) => match[0]);
    const eventForm = forms.find(
      (form) => form.includes(`name="eventId" value="${event.id}"`) && form.includes('value="approve"'),
    );
    if (!eventForm) throw new Error('event_review_form_not_found');
    const approvalData = formDataFromHtml(eventForm);
    approvalData.set('decision', 'approve');
    approvalData.set('note', 'production_smoke_review');
    const approvalResponse = await fetch(adminUrl, {
      method: 'POST',
      headers: { cookie },
      body: approvalData,
      redirect: 'manual',
    });
    if (![200, 303].includes(approvalResponse.status)) throw new Error('admin_approval_request_failed');

    const [approved] = await sql<
      Array<{ review_status: string; published_at: string | null; audit_count: string }>
    >`select e.review_status, e.published_at::text,
             (select count(*)::text from live_audit_logs a
               where a.target_id = e.id and a.action = 'update') as audit_count
        from live_events e where e.id = ${event.id}`;
    if (
      approved?.review_status !== 'reviewed' ||
      !approved.published_at ||
      Number(approved.audit_count) < 1
    ) {
      throw new Error('admin_approval_not_persisted');
    }

    const after = await Promise.all(
      ['ko', 'en', 'zh'].map(async (locale) => {
        const response = await fetch(new URL(`/${locale}/news?smoke=after-${Date.now()}`, baseUrl), {
          cache: 'no-store',
        });
        const html = await response.text();
        return { locale, status: response.status, visible: html.includes(event.title) };
      }),
    );
    if (after.some((page) => page.status !== 200 || !page.visible)) {
      throw new Error('reviewed_event_not_public');
    }

    console.log(
      JSON.stringify({
        ok: true,
        eventId: event.id,
        title: event.title,
        loginStatus: loginResponse.status,
        dashboardStatus: dashboardResponse.status,
        approvalStatus: approvalResponse.status,
        auditCount: Number(approved.audit_count),
        before,
        after,
      }),
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'admin_smoke_failed' }));
  process.exitCode = 1;
});
