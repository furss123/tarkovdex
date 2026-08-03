# Post-deploy homepage data-trust audit — 2026-08-03

Reproduction record for `POST_DEPLOY_HOMEPAGE_DATA_TRUST_HOTFIX`, run against
the deployed production baseline (`dpl_9AFTJByqN7cPU1NEu64B7KsNmzaR`, PWA
disabled) and a local `next start` build on port 3011.

Six suspected defects were reported. **Four reproduced and were fixed. Two were
checked and found healthy, so nothing was changed for them.** Every number below
came from a fetch, a build log, or a DOM read — none is an estimate.

---

## Reproduction matrix

| # | Reported symptom | Reproduced? | Root cause | Disposition |
| --- | --- | --- | --- | --- |
| 1 | Home craft ranking shows an implausible profit as a current figure | **yes** | `selectBestCraftsByStation()` filtered for *missing* prices only, never *old* ones | fixed |
| 2 | `/status` reports availability it cannot know, and no content age for prices | **yes** (two distinct defects) | `noObservation` printed inside the Availability row; `observedHealth()` hard-coded `freshness: 'unknown'` | fixed |
| 3 | Trader restock section shows nine useless cards | **yes** | upstream publishes only already-past `resetTime`s; the board rendered one card per trader regardless | fixed |
| 4 | `/zh/news` shows an English body with no indication it is untranslated | **yes** | translated flag set on title **or** content differing, in both `sources.ts` and `pipeline.ts` | fixed |
| 5 | Root `/` locale redirect may ignore `Accept-Language` | **no** | `middleware.ts` is a plain `createMiddleware(routing)` and behaves correctly | not changed |
| 6 | Home page may not surface the tool suite | **no** | header exposes 11 tools + unified search; footer exposes 17 | not changed |

---

## 1 — Craft ranking sold a 243-day-old price as "현재 시세"

**Evidence.** The home board rendered eight station cards under
`home.craftProfitDescription`, which read "현재 시세 기준" ("based on current
prices"). One of them, Bitcoin Farm at `₽+521,228`, was the largest number on
the page and by far the most likely to be acted on. Its upstream price record
was stamped **2025-12-03**, roughly 243 days before the audit, and it carried no
flea value at all — the profit rested entirely on one trader price of that age,
because the recipe has zero inputs.

**Why the existing filter missed it.** The craft profit calculation already
refuses a craft when any required price is *absent*. An old price is present, so
nothing stopped it, and nothing on the card said how old it was.

**Fix.** `CraftProfitLeader.priceUpdatedAt` (replacing the unused product-only
`updatedAt`) carries the **oldest** `price.updated` across every priced non-tool
input plus every output, and `null` when any contributor has no stamp. Tools are
excluded because they are returned and never enter the cost.
`partitionCraftLeadersByFreshness()` then classifies with the existing
`contentFreshness()` and the `crafts` domain's already-registered 12 h / 24 h
thresholds — the same numbers `/economy/items` applies. No threshold was
invented, and no price was changed.

`fresh` and `warning` stay in the current ranking. `stale` **and `unknown`** move
to a separate labelled group; `unknown` is included deliberately, because an age
we cannot establish must not be presented as a recent one.

**Confirmed after the fix** (DOM read, `/ko`, PvP):

```
제작대별 최고 예상 차익
확인 가능한 최근 가격 기준이며, 플리마켓 수수료와 연료비를 차감하기 전 예상 차익입니다.
  물 공급 시설 ₽+48,112 · 양조 시설 ₽+8,241 · 의료 시설 ₽+68,086 · 작업대 ₽+128,715
  정보 수집 시설 ₽+64,164 · 조리 시설 ₽+177,554 · 화장실 ₽+32,178      ← 7 current

오래된 가격 기준 참고
아래 제작은 계산에 쓰인 가격이 24시간보다 오래됐습니다.
지금 차익과 다를 수 있으니 게임 안에서 가격을 한 번 더 확인하세요.
  비트코인 채굴 시설 ₽+521,228
  가격 기준 시각: 2025. 12. 3. 오후 9:34 KST                          ← dated, with its date
```

Switching to PvE re-partitions with no refetch (profits change — 물 공급
₽+54,271, 양조 ₽+117,567 — and the split holds).

---

## 2 — `/status` conflated observation absence with availability, and reported no price age

**Evidence, defect A.** The Availability row printed
`이 서버 인스턴스에 확인된 기록 없음` ("no record on this server instance")
whenever no health record existed. `AvailabilityStatus` has no `unknown` member,
so a per-instance bookkeeping gap was being rendered as a verdict about whether
upstream is reachable — two different questions in one row.

**Evidence, defect B.** Every `json.tarkov.dev` card reported
`데이터 신선도: 확인 불가`, including `itemPrices`, `crafts` and `barters` —
whose content age `/api/items` was already publishing as
`meta.sourceUpdatedAt`. Ten of twelve domains showed an unknown age; only seven
genuinely have no upstream stamp.

**Fix.** New server-only `getDomainStatusSnapshot()` resolves each domain in the
required order — loader `sourceUpdatedAt`, then observation, then `unknown` —
and returns `availability: AvailabilityStatus | null` alongside a separate
`observed` boolean, so the two axes cannot be collapsed again. Availability
renders `unknown` when undetermined; observation moved to its own labelled row,
present only on the ten non-live domains.

The price stamp comes from **one** `/regular/items` read through the same
15-minute `fetchTarkovJson` runtime cache `/economy/items` already warms,
isolated in its own `try`/`catch` and with the loader injected as a parameter so
tests never touch the network. No loader is called; the page stays
`force-dynamic`.

**Confirmed after the fix** (`/ko/status`, first two cards):

```
아이템 및 가격        정상
  사용 가능 상태            사용 가능
  데이터 신선도             최신
  전달 방식                 이 응답을 만들 때 새로 받음
  이 서버 인스턴스의 전달 관측   이 서버 인스턴스에 기록 있음
  마지막 콘텐츠 갱신: 2026. 8. 3. 오후 3:08 KST      ← real upstream age
  데이터를 가져온 시각: 2026. 8. 3. 오후 9:56 KST     ← distinct clock, unchanged

퀘스트                갱신 시각 확인 불가
  사용 가능 상태            확인할 수 없음                ← was the observation sentence
  데이터 신선도             확인 불가
  이 서버 인스턴스의 전달 관측   이 서버 인스턴스에 확인된 기록 없음   ← now its own row
```

`제작` and `교환` report the same `2026. 8. 3. 오후 3:08 KST` content stamp;
`상인`, `탄약`, `방탄복`, `맵`, `보스`, `건스미스` still report `확인 불가`,
which is correct — those documents carry no content timestamp.

**Cost, measured.** Cold 664 ms once per 15-minute cache window per runtime;
every render after that 30–50 ms (`/en/status` 42 ms, `/zh/status` 31 ms
immediately after, then three repeats of `/ko/status` at 50/34/30 ms) —
indistinguishable from the previous no-fetch path.

---

## 3 — Nine unusable trader restock cards

**Evidence.** Every `resetTime` in `json.tarkov.dev/regular/traders` was already
3–6 hours in the past. Because the board's `now` was `null` before hydration, the
server rendered `restockUnavailable` nine times and hydration flipped all nine to
`restockRefreshing` — nine cards, no information, and a visible flip.

Inventing a restock cycle is forbidden, so the fix is presentation, not data.

**Fix.** Pure `selectActionableRestocks(traders, now)` requires a parseable
`resetTime` **strictly in the future** and sorts soonest-first. The home page
passes one server `renderedAt` instant, used as the board's initial `now` so the
first client render matches the server markup (the pattern `LiveBoard` already
uses); the 1 s ticker starts only after mount. The same instant drives the craft
split, so the two widgets share one "now".

Only actionable traders render. When none are, a single `EmptyState` says so. The
once-per-expiry-window `router.refresh()` is kept but now watches only
countdowns that were still running at render time — watching the already-past
ones would fire a refresh on every visit while upstream stays hours behind.

**Confirmed after the fix** (`/ko`, both modes):

```
상인 재고 보충
지금 안내할 수 있는 다음 보충 시각이 없습니다.
출처가 제공한 보충 시각이 모두 지났고, 다음 시각은 아직 공개되지 않았습니다.
```

`home.restockRefreshing` and `home.restockUnavailable` were removed from all
three locales with the markup they served.

---

## 4 — An English body rendered as the Chinese translation

**Evidence.** The Steam adapter set its translated flag when the title **or** the
content differed from the original, so a reviewed localized title over an
untouched English body counted as fully translated — which suppressed
`live.translationPending`. `pipeline.ts` had the identical OR, so the cron path
would have persisted `zh.translated = true` with an English body.

Audited against the real committed files, all 10 current Steam posts:

| Locale | Body localized | Title localized, body still English |
| --- | --- | --- |
| `ko` | 10 / 10 | 0 |
| `zh` | 8 / 10 | **2** — `版本 1.0.6.0`, `Expansions Hub 与 TarCoin` |

**Fix.** `RawPost.contentTranslated` is derived from the **body** alone in both
`sources.ts` and `pipeline.ts`, and `toLiveEntry` reads it. The reviewed title
still renders — only the flag becomes honest. A compact
`live.untranslatedBadge` ("원문(영어)" / "原文（英文）" / "Original (English)")
now marks the collapsed row, where previously the notice existed only inside the
expanded panel. No translation was written and no content generated.

**Verification gap, stated plainly.** The badge was not browser-verified: the
local instance has no `DATABASE_URL`, and the no-database news path publishes
nothing until an operator curates, so the board renders its empty state. Covered
instead by four new `tests/live.test.ts` cases (localized title + English body →
`translated: false`; a real translation → `true`; no localization → `false`;
an adapter with no content flag falls back to the translated block) plus the
real-data audit above.

---

## 5 — Root locale redirect: healthy, not changed

`middleware.ts` is a plain `createMiddleware(routing)`. Production honours
`Accept-Language` (ko→`/ko`, en→`/en`, zh→`/zh`), falls back to `ko` when the
header is absent or unmatched, and lets an explicit locale cookie win. Every
`/ko`, `/zh`, `/en` URL is a direct non-redirecting hit. Nothing to fix.

## 6 — Home tool discoverability: healthy, not changed

The header already exposes 11 tools plus unified search; the footer exposes 17,
including 데이터 신뢰도 and 퀘스트 추적기. A third entry point on the home page
would lengthen it and grow its bundle for no discoverability gain.

Also considered and rejected: shortening the `traders` cache window from 6 h.
It cannot help, because the live upstream document itself serves past reset
times.

---

## Verification summary

| Check | Result |
| --- | --- |
| `npm test` | **527 pass / 0 fail** (495 baseline + 32 new), 15.3 s |
| `npm run typecheck` | clean |
| `npm run lint` | clean |
| `npm run build` (`GEMINI_API_KEY` empty) | exit 0, 1683 pages |
| Message keys ko / en / zh | **1029 / 1029 / 1029**, zero one-sided keys |
| Horizontal overflow | **0** across 9 route×locale renders × 8 widths |
| Interactive elements under 44 px tall | **0** |
| Console / hydration errors | **0** across 9 renders |
| Shared First Load JS | **103 kB** unchanged; home route 11.9 → 13.3 kB, First Load 145 kB |
| `schemaVersion` | **5**, untouched |
| `NEXT_PUBLIC_PWA_ENABLED` | still `false` |

New tests: `tests/home-craft-freshness.test.ts` (9),
`tests/trader-restock.test.ts` (8), `tests/data-status-snapshot.test.ts` (11),
plus 4 translation-flag cases in `tests/live.test.ts`.

New modules: `src/lib/trader-restock.ts`, `src/lib/data-status-snapshot.ts`.

Probe scripts used for the measurements above, kept beside this file:
`hotfix-html-check.mjs`, `hotfix-news-check.mjs`, `hotfix-key-count.mjs`,
`hotfix-translated-flag.mts`, and the build log `hotfix-build.log`.

**Not done, deliberately:** no production deploy, no alias change, no
environment-variable change, no commit. The working tree holds 18 modified
tracked files (14 code/message, 4 docs) and 5 new source/test files;
`stash@{0}` and the untracked files from other phases are untouched.
