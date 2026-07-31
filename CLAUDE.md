# CLAUDE.md — TarkovDex

Architecture notes and decision log for TarkovDex, an **unofficial** Escape from
Tarkov fan site. Data comes from the public
[json.tarkov.dev](https://json.tarkov.dev) static JSON API. This file is the
source of truth for *why* the project is shaped the way it is — read it before
making structural changes.

## What this is

- Flea market (item) prices, quest (task) guides, map guides, a home
  dashboard (raid clock, trader restocks, boss spawn rates), a news page
  (patch notes + events), and a support page.
- Three languages: Korean (`ko`, default), Simplified Chinese (`zh`), English (`en`).
- Korean-first audience, with zh/en as first-class alternates.
- Site-wide PvP/PvE mode toggle (Header) — flea market, quests, maps, and the
  home dashboard all switch together. See "Global PvP/PvE mode".

## Stack

| Concern        | Choice                                    |
| -------------- | ----------------------------------------- |
| Framework      | Next.js 15 (App Router) + React 19        |
| Language       | TypeScript (strict)                       |
| Styling        | Tailwind CSS v3 (explicit config)         |
| i18n           | next-intl v3 (routing + middleware)       |
| Icons          | lucide-react (SVG, no emoji)              |
| Data           | json.tarkov.dev static JSON (server-side); Steam News RSS for patch notes/events |
| Translation    | Gemini API (`@google/genai`) — news page's ko/zh translation only (was Claude API; see "Provider switch" in the decision log) |
| Hosting        | Vercel                                    |

## Folder structure

```
src/
  middleware.ts            # next-intl locale routing
  i18n/
    routing.ts             # locales, defaultLocale, localePrefix + isValidLocale
    navigation.ts          # locale-aware Link/useRouter/usePathname wrappers
    request.ts             # per-request locale + message loading
  contexts/
    GameModeContext.tsx    # site-wide PvP/PvE selection (client) — see "Global PvP/PvE mode"
  app/
    globals.css            # design tokens (CSS vars) + Tailwind layers
    sitemap.ts / robots.ts # SEO — ROUTES list here must stay in sync with the [locale] tree below
    [locale]/
      layout.tsx           # <html>/<body>, fonts, providers (next-intl + GameModeProvider), Header/Footer
      page.tsx             # home — dashboard widgets (clock/traders/bosses), see "Home page dashboard"
      not-found.tsx        # localized 404
      news/
        page.tsx           # patch notes + events, see "News page (patch notes + events)"
      items/
        page.tsx           # flea market — server fetch (full catalog, both PvP/PvE) + client search UI
        loading.tsx        # skeleton
      tasks/
        page.tsx           # quest guide (server fetch, both PvP/PvE + client filter UI)
        loading.tsx        # skeleton
      maps/
        page.tsx           # map guide (server component, both PvP/PvE, no filter/search)
        loading.tsx        # skeleton
      support/
        page.tsx           # Ko-fi support page
      about/
        page.tsx           # About page (creator credit)
  components/
    layout/                # Header, Footer, LocaleSwitcher, GameModeSwitcher
    home/                  # InGameClock, TraderRestockBoard, BossSpawnBoard (all client)
    news/                  # NewsCard (client, click-to-expand)
    items/                 # ItemsExplorer (client, owns search state),
                            # ItemSearch, ItemsTable
    tasks/                 # TasksExplorer (client, owns filter state),
                            # TaskSearch, TaskFilters, TaskCard
    maps/                  # MapCard (async server component), MapsModeBoard
                            # (client PvP/PvE switch over pre-rendered MapCards)
  lib/
    tarkov.ts              # json.tarkov.dev client: fetch + translate + map to our types (server-only)
    steam-news.ts          # Steam news RSS fetch + parse (server-only) — see "News page"
    translate-news.ts      # ko/zh translation of steam-news via Gemini API (server-only)
    format.ts              # Intl number/percent/date/duration/relative-time helpers
    site.ts                # SITE_AUTHOR / SITE_URL constants — see "Creator credit" below
  types/
    tarkov.ts              # our normalized types (Item/Task/GameMap/GameMode); raw
                            # API shapes live next to the fetch code in lib/tarkov.ts
messages/
  ko.json | zh.json | en.json   # UI strings only (not game data)
```

## Decision log

### i18n routing: `[locale]` segment, prefix always, ko default

- **Path-based locales** (`/ko/...`, `/zh/...`, `/en/...`) via a `[locale]`
  dynamic segment, not cookies/subdomains. Shareable, SEO-friendly, and lets each
  language be statically rendered.
- **`localePrefix: 'always'`** — even the default locale is prefixed (`/ko/items`,
  never `/items`). Chosen over `as-needed` because uniform URLs are simpler to
  reason about, make `hreflang` alternates symmetric, and avoid a "which locale is
  this?" ambiguity for the default. The tradeoff (a redirect from `/` → `/ko`) is
  handled by the middleware.
- **`ko` is the default locale** — the primary audience is Korean players.
- All three locales are pre-rendered via `generateStaticParams`; pages call
  `setRequestLocale(locale)` so they stay static despite reading the locale.

### Root layout lives at `app/[locale]/layout.tsx`

There is intentionally **no `app/layout.tsx`**. Every route is under `[locale]`,
so the locale layout *is* the root layout — it renders `<html lang={locale}>` and
`<body>`. This is the canonical next-intl App Router structure and keeps `lang`
correct for each locale. If a truly locale-less route is ever added, revisit this.

### ~~UI strings vs. game data — GraphQL `lang` argument~~ (DEPRECATED)

Superseded by the json.tarkov.dev migration below — kept only so the git
history/reasoning isn't lost. The *principle* (UI strings vs. game data are
two separate systems) still holds; only the *mechanism* for game data changed.

### ~~Data fetching & caching (GraphQL era)~~ (DEPRECATED)

This project originally called `api.tarkov.dev`'s GraphQL API directly, with
per-field query strings (`ITEM_FIELDS`, `TASK_FIELDS`, etc.) and a 10-minute
cache for prices. That endpoint returned `503 GraphQL server unavailable` for
*every* request — including introspection — for the entire span of Phase 1/2
development, so none of those queries were ever confirmed against real data.
Rather than keep waiting on an unreliable endpoint, the whole data layer was
rewritten against **json.tarkov.dev**, tarkov.dev's static JSON API — see
"json.tarkov.dev migration" below for the replacement and its rationale.

## json.tarkov.dev migration

`lib/tarkov.ts` was rewritten from scratch against
[json.tarkov.dev](https://json.tarkov.dev), pre-generated static JSON dumps of
the same underlying tarkov.dev data, after `api.tarkov.dev`'s GraphQL endpoint
proved unreliable in practice (persistent 503s, see above). Everything in this
section was **confirmed against live responses** (`curl`, plus real
`npm run dev` / `npm run build && npm start` renders) — unlike the GraphQL-era
code it replaces, which was never verified end-to-end.

### Base URL, game mode, endpoints

- Base: `https://json.tarkov.dev/{gameMode}/{endpoint}`.
- `gameMode` is `'regular'` (PvP) or `'pve'`. Both modes are fetched by the
  mode-aware pages (home/items/tasks/maps), then selected client-side through
  the global `GameModeContext`; `'regular'` remains the first-render default.
  Every `get*` function in `lib/tarkov.ts` accepts an optional `gameMode`
  parameter defaulting to `'regular'`.
- Endpoints used: `items`, `tasks`, `maps`, and `traders` (see "Traders" below
  for why a 4th endpoint was added to an originally items/tasks/maps-only
  scope). `barters`, `crafts`, `hideout` remain out of scope.
- Confirmed via `GET /endpoints`: `items`/`tasks`/`maps`/`traders` all have
  `translations: true`, and the API's language list includes `ko`, `en`, `zh`
  — matching our three locales exactly, no mapping table needed (unlike the
  old GraphQL `LanguageCode` mapping).
- Response shape is `{ data: {...} }`, an **object**, not an array — always
  `Object.values(doc.data.someKey)` to get a list. One exception: `traders`'
  `data` field *is* the id-keyed map directly (no nested `data.traders` key)
  — confirmed by fetching it live; don't assume symmetry with items/tasks/maps.

### Translation mechanism — dictionary lookup, NOT id-based merging

This is the part that's easy to get wrong by guessing, so it's worth stating
precisely. It is **not** "fetch two id-keyed collections and merge them by
id." Confirmed by fetching `regular/maps` and `regular/maps_ko` live and
comparing:

1. The **base file** (`/regular/{endpoint}`) has a `translations` array at
   its top level — a **JSONPath manifest** listing every field that's
   translatable, e.g. `"$.data.maps.*.name"`, `"$.data.mobs.*.name"`. This is
   authoritative and self-documenting; when adding a new field to a query,
   check this manifest rather than guessing whether it's translatable.
2. For every field the manifest lists, the base file's value for that field
   **is not real text — it's a dictionary key**. Example: a map's `name`
   field literally contains the string `"55f2d3fd4bdc2d5f408b4567 Name"`, not
   `"Factory"`.
3. `/regular/{endpoint}_{lang}` (e.g. `maps_ko`, `maps_en`) is a **flat
   `{ data: { [key]: translatedString } }` dictionary**. Look up the base
   value in this dictionary to get real, localized text:
   `dict["55f2d3fd4bdc2d5f408b4567 Name"] → "공장"` (ko) / `"Factory"` (en).
4. **This applies uniformly to every locale, including `en`** — there is no
   "the base file already has English text" shortcut. `maps_en` exists and
   must be fetched just like `maps_ko`/`maps_zh`.

One reusable helper implements this everywhere: `translate(dict, raw)` in
`lib/tarkov.ts`, backed by `getTranslationDict(endpoint, locale, gameMode)`.
Every `get*` function (`getItems`, `getTasks`, `getMaps`, `getTraders`) calls
these two — there is exactly one implementation of the lookup, not four.
`translate()` falls back to the raw key if a dictionary entry is missing
(rather than throwing), so one unusually-fresh piece of content shows a stray
placeholder instead of breaking the page.

### Traders (scope note — why a 4th endpoint was added)

Live data revealed that `tasks.json`'s `trader` field is a **plain id
string**, not a nested object (unlike the old GraphQL schema, which had
embedded `trader { name }`) — and that id does **not** resolve through the
`tasks_{lang}` translation dictionary. The only way to get a trader's name is
the separate `traders` endpoint. This directly conflicted with the original
migration scope, which explicitly excluded `traders` ("barters, crafts,
hideout, traders는 이번 범위 아님") — but the tasks page's brief (inherited from
Phase 2a) requires showing the trader name per quest, and the base+`_ko` file
alone cannot satisfy that.

**Decision (confirmed with the user before proceeding)**: add `traders` to
scope, but strictly as an id→name/image lookup — `getTraders(locale,
gameMode)` in `lib/tarkov.ts` — with **no dedicated traders page or UI**.
`regular/traders` (47KB) and `regular/traders_{lang}` (~4KB) are tiny, so the
cost of this scope addition is negligible; it's reused by `getTasks()` and
could be reused by any future page needing trader names. `getItems()`
deliberately does **not** join against traders — the items page only needs
`sellToTrader[].priceRUB` (the best vendor sell price number), never a vendor
name, so pulling in traders data there would be unused weight.

### Types: our normalized shapes vs. raw API shapes

`types/tarkov.ts` holds `Item` / `Task` / `GameMap` and their nested types —
these are **our own shapes**, not a mirror of the raw JSON. The raw shapes
(`RawItem`, `RawTask`, `RawMapEntry`, `RawTrader`, etc.) live as private
interfaces next to the fetch/mapping code in `lib/tarkov.ts`, since they're an
implementation detail of the translate-and-extract step, not something a
component should ever see directly. Notable deliberate translations between
raw and normalized shapes:

- **`Item.bestVendorSellRUB`** (a single `number | null`) replaces what was
  originally a `sellFor: { priceRUB }[]` array carried over from the
  GraphQL-era type. The raw json.tarkov.dev field is `sellToTrader[]` (more
  fields still: `trader` id, `price`, `currency`, `currencyItem`) — only the
  max `priceRUB` was ever used (the flea-banned fallback), so `getItems()`
  now reduces it to that scalar at the mapping boundary instead of shipping
  the array. Changed during the Step-2 migration review — see "items —
  client-side search" below for the full rationale (this was also a client
  payload-size win, not just a cleanup).
- **`Task.map`** is a single `{ id, name } | null`, matching the raw data's
  single `task.map` id field (confirmed live — the old GraphQL-era guess that
  a task's map had to be *derived* from unioning `objectives[].maps[]` was
  wrong; real tasks have one authoritative top-level `map` field, roughly
  half `null` for hideout/trader-only tasks).
- **`GameMap.bosses`** is deduped by mob id server-side (see "Maps page"
  below) — the raw data lists one entry per spawn location/condition, which
  would otherwise show the same boss multiple times with different chances.
- **`MapBossSpawn.spawnChance`** is a 0–1 fraction — confirmed against live
  data (e.g. Customs' Partisan is `0.2`), not a 0–100 percentage. Formatted by
  `lib/format.ts`'s `formatChance()`.

### Defensive mapping (arrays are optional on purpose)

`RawItem.sellToTrader`, `RawTask.objectives`, and `RawMapEntry.bosses` are all
typed **optional** (`?`) in `lib/tarkov.ts`, even though a full-dataset audit
found every current record has them (5055 items, 501 tasks, 17 maps — zero
missing). The reason is the failure mode, not today's data: these files are
**externally regenerated** (game patches), the mapping does `.map()` over
each array, and each `get*` runs inside the page's `try/catch`. Without the
guard, a single future record missing one array would throw and collapse the
**entire** list to the error state (all 5000 items gone, not just the one bad
record). The `?` on the type forces the `?? []` guard at each call site
(compiler-enforced, so it can't be silently dropped later), turning "whole
page dark" into "one field blank." This was added during the Step-1 review of
the migration; the audit + translation-coverage scripts that justified it are
one-offs (not committed) — re-runnable by re-fetching the endpoints if the
shape is ever in doubt again.

(`RawItem.types` no longer exists — it was one of several always-unused raw
fields trimmed off `RawItem` entirely during the Step-2 review, see "items —
client-side search" below, rather than kept-but-guarded like the arrays
above. The distinction: fields the mapping never reads don't need an optional
guard, only ones it actively iterates over.)

### items — client-side search (was server-side; changed during Step-2 review)

**This replaced an earlier, worse design.** The original items page read
`?q=` server-side (`searchParams.q` in `page.tsx`) and called `getItems({
locale, search, limit: 50 })`, which filtered the full 15.8MB `items`
response down to 50 matches before returning. That looked reasonable in
isolation, but **measured** behavior (Step-2 review, `curl` timing + response
headers against a real `next start` server) showed it was quietly defeating
caching entirely:

- `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`,
  **no** `x-nextjs-cache` header — vs. `tasks`/`maps`, which showed
  `x-nextjs-cache: HIT` and `s-maxage=21600`. Reading `searchParams` makes a
  Next.js App Router route **fully dynamic**; there is no static/ISR shell to
  fall back to, so *every single request* re-ran `getItems()` from scratch.
- Per-request timing (~0.4–0.7s, close to the raw endpoint's own download
  time) confirmed this wasn't a cache artifact of the local test — it was a
  real full 15.8MB fetch + `JSON.parse` + `Object.values()` scan **on every
  page load**, every time, indefinitely (not just until the first
  `revalidate` window like `tasks`/`maps`).
- Inspecting `.next/cache/fetch-cache/` directly confirmed the large base
  files were never written there at all (largest cached entry was ~2MB, the
  `items_ko` translation dict) — consistent with the Data Cache's ~2MB limit
  (see "Known limitation" below), which `tasks`/`maps` "get away with" only
  because their *page-level* ISR cache doesn't depend on the fetch-level one.

**Fix**: `getItems({ locale, gameMode })` no longer takes `search`/`limit` —
it returns the **entire** catalog (~5000 items), mapped to a deliberately
trimmed `Item` shape (see `types/tarkov.ts` — dropped `basePrice`, `width`,
`height`, `gridImageLink`, `wikiLink`, `types`, and the `sellFor[]` array,
which is now a single precomputed `bestVendorSellRUB: number | null`).
`page.tsx` no longer reads `searchParams` at all, so the route is static/ISR
again. `ItemsExplorer` (new client component, same pattern as
`TasksExplorer`) owns search state and filters the full array client-side
with `useMemo`; `ItemSearch` and `ItemsTable` were converted from
server-rendered/URL-driven to plain controlled client components to match.

**Payload cost, measured before committing to this** (not guessed): the
trimmed `Item[]` for the real, full catalog is **~1.5MB raw / ~245KB
gzipped** (measured via `JSON.stringify` + `zlib.gzipSync` against the real
`items.json` + `items_ko.json`). An earlier candidate that kept the full
`sellFor[]` array instead of precomputing `bestVendorSellRUB` was 1.88MB/310KB
— the precomputed-scalar version was chosen for being smaller with zero
functional loss (the array's only consumer was already just taking its max).
245KB gzipped for the whole browsable catalog was judged acceptable (smaller
than a typical hero image) without further trimming (e.g. deriving `iconLink`
from a URL-template guess to save a few more bytes was considered and
rejected — the pattern isn't a documented guarantee, and the savings were
marginal for the coupling risk).

**Render cap, independent of the search fix**: `ItemsExplorer` caps rendered
rows to 100 (`MAX_DISPLAYED`) regardless of how many items match a query —
items' catalog is ~10x tasks', so a broad substring can match hundreds of
rows, and rendering all of them (each with an image) is wasted DOM for a
guide UI. The page intentionally does not show a result count or truncation
hint; its top control is now only the item-name search field.

**Verified end-to-end** (not just typecheck/build): after this change,
`next build && next start` on `/ko/items` (and `/zh`, `/en`) showed
`x-nextjs-cache: HIT` and `s-maxage=21600` — matching `tasks`/`maps` exactly.
Per-request time dropped from ~0.4s to ~15ms (a ~27x improvement, roughly
matching `tasks`/`maps`'s own ~10ms). All 5055 items still render with real
translated names/prices across all three locales.

### Caching strategy

- **Revalidate window: 6 hours** (`REVALIDATE_SECONDS` in `lib/tarkov.ts`),
  applied uniformly to every endpoint. This is a deliberate step back from the
  GraphQL era's 10-minute price cache — these are static, periodically
  regenerated dumps (not a live resolver), and the large payload sizes make
  frequent refetching costly. **Trade-off, stated plainly**: item flea prices
  (bundled in the same `items` file as everything else) are now only as fresh
  as 6 hours, not 10 minutes. Accepted deliberately for this project's scale;
  revisit if price freshness becomes a real user complaint. This 6-hour window
  is now **actually honored** for `/items` too (see "items — client-side
  search" above) — before the Step-2 fix, `/items` ignored this entirely and
  refetched on literally every request, regardless of what this constant said.
- **Known limitation — Next's fetch Data Cache silently drops large
  responses.** Confirmed via `npm run build` output:
  `Failed to set Next.js data cache for https://json.tarkov.dev/regular/maps,
  items over 2MB can not be cached (12694902 bytes)` (and the same for
  `tasks`). This is a Next.js platform limit (~2MB per cached fetch entry),
  not a bug in this project's code. **What still works**: the build output
  shows each route's own `Revalidate: 6h / Expire: 1y` metadata — Next's
  page-level ISR (Incremental Static Regeneration) is independent of the
  smaller fetch-level Data Cache, so `/items`, `/tasks`, `/maps` still only
  *regenerate* (and therefore only re-fetch json.tarkov.dev) about once per 6
  hours in production, even though the individual `fetch()` call's own cache
  entry never gets written. **What doesn't**: within that 6-hour window, if
  the page cache is ever bypassed (e.g. a dynamic/on-demand render), the large
  files are refetched over the network in full every time — there's no
  smaller-than-2MB fallback cache layer currently in place.
- `getMaps()` (used by the maps page) and `getTasks()`'s internal
  `getMapNameIndex()` (used to resolve a task's target map name) both fetch
  the *same* `regular/maps` URL. They rely on Next's request-level dedup /
  Data Cache to avoid a redundant network round-trip within the same
  revalidate window — though per the limitation above, that dedup doesn't
  actually help here since the response is too large to cache. Each call
  still separately pays the JSON.parse cost.

### Global PvP/PvE mode

PvP/PvE started as a per-page concern (the items page's own local toggle —
see "Items page" below). It was promoted to a **site-wide** selection after
confirming, via live fetches, that the two modes genuinely differ in more
than just items:

- **Traders**: `resetTime` (next restock) differs by tens of minutes between
  modes for the same trader (e.g. Prapor's regular vs. pve restock was ~24
  minutes apart at the same instant).
- **Tasks**: the available quest list differs — 27 tasks exist only in
  regular, 23 only in pve, out of ~500 total. (Shared tasks' *content* is
  identical; only *availability* differs.)
- **Maps/bosses**: boss compositions differ noticeably — e.g. Factory has 1
  deduped boss entry in regular vs. 3 in pve (Tagilla/USEC/BEAR), confirmed
  by diffing raw `regular/maps` vs. `pve/maps`.

Given that, showing only PvP data everywhere (the pre-existing default) would
have been silently wrong for PvE players on three of four data pages, not
just an incomplete-feature gap on one.

**Architecture** — one global selection, not four local ones:

- `GameModeProvider` (`src/contexts/GameModeContext.tsx`) is a React Context
  wrapping the whole app (in the locale layout, inside
  `NextIntlClientProvider`), holding `{ gameMode, setGameMode }`. Persisted to
  `localStorage` (`tarkovdex:gameMode`), read back in a `useEffect` (not the
  `useState` initializer) to avoid an SSR/client markup mismatch — the server
  has no localStorage to read, so the very first render is always `'regular'`
  and only self-corrects client-side after mount, exactly like `InGameClock`'s
  own SSR-safety approach.
- `GameModeSwitcher` (`src/components/layout/GameModeSwitcher.tsx`) lives in
  the `Header`, styled as an exact sibling of `LocaleSwitcher` (same
  segmented-control border/padding/active classes) rather than a new visual
  pattern. It's the **only** PvP/PvE control on the site now — the items
  page's former local toggle buttons were removed from `ItemsExplorer` in
  favor of reading `useGameMode()`.
- **Every mode-aware page still fetches both modes' data server-side at
  build/ISR time** (the same "fetch both, pick client-side, never refetch"
  pattern items already used) — switching the Header control never triggers
  a network request:
  - `items/page.tsx` — already fetched both (unchanged).
  - `tasks/page.tsx` — now calls `getTasks()` twice (regular + pve);
    `TasksExplorer` picks via `useGameMode()` instead of taking one `tasks[]`
    prop.
  - `maps/page.tsx` — now calls `getMaps()` twice. `MapCard` is an **async
    Server Component** (uses `getTranslations` from `next-intl/server`), so
    it can't be imported into a Client Component's render body. Instead
    `maps/page.tsx` server-renders **both** modes' full `MapCard` lists as
    JSX and hands them to `MapsModeBoard` (`src/components/maps/MapsModeBoard.tsx`),
    a small Client Component whose only job is picking which pre-rendered
    set to display based on `useGameMode()` — no MapCard-to-client conversion
    needed.
  - `page.tsx` (home) — now fetches `getTraders()` and `getMaps()` twice each
    (4 fetches total); `TraderRestockBoard` and `BossSpawnBoard` each take
    `pvpX`/`pveX` prop pairs and pick via `useGameMode()`.
- **Payload cost**: tasks (~2.9MB → ~5.8MB) and maps (~9.5MB → ~19MB, already
  over Next's 2MB fetch-cache limit either way — see "Known limitation") each
  roughly double, on top of items' existing 2x and the home page's new 4x
  (traders+maps × 2 modes). All of it still rides the same 6h ISR window —
  no new caching code, just more parallel fetches inside the existing
  `try/catch` per page.
- **Type note**: `GameMode` moved from `lib/tarkov.ts` (marked `server-only`)
  to `types/tarkov.ts` (a plain module) so the client-side context can import
  the type without pulling a server-only module into the client bundle.
  `lib/tarkov.ts` re-exports it (`export type { GameMode }`) so existing
  `import type { GameMode } from '@/lib/tarkov'` call sites still work.
- **Verified**: `typecheck` + `build` pass (23 pages, all four data-fetching
  routes still show `Revalidate: 6h`). Live preview confirmed real clicks on
  the Header toggle change data on every page: items' first row price changed
  between modes (M4A1 ₽36,416 regular vs. ₽64,990 pve), tasks' result count
  changed (501 vs. 497), maps' Factory boss list changed (1 vs. 3 bosses),
  and the home dashboard's trader restock order/values changed completely —
  all without a page reload, and the selection survived navigating between
  routes via `localStorage`.

### Home page dashboard

The home page was originally a pure static hero (title/subtitle/CTA, zero
data fetch). It was rearchitected into a small dashboard and the remaining
marketing hero was later removed entirely on request. The current page has
three data widgets, ordered by how actionable the info is (most
time-sensitive first), followed by one low-emphasis creator channel link:

1. **In-game raid clock** (`InGameClock.tsx`) — a centered card with its
   title above two equal-width time columns. The visible `Time A` / `Time B`
   labels were removed to keep the display clean; their localized strings
   remain as accessible names on the two readings. Numerals use 45px at
   `sm` and above, with a 27px mobile size and correspondingly smaller mobile
   icon/gap so both readings still fit. Pure client-side math, **no API call**:
   Tarkov's day/night cycle runs at a fixed 7x real-time acceleration, and a
   raid can land on either of two time variants exactly 12 in-game hours
   apart. The formula (`(offset + 7 * Date.now()) % 24h`, two offsets 12h
   apart) was reverse-derived from a public real-time-to-Tarkov-time
   calculator's minified bundle (no documented epoch exists anywhere
   official) and cross-checked against a live reading — matched within
   seconds, consistent with real-time read lag at 7x amplification. The clock
   samples `Date.now()` every 100ms: because game time runs 7x faster, the old
   one-second timer visibly jumped about seven game seconds at once, while the
   shorter interval lets the displayed seconds advance consecutively. The
   server render uses a two-column placeholder until first mount to avoid an
   SSR/client mismatch (the server doesn't know the client's `Date.now()`).
2. **Trader restock board** (`TraderRestockBoard.tsx`) — **item-selling
   traders only** (currently 9), sorted soonest-restock-first, with
   already-restocked traders sinking to the end. `getTraders()` still returns
   all 16 because tasks need service/quest NPC names; it additionally maps
   `TaskTrader.hasStore` from loyalty-level data, and the home server
   component filters on that flag before passing the lists to the board.
   Both regular and PvE barter datasets were audited: the same eight fixed
   storefront traders appear in each, plus Fence's dynamic inventory; these
   nine all have multiple loyalty levels, while the seven service/quest-only
   characters expose one placeholder level. Powered by a real field: the
   `traders` endpoint's `resetTime` (absolute ISO timestamp of the *next*
   restock) was discovered via a live fetch and had gone unused —
   `getTraders()` maps it through onto `TaskTrader.resetTime`, reusing the
   existing tasks-page trader lookup rather than adding a second fetch for
   the same entity (see "Traders (scope note)"). Countdown text is a
   locale-invariant `H:MM:SS` —
   see `formatDuration()` in `lib/format.ts` — deliberately not translated
   (a digital clock reads the same in every language). Cards inside the
   restock-imminent window (`<10min`) get the accent border/background
   treatment — the only urgency signal, no new colors. Takes `pvpTraders`/
   `pveTraders` pairs and picks via `useGameMode()` — restock times genuinely
   differ by mode, see "Global PvP/PvE mode" above.
3. **Boss spawn board** (`BossSpawnBoard.tsx`) — a **static card grid, no
   click required**: each card is one map, listing every one of its bosses
   with spawn chances, all visible at once. Reuses the exact
   `GameMap`/`MapBossSpawn` data `getMaps()` already produced for the maps
   page. Takes `pvpMaps`/`pveMaps` pairs and picks via `useGameMode()` —
   boss compositions genuinely differ by mode (regular has 45 deduped boss
   entries across 17 maps, pve has 71), see "Global PvP/PvE mode" above.
   - **Was a click-to-expand accordion; changed on request.** The accordion
     listed all 17 maps but showed only a map name and its single top boss
     until you opened each row — so the one question the board exists to
     answer ("which bosses can I meet, and how likely") sat behind 17
     separate clicks. Rates are now the thing you see first.
   - **Shows 9 popular maps, not all 17** (`HOME_MAP_LIMIT`), with a "see all
     maps" link to `/maps` in the
     heading. This is the fallback the request pre-authorised for the case
     where the full list ran too long, and it was **measured, not guessed**:
     rendering all 17 produced a 1415px section at 1280px and a **2944px**
     one at 375px — about seven phone screens for one home-page section,
     which defeats the point of removing the accordion. The original
     six-map cap was later expanded by request to one more complete desktop
     row. `/maps` still lists
     every map with its full boss list, spawn rates and wiki link, so no
     information left the site — breadth moved to `/maps`, and
     depth-without-clicking came to the home board.
   - **Stable popularity order, row-major**: Customs → Streets of Tarkov →
     Interchange → Reserve → Woods → Shoreline → Factory → Ground Zero →
     Lighthouse. Stable map ids, rather than
     localized names or live spawn rates, define the order so ko/zh/en and
     PvP/PvE all render the same `1-2-3 / 4-5-6 / 7-8-9` desktop sequence.
     Any future map not in the curated list falls behind these nine by highest spawn
     chance and then localized name; `/maps` remains the complete by-name
     lookup.
   - **Compact boss portraits restored on request**: each boss row now uses
     the existing `MapBossRef.imageLink` as a 36px thumbnail beside the name.
     This is intentionally much smaller than the original accordion's large
     portrait treatment: a neutral border/background only, no accent ring,
     glow or decorative overlay. The image supports identification without
     displacing the name and spawn rate as the primary data.
   - **Per-map wiki links remain omitted**: the single heading link leads to
     `/maps`, which carries the complete map list and individual wiki links.
   - **Emphasis without new colour**: the spawn % takes the brighter
     foreground and medium weight while the boss name stays muted, so the
     number is what the eye lands on — done with the existing two weights
     and the gray scale, per the design system's one-accent rule.
   - **Why not tabs**: the reference site that prompted this feature (a
     similar Korean Tarkov dashboard) uses a one-map-at-a-time tab switcher.
     Still explicitly avoided — both for UX reasons (tabs hide 16 of 17 maps
     at any moment; this grid hides none of what it shows) and because the
     user was concerned about the result looking like a copy of that site.
     The card grid, the compact single-line clock (vs. that site's large
     two-panel clock display), and this project's dark/amber/no-gradient
     identity are the deliberate differentiators.
   - `home.expandAll` / `home.collapseAll` were removed from all three
     message files with the accordion; `home.viewAllMaps` replaced them.
- **Data cost**: the home page fetches `getTraders()` and `getMaps()` **for
  both PvP and PvE** (4 fetches total: ~50KB × 2 traders, ~9.5MB × 2 maps —
  see "Global PvP/PvE mode" above for why both modes are needed here too, and
  "Known limitation" for why Next's fetch-level Data Cache can't hold the
  maps response regardless, though page-level ISR still caps the actual
  refetch rate to once per 6h). All four ride the same `fetchTarkovJson()`
  revalidate window as every other page, so the home route picked up
  `Revalidate: 6h / Expire: 1y` automatically — no new caching code.
- **Resilience**: all four fetches are wrapped in one `try/catch`; on failure
  the trader and boss widgets are omitted rather than taking down the page.
  The client-only raid clock has no data dependency and remains available.
- **Section order**: raid clock → trader restocks → boss spawns → NightScav
  YouTube channel link. The former
  title/subtitle/items CTA/PvE banner block below the dashboard was removed
  entirely on request; a screen-reader-only `h1` remains for a valid page
  heading. The channel link is a compact neutral bordered callout rather than
  a replacement marketing hero: amber is limited to the YouTube icon and
  hover state, and the external link opens in a new tab.
- **Verified**: `typecheck` + `build` pass (23 pages, home route now shows
  `Revalidate: 6h` like items/tasks/maps). Live preview across ko/zh/en
  confirmed: all 16 trader icons load, the two clock readings are exactly
  12h apart and advance correctly across repeated checks, and 375px mobile
  has zero horizontal overflow. Re-verified after the PvP/PvE promotion to a
  global toggle: switching modes in the Header changes the trader restock
  board's order/values with no refetch. (The boss-board half of this entry
  described the since-removed accordion — portraits loading on expand, 15
  expanded boss lists — and was replaced by the card-grid verification under
  the boss spawn board bullet above.)

### News page (patch notes + events)

Added at the same time as the "플리마켓"/flea-market rename below, placed
**first** in the nav (before flea market) per explicit request. No PvP/PvE
mode-awareness — Steam news isn't mode-specific.

- **No visible page intro**: the original `News` title and Steam-source
  subtitle block above the lists was removed on request, so the page begins
  directly with Patch Notes. A screen-reader-only localized `h1` remains for
  document structure; the now-unused `news.subtitle` key was removed from
  ko/zh/en together.
- **Data source**: json.tarkov.dev has no patch-notes/events endpoint at all
  (confirmed via its own `/endpoints` manifest — items/tasks/maps/traders/
  barters/crafts/hideout/prices/status, nothing news-shaped). Escape from
  Tarkov's **official Steam News RSS feed**
  (`store.steampowered.com/feeds/news/app/3932890/`, app ID confirmed live)
  is used instead — a stable, official, structured XML format, not a scrape
  of a page that can be redesigned without notice (this project already
  rejected fragile scraping once, replacing the unreliable GraphQL endpoint
  with json.tarkov.dev — see "json.tarkov.dev migration" above). Parsed with
  a small hand-rolled regex parser in `lib/steam-news.ts` (`getSteamNews()`)
  rather than an XML library — the feed's format is simple and fixed, and a
  dependency for five fields felt like the wrong trade.
- **Patch notes vs. events split**: BSG consistently titles patch posts
  "Patch X.X.X.X" — confirmed against a live fetch of the 10 most recent
  posts (exactly 1 matched; the other 9 were events/surveys/announcements).
  `isPatchNote()` in `lib/steam-news.ts` is a title-prefix regex, not a field
  Steam provides — there is no manual curation, whatever Steam has posted
  most recently is what renders, split automatically by this one rule.
- **Translation (ko/zh) — Gemini API** (originally Claude API, switched
  later — see "Provider switch" below): Steam's `?l=` locale query param was
  tested live (`koreana`, `schinese` vs. default) and confirmed to only
  translate the feed's own chrome (channel title/description) — every actual
  post's title/body stayed byte-for-byte identical in English regardless of
  `l=`. BSG simply doesn't publish translated Steam posts. Given the site's
  primarily-Korean audience, leaving posts in English everywhere was judged
  not good enough, so `lib/translate-news.ts`'s `getLocalizedNews(locale)`
  translates each post's title+content into natural ko/zh via the Gemini API
  (model `gemini-3.5-flash-lite` — the current GA cost-effective Flash-tier
  model, explicitly documented by Google for translation/high-volume tasks;
  confirmed live against `ai.google.dev/gemini-api/docs/models` rather than
  guessed, since model IDs churn) when `locale !== 'en'`.
  - **Provider choice**: originally Claude API, chosen over a dedicated
    translation API (Google Translate/DeepL) for translation
    quality/naturalness on gaming-specific phrasing over a literal-translation
    service. Later switched to Gemini per explicit user request — same
    quality-over-literal-translation rationale carried over; the switch was
    purely which LLM vendor, not a reconsideration of the LLM-vs-dedicated-API
    choice itself.
  - **Requires `GEMINI_API_KEY`** (see `.env.example`; was `ANTHROPIC_API_KEY`
    before the switch). **Graceful, silent fallback to English** if the key is
    unset or a translation call fails for any reason (bad JSON, network error)
    — translation is a layered enhancement on a working English baseline, not
    something that should take the news page down.
  - **Retry-on-429, up to 3 attempts, delay parsed from the error itself**
    (`translateUncached` in `translate-news.ts`) — discovered live during the
    Gemini switch's verification, not theoretical: `translateFeed`'s
    `Promise.all` fires one request per post concurrently (~10 posts × 2
    locales, worse during a Vercel build where multiple locale pages can
    generate concurrently too), which trivially bursts past the Gemini
    **free tier's 15-requests/minute** cap, returning `429
    RESOURCE_EXHAUSTED`. A first attempt at a fixed 6s/12s backoff wasn't
    enough headroom — the API's own error reliably reports the quota
    resetting ~46-48s out — so `retryDelayMs()` parses the server's own
    suggested `retryDelay` (buried in the `ApiError`'s JSON `message` string;
    the SDK doesn't type it structurally) and waits that long instead of
    guessing. Only 429s are retried; bad JSON or other API errors throw
    straight through, since a retry wouldn't fix a parse error.
  - **40-second whole-feed deadline**: added after two consecutive Vercel
    deploys exhausted Next's three 60-second static-page attempts for
    `/ko/news` or `/zh/news`. Gemini's own recommended 46-48s quota delay
    plus the follow-up request can exceed Next's hard page-generation limit.
    `getLocalizedNews()` now races translation against the already-available
    English feed and resolves with that fallback at 40s; successful per-item
    translations still populate their indefinite cache, and unfinished items
    retry on the next 1-hour ISR cycle rather than blocking deployment.
  - **Failures are never cached — only successes are** (`translateUncached`
    *throws* on any failure path instead of returning an English-fallback
    object; `translateItem`, one layer outside `unstable_cache`, is what
    catches that and applies the fallback). This was a real bug found and
    fixed, not a preemptive guard: with the original design (return English
    on failure, treating it as a normal cacheable result), a 429 burst during
    the first production deploy permanently stuck several posts in English
    on `/zh/news` — confirmed live, and confirmed that neither the
    retry-delay fix above nor a plain redeploy cleared it, since
    `unstable_cache` had already committed the failure result forever.
    Confirmed via reading Next's own `unstable-cache.js` that a *thrown*
    rejection is never passed to its cache-write path — only a resolved
    return value is — so restructuring around a throw was the actual fix,
    not just larger retry budgets. One-time cleanup for the posts already
    wrongly cached under the old behavior used a temporary cache-key bump
    (since reverted, as it's no longer needed going forward).
  - **Response fence-stripping**: Gemini sometimes wraps its JSON reply in
    ```` ```json ```` fences despite the prompt saying not to (more often than
    Claude did) — `translateUncached` strips a leading/trailing fence before
    `JSON.parse`.
  - **Cached per (post id, locale), not per revalidate window** — via
    `unstable_cache(..., { revalidate: false })`, keyed on the post's stable
    Steam guid. A published post's content never changes, so once
    *successfully* translated it's translated forever; the ongoing cost is
    roughly one API call per *new* Steam post (a handful a month) plus one
    retry per post that happened to fail last time, not one per hourly
    revalidate. A post that fails (rate limit, transient API error) simply
    isn't cached and gets a fresh, isolated attempt on the *next* revalidate
    — by then the concurrent burst that caused the failure is long over, so
    it's very likely to succeed on a small handful of retries rather than
    the original ~20-request stampede.
- **Full content, not just a teaser**: `NewsItem.content` in `lib/steam-news.ts`
  is the **full** HTML-stripped body (paragraph/`<br>` tags converted to
  newlines first, so it still reads in paragraphs, not one run-on line) — not
  truncated at the source, since the translation step needs the whole thing
  too. `NewsCard.tsx` (client) truncates to a ~160-char teaser for the
  collapsed state and shows the untruncated `content` when clicked open —
  click-to-expand, not a link out. **No external "view source" link** —
  removed per explicit request; the translated/original content is meant to
  be fully readable on-site, not just a jumping-off point to Steam.
- **Caching**: the RSS fetch itself uses a 1-hour `revalidate` (`lib/steam-news.ts`),
  much shorter than the 6-hour window every other page's `fetchTarkovJson()`
  uses — news/events are far more time-sensitive than static game-data dumps,
  and the feed itself is tiny (no 2MB fetch-cache-limit concern here, unlike
  items/tasks/maps). Confirmed in the build: `/news` shows `Revalidate: 1h`
  in the route table, distinct from every other page's `6h`.
- **Verified**: `typecheck` + `build` pass (26 pages, up from 23). Live
  preview confirmed: exactly 1 patch note + 9 events from a real fetch,
  correct absolute-date formatting per locale (`2026년 7월 4일` / `July 4,
  2026`), zero `steampowered.com` links anywhere on the page, click-to-expand
  verified via a resolved React click handler (content grew from 190 to 547
  characters and back on second click, ending in the real final sentence of
  the source post — not a re-truncated fragment), and 375px mobile has zero
  horizontal overflow. At the time this was first written, translation itself
  could only be verified as "correctly falls back to English" (no key
  configured locally) — **since resolved**: see "Provider switch" below,
  where a real key confirmed actual ko/zh translation quality end-to-end.

### Provider switch: Claude API → Gemini API (news translation only)

Switched per explicit user request, unrelated to any problem with Claude's
translation quality — purely a provider preference change. Scope was
deliberately narrow: only `lib/translate-news.ts`'s API client call changed;
the translation prompt/instructions, the (post id, locale) permanent-caching
strategy, and the `'server-only'` client-exposure guarantee were all kept
exactly as they were, per explicit instruction.

- **Package**: `@anthropic-ai/sdk` removed, `@google/genai` added (confirmed
  it was the only file importing the Anthropic SDK before removing it).
- **Model**: `gemini-3.5-flash-lite` — looked up live against
  `ai.google.dev/gemini-api/docs/models` and cross-checked against the
  pricing page rather than guessed (model IDs churn quickly enough that a
  remembered name risks being wrong or deprecated); this is the current GA,
  non-preview, cost-effective Flash-tier model, and Google's own docs
  explicitly list "translation" as a intended use case for it — the direct
  analog of the previous `claude-haiku-4-5-20251001` choice (cheap/fast tier
  for a structured, high-volume task, not the flagship model).
- **API shape**: `@google/genai`'s `ai.models.generateContent({ model,
  contents })` returning a `response.text` getter — the direct analog of the
  old `anthropic.messages.create()` / `message.content[0].text` pattern, and
  confirmed against the installed package's own `.d.ts` (not just the docs
  site) before writing the call, since the SDK also exposes a newer, unrelated
  `ai.interactions.create()` agent-oriented API that would have been the
  wrong fit here (this is a single structured completion, not an agent
  session).
- **Two real bugs found and fixed during verification, not just a config
  swap** — both discovered through actual testing/deploys, not guessed:
  1. Gemini's free-tier 15-requests/minute quota gets burst past by
     `translateFeed`'s concurrent `Promise.all` over ~10 posts × 2 locales
     (root-caused via a temporary debug log in `translateUncached`) — fixed
     by the retryDelay-aware 429 retry described above.
  2. Even with that retry, the *original* design still cached a failure as a
     permanent English result (see "Failures are never cached" above) —
     confirmed live: a plain redeploy after the retry fix did **not** clear
     posts that had already been wrongly cached during an earlier deploy
     (before either fix existed), because `unstable_cache` had already
     committed those as successful-looking results. Fixed by restructuring
     `translateUncached` to throw instead of returning a fallback, moving
     the fallback one layer out to `translateItem` — this is the actual
     structural fix; the retry budget alone couldn't have closed this gap.
- **`GEMINI_API_KEY`** replaces `ANTHROPIC_API_KEY` in `.env.example` and
  Vercel's project env vars (Vercel-side update was the user's own action).
- **Deployed and verified in real production** (`vercel deploy --prod`,
  `https://tarkovdex.vercel.app` — see the Vercel deployment entry in the
  roadmap below for the full account): `typecheck` + `build` pass locally
  and on Vercel. Live production testing across several redeploys (each one
  a fresh ~20-request concurrent burst against the free tier) showed the
  overwhelming majority of patch notes/events translating correctly on the
  first pass every time, natural ko/zh output with proper nouns kept as
  intended, and confirmed the self-healing property directly: posts that
  failed under the *old* cache-forever design stayed stuck across multiple
  redeploys, while under the *new* throw-based design a redeploy cleared
  every previously-stuck post except a couple of new, different ones hit by
  that redeploy's own quota burst — which, per the new architecture, are not
  cached and will resolve themselves on the next natural 1-hour ISR
  revalidation without needing another deploy or manual cache-busting.

### Items page

- **Renamed "시세"/"Prices"/"价格" → "플리마켓"/"Flea Market"/"跳蚤市场"** in
  the nav label, the page's semantic `<h1>`, and error copy — the community-
  standard term for Tarkov's in-game marketplace, requested to replace the
  more generic "prices" label. The route itself stays `/items` (an internal
  slug, not user-facing) — only display copy changed, so sitemap/robots
  needed no update for this rename.
- **Search-only visible page header**: the visible title, 24-hour-average/
  6-hour-refresh subtitle, result count, and narrow-search hint were removed
  on request. The page now begins with only the item-name search field, then
  the result table. A screen-reader-only localized `h1` remains; the unused
  `subtitle`, `resultCount`, and `narrowSearch` keys were removed from
  ko/zh/en together.
- **Client-side search over the full catalog**, capped at 100 rendered rows —
  see "items — client-side search" above for the full account of why this
  replaced the original server-side `?q=` search (it silently made the route
  fully dynamic, defeating ISR for the 15.8MB `items` fetch).
- Flea-banned fallback logic unchanged in spirit (falls back to the best
  vendor sell price) but now reads a precomputed `item.bestVendorSellRUB`
  scalar instead of deriving `Math.max(...)` client-side from a `sellFor[]`
  array — the array was dropped from the wire shape entirely.
- **PvP/PvE mode** (added after the initial migration/design-polish passes):
  `page.tsx` fetches **both** `getItems({ gameMode: 'regular' })` and
  `getItems({ gameMode: 'pve' })` in parallel at build/ISR time and passes
  both arrays to `ItemsExplorer` as `pvpItems`/`pveItems`. The component picks
  which array feeds the existing search/filter/render pipeline based on
  `useGameMode()` — switching is a pure client-side re-render with **no
  refetch**, since both datasets are already resident in the page's initial
  payload.
  - **No longer a local toggle**: `ItemsExplorer` originally owned its own
    `gameMode` `useState` with its own two buttons above the search box. Once
    PvP/PvE was promoted to a **site-wide** selection (see "Global PvP/PvE
    mode" above — tasks and maps data turned out to differ by mode too, not
    just items), those buttons were removed and replaced with a read from the
    global `GameModeContext`, set once in the Header. The visual toggle
    pattern itself (segmented control, accent-on-active) moved to
    `GameModeSwitcher` and lives on unchanged, just in one place instead of
    four.
  - **Default is `'regular'` (PvP)**: this project's primary audience plays
    PvP; PvE is an opt-in secondary mode, so it should never be what a first-
    time visitor sees without asking for it.
  - **ISR unaffected**: this doubles the number of `getItems()` calls per
    build/regeneration (2 instead of 1), but doesn't reintroduce the
    server-side-dynamic problem from "items — client-side search" above —
    `page.tsx` still reads no `searchParams`, so the route stays static/ISR
    at the same 6-hour window.
  - **Payload cost**: PvE's trimmed `Item[]` is essentially the same size as
    PvP's (~1.5MB raw / ~245KB gzipped each, confirmed via build-time fetch
    logs showing near-identical byte counts for `regular/items` vs
    `pve/items`), so the items page's total embedded data roughly **doubles**
    to ~3MB raw / ~490KB gzipped. Judged acceptable for the same reason the
    original 245KB figure was (well under a typical hero image), and avoids
    the alternative (fetching the inactive mode on toggle) which would bring
    back a client-side network request this page was specifically
    rearchitected to avoid.

### Tasks (quest guide) page

- **No visible page intro**: the original Quest Guide title and trader/map
  filtering subtitle were removed on request, so the page begins directly
  with its search and filter controls. A screen-reader-only localized `h1`
  remains; the unused `tasks.subtitle` key was removed from ko/zh/en.
- **Fetch once, filter client-side** — unchanged rationale from Phase 2a
  (`TasksExplorer` owns `search`/`traderId`/`mapId` state, `useMemo`-filters
  a few hundred rows client-side; still simpler than a server round-trip per
  keystroke, and json.tarkov.dev has no server-side task filtering anyway).
- **Map filter now uses `task.map.id` directly**, not a derived union over
  `objectives[].maps[]` — see "Types" above for why that changed (real data
  has one authoritative field).
- **Trader name resolution**: `getTasks()` joins `raw.trader` (an id) against
  `getTraders()`'s id→`TaskTrader` map. See "Traders (scope note)" above.
- **PvP/PvE mode**: `page.tsx` fetches both `getTasks({gameMode:'regular'})`
  and `getTasks({gameMode:'pve'})` (the available quest lists genuinely
  differ by mode); `TasksExplorer` picks via the global `useGameMode()`
  instead of taking a single `tasks[]` prop. See "Global PvP/PvE mode" above.

### Maps page

- **No search or filter** — unchanged from the original decision: the brief
  only calls for a static overview, and raid map count is small (~17), so
  `MapCard` stays a server component with no state to own.
- **"Difficulty" → `description`** — unchanged: json.tarkov.dev, like the old
  GraphQL API, has no difficulty-rating field for maps; confirmed by
  inspecting a real map object's full key list live.
- **`players` is a raw string** (e.g. `"7-8"`), not a number — rendered as-is.
- **Boss list is deduped and sorted** (`dedupeBosses()` in `lib/tarkov.ts`):
  the raw `bosses[]` array has one entry per spawn location/condition, so the
  same boss can appear many times (e.g. Lighthouse's ExUsec appears 6 times
  with chances 0.8/0.8/0.5/0.5/0.8/0.8/0.2). Deduped by mob id, keeping the
  **highest** spawnChance seen per boss, sorted descending. A deliberate
  simplification for a readable guide UI, not a 1:1 mirror of the raw spawn
  mechanics — if a future page needs the full spawn-location detail (e.g. a
  boss-route map overlay), that's a separate, more detailed query, not a
  change to this dedup.
- Grid layout (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), full-bordered
  cards — because each map card is short, self-contained, and roughly uniform
  height, unlike task rows (which use a bordered-list style instead).
- **PvP/PvE mode**: `page.tsx` fetches both `getMaps({gameMode:'regular'})`
  and `getMaps({gameMode:'pve'})` (boss compositions genuinely differ by
  mode) and server-renders **both** modes' `MapCard` lists; `MapsModeBoard`
  (a small Client Component) picks which pre-rendered set to show via the
  global `useGameMode()` — `MapCard` itself is untouched, still an async
  Server Component with no mode-awareness of its own. See "Global PvP/PvE
  mode" above for why this indirection was needed instead of just passing a
  `gameMode` prop into a client `MapCard`.

### Live verification performed

Unlike the GraphQL-era code, this migration was verified against real running
servers before being considered done:

- `npm run typecheck`, `npm run lint`, `npm run build` all pass (18 static
  pages: ko/zh/en × home/about/items/tasks/maps + not-found).
- **Dev server** (`npm run dev`) and **production server**
  (`npm run build && npm start`), both on `127.0.0.1:3000`: `/items`, `/tasks`,
  `/maps` fetched directly for all three locales. Confirmed real prices
  (`₽38,713`, etc.), real localized map/item category names, real trader names
  (메카닉/예거/테라피스트/프라퍼 in `ko`; Mechanic/Jaeger/Therapist/Prapor in
  `en`; note `zh`'s own upstream translation data keeps most trader *names*
  in English — that's tarkov.dev's own localization choice for proper nouns,
  not a bug in this project's merge logic, confirmed by inspecting
  `traders_zh`'s dictionary directly), and real boss names (타길라/킬라 etc.)
  all rendering correctly.
- **Dev-mode-only artifact, investigated and ruled out**: the dev server's
  HTML briefly appeared to leak raw untranslated placeholder strings (e.g.
  `"5447a9cd4bdc2dbd208b4567 Name"`) into the page. Verified this does **not**
  happen under `next build && next start` (zero occurrences, `grep`-counted
  across all three data pages × all three locales) — it was Next.js dev
  mode's own request-inspection tooling embedding a raw response preview, not
  a bug in `translate()`. Confirmed by also checking a page that makes zero
  json.tarkov.dev calls (`/about`), which showed zero such strings even in dev
  mode, isolating the artifact to pages that do call `lib/tarkov.ts`.

## Design system (hard rules)

These come from the project brief and are **non-negotiable** — they exist to avoid
generic "AI-generated" styling.

- **Dark theme**, background is dark *gray* (`#17181b`), never pure black.
- **One accent color only: amber** (`#e2a438`). Everything else is a neutral gray
  scale. The single exception is the muted green/red pair used **only** for signed
  price deltas — that is data semantics, not decoration, and the hues are
  desaturated so they never compete with the accent.
- **No gradients, no glow/neon, no purple-blue hero.** Section separation uses
  **thin borders**, not shadows.
- **No emoji.** Icons are SVG via lucide-react.
- **Max two font weights**: regular (400) and medium (500). No bold.
- **Generous whitespace**, even on dense screens.
- Tokens are defined once as CSS variables in `globals.css` and mapped in
  `tailwind.config.ts` (`bg`, `surface`, `surface-2`, `border`, `fg`, `muted`,
  `accent`, `accent-fg`, `positive`, `negative`).

### Fonts

Font stack in `globals.css` (`--font-sans`):

- **Korean + Latin**: Pretendard (loaded from the jsDelivr CDN, dynamic subset).
- **Simplified Chinese**: Noto Sans SC (Google Fonts). For `html[lang='zh']` the
  stack promotes Noto Sans SC first so Chinese glyphs render in the intended face.
- System fonts as the final fallback.

### Typography scale (1.5x) and the matching spacing scale

Type across the whole site is **1.5x Tailwind's default scale**, and the
**spacing scale is scaled by the same 1.5x** alongside it. Both live in
`tailwind.config.ts` as `fontSize` / `spacing` overrides.

**Why the scale and not the components.** The alternative — editing
`text-sm`/`px-3`/`gap-2` across ~20 components — would have meant no single
place to reason about size, and would drift the moment a new component was
added. Overriding the two theme scales moves every `text-sm` and every `p-4`
in the app together. No component's font-size or padding classes were touched
for this change.

**Why spacing had to move too.** Type at 1.5x inside unchanged padding reads
cramped. Because Tailwind derives padding, margin, gap, width/height, inset and
`size-*` from the one `spacing` scale, scaling it preserves every proportion
the design already had, just larger.

| step | size / line-height | was |
| ---- | ------------------ | --- |
| `xs` | 18px / 27px | 12/16 |
| `sm` | 21px / 32px — body default | 14/20 |
| `base` | 24px / 36px | 16/24 |
| `lg` | 27px / 38px | 18/28 |
| `xl` | 30px / 42px | 20/28 |
| `2xl` | 36px / 46px | 24/32 |
| `3xl` | 45px / 54px | 30/36 |
| `4xl` | 54px / 62px | 36/40 |
| `5xl` | 72px / 76px | 48/48 |

Line heights are **not** a flat 1.5x — they follow the usual curve where
larger type takes proportionally less leading. Body sizes sit near 1.5, which
is roomier than Tailwind's default ~1.35-1.43 on purpose: the primary audience
reads Korean, and CJK glyphs are full-width with no descender-driven
whitespace, so identical leading reads tighter in ko/zh than in Latin.
Verified in-browser that ko, zh (Noto Sans SC) and en all render body text at
21px/32px with no clipping.

**Deliberately not scaled**: `px` (1px stays a hairline — a border is not
"space"), border radius (so the visual language reads identical, only bigger),
`maxWidth.content` (left at 80rem, which tightens the measure toward a more
readable ~65-75 characters instead of the very long lines 80rem gave at 14px),
and breakpoints (px-based, so layout still reflows at the same real viewport
widths).

**Touch targets**: a named `touch` token (a fixed **44px**, in `spacing`,
`minHeight` and `minWidth`) is the accessibility floor for anything tappable —
`min-h-touch` / `size-touch`. It is intentionally a fixed value rather than a
scale step so it cannot drift if the scale is ever retuned. Applied to nav
links, the brand link, footer links, both segmented switchers, the hamburger,
and the per-card wiki links. Inputs, selects and CTA buttons clear 44px on
their own from the scaled padding.

**Knock-on fixes the scale-up forced** (each found by measuring, not by
reading):

- **Header collapse breakpoint moved `sm` -> `lg`.** The full desktop bar
  (brand + 5 nav links + both switchers) measures 837px in ko and **913px in
  en**; at the old `sm` (640px) the 640-1024px range would have overflowed.
  At 1024px there is now 96px of slack in the worst case (en). Both switchers
  also move into the drawer below `lg` — at 375px the brand plus the two
  segmented controls alone overflow.
- **Items table column sizing.** `truncate` sets `white-space: nowrap`, which
  makes the name cell's min-content width the *entire* item name, so auto
  table layout refused to shrink and demanded ~1314px on a 1280px screen.
  Fixed by letting that one column absorb leftover width and shrink below
  min-content (`w-full max-w-0` on the name `th`/`td`), so truncation actually
  happens. The table now fits desktop exactly (1191px at 1280px viewport, no
  horizontal scroll, all six columns), while the existing `overflow-x-auto`
  wrapper still contains the scroll on mobile against a 69rem (was 46rem)
  min-width floor.
- **Loading skeletons.** Fixed-width placeholder bars (`w-72`, and a pair of
  `w-32` side by side) became wider than a 375px phone and pushed the *page*
  into horizontal scroll while loading. Capped with `max-w-full` / made
  flex-shared on mobile.

### About page

The About page is a structured project overview rather than a single generic
paragraph. Its order is: mission statement → four feature areas (items, tasks,
maps/bosses, news) → data sources and refresh cadence → product principles →
unofficial-project/legal notice → creator credit.

- Copy is factual and derived from implemented behavior: json.tarkov.dev game
  data refreshes about every 6 hours, Steam news about hourly, PvP/PvE and
  ko/zh/en are supported, and upstream failures are isolated.
- Visual hierarchy follows the site system: neutral bordered cards and rows,
  amber Lucide icons as the only accent, no gradients, shadows, glow, or extra
  font weights. The legal block uses an amber left border rather than a new
  color treatment.

## Legal

Every locale's footer must carry the disclaimer that TarkovDex is unofficial and
unaffiliated with Battlestate Games (`footer.disclaimer` in each message file).
Do not remove it.

### Creator credit

The creator name is `SITE_AUTHOR` in `src/lib/site.ts` — currently **`NightScav`**.
It is shown verbatim (never translated/transliterated) in three places, all reading
from that one constant: the footer, the `/[locale]/about` page, and the
`<meta name="author">` tag (via `generateMetadata` in the locale layout). The
surrounding label is localized (`common.createdBy` in the footer and
`about.creatorLabel` on the About page); the name itself is always identical.

## Roadmap

- [x] **Phase 1**: project setup, i18n routing, items (prices) page.
- [x] **Phase 2a**: quests (`/tasks`) — search + trader/map filter, client-side.
- [x] **Phase 2b**: maps (`/maps`) page.
- [x] **Data migration**: replaced the unreliable GraphQL data layer with
  json.tarkov.dev. All of items/tasks/maps are now **verified against live
  data** (`typecheck` / `lint` / `build` pass; real data confirmed rendering
  correctly in both dev and production servers, all three locales) — see
  "json.tarkov.dev migration" above for the full account. This closes out the
  "unverified schema" caveat that Phases 1/2a/2b originally shipped with.
- [x] **Migration review** (post-migration audit, done in two steps against
  the real fetched data rather than by re-reading the code):
  - **Step 1** — translation mechanism + type design: full-dataset audit (all
    5055 items / 501 tasks / 17 maps / 16 traders) found zero crash-risk gaps
    and 100% translation-dictionary coverage, but surfaced one real
    robustness issue (array fields assumed always-present on an externally
    regenerated dump) — fixed with `?`-typed raw fields + `?? []` guards. See
    "Defensive mapping" above.
  - **Step 2** — items large-file handling + caching: measured (not
    inferred) that the items page's server-side `?q=` search made the whole
    route dynamic, bypassing ISR and re-fetching+re-parsing 15.8MB on *every*
    request (confirmed via response headers and `.next/cache` inspection).
    Rearchitected to client-side search over the full catalog, matching
    tasks' pattern — verified via headers post-fix (`x-nextjs-cache: HIT`,
    ~15ms/request, down from ~400ms). See "items — client-side search" above.
  - **Step 3** — traders mapping + component field wiring: audited every
    field every component reads (`TaskCard`, `TasksExplorer`, `TaskFilters`,
    `MapCard`, `ItemsTable`, `ItemsExplorer`) against the current types plus a
    repo-wide grep for stale field names. Zero mismatches, zero code changes
    needed. Confirmed live: trader is non-null on all 501 tasks (0 missing);
    map is null on 245/501 (hideout/trader-only tasks) and the "any map"
    fallback was confirmed actually rendering for those.
  - **Step 4** — CLAUDE.md accuracy: read the whole file against the current
    code line-by-line (not skimmed) and found 4 real staleness bugs from
    Step 2's changes that hadn't been back-filled: a folder-structure comment
    still describing the old server-rendered items page, a "Types" bullet
    still claiming `Item.sellFor` was kept as an array (it had been replaced
    by `bestVendorSellRUB` two sections earlier in the same file — a direct
    self-contradiction), a "Defensive mapping" bullet referencing
    `RawItem.types` after that field had been deleted (not just guarded) in
    Step 2, and `lib/site.ts` missing from the folder-structure diagram. All
    fixed; also tightened one code comment's CLAUDE.md section reference
    (`TasksExplorer.tsx`) that didn't exactly match its target heading.
  - **Step 5** — final full-pipeline reverification: clean
    `typecheck`/`lint`/`build` (18 pages, `items` now shows `Revalidate: 6h`
    same as `tasks`/`maps`), then a real `next start` server checked across
    **all 9 page×locale combinations** (items/tasks/maps × ko/zh/en):
    `x-nextjs-cache: HIT` on every one, real data rendering (5055 items,
    real trader/boss names), zero `undefined` leaks, zero placeholder-key
    leaks. This closes out the migration review.
- [x] **Phase 2c**: support (`/support`) page.
  - **Original scope**: static page with localized donation methods.
    - Domestic (Korea): Toss and KakaoPlay links.
    - International: Buy Me a Coffee widget embed.
    - Navigation: header and footer links added, `enabled: true` in Header.tsx.
  - **Final implementation — Ko-fi consolidation**: all three original links
    failed pre-deploy QA (Toss service ended entirely, KakaoPay QR invalid, Buy
    Me a Coffee account does not exist). Simplified to a single donation method:
    **https://ko-fi.com/nightscav** (a global crowdfunding platform with
    broad payment method support and reliable operations).
    - **Why Ko-fi exclusively**: provides reliable, globally-accessible
      donations for both domestic and international supporters; settled
      payouts to the creator's bank account; no service discontinuation risk
      (unlike Toss which ended entirely); simpler setup and lower friction
      compared to Korea-specific platforms. Prioritizes supporter accessibility
      over regional optimization.
    - **Layout**: centered button with heart icon, single CTA (no
      domestic/international split). All three locales use the same URL.
    - **No visible page intro**: the original heart/title/subtitle block was
      removed on request. A screen-reader-only localized `h1` remains, the
      unused subtitle key was removed from ko/zh/en, and the remaining
      donation prompt is centered above the CTA.
  - **Verified**: `typecheck` + `build` pass (23 pages, including 3 localized
    support pages). All pages generate correctly with ISR cache metadata.
    Live preview confirms the button renders with heart icon, text translates
    correctly across ko/zh/en, and the link href matches https://ko-fi.com/nightscav.
- [x] **Design polish pass** (items/tasks/maps/support — visual-only, no data
  logic touched):
  - **Mobile navigation gap (the main finding)**: `Header.tsx`'s nav was
    `hidden sm:flex` with no fallback — below the `sm` breakpoint there was
    **no way to reach items/tasks/maps/support at all** except the home
    page's single CTA or the footer's about/support links. Fixed by adding a
    hamburger button (`sm:hidden`, lucide `Menu`/`X`) that toggles a dropdown
    `<nav>` with the same 4 links, styled with the existing border/bg-bg
    primitives (no new visual pattern). The menu closes automatically on
    navigation via a `useEffect` keyed on `usePathname()`. Verified via a
    fresh preview tab at 375×812: hamburger opens the dropdown with all 4
    links, clicking one navigates and auto-closes the menu.
  - **Focus rings replaced with the accent color everywhere**: several
    interactive elements used `focus:outline-none` with no replacement
    (`ItemSearch`, `TaskSearch`, `TaskFilters`' selects), meaning keyboard
    users got no visible focus indicator at all. Separately, every element
    that *did* rely on the browser default outline would show a blue ring —
    which directly violates the one-accent-color rule (see "Design system"
    above) the moment a keyboard user tabs through the page. Fixed by adding
    a consistent `focus-visible:ring-2 focus-visible:ring-accent/50`-style
    treatment across nav links (desktop + mobile drawer), the hamburger
    button, `LocaleSwitcher` buttons, footer links, the home page CTA, the
    support page donation buttons, and the wiki links in `TaskCard`/`MapCard`.
  - **Support page redundancy**: the donation buttons each had a muted label
    directly above them repeating the exact same text as the button itself
    (e.g. "토스 후원" printed twice — once as a caption, once inside the
    button). Removed the redundant captions and flattened the nested
    bordered-box-per-button layout into a simple `flex flex-wrap` button row,
    consistent with how `TaskFilters` lays out its controls. Also moved the
    hardcoded three-way locale ternary for the disclaimer sentence into a
    proper `support.disclaimer` message key (it was bypassing next-intl
    entirely, unlike every other string on the page).
  - **Responsive audit**: checked all 4 pages at 375×812 (mobile preset) via
    a live preview tab. `ItemsTable` intentionally keeps its existing
    `overflow-x-auto` + `min-w-[46rem]` horizontal-scroll pattern (confirmed
    the scroll stays contained to the table — `document.documentElement`
    itself never overflows); this was a deliberate choice already in place,
    not a gap, so it was left as-is rather than redesigned into a mobile
    card layout. `TaskCard` (flex-wrap), `MapCard` grid
    (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`), and the support page all
    reflow correctly with zero page-level horizontal overflow.
  - **Empty/error/loading states**: audited for consistency across all 4
    pages — already uniform before this pass (`rounded-lg border border-border
    px-4 py-12 text-center text-sm text-muted` for error states; items/tasks
    share the same two-line empty-result pattern; maps' empty state has no
    "hint" line since there's no search to retry, which is correct given it
    has no filter UI). No changes needed here.
  - **Verified**: `typecheck`, `lint`, and `build` all pass (21 pages). Live
    preview-tab testing across items/tasks/maps/support confirmed real data
    rendering, no console errors, and no page-level horizontal overflow at
    375px. (One dev-mode-only red herring hit during this pass: a stale
    client Router Cache entry from an earlier interim state — before a
    since-fixed `support.disclaimer` message key existed — kept replaying a
    `MISSING_MESSAGE` error in one browser tab's console indefinitely, even
    after the fix landed and even against unrelated routes. Confirmed via a
    completely fresh preview server + tab that this was tab-local dev-mode
    cache staleness, not a real bug — a raw `fetch()` of the page's HTML
    independently confirmed the server was already rendering correctly.)
- [x] **Pre-deploy QA** (completed; dependency-major upgrades remain separate follow-up work):
  - **✓ Resolved: All 3 original support-page donation links were dead** (confirmed live via
    fetch): `toss.me` — the whole Toss ID short-link service was discontinued;
    the KakaoPay QR link was invalid; Buy Me a Coffee account did not exist.
    **Solution**: consolidated to a single link, **https://ko-fi.com/nightscav**,
    a globally-accessible crowdfunding platform with reliable payouts and broad
    payment method support. Verified working and rendering correctly across all
    three locales via live preview.
  - **✓ Resolved: production domain configured, real deploy live** — at the
    time this bullet was first written, no env files, no `vercel.json`, no
    domain constant existed anywhere. Added `SITE_URL` in `lib/site.ts`
    (reads `NEXT_PUBLIC_SITE_URL`, falling back to the deployed
    `https://tarkovdex.vercel.app` alias) plus `app/robots.ts` and `app/sitemap.ts`
    (21 URLs: 7 routes x 3 locales, with `hreflang` alternates per CLAUDE.md's
    i18n symmetry decision, `priority: 1` on the home routes). `metadataBase`
    + basic `openGraph`/`twitter` metadata added to the locale layout's
    `generateMetadata`. The project has since actually been deployed to
    Vercel's free `*.vercel.app` subdomain (see the Vercel deployment
    roadmap entry below) — the real production alias
    (`https://tarkovdex.vercel.app`) happens to be byte-identical to the
    placeholder already coded here, but `NEXT_PUBLIC_SITE_URL` was still
    explicitly set in Vercel's project env vars rather than left resting on
    that coincidence, and confirmed reflected in the live `/sitemap.xml`.
  - **✓ Resolved: favicon + OG image** — `public/` now contains `favicon.ico`,
    `favicon-16.png`, `favicon-32.png`, `icon.svg`, `apple-touch-icon.png`,
    `icon-192.png`, `icon-512.png`, and `og-image.png`, all wired into the
    locale layout's `generateMetadata` (`icons.icon`/`icons.apple` array,
    `openGraph.images` built from `og-image.png` via `SITE_URL`). Confirmed
    live by reading `layout.tsx` — this entry previously said "no favicon, no
    `public/` directory at all," which was stale by the time of a later
    session; corrected here rather than left contradicting the repo.
  - **`npm audit`**: 13 findings, all in transitive/bundled sub-dependencies
    except `next-intl` (direct, moderate — open redirect + prototype
    pollution, range `<=4.9.1`, fix requires the 3.x→4.x major). Practical
    risk assessed as low for this codebase specifically: `next-intl`'s
    `redirect()` helper is exported from `i18n/navigation.ts` but never
    called anywhere in `src/`, and `experimental.messages.precompile` (the
    other CVE's trigger) isn't used. `postcss`/`sharp` findings are bundled
    *inside* `next` itself (confirmed still present even in `next@16.2.12`,
    the current `latest` tag — not fixable by upgrading Next alone); `sharp`
    specifically backs `next/image`'s optimizer, which this project never
    imports (all images are plain `<img>` tags per the "items — client-side
    search" decision above), so it's dead weight in the dependency tree, not
    a live code path. None of this blocks deploy, but the `next-intl` major
    upgrade should be scheduled as its own reviewed change, not rushed in
    during a QA pass.
  - **Verified clean**: `typecheck` + `lint` + `build` all pass (23 static
    routes now, up from 21 — `/robots.txt` and `/sitemap.xml` added).
    `robots.txt` and `sitemap.xml` output confirmed correct via a live
    preview fetch (proper hreflang alternates, priorities). OG/Twitter meta
    tags confirmed present in rendered `<head>`.
- [x] **Items page: PvP/PvE toggle** — see "Items page" above for the full
  architecture (dual `getItems()` fetch, client-side mode toggle, no
  refetch on switch, default `'regular'`/PvP, ~2x payload).
  - **Home page banner**: a low-emphasis, full-width bordered link
    (`border-border bg-surface`, same family as the items page's empty-state
    boxes — no new visual pattern) below the primary "Browse prices" CTA,
    announcing PvE support and linking to `/items`. Deliberately not styled
    as a second primary CTA (no `bg-accent` fill) so it doesn't compete with
    the existing hero action — only the trailing arrow icon uses the accent
    color, echoing the primary CTA's arrow without the announcement itself
    shouting for attention. Copy (`home.pveBanner`) is a natural sentence per
    locale, not a direct translation of one source string.
  - **Verified**: `typecheck` + `build` pass (23 pages); build logs confirm
    both `regular/items` and `pve/items` (plus their `_ko`/`_en`/`_zh`
    translation dicts) fetch successfully and independently. Live preview
    confirmed: default toggle state is PvP on a fresh load (button class
    inspection, all three locales); the home banner renders with correct
    per-locale copy and `href="/{locale}/items"` in ko/zh/en. **Caveat**:
    this session's Browser pane was in a non-visible/non-composited state
    (`document.visibilityState` stuck at `hidden`, `getBoundingClientRect()`
    returning all-zero for every element), which made real click-simulation
    unreliable — synthetic `MouseEvent`/`PointerEvent` dispatch and
    `.focus()` calls silently no-op'd instead of reaching React's handler.
    The toggle's actual click-to-switch behavior was therefore verified by
    code inspection (a plain `useState` flip between two already-fetched
    arrays, no async in between — the same pattern already proven live for
    `TaskFilters`/`ItemSearch`) rather than a live click-through. Re-verify
    with an actual click once the Browser pane is in a normal visible state.
- [x] **Home page dashboard** (raid clock, trader restocks, boss spawns) —
  see "Home page dashboard" above for the full architecture, data sources,
  and the deliberate visual/interaction differences from the reference site
  that prompted this request. Live preview (this time with a properly
  composited Browser pane) confirmed real click interaction: the boss board's
  "expand all" toggle was clicked via a resolved React prop handler and
  produced exactly 15 expanded boss lists, with boss portrait images loading
  successfully (`tagilla-portrait.png` etc.) — closing out the previous
  entry's click-verification caveat.
- [x] **Global PvP/PvE mode** — promoted from a per-page (items-only) toggle
  to a single site-wide selector in the Header, after live fetches confirmed
  tasks and maps/bosses data differ by mode too, not just items — see
  "Global PvP/PvE mode" above for the full architecture (`GameModeContext`,
  `GameModeSwitcher`, and each page's now-doubled fetch). Live preview
  confirmed real clicks on the Header toggle: items' first-row price changed
  between modes (M4A1 ₽36,416 regular vs. ₽64,990 pve), tasks' result count
  changed (501 vs. 497 — matching the live-fetched task-availability diff),
  maps' Factory card changed from 1 to 3 bosses, and the home dashboard's
  trader restock board fully reordered — all with zero refetch (server logs
  showed no new requests after the initial page load) and the selection
  survived navigating between routes via `localStorage`. 375px mobile: header
  fits on one line with the new switcher, zero horizontal overflow.
- [x] **News page + flea-market rename** — see "News page (patch notes +
  events)" and "Items page" above for the full account. Summary: added
  `/news` (patch notes + events, sourced from Steam's official RSS feed,
  ko/zh translated via the Claude API at the time, click-to-expand cards, no
  external link, exact dates) as the first nav item, and renamed "시세"/
  "Prices"/"价格" to "플리마켓"/"Flea Market"/"跳蚤市场" throughout the items
  page and nav. Requires an LLM API key in Vercel's env vars for real
  translation — falls back to English gracefully without it (verified
  locally, no key configured at the time). `typecheck`/`build` pass (26
  pages); live preview confirmed correct patch-note/event categorization
  (1/9 from a real fetch), working expand/collapse, zero Steam links, and
  zero mobile overflow.
- [x] **News translation: Claude API → Gemini API** — see "Provider switch:
  Claude API → Gemini API" under the News page section above for the full
  account (package swap, model lookup methodology, the live-discovered
  free-tier rate-limit bug and its 429-retry fix, the cache-failure-forever
  bug and its throw-based restructure, env var rename to `GEMINI_API_KEY`).
  Verified with a real key: natural ko/zh translation confirmed across every
  current patch note and event in `next dev`, a clean `next build`, and real
  Vercel production, closing out the previous entry's "no key configured"
  verification gap.
- [x] **Vercel deployment (free `*.vercel.app` subdomain)** — the site is
  live at **https://tarkovdex.vercel.app**. Deployed via `vercel deploy
  --prod` from the already-linked local project (the repo had a `.vercel/`
  link from an earlier session; the CLI was already authenticated, so no
  new login/link step was needed).
  - **`NEXT_PUBLIC_SITE_URL`** set to the production alias in Vercel's
    Production env scope, then redeployed so it's baked into the static
    build (a Next `NEXT_PUBLIC_*` var is inlined at build time, so setting
    it without redeploying would have had no effect). Confirmed live: a real
    fetch of `/sitemap.xml` shows every URL under the correct origin.
  - **`GEMINI_API_KEY`** set by the user directly (never handled by Claude —
    the key isn't in the repo or in any command run here; `.env.local` holds
    a separate local copy and is gitignored).
  - **Free-tier note that turned out to matter**: each production deploy
    regenerates all 26 pages, which fires the news page's full concurrent
    translation burst (~10 posts × 2 locales) against Gemini's free-tier
    15-req/min quota. Iterating on the news fix therefore *cost quota per
    redeploy* and produced a couple of newly rate-limited posts each time —
    which is exactly the failure mode the throw-based cache restructure
    makes self-correcting (they aren't cached, so the next 1h ISR
    revalidation retries them without a deploy). Worth remembering before
    debugging "some posts are in English" right after a deploy: give it an
    hour before assuming it's broken.
  - **Not done / out of scope**: no custom domain purchased or attached and
    no CI/CD (deploys are manual CLI invocations; there's no git remote wired
    to Vercel for push-to-deploy). A minimal `vercel.json` now exists only to
    set the public production origin; it does not add deployment automation.
- [x] **1.5x typography + spacing scale, and boss board de-accordioned** —
  see "Typography scale (1.5x) and the matching spacing scale" under the
  design system, and the boss spawn board bullet under "Home page dashboard",
  for the full account. Summary: type and spacing both scaled 1.5x via the
  two Tailwind theme scales (no component font-size/padding edits), a fixed
  44px `touch` token added for tap targets, the header collapse breakpoint
  moved `sm` -> `lg` because the desktop bar needs 913px in English, the
  items table's name column reworked so all six columns fit desktop without
  horizontal scroll, three loading skeletons capped so fixed-width bars stop
  overflowing a 375px phone, and the home boss board changed from a
  17-map click-to-expand accordion to a static top-9 card grid with every
  spawn rate visible and a "see all maps" link to `/maps`.
  - **Verified** against a real `next start` build (not `next dev` — see the
    note in Local development below): all seven ko pages plus the zh and en
    home at **375px** show zero page-level horizontal overflow and zero
    interactive elements under 44px; **1024px** (the new breakpoint's
    tightest case) leaves 172px of header slack in ko and 96px in en with
    the full nav shown and the hamburger hidden; **1280px** shows the items
    table fitting exactly (1191px, no scroll, all six columns), the maps
    grid at a uniform 3 columns, and the boss board rendering 6 cards with
    every spawn rate present and **zero buttons** — i.e. no click needed.
- [x] **Handoff consistency pass** — reconciled the current implementation
  with this decision log before the next feature phase:
  - Removed the new-badge emoji from `home.pveBanner` in all three locales
    to restore the no-emoji rule.
  - Replaced the stale "prices refresh every 10 minutes" item-page copy with
    the actual approximately 6-hour site refresh cycle.
  - Moved the full home hero (title/subtitle/CTA/PvE banner) below the raid
    clock, trader restocks and boss cards as the dashboard ordering above
    specifies. A screen-reader-only page `h1` remains before the widgets so
    the semantic heading hierarchy stays valid while the visual hero is
    deliberately demoted.
  - Updated stale current-state notes about dual-mode fetching, dictionary
    localization, the deployed Vercel origin, sitemap route count, and the
    existence/scope of `vercel.json`.
  - Verified message JSON parsing and identical key counts, the forbidden
    style/weight/emoji search, `typecheck`, `lint`, and a production build
    with Gemini disabled to avoid consuming translation quota. All pass
    (26 generated pages); the build reports only the already-documented
    over-2MB json.tarkov.dev fetch-cache warnings, while route-level ISR
    remains 6h for game-data pages and 1h for news.
- [x] **Home boss portraits restored, compactly** — added the existing
  `MapBossRef.imageLink` to every boss row in the home board as a 36px,
  lazy-loaded thumbnail. The treatment stays deliberately quiet: neutral
  hairline border, neutral surface, square crop biased to the portrait top,
  and no accent ring/glow/overlay. Boss name and spawn percentage keep the
  same typography hierarchy, so the image improves recognition without
  turning the cards into decorative tiles.
  - Browser QA at 1280px confirmed the six-card 3-column grid remains
    balanced; 375px confirmed the single-column cards stay readable and all
    16 current PvP portraits load. Switching to PvE loaded all 26 portraits
    in the selected top-six map set with no refetch or page overflow.
  - The same 375px QA exposed a pre-existing home-page overflow outside the
    boss board: the trader board's two mobile columns left only ~31px for
    names/countdowns under the 1.5x scale. Its grid now uses 1 column on
    mobile, 2 at `sm`, and 4 at `lg`, eliminating horizontal page scroll
    while preserving the desktop layout.
  - `typecheck`, `lint`, and the 26-page production build pass. Build output
    contains only the known over-2MB json.tarkov.dev fetch-cache warnings.
- [x] **Home marketing block removed** — removed the entire section below
  the boss board (visible title/subtitle, flea-market CTA, and PvE banner) on
  request. At that point the home page ended after the dashboard, retaining
  only a screen-reader-only `home.title` as its semantic `h1`; a later request
  added the compact creator-channel link documented above without restoring
  the removed hero. Removed the now unused `home.subtitle`, `home.openItems`,
  and `home.pveBanner` keys from ko/zh/en together.
- [x] **Footer content and spacing pass** — replaced the sparse footer with
  a compact information hierarchy: one-line site summary, required legal
  disclaimer, tarkov.dev source note, creator credit, and links to news,
  items, tasks, maps, about, and support. Added localized `footer.summary`
  and `footer.navigation` keys to ko/zh/en together.
  - Outer vertical padding was reduced from `py-8` to `py-4 sm:py-5`; a thin
    internal divider separates information from navigation without adding a
    second card or shadow.
  - Production-build browser QA confirmed the desktop links stay on one row,
    the 375px layout wraps cleanly, and neither viewport has horizontal
    overflow. `typecheck`, `lint`, and the 26-page build pass.
- [x] **Restock board limited to actual storefront traders** — the API's
  `traders` endpoint contains 16 records, including service/quest-only
  characters whose reset timestamps are not useful item-restock data.
  Audited both regular and PvE `barters` endpoints: the same eight fixed
  storefront trader IDs appear in each; Fence supplies the ninth storefront
  through dynamic inventory. All nine have multiple loyalty levels, while
  the seven non-store records expose a single placeholder level.
  - `getTraders()` now maps that distinction to `TaskTrader.hasStore` but
    still returns all 16, preserving trader names/images for every quest.
    Only the home server component filters on `hasStore` before passing data
    to `TraderRestockBoard`.
  - The production build contains all nine sellers and none of Lightkeeper,
    Taran, BTR Driver, Radio Station, Mr. Kerman, Voevoda, or Survivor on the
    home route. `typecheck`, `lint`, and the 26-page build pass.
- [x] **Raid clock layout and motion pass** — centered the section title and
  expanded the two readings into equal-width columns separated by a neutral
  hairline. Removed the visible `Time A` / `Time B` copy while retaining those
  localized labels as accessible names, and made the clock numerals larger on
  desktop with a mobile-safe size below `sm`.
  - Reduced the client timer from 1000ms to 100ms. Since Tarkov time advances
    seven seconds per real second, this changes the display from seven-second
    jumps to consecutive in-game seconds without changing the clock formula.
  - A later visibility pass increased numerals from 24px to 36px on desktop,
    then to 45px by request
    and from 21px to 27px on mobile. Desktop icons grew from 24px to 30px;
    mobile icons/gaps shrink independently so the two-column layout still
    fits. Removing the extra desktop vertical padding keeps the card at 153px
    tall despite the 50% larger desktop numerals.
  - Browser QA at 1280px confirmed exact card-centered alignment, equal
    560px reading columns, 45px numerals, 30px icons, and zero horizontal
    overflow. A conservative 375px width calculation gives each reading
    151.5px and projects 142.8px of actual clock content, leaving about 8.7px
    spare. `typecheck`, `lint`, and the 26-page production build pass.
- [x] **Home boss maps reordered and expanded by popularity** — replaced the volatile
  highest-spawn-chance ranking with an explicit id-based sequence: Customs,
  Streets of Tarkov, Interchange, Reserve, Woods, Shoreline, Factory, Ground
  Zero, Lighthouse. The three-column desktop grid therefore reads
  `1-2-3 / 4-5-6 / 7-8-9` from left to right, while
  narrower layouts preserve the same DOM order.
  - Browser QA confirmed the exact Korean row positions at 1280px, identical
    PvP/PvE ordering, the corresponding English names in the same sequence,
    and zero horizontal overflow. `typecheck`, `lint`, and the 26-page
    production build pass.
- [x] **Items page reduced to search-first UI** — removed the visible Flea
  Market heading, refresh-cycle subtitle, result count, and broad-search hint.
  The page now begins with only the item-name search field followed by the
  table; a screen-reader-only localized `h1` preserves document structure.
  Removed the three unused message keys from ko/zh/en together.
  - Browser QA confirmed 100 initial rows, no removed copy, zero overflow,
    and live filtering from 100 rows to 21 real M4A1 matches without showing
    a result-count line. Message schemas remain identical at 85 leaf keys;
    `typecheck`, `lint`, and the 26-page production build pass.
- [x] **Quest page intro removed** — removed the visible Quest Guide title
  and trader/map filtering description so the page begins directly with its
  search and two filter controls. A screen-reader-only localized `h1`
  remains, and the unused subtitle key was removed from ko/zh/en together.
  - Browser QA confirmed the search control begins at the page's first content
    position, both filters remain present, the removed description is absent,
    and there is no horizontal overflow. Message schemas remain identical at
    84 leaf keys; `typecheck`, `lint`, and the 26-page production build pass.
- [x] **Support page intro and prompt alignment pass** — removed the visible
  heart icon, Support title, and subtitle above the donation card. Kept the
  localized title as a screen-reader-only `h1`, removed the unused subtitle
  key from ko/zh/en, and centered the remaining donation prompt.
  - Browser QA measured a zero-pixel center delta between the prompt and its
    card, confirmed the Ko-fi CTA remains intact, and found zero horizontal
    overflow. Message schemas remain identical at 83 leaf keys; `typecheck`,
    `lint`, and the 26-page production build pass.
- [x] **About page expanded into a professional project overview** — replaced
  the single body paragraph with a factual mission statement, four feature
  cards, source/refresh/support metadata, a product-principles callout, full
  unofficial-project notice, and creator credit. Added natural ko/zh/en copy
  for every section while keeping `NightScav` sourced from `SITE_AUTHOR`.
  - Browser QA at 1280px confirmed a balanced 2×2 feature grid with equal
    442px cards, four metadata rows, zero overflow, and no missing/undefined
    text. English and Chinese render the same complete structure. Message
    schemas remain identical at 107 leaf keys; forbidden styling/weight
    checks, `typecheck`, `lint`, and the 26-page production build pass.
- [x] **NightScav YouTube link added to the home footer area** — added a
  compact creator-channel callout after the boss board and before the site
  footer, linking to `https://www.youtube.com/@nightscav` in a new tab. The
  treatment stays secondary to dashboard data: neutral border/background,
  amber YouTube icon and hover state, no brand-red fill or promotional hero.
  - Browser QA at 1280px confirmed the callout sits between the boss board
    and footer, spans the normal 1193px content width, has the exact external
    URL plus `noopener noreferrer`, and produces zero overflow in ko/zh/en.
    Message schemas remain identical at 110 leaf keys; forbidden style/weight
    checks, `typecheck`, `lint`, and the 26-page production build pass.
- [x] **Atmosphere imagery (home hero, boss cards, map banners, support
  header)** — see "Atmosphere imagery" below for the full account.

## Atmosphere imagery

Four generic dark/industrial environment images (AI-generated, **not** EFT
screenshots and not official BSG art — see Legal) live in
`public/images/atmosphere/` and are wired up through `src/lib/atmosphere.ts`.
They exist to give section entry points identity; every information-dense page
(flea market, hideout, ammo, armor, quests) stays entirely image-free.

- **Keyed by map id, not name.** `MAP_ATMOSPHERE` maps the five relevant map
  ids (factory, night-factory, customs, woods, streets-of-tarkov) to a static
  import, reusing the same stable-id convention as `BossSpawnBoard`'s
  `POPULAR_MAP_IDS`. Ids don't change across ko/zh/en or PvP/PvE, so a map can
  never inherit another map's art from a translation change — verified live by
  switching both locale and game mode. Maps with no shipped art deliberately
  render with none rather than a stand-in.
- **`next/image` with static imports**, the first use of it in this project
  (everything else is a plain `<img>` against remote `assets.tarkov.dev` URLs,
  which the optimizer would only add cost to). Static imports carry intrinsic
  dimensions, so `fill` inside a fixed-height box gives zero layout shift, plus
  responsive `sizes` and lazy-loading for free. Only the home hero is
  `priority` — confirmed in the rendered DOM as a `link[rel=preload]` with no
  `loading` attribute; every other atmosphere image is `loading="lazy"`.
- **`alt=""` everywhere.** Each image sits directly behind the heading it
  decorates (the map name, or the page H1), so scenery descriptions would add
  screen-reader noise, not information — and it avoids shipping English alt
  text on a Korean-first site or 12 new message keys. No message file changed.
- **Gradient scrims are functional, not decorative.** The design system's
  no-gradient rule targets surface treatment; these exist purely to hold text
  contrast over the image, so they are deliberately heavy. The home hero's
  horizontal scrim is stronger below `sm` (`to-bg/75` vs `sm:to-bg/55`) because
  mobile copy spans nearly the full hero width while desktop copy stops well
  inside the dark half.
- **Contrast measured, not eyeballed** — the Browser pane wasn't compositing
  (screenshots unavailable, the failure mode CLAUDE.md already documents), so
  QA re-composited each layer on a canvas from the live `getComputedStyle`
  gradient specs and the actual fetched image bytes, then swept every text
  bounding box for its worst pixel. Against `next start`: home hero at 375px
  (en, longest strings) H1 13.75:1 / subtitle 6.67:1 / eyebrow 6.98:1; at
  1280px 8.6:1 / 6.45:1; home boss-card titles 6.39:1; all five map banners
  11.2–14.2:1. WCAG AA needs 4.5:1.
- **Data is never behind an image.** The home boss cards clip their art to a
  56px strip behind the map name that fades to the card surface — measured:
  strip ends 57px from the card top, the first boss row starts at 60px. Map
  cards put stats/bosses/description/wiki below the banner on the solid
  surface. Card structure and the 44px touch floor are unchanged.
- **Palette left alone.** The task brief asked for "current green accent or a
  restrained olive tactical green"; this project's current accent is **amber**
  (a hard rule, see Design system), and its reference board was drawn against a
  green-accent mock. Amber was kept — changing the site's one accent is an
  identity change, not a visual-integration change, and is a separate decision.
- **Verified**: `typecheck`, `lint`, 26-page production build, and 23 unit
  tests pass. Live `next start` QA at 1280px and 375px across ko/zh/en:
  exactly 5 of 17 map cards banner (140px desktop / 110px mobile), all 17 wiki
  links intact, boss counts unchanged, zero page-level horizontal overflow,
  zero tap targets under 44px, zero console errors.

## Local development

Node.js **v24 LTS** is installed but was not on this machine's default PATH when
the project was first scaffolded — if `node`/`npm` aren't found, prepend the
install dir for the session, e.g. in PowerShell:
`$env:Path = "C:\Program Files\nodejs;" + $env:Path`.

```bash
npm install
npm run dev
```

Then open http://localhost:3000 (redirects to `/ko`). Run `npm run typecheck`
and `npm run build` before committing — the build's static-generation pass is
the most reliable way to catch Suspense-boundary and prerender issues that
`typecheck` alone won't surface (see `Header.tsx`'s `LocaleSwitcher` Suspense
wrapper, added after `build` caught a missing-Suspense error around its
`useSearchParams()` call).

**Sandbox note**: in this dev environment, IPv6 `localhost` may be intercepted
by an unrelated preview proxy. Verify against `http://127.0.0.1:3000` if
`localhost` gives unexpected 404s.

**Verify layout against `next start`, not `next dev`.** `.claude/launch.json`
has two entries: `tarkovdex-dev` (`npm run dev`, port 3000) and
`tarkovdex-prod` (`scripts/start-with-path.bat` -> `next start --port 3001`),
deliberately on different ports so both can run at once. Use the prod one for
any measurement-based check (overflow, element sizes, touch targets). In dev,
routes with a `loading.tsx` stream through a Suspense boundary and Next also
keeps a hidden copy of the previous route in the DOM, so
`getBoundingClientRect()` reads a `display: none` subtree and reports zeros —
this produced a run of confusing all-zero table measurements before the cause
was found. Both scripts exist only because Node isn't on this machine's
default PATH (see above).

**json.tarkov.dev availability**: unlike the old GraphQL endpoint, this has
been reliable — all three data pages were verified end-to-end against it (see
"json.tarkov.dev migration" above). The `try/catch` → translated error-state
pattern on each page is kept regardless, since any external API can fail; it's
just no longer something this project currently needs to actively work around.

## 2026-07-31 tool-suite expansion

The top-level information architecture is now News / Economy / Progression /
Combat / Maps. Economy, Progression, and Combat use accessible desktop
dropdowns and mobile accordions. `/items` and `/tasks` are permanent redirects
to `/economy/items` and `/progression/tasks`; category roots redirect to their
representative child route. Sitemap, metadata alternates/canonical paths,
Footer, Home shortcuts, About, and all locale dictionaries follow this tree.

### Feature-specific data layer

`src/lib/tarkov-tools.ts` reads the live static document shapes:

- `barters` and `crafts` are arrays inside the normal `{ data: ... }` document
  wrapper and have no locale-specific entity document.
- Hideout data is keyed by station id; task and item data remain keyed entity
  records.
- Item, trader, station, and task translation dictionaries are joined on the
  server. Client components receive compact tool DTOs rather than raw item
  property records.
- `fetchTarkovJson` uses a 15-minute per-runtime promise cache for
  items/item dictionaries, barters, and crafts; slower structural documents
  retain six hours. Price-backed pages export a matching 15-minute ISR window.
  Economy DTOs keep the item's source `updated` timestamp and missing prices
  remain `null`. **Combat DTOs (`AmmoRound`/`ArmorItem`/`ArmorPlate`) carry
  no price or price-derived fields at all** — the ammo/armor pages are
  combat-performance tools, and price data was deliberately removed from
  their data model and UI (per explicit request), not just hidden.
### Korean quest text (glossary, not runtime translation)

`tasks_ko` is substantially incomplete upstream: **209 of 501 quest names and
535 distinct objective descriptions** come back byte-identical to English
(audited live across both game modes). Same failure shape as the mob names and
armor layer names already handled in `game-localization.ts`, just far bigger.

- **Fix is a static glossary, `src/lib/task-ko.json` (760 entries)**, applied
  by `localizeTaskText()` only when the API's own ko lookup produced no
  Hangul — so upstream wins the moment it catches up. Keyed on the English
  text, because the underlying dictionary keys are per-task ids.
- **Generated offline** by `scripts/generate-task-ko.mjs` (Gemini, the
  provider this project already uses for news, with a Tarkov-specific
  glossary prompt for map/trader/boss/verb conventions). Deliberately **not**
  a runtime translation path like the news page: the quest page is core
  functionality and shouldn't inherit an LLM's latency, rate limits, or the
  cache-a-failure-forever class of bug the news page had to be restructured
  around twice. Re-run after a patch adds quests; existing entries are
  preserved so only new strings cost a call, and it writes incrementally so a
  mid-run 429 doesn't lose progress.
- **Coverage verified**: 501/501 names and 1467/1467 objectives in regular,
  497/497 and 1438/1438 in pve, all Korean. `tests/task-localization.test.ts`
  asserts the lookup's guard behavior and that no glossary entry is
  accidentally still English.

### Quest name pairing and prerequisite navigation

- **`Task.nameEn`** carries the English quest name, rendered muted in
  parentheses after the localized one (`맛있는 소시지 (The Delicious Sausage)`)
  so a quest stays findable by the name English guides and videos use. Null
  when it would just repeat `name` — i.e. on `en`, or where upstream's own
  ko/zh entry is already the English string. `/api/tasks` matches the query
  against both names, so `Delicious` and `맛있는` both find the same quest.
- **Prerequisites are buttons, not text.** `TaskRequirement` gained
  `taskNameEn` for the same pairing, and clicking one calls back into
  `TasksExplorer.openTask()`, which searches for that quest by name, clears
  the trader/map filters (which would otherwise hide it), and marks it
  focused — `TaskCard` opens its guide and scrolls it into view. Typing in
  the search box clears the focus so it can't re-expand later.

- `src/lib/game-localization.ts` is the shared display-layer glossary:
  caliber enum → familiar designation (`Caliber545x39` → `5.45×39mm`, all 30
  live values mapped, generic fallback for future ones), armor material enum
  → ko/en/zh labels, and Korean names for the mobs the API's ko dictionary
  leaves in English (Knight/Partisan/Kaban/Kollontay etc., keyed by mob id,
  applied in `lib/tarkov.ts` only when the dictionary result has no Hangul so
  the API's official name wins once it exists). Internal filter/URL values
  keep raw enums; only display strings are localized.

The original lightweight `Item` DTO intentionally remains unchanged. Heavy
ammo, armor, plate, slot, and Gunsmith compatibility properties live only in
feature-specific raw types and normalized types (`src/types/tools.ts`).

### Calculation decisions and boundaries

- Barter input cost is the sum of required quantity times the selected flea,
  trader, or mixed-lowest purchase price. Output uses flea value when present,
  with a user-set planning fee, and otherwise best trader sell value. Any
  missing required price makes profit and ROI unknown.
- Craft tools (`attributes.tool === true`) are listed but excluded from
  consumed material cost. Optional hourly operating cost defaults to zero;
  fuel and power are not guessed.
- Ammo armor-class cells use `penetrationGrade()` (penetration power relative
  to class × 10). They are explicitly not exact penetration probabilities,
  because durability and current-version game formulas affect those odds.
- Armor zones pass through one central mapping table. Unknown values remain
  visible as unclassified source zones. Soft armor and installed plate layers
  are never collapsed into one class.
- Gunsmith currently searches direct weapon-slot compatibility for structured
  `containsAll` and `containsCategory` requirements and exposes bounded price
  alternatives. It is labeled a current-data candidate, not globally cheapest.
  Numeric final-stat requirements stay visibly unverified because this dataset
  does not provide an authoritative complete nested-build stat formula.

Pure calculations and mappings live in `src/lib/tool-calculations.ts` and are
covered by `tests/tool-calculations.test.ts` through the `npm test` script.

## 2026-07-31 custom domain migration + SEO foundation

The canonical production domain moved from the free `tarkovdex.vercel.app`
subdomain to **`https://tarkovdex.dev`** (`www.tarkovdex.dev` 308-redirects to
it at the Vercel edge — configured in Vercel's dashboard, not in this repo).
`SITE_URL` in `src/lib/site.ts` now falls back to `https://tarkovdex.dev`;
`vercel.json`'s `NEXT_PUBLIC_SITE_URL` and `.env.example` were updated to
match, so every consumer (root layout's `metadataBase`, `robots.ts`,
`sitemap.ts`, and every page's `buildPageMetadata()` call) picks up the new
domain with no per-file changes.

Most of the actual SEO surface — per-page `title`/`description` via
`buildPageMetadata()` in `src/lib/metadata.ts`, reciprocal `hreflang`
alternates (ko/zh/en + `x-default`, see below) via each page's `alternates`,
and self-referencing `canonical` URLs — already existed from the tool-suite
expansion above and needed no redesign, just the domain swap. Two real gaps
were found and fixed:

- **`sitemap.ts`'s hreflang alternates had no `x-default`** entry, while the
  HTML `<link rel="alternate">` tags from `buildPageMetadata()` did — the two
  hreflang sources disagreed. Sitemap alternates now include `x-default`,
  matching the HTML head exactly (see "x-default target" below for what it
  points at and why).
- **`robots.ts` allowed everything with no exclusions.** `/api/items` and
  `/api/tasks` are JSON data endpoints (consumed by client components), not
  indexable content, so they're now `Disallow`'d. Nothing else was excluded —
  every real content route stays crawlable.

**Structured data**: a minimal `WebSite` JSON-LD block (`name: "TarkovDex"`,
locale-specific `url`, `inLanguage`) was added inline on the home page only
(`src/app/[locale]/page.tsx`) — no separate lib file, since nothing else
needs it. No `Organization`/`BreadcrumbList` schema was added: this is a fan
project with no organizational identity to declare, and no page currently has
a multi-level navigable hierarchy that would benefit from breadcrumbs.

**Locale routing double-checked, not changed**: `next-intl`'s middleware only
redirects the bare `/` root based on `Accept-Language` (to the
`defaultLocale`, `ko`, when absent/unmatched); every `/ko`, `/zh`, `/en` URL
is a direct, non-redirecting hit for Googlebot or any other crawler — no
loop, no single-locale trap. This is existing `localePrefix: 'always'`
behavior (see the i18n routing decision above), left untouched.

**Verified**: `typecheck`, `lint`, and a production build (Gemini disabled)
all pass. A real `next start` server confirmed: `robots.txt` allows `/`,
disallows `/api/`, and points `Sitemap:` at `https://tarkovdex.dev/sitemap.xml`;
`sitemap.xml` emits only `https://tarkovdex.dev/...` URLs with reciprocal
per-route hreflang including `x-default`; a sampled page
(`/en/combat/ammo`) rendered the correct distinct `<title>`, self-referencing
`canonical`, three-way `hreflang` alternates, and `og:url` all under the new
domain; the home page's `<script type="application/ld+json">` parses as valid
`WebSite` schema.

### x-default target — `/en`, not `/ko` (post-launch review fix)

The first pass above pointed `x-default` at `/ko{path}`, reusing
`routing.ts`'s `defaultLocale`. Caught in review: `defaultLocale` encodes
*this site's* primary-audience choice (Korean players), which is a different
question from *what a generic/unmatched crawler or user should land on* —
conflating the two pointed a global hreflang signal at one specific language.
`ko` was also disqualified on a second, independent ground: with
`localePrefix: 'always'`, the bare `/` root 307-redirects based on
`Accept-Language` rather than serving stable content (see the i18n routing
decision above), so per Google's own guidance `x-default` must target a real,
directly-crawlable page — not a redirect, and not implicitly "whichever
locale we personally favor."

**Fix**: `X_DEFAULT_LOCALE = 'en'`, now a single exported constant in
`src/lib/metadata.ts` (English — TarkovDex's lingua-franca fallback for a
global EFT audience), imported by both `buildPageMetadata()` (HTML
`<link rel="alternate" hreflang="x-default">`) and `sitemap.ts` (its
`alternates.languages['x-default']`) so the two hreflang sources can't drift
apart again — one constant, not two hardcoded locale strings. `ko`/`zh`/`en`
alternates and `canonical` were untouched; only the `x-default` target moved.

**Verified**: `typecheck`, `lint`, `build` all pass. A real `next start`
server confirmed reciprocity across `/en`, `/ko`, `/zh`, and `x-default` for
both a sampled page (`/{locale}/combat/ammo`) and `sitemap.xml`: all three
locale pages emit identical `hreflang="x-default"` pointing at
`https://tarkovdex.dev/en/combat/ammo`, and the sitemap's `<xhtml:link>`
block matches the HTML head exactly.
