# TarkovDex product completion roadmap

## Newsroom V2 official Telegram release (2026-08-03)

Completed as a compatibility projection over Tarkov Live rather than a second
destructive database: official-source contract, protected manual importer,
normalization/dedupe/classification/story merge, translation glossary/style/
schema gates, review-first publication, lifecycle, URL-synchronized accessible
tabs/filters, official-only homepage selection, ko/en/zh, tests, operations docs,
Preview, and Production deployment. Automatic Telegram history collection stays
disabled until an authorized adapter/credential is explicitly supplied.

Written **2026-08-03** after the Phase 0 audit. Source of truth for what each
phase does, in what order, and what it deliberately does not do.

Companion documents:

- `docs/architecture/tarkovdex-feature-inventory.md` — what exists
- `docs/architecture/tarkovdex-data-flow.md` — how data moves, where timestamps exist
- `docs/architecture/tarkovdex-local-state.md` — persistence design
- `docs/qa/tarkovdex-product-acceptance.md` — acceptance criteria

## Standing constraints (apply to every phase)

1. **Never invent a value.** No price becomes `0`, no missing timestamp becomes
   "now", no absent boss rate becomes a previous value. Absent stays absent and
   says so. `docs/architecture/tarkovdex-data-flow.md` §5 lists exactly which
   domains can honestly report an age — the rest report `unknown`.
2. **Never mix PvP and PvE.** Not in data, not in saved state, not in a
   calculation.
3. **Do not break a URL.** Every existing route, redirect and quest slug keeps
   working. `sitemap.ts`'s `ROUTES` list and `next.config.ts`'s `redirects()`
   move together with any addition.
4. **Reuse before writing.** `settleModePair`, `ModeAvailabilityBoundary`,
   `DataError`, `RELATED_LINK_CLASS`, `formatKst`/`formatLocalTime`/
   `formatRelativeTime`, `queryMarketItems`, `queryTasks`, `task-availability`,
   `tool-calculations`, `freshnessOf` — all already exist and all are load-bearing.
5. **Calculations are pure functions in `src/lib/`, tested.** Not in components.
6. **No new large dependency** without an explicit reason recorded here.
7. **Every phase ends with** `npm test` → `npm run typecheck` → `npm run lint` →
   `npm run build` → browser verification against `next start` (port 3001, per
   `.claude/launch.json`), then this roadmap is updated.
8. **Out of scope for this whole project**: image rights, copyright/trademark
   audit, licensing, terms of service, privacy policy, takedown pages, donation
   payment integration, and any bulk removal of current imagery. Those wait for a
   separate approval track.

---

## Phase 1 — Data trust: unified status model + shared status UI

**Goal.** Make "how current is this, and did it actually load" a first-class,
site-wide, honest answer.

**User value.** A player deciding whether to trust a flea price, a restock
countdown or a boss rate can see the data's age and whether the site is currently
able to check. Today failure and emptiness are indistinguishable.

**Reuse.** `freshnessOf()` in `src/lib/live/feed-freshness.ts` is the template —
it already reduces per-source health into a discrete freshness state and is
already pure and tested. `MarketItem.freshnessHours` and
`MARKET_PRICE_STALE_HOURS` are the existing per-row precedent. `DataError`,
`ToolIntro`, `formatRelativeTime`, `formatKst`, `formatLocalTime`,
`ModeAvailabilityBoundary`.

**The seam.** `fetchTarkovJson()` already owns `memoryCache` and already knows
whether a value came from a live response or the stale-on-error path. Recording
`lastSuccessAt` / `lastErrorAt` / `servedStale` per path there and exposing a
read-only accessor gives every domain its observation age **without touching a
single loader call site**. This is the whole of the plumbing work.

**Files — modify.**

- `src/lib/tarkov.ts` — record per-path fetch state; export a read accessor
- `src/lib/market-items-query.ts` — surface the existing freshness counts in `meta`
- `src/components/tools/ToolShell.tsx` — `ToolIntro` gains a real status slot; fix its
  `toLocaleString` timezone bug (see data-flow §7)
- every tool page (`economy/items`, `economy/barters`, `combat/ammo`,
  `combat/armor`, `progression/tasks`, `progression/gunsmith`, `maps`) — pass a
  `DomainDataState` into `ToolIntro`
- `src/app/[locale]/page.tsx` — home widgets report failure instead of vanishing
- `messages/{ko,zh,en}.json`

**Files — new.**

- `src/lib/data-status.ts` — `DataStatus`, `DomainDataState`, pure
  `statusOf(state, thresholds)` and `summarize(states)`
- `src/lib/data-sources.ts` — the static `DataSourceRecord[]` ledger
- `src/components/status/` — `DataStatusBadge`, `LastUpdated`, `StaleDataNotice`,
  `PartialDataNotice`, `EmptyState`, `ErrorState`, `RetryAction`,
  `DataSourcePopover` (`OfflineNotice` lands in Phase 8 with the rest of offline)
- `src/app/[locale]/status/page.tsx` — the data trust centre
- `tests/data-status.test.ts`

**Data contract.** `DataStatus = 'fresh' | 'warning' | 'stale' | 'unavailable' |
'unknown'` and `DomainDataState` exactly as specified in data-flow §6.
`DataSourceRecord` as specified in the brief, as a static constant — it is
documentation, not runtime state.

**UI.** Status badge inline in `ToolIntro` next to `GameModeBadge`; notices as
full-width bordered rows above the content they qualify (the existing
`rounded-lg border border-border` family, no new visual pattern); the trust
centre is one bordered card per domain listing status, last success, counts and
user impact.

**Mobile.** Badge + relative time on one line at 320 px; the trust centre is a
single-column card stack, never a table.

**Translation.** ~25 new keys under a new `status` namespace, all three locales
together. Status *labels* are translated; timestamps go through the existing
`Intl` helpers.

**Tests.** `statusOf` across every threshold boundary and every null combination;
`summarize` precedence (`unavailable` > `stale` > `warning` > `unknown` > `fresh`);
the fetch-state recorder including the stale-on-error path; `messages.test.ts`
key parity.

**Performance risk.** Low. The recorder is a `Map` write per fetch.

**Technical risk.** Medium — the honest answer is narrower than the brief's wish
list. Item counts and stale counts exist only for items/prices; every other
domain can report observation age but not content age. The trust centre must show
`unknown` rather than a plausible-looking number, and the copy has to make that
distinction readable. `gunsmith-builds.json` has no generated-at stamp at all;
adding one to the generator is in scope, backfilling an age for the current
artifact is not.

**Done when.** Status is visible and consistent on every data page; no page
renders a timestamp the code does not actually know; error and empty are visually
distinct; stale never looks fresh; nothing overflows at 320 px; ko/zh/en complete;
all five verification commands pass.

**Depends on.** Nothing.

**Not in this phase.** No caching-policy changes. No new data sources. No
retry/backoff redesign. No offline handling.

### Phase 1 as built (2026-08-03) — deltas from the plan above

Everything the plan promised shipped; five decisions differ and each is recorded
in `docs/architecture/tarkovdex-data-flow.md` §6.

1. **Three axes, not one enum.** `AvailabilityStatus` / `FreshnessStatus` /
   `DeliveryStatus` replaced the single `DataStatus`. A single enum cannot say
   "old but usable" and "showing the previous cached copy" at the same time,
   which is the exact pair this phase exists to distinguish. `summarizeHealth()`
   collapses them for the badge; the contract keeps the cause.
2. **In-memory observation is never presented as service-wide.** The plan's
   `lastSuccessAt` is a per-instance value on Vercel. It is labelled as such,
   `/status` says `no record on this instance` rather than inventing a time, and
   the only globally-true signal on that page is Tarkov Live's DB-backed
   `lastCheckedAt`. No new persistence was added.
3. ~~**`/status` fetches nothing.**~~ **Amended by the post-deploy data-trust
   hotfix (2026-08-03) — see the section at the end of this file.** The original
   reasoning still stands for *loaders*: calling every loader to render a status
   board would download tens of megabytes and would report the board's own fetch
   rather than what the site served. What it got wrong is that reading
   observations *only* left every `json.tarkov.dev` card hard-reporting
   `freshness: unknown`, including the three price-backed domains whose content
   age `/api/items` was already publishing. `/status` now makes exactly **one**
   bounded read (`/regular/items`, through the same 15-minute
   `fetchTarkovJson` runtime cache `/economy/items` already warms) to resolve a
   real `sourceUpdatedAt` for `itemPrices`/`crafts`/`barters`, isolated in its
   own `try`/`catch`. It remains `force-dynamic` (absent from
   `prerender-manifest.json`), and no loader is called.
4. **Two component files, not eight.** `status/StatusUI.tsx` (six presentational
   components, no `'use client'`, so the same code serves Server and Client
   Components) and `status/RetryAction.tsx`. `DataSourcePopover` is a native
   `<details>` — touch-usable, keyboard-reachable, zero client JS.
   `data-sources.ts` folded into `data-status.ts` as `DATA_DOMAINS`.
5. **`ToolIntro.updatedAt` removed, not repaired.** It was dead (one caller,
   passing `null`) and formatted with an unpinned `toLocaleString`. Replaced by
   the `health` slot; the gunsmith call site was updated with it.

Also done beyond the file list: `queryMarketItems`'s `meta` gained
`totalCount`/`staleCount`/`missingCount`/`delivery`, stamped by the two server
callers (`/api/items` and the items page) since a pure function cannot observe
the fetch layer; `ItemsTable`'s per-row badge and `ItemsExplorer`'s header badge
were moved onto the shared vocabulary and the registry thresholds, removing the
site's second freshness model; the four home widgets now use
`ErrorState`/`EmptyState`, which previously rendered byte-identical markup.

**Verification.** `npm test` 234 pass / 0 fail (174 baseline + 60 new across
`data-status`, `data-observations`, `tarkov-fetch-observation`, `mode-isolation`);
`typecheck`, `lint`, and a `GEMINI_API_KEY=`-empty build all clean; message keys
561/561/561 identical. Browser QA against `next start`: 13 route×locale
combinations at 320 px with zero page-level overflow and zero sub-44 px targets
introduced by this phase, `/status` rendering in ko/en/zh, and `/api/items`
observed transitioning `delivery: network → cache` across two live requests.
**Not browser-verified:** a real upstream outage — the stale-on-error render
path is covered instead by `tests/tarkov-fetch-observation.test.ts`, which
drives the real `fetchTarkovJson`, its real cache and its real 60-second retry
pin with only the network and clock replaced.

**Known pre-existing issues found and deliberately not fixed here** (Phase 9
owns them): `/ko/progression/gunsmith` overflows to 332 px at a 320 px viewport
because of a `퀘스트 지정` badge in `GunsmithExplorer`, and the ammo/armor
tracer/plate checkboxes are 24 px tall. Neither is in a file this phase touched.

---

## Phase 2 — Versioned local state

**Goal.** One namespaced, versioned, validated, migratable localStorage layer
that every later phase writes through.

**User value.** Nothing visible on its own — this is the foundation for Phases
3, 5, 6 and 8. Ship it as its own phase so the storage contract is settled before
four features depend on it.

**Reuse.** `GameModeContext`'s SSR-safe effect-read pattern, kept and generalised.

**Files — new.** `src/lib/local-state/{schema,validate,migrate,storage,index}.ts`,
`tests/local-state.test.ts`.

**Files — modify.** `src/contexts/GameModeContext.tsx` becomes a thin adapter —
`useGameMode()`'s signature does not change, so no consumer is touched.
`src/app/[locale]/layout.tsx` (provider), `src/app/[locale]/support/page.tsx` or a
new settings surface for reset/export/import, `messages/*`.

**Data contract.** Full design in `docs/architecture/tarkovdex-local-state.md` §3.
Key points: single key `tarkovdex:v1`; `schemaVersion`; ids never display names;
quest progress keyed per `GameMode`; legacy `tarkovdex:gameMode` adopted then
removed; a higher `schemaVersion` is refused, not destroyed.

**UI.** A settings block with reset / export / import. Import failures state a
reason.

**Mobile.** Native `<input type="file">` for import, no custom drop zone.

**Translation.** ~12 keys.

**Tests.** The list in local-state §4 — corrupted JSON, per-field recovery,
migration, version refusal, legacy adoption, mode separation, quota-throw
tolerance, export/import round-trip and rejection.

**Performance risk.** One JSON parse on mount. Negligible.

**Technical risk.** Low, provided nothing reads storage during render.

**Done when.** State survives reload; another tab's change syncs; a corrupted
document recovers with a diagnosable backup; export/import round-trips and
rejects bad input with a reason; zero hydration warnings; tests pass.

**Depends on.** Nothing (parallel with Phase 1).

**Not in this phase.** No feature uses it yet beyond `gameMode`. No server-side
persistence. No accounts. No sync.

### Phase 2 as built (2026-08-03) — deltas from the plan above

Full account in `docs/architecture/tarkovdex-local-state.md` §5. Summary:

1. **Schema is narrower than the plan.** `LocalState` stores only
   `preferences.gameMode` and `metadata.{createdAt,updatedAt}` — no `quests`,
   `ownedItemCounts`, `watchlist`, `recentSearches`, `raidPlans`,
   `craftPreferences`, `budgetPreferences`, and no `beginnerMode`. None of
   these have a locked field shape yet; §5.9 documents exactly how a future
   phase adds one (bump `SCHEMA_VERSION`, extend both validators, add a real
   migration branch — not a placeholder field today).
2. **`use-local-state.ts` split out of `store.ts`.** `npm test` runs under the
   `react-server` module condition, which has no `useSyncExternalStore` —
   found by running the tests, not anticipated. `store.ts` now has zero React
   import and is fully unit-testable; the hook lives in one small file that
   both `GameModeContext.tsx` and `LocalDataPanel.tsx` import.
3. **A real hydration bug was found and fixed during browser verification**,
   not caught by `next start`'s console (production suppresses detailed
   hydration warnings) — found instead by diffing the raw server HTTP
   response against the post-hydration DOM. `LocalDataPanel`'s storage-
   available check was fixed to default to the common case on both server and
   first client render, then correct itself in an effect, matching every
   other SSR-sensitive component already in this app.
4. **Settings surface is a new page, `/[locale]/local-data`**, not folded into
   `/support`. Footer-linked, alongside Phase 1's `/status`, in every sitemap
   and `pageMetadata`. New dedicated `localData` message namespace (not
   `status`), 45 keys.
5. **Reset confirmation is inline UI**, not `window.confirm()` — a two-step
   disclosure (trigger → `role="alertdialog"` with 계속/취소) so the copy,
   focus target and 44 px touch floor match the rest of the site instead of
   native browser chrome.

**Verification.** `npm test` 314 pass / 0 fail (234 baseline + 80 new);
`typecheck`/`lint` clean; message keys 606/606/606. Live `next start`
verification with two real browser tabs: PvP/PvE selection persists across
navigation and a locale switch; a simulated legacy `tarkovdex:gameMode`
visitor migrated correctly with verified-before-delete legacy-key removal; a
live cross-tab update propagated to an already-open, non-reloaded tab;
export/import/reset all verified end-to-end including every distinct import
rejection reason; zero console errors; zero overflow at
320/390/768/1280 px. Not verified live: a real quota-exceeded write or fully
blocked storage — covered instead by injected-`StorageLike` unit tests
exercising the identical code path.

## Phase 3 — Quest item tracking + raid preparation sheet

**Goal.** Turn the quest pages from a reference into a checklist a player works
against before and after a raid.

**User value.** The single highest-value feature in this project: "what do I need
to carry into Customs right now, and what have I already got".

**Reuse.** `getTasks()`, `Task.objectives`, `Task.requirements`, `queryTasks()`,
`task-availability.ts` (mode split is already solved), `TaskCard`,
`TasksExplorer.openTask()`, Phase 2 storage, Phase 1 status components.

**Files — modify.** `src/components/tasks/{TasksExplorer,TaskCard}.tsx`,
`src/app/[locale]/progression/tasks/page.tsx` and `[slug]/page.tsx`,
`src/lib/task-query.ts`, `messages/*`, `src/app/sitemap.ts` +
`src/lib/metadata.ts` (new route), `src/components/layout/{Header,Footer}.tsx`.

**Files — new.** `src/lib/quest-requirements.ts` (pure: objectives → required
item lines, aggregation, shortfall), `src/lib/raid-plan.ts` (pure: map + active
quests → plan), `src/app/[locale]/progression/raid/page.tsx`,
`src/components/progression/{QuestTracker,RaidPlanBoard}.tsx`,
`tests/quest-requirements.test.ts`, `tests/raid-plan.test.ts`.

**Data contract.** Aggregation is keyed on **item id**, never on name — two
distinct ids sharing a display name must never merge. Objective metadata that
upstream does not provide (found-in-raid flags, time-of-day conditions, exit
requirements) is rendered only where the objective data actually carries it, and
omitted otherwise. This is the phase where the "no invented data" rule is most at
risk: the brief lists conditions the API may not expose, and the audit found
`TaskObjective` carries `{id, type, description, optional, count}` and nothing
more. **Before building the UI, dump the live distribution of `objective.type`
and record which of the brief's conditions are actually derivable.** Anything not
derivable ships as a free-text note field the player fills in, not as a fabricated
badge.

**UI.** Quest list gains a complete/active control per card. A new raid page:
pick map → auto-group that map's active quests → aggregated item list with
needed / owned / short → editable gear and notes → check states.

**Mobile.** Checkboxes at the 44 px floor, thumb-reachable, single column.

**Translation.** ~40 keys.

**Tests.** Duplicate item lines across quests sum; same-name-different-id never
merges; PvP and PvE aggregate separately; owned/short arithmetic including
over-supply; map grouping matches `task.map.id`; a null map does not land in any
map's plan.

**Performance risk.** Aggregating ~500 quests × objectives client-side per
render. Memoize on `(mode, activeIds)`.

**Technical risk.** **High, and it is a data risk, not a code risk** — the
feature's usefulness is bounded by what `TaskObjective` actually contains. Do the
data audit first and let it shape the scope.

**Done when.** Same-map quests group correctly; quantities aggregate correctly;
owned/short are correct; checks survive reload; PvP/PvE never mix; completed
quests are visually distinct; no condition is displayed that the data does not
support.

**Depends on.** Phase 2 (required), Phase 1 (status surfaces).

**Not in this phase.** No item-price integration in the plan (Phase 6). No
Kappa/hideout planning. No quest-tree graph view.

### Phase 3 as built (2026-08-03) — deltas from the plan above

Full account in `docs/architecture/tarkovdex-local-state.md` §6 and
`docs/architecture/tarkovdex-data-flow.md`'s task-data audit. Summary:

1. **The audit found far more structured data than the "reported"
   `{id,type,description,optional,count}` shape.** `RawObjective` (already
   fetched from json.tarkov.dev) carries `items: string[]` and
   `foundInRaid: boolean` too, both simply dropped during mapping until now.
   `TaskObjective` gained both fields, additively — see the data-flow doc.
   `neededKeys`/`exitName`/`exitStatus`/`targetNames`/`timeFromHour`/
   `wearing` also exist upstream but stay unsurfaced per the brief's own
   explicit exclusion list, reinforced by a real data-quality finding
   (`exitStatus` includes a literal untranslated dictionary-key string).
2. **Files differ from the plan.** No `src/lib/raid-plan.ts` (folded into
   `quest-reducers.ts`, since a raid plan *is* local-state, not a separate
   pure-computation module) and no `/[locale]/progression/raid` route (built
   as `/[locale]/progression/tasks/tracker` instead — one page holding both
   the item-requirement summary and the raid planner, linked from the quest
   list, rather than two features under two names). `RaidPlanBoard` became
   three components (`RaidPlanList`, `RaidPlanEditor`,
   `OrphanedReferenceNotice`) plus `QuestStatusToggle` and
   `RequiredItemsSummary` — see the local-state doc §6.4/§6.8 for why.
3. **Storage lives in the versioned `LocalState` document (schemaVersion 2),
   not a separate mechanism** — `getQuestProgress`/`getRaidPlans`/etc. in
   `@/lib/local-state`, backed by pure reducers in `quest-reducers.ts`. This
   was not in the original file list because Phase 2 hadn't been scoped with
   quest/plan storage yet; folding it into the same document (rather than a
   parallel store) is what gives raid plans automatic cross-tab sync,
   memory-fallback-on-storage-failure, and import/export coverage for free.
4. **Two new bounded `?ids=` API lookups** (`/api/tasks`, `/api/items`),
   mirroring each other — the tracker needs full `Task`/`Item` data for a
   player's saved ids regardless of what the paginated search view currently
   shows, without ever shipping the full catalog client-side (the exact
   constraint that shaped `/economy/items` originally).
5. **A real hydration-adjacent bug, found by an automated rapid-click test,
   not anticipated**: `OwnedCountInput`'s +/- buttons computed
   `value + 1` from a component prop; two clicks in one React batch both
   read the same stale value. Fixed by reading the live store value at
   click time instead — see the local-state doc §6.9.
6. **One pre-existing regression test had to be narrowed**, not broken: a
   blanket ban on the identifier `foundInRaid` anywhere in `src/` (guarding
   a different, abandoned `progression/fir`/`ProgressionChecklist` feature)
   conflicted with this phase's audited, explicitly-requested reuse of the
   same real upstream field name under an unrelated route/component. Narrowed
   to keep guarding the actual old artifacts.

**Verification.** `npm test` 388 pass / 0 fail (314 baseline + 74 new);
`typecheck`/`lint` clean; message keys 678/678/678. Live `next start`
verification across multiple real tabs: quest activate/complete from the
existing list page flows into the new tracker; item aggregation renders real
resolved names with correct required/owned/missing math; PvP/PvE isolation
holds (switching modes shows the other mode's independent empty/populated
state); a raid plan's map, quest selection, structured objective checklist,
custom items and debounced notes all survive a full reload; a live cross-tab
update propagated to an already-open tab; zero console errors and zero
horizontal overflow at 320/390/768/1280 px across ko/en/zh; one real 44 px
touch-target gap (a bare checkbox) found and fixed. Not verified live: a
genuine storage-quota/blocked write for this new state (covered by unit
tests, same gap Phase 2 already had); `next dev` hydration warnings (port
3000 was held by an unrelated process this session had no authorization to
stop); a raid plan at/near its 100-plan cap or with many simultaneous
objectives in a live 320 px browser render.

---

## Phase 4 — Unified search

**Goal.** One search entry point across items, ammo, armor, quests, crafts,
gunsmith and maps.

**User value.** "Salewa" answers a question without the player first deciding
which of seven pages to open.

**Reuse.** `queryMarketItems`/`queryTasks` filtering semantics, existing
`/api/items` and `/api/tasks`, `Task.nameEn` (already searchable both ways),
`game-localization.ts` for caliber aliases, Phase 2 for recent searches.

**Files — new.** `src/lib/search-index.ts` (pure: build + rank),
`src/app/api/search/route.ts`, `src/components/search/{SearchDialog,SearchResults}.tsx`,
`tests/search-index.test.ts`.

**Files — modify.** `Header.tsx` (trigger + shortcut), `layout.tsx`, `robots.ts`
(disallow `/api/search`), `messages/*`.

**Data contract.** The index is built **server-side** from data already fetched
and cached, and grouped results are returned per query — the client never
receives a full catalog (the same constraint that made `/economy/items` fast, see
CLAUDE.md "items — client-side search"). Result entries carry a domain, an id, a
localized label, an English label where one exists, and a deep link. **Every
result links to a route that already exists** — no new detail pages in this phase.

**UI.** Dialog with grouped results, arrow-key navigation, `Enter` to open,
`Escape` to close, focus trap and restore, highlighted matches, recent searches
with per-entry delete, and an empty state that suggests instead of dead-ending.

**Mobile.** Full-screen sheet; results must survive the on-screen keyboard being
open.

**Translation.** ~25 keys, including group headings and the shortcut hint.

**Tests.** Ranking (exact > prefix > substring > fuzzy); locale-correct casing
via `toLocaleLowerCase(locale)`; ko/zh/en and English-name matching; deduping
across domains; PvP/PvE separation; index build cost measured and asserted under
a ceiling.

**Performance risk.** **The main risk of this phase.** Index construction over
~5000 items must not run per keystroke or per request. Build once per
`fetchTarkovJson` window and cache alongside it; debounce input; cap results per
group. Measure and record the build cost — do not assume it.

**Technical risk.** Medium. Fuzzy matching is where scope creep lives — a bounded
edit-distance on short tokens only, no full fuzzy library.

**Done when.** All listed domains are searchable; results deep-link correctly;
recent searches persist; keyboard and screen-reader flows work; typing is not
blocked by index work; ko/zh/en all search.

**Depends on.** Phase 2 (recent searches).

**Not in this phase.** No external search service. No watchlist / beginner mode
(Phase 5). No personalised craft calculator (Phase 6).

### Phase 4 as built (2026-08-03) — deltas from the plan above

Everything the brief promised shipped. Decisions that differ from the short
roadmap sketch above:

1. **Server-cached index + `/api/search?q=` (not a full-catalog client
   download).** Cold index build measured at ~562 ms for 5803 documents;
   gzip of the JSON payload is ~352 KB. Query time avg ~21–30 ms / p95 < 40 ms
   for `salewa` / `M855` / Hangul map names — under the 50 ms goal. The client
   never receives the raw items/tasks/maps catalogs. Shared First Load JS
   stayed **103 kB**; `/search` is 6.06 kB own / 136 kB total; the dialog is
   `next/dynamic` from `SearchTrigger` so it is not in the shared chunk.
2. **`/[locale]/search` page exists** (roadmap sketch said dialog-only). It is
   `force-dynamic`, `noindex,follow`, absent from `sitemap.ts`, and reuses the
   exact same `/api/search` contract as the command palette.
3. **Salewa-style relations** attach under a strong item hit (`score >= 750`)
   as a separate related list (quests + crafts), not one overloaded card.
4. **Local state `schemaVersion: 3`** adds shared `recentSearches` (max 10,
   deduped by normalized query, shared across PvP/PvE). V1→V2→V3 and V2→V3
   migrations preserve `updatedAt`. Export is V3; import accepts V1/V2/V3.
5. **Traders are not a result domain** — no trader detail route. Trader names
   remain keywords/subtitles on quest documents.
6. **Deep links reuse existing routes**: items/ammo `?q=`, tasks slug, crafts
   `#station-section-*`, gunsmith `#gunsmith-{id}`, maps `#map-{id}`. Armor
   now also reads `?q=` so armor search hits land filtered.

**Verification.** `npm test` 422 pass / 0 fail; `typecheck` / `lint` / production
build clean; message keys 722/722/722. Live `next start` (port 3001):

- Header shows **통합 검색** + Ctrl K; dialog opens (Ctrl+K / button).
- `Salewa` → item (₽35,147 / 상인 ₽9,506 / 슬롯당 ₽16,695) + craft (의료 시설
  ₽11,423) + related quest **재고 부족** + related craft.
- Enter on selected item → `/ko/economy/items?q=Salewa` with search box
  prefilled and one matching row.
- `/ko/search?q=salewa` shows the same groups + domain filters; HTML has
  `noindex`; `/search` is not in `sitemap.xml` (false-positive matches are the
  quest slug `search-mission-…` only).
- Invalid locale/mode → API 400. ko/en/zh queries return 5803-doc indexes.
- Shared First Load JS remains **103 kB**; `/search` 6.06 / 136 kB total.
- Not fully re-verified in this pass: 320px keyboard-vs-results layout,
  multi-tab recent-search sync, and simulated partial-domain failure in the
  browser (covered by unit/API tests).

---

## Phase 5 — Price watchlist + beginner mode

**Goal.** Let a player mark items to follow, and give a non-expert a question-led
way into data that is currently presented as numbers.

**User value.** Return visits become useful ("what changed since I last looked");
new players get answers without knowing which stat matters.

**Reuse.** `MarketItem` (already carries `avg24hPrice`, `bestVendorSellRUB`,
`valuePerSlot`, `freshnessHours`, `valueSource`), `/api/items`, Phase 1 status
components, Phase 2 storage, existing ammo/armor/item filters.

**Files — new.** `src/lib/watchlist.ts` (pure: baseline vs current delta),
`src/lib/beginner-queries.ts` (pure: question → concrete filter set),
`src/app/[locale]/economy/watchlist/page.tsx`,
`src/components/economy/WatchlistBoard.tsx`,
`src/components/beginner/BeginnerFlow.tsx`, tests for both lib modules.

**Files — modify.** `ItemsTable.tsx`/`ItemsExplorer.tsx` (add/remove control),
`AmmoChart.tsx`/`ArmorExplorer.tsx` (beginner entry), `Header`/`Footer`,
`sitemap.ts`, `metadata.ts`, `messages/*`.

**Data contract.** `WatchlistEntry` exactly as the brief specifies, including
`gameMode`, so PvP and PvE entries never merge. A missing current price shows
**why** (flea-banned / no recent trade / fetch unavailable) using Phase 1's
status vocabulary, and the delta is omitted, never zero. Baseline carries its own
`baselinePriceType` and `baselineUpdatedAt` so a flea baseline is never compared
against a trader price.

**Beginner mode is a filter preset, nothing more.** Each question maps to an
explicit, displayed filter set over existing data. No tier list, no invented
ranking, no "best"/"strongest"/"must" language, and a one-click switch to the
expert view with the same filters applied.

**UI.** Watchlist as a card list (not a table — it must read at 320 px). Beginner
flow as a question list, each opening the target page pre-filtered with the
applied filters shown as removable chips.

**Mobile.** Question cards are full-width tap targets; the watchlist is one card
per row.

**Translation.** ~45 keys — the beginner questions are natural sentences per
locale, not literal translations of one source string.

**Tests.** Delta arithmetic including a missing baseline, a missing current price
and a price-type change; mode separation; every beginner query produces a
non-empty, explainable filter set; no query can return a result whose defining
field is null.

**Performance risk.** Low.

**Technical risk.** Medium — copy discipline. The forbidden-superlative rule
needs a test over the message files, the same way the existing glossary
assertions work.

**Done when.** Watchlist persists and never mixes modes; every price shows its
data timestamp; missing prices explain themselves; every recommendation shows its
criteria; expert-mode switching preserves filters.

**Depends on.** Phase 2 (required), Phase 1 (price status).

**Not in this phase.** No price history or charts — the API gives a 24 h average
and a 48 h change, not a series, and a chart would require storing history this
project has deliberately not built. No alerts or notifications.

### Phase 5 as built (2026-08-03)

1. **Phase 4 leftovers closed first.** Search dialog uses `100dvh` +
   `visualViewport` height/offset sync below `sm` so the sticky input stays
   visible when the soft keyboard opens; results remain in a `flex-1
   overflow-y-auto` region. Recent searches already flow through
   `useLocalState` → `storage` events (`applyExternalStorageChange`); Salewa
   related copy is `관련 퀘스트` + dynamic quest title `재고 부족` (Shortage) —
   not a hardcoded phrase bug.
2. **Local state `schemaVersion: 4`.** Per-mode `watchlist` (max 200,
   `itemId`+`priceType` unique) and `preferences.beginnerMode`. V1→V4 / V2→V4 /
   V3→V4 preserve quests, raid plans, recent searches, and timestamps;
   migration does not bump `updatedAt`. Export is V4-only; future versions
   refused.
3. **Watchlist.** Pure `computeWatchPriceDelta` compares only matching
   `WatchPriceType` (`flea` | `flea-net` | `trader` | `best-value`). Toggle on
   flea table + search item hits; page `/[locale]/economy/watchlist`
   (`noindex,follow`, not in sitemap) batch-fetches
   `/api/items?ids=&detail=market` in chunks of 100. Orphans stay until the
   user removes them.
4. **Beginner.** `/[locale]/beginner` (sitemap + indexable). Supported:
   ammo-for-class, quest-keep, value-per-slot. Partial: budget gear, light
   armor. Unsupported (shown, not guessed): level-15 unlock — trader purchase
   gates are not on `ToolItem`. Every result shows filter reasons; no
   “best/tier” language.
5. **Verification.** `npm test` 448 pass / 0 fail; message keys 806/806/806;
   shared First Load JS **103 kB**; `/economy/watchlist` 4.93 / 135 kB;
   `/beginner` 4.89 / 138 kB. Live `next start`: add from flea → watchlist
   shows name/baseline/current/flat delta; PvE empty (mode isolation); beginner
   class-4 ammo lists pen reasons.

---

## Phase 6 — Personalised craft calculator + loadout budget

**Goal.** Extend the existing craft profit maths with the player's own inventory
and station levels, and add a loadout cost planner.

**User value.** "Is this craft worth it *for me*" and "what does this kit
actually cost".

**Reuse.** `src/lib/tool-calculations.ts` is already pure and already tested
(the craft profit / missing-price / tool-return logic exists) — **extend it, do
not rewrite it**. `EconomyExplorer`, `getEconomyDataset`, `MarketItem` pricing,
Phase 2 storage, Phase 1 status.

**Files — modify.** `src/lib/tool-calculations.ts`,
`src/components/economy/EconomyExplorer.tsx`, `messages/*`, `sitemap.ts`,
`metadata.ts`, nav.

**Files — new.** `src/lib/loadout-budget.ts`,
`src/app/[locale]/economy/loadout/page.tsx`,
`src/components/economy/{CraftPlanner,LoadoutBudget}.tsx`,
`tests/loadout-budget.test.ts`, extensions to `tests/tool-calculations.test.ts`.

**Data contract.** The existing rule that a missing required price invalidates
the result (rather than becoming zero) is already implemented and stays. New:
a result that is computable but incomplete is labelled **partial** and names
which inputs are missing. Owned materials are excluded from purchase cost with an
explicit opportunity-cost toggle. Returned tools stay separate from consumed
inputs. Rounding happens at display only; internal maths keeps source precision.
Time units are seconds internally.

**UI.** Craft rows gain an inputs panel (station level, owned counts, fee, fuel,
batch size, price basis). The budget page is a category list with per-line price,
subtotals, total, weight, slots, cost-per-slot, and a clear "unpriced items"
section.

**Mobile.** Numeric inputs use `inputMode="numeric"`; totals are sticky at the
bottom rather than requiring a scroll to the end.

**Translation.** ~55 keys.

**Tests.** Missing price never becomes zero; partial results are labelled;
duplicate item quantities aggregate; owned-material exclusion with and without
opportunity cost; returned tools not consumed; hourly profit from base duration;
preset save/load round-trip; PvP/PvE price separation.

**Performance risk.** Low, if calculations stay memoized per input set.

**Technical risk.** Medium — input-explosion in the UI. Default every input to a
value that reproduces today's output exactly, so an untouched calculator behaves
as it does now.

**Done when.** All maths is in pure tested functions; missing price and zero are
distinguishable; presets reload; the calculator is usable on a phone.

**Depends on.** Phase 2, Phase 1, Phase 5 (price basis selection).

**Not in this phase.** No hideout construction planner. No barter-chain
optimisation. No multi-craft scheduling.

### Phase 6 as built (2026-08-03)

Shipped as personalised craft calculator + gear budget builder on top of V5
local state. Data feasibility gates were audited against live json.tarkov.dev
first (211 crafts/mode; tools via `attributes.tool`; no structured fuel;
single productItem today; flea fee reused only via `flea-net` / manual fee —
no invented EFT fee formula).

1. **Inventory single source (Option A).** `quests.ownedItemCounts` remains
   the shared per-mode inventory. Craft calculator and quest tracker call the
   same `getOwnedItemCount` / `setOwnedItemCount` APIs — no second craft-only
   quantity map.
2. **Local state `schemaVersion: 5`.** Per-mode `crafting.preferences` and
   `budgetPresets` (max 100 presets × 200 lines). V1–V4 migrate without
   bumping `updatedAt`; export is V5; future versions refused.
3. **Routes.** `/economy/craft-calculator` (ISR 15m, `noindex`) and
   `/combat/budget-builder` (`force-dynamic`, `noindex`). Not on sitemap.
   Linked from Header/Footer, barters page, search/watchlist/beginner via
   `AddToBudgetButton`.
4. **Pure libs.** `personalized-craft.ts`, `loadout-budget.ts`; extend
   `tool-calculations` tool detection rather than rewriting it. Budget is
   cost/weight/slots only — compatibility is explicitly not verified.
5. **Item.weight** added to the flea `Item` DTO for budget aggregation.

**Verification.** `npm test` 463 pass / 0 fail; typecheck/lint clean;
message keys 931/931/931; shared First Load JS **103 kB**; craft route
chunk ~6.11 kB / budget ~5.67 kB. Live `next start`: both pages 200 in ko;
compatibility notice visible; craft settings + craft list render.

---

## Phase 7 — Patch impact summary

**Goal.** Answer "what changed and does it affect me" per patch or announcement.

**User value.** Reading a patch note is not the same as knowing whether the
economy, your quests or a boss changed.

**Reuse.** All of Tarkov Live — `LiveEntry` already carries `category`,
`affects: AffectedArea[]`, `gameModes: LiveGameMode[]`, `reliability`,
`reviewStatus`, `publishedAt`, plus the admin review desk and the interpreter's
evidence-gated extraction. **`PatchImpact` is largely a projection of `LiveEntry`,
not a new pipeline** — build it as a view over the existing model rather than a
parallel store.

**Files — modify.** `src/lib/live/{status,feed}.ts`,
`src/components/news/LiveBoard.tsx`, `src/app/[locale]/news/page.tsx`,
`src/app/[locale]/admin/live/{page,actions}.tsx`, `messages/*`.

**Files — new.** `src/lib/live/patch-impact.ts` (pure projection + filtering),
`tests/patch-impact.test.ts`.

**Data contract.** `PatchImpact` as the brief specifies. `reviewStatus` maps from
the existing `ReviewStatus` (`auto_published`/`reviewed` → `human_reviewed` only
where a human actually acted). `effectiveAt` obeys the existing rule that a time
survives only with quoted source evidence. Unconfirmed impact areas stay
`unknown` — they are never asserted. The "site data not yet updated" indicator is
computed from Phase 1's `DomainDataState`: patch published at T, domain last
successfully fetched before T ⇒ not yet reflected. That is a real comparison, not
a guess.

**UI.** An impact-area filter row on the existing board plus an impact block
inside the existing card. **No second card type** — the brief requires no
duplication with the existing news card.

**Mobile.** Filter chips wrap and scroll horizontally within their own container,
never the page.

**Translation.** ~30 keys (impact area labels × 3 locales).

**Tests.** Projection from `LiveEntry`; filters; mode scoping; unknown stays
unknown; the not-yet-reflected comparison including the null-timestamp case.

**Performance risk.** Low.

**Technical risk.** Low-medium — the temptation is to have the interpreter assert
impact areas it cannot support. The existing evidence gate in `publish-rules.ts`
already handles this and must be reused, not bypassed.

**Done when.** No duplicate cards; filters work; mode scoping is correct; nothing
unconfirmed is stated as fact; the data-reflection indicator is real; ko/zh/en.

**Depends on.** Phase 1 (for the reflection indicator).

**Not in this phase.** No new sources. No historical patch archive. No diffing of
game data between patches.

### Phase 7 as built (2026-08-03)

1. **`PatchImpact` is a read-time projection** over existing `LiveEntry`
   (`src/lib/live/patch-impact.ts`). No second news pipeline, no DB migration,
   no runtime LLM, no search-domain addition.
2. **Classifier priority:** human override registry → structured
   `affects`/`gameModes`/`category` → `unknown`. Empty impact lists normalize to
   `['unknown']` and are never shown as "no impact".
3. **Data sync** compares optional domain `sourceUpdatedAt` to effective/publish
   time only. Instance `fetchedAt` never yields `reflected`. News page passes
   empty observations → overall `unknown` until a caller supplies content stamps.
4. **UI:** impact block on existing situation/feed cards, current-patch summary,
   impact-area filter chips with URL `?area=` (client `useSearchParams`, page
   stays ISR). Local state **schemaVersion stays 5**.
5. **i18n:** `patchImpact` namespace; leaf keys 990/990/990.
6. **Tests:** `tests/patch-impact.test.ts`; full suite 476 pass.

**Phase 6 residual.** Soft-keyboard / dual-tab UI still not fully verified on a
real device; VisualViewport + `storage` contracts remain in code.

---

## Phase 8 — PWA and offline

**Goal.** Installable, and useful without a connection for the things the player
saved.

**User value.** A checklist that works in a queue or on mobile data.

**Reuse.** Everything in Phase 2 is already client-side and already works
offline once the shell is cached.

**Audit result.** There is **no existing PWA and no existing service worker** —
no manifest, no `next-pwa`, nothing in `public/`. So this phase adds, it does not
reconcile. Icons already exist (`icon-192.png`, `icon-512.png`,
`apple-touch-icon.png`, `icon.svg`).

**Files — new.** `src/app/manifest.ts` (Next's typed manifest route, not a hand-
written JSON file), `public/sw.js`, `src/components/pwa/ServiceWorkerManager.tsx`,
`src/lib/offline-status.ts`, `tests/offline-status.test.ts`.

**Files — modify.** `layout.tsx`, `robots.ts`, `messages/*`,
`src/components/status/` (add `OfflineNotice`).

**Data contract.** Cache-first for static assets; stale-while-revalidate for the
app shell; **network-first for prices and news**. Mutating requests are never
cached. Cached content displays its capture time using Phase 1's vocabulary and
is never presented as current. Locale-prefixed routes are cached per locale.

**UI.** An offline banner; cached views show a "saved at" line.

**Mobile.** Install prompt handling; respect safe-area insets.

**Translation.** ~15 keys.

**Tests.** `offline-status.ts` is pure and testable; the service worker itself is
verified in-browser, since the `node:test` runner has no DOM (adding jsdom for
this alone is a bigger change than the feature — the same call the Tarkov Live
work already made).

**Performance risk.** A bad cache strategy can serve a stale shell forever.
Version the cache and clean old ones on activate.

**Technical risk.** **Highest of any phase.** Service workers persist across
deploys and can wedge a site for returning visitors. Mitigations: explicit
versioned cache names, `skipWaiting` only behind a user-visible update prompt,
never cache `/api/*` writes, and a documented kill switch. Verify against
`next start`, not `next dev`.

**Done when.** Installable; offline state is stated; quest checks work offline;
reconnect refreshes; no update loop; existing routing and ISR are unaffected.

**Depends on.** Phase 2 (required), Phase 1 (status vocabulary), Phase 3 (the
offline content that matters).

**Not in this phase.** No background sync. No push notifications. No offline
mutation queue.

### Phase 8 as built (2026-08-03)

**Choice.** Custom `public/sw.js` + `src/app/manifest.ts` (no Workbox / next-pwa).
Policy lives in `src/lib/pwa/sw-policy.ts` and is mirrored by the SW. Kill switch:
`NEXT_PUBLIC_PWA_ENABLED=false`. Operator doc: `docs/operations/tarkovdex-pwa.md`.

**Shipped.** Manifest (`start_url: /ko`), production-only registration,
network-first pages/APIs with SW `cachedAt` headers, `/offline.html` fallback,
connectivity banner + update/install prompts, `/local-data` offline-cache clear
(separate from user-data reset), `CachedDataNotice` on flea/watchlist fetches.
Local-state **schemaVersion stays 5**. Message keys **1021** leaf each locale.

**Verified in suite.** `tests/pwa-offline.test.ts` covers policy, connectivity,
manifest icons vs real PNG sizes, message parity. Full browser offline/install
prompt drills remain Phase 9 / ops checklist items when run against `next start`.

---

## Phase 9 — Product polish and final QA

**Status (2026-08-03): 조건부 완료** → RC freeze **조건부 릴리스 준비**.
Evidence: `artifacts/release-candidate-state.md`,
`artifacts/release-candidate-qa-report.md`.

Preview: `https://tarkovdex-q3k6l59fv-furss123s-projects.vercel.app` (target
preview; SSO-protected). Production **not** deployed in RC freeze.

**Goal.** Integrate Phases 1–8 into one shippable product: fix known UI defects,
re-verify local state / SEO / bundles, and run PWA lifecycle drills. **No** new
large product features; **no** production deploy in the Phase 9 / RC freeze
sessions.

**Fixes landed**

- Gunsmith 320px horizontal overflow (`questPart` badge into flex-wrap column).
- Ammo / armor checkbox hit targets: `size-touch` (44×44) wrappers.
- `/local-data` `robots.index: false` + removed from `sitemap.ts` ROUTES.
- `tests/phase9-release.test.ts` (layout / touch / noindex / PWA contracts).

**Measured baseline after Phase 9**

| Check | Result |
| --- | --- |
| `npm test` | **495 pass / 0 fail** (was 490; +5 Phase 9) |
| Message leaves | **1021** ko/en/zh |
| schemaVersion | **5** (`tarkovdex:v1`) |
| Shared First Load JS | **103 kB** |
| SW | `public/sw.js` ~8.3 kB, `PWA_CACHE_VERSION = 1` |

**Browser / PWA (`next start` :3007)**

| Drill | Result |
| --- | --- |
| Route smoke ko/en/zh | 200; noindex on personal tools |
| Manifest + SW headers | Pass |
| Offline home + banner | Pass |
| SW update A→B + cache cleanup | Pass |
| Kill switch (`NEXT_PUBLIC_PWA_ENABLED=false`) | Pass (LS preserved) |
| Dual-tab full UI click-through | Partial (iframe `storage` + unit tests) |
| `beforeinstallprompt` / Safari iOS / soft keyboard | 미검증 |

**Depends on.** All prior phases. Remaining gaps block a full “완료” verdict,
not a code freeze.

---

## Dependency graph

```
Phase 1 ──┬─────────────► Phase 5 ──► Phase 6
          ├──► Phase 7
Phase 2 ──┼──► Phase 3 ──────────────► Phase 8
          └──► Phase 4
                                       Phase 9  (all)
```

Phases 1 and 2 are independent and can be built in either order or in parallel.
Everything else waits on one of them.

---

## First implementation step (Phase 1) — expected file changes

**New**

- `src/lib/data-status.ts`
- `src/lib/data-sources.ts`
- `src/components/status/DataStatusBadge.tsx`
- `src/components/status/LastUpdated.tsx`
- `src/components/status/StaleDataNotice.tsx`
- `src/components/status/PartialDataNotice.tsx`
- `src/components/status/EmptyState.tsx`
- `src/components/status/ErrorState.tsx`
- `src/components/status/RetryAction.tsx`
- `src/components/status/DataSourcePopover.tsx`
- `src/app/[locale]/status/page.tsx`
- `tests/data-status.test.ts`

**Modified**

- `src/lib/tarkov.ts` (fetch-state recorder + accessor)
- `src/lib/market-items-query.ts` (freshness counts into `meta`)
- `src/components/tools/ToolShell.tsx` (status slot; timezone fix)
- `src/app/[locale]/page.tsx`
- `src/app/[locale]/economy/items/page.tsx`
- `src/app/[locale]/economy/barters/page.tsx`
- `src/app/[locale]/combat/ammo/page.tsx`
- `src/app/[locale]/combat/armor/page.tsx`
- `src/app/[locale]/progression/tasks/page.tsx`
- `src/app/[locale]/progression/gunsmith/page.tsx`
- `src/app/[locale]/maps/page.tsx`
- `src/app/sitemap.ts`, `src/lib/metadata.ts` (the `/status` route)
- `src/components/layout/Footer.tsx`
- `messages/ko.json`, `messages/en.json`, `messages/zh.json`
- `tests/messages.test.ts`

---

## Status

| Phase | State |
| --- | --- |
| 0 — Audit and architecture | **complete** (2026-08-03) |
| 1 — Data trust | **complete** (2026-08-03) — see "Phase 1 as built" above |
| 2 — Local state | **complete** (2026-08-03) — see "Phase 2 as built" above |
| 3 — Quest tracking + raid sheet | **complete** (2026-08-03) — see "Phase 3 as built" above |
| 4 — Unified search | **complete** (2026-08-03) |
| 5 — Watchlist + beginner mode | **complete** (2026-08-03) |
| 6 — Craft calculator + budget | **complete** (2026-08-03) — see "Phase 6 as built" above |
| 7 — Patch impact | **complete** (2026-08-03) — see "Phase 7 as built" above |
| 8 — PWA and offline | **complete** (2026-08-03) — see "Phase 8 as built" above |
| 9 — Final QA | not started |
| Post-deploy data-trust hotfix | **complete** (2026-08-03) — see below |

---

## Post-deploy homepage data-trust hotfix (2026-08-03)

A production review of the deployed homepage raised six suspected defects.
Four reproduced against real data and were fixed; two were checked and found
healthy, so nothing was changed for them. Full reproduction evidence and
measurements: `artifacts/post-deploy-homepage-audit.md`.

**No new feature, no new data source, no schema change.** `schemaVersion` stays
5, `NEXT_PUBLIC_PWA_ENABLED` stays `false`, no public URL moved, and no upstream
price was rewritten — the only thing that changed about a number is whether the
site is willing to call it current.

### Fixed 1 — the craft ranking presented a 243-day-old price as "현재 시세"

`selectBestCraftsByStation()` filtered for *missing* prices and never for *old*
ones. Bitcoin Farm has zero inputs, so its whole profit is one output price
whose upstream record was stamped 2025-12-03 — and it rendered identically to
the seven genuinely fresh leaders under copy that said "based on current
prices".

- `CraftProfitLeader.priceUpdatedAt` replaces the unused product-only
  `updatedAt`: the **oldest** `price.updated` across every priced non-tool input
  plus every output, and `null` if any contributor carries no stamp. One
  timestamp kind only — upstream content age, never a fetch or cache time.
- `partitionCraftLeadersByFreshness()` (pure, in `tool-calculations.ts`)
  classifies with the existing `contentFreshness()` and the `crafts` domain's
  already-registered 12 h / 24 h thresholds. **No new threshold was invented.**
  `fresh`/`warning` stay in the current ranking; `stale` and `unknown` move to a
  separate dated-reference group — `unknown` deliberately included, because an
  age we cannot establish must not be sold as a recent one.
- `CraftProfitBoard` renders the two groups in separate labelled sections, never
  interleaved, reusing `StaleDataNotice` and `LastUpdated` rather than adding a
  home-only status component. The stale cards each print their own price date.
- Copy moved off "현재 시세 기준" to "확인 가능한 최근 가격 기준" (and the en/zh
  equivalents), since the value can legitimately be a trader price.

### Fixed 2 — `/status` conflated "no observation" with an availability verdict

Two independent defects on the same page. `t('noObservation')` was printed
*inside* the Availability row whenever no health record existed, so a
per-instance bookkeeping gap read as a verdict about upstream; and
`observedHealth()` hard-coded `freshness: 'unknown'` for every
`json.tarkov.dev` domain even though `/api/items` already published a real
`meta.sourceUpdatedAt`.

- New server-only `src/lib/data-status-snapshot.ts`. `getDomainStatusSnapshot()`
  resolves each domain in the required order — loader `sourceUpdatedAt`, then
  observation, then `unknown` — and takes its price loader as an injected
  parameter so tests never touch the network. `DomainStatus.availability` is
  nullable and `observed` is a separate boolean, so the two questions cannot be
  collapsed again.
- Availability now renders `t('unknown')` when undetermined, and delivery
  observation moved to its own row (`status.label.observation`). Domains that
  genuinely publish no source timestamp keep `noSourceTimestamp` unchanged.
- Cost, measured: one cold 664 ms read per runtime per 15-minute cache window;
  every subsequent render 30–50 ms, indistinguishable from the previous
  no-fetch path.

### Fixed 3 — nine unusable trader restock cards

Root cause is upstream, not our mapping: every `resetTime` in
`json.tarkov.dev/regular/traders` was already 3–6 h in the past. The board
therefore rendered nine "unavailable" cards server-side and flipped all nine to
"refreshing" on hydration. Inventing a restock cycle is forbidden, so the fix is
honest presentation.

- New pure `src/lib/trader-restock.ts`. `selectActionableRestocks()` requires a
  parseable `resetTime` strictly in the future and sorts soonest-first.
- The home page passes a single server `renderedAt` instant, used as the board's
  initial `now` so the first client render matches the server markup — the same
  hydration-safety pattern `LiveBoard` already uses. The 1 s ticker only starts
  after mount. The same instant drives the craft freshness split, so the two
  cannot disagree about "now".
- Only actionable traders render. When none are, one `EmptyState` explains that
  every published time has passed and the next is not out yet, instead of nine
  repeated cards. The once-per-expiry-window `router.refresh()` is kept, but now
  watches only countdowns that were still running at render time — otherwise it
  would fire on every visit while upstream stays hours behind.
- `home.restockRefreshing` and `home.restockUnavailable` were removed from all
  three locales with the markup they served.

### Fixed 4 — an English body rendered as the Chinese translation

`sources.ts` set the translated flag when title **or** content differed, so
`news-zh.json`'s reviewed Chinese titles over untouched English bodies were
reported as fully translated, suppressing `live.translationPending`.
`pipeline.ts` had the identical OR, so the cron path would have persisted
`zh.translated = true` with an English body.

No translation was written and no content generated — only the flag's honesty
and its visibility changed. `RawPost.contentTranslated` is derived from the
**body** alone in both files, the reviewed title still renders, and a compact
`live.untranslatedBadge` now marks the collapsed row (the notice previously
existed only inside the expanded panel). Audited against the real committed
files: zh has 2 of 10 posts in this state, ko has 0 of 10.

### Checked and deliberately not changed

- **Root locale redirect.** Production honours `Accept-Language` (ko→`/ko`,
  en→`/en`, zh→`/zh`), falls back to `ko` when absent or unmatched, and lets an
  explicit cookie win. `middleware.ts` is a plain `createMiddleware(routing)`.
- **Home tool discoverability.** The header already exposes 11 tools plus
  unified search and the footer 17 including 데이터 신뢰도 and 퀘스트 추적기. A
  third entry point would lengthen the home page and grow its bundle for no
  gain.
- **Trader cache window.** `traders` stays on the 6 h structural window.
  Shortening it cannot help when the live upstream document itself serves past
  reset times.

**Verification.** `npm test` 527 pass / 0 fail (495 baseline + 32 new across
`home-craft-freshness`, `trader-restock`, `data-status-snapshot`, and four
translation-flag cases in `live.test.ts`); `typecheck`, `lint`, and a
`GEMINI_API_KEY=`-empty production build all clean; message keys 1029/1029/1029
identical (+10 new, −2 removed from 1021). Browser QA against `next start`:
9 route×locale combinations × 8 widths (320/360/390/430/768/1024/1280/1440) —
zero page-level horizontal overflow anywhere, zero interactive elements under
44 px tall, zero console errors and zero hydration warnings. Shared First Load
JS unchanged at 103 kB; the home route grew 11.9 → 13.3 kB (`LastUpdated` and
`StaleDataNotice` reaching that bundle) with First Load still 145 kB.

**Not verified in a browser:** the untranslated badge rendering, because the
local instance has no `DATABASE_URL` and the no-database news path publishes
nothing without curation. It is covered by unit tests plus a real-data audit of
every current Steam post against both committed translation files.
