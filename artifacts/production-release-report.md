# Production release report

- Session: `PRODUCTION_RELEASE_GATE_AND_VALIDATION`
- Recorded at: **2026-08-03T20:43:45+09:00**
- Branch: `master`
- HEAD (local working tree): `5533c33ae584d2edfb4f72b104bf5c7ec2c53479`
- Approval phrase: **배포 실행 — PWA 비활성**
- Ship mode: **Mode B** (`NEXT_PUBLIC_PWA_ENABLED=false`)

---

## 1. Verdict

```text
Production 배포 완료
```

PWA disabled on production. Website smoke + dual-tab Local State pass. Mobile soft-keyboard / axe / Safari install remain unverified.

---

## 2. Approval and env (names only)

| Item | Value |
| --- | --- |
| Approval | `배포 실행 — PWA 비활성` |
| `NEXT_PUBLIC_PWA_ENABLED` | set to `false` on Production (added this session) |
| `NEXT_PUBLIC_SITE_URL` | present (Production) |
| `DATABASE_URL` | present (Production) |
| Cron-related | `CRON_SECRET` present |
| Secrets printed | **no** |

Working tree + `stash@{0}` preserved. No commit/push. No DB schema drop.

---

## 3. Static gate (pre-deploy, this session)

| Check | Result |
| --- | --- |
| tests | 495 pass / 0 fail |
| typecheck | pass |
| lint | pass |
| build | pass |
| messages | 1021 / 1021 / 1021 |
| schemaVersion | 5 |
| storage | `tarkovdex:v1` |
| First Load JS | 103 kB |
| SW CACHE_VERSION (source) | 1 (file still shipped; registration disabled by kill switch) |

---

## 4. Deployment

| Field | Value |
| --- | --- |
| Command | `npx vercel deploy --prod --yes` |
| Deployment ID | `dpl_9AFTJByqN7cPU1NEu64B7KsNmzaR` |
| Deployment URL | https://tarkovdex-b3d9fuxen-furss123s-projects.vercel.app |
| Production alias | https://tarkovdex.dev (also www + vercel.app) |
| Target | production |
| ReadyState | READY |
| Created | 2026-08-03 ~20:36 KST |
| Previous production (rollback) | `dpl_3KDTC6PJBnkJdYqgSxnq8GVNB1sG` (tarkovdex-gnqgs4kju…) |

Log: `artifacts/prod-deploy.log`

---

## 5. Smoke (production alias)

Source: `artifacts/prod-smoke.json`

| Metric | Value |
| --- | --- |
| Total checks | 59 |
| HTTP 200 | 53 |
| Redirects OK (`/items`, `/tasks` × 3 locales) | 6 |
| Bad | **0** |

Locales: ko / en / zh

Routes: `/`, `/status`, `/search`, `/local-data`, `/news`, `/beginner`, `/economy/items`, `/economy/watchlist`, `/economy/craft-calculator`, `/progression/tasks`, `/progression/tasks/tracker`, `/progression/gunsmith`, `/combat/ammo`, `/combat/armor`, `/combat/budget-builder`, `/maps`

SEO samples:

- `/ko` title + canonical + 4 hreflang alts OK
- `/en/local-data` robots `noindex, follow`
- `/zh/search` robots `noindex, follow`
- `/robots.txt` Allow `/`, Disallow `/api/` + `/*/admin`, Sitemap → tarkovdex.dev
- `/sitemap.xml` excludes local-data / search / watchlist / craft-calculator / budget-builder / tracker
- `/sw.js` 200 + `Cache-Control: public, max-age=0, must-revalidate` + `Service-Worker-Allowed: /`
- `/manifest.webmanifest` 200
- `/offline.html` 200 + `X-Robots-Tag: noindex, nofollow`

---

## 6. Dual-tab (real tabs on https://tarkovdex.dev)

Tabs: A=`d3e1fe`, B=`7573a0` — **no reload** between sync checks.

| Area | Result |
| --- | --- |
| Game mode | A → PvE then PvP; B aria-pressed + LS `preferences.gameMode` matched; home craft/boss numbers changed with mode |
| Quests | A activate `69c26c07683c9831020018c7`; B button became 활성에서 제거; B complete → A showed 완료 취소; active cleared on complete |
| Watchlist | A add C-3 keycard; B watchlist showed item; B remove; A star back to 관심 목록에 추가 |
| Budget | A create preset; B listed it; B rename → `ProdGate QA` on A; B delete; A empty |
| Mode isolation | PvE watchlist/completed stayed empty while regular mutated |
| Cleanup | QA quest id removed from regular completed/active after tests |

---

## 7. PWA (Mode B — disabled)

| Check | Result |
| --- | --- |
| New SW registration | **none** (`getRegistrations()` = 0) |
| controlled | false |
| `tarkovdex-*` caches | **none** |
| Local State | `tarkovdex:v1` present, **schemaVersion 5** |
| Offline / A→B update drill | **not required** for Mode B ship (PWA off) |
| Kill-switch behavior | matches intended unregister + cache clear path in `ServiceWorkerManager` |

Note: `/sw.js` and manifest remain HTTP-reachable assets; client does not register when kill switch is false.

---

## 8. Mobile / accessibility

| Item | Status |
| --- | --- |
| Real Android Chrome soft keyboard | **미검증** |
| Safari / iOS install | **미검증** |
| axe critical/serious | **미검증** |
| Full 8-width overflow matrix | **미검증** (Phase 9 fixed known gunsmith 320 cases locally earlier) |

---

## 9. Remaining limits

- Soft keyboard / VisualViewport on real device
- Safari/iOS PWA install / `beforeinstallprompt`
- axe audit on production
- HTTPS PWA lifecycle (deferred until separate **배포 실행 — PWA 활성** approval)
- Continuous post-deploy log watching beyond this session smoke

---

## 10. Rollback

| Path | Action |
| --- | --- |
| App | Promote prior production `dpl_3KDTC6PJBnkJdYqgSxnq8GVNB1sG`; restore `tarkovdex.dev` alias; no DB change |
| PWA | Already off; keep `NEXT_PUBLIC_PWA_ENABLED=false` unless separately approved |
| Cache | Clear `tarkovdex-*` only if a future PWA-on build misbehaves |
| Local State | Never delete `tarkovdex:v1` |

---

## Protect confirmation

- `stash@{0}` still present
- No `git reset` / `checkout` / `clean` / commit / push
- Production DB not migrated as a release step (cron may still run its idempotent migrations on schedule — not invoked manually here)
