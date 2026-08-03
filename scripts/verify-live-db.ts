import postgres from 'postgres';

function databaseUrl(): string {
  const value =
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL;
  if (!value) throw new Error('database_url_not_configured');
  return value;
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
    const [raw] = await sql<
      Array<{ total: string; unique_posts: string; fixture_posts: string }>
    >`select count(*)::text as total,
             count(distinct (source, source_account, source_post_id))::text as unique_posts,
             count(*) filter (where payload ->> 'fixture' = 'true')::text as fixture_posts
        from live_raw_posts`;
    const [links] = await sql<Array<{ total: string; unique_posts: string }>>
      `select count(*)::text as total, count(distinct raw_post_id)::text as unique_posts
         from live_event_sources`;
    const reviews = await sql<Array<{ review_status: string; count: string }>>
      `select review_status, count(*)::text as count
         from live_events group by review_status order by review_status`;
    const interpretations = await sql<Array<{ interpret_status: string; count: string }>>
      `select interpret_status, count(*)::text as count
         from live_raw_posts group by interpret_status order by interpret_status`;
    const states = await sql<
      Array<{
        source_key: string;
        active: boolean;
        has_external_id: boolean;
        has_since_id: boolean;
        has_cursor: boolean;
        consecutive_failures: number;
        last_error: string | null;
      }>
    >`select source_key, active,
             external_id is not null as has_external_id,
             since_id is not null as has_since_id,
             cursor is not null as has_cursor,
             consecutive_failures, last_error
        from live_source_states order by source_key`;
    const runs = await sql<
      Array<{
        source: string;
        trigger: string;
        ok: boolean | null;
        fetched: number;
        new_posts: number;
        duplicates: number;
        error_code: string | null;
        started_at: string;
      }>
    >`select source, trigger, ok, fetched, new_posts, duplicates, error_code,
             started_at::text
        from live_ingestion_runs order by id desc limit 10`;
    const migrations = await sql<Array<{ id: string }>>
      `select id from live_migrations order by id`;
    const [pending] = await sql<Array<{ id: string; title: string }>>
      `select id, coalesce(content -> 'original' ->> 'title', slug) as title
         from live_events where review_status = 'pending_review'
        order by first_seen_at, id limit 1`;

    const invariants = {
      rawPostsUnique: raw.total === raw.unique_posts,
      eventLinksUnique: links.total === links.unique_posts,
      noFixtures: raw.fixture_posts === '0',
      noLegacyAutoPublished: !reviews.some((row) => row.review_status === 'auto_published'),
      expectedMigrations: migrations.map((row) => row.id).join(',') ===
        '0001_live_core,0002_require_operator_review',
    };
    const ok = Object.values(invariants).every(Boolean);

    console.log(
      JSON.stringify({
        ok,
        invariants,
        rawPosts: Number(raw.total),
        eventLinks: Number(links.total),
        reviews: Object.fromEntries(reviews.map((row) => [row.review_status, Number(row.count)])),
        interpretations: Object.fromEntries(
          interpretations.map((row) => [row.interpret_status, Number(row.count)]),
        ),
        states,
        runs,
        migrations: migrations.map((row) => row.id),
        pendingSample: pending ?? null,
      }),
    );
    if (!ok) process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'verify_failed' }));
  process.exitCode = 1;
});
