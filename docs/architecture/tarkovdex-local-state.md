# TarkovDex local user state

Audited **2026-08-03**, implemented the same day (Phase 2 —
`PHASE_2_LOCAL_USER_STATE`). §1–§3 below are the pre-implementation design;
§5 records what was actually built, where it differs from the design, and why.

---

## 1. What persists today

**One key. That is the entire persistent user state on this site.**

| Key | Owner | Value | Persistence |
| --- | --- | --- | --- |
| `tarkovdex:gameMode` | `src/contexts/GameModeContext.tsx` | `'regular'` \| `'pve'` | `localStorage` |

```ts
// GameModeContext.tsx — the whole of it
useEffect(() => {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'regular' || stored === 'pve') setGameModeState(stored);
}, []);

function setGameMode(mode: GameMode) {
  setGameModeState(mode);
  window.localStorage.setItem(STORAGE_KEY, mode);
}
```

What it does right: SSR-safe (read in an effect, never in the `useState`
initializer, so the first render is deterministically `'regular'` on both sides),
and the literal comparison rejects a corrupted value by falling through to the
default.

What it lacks: no schema version, no namespace beyond the key prefix, no
cross-tab sync, no quota-failure handling (`setItem` can throw in private mode or
at quota — it is unguarded), no reset, no export/import.

### Confirmed absent

Verified by grep across `src/`:

- `sessionStorage` — **not used anywhere**
- `document.cookie` — **not used anywhere** (the admin session cookie is set
  server-side, HttpOnly, and is not user state)
- IndexedDB — not used
- Any account system, any auth for public pages — none
- Any server-side per-user storage — none. The Postgres database holds only
  Tarkov Live editorial content, never user data

---

## 2. What is ephemeral (lost on reload)

| Component | State | Survives reload? |
| --- | --- | --- |
| `ItemsExplorer` | query, category, sale, sort, direction, fee rate, page | **URL only** (`history.replaceState`) |
| `AmmoChart` | query, caliber, sort, tracer-only, pinned rounds, limit | **URL only** (`history.replaceState`) |
| `ArmorExplorer` | query, armor class, body area, replaceable, limit | no |
| `TasksExplorer` | search, trader, map, focused task, page | no |
| `EconomyExplorer` | expanded stations, active station | no |
| `GunsmithExplorer` | selected quest | no |
| `LiveBoard` | filter, twitter limit, open cards, viewer timezone | no |
| `TaskCard` | expanded | no |
| `Header` | menu open | no (correct) |

Two pages mirror to the URL and five do not. That inconsistency is itself a
finding: a user who shares an `/economy/items` link shares their filters, but a
user who shares `/combat/armor` does not.

**Design note for Phase 2**: URL state and persisted state answer different
questions. URL = "this exact view, shareable". localStorage = "how I like this
page, personally". They are not substitutes and the existing `history.replaceState`
behaviour must not be replaced by persistence — the two should coexist, with the
URL winning on first load when present.

---

## 3. Target design (Phase 2 — not implemented)

### 3.1 One namespace, one version, one module

```
localStorage["tarkovdex:v1"]  →  JSON, the whole TarkovDexLocalState
```

A single key, not one per feature. The brief is explicit about this and the
reason is migration: N keys means N migration paths and N ways to end up
half-migrated.

```ts
export const STORAGE_KEY = 'tarkovdex:v1';
export const SCHEMA_VERSION = 1;

export interface TarkovDexLocalState {
  schemaVersion: number;

  /** Migrated in from `tarkovdex:gameMode`. Values stay 'regular' | 'pve' to
   *  match types/tarkov.ts GameMode — NOT the brief's 'pvp' | 'pve', because
   *  renaming it would require touching every existing consumer for no gain. */
  gameMode: GameMode;

  /** Per-mode, because quest availability genuinely differs (27 regular-only,
   *  23 PvE-only quests — see lib/task-availability.ts). One flat list would
   *  silently mix them. */
  quests: Record<GameMode, {
    completedIds: string[];
    activeIds: string[];
  }>;

  /** itemId → count. Item ids, never names: names collide across locales and
   *  across distinct items. */
  ownedItemCounts: Record<string, number>;

  watchlist: WatchlistEntry[];
  recentSearches: RecentSearchEntry[];
  raidPlans: RaidPlan[];

  craftPreferences: CraftPreferences;
  budgetPreferences: BudgetPreferences;
  beginnerMode: boolean;
}
```

`WatchlistEntry` follows the brief's shape verbatim (it already carries
`gameMode`, so the watchlist is a flat list rather than a per-mode record).

### 3.2 Hard rules

1. **Internal ids only, never localized display strings.** A quest saved in
   Korean must still be recognised after switching to English. Quest ids are
   ObjectIds; item ids are catalog ids; both are locale-invariant and both are
   already the routing key (`lib/task-slug.ts` parses the trailing ObjectId).
2. **PvP and PvE quest progress are separate.** Non-negotiable: the two quest
   sets are genuinely different data.
3. **SSR-safe by construction.** The read happens in an effect. The server
   render is always the defaults. Anything that must not flash needs a mounted
   flag, the pattern `InGameClock` and `LiveBoard` already use.
4. **Validation on read, not trust.** `localStorage` is user-writable and
   survives a downgrade. Every field is validated; a field that fails validation
   is replaced with its default and the rest is kept. A whole-document parse
   failure keeps a backup at `tarkovdex:v1:corrupt` and starts fresh, so a
   report is diagnosable.
5. **Writes cannot throw into the UI.** Quota exceeded / private browsing must
   degrade to in-memory state plus a one-time notice, not a crash.
6. **Cross-tab sync via the `storage` event.** Same-tab writes do not fire it, so
   the provider updates its own React state directly and the listener only
   handles other tabs.
7. **Migration is forward-only and additive.** `migrate(raw)` takes any
   `schemaVersion <= SCHEMA_VERSION` to current. A *higher* version (user
   downgraded) is not parsed — the state is left untouched on disk and the
   session runs on defaults, because destroying a newer document is worse than
   ignoring it.
8. **Legacy adoption**: on first run of v1, if `tarkovdex:gameMode` exists, its
   value seeds `gameMode` and the old key is removed.

### 3.3 Export / import

- Export: `{ schemaVersion, exportedAt, state }` as a downloaded JSON file.
- Import: parsed → version-checked → **fully validated** → applied atomically.
  A malformed or higher-version file is **rejected with a reason**, never
  partially applied. This is a trust boundary (the user may paste a file from
  anywhere) and is one of the places the ponytail "don't simplify away input
  validation" rule applies.

### 3.4 Module shape

```
src/lib/local-state/
  schema.ts      # types, defaults, SCHEMA_VERSION
  validate.ts    # pure: unknown -> TarkovDexLocalState (never throws)
  migrate.ts     # pure: versioned upgrades + legacy gameMode adoption
  storage.ts     # the only module that touches window.localStorage
  index.ts       # LocalStateProvider + useLocalState / useLocalStateSlice
```

`validate.ts` and `migrate.ts` are pure and are what the tests target — they need
no DOM, so they fit the existing `node:test` + `tsx` runner with no new
dependency. `storage.ts` is thin enough to be exercised through a tiny in-memory
`Storage` stub.

**No new dependency.** No zod, no immer, no jotai/zustand. React Context plus
hand-written validators is the smallest thing that satisfies every requirement
above, and the project already uses exactly that pattern for `GameModeContext`.

### 3.5 Relationship to `GameModeContext`

`GameModeProvider` becomes a thin adapter over the new layer rather than being
deleted: `useGameMode()` is called from a dozen components and its signature
must not change. That keeps Phase 2 a storage change, not a refactor of every
mode-aware component.

---

## 4. Test plan for the storage layer

Pure, no DOM, runs in the existing `npm test`:

- defaults are returned for `null`, `''`, `'{'`, `'[]'`, `'"str"'`, `'{"a":1}'`
- a valid v1 document round-trips unchanged
- an unknown top-level field is dropped, known fields survive
- one corrupt field (e.g. `completedIds: "abc"`) resets that field only
- `schemaVersion: 0` / missing version migrates
- `schemaVersion: 99` is refused and leaves the stored value alone
- legacy `tarkovdex:gameMode` seeds v1 and is then removed
- PvP and PvE quest lists never merge
- `ownedItemCounts` rejects negative, non-integer and non-finite values
- import rejects a higher-version payload with a stated reason and applies nothing
- export → import is an identity round-trip
- a throwing `setItem` does not propagate

---

## 5. As built (2026-08-03)

### 5.1 Final schema — narrower than §3.1's design

```ts
export const STORAGE_KEY = 'tarkovdex:v1';
export const SCHEMA_VERSION = 1;

export interface LocalState {
  schemaVersion: 1;
  preferences: { gameMode: GameMode };   // 'regular' | 'pve', unchanged from types/tarkov.ts
  metadata: { createdAt: string; updatedAt: string };  // ISO-8601
}
```

**`beginnerMode`, `quests`, `ownedItemCounts`, `watchlist`, `recentSearches`,
`raidPlans`, `craftPreferences`, `budgetPreferences` — none of these shipped.**
Every one of them is a Phase 3+ feature with no locked field shape yet; adding
them now would have meant inventing a schema for a UI that doesn't exist and
migrating it later regardless. `beginnerMode` specifically was in an earlier
draft of this design but was cut: nothing in the app reads or writes it, the
roadmap's own Phase 5 entry describes it only as "a filter preset" with no
field contract, and Phase 2's own exclusion list rules out the beginner-mode
UI. A field with no reader and no locked shape is exactly what §3.2's "don't
invent future fields" rule warns against, so V1 stores only what Phase 2
itself needed to demonstrate: the one preference that already existed
(`gameMode`), migrated in from the legacy key, plus the `metadata` timestamps
Phase 2's own export/reset/tab-sync features need. See §5.9 for exactly how a
future phase adds a field.

### 5.2 Module layout — 7 files, `defaults` folded into `schema`

```
src/lib/local-state/
  schema.ts          # types, SCHEMA_VERSION, STORAGE_KEY, createDefaultState, SERVER_DEFAULT_STATE
  validate.ts         # isValidLocalState (strict) + recoverLocalState (lenient, per-field)
  migrate.ts          # loadLocalState() — pure orchestration: parse, version-check, recover, legacy-adopt
  storage.ts           # the only module touching window.localStorage; injectable StorageLike
  store.ts             # the module-singleton: cachedState, listeners, hydrateLocalState(), writes
  use-local-state.ts   # useSyncExternalStore wrapper — split out of store.ts, see §5.4
  export-import.ts     # exportLocalState, serializeExport, exportFilename, validateImport
  index.ts             # public barrel — Phase 3+ imports from here, not the individual files
```

`defaults.ts` was folded into `schema.ts` — with three fields there was no
separate module's worth of logic (`createDefaultState()` is nine lines).

### 5.3 Existing gameMode flow — fully investigated before any code changed

Confirmed by reading the code, not just grep:

- **Sole reader/writer**: `src/contexts/GameModeContext.tsx`, key
  `tarkovdex:gameMode`, values `'regular' | 'pve'`. Grepping `localStorage`
  across `src/` found no other call site.
- **11 consumers**, all destructuring `useGameMode()` as `{ gameMode }` or
  `{ gameMode, setGameMode }` — every one listed in
  `tests/game-mode-regression.test.ts` and asserted unchanged.
- **URL never owned game mode.** No `?mode=` param, no route segment — grep
  confirmed this. The brief's suggested priority chain (URL → local state →
  legacy key → default) does not apply here because the first link doesn't
  exist; the real chain implemented is **local state → legacy key → default**.
- **SSR safety**: already correct (`useState('regular')` then an effect-only
  read) — this pattern was kept, not replaced, when the storage layer moved
  underneath it.
- **Absent**: cross-tab sync, quota-failure handling (`setItem` was
  unguarded), reset, export/import — exactly Phase 2's scope.

### 5.4 Splitting the React hook out of `store.ts`

`store.ts` originally imported `useSyncExternalStore` from `react` directly.
`npm test` runs as `tsx --conditions react-server --test ...`, and React's
`react-server` export condition does not include client-only hooks — every
test importing `store.ts` failed to even load the module. The hook moved to
its own `use-local-state.ts`; `store.ts` now has zero React import and is
fully testable under the same condition the rest of the suite uses. This is
the same reason Phase 1 kept `StatusUI.tsx` (JSX) separate from
`data-status.ts` (pure) — found by running the tests, not anticipated in
advance.

### 5.5 Validation policy actually implemented

Two strictness levels, not one:

- **`recoverLocalState()`** — lenient, per-field, used only for the initial
  disk read. A bad `preferences.gameMode` resets just that field; the rest of
  the document (and hence `metadata`) survives. A non-object top level, or a
  JSON parse failure, or a document over `MAX_STORED_BYTES` (200 KB) is
  treated as fully corrupt — backed up to `tarkovdex:v1:corrupt` and replaced
  with defaults.
- **`isValidLocalState()`** — strict, whole-document pass/fail, used for
  cross-tab `storage` events and for file import. Neither case is trusted the
  way "my own disk" is: a stranger's write (or another tab's corrupted one)
  earns accept-or-reject, never a patched version.

`hasDangerousKeys()` rejects `__proto__`/`constructor`/`prototype` as literal
JSON keys at every object level. For this flat, fully-enumerated schema (every
field checked by name, every object's key count checked exactly) the guard is
provably redundant today — a smuggled key either pushes an object's key count
over its expected exact value (rejected) or replaces a real field (whose
absence then fails its own check) — but it is kept as defense-in-depth for
when Phase 3 adds a `Record<string, ...>` map (e.g. `ownedItemCounts`), where
key names stop being a fixed, enumerable set and the guard stops being
redundant. `tests/local-state-schema.test.ts` covers both the top-level and a
nested case via `JSON.parse` (not object-literal syntax, which sets the real
prototype rather than an own key and doesn't represent what a corrupted
`localStorage` string could ever contain).

### 5.6 Legacy `tarkovdex:gameMode` migration — the exact chosen policy

Per §3.2 rule 8's letter, but with the verify-then-delete step actually
implemented:

1. Read `tarkovdex:v1`. A valid-or-recoverable document existing at all means
   the legacy key is **not** consulted — a real (if imperfect) new-format
   document always wins.
2. Only when there is no usable new document is `tarkovdex:gameMode` read and
   narrowed to `'regular' | 'pve' | null`.
3. The migrated document is written to `tarkovdex:v1`.
4. Only if that write **succeeds** and a fresh read-back of `tarkovdex:v1`
   **validates** and **matches** the adopted `gameMode` is the legacy key
   removed. If the write fails (quota, blocked storage), the legacy key is
   left in place — verified live by a throwing-`setItem` test
   (`tests/local-state-store.test.ts`, "if persisting the migrated document
   fails, the legacy key is kept, not deleted") and by a real
   `next start` run (§5.10).

A **newer** `schemaVersion` on disk is refused outright: the returned state is
defaults for this session only, nothing is read from or written to
`tarkovdex:v1`, and the legacy key is not touched either — an unreadable
future document is not "no state".

### 5.7 SSR / hydration — one real bug found and fixed

`useLocalState()`'s `getServerSnapshot()` returns a fixed constant
(`SERVER_DEFAULT_STATE`, epoch timestamps, `gameMode: 'regular'`) that never
reads the clock; the store's `cachedState` starts as that same reference, so
the server render and the first client render are provably identical before
`hydrateLocalState()` (called once, from `GameModeProvider`'s `useEffect`) has
a chance to run.

**Found during browser verification, not by static reasoning alone**:
`LocalDataPanel` originally read `useState(isStorageAvailable)` — a lazy
initializer that calls `isStorageAvailable()` during render. That function
correctly returns `false` under SSR (no `window`) and `true` in a real
browser, which means the *initializer itself* differs by environment — a
textbook hydration mismatch. `next start`'s production console showed nothing
(React strips detailed hydration warnings outside development), so this was
caught by diffing the raw server HTTP response (with `<script>` tags stripped,
since the false positive was the string appearing in next-intl's embedded
message catalog, not in rendered DOM) against the post-hydration DOM, exactly
the kind of check `docs/qa/tarkovdex-product-acceptance.md`'s "measured, not
eyeballed" standard asks for. Fixed the same way every other SSR-sensitive
component in this app already does it: default to the common case
(`useState(true)`) on both server and first client render, correct it in a
`useEffect` after mount. Re-verified: the string no longer appears anywhere
outside a `<script>` tag in the server response.

### 5.8 Cross-tab sync — verified live, not just unit-tested

`hydrateLocalState()` attaches exactly one `window.addEventListener('storage',
...)`, guarded by the same idempotency flag that gates the rest of hydration.
The listener strictly validates (`isValidLocalState`, not the lenient
recovery) before adopting an external write, ignores every other storage key
(including the legacy one), and resets to defaults on an external key
removal (`event.newValue === null`).

Verified with two real tabs against the same `next start` server: switching
tab 2 to PvP, with tab 1 already open on a different route and never
reloaded, updated tab 1's header segmented control and its `localStorage`
read within the poll interval used to check it — a genuine cross-tab
propagation, not a same-tab optimistic update.

### 5.9 Extending the schema in a future phase

1. Bump `SCHEMA_VERSION` in `schema.ts`; add the field to `LocalState`.
2. Extend `isValidLocalState()` (strict) and `recoverLocalState()` (lenient
   default-fill) for the new field.
3. Add a real migration branch in `migrate.ts`'s `loadLocalState()` for "a
   `schemaVersion: N-1` document is missing this field" — even a one-line
   default-fill must be its own tested branch, not folded silently into
   recovery, so the upgrade path from every prior version stays auditable.
4. Add the new field to `export-import.ts`'s envelope handling if it needs
   special import semantics (arrays with size limits, `Record` maps needing
   the dangerous-key guard applied per-entry, etc.).
5. A payload with a **higher** `schemaVersion` than the running build
   understands must still be refused exactly as today — never partially
   parsed, never overwritten on disk.

### 5.10 Verified

`npm test`: **314 pass / 0 fail** (234 Phase-1 baseline + 80 new, zero
regressions). `npm run typecheck` and `npm run lint` clean. Message keys
**606 / 606 / 606**, identical across ko/en/zh (561 baseline + 45 new under a
dedicated `localData` namespace, not folded into `status`).

Live `next start` browser verification (two real tabs, three locales):
selecting PvP/PvE persists and survives navigation to a different route and a
locale switch (`/ko` → `/en`, same key, no per-locale storage); a simulated
legacy visitor (`tarkovdex:gameMode = 'pve'`, no `tarkovdex:v1`) migrated
correctly and the legacy key was removed only after the new document was
confirmed on disk; a live cross-tab update propagated to an already-open,
non-reloaded tab; export produced a real downloadable file (captured via a
`URL.createObjectURL` override) with the exact stated filename pattern and a
valid envelope; import previewed the file's content before replacing
anything, correctly rejected invalid JSON / wrong shape / an internally
invalid state / a future `schemaVersion` with the exact distinct translated
reason for each and no change to stored data; reset required a second
explicit confirm click, was cancellable without effect, and returned to
defaults. Zero console errors, zero horizontal overflow at 320/390/768/1280 px
on `/local-data` and `/status` in all three locales; every real interactive
control (not the visually-hidden file `<input>` itself, whose accessible
`<label>` is the actual 44 px target) measured exactly 44 px.

**Not verified live**: `localStorage` fully blocked (private-mode-style) and a
genuine quota-exceeded write — this browser profile has neither condition
reachable from here. Both are covered instead by
`tests/local-state-store.test.ts`'s injected `StorageLike` stubs (a
`setItem` that always throws a `QuotaExceededError`/`SecurityError`), which
exercise the exact same `storage.ts`/`store.ts` code the browser would run.

---

## 6. Phase 3 — V2 (quest tracking + raid plans), as built (2026-08-03)

### 6.1 Final V2 schema

```ts
export const SCHEMA_VERSION = 2;

interface LocalState {
  schemaVersion: 2;
  preferences: { gameMode: GameMode };            // unchanged from V1
  modeData: { regular: ModeState; pve: ModeState };
  metadata: { createdAt: string; updatedAt: string }; // unchanged from V1
}

interface ModeState {
  quests: {
    activeQuestIds: string[];
    completedQuestIds: string[];
    ownedItemCounts: Record<string, number>;      // itemId -> count
  };
  raidPlans: RaidPlanEntry[];
}

interface RaidPlanEntry {
  id: string;
  name: string;
  mapId: string | null;                            // null is a valid state
  activeQuestIds: string[];                         // this plan's quest subset
  checkedObjectiveKeys: string[];                   // "taskId:objectiveId" — see §6.2
  customItems: RaidPlanCustomItem[];
  notes: string;
  createdAt: string;
  updatedAt: string;
}

interface RaidPlanCustomItem {
  id: string; label: string; quantity: number; checked: boolean;
}
```

**Not built**: the brief's draft schema (§3 of the original design brief)
included `craftPreferences`/`budgetPreferences` on `ModeState` — dropped for
the same reason `beginnerMode` was dropped from V1: no feature reads or
writes them yet (Phase 6 owns that), and a field with no reader is exactly
the "invented future field" §3.2's own rule warns against.

**Caps** (`schema.ts`): `activeQuestIds` 1000, `completedQuestIds` 2000,
`ownedItemCounts` 5000 keys (value 0–999,999), `raidPlans` 100 per mode, plan
name 100 chars, notes 5000 chars, `customItems` 200 per plan, custom item
label 100 chars, a plan's own `activeQuestIds` 200, `checkedObjectiveKeys`
2000. `MAX_STORED_BYTES`/`MAX_IMPORT_BYTES` raised from V1's 200 KB / 1 MB to
5 MB each — a pathological-input backstop, not an expected size; real usage
stays far below it via the per-field caps above.

### 6.2 Why `checkedObjectiveKeys` is `"taskId:objectiveId"`, not a bare objective id

**Live audit finding** (not a hypothetical): objective ids are **not globally
unique**. Four objective ids in the audited dataset are each reused,
byte-identical, by three unrelated quests. A bare objective id in
`checkedObjectiveKeys` would mean checking one quest's step off in a raid
plan also silently marks an unrelated quest's identically-defined step
checked. Every checklist/aggregation key in this phase (`RequiredItemLine`'s
internal grouping, `checkedObjectiveKeys`, `SkippedObjective`) is scoped by
`(taskId, objectiveId)`, never the objective id alone. Regression-tested in
`tests/quest-reducers.test.ts` ("uses the composite key, not a bare objective
id") and `tests/quest-requirements.test.ts` ("duplicate objective ids across
two different tasks... both contribute").

### 6.3 V1 → V2 migration

1. `gameMode` and **both** metadata timestamps (`createdAt` and `updatedAt`)
   survive untouched. **Decided policy**: a schema upgrade is not a user
   action, so `updatedAt` is not bumped to "now" — bumping it would make a
   silent background migration look like the player just changed something.
2. `modeData.regular`/`modeData.pve` are created as safe, empty `ModeState`s
   — nothing in a V1 document could populate them.
3. The legacy `tarkovdex:gameMode` key path is unchanged: it still only
   applies when there is no usable `tarkovdex:v1` document at all (V1 *or*
   V2) — a stored V1 document is migrated in place, legacy is never
   consulted once any real document exists.
4. Migration is idempotent: running it twice (or loading its own V2 output)
   produces byte-identical state — `tests/local-state-v2-migration.test.ts`.
5. A **future** `schemaVersion` (3+) is still refused exactly as V1 refused
   2+: defaults in memory only, nothing read from or written to disk.
6. A corrupted V1 document goes through the same lenient, per-field recovery
   V1 always had (renamed `recoverLocalStateV1`, kept verbatim) before being
   upgraded — a bad `preferences.gameMode` in an old V1 file still recovers
   to `'regular'` rather than discarding the whole document.
7. Import accepts **both** a V1 (`schemaVersion: 1`) and current V2 export
   file. A V1 file is validated strictly as V1 (`isValidLocalStateV1`, kept
   as a permanent, separate strict validator — never reused for new writes)
   and only *then* upgraded; a malformed V1 state inside a correctly-versioned
   envelope is still rejected outright, never partially applied.
   `exportLocalState()` only ever produces V2 — nothing in the app can write
   a V1 file anymore.

### 6.4 Local-state public API additions

All new surface lives in `@/lib/local-state`'s barrel, backed by pure
reducers in `quest-reducers.ts` (never called directly by components — only
`store.ts` calls them, wrapping each in the same commit-if-changed,
notify-and-persist path `updatePreferences` already used):

```
getQuestProgress(mode) / getRaidPlans(mode) / getModeState(mode)
setQuestActive(mode, questId, active) / setQuestCompleted(mode, questId, completed)
bulkSetQuestStatus(mode, updates) / setOwnedItemCount(mode, itemId, count)
resetQuestProgress(mode)
createRaidPlan(mode, input) / updateRaidPlan(mode, planId, updater)
deleteRaidPlan(mode, planId) / duplicateRaidPlan(mode, planId, suffix)
addCustomItem / updateCustomItem / removeCustomItem / toggleObjectiveChecked
```

Guarantees, each with a passing test in `tests/quest-reducers.test.ts`:

- **Id normalization**: every id array is trimmed, deduped (first-seen kept),
  and capped on every write, not just on load.
- **Same-value writes are true no-ops**: a reducer returns the *same object
  reference* when nothing actually changed (setting `active: true` on an
  already-active quest, renaming a plan to its current name), and `store.ts`'s
  `commit()` skips the persist+notify entirely when the reference is
  unchanged — no redundant `localStorage` write, no redundant subscriber
  notification.
- **`updatedAt` bumps only on a real change** — verified directly (rename to
  a different name bumps it; rename to the same name does not).
- **Mode isolation is structural, not just tested behavior**: a write to one
  mode returns the *other* mode's `ModeState` by the same object reference
  (`tests/quest-reducers.test.ts`, "proves no copy/mutation") — the untouched
  mode was never even shallow-copied, let alone written to.
- **Completing a quest removes it from `activeQuestIds`; un-completing does
  NOT restore it.** Decided policy (the brief's own recommended one): a
  correction ("I marked that done by mistake") should not silently resurrect
  the quest into every raid plan and item total that reads the active list.
  The player re-adds it explicitly.
- Every write still goes through the exact same Phase 2 commit path, so
  cross-tab sync, the memory-fallback-on-storage-failure contract, and
  import/export all cover this new state automatically — nothing new was
  built for those, which is the entire point of putting this state in the
  same document instead of a second store.

### 6.5 Quest data extended, not replaced

`TaskObjective` (`types/tarkov.ts`) gained two real, live-audited fields —
`items: string[] | null` and `foundInRaid: boolean | null` — mapped through
from `RawObjective` in `lib/tarkov.ts`, which already carried them upstream
but previously dropped both during mapping. Both are `null` for every
objective type where the raw data doesn't populate them (confirmed live:
`foundInRaid` is present on exactly the 559 item-bearing objectives and
absent on the other 908). No existing consumer (`TaskCard`, `TasksExplorer`,
`task-query.ts`) reads either field, so this was a strictly additive,
non-breaking change — see `docs/architecture/tarkovdex-data-flow.md`'s task
audit for the full live dataset findings this was built on.

### 6.6 What Phase 3 deliberately does not surface

Per the brief's own explicit exclusion list (§8), the following are **not**
shown as structured facts anywhere in the tracker or raid planner, even
though the live audit found upstream fields that partially cover some of
them (`neededKeys`/`requiredKeys`, `exitName`/`exitStatus`, `targetNames`,
`wearing`/`notWearing`, `timeFromHour`/`timeUntilHour`): required keys,
survival conditions, time-of-day windows, PMC/Scav targeting, specific exit
requirements, equipment restrictions. Two of these were found to have real
data-quality problems that independently justify the exclusion:
`exitStatus`'s value set included a literal untranslated dictionary-key
string (`"marathon Name"`) alongside the two real values, and objective ids
are reused across quests (§6.2), so a "survive" claim inferred from
`exitStatus` could not be trusted to apply to the quest it's attached to.
Where a raid plan includes an objective whose condition isn't structurally
supported, the UI states so explicitly (`questTracker.notAvailableInData`)
rather than omitting it silently.

### 6.7 Item-requirement aggregation — scope decided by the audit, not guessed

Only `giveItem`/`findItem`/`plantItem` objectives are aggregated as "items to
acquire" (`src/lib/quest-requirements.ts`). `sellItem` and `useItem` objectives
carry `items[]` too but were deliberately excluded: a `sellItem` objective in
the live dataset listed **3315** alternative item ids ("sell anything from
this category"), which is not a shopping list. `giveQuestItem`/
`findQuestItem`/`plantQuestItem` reference a `questItem` id that has **zero
overlap** with the item catalog (confirmed live, 0/106) and so cannot be
resolved to a name or icon at all — they render as checklist steps, never as
an aggregated item line.

When an objective lists alternatives (`items.length > 1` — 53/559 objectives
in the audited dataset, ~9.5%), `items[0]` is the representative id for
aggregation and `hasAlternatives` is set so the UI can say "or N more" —
never silently merged into a different item's total, and never hidden.
`foundInRaid` on an aggregated line is `true`/`false` only when every
contributing objective agrees, and `null` (never guessed) when they disagree
or none reported a value. A missing or non-positive `count`, or a missing
`items[]`, is recorded in `AggregationResult.skipped` and surfaced in the UI
— never assumed to be 1, never silently dropped without a trace.

### 6.8 Routing, metadata, and the noindex decision

New route `/[locale]/progression/tasks/tracker` — a fourth entry point
alongside `/local-data` and `/status`, linked from the quest list page (a
second `RELATED_LINK_CLASS` link, alongside the existing Gunsmith one) and
from the footer. Unlike `/local-data` (which always renders real metadata —
game mode, timestamps — even for a brand-new visitor) and `/status` (always
shows domain health), this page's entire content is a fresh visitor's own
*empty* local state until they use it. Marked `robots: { index: false,
follow: true }` for that reason alone — no auth, no `Disallow`, kept in the
normal sitemap-equivalent navigation surface, unlike `/admin/live` which is
genuinely gated. **Not added to `sitemap.ts`'s `ROUTES`**, matching the
existing `/admin/live` precedent for `noindex` pages.

### 6.9 A real bug found during browser verification: rapid-click stale closure

`OwnedCountInput`'s +/- buttons originally computed `onChange(value + 1)`
from the component's own `value` prop. Two `.click()` calls dispatched in the
same JS macrotask (found via an automated rapid-fire test, not by reasoning
about it in advance) land in the same React batch: both handlers read the
*same* pre-click `value`, so two "+1" clicks produced +1 total instead of +2.
Fixed by having the buttons call `onStep(delta)`, which the parent
implements by reading the **live store value** (`getQuestProgress(mode)`) at
the moment each click is handled, rather than trusting a prop that a
same-batch second click hasn't seen updated yet. Re-verified with the exact
failing scenario (three `.click()` calls, no `await` between them) landing
on the correct value afterward.

### 6.10 Verified

`npm test`: **388 pass / 0 fail** (314 Phase-2 baseline + 74 new). One
pre-existing regression test (`tests/regressions.test.ts`, "no FIR feature
references") had to be narrowed — it banned the literal identifier
`foundInRaid` project-wide, guarding against a specific abandoned prior
feature (a `progression/fir` route / `ProgressionChecklist` component,
neither of which exists in this codebase). Phase 3 legitimately reintroduces
`foundInRaid` as an audited, real upstream field under a different route and
component; the test was narrowed to keep guarding the actual old artifacts
(`progression/fir`, `ProgressionChecklist`) while no longer blocking the new,
correctly-scoped field. `typecheck`/`lint` clean. Message keys **678 / 678 /
678**, identical across ko/en/zh (606 baseline + 72 new, `questTracker`
namespace plus one `tasks.trackerLink` key).

Live `next start` verification (multiple real tabs, one shared origin):
activating/deactivating/completing quests from the existing quest list page
persists into the new V2 document and appears in the tracker; the item
aggregation renders real resolved item names/icons (via a new bounded
`/api/items?ids=` lookup, mirroring the existing `/api/tasks?ids=` addition)
with correct required/owned/missing math and a live-verified
alternative-items note; PvP and PvE tracker views are fully isolated
(switching modes shows the other mode's empty state, switching back restores
the original); a raid plan's map selection, quest inclusion, structured
objective checklist (composite-keyed), custom items, and debounced notes all
persisted correctly across a full page reload; a live cross-tab update (an
owned-count change in one tab) propagated to an already-open, non-reloaded
second tab; zero console errors and zero horizontal overflow at
320/390/768/1280 px across ko/en/zh on the tracker route; the one touch-target
gap found (a bare custom-item checkbox with no `<label>`, unlike the other
three checkbox usages in this phase) was found, fixed, and re-verified at a
measured 44×44 px hit area.

**Not verified live**: a genuine `localStorage` quota/blocked scenario for
the new quest-progress/raid-plan writes specifically (Phase 2's original
gap, still open — covered by the same injected-`StorageLike` unit tests);
`next dev`'s hydration warnings (port 3000 was occupied by an unrelated
process this session did not have authorization to stop); a raid plan at or
near its 100-per-mode cap in a live browser (covered by
`tests/quest-reducers.test.ts` instead); the 320px mobile layout with a
raid plan open showing 5+ included quests and 10+ objectives simultaneously
(tested with 1 quest/1 objective — the responsive grid/stacking rules are
identical to what was already measured elsewhere on this page, but the
specific dense case was not separately screenshotted).

## 7. Phase 4 — V3 (recent searches), as built (2026-08-03)

### 7.1 Final V3 schema

```ts
export const SCHEMA_VERSION = 3;

interface RecentSearchEntry {
  query: string;                 // locale text allowed
  normalizedQuery: string;
  selectedDomain?: SearchDomain;
  selectedId?: string;           // locale-invariant id
  searchedAt: string;            // ISO-8601
}

interface LocalState {
  schemaVersion: 3;
  preferences: { gameMode: GameMode };
  modeData: { regular: ModeState; pve: ModeState }; // unchanged from V2
  recentSearches: RecentSearchEntry[];              // shared across modes
  metadata: { createdAt: string; updatedAt: string };
}
```

Caps: max 10 entries, max query length 100, empty queries rejected, duplicates
collapsed by `normalizedQuery` with the newest first.

### 7.2 Migration

- V2 → V3: add `recentSearches: []`, preserve `modeData` and both timestamps
  (`updatedAt` is **not** bumped by the migration itself).
- V1 → V2 → V3: same chain; V1 still has no `modeData` to seed.
- Import accepts V1, V2, and V3 envelopes; export only produces V3.
- A future `schemaVersion >= 4` is still refused.

### 7.3 Store API

`recordRecentSearch`, `removeRecentSearch`, `clearRecentSearches` on the
local-state store. Search UI never reads `localStorage` directly.


## 8. Phase 5 — V4 watchlist + beginnerMode (2026-08-03)

### 8.1 Final V4 schema

```ts
export const SCHEMA_VERSION = 4;

interface WatchlistEntry {
  itemId: string;
  priceType: 'flea' | 'flea-net' | 'trader' | 'best-value';
  baselinePrice?: number;
  baselineUpdatedAt?: string;
  addedAt: string;
  lastSeenPrice?: number;
  lastSeenUpdatedAt?: string;
  lastViewedAt?: string;
}

interface ModeState {
  quests: QuestProgressState;
  raidPlans: RaidPlanEntry[];
  watchlist: WatchlistEntry[];   // max 200; unique itemId+priceType
}

interface LocalState {
  schemaVersion: 4;
  preferences: { gameMode: GameMode; beginnerMode: boolean };
  modeData: { regular: ModeState; pve: ModeState };
  recentSearches: RecentSearchEntry[];
  metadata: { createdAt: string; updatedAt: string };
}
```

### 8.2 Migration

- V3 → V4: empty watchlists, `beginnerMode: false`, preserve recentSearches / modeData / timestamps (no `updatedAt` bump).
- V1/V2 import chain through V4; export is V4 only; `schemaVersion >= 5` refused.

### 8.3 Price comparison

Same `WatchPriceType` only. Missing baseline/current → no percent. Stale uses `MARKET_PRICE_STALE_HOURS` (24h). Batch path: `/api/items?ids=&detail=market`.

### 8.4 Beginner preference

`beginnerMode` is a display preference only — it does not rewrite expert pages. Question support matrix lives in `src/lib/beginner-queries.ts`.

## 9. Phase 6 — V5 craft preferences + budget presets (2026-08-03)

### 9.1 Inventory decision

**Option A (shared inventory):** craft material ownership uses the existing
`modeData[mode].quests.ownedItemCounts` map. Quest tracker, search enrichment,
and the craft calculator share one quantity per item id per game mode. Tools
are owned when that count is ≥ 1 for a part flagged `tool: true`.

### 9.2 Final V5 schema (additive)

```ts
export const SCHEMA_VERSION = 5;

interface ModeState {
  quests: QuestProgressState; // ownedItemCounts = shared inventory
  raidPlans: RaidPlanEntry[];
  watchlist: WatchlistEntry[];
  crafting: { preferences: CraftPreferences };
  budgetPresets: BudgetPreset[]; // max 100; lines max 200
}
```

`CraftPreferences` lives in `src/lib/personalized-craft.ts` (price modes,
owned-cost mode, stationLevels, fuelCost, manualFee).
`BudgetPreset` / `BudgetLine` live in `src/lib/loadout-budget.ts`.

### 9.3 Migration

- V4 → V5: default craft preferences + empty `budgetPresets`; preserve
  watchlist, quests, raid plans, recentSearches, beginnerMode; no `updatedAt` bump.
- V1–V3 chain through V4 then V5. Export is V5 only. `schemaVersion >= 6` refused.

### 9.4 Public store APIs

`getCraftPreferences` / `updateCraftPreferences`, budget CRUD + line APIs,
`getOwnedItemCount` / `setOwnedItemCount` / `bulkSetOwnedItemCounts`.

## 10. Phase 7 — local state unchanged

Phase 7 (PatchImpact) does **not** change `schemaVersion`. It remains **5**.
Impact filters use shareable URL query params on `/news`, not localStorage.

## 11. Phase 8 — PWA does not touch local state

Phase 8 keeps **schemaVersion 5** and storage key `tarkovdex:v1`. Service-worker
Cache Storage holds same-origin GET responses only. Clearing offline cache on
`/local-data` must never reset quests, watchlists, craft/budget prefs, or
recent searches. See `docs/operations/tarkovdex-pwa.md`.
