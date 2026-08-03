# Release candidate QA report

- Recorded at: 2026-08-03T19:53:08+09:00
- Session: `RELEASE_CANDIDATE_FREEZE_AND_PREVIEW_QA`
- Production deploy: **not performed**
- Production alias unchanged: `https://tarkovdex.dev` remains production

## Verdict

**조건부 릴리스 준비**

Static gates pass; Critical/High defects not found; real dual-tab UI sync verified on localhost. HTTPS Preview was created but **Vercel Deployment Protection (SSO)** blocks unauthenticated browser access, so Preview-origin PWA install / A→B / kill-switch / offline UI drills could not be completed in-browser. Soft keyboard, Safari/iOS, axe, and full width×locale overflow matrix remain incomplete.

## Preview

| Field | Value |
| --- | --- |
| URL | `https://tarkovdex-q3k6l59fv-furss123s-projects.vercel.app` |
| Deployment id | `dpl_GxBkBuNQVVU3iVfFKVthogGTKZ2R` |
| target | **preview** (`vercel inspect`) |
| Browser access | Redirects to Vercel SSO login |
| Auth-aware checks | `npx vercel curl` |

Authenticated Preview checks:

- `/sw.js`: 200, `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /`, `Content-Type: application/javascript`
- `/manifest.webmanifest`: 200, `application/manifest+json`
- `/ko/local-data`, `/ko/search` HTML: `robots` = `noindex, follow`
- `sitemap.xml`: no `/local-data`; no `/ko/search` loc entry
- `robots.txt`: Allow `/`, Disallow `/api/` and `/*/admin`; Sitemap points at production host

Fallback browser environment for interactive QA: `http://127.0.0.1:3010` (`next start`, PWA enabled build).

## Static gate

| Check | Result |
| --- | --- |
| `npm test` | **495 pass / 0 fail** |
| `npm run typecheck` | pass |
| `npm run lint` | pass (no warnings/errors) |
| `npm run build` | pass |
| Message leaves | **1021 / 1021 / 1021** |
| schemaVersion | **5** (`tarkovdex:v1`) |
| Shared First Load JS | **103 kB** |
| `public/sw.js` | present, `CACHE_VERSION = 1`, ~8255 bytes |
| `public/offline.html` | present |
| `manifest.webmanifest` build artifact | present under `.next/server/app/` |

## Real devices

| Item | Result |
| --- | --- |
| Device | Cursor IDE Chromium automation (desktop) |
| Soft keyboard | **미검증** (no Android/iOS device) |
| Safari / iOS Add to Home Screen | **미검증** |
| standalone install UI | **미검증** (`beforeinstallprompt` not observed; Preview SSO blocks HTTPS installability UI) |

## Dual-tab (real tabs, localhost `:3010`)

Tabs: `88fada` (A) and `da5743` (B). Not iframe. Not unit-test-only.

| Flow | Result |
| --- | --- |
| gameMode regular→pve | Pass — B `aria-pressed` PvE without reload; craft profits updated |
| Quest activate on A → tracker B | Pass — `활성 퀘스트 (2)` without reload |
| Complete on B → A | Pass — active/completed IDs synced; UI remove count updated |
| Watchlist add A → B | Pass — empty→1 item without reload |
| Watchlist remove B | Pass — empty again |
| Budget create A → B | Pass — preset appears |
| Budget edit B (100000→250000) → A | Pass — A saw `250000` |
| Budget delete A → B | Pass — both empty |
| Console / storage loop | No errors observed in these flows |
| PvP/PvE mix | Not observed (all under `pve` mode data) |

HTTPS Preview dual-tab: **미실행** (SSO).

## PWA

| Drill | Environment | Result |
| --- | --- | --- |
| Manifest / SW headers | Preview via `vercel curl` + localhost | Pass |
| Controlled / offline / A→B / kill | Phase 9 on localhost `:3007` | Pass (prior session evidence) |
| Same drills on Preview HTTPS origin | Preview | **미실행** (SSO) |
| `beforeinstallprompt` | — | **미검증** |
| Offline tour (full tool set) | — | Partial / prior Phase 9 home only for this freeze |

Intended release PWA setting: **enabled** (`NEXT_PUBLIC_PWA_ENABLED` unset / not `false`). Kill-switch rebuild was restored after Phase 9.

## Responsive

- Gunsmith Phase 9 fix still holds; home at 320px: overflow **0** on `:3010`.
- 48 locale×route HTTP fetches against `:3010`: all returned HTML (status matrix).
- Full scrollWidth matrix for 8 widths × 3 locales × 16 routes: **not fully automated** in this session.

## Accessibility

- axe: **not run**
- Do not claim full a11y pass

## Defects found this session

None Critical/High/Medium requiring code change. No release-blocking defect fix applied.

## SEO

- noindex personal tools confirmed on Preview HTML
- sitemap exclusions confirmed
- robots.txt production-oriented Host/Sitemap (expected for shared config)

## Remaining limitations

1. Preview SSO blocks automated HTTPS browser QA
2. Soft keyboard / VisualViewport
3. Safari/iOS install
4. `beforeinstallprompt`
5. Preview-origin SW A→B and kill-switch
6. Full offline tour of all personal tools on Preview
7. axe audit
8. Complete 8-width overflow matrix

## Deploy recommendation

**제한 공개 권장** after either (a) temporarily allowing Preview access for a human QA pass (protection bypass / SSO login), or (b) accepting localhost + `vercel curl` evidence with the listed gaps as known limitations.

Do **not** treat as unconditional ship until Preview-origin PWA lifecycle is human-verified or protection bypass is available for automation.

## Rollback (unchanged)

- App: previous Vercel production deployment
- PWA: `NEXT_PUBLIC_PWA_ENABLED=false` rebuild
- Client: unregister SW / clear `tarkovdex-*` caches via `/local-data`
- Preserve `tarkovdex:v1` user data

## Git protect

- stash@{0} preserved
- No reset / checkout / clean / commit / push / production deploy