# Tarkov Live (`/[locale]/news`) — operations manual

> Newsroom V2 (2026-08-03): the public `/news` and home preview now select only
> allowlisted official Telegram/official-web entries through the compatibility
> projection documented in `docs/operations/tarkovdex-newsroom.md`. Steam/X
> ingestion remains available to the legacy Live pipeline and admin audit, but
> is no longer part of the default public newsroom feed. Telegram collection is
> manual/protected until an authorized adapter exists; no HTML scraping is used.

The situation board at `/ko/news`, `/en/news` and `/zh/news` answers six
questions above the fold:

1. What event is running in Tarkov right now?
2. Does it apply to PvP, PvE or Arena?
3. When did it start, and when does it end **in Korean time**?
4. What does it change — experience, bosses, maps, quests, traders, items,
   appearance rates, servers?
5. What should a player prioritize right now?
6. Is this an official confirmation, a developer hint, or TarkovDex's own
   reading?

Question 6 is the one that shapes the architecture: **the board never guesses.**
An event window that no official source stated is shown as `종료 시각 미확인`,
never as an estimate.

### Phase 7 — PatchImpact (projection, not a second board)

`src/lib/live/patch-impact.ts` projects each public `LiveEntry` into a
`PatchImpact` view: impact areas, mode scope, event state, review/confidence,
optional short summary, and a conservative TarkovDex data-sync status. Human
overrides live in `patch-impact-overrides.ts` keyed by stable entry id. The
existing LiveBoard cards render an impact block and an impact-area URL filter
(`?area=`); there is no `/updates` duplicate route.

### Phase 8 — offline news pages

Visited `/[locale]/news` HTML may be runtime-cached (network-first). When
served from Cache Storage, UI must treat event “active” and data-sync claims
as possibly stale and show offline/cached notices. SW does not invent new
PatchImpact or collection freshness. Ops: `docs/operations/tarkovdex-pwa.md`.

This document is for whoever operates it. Design rationale lives in `CLAUDE.md`;
what follows is how to set it up, run it, review content, and fix it when a
source breaks.

---

## Architecture in one picture

```
Vercel Cron (or any scheduler)
  → GET/POST /api/cron/tarkov-live   (Authorization: Bearer $CRON_SECRET)
      → migrate (idempotent) + seed manual-entries.json (only missing rows)
      → acquire cross-instance lock
      → per source: collect → store raw posts → advance cursor
      → interpret up to N new posts (Gemini; one call covers ko/en/zh)
      → classify → queue for operator review → link to existing events
      → revalidatePath('/[locale]/news') + revalidatePath('/[locale]')
                                   ↓
                              PostgreSQL
                                   ↓
  /{locale}/news        reads the database only. No X. No Gemini. No collection.
  /{locale}/admin/live  the operator's review desk (password, signed cookie)
```

The separation is the point. Before it, collection happened during page
rendering: three locales × every ISR regeneration each cost X and Gemini calls,
the X cursor lived in process memory (so every cold start re-pulled a full
page), and approving anything meant editing JSON, committing, and redeploying.

### Files

| File | Role |
| ---- | ---- |
| `src/types/live.ts` | The unified content model handed to the UI. |
| `src/lib/live/config.ts` | Every environment knob, in one place, with safe defaults. |
| `src/lib/live/db/sql.ts` | The single database seam (`(text, params) => rows`). |
| `src/lib/live/db/migrations.ts` | Schema, as an ordered list of idempotent statements. |
| `src/lib/live/repository.ts` | All persistence. Raw posts, interpretations, events, audit, runs, locks. |
| `src/lib/live/collectors.ts` | What each source contributes to a run. No database writes. |
| `src/lib/live/x.ts` | X API v2: pagination, filtering, cursor, error classification. Network call injected. |
| `src/lib/live/interpret.ts` | The Gemini interpreter. Cron only. |
| `src/lib/live/interpret-schema.ts` | Validation — where "no invented facts" stops being a prompt and becomes code. |
| `src/lib/live/publish-rules.ts` | What a machine may assert, and what counts as the same announcement. |
| `src/lib/live/normalize.ts` | Keyword classification, reliability, dedup helpers. |
| `src/lib/live/pipeline.ts` | collect → store → interpret → classify → link → publish → revalidate. |
| `src/lib/live/feed.ts` | The **read** path. Database in, view model out. |
| `src/lib/live/feed-freshness.ts` | "Nothing is running" vs. "we could not check". |
| `src/lib/live/status.ts` | Event status, countdown, ordering, filters — pure, shared by server and client. |
| `src/lib/live/admin-session.ts` | Session signing, expiry, CSRF. No `next/headers`, so it is testable. |
| `src/lib/live/admin-auth.ts` | Cookie plumbing and login throttling. |
| `src/lib/live/seed.ts` | One-way import of `manual-entries.json`. |
| `src/lib/live/manual-entries.json` | Committed seed / no-database fallback content. |
| `src/lib/live/fixtures.ts` | Seed data for development with no credentials. |
| `src/app/api/cron/tarkov-live/route.ts` | The authenticated collection endpoint. |
| `src/app/[locale]/admin/live/` | The review desk (page, server actions, one client form component). |
| `src/components/news/LiveBoard.tsx` | The board UI. |

### What did not change

`lib/steam-news.ts` and `lib/translate-news.ts` are untouched. Steam is still
the primary source, and the committed `news-ko.json` / `news-zh.json`
translations still supply the Korean and Chinese text — a post that reads Korean
today did not start reading English. What changed is only *when* Steam is read:
in the cron, not in the render.

---

## Storage

Any PostgreSQL. Set **`DATABASE_URL`** (or `POSTGRES_URL`, which is what
Vercel's own Postgres integration injects) to the **pooled** connection string.
The driver is `postgres` (postgres.js) configured for serverless: one
connection, no prepared statements, so transaction-mode poolers accept it.

There is no ORM. Migrations are an ordered list of statements in
`src/lib/live/db/migrations.ts`; `npm run db:migrate` applies them through a
direct `DATABASE_URL_UNPOOLED` connection before a production deployment.
`repo.migrate()` remains a cold-start safety net for cron and admin collection.
Each migration runs atomically under an exclusive ledger lock, the
`live_migrations` ledger skips applied ids, and every schema statement is `if
not exists`, so a retry converges instead of leaving a partial schema.

**Never edit a shipped migration — append a new one.**

### Tables

| table | holds |
| ----- | ----- |
| `live_source_states` | one row per source: cursor (`since_id`), resolved account id, last success/attempt, last error, consecutive failures, next retry |
| `live_raw_posts` | every collected post as published. Unique on `(source, source_account, source_post_id)` |
| `live_interpretations` | AI output per `(raw_post_id, prompt_version)`: ko/en/zh prose, entities, evidence-backed time candidates |
| `live_events` | what the board shows. Derived columns plus `overrides`/`manual_fields` for operator edits |
| `live_event_sources` | which posts belong to which board item and in what role (`initial`/`confirmation`/`update`/`end`/`correction`). A post belongs to exactly one event |
| `live_audit_logs` | every approval, rejection, edit, merge and override change |
| `live_ingestion_runs` | per-source run history: requests, fetched, new, duplicate, duration, error code |
| `live_locks` | the expiring ingestion lock |

### Migrating from `manual-entries.json`

`seedManualEntries()` runs on every cron and every manual collection, but it
**only creates rows that do not exist yet**. It never writes over an operator's
later edits — otherwise every cron would silently revert the admin screen to
whatever was last committed. The file stays in the repository as a seed and as
the fallback content for a deployment with no database.

---

## Deploying it

1. Provision a Postgres and copy both the **pooled** runtime connection string
   and the direct migration connection string.
2. In Vercel → Project → Settings → Environment Variables (Production), set:
   - `DATABASE_URL`
   - `DATABASE_URL_UNPOOLED` (direct connection; migration command only)
   - `CRON_SECRET` — `openssl rand -hex 32`
   - `TARKOV_LIVE_ADMIN_SECRET` — `openssl rand -hex 32`, and optionally
     `TARKOV_LIVE_SESSION_SECRET` (a second random value; defaults to the admin
     secret)
   - `GEMINI_API_KEY` — optional, enables the interpretation layer
   - `X_API_ENABLED=1` and `X_BEARER_TOKEN` — optional, enables the X collectors
3. Apply the forward-only production migration before switching application
   traffic: `vercel env run -e production -- npm run db:migrate`.
4. Deploy (`vercel deploy --prod`). This repository has no git remote wired to
   Vercel, so deploys are manual CLI invocations.
5. Trigger the first run by hand and read the response:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://tarkovdex.dev/api/cron/tarkov-live
   ```
6. Open `https://tarkovdex.dev/ko/admin/live`, log in, confirm the source table
   shows a recent success and the review queue is populated.

> `NEXT_PUBLIC_SITE_URL` is set as a **dashboard** environment variable, which
> takes precedence over `vercel.json`'s `env` block. Editing `vercel.json` alone
> is a silent no-op — this has bitten this project before. The same applies to
> anything else you set in both places.

### Cron schedule

`vercel.json` keeps a daily Hobby fallback (`0 0 * * *` UTC) for
`/api/cron/tarkov-live`. Near-real-time detection is driven by the GitHub
Actions workflow `.github/workflows/tarkov-live-news-ingestion.yml`
(`*/5 * * * *`, plus `workflow_dispatch`), which calls the same protected
endpoint with `Authorization: Bearer $CRON_SECRET`.

`LIVE_STALE_AFTER_MINUTES` defaults to `20` so a missed external schedule is
visible within about three ticks. Overlapping calls are safe: the second gets
`409 already_running` and does nothing.

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://tarkovdex.dev/api/cron/tarkov-live
```

Limit a run to one source with `?source=<key>` — `steam`, `official_x:tarkov`,
`nikita_x:nikgeneburn`, `fixtures`.

---

## The review desk

`https://tarkovdex.dev/{locale}/admin/live`. `noindex`, absent from the sitemap,
`Disallow`ed in `robots.txt`, and served with `no-store`. Its copy is Korean
only — it is a single-operator internal tool, not site content, so it is
deliberately not in the message files.

**Log in** with `TARKOV_LIVE_ADMIN_SECRET`. The session is a signed, HttpOnly,
`SameSite=Strict` cookie (`Secure` in production) that expires after
`TARKOV_LIVE_SESSION_HOURS` (default 12). Failed logins are throttled per
instance. Every mutating action re-checks the session **and** a session-bound
CSRF token.

### What is on the page

- **Dashboard** — last successful collection, review queue size, active/upcoming
  event count, events with no confirmed end.
- **출처 상태** — per source: last success, last error, consecutive failures,
  stored cursor.
- **검수 대기** — everything waiting for a decision.
- **게시 중** — everything currently on the board, editable the same way.
- **최근 수집 실행** — the last ten runs with request counts and durations.
- **감사 기록** — the last fifteen operator actions.

### Reviewing one item

Expand it. You see the original post, its sources with links, and why it is
queued: `developer_personal_account`, `unevidenced_event_window`, `teaser`,
`event_intent_unclear`, `interpreter_flagged`, `not_official_confirmed`, or
`link_candidate:<id>:<role>`.

Editable: title, body, summary, player impact and recommended action **per
locale**; category; reliability; status; game modes; start and end; related
maps/bosses/traders/items/quests; a note.

Then choose:

| button | effect |
| ------ | ------ |
| 저장 | keep the edits, leave the review state alone |
| 승인 후 게시 | publish it — appears on `/news` immediately |
| 거절 | never show it |
| 이벤트 종료 | force it ended now |
| 종료 취소 | undo that, back to schedule-derived status |

**Times are entered in KST.** The field is a local date-and-time picker labelled
KST, and a *person* choosing it is the only path in the system allowed to
resolve a timezone. Leave 종료 시각 미확인 ticked when no end has been
announced: the board then says 종료 시각 미확인 and renders no countdown. Never
type a guess to fill the field.

**상태** defaults to 자동 (일정 기준) and should usually stay there — status is
derived from the window. Setting it explicitly pins it until the override is
cleared.

### Manual edits are protected

Every field you change is stored as an *override* and listed in `manual_fields`.
Automated re-collection writes only derived columns, so it can never overwrite
you, and a `reviewed`/`rejected` item is never demoted back to `pending_review`.
Each override has a **`<field> 수동 수정 해제`** button that removes it and lets
the automatic value take over again.

### Linking a post to an existing event

When the pipeline suspects a post is an update or an end notice for something
already on the board, it queues the post with `link_candidate:<eventId>:<role>`
and preselects that event in the **기존 이벤트에 연결** dropdown. Pick a role and
press 연결: the post's sources move onto the target event and the duplicate card
disappears. Choosing 종료 공지 also marks the target ended.

### Registering something by hand (a Telegram post, an in-game notice)

Add it to `src/lib/live/manual-entries.json`, commit, deploy. The next run
imports it as a `reviewed` event. Editing that file after import changes
nothing — the database is the source of truth from then on; edit it in the admin
screen instead.

**Never write a status word into the title or body** ("진행 중", "종료됨",
"예정") — the status badge is computed from `startsAt`/`endsAt` and is the only
thing on the board allowed to say what state an event is in. A title that
asserts "진행 중" for an event whose `startsAt` is still in the future will read
correctly in the JSON but contradict its own badge the moment someone opens the
card — write titles as a plain description of *what* the event is, never *when*
it is.

### Manual tools on the dashboard

지금 전체 수집 / per-source 수집 / 캐시 재검증, plus **AI 해석 다시 실행** on an
individual item. All of them are small synchronous runs — there is no background
worker on this deployment, and an action that claimed to keep working after the
response would be a lie.

---

## What the machine is allowed to assert

The machine may classify an item as lower-risk only when **all** of these are
true:

- an official source (Steam, the official X account, the official site) —
  Nikita's personal account never qualifies;
- reliability `official_confirmed`;
- an intent that is not a teaser;
- either no claimed schedule, or every claimed time backed by source text;
- no ambiguity flag from the interpreter.

These checks control the review explanation only; they never publish content.
Every collected external post waits for a human in the private admin review
queue. Only `reviewed` rows are returned by the public database query, and
pending source text is filtered again at the server boundary so it never enters
the public feed or RSC payload.

An **event window can only be stored** when the source text states an explicit
date, time *and* timezone (parsed as full ISO-8601), or when an operator entered
it. The interpreter must quote the sentence it read a time from, and that quote
is checked against the actual post before the value is kept. No quote, no time.
A missing end renders as 종료 시각 미확인, never as an estimate.

**A freshly deployed site shows no running events until someone curates one.**
That is intended. The alternative is a confident banner about a schedule nobody
published.

---

## X integration

Official API v2 only — this project has rejected fragile scraping twice already.

- Enabled by `X_API_ENABLED=1` **and** `X_BEARER_TOKEN`. Either missing and both
  collectors report as disabled, which is not an error state.
- The token is read in one place, never logged, never returned, and never
  reaches a client bundle. Failures raise a classified code and an HTTP status
  only — never a response body or headers.
- **Cursors are per account and live in the database.** `official_x:tarkov` and
  `nikita_x:nikgeneburn` each keep their own `since_id` and resolved user id, so
  a cold start, a redeploy or a second Vercel instance all resume where the last
  run stopped. The user id is resolved once, not per run.
- **The first sync is always a single page**, however many pages are configured
  — a fresh deployment can never pull an entire timeline. Later runs follow up
  to `X_MAX_PAGES_PER_FETCH` pages to catch up.
- The cursor advances **only after every post is stored**. A crash mid-write
  costs a re-read, never a skipped announcement. A post that is filtered out
  still advances it, so a repost is not re-downloaded forever.
- Replies and reposts are excluded server-side (`exclude=replies,retweets`), so
  we never pay to download and discard them. Quotes arrive either way and are
  filtered locally — kept by default, because official accounts quote real
  announcements.
- Media is stored as metadata and never rendered: showing arbitrary remote
  images would mean opening the image config to user-posted content.

**Cost control**: `X_FETCH_INTERVAL_MINUTES` is a floor per account regardless
of how often the cron fires; `X_MAX_POSTS_PER_FETCH` and
`X_MAX_PAGES_PER_FETCH` bound one run; `since_id` bounds everything after the
first. Per-source request counts are recorded in `live_ingestion_runs`.

**Errors**: `401/403` → `x_auth`, `404` → `x_not_found`, `429` →
`x_rate_limited` (honouring `Retry-After` / `x-rate-limit-reset`, capped at an
hour), `5xx` → `x_server`, network/timeout → `x_timeout`, unparseable →
`x_bad_response`. Each failure increments `consecutive_failures` and sets
`next_retry_at`; backoff doubles from 5 minutes to a one-hour cap.

---

## AI interpretation

Gemini (`LIVE_INTERPRET_MODEL`, default `gemini-3.5-flash-lite`), the provider
this project already uses for news translation.

- Runs **in the cron only**, never during a render.
- **One call produces all three languages.** One call per locale tripled spend
  against the same free-tier quota this project has already been bitten by
  twice, for prose that is a translation of itself.
- Stored per `(raw_post_id, prompt_version)`. A post is interpreted once; bump
  `PROMPT_VERSION` in `src/lib/live/interpret.ts` to re-run everything.
- At most `LIVE_INTERPRET_MAX_ITEMS` posts per run, inside the run's deadline.
- **A failure is never stored as a success.** It is recorded against the post
  and retried on a later run, up to three attempts, after which it needs
  **AI 해석 다시 실행** from the admin screen.
- The model may **raise** a review flag; it can never clear one. Output that is
  malformed, has no localized text, or reports a time it cannot quote is
  discarded rather than published.
- With no `GEMINI_API_KEY` the board shows the original post text and says the
  commentary is not ready. This is a supported state, not a failure.

---

## Telegram

Not implemented, and the seam is deliberately left switched off.

The Bot API cannot read the history of a public channel we do not own — a bot
only receives updates for chats it has been added to, and BSG's channel is not
ours. MTProto with a personal user session is an account-credential liability
for a static fan site. `t.me/s/<channel>` is the fragile HTML scrape this
project has already rejected twice.

Register Telegram announcements by hand (see above) until an official, stable
read path exists. Turning `TELEGRAM_ENABLED` on only produces a "source
unavailable" notice.

---

## What users see when something is wrong

`마지막 확인` is the last **successful collection**, not the render time, and
the board distinguishes these states:

| state | shown when | copy |
| ----- | ---------- | ---- |
| `ok` | a recent success, nothing failing | nothing |
| `partial` | some sources failing | which sources are unavailable |
| `stale` | no success within `LIVE_STALE_AFTER_MINUTES` | collection is behind; this is the last good data |
| `down` | every enabled source failing | no source reachable; this is the last good data |
| `never` | no successful collection ever | collection has not completed yet |
| `unmanaged` | running without a database | nothing (there is no schedule to report) |

In `stale`, `down` and `never`, an empty board reads
"소식 수집이 지연되어 진행 중인 이벤트가 있는지 확인하지 못했습니다" instead of
"현재 진행 중인 이벤트가 없습니다". Stored content keeps rendering throughout.

---

## Troubleshooting

**"소식 수집이 지연되고 있습니다" on the site.** Open the admin dashboard and
read the source table. A single source failing shows its error code and next
retry. Everything failing usually means the cron stopped: confirm the schedule
fired (Vercel → Deployments → Cron), then run it by hand with `curl`.

**Cron returns 401.** `CRON_SECRET` is unset in the environment the deployment
actually uses, or the header is not `Authorization: Bearer <secret>`. There is
no query-parameter fallback by design — URLs end up in logs and referrers.

**Cron returns 409 `already_running`.** A previous run holds the lock. It
expires on its own (`LIVE_MAX_RUN_MS` + 30s); nothing to do.

**Cron returns 503 `database_not_configured`.** `DATABASE_URL` is missing from
that environment.

**`x_rate_limited` on an X source.** Expected on a small API tier. The source
backs off on its own; raise `X_FETCH_INTERVAL_MINUTES` if it keeps happening.

**`x_auth`.** The bearer token is invalid or revoked. Replace it in Vercel and
redeploy — the cursor and everything collected so far survive.

**Rotating a key.** `X_BEARER_TOKEN`, `GEMINI_API_KEY`, `CRON_SECRET` and
`TARKOV_LIVE_ADMIN_SECRET` are all replaceable in Vercel followed by a redeploy.
When a separate `TARKOV_LIVE_SESSION_SECRET` is configured, rotate that value as
well to invalidate every open admin session; rotating only the login secret does
not invalidate cookies signed by the unchanged session key.

**A post is stuck in English on the board.** Either no `GEMINI_API_KEY`, or its
interpretation failed three times. Use **AI 해석 다시 실행**, then 지금 전체 수집.

**Something wrong is published.** Open it under 게시 중 and press 거절. It
disappears from `/news` immediately.

**Backup and restore.** Everything lives in Postgres. Neon Free currently
provides a limited restore window; do not enable a paid retention or snapshot
option without approval. Nothing else needs backing up: raw posts are
re-collectable, and `manual-entries.json`,
`news-ko.json` and `news-zh.json` are in git. After a restore, run the cron once
to re-seed and revalidate.

---

## Local development

Everything below works with an empty environment — no database, no keys:

```bash
npm run typecheck && npm run lint && npm test && npm run build
```

Without `DATABASE_URL` the board renders from Steam plus committed files
(reported as `unmanaged`), the admin screen says it is disabled, and the cron
endpoint returns 401/503. That is a supported deployment, just not the full
system.

`LIVE_FIXTURES` (on by default outside production, never on in production) seeds
invented entries that exercise every state the board can render: active with a
window, active with no confirmed end, scheduled maintenance, a developer teaser,
a finished event, an untranslated official post, and a mirrored announcement
that must merge into one card.

To exercise the real pipeline locally, point `DATABASE_URL` at any Postgres and
call the cron endpoint with your local `CRON_SECRET`.

The test suite runs the **real SQL** against PGlite (Postgres compiled to WASM),
so migrations, unique constraints, `on conflict`, arrays, `jsonb` and the
expiring lock are genuinely executed rather than mocked. `npm test` passes
`--conditions react-server` so `server-only` modules resolve outside Next.

---

## Environment variables

See `.env.example` — every variable is documented there with its default and
what happens when it is unset. Summary:

| required for full operation | optional | development only |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | `GEMINI_API_KEY` | `LIVE_FIXTURES` |
| `CRON_SECRET` | `X_API_ENABLED`, `X_BEARER_TOKEN` | |
| `TARKOV_LIVE_ADMIN_SECRET` | tuning: `X_*`, `LIVE_*`, `TARKOV_LIVE_SESSION_*` | |

---

## Deployment checklist

1. `npm run typecheck && npm run lint && npm test && npm run build` all pass.
2. `DATABASE_URL` points at the **pooled** connection string.
3. `DATABASE_URL_UNPOOLED` points at the direct connection and `npm run
   db:migrate` succeeds before deployment.
4. `CRON_SECRET` and `TARKOV_LIVE_ADMIN_SECRET` are long random values set in
   Vercel's Production scope (not only in `vercel.json`).
5. Deploy, then run the cron once by hand and read the JSON summary.
6. Admin screen: log in, confirm sources show a recent success.
7. `/ko/news`, `/en/news`, `/zh/news` render, and `마지막 확인` shows a real time
   rather than 수집 기록 없음.
8. `robots.txt` disallows `/api/` and `/*/admin`; `sitemap.xml` contains no admin
   URL.
9. If on Hobby, point an external scheduler at the cron endpoint.

## Production rollback

- Record the current and immediately previous READY deployment IDs before each
  release. Roll the application back with `vercel rollback <previous-id>` and
  confirm with `vercel rollback status tarkovdex`.
- Migrations are forward-only and additive. A committed schema migration has no
  automatic down migration; the previous application must remain compatible
  with the additive schema before it is used as a rollback target.
- Pause collection by setting `LIVE_INGESTION_ENABLED=false` in Production and
  redeploying. An authenticated cron then fails closed with 503 and performs no
  writes. The Vercel cron can also be removed from `vercel.json` in an emergency
  release.
- Disconnecting the Marketplace resource or removing `DATABASE_URL` requires a
  redeploy. Public pages then degrade to the file-backed board, while cron and
  admin storage writes stay disabled.
- Do not bulk-delete a failed run first. Identify its `live_ingestion_runs` row,
  reject affected events through the admin audit path, and rotate any exposed
  cron/admin/session secret before re-enabling collection.

## Incident checklist

1. Is the site up? `/ko/news` should render even with the database down.
2. Admin dashboard → 출처 상태: which source, which error code, next retry.
3. 최근 수집 실행: is the cron firing at all? Compare `started_at` gaps.
4. Run one source by hand (`?source=<key>`) and read the returned summary.
5. If a key is the problem, rotate it in Vercel and redeploy.
6. If content is the problem, reject or correct it in the admin screen — no
   deploy is needed, and the change is live immediately.
7. Record what happened; 감사 기록 already has the operator side.
