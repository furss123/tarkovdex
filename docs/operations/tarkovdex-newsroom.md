# TarkovDex Newsroom V2 operations

Newsroom V2 keeps the existing `LiveEntry`/Postgres system and adds an official
source layer: `OfficialSourcePost -> NewsStory -> LiveEntry` projection. This is
the compatibility option (C) from the design brief. It preserves the current
database, admin review desk, PatchImpact projection, homepage contract, and file
fallback while preventing legacy Steam/X items from appearing in the new feed.

## Official source allowlist

- English Telegram: `@escapefromtarkovEN`
- Russian Telegram: `@escapefromtarkovRU`
- Official web hosts: configured by `BSG_OFFICIAL_HOSTS`; defaults are listed in
  `.env.example`.

Configuration is centralized in `src/lib/newsroom/newsroom-config.ts`. Only
HTTPS URLs without credentials or custom ports are accepted. Telegram URLs must
match the configured channel. Linked pages must resolve to an allowlisted host.
The importer does not fetch linked URLs, so it cannot become an SSRF proxy.

## Collection decision

Production uses `NEWS_INGEST_MODE=manual`. BSG's channels are not owned by
TarkovDex, the Bot API cannot read arbitrary channel history, and no approved
MTProto credential/adapter exists. Newsroom therefore does not scrape
`t.me/s/*`. An `OfficialNewsSourceAdapter` interface is ready for a future
authorized adapter without changing normalization, classification, review, or
rendering.

## Protected import

`POST /api/internal/news/import` with `Authorization: Bearer $NEWS_IMPORT_SECRET`.
The endpoint is disabled when the secret is absent. It has a 64 KiB body limit,
a bounded in-process rate limit, strict source/channel/URL validation, normalized
text hashing, idempotent DB upsert, event-key generation, classification, and an
audit record. Every import enters `pending_review`; it is never silently made
public. A duplicate or edited message updates the same raw-post identity.

Required JSON fields: `source`, `sourceMessageId`, `sourceUrl`,
`sourceLanguage`, `publishedAt`, and `originalText`. Optional fields:
`editedAt`, `channelId`, `channelUsername`, `linkedOfficialUrls`, and
`mediaKinds`.

The existing authenticated `/{locale}/admin/live` review desk is the publication
surface. Reviewers edit localized title/body/summary and approve or reject the
story. No public or unauthenticated review API exists.

## Publication and translation

Production defaults to `NEWS_PUBLICATION_MODE=review`. The pure newsroom modules
provide source normalization, dedupe, classification, canonical story keys,
timeline/status merging, conservative fact extraction, glossary checks, style
checks, strict draft validation, lifecycle, and URL-filter parsing. A missing
translation provider leaves the original available to reviewers and never makes
`/news` fail. Public labels say only “translation draft”, “reviewed”, or “from
source”; provider/model/confidence details are not exposed.

# Cron

`/api/cron/news` authenticates with bearer secret and writes a newsroom
heartbeat into `live_source_states`. In manual mode it still returns `ok: true`
with `adapter: not_configured` so operators can see the job is alive; it never
pretends Telegram collection succeeded. Steam automatic detection continues
through `/api/cron/tarkov-live`. Timeless official Steam posts Stage-1
auto-publish into Latest News; claimed event windows still require review.

Vercel Hobby triggers crons about once per day regardless of expression. For
near-real-time detection, the GitHub Actions workflow
`.github/workflows/tarkov-live-news-ingestion.yml` calls `/api/cron/tarkov-live`
every 5 minutes with `Authorization: Bearer $CRON_SECRET` (secret name:
`CRON_SECRET`). The daily Vercel cron remains a low-frequency fallback.

## Patch notes

Public detail pages live at `/{locale}/news/patch/{slug}` and structure the
full official source text (Steam body or fetched Telegraph/website article)
into searchable categorized entries. Official content, TarkovDex explanation,
and gameplay impact stay in separate UI sections.

## Legacy audit and lifecycle

Run `npm run news:legacy:audit`. Preview archival with
`npm run news:legacy:archive -- --dry-run`. The archive command refuses to run
without `--dry-run`; this release performs no production archival or deletion.
Public lifecycle is bounded to 30 days / 50 items, with active incidents,
maintenance, events, Drops, contests, sales, expos, and the latest patch pinned.
Terminal retention is 24 hours for maintenance, 48 hours for outages, and 72
hours for events/Drops/contests.

## Deployment checklist

1. Set `NEWS_IMPORT_SECRET` in Production and keep `NEWS_INGEST_MODE=manual`.
2. Keep `NEWS_PUBLICATION_MODE=review` for Telegram imports until auto-publish
   review is approved; Steam timeless posts Stage-1 auto-publish regardless.
3. Run tests, typecheck, lint, message parity, and production build.
4. Confirm `/ko/news`, `/en/news`, `/zh/news`, `/ko/news/patch/{slug}` and home
   render with and without DB.
5. Confirm importer: no secret -> 401, invalid source -> 400, valid import ->
   review queue (or auto when publication mode is auto), repeated import -> no
   duplicate story. Confirm `/api/cron/news` and `/api/cron/tarkov-live` return
   401 without bearer auth.
6. Do not run destructive production DB migrations or legacy archive writes.
7. For near-real-time detection on Hobby, point an external scheduler at
   `/api/cron/tarkov-live` every 1–10 minutes with `Authorization: Bearer
   $CRON_SECRET`.
