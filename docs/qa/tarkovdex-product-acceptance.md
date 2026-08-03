# TarkovDex product acceptance

Written **2026-08-03**. The checklist every phase is measured against, plus the
final gate for Phase 9.

**Rule for this document: a box is only ticked with the evidence that proves it.**
A measured number, a command's output, or a named DOM read. "Looks fine" is not
evidence. A partially implemented feature is not marked complete.

---

## A. Baseline recorded at Phase 0

Anything that regresses from these figures is a Phase 9 blocker.

| Check | Command | Result (2026-08-03) |
| --- | --- | --- |
| Types | `npm run typecheck` | pass, no output |
| Lint | `npm run lint` | pass, "No ESLint warnings or errors" |
| Tests | `npm test` | **174 pass / 0 fail**, 11.8 s |
| Build | `npm run build` (`GEMINI_API_KEY` empty) | exit 0 |
| Shared first-load JS | build route table | **103 kB** |
| Largest route first-load | build route table | **129 kB** (`/economy/items`, `/news`) |
| Message key parity | `tests/messages.test.ts` + manual leaf count | **489 / 489 / 489**, zero divergence |
| Prerendered quest pages | build route table | 1572 (524 × 3) |

Node must be on PATH first:

```bash
export PATH="/c/Program Files/nodejs:$PATH"
```

Browser verification runs against **`next start`**, not `next dev`
(`.claude/launch.json` → `tarkovdex-prod`, port 3001). In dev, routes with a
`loading.tsx` stream through a Suspense boundary and Next keeps a hidden copy of
the previous route in the DOM, so `getBoundingClientRect()` reads a
`display: none` subtree and returns zeros.

---

## B. Per-phase gate (run at the end of every phase)

In this order. A failure stops the phase; it is not deferred.

1. New/changed pure functions — unit tests
2. Affected integration tests
3. `npm test` (full suite, no regressions)
4. `npm run typecheck`
5. `npm run lint`
6. `npm run build`
7. Browser verification against `next start`
8. Roadmap status updated

---

## C. Data honesty (the non-negotiable set)

- [ ] No missing price is ever treated as `0` in any calculation
- [x] No absent timestamp is rendered as a time — `contentFreshness()` returns `unknown`
      for missing / unparseable / implausibly-future values, `domainHealth()` omits
      `fetchedAt`/`cacheStoredAt` entirely when unobserved, and the UI prints
      `확인할 수 없음` / `갱신 시각 확인 불가`. `tests/data-status.test.ts` +
      `tests/data-observations.test.ts` ("never invent a fetch time").
- [ ] No boss rate, price or restock time falls back to a previous or estimated value
- [ ] PvP and PvE data never appear in the same view, list, total or saved record
- [ ] Values from different observation times, when combined, say so
- [ ] "No data" and "failed to load" are visually and textually distinct on every page
- [ ] A stale value never renders identically to a fresh one
- [x] `unknown` is displayed as `unknown`, never as a plausible default — nine of the
      twelve domains render `데이터 신선도: 확인할 수 없음` on `/status` rather than a
      number, because their upstream documents carry no content timestamp.
- [x] ISR policy ("refreshes every 15 minutes") is never rendered as an observation —
      `DataDomainPolicy` deliberately has no `expectedRefresh` field; the TTL appears only
      under the `캐시 정책` label as prose ("…서버 메모리에 15분간 보관합니다"), never on
      the same line as a time.
- [ ] No superlative claims in any locale — "최고", "최강", "반드시", "best", "strongest", "must", "最强", "必须" — asserted by a test over `messages/*`
- [ ] Every recommendation displays the criteria that produced it

---

## D. Per-phase acceptance

### Phase 1 — Data trust — **complete (2026-08-03)**

- [x] Every data page shows a status badge and, where one exists, a real last-update time
      — items, barters, tasks, gunsmith, ammo, armor, maps all pass `health` into
      `ToolIntro`; measured on `/ko/economy/barters`: badge `정상`, content update
      `2026. 8. 3. 오전 11:08 KST`, fetch `11:11 KST` — two distinct clocks, distinctly labelled.
- [x] `/status` lists every domain with status, last success, counts and user impact
      — 12 domain cards render in ko/en/zh; measured on `/ko/status`.
- [x] Domains with no upstream timestamp report observation age and `unknown` content age
      — enforced by `DataDomainPolicy.supportsSourceTimestamp` and asserted by
      `tests/data-status.test.ts` ("thresholds if and only if a source timestamp") and
      `tests/data-observations.test.ts` ("a domain with no upstream stamp reports unknown
      content age even when given one"). Rendered as `출처가 갱신 시각을 제공하지 않음`.
- [x] `gunsmith-builds.json` reports `unknown` until the generator stamps it
      — `domainPolicy('gunsmith').supportsSourceTimestamp === false`, asserted by test.
      The generator was **not** changed to emit a stamp; that stays out of scope.
- [x] Stale-on-error service is visible to the user
      — `delivery: 'stale-cache'` → summary `previous` → `StaleDataNotice`.
      **Verified by `tests/tarkov-fetch-observation.test.ts` against the real
      `fetchTarkovJson`, its real cache and its real 60 s retry pin, not in a browser** —
      a real upstream outage cannot be induced against `next start` from here.
- [x] `ToolIntro`'s timestamp renders in a pinned timezone
      — the `toLocaleString` path is deleted; all times go through `formatKst()`.
- [x] A failed home widget states that it failed instead of disappearing
      — `ErrorState` (`role="alert"`, negative border) vs `EmptyState` (neutral, inbox);
      `소식이 없습니다.` observed rendering as the empty variant on `/ko`.
- [x] Status components are used, not re-implemented per page
      — `ItemsExplorer`'s own badge and `ItemsTable`'s own `fresh|aging|stale` wording
      both removed; the seven superseded `items.*` message keys deleted from all locales.
- [x] ko/zh/en complete, key counts identical — **561 / 561 / 561**, verified identical.
- [x] `tests/data-status.test.ts` covers every threshold boundary and null combination
      — exact boundary, ±1 ms either side, future skew, unparseable, missing, and
      no-thresholds; plus every summary combination.

Commands at completion: `npm test` **234 pass / 0 fail**; `npm run typecheck` clean;
`npm run lint` "No ESLint warnings or errors"; `npm run build` exit 0, shared first-load
JS **103 kB** (unchanged), largest route `/economy/items` **132 kB** (was 129 kB, +2.3 %).

Browser QA against `next start` (port 3001), 320 px, 13 route×locale combinations:
zero page-level horizontal overflow and zero sub-44 px targets on every route this phase
touched. `/api/items` observed reporting `totalCount: 4620, staleCount: 902,
missingCount: 0` and transitioning `delivery: network → cache` between two live requests.

**Not verified in a browser:** a live upstream failure (see the stale-on-error line
above). Interactive click-through of the flea market's client-side empty/error states was
also not possible — the Browser pane was in the non-compositing state CLAUDE.md documents,
where synthetic events silently no-op.

**Pre-existing defects found, not fixed (Phase 9 scope, in files this phase did not
touch):** `/ko/progression/gunsmith` overflows to 332 px at 320 px (a `퀘스트 지정` badge
in `GunsmithExplorer`); the ammo/armor checkboxes are 24 px tall.

### Phase 2 — Local state — **complete (2026-08-03)**

- [x] State survives reload
      — verified live: PvP/PvE selection read back correctly after navigating to a
      different route on `next start` (no in-page reload API used by the site, but
      the persisted document round-trips through the same load path a real reload
      takes: `readRaw` → `loadLocalState` → `hydrateLocalState`, which
      `tests/game-mode-regression.test.ts` exercises directly by resetting the
      in-memory store and re-hydrating against the same fake disk).
- [x] A second tab reflects changes via the `storage` event
      — verified live with two real browser tabs against the same `next start`
      server: tab 2's PvP selection updated tab 1's header control without tab 1
      ever reloading.
- [x] `schemaVersion` migration from a prior version works
      — V1 is the first version, so there is no prior version to migrate *from*
      yet; what's implemented and tested is the upgrade *mechanism* (`migrate.ts`'s
      `loadLocalState()` orchestrates version-check → recover → legacy-adopt) and
      its refusal path for a version *newer* than the running build. §5.9 of
      `tarkovdex-local-state.md` documents exactly how a real version-2 migration
      plugs into this.
- [x] Corrupted JSON recovers to defaults and preserves a diagnosable backup
      — verified live: writing `{not json` under `tarkovdex:v1` and reloading
      backed it up to `tarkovdex:v1:corrupt` and reset to defaults (also unit
      tested).
- [x] One corrupt field resets only that field
      — `tests/local-state-schema.test.ts`: a bad `gameMode` resets only
      `preferences`, `metadata.createdAt`/`updatedAt` survive untouched, and vice
      versa.
- [x] A higher `schemaVersion` is refused and the stored document is left untouched
      — verified live and by test: a `schemaVersion: 99` document was byte-for-byte
      unchanged on disk after a reload that ran on in-memory defaults for that
      session.
- [x] Legacy `tarkovdex:gameMode` is adopted then removed
      — verified live: setting the legacy key to `pve` with no `tarkovdex:v1`
      present, then loading the site, adopted `pve` into the new document and
      removed the legacy key — but only after a write-then-verify-then-delete
      sequence; a unit test with a throwing `setItem` confirms the legacy key
      survives when that write fails.
- [x] `setItem` throwing (quota / private mode) does not crash the UI
      — `tests/local-state-store.test.ts`: a `QuotaExceededError`-throwing storage
      stub still updates in-memory state and returns a typed failure instead of
      throwing into the caller.
- [x] Reset, export and import all work; import rejects bad or newer payloads with a stated reason
      — verified live end-to-end: export produced a real file with the exact
      `tarkovdex-user-data-YYYY-MM-DD.json` pattern and a valid envelope; import
      previewed the file before applying and correctly rejected non-JSON, wrong
      shape, an internally invalid state, and a future `schemaVersion`, each with
      its own distinct translated reason; reset required an explicit second
      confirmation click and was cancellable with no effect.
- [x] Zero hydration warnings
      — one real mismatch was found (a storage-availability check that evaluated
      differently under SSR vs. the browser) via raw-HTML-vs-DOM diffing, since
      `next start` production suppresses React's detailed hydration console
      output. Fixed to default to the common case and self-correct after mount;
      re-verified the string no longer appears in the server-rendered HTML outside
      a `<script>` tag.
- [x] Only internal ids are stored — no localized display strings
      — the only stored value is `gameMode: 'regular' | 'pve'`, the same internal
      literal the rest of the codebase already uses; nothing locale-dependent is
      ever written.

Commands at completion: `npm test` **314 pass / 0 fail** (234 baseline + 80 new,
zero regressions); `npm run typecheck` clean; `npm run lint` clean; message keys
**606 / 606 / 606**, identical across ko/en/zh (561 baseline + 45 new under a
dedicated `localData` namespace).

**Not verified live** (covered by unit tests against an injected storage adapter
instead): a genuine quota-exceeded write and fully blocked storage — neither
condition was reachable in this browser profile.

### Phase 3 — Quest tracking + raid sheet — **complete (2026-08-03)**

- [x] Quests for the chosen map group correctly (via `task.map.id`)
      — the raid plan editor's quest picker filters `activeTasks` by
      `task.map?.id === plan.mapId`; verified live by selecting a map and
      confirming only that map's active quests were offered.
- [x] Quantities across multiple quests aggregate correctly
      — `tests/quest-requirements.test.ts` ("the same item across two
      different quests sums") + verified live (Fuel conditioner's total
      correctly summed across contributing quests, visible in the browser
      test transcript).
- [x] Two distinct item ids sharing a display name never merge
      — aggregation groups strictly by `items[0]` id, asserted directly by
      test ("two different item ids are never merged, even with the same
      count").
- [x] Owned and short quantities are arithmetically correct, including
      over-supply — `withOwnedAndMissing`'s `missing = max(required - owned,
      0)`, tested at the exact boundary (owned > required → 0, never
      negative) and verified live (owned count raised past required showed
      missing at 0).
- [x] Check state survives reload — verified live: raid plan map, quest
      selection, checked objective (composite key), custom items, and
      debounced notes all correct after a full page reload.
- [x] PvP and PvE progress never mix
      — structural test (`quest-reducers.test.ts`, "a write to one mode
      returns the other mode ModeState by identity") plus live verification:
      switching to PvE on the tracker showed the empty state while 40 PvP
      active quests remained intact underneath, and switching back restored
      them unchanged.
- [x] Completed quests are clearly distinct
      — rendered with `line-through` + muted text in a separate "완료한
      퀘스트" section, not just a filter toggle on the same list.
- [x] One-handed check-off at 390 px
      — every checkbox's *clickable hit area* (not just its visual glyph)
      measured 44×44 px after a fix found during this pass (see below); every
      other interactive control (toggle buttons, +/- steppers) already 44 px.
- [x] No condition is displayed that the objective data does not actually
      carry — `foundInRaid` (structurally 100% present/absent, never
      guessed) is the only combat-condition-adjacent field surfaced; keys,
      survival, time windows, PMC/Scav, specific exits and equipment
      restrictions are never presented as structured facts, per the
      `docs/architecture/tarkovdex-data-flow.md` §9 audit's own findings
      (one of which — `exitStatus` containing a literal untranslated
      dictionary-key string — independently confirms this was the right call,
      not just brief-compliance).

Commands at completion: `npm test` **388 pass / 0 fail** (314 baseline + 74
new); `typecheck`/`lint` clean; message keys **678 / 678 / 678** (606
baseline + 72 new).

**A real bug found and fixed during this pass**: `OwnedCountInput`'s +/-
buttons computed the next value from a React prop that could be stale within
a single batched render (two rapid `.click()` calls landing in the same
React batch both read the same pre-click value). Found by an automated
rapid-click test, fixed by reading the live store value at click time
instead, re-verified with the exact failing scenario. A second, smaller gap
— one checkbox (raid plan custom items) with no `<label>` wrapper, unlike
every other checkbox in this phase, giving it only its native ~16 px hit
area — was also found by the same 320/390/768/1280 px sweep this project's
QA standard requires and fixed to a measured 44×44 px.

**Not verified live**: a raid plan at or near its 100-per-mode cap, or with
many (5+) included quests and 10+ objectives simultaneously, at 320 px
(tested with 1 quest/1 objective; covered structurally by
`tests/quest-reducers.test.ts`'s cap tests, but not screenshotted dense at
mobile width); a genuine `localStorage` quota-exceeded write for this new
state specifically (Phase 2's pre-existing gap, still open, covered by
injected-`StorageLike` unit tests); `next dev` hydration warnings (port 3000
was held by an unrelated process outside this session's authorization to
stop).

### Phase 4 — Unified search

- [x] Items, ammo, armor, quests, crafts, gunsmith and maps are all searchable
      (5803 documents across 7 domains; traders intentionally not a domain)
- [x] Every result deep-links to an existing route (`?q=`, task slug, station /
      gunsmith / map anchors)
- [x] Recent searches persist (V3 `recentSearches`, max 10, clear/remove APIs)
- [x] Typing is never blocked by index work — index is server-side; query avg
      ~21–30 ms / p95 < 40 ms (recorded in `artifacts/phase4-search-perf.json`)
- [x] ko / zh / en message parity (722 keys at Phase 4 close; later Phase 5
      raised to 806); English-name matching covered by scoring tests
- [x] Results are deduplicated across domains; per-domain 5 / total 30 caps
- [x] Arrow keys, Enter, Escape, focus trap/restore implemented in `SearchDialog`
- [x] Mobile dialog uses `100dvh` + VisualViewport sync (Phase 5 leftover fix);
      sticky input; 44px targets
- [x] Index build cost measured (~562 ms cold, 15 min in-memory TTL; gzip ~352 KB)
- [x] `/search` is `noindex,follow`, absent from sitemap; shared First Load JS
      remains 103 kB; search UI is dynamically imported from the header
- [x] Cross-tab recent searches: store `storage` → `applyExternalStorageChange`
      → `useLocalState` (same contract as other local-state fields)

### Phase 5 — Watchlist + beginner mode

- [x] Watchlist persists; PvP and PvE entries never merge (V4 per-mode lists)
- [x] Every price shows its data timestamp when available (`updated` / baseline)
- [x] A missing price explains why; no invented zero delta
- [x] A baseline is never compared against a different price type
- [x] Beginner mode only filters existing data — no invented tiers
- [x] Criteria/reasons always shown; unsupported questions stated explicitly
- [x] Question flow usable at 390 px (card list + forms)
- [x] Phase 4 mobile keyboard occlusion fixed before Phase 5 completion

### Phase 6 — Craft calculator + budget

- [x] All calculations are pure functions in `src/lib/`, covered by tests
- [x] Missing price and zero are distinguishable in every output
- [x] Incomplete-but-computable results are labelled partial and name what is missing
- [x] Duplicate item quantities aggregate correctly (budget lines / owned purchase qty)
- [x] Owned materials are excluded from purchase cost; opportunity cost is a user choice
- [x] Returned tools are separated from consumed inputs (`attributes.tool === true` only)
- [x] Rounding happens only at display
- [x] Presets save and reload (local V5, per mode)
- [x] Editable at 390 px (verified against `next start`)
- [x] Defaults reproduce the pre-Phase-6 craft ranking when fuel=none, fee=none, best-value, cash-only, no owned counts
- [ ] Real-device soft keyboard + dual-tab UI click-through for Phase 5 leftovers remain partially unverified (simulated VisualViewport / storage contract tested)

### Phase 7 — Patch impact

- [x] No duplication with the existing news card (impact block inside SituationCard/FeedRow)
- [x] Impact-area filters work (`?area=` + chip row)
- [x] PvP / PvE scoping maps from structured `gameModes` only (`regular`/`pve`/`both`/`unknown`; Arena alone stays unknown)
- [x] Unconfirmed impact stays `unknown`
- [x] The "not yet reflected in site data" indicator is a real `sourceUpdatedAt` vs effective-time comparison (never `fetchedAt` alone); news page defaults to `unknown` without stamps
- [x] ko / zh / en complete (`patchImpact`, 990 leaf keys)
- [ ] Real-device soft keyboard + full dual-tab UI click-through remain unverified

### Phase 8 — PWA and offline

- [x] Installable manifest (`src/app/manifest.ts`, real 192/512 icons, `start_url: /ko`)
- [x] Offline / degraded state stated (`ConnectivityProvider` + banner)
- [x] Cached API delivery marked (`X-TarkovDex-From-SW-Cache` / `Cached-At` + `CachedDataNotice`); never labelled as live price alone
- [x] Quest/local edits remain localStorage (schemaVersion 5); SW does not store progress
- [x] Network-first APIs; reconnect uses normal fetch (no offline mutation queue)
- [x] Waiting SW + explicit apply; no install-time `skipWaiting`; old `tarkovdex-*` caches cleaned on activate
- [x] Mutations / external origins / admin / cron / errors not cached (policy tests)
- [x] Locale fallback catalog in `/offline.html` (ko/en/zh)
- [x] Kill switch documented (`NEXT_PUBLIC_PWA_ENABLED`, `docs/operations/tarkovdex-pwa.md`)
- [ ] Real-device soft keyboard + full dual-tab UI click-through remain unverified
- [ ] Full Chrome/Safari install-prompt + offline tour against production alias (ops checklist)

---

## E. Design consistency (Phase 9)

Phase 9 prioritized defect fixes over a full visual unification pass. Shared
status/empty/error components from Phase 1 remain the vocabulary; no new
accent/weight/emoji regressions found in the Phase 9 suite.

- [x] Gunsmith 320px overflow fixed (badge in flex-wrap text column) — measured overflow 0
- [x] Ammo/armor filter checkboxes use ≥44×44 hit wrappers (`size-touch`)
- [ ] Page titles and descriptions follow one pattern (not re-audited end-to-end)
- [ ] Search fields, filters and sorts look and behave identically across pages
- [ ] Status badges are one component, one vocabulary
- [ ] Card spacing, table headers, button and icon sizes are uniform
- [ ] Empty, error, loading and stale states are the shared components everywhere
- [ ] Numbers are tabular-aligned; dates use the `lib/format.ts` helpers only
- [ ] Data-source attribution appears in one consistent place
- [x] Design system rules hold on touched surfaces: dark gray `#17181b`, amber only, no gradients/glow/emoji, weights 400/500

---

## F. Mobile (Phase 9)

Verified selectively against `next start` (primarily **320px** on gunsmith/ammo;
home overflow 0 at current viewport). Full 8-width matrix not fully automated.

- [x] Gunsmith / ammo / home: zero page-level horizontal overflow at **320px**
- [ ] Full matrix 360 / 390 / 430 / 768 / 1024 / 1280 / 1440 on every major route
- [ ] No clipped text (spot-checked only)
- [x] Ammo/armor checkbox wrappers meet 44px floor
- [ ] Sticky header does not collide with content or anchors
- [ ] Dropdowns and popovers stay inside the viewport
- [ ] Modals scroll internally, not the page behind them
- [ ] Wide tables scroll inside their own container, never the page
- [ ] Long numbers and long translated strings do not break layout (English is the longest for nav, Korean for body)
- [ ] Layout survives the on-screen keyboard being open (**미검증**)
- [ ] Safe-area insets respected

---

## Phase 9 gate summary (2026-08-03)

| Area | Verdict |
| --- | --- |
| Static (test/typecheck/lint/build/i18n/bundle) | Pass — 495 tests, 1021 keys, 103 kB shared |
| Known UI defects (gunsmith overflow, touch) | Pass |
| SEO noindex personal tools + local-data | Pass |
| PWA update + kill switch drills | Pass (local `next start`) |
| Offline home | Pass |
| Dual-tab UI / install prompt / iOS / soft keyboard | Dual-tab **pass** on localhost real tabs (RC freeze); install/iOS/keyboard still 미검증 |
| **Overall** | Phase 9 **조건부 완료** → RC **조건부 릴리스 준비** (`artifacts/release-candidate-qa-report.md`) |

Production deploy was **not** performed in Phase 9.

## G. Accessibility (Phase 9)

- [ ] Every interactive element is keyboard reachable
- [ ] Visible focus on every focusable element, using the accent ring (never the browser default blue — it violates the one-accent rule)
- [ ] Every button has an accessible name
- [ ] Every input has a label
- [ ] Error messages are programmatically associated with their field
- [ ] No state is conveyed by color alone (status must also carry text or an icon)
- [ ] Heading hierarchy is valid on every page (exactly one `h1`, no skipped levels)
- [ ] Dialogs trap focus, close on Escape, and restore focus to the trigger
- [ ] Status changes are announced (`role="status"` / `aria-live` where appropriate)
- [ ] `prefers-reduced-motion` respected
- [ ] Text contrast ≥ 4.5:1, measured — including any text over imagery

---

## H. Performance (Phase 9)

- [ ] Shared first-load JS ≤ 103 kB, or the increase is justified and recorded here
- [ ] No route's first-load JS grows more than 20 % without a recorded reason
- [ ] No duplicate network request for the same data within one render
- [ ] No component is `'use client'` without needing to be
- [ ] Expensive computations are memoized on their real inputs
- [ ] Search index build cost measured and bounded
- [ ] No image layout shift
- [ ] List virtualization decided by measurement, not assumption
- [ ] `x-nextjs-cache: HIT` confirmed on the static data routes
- [ ] Slow-upstream fallback verified (stale-on-error path exercised)

---

## I. Rendering correctness (Phase 9)

- [ ] Zero hydration warnings on every route × locale
- [ ] Zero console errors
- [ ] Zero unhandled promise rejections
- [ ] No infinite re-render loops
- [ ] Locale switching preserves user state
- [ ] PvP/PvE switching never leaves mixed state behind
- [ ] Filters restore after reload where they are URL-backed
- [ ] Browser back restores the expected view

---

## J. Final gate

- [ ] `npm run typecheck` — no errors
- [ ] `npm run lint` — no errors
- [ ] `npm test` — all pass, count ≥ 174
- [ ] `npm run build` — exit 0
- [ ] Zero console errors in the browser
- [ ] Zero hydration errors
- [ ] Zero horizontal overflow at 320 px
- [ ] ko / zh / en key counts identical, zero missing translations
- [ ] Zero PvP/PvE mixing
- [ ] Zero stale-as-fresh misrepresentation
- [ ] User state survives reload
- [ ] Export / import works
- [ ] PWA works
- [ ] Every route from section A still resolves — no broken bookmark, no broken sitemap URL
- [ ] No regression in home, news, flea market, barters, quests, gunsmith, ammo, armor, maps

---

## K. Route regression list

Every one of these must return 200 with correct content at the final gate, for
each of `ko` / `zh` / `en`:

```
/{locale}
/{locale}/news
/{locale}/economy/items
/{locale}/economy/barters
/{locale}/progression/tasks
/{locale}/progression/tasks/{any-existing-slug}
/{locale}/progression/gunsmith
/{locale}/combat/ammo
/{locale}/combat/armor
/{locale}/maps
/{locale}/status
/{locale}/local-data
/{locale}/progression/tasks/tracker
/{locale}/about
/{locale}/support
```

And these must keep redirecting (308):

```
/{locale}/items      -> /{locale}/economy/items
/{locale}/tasks      -> /{locale}/progression/tasks
/{locale}/economy    -> /{locale}/economy/items
/{locale}/progression-> /{locale}/progression/tasks
/{locale}/combat     -> /{locale}/combat/ammo
```

Plus `/robots.txt`, `/sitemap.xml`, `/api/items`, `/api/tasks`, and
`/api/cron/tarkov-live` returning 401 without a valid bearer token.
