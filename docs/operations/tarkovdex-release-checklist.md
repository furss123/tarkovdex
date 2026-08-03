# TarkovDex release checklist

Operator checklist for production deploys. Last updated with Phase 9
(`PHASE_9_PRODUCT_POLISH_AND_FINAL_QA`, 2026-08-03). This does **not** replace
`docs/operations/tarkovdex-pwa.md` or `docs/tarkov-live.md` — it sequences the
commands and drills that must happen before and after a release.

**Rule:** do not tick a box without command output, HTTP headers, or a named
browser measurement. Partial drills stay unchecked.

---

## Pre-deploy commands

Run from the repo root with Node on `PATH`:

```bash
npm test
npm run typecheck
npm run lint
# Message leaf parity (expect 1021 / 1021 / 1021 after Phase 8-9)
node -e "const fs=require('fs');const leaf=(o,p='')=>Object.entries(o).flatMap(([k,v])=>v&&typeof v==='object'&&!Array.isArray(v)?leaf(v,p+k+'.'):[p+k]);for(const l of['ko','en','zh']){console.log(l,leaf(JSON.parse(fs.readFileSync('messages/'+l+'.json','utf8'))).length)}"
GEMINI_API_KEY= npm run build
```

Record from the build table:

- [ ] Shared First Load JS (budget: **103 kB**)
- [ ] Largest personal-tool routes (search / tracker / watchlist / craft / budget)
- [ ] No unexpected middleware size jump

Then smoke against **`next start`**, not `next dev`:

```bash
npx next start --port 3001
```

Smoke (each locale once for home + tools):

- [ ] `/ko`, `/en`, `/zh`
- [ ] `/status`, `/news`, `/beginner`, `/maps`
- [ ] `/economy/items`, `/economy/barters`, `/economy/watchlist`, `/economy/craft-calculator`
- [ ] `/progression/tasks`, `/progression/tasks/tracker`, `/progression/gunsmith`
- [ ] `/combat/ammo`, `/combat/armor`, `/combat/budget-builder`
- [ ] `/search`, `/local-data`
- [ ] No `MISSING_MESSAGE` in server logs
- [ ] 320px: gunsmith / ammo / armor document overflow = 0

---

## Environment variables

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Yes (prod) | `https://tarkovdex.dev` — inlined at build |
| `DATABASE_URL` | For Tarkov Live admin/cron | App stays up without it; news falls back |
| `CRON_SECRET` | Cron auth | Bearer only; never query string |
| `ADMIN_PASSWORD` / admin session secret | Live review desk | See `docs/tarkov-live.md` |
| `GEMINI_API_KEY` | News interpret / offline glossary regen | Build may omit; Live interpret needs it in cron |
| `X_BEARER_TOKEN` | Optional Live X source | |
| `NEXT_PUBLIC_PWA_ENABLED` | Optional kill switch | `false` / `0` disables register + clears SW |

Unset `NEXT_PUBLIC_PWA_ENABLED` (or any value other than `false`/`0`) keeps PWA
**on** in production builds.

---

## Database

- [ ] Confirm whether this deploy expects Live DB (`DATABASE_URL` present)
- [ ] Cron can run migrations (`live_migrations`) — no separate migrate step
- [ ] Empty / missing DB: `/news` still 200 with unmanaged/fallback freshness
- [ ] No destructive schema drop as part of release

---

## PWA markers (record at release)

| Item | Expected |
| --- | --- |
| Manifest | `GET /manifest.webmanifest` → 200, `application/manifest+json` |
| SW | `GET /sw.js` → `Cache-Control: public, max-age=0, must-revalidate`, `Service-Worker-Allowed: /` |
| SW size | ~8.3 kB (byte count may drift slightly) |
| `PWA_CACHE_VERSION` | `1` in `src/lib/pwa/sw-policy.ts` and `public/sw.js` |
| Cache names | `tarkovdex-{static,pages,data,images}-v1` |
| Local state | `tarkovdex:v1`, **schemaVersion 5** |

---

## PWA install (Chromium)

- [ ] Manifest icons 192 / 512 return 200 and match declared sizes
- [ ] SW registers after `load` on production host
- [ ] `beforeinstallprompt` (if fired): install CTA only after user click; dismiss stays dismissed
- [ ] Standalone / installed: install CTA hidden

If `beforeinstallprompt` does not fire in the QA browser, mark **미검증** — do
not claim installability passed.

---

## Offline drill

1. Visit home + at least one personal tool while online (populate page/data caches).
2. Emulate offline (DevTools or CDP `Network.emulateNetworkConditions`).
3. Reload visited routes → cached navigation or app shell; offline banner visible.
4. Mutate local state (quest / watchlist / craft / budget) → survives reload offline.
5. Unvisited route → `/offline.html` (or SW offline fallback), no white-screen crash.
6. Prices/news must not read as “live current” when served from SW cache
   (`X-TarkovDex-From-SW-Cache` / cached notices).

- [ ] Offline banner
- [ ] Local state writable offline
- [ ] No sync queue invented
- [ ] Cached price/news wording honest

---

## Online recovery

- [ ] Restore network → banner clears only after successful fetch (not `navigator.onLine` alone)
- [ ] API responses replace stale SW entries
- [ ] No fetch storm / infinite reload
- [ ] Local state unchanged

---

## Update drill (waiting → apply)

Requires two SW byte versions on the **same origin** (e.g. bump
`CACHE_VERSION` in `public/sw.js`, `registration.update()`, then restore).

- [ ] Old controller stays active until user applies
- [ ] Waiting worker appears; UI offers update (no forced reload)
- [ ] “Later” keeps editing state
- [ ] Apply → `SKIP_WAITING` → `controllerchange` → **one** reload
- [ ] Old `tarkovdex-*` cache names removed; non-app caches untouched
- [ ] No infinite reload loop

---

## Kill switch drill

1. Build with `NEXT_PUBLIC_PWA_ENABLED=false`.
2. Serve that build on the **same origin** that already had a SW.
3. Load any page.

- [ ] No new `register('/sw.js')`
- [ ] Existing registration `unregister()`
- [ ] `tarkovdex-*` caches deleted
- [ ] `tarkovdex:v1` / schema 5 user data preserved
- [ ] Site works as a normal website
- [ ] No unregister loop / console errors

Rebuild with PWA re-enabled before shipping unless the release intentionally
ships with PWA off.

---

## Cache vs local data

On `/local-data`:

- [ ] “오프라인 캐시 삭제” clears Cache Storage only
- [ ] User JSON / quest / watchlist / presets unchanged
- [ ] “초기화” clears localStorage document only (Cache Storage policy unchanged)

---

## SEO spot-check

- [ ] `robots.txt` disallows `/api/`, admin; Sitemap points at `https://tarkovdex.dev/sitemap.xml`
- [ ] noindex: `/search`, `/local-data`, `/economy/watchlist`, `/economy/craft-calculator`, `/combat/budget-builder`, `/progression/tasks/tracker`
- [ ] index OK: home, news, beginner, status (per current policy), core guides
- [ ] Canonicals have no stray search `q=`
- [ ] hreflang + `x-default` → `/en…`

---

## Post-deploy

- [ ] Production `/sw.js` and `/manifest.webmanifest` headers
- [ ] Cron auth 401 without bearer; 200 with secret (if Live enabled)
- [ ] One locale home + news + items smoke
- [ ] Admin login only if Live desk is in scope

---

## Rollback

| Situation | Action |
| --- | --- |
| Bad app deploy | Redeploy previous Vercel deployment (CLI/dashboard). No git force required. |
| Bad SW / offline breakage | Set `NEXT_PUBLIC_PWA_ENABLED=false`, rebuild, redeploy (kill switch). |
| Stuck clients | Users: `/local-data` → clear offline cache; or DevTools → unregister SW. |
| User data | Never delete `tarkovdex:v1` during SW/cache rollback. |
| Live DB | Prefer forward fix; do not drop tables for rollback. |

---

## Monitoring (lightweight)

- Vercel deploy + function error rate
- Cron success / lock `409` rate
- Spot-check that news freshness is not stuck on `never` after DB restore
- After SW version bump: watch for elevated client errors for ~24h

---

## Phase 9 evidence snapshot (2026-08-03 local QA)

Not a production deploy. Recorded against `next start` on `127.0.0.1:3007`:

| Drill | Result |
| --- | --- |
| Tests | **495 pass / 0 fail** |
| Keys | **1021** ko/en/zh |
| Shared JS | **103 kB** |
| Gunsmith 320 overflow | Fixed (overflow 0) |
| Ammo/armor touch | 44×44 wrappers |
| SW update A→B | Waiting → SKIP_WAITING → v2 caches; v1 cleaned |
| Kill switch | unregister + caches cleared; LS schema 5 kept |
| Offline home | Banner + cached shell |
| Dual-tab full UI | **Partial** (storage event via iframe + unit tests; not every click path) |
| `beforeinstallprompt` | **미검증** (event not observed) |
| Safari / iOS install | **미검증** |
| Soft keyboard | **미검증** |

Overall Phase 9 gate: **조건부 완료** until installability and dual-tab UI
click-through are verified on a Chromium profile that fires install prompts and
on a second real tab.

---

## Release candidate freeze (2026-08-03)

See `artifacts/release-candidate-qa-report.md`.

| Item | Result |
| --- | --- |
| Static gate | 495 pass, typecheck/lint/build pass, 1021 keys, 103 kB, schema 5 |
| Preview URL | https://tarkovdex-q3k6l59fv-furss123s-projects.vercel.app (target preview) |
| Preview browser | Blocked by Vercel SSO Deployment Protection |
| Dual-tab UI | **Pass** on localhost :3010 real tabs (gameMode, quests, watchlist, budget) |
| Soft keyboard / iOS / install prompt | Still unverified |
| Production deploy | **Not performed** |
| Ship gate | **조건부 릴리스 준비** |
