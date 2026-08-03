# TarkovDex data flow

Audited **2026-08-03**. Companion to `tarkovdex-feature-inventory.md`; this file
follows a byte from upstream to pixel and records exactly where freshness can and
cannot be known.

---

## 1. The two independent pipelines

```
                    ┌──────────────────────────────────────────────┐
                    │  json.tarkov.dev  (static JSON, no auth)      │
                    └───────────────────┬──────────────────────────┘
                                        │  fetchTarkovJson(path)
                                        │  cache:'no-store' + 8s timeout
                                        │  validateTarkovDocument(path, json)
                                        ▼
                          ┌─────────────────────────────┐
                          │  memoryCache (per runtime)  │
                          │  Map<path, {expiresAt,      │
                          │              staleUntil,    │
                          │              value:Promise}>│
                          └──────────────┬──────────────┘
                                         ▼
        getItems / getTasks / getMaps / getTraders   (lib/tarkov.ts)
        getEconomyDataset / getCombatDataset / getGunsmithTasks
                                         │  translate(dict, raw)
                                         ▼
        queryMarketItems / queryTasks / tool-calculations   (pure)
                                         ▼
             Server Component  ──────►  Client Component (useGameMode)
                     │
                     └── /api/items, /api/tasks  ──►  client fetch


                    ┌──────────────────────────────────────────────┐
                    │  Steam RSS · X API v2 · manual curation       │
                    └───────────────────┬──────────────────────────┘
                                        │  WRITE PATH — cron only
                            /api/cron/tarkov-live  (Bearer CRON_SECRET)
                                        │  migrations → collect → interpret
                                        ▼
                              ┌──────────────────┐
                              │   PostgreSQL     │
                              │  raw_posts /     │
                              │  interpretations │
                              │  live_events     │
                              │  source_state    │
                              └────────┬─────────┘
                                       │  READ PATH — getLiveFeed(locale)
                                       ▼
                                   LiveBoard
```

The separation in the lower pipeline is enforced structurally, not by comment:
`tests/live-security.test.ts` reads `feed.ts`, `sources.ts` and `news/page.tsx`
as source text and fails if they import the X collector, the interpreter or the
pipeline.

---

## 2. Caching, layer by layer

### 2.1 `fetchTarkovJson` — the in-process cache (`src/lib/tarkov.ts`)

Next's built-in Data Cache rejects entries over 2 MB and the Tarkov dumps are
3–21 MB, so this project keeps one **parsed promise per path per runtime
instance** instead.

| Constant | Value | Applies to |
| --- | --- | --- |
| `PRICE_REVALIDATE_SECONDS` | 900 (15 min) | `items`, `items_*`, `barters`, `crafts` |
| `REVALIDATE_SECONDS` | 21600 (6 h) | everything else (`tasks`, `maps`, `traders`, `hideout`, their dicts) |
| `PRICE_STALE_IF_ERROR_SECONDS` | 7200 (2 h) | price paths |
| `STRUCTURAL_STALE_IF_ERROR_SECONDS` | 86400 (24 h) | structural paths |
| `RETRY_AFTER_ERROR_SECONDS` | 60 | how long a served-stale entry is pinned before retrying |

Behaviour on failure: if a cached value is still inside `staleUntil`, the old
promise is re-served and its `expiresAt` is pushed 60 s out. Otherwise the entry
is deleted and the error propagates to the caller's `try/catch`.

`validateTarkovDocument()` is an endpoint-aware shape gate run **before** a
response may replace a known-good entry — a 200 carrying an error object or a
missing collection is rejected as an invalid document rather than cached as an
empty one.

**Consequence for Phase 1:** serving stale-on-error is already implemented and
is currently **completely invisible to the user**. Nothing downstream of
`fetchTarkovJson` is told whether it received a fresh document or a
two-hour-old one.

### 2.2 Page-level ISR

Every data page pairs `export const revalidate` with `export const dynamic =
'force-static'`. The `force-static` is deliberate: with `revalidate` alone, the
large-endpoint routes were empirically flaky about building static across
repeated builds.

| Route | revalidate |
| --- | --- |
| `/news` | 300 |
| `/` (home) | 600 |
| `/economy/items`, `/economy/barters`, `/combat/ammo`, `/combat/armor`, `/progression/gunsmith` | 900 |
| `/progression/tasks`, `/progression/tasks/[slug]`, `/maps`, `/sitemap.xml` | 21600 |

### 2.3 CDN headers on the API routes

`/api/items` and `/api/tasks` both return
`Cache-Control: public, s-maxage=300, stale-while-revalidate=3600`.

### 2.4 What the layers mean together

A user viewing `/economy/items` may be reading a price that is up to
**page ISR (15 min) + in-process cache (15 min) + upstream's own generation lag**
old, and up to **2 h** older still if upstream has been failing. Only the
per-item `updated` field reflects the last of those. Today the UI surfaces
`freshnessHours` derived from that field but nothing about the first two layers.

---

## 3. Translation

Two mechanisms, do not confuse them:

1. **Dictionary lookup** for game data. `/{mode}/{endpoint}` values for
   translatable fields are *dictionary keys*, not text. `/{mode}/{endpoint}_{lang}`
   is a flat `{key: string}` map. `translate(dict, raw)` does the lookup, trims
   (upstream ships trailing spaces on every `items_ko` value) and falls back to
   the raw key so one missing entry shows a placeholder instead of breaking a
   page. **This applies to `en` too** — there is no "base file is already
   English" shortcut.
2. **Offline glossaries** for what upstream leaves untranslated:
   `src/lib/task-ko.json` (760 quest strings) and `src/lib/game-localization.ts`
   (calibers, armor materials, mob names). Both apply *only when* the API's own
   result contains no Hangul, so upstream wins the moment it catches up.

UI strings are a third, separate system: `messages/{ko,zh,en}.json`, **561 leaf
keys each, verified identical** (489 at the Phase 0 audit; Phase 1 added the
`status` namespace plus `pageMetadata.status` and `footer.status`, and removed
the seven superseded `items.freshness.*` / `items.dataSource` /
`items.dataUnknown` / `items.dataStatus` keys that the shared status vocabulary
replaced).

---

## 4. Failure isolation, as currently implemented

| Mechanism | Where | What it protects |
| --- | --- | --- |
| stale-if-error re-serve | `fetchTarkovJson` | a transient upstream blip does not empty a page |
| `settleModePair()` | barters, ammo, armor, gunsmith, maps, sitemap | one game mode failing keeps the other |
| `ModeAvailabilityBoundary` | same pages | shows `DataError` only while the failed mode is selected |
| local `optional()` | home page | one failed widget instead of a failed page |
| per-page `try/catch` → `DataError` | every tool page | translated error state |
| `error.tsx` / `global-error.tsx` | route + app | localized crash boundary with `reset()` |
| client fetch error + retry | `ItemsExplorer`, `TasksExplorer` | API failure is recoverable in place |
| `Promise.allSettled` in `optional`/`settleModePair` | — | never `Promise.all` on independent sources |

### The gap — **closed in Phase 1**

Every mechanism above used to turn a failure into **absence** rather than a
*statement*. As of Phase 1:

- A failed home widget renders `ErrorState` (`role="alert"`, negative border,
  X icon); a genuinely empty one renders `EmptyState` (neutral, inbox icon).
  They no longer share markup, which they previously did exactly.
- A page served from the stale-on-error cache reports `이전 데이터 표시 중` and
  shows a `StaleDataNotice`, because `fetchTarkovJson` now records
  `servedStale` and `domainHealth()` turns it into `delivery: 'stale-cache'`.
- `DataError` still exists for whole-page failure, but every tool page's
  `ToolIntro` now also carries a status badge, the content-update time where one
  exists, the fetch time, and a `<details>` source panel.

The one thing still not carried out of `fetchTarkovJson` is any *global* history
— see §6 for why that would need persistent storage this phase did not add.

Tarkov Live already modelled this correctly and was the template:
`lastCheckedAt` (last **successful** collection) is separate from `renderedAt`
(hydration seed), and `freshnessOf()` in `src/lib/live/feed-freshness.ts`
reduces per-source health into `ok | partial | stale | down | never | unmanaged`.
That function is the template for the rest of the site.

---

## 5. Where a timestamp actually exists

This is the constraint that shapes Phase 1. **Do not invent what is not here.**

| Domain | Upstream timestamp | Derivable "last successful fetch" | Verdict |
| --- | --- | --- | --- |
| items / prices | `item.updated` per item | yes, if `fetchTarkovJson` records it | **full status possible** |
| crafts / barters | only via their component items' `updated` | yes | **partial** — the deal itself has no stamp; the item prices it depends on do |
| traders | none (`resetTime` is a *future* restock, not a data age) | yes | **fetch-time only** |
| quests | none | yes | **fetch-time only** |
| ammo / armor | none (price fields deliberately stripped from the DTOs) | yes | **fetch-time only** |
| maps / bosses | none | yes | **fetch-time only** |
| gunsmith | none — `gunsmith-builds.json` carries no generated-at field | partially (its live trader/level join does) | **artifact age is currently unknowable** |
| news / events | `publishedAt`, `collectedAt`, `lastCheckedAt`, per-source health | already stored | **full status exists** |

### Phase 7 — PatchImpact data sync (read-time)

`PatchImpact.dataSync` may claim `reflected` only when a domain observation
carries a real upstream **`sourceUpdatedAt`** at or after the entry's
`effectiveAt` (else `publishedAt`). Domains without a content-timestamp
contract (`supportsSourceTimestamp: false`) stay `unknown`. Instance
`fetchedAt` / cold empty observation maps are **not** evidence of reflection —
the news page therefore passes `observations: []` and shows `unknown` unless a
future caller supplies stamps.

So a truthful site-wide status model has exactly **two** honest inputs:

1. **Content age** — only where upstream provides it (items/prices, live).
2. **Observation age** — when *this deployment* last successfully fetched the
   document, which `fetchTarkovJson` knows and currently discards.

Everything else (`unknown`) must stay `unknown`. In particular:

- `resetTime` is not a data-age signal.
- `gunsmith-builds.json` has no age until the generator writes one; until then
  its status is `unknown`, not `fresh`.
- ISR `revalidate` values describe *policy*, not *observation*. "Refreshes every
  15 minutes" is not the same claim as "was refreshed 4 minutes ago" and must not
  be rendered as one.

---

## 6. Phase 1 contract — **implemented** (`src/lib/data-status.ts`)

The single-`DataStatus`-enum design sketched here originally was replaced during
implementation by **three independent axes**, because collapsing them destroys
the distinctions this phase exists to make: "old but usable", "partly missing"
and "cannot show you this" are different answers, and so is "you are looking at
the previous cached copy".

```ts
export type AvailabilityStatus = 'available' | 'partial' | 'unavailable';
export type FreshnessStatus    = 'fresh' | 'warning' | 'stale' | 'unknown';
export type DeliveryStatus     = 'network' | 'cache' | 'stale-cache' | 'unknown';

export interface DataTimestamps {
  sourceUpdatedAt?: string;   // upstream's own content stamp — absent unless real
  fetchedAt?: string;         // when THIS instance last fetched successfully
  cacheStoredAt?: string;     // when the served value entered THIS instance's cache
  observedAt: string;         // when the state was evaluated
}

export interface DataHealth {
  domain: DataDomainId;
  availability: AvailabilityStatus;
  freshness: FreshnessStatus;
  delivery: DeliveryStatus;
  timestamps: DataTimestamps;
  totalCount?: number; staleCount?: number; missingCount?: number;
  retryable: boolean;
  publicMessageKey?: string;   // a message key — never an error string
  internalErrorCode?: string;  // diagnostics only, never rendered
}
```

`summarizeHealth()` reduces the three axes to one badge word, in this severity
order: `unavailable` > `previous` (stale-cache) > `partial` > `stale` >
`delayed` > `unknownAge` > `ok`.

### Which clock is which — the distinction that must not be lost

| Field | Means | Must never be presented as |
| --- | --- | --- |
| `sourceUpdatedAt` | upstream's own content timestamp | anything, unless upstream really provides it |
| `fetchedAt` | this instance's last successful fetch | a content-update time |
| `cacheStoredAt` | when the served value entered this instance's memory | a service-wide last-success time |
| `observedAt` | render/evaluation instant | any of the above |

Only **items/prices**, **crafts/barters** (via their component items' `updated`)
and **Tarkov Live** (`lastCheckedAt`) have a real `sourceUpdatedAt`. Every other
domain's `freshness` is hard-wired to `unknown` by
`DataDomainPolicy.supportsSourceTimestamp: false`, and
`tests/data-status.test.ts` asserts that thresholds exist *if and only if* a
domain claims a source timestamp — so a future edit cannot quietly start
reporting an age nobody measured.

### The seam — `src/lib/data-observations.ts`

`fetchTarkovJson` gained four one-line recorder calls on the paths it already
took (cache hit / success / stale-serve / hard failure). No loader call site
changed. `domainHealth({domain, gameMode, locale, availability, …})` merges the
observations for a domain's explicitly-mapped cache paths — `DOMAIN_ENDPOINTS`,
not substring inference — and reports the **oldest** component's fetch time, so
a fresh translation dictionary cannot make a stale base document look current.

`DataDomainPolicy[]` (`DATA_DOMAINS`) is the provider / cache-policy / fallback
ledger, a static typed constant. It deliberately has **no `expectedRefresh`
field**: this project knows its own cache TTLs but not upstream's regeneration
cadence, and the two are not the same claim.

### In-memory state is per instance — the limit, stated plainly

The observation registry is a module-level `Map`. On Vercel:

- every instance has its own copy;
- a cold start begins empty;
- instances never share it;
- it is destroyed on recycle.

So it is **not** a deployment-wide "last successful fetch" and the UI never says
it is. `/status` renders `이 서버 인스턴스에 확인된 기록 없음` (and its en/zh
equivalents) rather than a plausible-looking time, and carries a permanent
notice that the numbers describe the instance that answered the request. The one
genuinely global signal on that page is Tarkov Live's `lastCheckedAt`, which is
stored in Postgres.

Two further bounded inaccuracies, recorded rather than hidden:

1. `delivery` is written on every call, so two concurrent renders on one
   instance touching the same path can interleave and the later write wins.
   `stale-cache` is sticky until a fetch succeeds, so the important case cannot
   be lost to that race.
2. Tool pages are `force-static` with ISR, so their badge is computed at
   build/revalidation, not per request. The error is bounded by the route's own
   ISR window — 15 minutes on the price pages, against a 12-hour warning
   threshold — and the structural pages report `unknown` content age anyway.

---

## 7. Hydration-sensitive surfaces

Any Phase touching time must respect what is already established here:

- `formatKst()` pins `timeZone: 'Asia/Seoul'`, which is what makes it produce
  identical server and client output.
- `formatLocalTime()` deliberately takes `timeZone` as a **parameter** — the
  browser zone is only knowable after mount, so callers detect it in an effect.
- `LiveBoard` seeds its clock from the server's `renderedAt` and only starts the
  1 s timer after mount.
- `InGameClock` renders a two-column placeholder until mount.
- `GameModeContext` reads `localStorage` in an effect, never in the `useState`
  initializer, so the first render is always `'regular'`.
- ~~**`ToolIntro` is the existing violation of this discipline**~~ — **fixed in
  Phase 1.** The dead `updatedAt`/`locale` `toLocaleString` pair was removed
  from the component and from its one caller (`progression/gunsmith`), and
  replaced by a `health` prop whose timestamps render through
  `LastUpdated` → `formatKst()` (zone-pinned, hydration-safe).
- `LastUpdated` takes an optional `now` for a relative string. Callers only pass
  it where they already have a hydration-safe instant — `ItemsExplorer` seeds
  `now` from `meta.generatedAt`, the same way `LiveBoard` seeds from
  `renderedAt`. Without `now` it renders the absolute KST form only.

---

## 8. Environment

All optional except `NEXT_PUBLIC_SITE_URL`. With an entirely empty environment
the site builds, type-checks, tests, and renders every route; Tarkov Live falls
back to the Steam-only path, collection is off, admin refuses login. Full
operation needs `DATABASE_URL` + `CRON_SECRET` + `TARKOV_LIVE_ADMIN_SECRET`; see
`.env.example` and `docs/tarkov-live.md`. Secrets are never read outside
`server-only` modules and never logged.

---

## 9. Task objective data — live audit (2026-08-03, Phase 3)

Before Phase 3 built anything, the *actual* live `json.tarkov.dev`
`/regular/tasks` and `/pve/tasks` documents were fetched and audited in
full, not sampled from memory or the previously-reported type shape. Every
number below is from that fetch.

**Objective type distribution** (regular, 1467 objectives total): `visit`
210, `giveItem` 288, `shoot` 199, `extract` 103, `findQuestItem` 113,
`giveQuestItem` 102, `findItem` 144, `buildWeapon` 30, `plantItem` 122,
`experience` 1, `skill` 10, `plantQuestItem` 13, `mark` 99, `taskStatus` 9,
`traderLevel` 10, `useItem` 8, `sellItem` 5, `traderStanding` 1.

**What the raw objective actually carries, beyond the previously-mapped
`{id, type, description, optional, count}`** — confirmed by inspecting real
objects, not the schema alone:

| Field | Where it appears | Notes |
| --- | --- | --- |
| `items: string[]` | `giveItem`/`findItem`/`plantItem`/`sellItem` | 559 objectives total. **506 single-item (91%), 53 with alternatives (9%)** — one `sellItem` objective listed 3315 alternative ids. Zero dangling references against the item catalog (559/559 resolve) |
| `foundInRaid: boolean` | same three + `sellItem` | Present on all 559 item objectives, absent on the other 908 — a clean, fully structured field |
| `questItem: string` | `findQuestItem`/`giveQuestItem`/`plantQuestItem` | 106 distinct ids, **0/106 overlap with the item catalog** — a wholly separate id namespace, not resolvable to a market name/icon |
| `exitName`, `exitStatus: string[]` | `extract` | `exitStatus`'s value set in the audited data: `ExpBonusRunner`, `ExpBonusSurvived`, and a literal untranslated dictionary-key string `"marathon Name"` — a real data-quality problem, not just an incomplete signal |
| `targetNames: string[]` | `shoot` | Real boss ids (`bossTagilla`, `bossKilla`, `bossBoar`, ...) mixed with generic values (`Any`, `AnyPmc`, `Savage`, `PmcBot`) |
| `timeFromHour`/`timeUntilHour`, `wearing`/`notWearing` | `shoot` | Present in the schema; not deeply audited for reliability since the brief pre-excludes surfacing them regardless |
| `neededKeys` (task-level), `requiredKeys` (objective-level, nested array of alternative sets) | task / `plantQuestItem` | 59/501 tasks carry `neededKeys` |

**Referential integrity, full dataset**: 0/602 dangling `taskRequirements`
references; 0/559 dangling item references; **4 objective ids are each
reused, byte-identical, across 3 unrelated tasks** (not a data error —
confirmed these are genuinely distinct quests sharing one objective
definition) — see `tarkovdex-local-state.md` §6.2 for why this shaped the
raid-plan checklist key design. 501 regular / 497 pve tasks (27
regular-only, 23 pve-only — matches the pre-existing CLAUDE.md figures); a
30-task sample of shared ids showed 0 content differences beyond
availability.

**What Phase 3 actually uses**: `items` and `foundInRaid` were added to
`TaskObjective` (additive, non-breaking — see `tarkovdex-local-state.md`
§6.5). Everything else in the table above is deliberately **not** surfaced
as a structured fact anywhere in the UI, per the brief's own explicit
exclusion list — reinforced, not just followed blindly, by the `exitStatus`
data-quality finding and the non-unique-objective-id finding, both of which
independently argue against trusting those fields for a "survive"/"specific
exit" claim without much deeper validation than this phase had scope for.

## 8. Phase 4 — unified search data flow (2026-08-03)

```
loaders (getItems/getTasks/getMaps/getCombatDataset/getEconomyDataset/getGunsmithTasks)
  → Promise.allSettled per domain
  → pure build*Documents() → SearchDocument[]
  → in-memory cache keyed by locale+mode (15 min TTL)
  → GET /api/search?q&locale&mode&domain
  → pure searchDocuments() / groupSearchResults() / findRelatedDocuments()
  → SearchDialog | SearchPageClient
  → enrichSearchHit() via useLocalState + getQuestProgress(mode)
```

Partial domain failure sets `meta.partial` and `failedDomains`; other
domains still search. Missing numerics are omitted, never coerced to `0`.
PvP/PvE indexes are separate; user-state enrichment reads only the active
mode's quest/owned maps.

## 9. Phase 5 — watchlist + beginner data flow

```
MarketItem (feeRate) ← getItems / toMarketItem
  → WatchlistToggle → local modeData[mode].watchlist (ids + baseline only)
  → WatchlistBoard → GET /api/items?ids=&detail=market (chunk 100)
  → computeWatchPriceDelta(same priceType)

CombatDataset + MarketItem filters ← beginner-queries pure functions
  → BeginnerFlow reasons[] (no invented tiers)
  → optional WatchlistToggle on item-priced results
```

## 10. Phase 8 — service worker cache vs freshness

```
Browser GET (same-origin)
  → public/sw.js (production only)
       network-first for HTML + /api/items|/api/tasks|/api/search
       cache-first for /_next/static + icons
       bypass: mutations, external, /api/cron, /admin, Authorization
  → on cache hit: X-TarkovDex-From-SW-Cache + X-TarkovDex-Cached-At
  → client ConnectivityProvider / CachedDataNotice
       cachedAt = storage time; sourceUpdatedAt untouched
```

Offline HTML shell ≠ live prices/news. User progress remains `localStorage`
(`tarkovdex:v1`). See `docs/operations/tarkovdex-pwa.md`.
