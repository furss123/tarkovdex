# CLAUDE.md — TarkovDex

Architecture notes and decision log for TarkovDex, an **unofficial** Escape
from Tarkov fan site. Data comes from the public
[json.tarkov.dev](https://json.tarkov.dev) static JSON API. This file is the
source of truth for *why* the project is shaped the way it is — read it before
making structural changes.

> **2026-08-12: the site was deliberately reduced to a single page.** Most of
> what this file used to document — the flea market, quest guides, gunsmith
> solver, ammo/armor tools, the Tarkov Live newsroom and its Postgres review
> desk, the PWA, the local-state store — was deleted, not refactored. The
> history lives in git; this file now documents what exists. The "What was
> removed, and what that cost" section at the end records the trade-offs that
> were accepted, because they are the parts most likely to be regretted later.

## What this is

One dashboard, three widgets:

1. **작전 시간** — the in-game raid clock, both time variants
2. **보스 스폰률** — boss spawn chances on nine mainline maps
3. **하이드아웃 최적 생산품** — the most profitable craft per hideout station

Plus two pages that exist for non-content reasons: `/support` (Ko-fi) and
`/privacy` (a hard requirement for serving ads).

Korean (default) and English are public; Chinese stays implemented and
unpublished. Site-wide PvP/PvE toggle in the header.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router) + React 19 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v3 (explicit config) |
| i18n | next-intl (routing + middleware) |
| Icons | lucide-react (SVG, no emoji) |
| Data | json.tarkov.dev static JSON, server-side |
| Storage | None. No database, no accounts, one `localStorage` key |
| Hosting | Vercel |

## Folder structure

```
src/
  middleware.ts               # next-intl locale routing + /zh → /ko
  i18n/                       # routing, navigation helpers, request config
  contexts/GameModeContext    # site-wide PvP/PvE selection (client)
  app/
    globals.css
    sitemap.ts / robots.ts / manifest.ts
    api/dashboard/route.ts    # the live-refresh JSON endpoint
    [locale]/
      layout.tsx              # <html>/<body>, fonts, providers, AdSense loader
      page.tsx                # the dashboard
      privacy/ support/       # the two standalone pages
      not-found.tsx error.tsx [...rest]/
  components/
    home/                     # InGameClock, LiveDashboard, CraftProfitBoard,
                              # BossSpawnBoard, LiveStatusBar, SupportCallout,
                              # useLiveDashboard
    layout/                   # Header, Footer, LocaleSwitcher, GameModeSwitcher
    status/StatusUI.tsx       # LastUpdated / StaleDataNotice / Empty / Error
    ads/AdSlot.tsx
  lib/
    tarkov.ts                 # json.tarkov.dev client (fetch + translate + map)
    tarkov-tools.ts           # craft dataset builder
    tool-calculations.ts      # pure craft profit math
    dashboard.ts              # assembles the whole dashboard payload
    data-status.ts            # content-age policy (craft freshness only)
    ads.ts site.ts navigation.ts metadata.ts format.ts …
  types/                      # tarkov.ts, tools.ts, dashboard.ts
messages/                     # ko.json | en.json | zh.json — 89 leaf keys each
```

## The live refresh architecture

**One producer, two delivery paths.** `getDashboardData()` in `lib/dashboard.ts`
builds the entire payload — craft leaders and boss spawns, both game modes. The
page calls it directly for the first paint; `/api/dashboard` calls it for every
poll. A field therefore cannot mean one thing on load and another after an
update, which is the failure a separate "refresh" endpoint invites.

**The page is `force-static`, and that export is load-bearing.**
`fetchTarkovJson` issues upstream requests with `cache: 'no-store'` (the
documents are far past Next's 2MB Data Cache limit, so it keeps its own
per-runtime promise cache instead). Without `export const dynamic =
'force-static'`, that one option opts the whole route into dynamic rendering.
This was verified, not assumed: removing it stopped the build emitting
`ko/index.html` at all, and every visitor paid a full server render.

**Both modes travel together.** Boss compositions and craft prices genuinely
differ between PvP and PvE, and the header switch must never trigger a request.
Confirmed in the browser: switching modes issues zero network calls.

**Polling cadence is 60s, and that is not a claim about price velocity.**
json.tarkov.dev regenerates its dumps on its own schedule; `/api/dashboard`
sits behind `s-maxage=60`. What actually keeps the board current is the
visibility refetch — a tab backgrounded for an hour updates the instant it is
looked at. Polling stops entirely while hidden.

**Two timestamps, never conflated.** `priceUpdatedAt` is upstream's content
stamp — the oldest contributing price behind the ranking, null when any
contributor is unstamped. `lastSyncedAt` is when we last asked. `LiveStatusBar`
shows both, because a recent sync over a day-old price stamp is still day-old
data. This is the same discipline the deleted Tarkov Live board arrived at
after shipping the mistake once (it reported render time as "last checked").

**A failed refresh never blanks the board.** The last good payload stays on
screen with its age visible; the status strip turns to the error state. An
overlapping fetch is aborted so a slow response cannot overwrite a newer one.

**The raid clock is outside all of this** — pure client math off `Date.now()`,
no data dependency, so it keeps running even if every request fails.

## Data layer

### json.tarkov.dev: dictionary-key translation

The base file (`/{mode}/{endpoint}`) carries a `translations` JSONPath manifest
listing which fields are translatable, and those fields' values are **dictionary
keys, not text** (a map's `name` is literally `"55f2…4567 Name"`).
`/{mode}/{endpoint}_{lang}` is a flat key→string dictionary. This applies to
`en` too — there is no "the base file is already English" shortcut. One helper
implements the lookup: `translate(dict, raw)` in `lib/tarkov.ts`, and it trims,
because every `items_ko` value ships with a trailing space.

### Caching

`fetchTarkovJson` holds a parsed per-runtime promise cache: 15 minutes for
price-backed documents (`items`, `crafts`), 6 hours for structural ones
(`maps`, `hideout`). On upstream failure a previously good document is served
for a grace window rather than collapsing the board — the caller still sees the
content timestamp, so a dated answer is never mistaken for a current one.

Next's own fetch Data Cache is bypassed deliberately: these responses are
3–21MB and it silently drops anything over 2MB.

### The board never invents a number

- Missing prices stay `null`; a craft with any unpriced input is dropped from
  the ranking rather than costed at zero.
- Craft tools (`attributes.tool === true`) are listed but excluded from
  consumed material cost — they are returned.
- Fuel and power costs are not guessed. The stated profit is before flea fees
  and operating cost, and says so.
- Craft leaders split into **current** and **stale** at 12h/24h
  (`CRAFT_FRESHNESS`), never interleaved. `unknown` age lands in stale on
  purpose — an age we cannot establish must not be sold as a current one. The
  single grid this replaced ranked a 243-day-old Bitcoin Farm output alongside
  seven current recipes under a "current prices" caption.
- Boss rows are filtered by BSG's own `boss*` role-id prefix rather than a
  brittle name exclusion list, and only positive finite chances render.

## Design system (hard rules)

Non-negotiable — they exist to avoid generic "AI-generated" styling.

- **Dark theme**, background is dark *gray* (`#17181b`), never pure black.
- **One accent colour: amber** (`#e2a438`). Everything else is a neutral gray
  scale. The only exception is the muted green/red pair for signed price
  deltas — data semantics, not decoration.
- **No gradients, no glow, no shadows.** Section separation uses thin borders.
- **No emoji.** Icons are SVG via lucide-react.
- **Max two font weights**: regular (400) and medium (500). No bold.
- Type and spacing are **1.5x** Tailwind's default scales, set once in
  `tailwind.config.ts` rather than per component. A fixed 44px `touch` token is
  the tap-target floor and is deliberately not a scale step, so it cannot drift.
- Tokens live once as CSS variables in `globals.css`.

### Header stacks below `sm`, measured

Brand (~85px) plus both segmented controls (~96px and ~124px) overflow a 375px
viewport by 26px on one line, and neither control can shrink without breaking
the 44px floor. Two rows is the fix. A menu was rejected: the mode switch
changes the whole board, so putting it one tap further away is a downgrade.

There is no primary navigation, no hamburger and no mobile drawer — with one
content page there is nowhere to navigate, and a menu holding a single link is
worse than no menu.

## Monetization

Everything ad-related is inert until `NEXT_PUBLIC_ADSENSE_CLIENT` is set: no
loader script, and `AdSlot` renders nothing rather than an empty grey box.
Shipping a half-wired `<ins>` for a publisher id that does not exist yet is
both useless and a bad look to a reviewer.

One in-content unit, placed at the section break between the craft and boss
boards. It is passed into `LiveDashboard` as a `ReactNode` rather than imported
inside it, so it sits *between* the boards and stays mounted across every poll
and mode switch — pushing to `adsbygoogle` again on a filled slot is a
policy-relevant error, and a `useRef` guards it as well. The reserved
`min-height` prevents the boss board being shoved down when the iframe paints.

`/privacy` is the reason a strict one-page site was not possible: an ad network
will not approve a site serving personalized ads without disclosing third-party
cookies, and a user cannot opt out of something they were never told about.

**Realistic expectation, stated plainly**: a single-page tool that people leave
open is close to the worst possible ad format — impressions do not refresh with
time on page. Donations are the likelier primary revenue here; ads are the
secondary path.

## Legal

Every locale's footer must carry the disclaimer that TarkovDex is unofficial
and unaffiliated with Battlestate Games (`footer.disclaimer`). Do not remove
it. The creator name is `SITE_AUTHOR` in `lib/site.ts` (`NightScav`), shown
verbatim and never translated.

## `public/sw.js` is a kill switch

The old PWA registered a real service worker in visitors' browsers. **Deleting
the file would not have removed it** — an installed worker keeps serving its
own cache, and a 404 on that path is not enough to dislodge it. Those browsers
would have gone on seeing the old multi-page site indefinitely. The file that
remains clears every cache, unregisters itself, and reloads controlled pages.
Safe to delete only once no client can still have the old worker; realistically,
leave it.

## What was removed, and what that cost

Deleted: the news/Tarkov Live pipeline (Steam RSS, X API, Gemini translation,
Postgres, migrations, the admin review desk, cron), the flea market, quest
guides and tracker, the Korean quest glossary, the gunsmith solver and its
generated builds, ammo and armor tools, the budget builder, watchlists, search,
the `/status` and `/local-data` pages, the local-state store, the PWA, the
atmosphere imagery, every test, and every script.

Accepted costs, recorded so they are not rediscovered as surprises:

- **~1,000 indexed URLs became redirects.** The old sitemap emitted 524 quest
  detail pages × 2 locales plus category routes. They 301 to the dashboard
  (`RETIRED_SECTIONS` in `next.config.ts`) rather than 404ing, but the organic
  search surface is now three URLs. Ad revenue is pageviews × RPM, and the
  pages that produced pageviews are gone.
- **AdSense approval is not assured.** Three auto-generated data widgets
  sourced from a third-party API, with almost no original prose, is the
  textbook "low value content" rejection. This was flagged before the work and
  chosen anyway; if the application is rejected, the remedy is original
  written content, not another pass at the layout.
- **The test suite is gone** (107 tests). `tool-calculations` and the craft
  freshness split in particular were covered and are now not. They are pure
  functions and cheap to re-cover if this stops being throwaway.
- **The trader restock countdown was removed** with the rest, though it was the
  stickiest widget on the page — a genuine live countdown, which is exactly
  what makes a tab worth leaving open. `lib/trader-restock.ts` and
  `TraderRestockBoard.tsx` are one `git revert` away if that turns out to have
  been a mistake.
- **`npm ci` fails on the current lockfile** (`Missing: @swc/helpers@0.5.23`).
  Pre-existing, not introduced here, but worth fixing before it bites a
  deploy — `npm install` regenerates it.

## Local development

```bash
npm install
npm run dev
```

Run `npm run typecheck` and `npm run build` before committing. The build's
static-generation pass catches prerender and Suspense-boundary issues
`typecheck` alone will not — including the `force-static` regression documented
above, which was invisible to both typecheck and lint.

**Verify layout against `next start`, not `next dev`.** In dev, Next keeps a
hidden copy of the previous route in the DOM, so `getBoundingClientRect()`
reads a `display: none` subtree and reports zeros.

## 2026-08-12 nav restored: three topic pages, three game modes

The single-page redesign above was reversed in part, on request. The dashboard
stays, but three topic pages come back with a header nav, and the PvP/PvE
toggle becomes a three-way PvP / PvE / PvP S selector.

### Why pages came back

Search. Gunsmith is the single most-searched thing this project covers, and a
six-row summary inside a dashboard cannot rank for "건스미스 파트 12" — a page
whose whole content is that answer can. Same argument, weaker, for boss spawn
rates and hideout crafts. The monetization goal that drove the single-page cut
is better served by three indexable answers than by one page that mentions all
three.

### Summary vs. full, not duplication

The home page keeps both data sections but they are **projections**, decided
server-side in `getBoardData(locale, view)`:

- home: the six most profitable crafts across all stations (ranked by profit,
  dated-price group dropped), and the nine mainline maps.
- `/hideout`: every station's best craft, including the dated-price group.
- `/bosses`: every map, mainline first then by highest chance.

One producer, so a number cannot mean one thing on the summary and another on
the full page. The dated group is *dropped* rather than truncated on the home
summary deliberately: showing two dated rows and hiding five is more misleading
than showing none and linking out.

`BoardModeData.crafts` / `.bosses` are three-state — `undefined` (this view
does not render it), `null` (this mode's fetch failed), or a value. The boss
page therefore never ships a craft ranking, and "failed" is never rendered as
"empty".

### Three game modes

`GameMode` is now `'regular' | 'pve' | 'seasonal'`, iterated from `GAME_MODES`
so adding a fourth is a one-line change. Upstream path segments go through
`MODE_PATH` in `lib/tarkov.ts`; the seasonal one reads
`TARKOV_SEASONAL_PATH` (default `seasonal`) because BSG renames the season
between wipes and correcting it should be an env change, not a deploy of new
code.

**No fallback, on purpose.** When the seasonal segment does not resolve, every
board for that mode reports a failed load. A seasonal wipe has its own economy
and its own boss table, so quietly serving PvP numbers under a seasonal label
would be worse than an empty board — this is the same "never guess" rule the
Tarkov Live work was built on.

**The green "S" is a deliberate exception to the one-accent rule.** A new token
(`--color-seasonal`, a desaturated tactical green, 7.4:1 on the page
background) is used in exactly two places: the "S" glyph and the indicator dot
in the mode switcher. Selection is still carried by the amber fill every other
control uses, so the green says *which mode this is* and the amber says *which
one you picked* — status is never hue-only. It appears nowhere else: no
surfaces, borders, links or states.

The status strip now leads with the mode label for the same reason: a visitor
who misreads the mode misreads every figure under it.

### Gunsmith, restored whole

`gunsmith-builds.json` (27 quests × 2 modes), `task-ko.json`, `getTraders()`,
`localizeTaskText()`, `getGunsmithTasks()` and the explorer all came back from
the pre-redesign commit. The stat model and the solver are unchanged — see
"Gunsmith: solved builds" above.

What changed is only the page shell: the old one depended on `ToolShell`,
`ModeAvailabilityBoundary` and the `domainHealth` registry, all deleted in the
redesign. Rather than restore that scaffolding, the page uses the idiom the
rest of the site now uses (`ErrorState` / `EmptyState` from `StatusUI`, modes
settled with `Promise.allSettled`). `getGunsmithTasks` returns early for a mode
with no snapshot, so the seasonal mode costs zero upstream requests and renders
"no builds for this mode yet" — which the explorer keeps distinct from "could
not load".

The page has `revalidate = 21600` and **does not poll**. Nothing on it is
price-backed; a live refresh would spend requests redrawing an identical parts
list.

### Component moves

`useLiveDashboard` → `components/boards/useLiveBoard` (takes a `view`),
`LiveDashboard` → `components/boards/LiveBoards`, and the craft/boss/status
components moved to `components/boards/` since three pages render them.
`/api/dashboard` → `/api/board?view=home|hideout|bosses`; one route because the
three views are projections of the same documents and the same cache.

Message namespaces split to match: `board`, `craft`, `boss` alongside `home`,
plus `nav`, `hideout`, `bosses`, `gunsmith`. 151 leaf keys, identical across
ko/en/zh.

### Header

Collapses at `lg`, not `sm`: the bar is brand + three Korean nav labels + two
segmented controls, and the mode switcher gained a third button. The nav goes
behind a disclosure below `lg` while **both switchers stay visible** — hiding
the mode control would put the thing that reinterprets every number on the page
one tap further away.

### Verified

`typecheck`, `lint` and a production build all pass; 18 pages, and all four
content routes prerender (confirmed in `prerender-manifest.json`, not just from
the route table) with `10m` / `1h` / `10m` / `6h` windows.

Against `next start`: 375px and 1280px on `/ko`, `/ko/bosses`, `/ko/hideout`,
`/ko/gunsmith`, `/en`, `/en/gunsmith` — zero page-level horizontal overflow,
zero interactive elements under 44px, no console errors other than the
sandbox's blocked network. At 375px the desktop nav is hidden and the
disclosure opens all three links and closes itself on navigation; at 1024px the
full nav fits with zero overflow. The three mode buttons render, the status
strip's mode label changes with the selection, and the choice survives
navigation via `localStorage`. The seasonal "S" computes to
`rgb(124 186 92)` with its glow, and the Gunsmith page shows "no builds for
this mode" on seasonal versus a load error on PvP.

**Not verified: real data.** json.tarkov.dev is unreachable from this sandbox
(`CONNECT tunnel failed, 403`), so every board rendered its error state. Craft
profit figures, boss percentages, and the Gunsmith parts lists must be checked
against a local `npm run build && npm start` with real network. The seasonal
path segment could not be confirmed against upstream for the same reason —
`TARKOV_SEASONAL_PATH` exists precisely so that is a one-line correction.
