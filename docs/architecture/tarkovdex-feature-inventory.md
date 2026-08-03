# TarkovDex feature inventory

## Newsroom V2 delta (2026-08-03)

| capability | implementation | fallback / safety |
| --- | --- | --- |
| official source import | `POST /api/internal/news/import` | secret, 64 KiB limit, rate limit, allowlist, no fetch/SSRF |
| Telegram adapter | `OfficialNewsSourceAdapter` contract | disabled/manual; no public-channel scrape |
| newsroom domain | `src/lib/newsroom/*`, `src/types/newsroom.ts` | pure and provider-independent |
| review/publication | existing authenticated Live admin + DB | imports always wait for review |
| public feed | `NewsroomBoard`, official projection only | DB/source absence renders an honest empty state |
| homepage | at most three official entries | no raw history/provider/admin code in client bundle |

Audited **2026-08-03** against the working tree (uncommitted changes included —
`git status` showed 83 modified + 33 untracked paths at audit time, all of which
are treated as the current truth here, not as noise to be reverted).

Everything below was read out of the code. Where a fact came from a command
rather than a file, the command is named. Rationale for *why* things are shaped
this way lives in `CLAUDE.md`; this file is *what exists right now*.

---

## 1. Stack

| Concern | Actual |
| --- | --- |
| Framework | Next.js `^15.5.22`, **App Router only** (there is no `pages/`) |
| React | `19.0.0` |
| Language | TypeScript `^5.7.3`, `strict: true`, `moduleResolution: bundler`, path alias `@/*` → `./src/*` |
| Styling | Tailwind CSS `^3.4.17` with an explicit `tailwind.config.ts`; type scale and spacing scale are both overridden to 1.5x defaults; tokens are CSS vars in `src/app/globals.css` |
| UI library | None. `lucide-react` for icons; every component is hand-written |
| i18n | `next-intl` `^4.13.4` — `src/i18n/routing.ts` (`ko`/`zh`/`en`, default `ko`, `localePrefix: 'always'`, `alternateLinks: false`), `middleware.ts`, `request.ts`, `navigation.ts` |
| Package manager | npm (`package-lock.json`) |
| Test framework | `node:test` driven by `tsx`. `npm test` = `tsx --conditions react-server --test tests/**/*.test.ts`. **No DOM, no jsdom, no Testing Library, no component tests.** PGlite (`@electric-sql/pglite`) provides a real Postgres for repository tests |
| Lint | `npm run lint` → `next lint` (ESLint 9 flat config via `@eslint/eslintrc`). Prints a deprecation notice under Next 15; still passes |
| Typecheck | `npm run typecheck` → `tsc --noEmit` |
| Build | `npm run build` → `next build` |
| Deploy | Vercel, **manual** `vercel deploy --prod`. No git remote, no CI-triggered deploy. `.github/workflows/daily-quest-link-validation.yml` is the only workflow and it validates quest links, it does not deploy |
| Database | PostgreSQL via `postgres` (postgres.js), hand-written SQL, no ORM. **Tarkov Live only** — every other page is stateless and the whole site builds and renders with `DATABASE_URL` unset |
| PWA | Phase 8–9: `src/app/manifest.ts` → `/manifest.webmanifest`; custom `public/sw.js`; client `ServiceWorkerManager` + `ConnectivityProvider`. Kill switch `NEXT_PUBLIC_PWA_ENABLED`. Ops: `docs/operations/tarkovdex-pwa.md` + `docs/operations/tarkovdex-release-checklist.md`. Phase 9: update + kill-switch drills verified locally; install prompt / iOS still 미검증 |
| Service worker | `public/sw.js` — production register only; network-first for pages/APIs; never caches mutations/external/admin/cron |

### Node

Node v24.18.1 is installed at `C:\Program Files\nodejs` but is **not** on the
default session PATH. Prepend it before any npm command:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
```

### Server routes

| Route | Kind | Auth | Notes |
| --- | --- | --- | --- |
| `/api/items` | Route handler, dynamic | none | Wraps `getItems()` + `queryMarketItems()`. Every query param is validated against an allowlist `Set`. Returns `503 {error}` on upstream failure. `Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`. Since Phase 3: `?ids=` (comma-separated, capped at 1000) bypasses search/pagination and returns bare `{id,name,shortName,iconLink}` for exactly those ids — the quest tracker's item-requirement lookup, never the full catalog |
| `/api/tasks` | Route handler, dynamic | none | Same shape over `getTasks()` + `queryTasks()`. Since Phase 3: `?ids=` (capped, `MAX_TASK_IDS_PER_LOOKUP`=1000) returns full `Task[]` for exactly those ids via `task-query.ts`'s `tasksByIds()` — resolves a player's saved active/completed/raid-plan quest ids regardless of what the paginated search view currently shows |
| `/api/search` | Route handler, dynamic | none | Phase 4 unified search. Validates `locale`/`mode`/`domain`/`q`. Builds a server-cached per-(locale,mode) `SearchDocument[]` index (~5800 docs, ~15 min TTL) from existing loaders with per-domain `Promise.allSettled` (partial failure → `meta.partial`). Returns grouped scored results + optional related docs for a strong item hit. Never ships raw catalogs. `503 {error}` on total failure. `Cache-Control: public, s-maxage=60, stale-while-revalidate=600` |
| `/api/items?ids=&detail=market` | Route handler | none | Phase 5 watchlist batch: returns `MarketItem[]` for up to 1000 ids with feeRate; missing ids omitted (orphan UI) |
| `/[locale]/economy/watchlist` | Dynamic, `noindex` | local V4+ | Price watchlist board — not in sitemap |
| `/[locale]/economy/craft-calculator` | ISR 15m, `noindex` | local V5 + crafts | Personalised craft calculator — not in sitemap |
| `/[locale]/combat/budget-builder` | Dynamic, `noindex` | local V5 + market batch | Gear budget presets — cost/weight/slots only; not in sitemap |
| `/[locale]/news` | ISR 5m | Live feed + PatchImpact projection | Situation board; Phase 7 impact block/filters on same cards — no second route |
| `/[locale]/beginner` | ISR ~15m | combat + market filters | Question-led deterministic filters — in sitemap |
| `/api/cron/tarkov-live` | Route handler, dynamic | `Authorization: Bearer $CRON_SECRET` | The only writer to the live DB. Runs migrations, collects, interprets, revalidates |

Both public API routes are `Disallow`ed in `robots.ts`.

### Server actions

`src/app/[locale]/admin/live/actions.ts` — the operator review desk. Session is
an HMAC-signed HttpOnly cookie (`src/lib/live/admin-session.ts`), CSRF token is
session-bound, `requireSession()` throws rather than returning a boolean.

### Scheduled jobs

`vercel.json` requests `*/10 * * * *` for `/api/cron/tarkov-live`. Vercel's Hobby
plan collapses this to roughly daily regardless of the expression — hence
`LIVE_STALE_AFTER_MINUTES` defaulting to 1560 (26h).

---

## 2. Route map

Locale-prefixed under `/[locale]` (`ko` | `zh` | `en`). Counts from a real
`next build` (exit 0).

| Route | File | Render | `revalidate` | Notes |
| --- | --- | --- | --- | --- |
| `/` | `[locale]/page.tsx` | SSG, `force-static` | 600 | Home dashboard |
| `/news` | `[locale]/news/page.tsx` | SSG | 300 | Tarkov Live board |
| `/economy/items` | `[locale]/economy/items/page.tsx` | SSG, `force-static` | 900 | Flea market |
| `/economy/barters` | `[locale]/economy/barters/page.tsx` | SSG, `force-static` | 900 | Crafts/barters |
| `/economy` | `[locale]/economy/page.tsx` | SSG | — | Redirect stub → `/economy/items` |
| `/progression/tasks` | `[locale]/progression/tasks/page.tsx` | SSG, `force-static` | 21600 | Quest list |
| `/progression/tasks/[slug]` | `.../[slug]/page.tsx` | SSG via `generateStaticParams` | 21600 | **1572 pages** (524 quests × 3 locales) |
| `/progression/gunsmith` | `.../gunsmith/page.tsx` | SSG, `force-static` | 900 | 27 solved builds |
| `/progression` | `.../progression/page.tsx` | SSG | — | Redirect stub |
| `/combat/ammo` | `[locale]/combat/ammo/page.tsx` | SSG, `force-static` | 900 | |
| `/combat/armor` | `[locale]/combat/armor/page.tsx` | SSG, `force-static` | 900 | |
| `/combat` | `[locale]/combat/page.tsx` | SSG | — | Redirect stub |
| `/maps` | `[locale]/maps/page.tsx` | SSG, `force-static` | 21600 | |
| `/status` | `[locale]/status/page.tsx` | **dynamic** (`force-dynamic`) | — | Data trust centre. Reads fetch observations + the live feed; fetches no game data. Confirmed absent from `prerender-manifest.json` |
| `/local-data` | `[locale]/local-data/page.tsx` | SSG | — | Phase 2's data-management page — view/export/import/reset the versioned local-state document |
| `/progression/tasks/tracker` | `[locale]/progression/tasks/tracker/page.tsx` | SSG, `noindex` | — | Phase 3's quest tracker + raid planner. Entirely client-driven post-mount (like `/local-data`); `noindex` because its content is a fresh visitor's own empty local state — see `tarkovdex-local-state.md` §6.8 |
| `/about` | `[locale]/about/page.tsx` | SSG | — | |
| `/support` | `[locale]/support/page.tsx` | SSG | — | Ko-fi |
| `/items`, `/tasks` | legacy stubs | SSG | — | 308 → new paths (also in `next.config.ts` `redirects()`) |
| `/admin/live` | `[locale]/admin/live/page.tsx` | **dynamic**, `no-store`, `noindex` | — | Absent from sitemap, `Disallow`ed |
| `/[locale]/[...rest]` | catch-all | — | — | Calls `notFound()` so 404 renders inside the normal layout |
| `/robots.txt`, `/sitemap.xml` | `app/robots.ts`, `app/sitemap.ts` | static / 21600 | | Sitemap = 11 routes × 3 locales + 524 quest URLs, each with reciprocal hreflang + `x-default` → `/en` |

Error boundaries: `[locale]/error.tsx` (localized, `reset()` button, logs only
outside production) and `app/global-error.tsx`. `not-found.tsx` is localized.
`loading.tsx` exists for `economy/items`, `progression/tasks`, `maps`, and the
two legacy stubs.

---

## 3. Page-by-page

### Home — `/[locale]`

- **Data**: `getTraders` ×2 modes, `getMaps` ×2, `getEconomyDataset` ×2,
  `getLiveFeed` ×1 — seven parallel fetches, each individually wrapped by a
  local `optional()` helper so one failure omits one widget rather than the page.
- **Widgets**: `InGameClock` (client, no data, 100 ms tick, 7× accelerated raid
  clock), `LatestNewsBoard` (top 3 publishable live entries),
  `CraftProfitBoard`, `TraderRestockBoard` (client, `useRouter`),
  `BossSpawnBoard` (9 curated map ids).
- **Mode**: every widget takes a `pvpX`/`pveX` prop pair and picks via
  `useGameMode()`. No refetch on switch.
- **Status UI**: none. A widget that failed simply is not rendered. **The user
  cannot tell "no data" from "fetch failed".**
- **`WebSite` JSON-LD** inline via `serializeJsonLd`.

### Tarkov Live — `/[locale]/news`

- **Data**: `getLiveFeed(locale)` (read path only — `tests/live-security.test.ts`
  asserts as source text that `feed.ts` / `sources.ts` / `news/page.tsx` never
  import the collector, interpreter or pipeline).
- **Component**: `LiveBoard.tsx` (639 lines, client). State: `now` (1 s timer,
  seeded from server `renderedAt` so hydration matches), `filter`,
  `twitterLimit`, per-card `open`, viewer `zone`.
- **Status UI**: the only page with a real freshness model —
  `FeedFreshness = ok | partial | stale | down | never | unmanaged`, plus
  `degradedSources`, plus `lastCheckedAt` distinct from `renderedAt`.
- **PvP/PvE**: `showMode={false}` — a post's `LiveGameMode` (`pvp|pve|arena|
  unknown`) is content metadata, not the site-wide data mode.

### Flea market — `/[locale]/economy/items`

- **Data**: server renders exactly the default first page via
  `queryMarketItems()`, then `ItemsExplorer` (836 lines, the largest client
  component) fetches `/api/items` for every subsequent query. The full ~5000-item
  catalog is never shipped to the client.
- **Client state**: query, category, sale filter, sort, direction, fee rate,
  page. Mirrored to the URL with `history.replaceState` (not `useRouter`, so
  typing does not push history entries).
- **Freshness**: `MarketItem.freshnessHours` + `MARKET_PRICE_STALE_HOURS = 24`.
  Sorting demotes stale/unknown-price rows behind fresh ones for the
  price-derived sorts. **This is the only page with a per-row freshness signal,
  and it is local to this page.**
- **Failure**: SSR failure is silent (progressive enhancement); client fetch
  failure has its own error + retry UI.

### Crafts & barters — `/[locale]/economy/barters`

- **Data**: `getEconomyDataset` per mode through `settleModePair()`.
- **Component**: `EconomyExplorer` — station groups, expand state, sticky
  section nav with a measured header offset.
- **Failure**: both modes down → `DataError`. One mode down →
  `ModeAvailabilityBoundary` shows `DataError` only while that mode is selected.
  **Note the fallback pattern**: `datasets.regular ?? fallback` means the
  component is handed the *other* mode's data for the missing mode, and the
  boundary is what prevents it being displayed. Correct today, but it is a
  guard-by-convention that would silently mix modes if the boundary were
  removed.

### Quests — `/[locale]/progression/tasks` + `/[slug]`

- **Data**: `getTasks()` ×2 modes; `queryTasks()` shared by SSR and `/api/tasks`.
- **List component**: `TasksExplorer` — search (250 ms debounce, IME
  composition-aware), trader filter, map filter, `focusTaskId` for
  prerequisite jumps, paginated load-more with `AbortController`.
- **Detail**: `task-availability.ts` unions regular + PvE into a `TaskEntry`
  carrying `availability` (`both-identical | both-different | regular-only |
  pve-only`) and `modeDiffFields`. Slug routing is by trailing ObjectId; a stale
  name part permanently redirects to the canonical slug.
- **Korean text**: `src/lib/task-ko.json` (760-entry offline glossary) applied by
  `localizeTaskText()` only when upstream's own `tasks_ko` returned English.

### Gunsmith — `/[locale]/progression/gunsmith`

- `src/lib/gunsmith-builds.json` — a committed offline solver artifact, 27 quests
  × 2 modes. `getGunsmithTasks()` is pure presentation over it plus live trader
  and level data. `GunsmithExplorer` state is one `taskId`.

### Ammo — `/[locale]/combat/ammo`

- `AmmoChart` state: query, caliber, sort, tracer-only, `pinned[]` (comparison
  pins with a limit), `limit`, `queryReady`. Mirrored to the URL via
  `history.replaceState`.
- **Deliberately price-free**: `AmmoRound` carries no price field at all.
- Armor-class cells use `penetrationGrade()` — explicitly labelled as a relative
  grade, not a penetration probability.

### Armor — `/[locale]/combat/armor`

- `ArmorExplorer` state: query, armor class, body area, replaceable-plates
  toggle, limit. 15 API collider zones collapse to 5 body areas via `ZONE_AREA`.
- `effectiveClass()` = own class → best soft layer → best compatible plate.
- No scroll containers and no truncation inside the detail panel (explicit
  product constraint).

### Maps — `/[locale]/maps`

- `MapCard` is an **async Server Component**, so `maps/page.tsx` server-renders
  both modes' card lists and `MapsModeBoard` (client) picks which pre-rendered
  set to show.
- No search, no filter.

### About / Support

Static content pages. `SITE_AUTHOR` from `src/lib/site.ts`.

### Admin — `/[locale]/admin/live`

Korean literals, not message keys (single-operator internal tool). Dynamic,
`no-store`, `noindex`, excluded from sitemap and robots.

---

## 4. Data domains

| Domain | Loader | Source | Transform | Cache | Mode-split | Locale | Stale-detectable? |
| --- | --- | --- | --- | --- | --- | --- | --- |
| items | `getItems()` | `/{mode}/items` + `items_{locale}` | `Item` (trimmed; `bestVendorSellRUB` precomputed) | 15 min in-process | yes | dict lookup | **yes** — per-item `updated` |
| prices | (inside items) | same | `MarketItem` via `queryMarketItems()` | same | yes | — | **yes** — `freshnessHours` |
| traders | `getTraders()` | `/{mode}/traders` + dict | `TaskTrader` (+`hasStore`, `resetTime`) | 6 h | yes | dict | no `updated` field |
| crafts | `getEconomyDataset()` | `/{mode}/crafts` | `CraftDeal` | 15 min | yes | via items dict | item-level `updated` only |
| barters | `getEconomyDataset()` | `/{mode}/barters` | `BarterDeal` | 15 min | yes | via items dict | item-level `updated` only |
| quests | `getTasks()` | `/{mode}/tasks` + dict + maps + traders | `Task` (+`nameEn`, ko glossary) | 6 h | yes | dict + `task-ko.json` | **no timestamp at all** |
| quest requirements | (inside `Task`) | same | `TaskRequirement` (+`taskNameEn`) | — | yes | — | no |
| quest objective items/FIR | (inside `Task.objectives`, since Phase 3) | same | `TaskObjective.items`/`.foundInRaid` — previously mapped, dropped during translation, now passed through | 6 h | yes | — | n/a (booleans/ids, not prices) |
| ammo | `getCombatDataset()` | `/{mode}/items` filtered | `AmmoRound` | 15 min | yes | dict + caliber glossary | no (price stripped) |
| armor | `getCombatDataset()` | `/{mode}/items` filtered | `ArmorItem`/`ArmorPlate`/`ArmorSlot` | 15 min | yes | dict + material glossary | no |
| maps | `getMaps()` | `/{mode}/maps` | `GameMap` | 6 h | yes | dict | no |
| bosses | (inside `GameMap`) | `/{mode}/maps` `mobs` | `MapBossSpawn`, deduped by id keeping max chance | 6 h | yes | dict + mob-name glossary | no |
| gunsmith | `getGunsmithTasks()` | committed JSON + live tasks | `GunsmithTask` | build-time + 6 h | yes | dict | **artifact has no generated-at stamp** |
| news / events / patches | `getLiveFeed()` | Postgres (or Steam-only fallback) | `LiveEntry` | DB + 5 min ISR | content metadata only | stored per locale | **yes** — `lastCheckedAt` + `freshness` |

Joinable ids across domains: `Task.trader.id` ↔ trader id, `Task.map.id` ↔
`GameMap.id`, `ExchangePart.item.id` ↔ `Item.id`, `GunsmithBuildPart.item.id` ↔
`Item.id`. **All of these already exist and none of them are currently used to
link one page to another.**

---

## 5. Cross-page linking today

- `RELATED_LINK_CLASS` — one hardcoded sibling link per tool page (ammo ↔ armor,
  tasks → gunsmith).
- Quest prerequisite buttons → `TasksExplorer.openTask()` (in-page only).
- Home `LatestNewsBoard` → `/news`; `BossSpawnBoard` heading → `/maps`.
- Footer links to every top-level route.

That is the entire **pre-Phase-4** cross-linking surface. Phase 4 adds site-wide
unified search (`SearchTrigger` → `/api/search`, plus `/[locale]/search`) that
returns deep links into those existing routes and attaches related quests/crafts
under a strong item hit. There is still no dedicated item-detail page; search
hits land on list tools with `?q=` / anchors.

---

## 6. Duplicated or incomplete

Items 1–5 were the Phase 0 findings. Phase 1 (2026-08-03) closed 1–4 and locked
5 down; the original text is kept with its resolution so the reasoning survives.

1. ~~**Freshness is implemented twice and shared zero times.**~~ **Resolved.**
   `src/lib/data-status.ts` is the one vocabulary
   (`AvailabilityStatus`/`FreshnessStatus`/`DeliveryStatus` + `summarizeHealth`)
   and `DATA_DOMAINS` is the one threshold registry. `ItemsTable`'s per-row
   badge and `ItemsExplorer`'s header badge both read it, so the items page no
   longer has its own `fresh|aging|stale` wording. `FeedFreshness` is kept as-is
   on the news board and projected across by `availabilityFromFeedFreshness()`
   — an adapter, not a migration, because that model is load-bearing and tested.
2. ~~**`ToolIntro`'s `updatedAt` is dead.**~~ **Resolved.** Prop removed from the
   component and its one caller; replaced by `health`, whose timestamps render
   through `formatKst()`.
3. ~~**Status UI is `DataError` and nothing else.**~~ **Resolved.**
   `src/components/status/StatusUI.tsx` provides `DataStatusBadge`,
   `LastUpdated`, `StaleDataNotice`, `PartialDataNotice`, `EmptyState`,
   `ErrorState` and `DataSourcePopover` (a native `<details>`);
   `RetryAction.tsx` provides the one interactive piece. `DataError` remains for
   whole-page failure. `OfflineNotice` is deliberately deferred to Phase 8.
4. ~~**Failure is invisible on the home page.**~~ **Resolved.** Each widget takes
   `null` for failure and `[]` for empty and renders `ErrorState` vs
   `EmptyState` — which previously produced byte-identical markup.
5. **The `?? fallback` mode pattern** (barters/ammo/armor/gunsmith) still hands
   the wrong mode's dataset to a component and still relies on
   `ModeAvailabilityBoundary`. Phase 1 did not restructure it; it added
   `tests/mode-isolation.test.ts`, which reads those four pages **as source
   text** (regex over the file contents) and fails if any of them uses
   `?? fallback` without a boundary fed by per-mode availability — the same
   structural-guarantee idiom as `tests/live-security.test.ts`. **This is not a
   runtime or render test** — it cannot catch a boundary that is present in the
   source but wired to the wrong props, only a boundary's outright absence.
   Recorded as tech debt: replace with a real render-based check (a minimal
   `react-dom/server` render asserting `DataError` shows only for the
   unavailable mode) once the project has a reason to add that kind of test
   infrastructure — do not add it for this one assertion alone.
5b. **`/status` cannot report a service-wide history.** The observation registry
   is in-process memory, so on Vercel a request may land on an instance that has
   never fetched anything and the page correctly reports "no record on this
   instance". Making it deployment-wide needs persistent storage, which Phase 1
   deliberately did not add.

6. **Filter state is not persisted** anywhere. `ItemsExplorer` and `AmmoChart`
   mirror to the URL; `ArmorExplorer`, `EconomyExplorer`, `TasksExplorer`,
   `GunsmithExplorer` and `LiveBoard` lose everything on reload.
7. **`tests/` has no component tests.** 174 tests, all pure-function or
   repository-level.
8. **Quest and structural domains have no timestamp**, so a stale-detection
   feature cannot cover them without inventing one — see the data-flow doc for
   what is honestly derivable.

---

## 7. Verification run at audit time

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass, no output |
| `npm run lint` | pass — "No ESLint warnings or errors" (plus the `next lint` deprecation notice) |
| `npm test` | **174 pass / 0 fail**, 11.8 s — after Phase 1: **234 pass / 0 fail**, 11.6 s — after Phase 2: **314 pass / 0 fail**, ~14.5 s — after Phase 3: **388 pass / 0 fail**, ~14.7 s — after the 2026-08-03 data-trust hotfix: **527 pass / 0 fail**, ~15.3 s |
| `npm run build` (`GEMINI_API_KEY` empty) | exit 0. Shared first-load JS 103 kB; largest route `/economy/items` at 129 kB — after the hotfix, shared still 103 kB, `/economy/items` 148 kB, home route 13.3 kB / 145 kB first load |

---

## 8. Post-deploy data-trust hotfix deltas (2026-08-03)

The page-by-page notes above are the Phase-0 audit snapshot. Four entries in
them are now out of date; the corrections are here rather than rewritten in
place so the audit stays readable as a record of what was found.

### Home — `/[locale]`

- **Status UI: no longer "none".** The craft board now renders two labelled
  groups — a current ranking and a dated-price reference group carrying
  `StaleDataNotice` plus a per-card `LastUpdated`. The trader board renders an
  `EmptyState` explaining unavailable restock times instead of one card per
  trader. `ErrorState`/`EmptyState` distinguish failure from emptiness on all
  four widgets.
- **One server `renderedAt`** is computed once and passed to both the craft
  freshness partition and `TraderRestockBoard`, which seeds its clock from it —
  so server and first client render agree and the widgets share one "now".
- Fetch count is unchanged: still seven parallel loader calls, each wrapped by
  the same local `optional()`.

### Data trust — `/[locale]/status`

- Makes exactly **one** bounded read (`/regular/items` through the existing
  15-minute `fetchTarkovJson` runtime cache) so `itemPrices`, `crafts` and
  `barters` report a real upstream content age instead of `unknown`. Still
  `force-dynamic`, still calls no loader, and the read is isolated in its own
  `try`/`catch`.
- Availability and observation are separate rows. An undetermined availability
  renders as `unknown`; observation presence has its own labelled row.

### Tarkov Live — `/[locale]/news`

- `LiveEntry.translated` is derived from the **body** alone, so a reviewed
  localized title over an English original is reported as untranslated. The
  collapsed row carries a compact `live.untranslatedBadge`; the reviewed title
  still renders.

### Pure modules added

`src/lib/trader-restock.ts` (`selectActionableRestocks`) and
`src/lib/data-status-snapshot.ts` (`getDomainStatusSnapshot`, server-only,
loader injected), plus `partitionCraftLeadersByFreshness` in the existing
`src/lib/tool-calculations.ts`.
