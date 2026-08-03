# Release candidate state freeze

- Recorded at: 2026-08-03T19:45:02+09:00
- Branch: master
- HEAD: 5533c33ae584d2edfb4f72b104bf5c7ec2c53479
- Session: `RELEASE_CANDIDATE_FREEZE_AND_PREVIEW_QA`
- Production deploy: **not performed**

## Git status summary

| Metric | Value |
| --- | --- |
| `git status --short` lines | 195 |
| Modified (approx ` M`/`M `) | ~89 |
| Untracked (`??`) | ~303 (`git ls-files --others --exclude-standard`) |
| Deleted | 0 |
| Tracked diff name-only count | 89 |
| Existing stash | `stash@{0}: WIP on master: 3c47b94 SEO: stabilize static rendering for data pages` (preserved; not dropped) |

Working tree is treated as the valid Phase 1–9 body of work. No reset/checkout/clean/commit/push.

## Phase 1–9 core artifacts present

| Path | Present |
| --- | --- |
| `public/sw.js` | yes (`CACHE_VERSION = 1`) |
| `public/offline.html` | yes |
| `src/app/manifest.ts` | yes |
| `src/lib/local-state/schema.ts` | yes (`SCHEMA_VERSION = 5`) |
| `src/components/pwa/ServiceWorkerManager.tsx` | yes |
| `docs/operations/tarkovdex-release-checklist.md` | yes |
| `tests/phase9-release.test.ts` | yes |

## Baseline entering this session (Phase 9 report)

```text
tests: 495 pass / 0 fail
messages: 1021 ko / 1021 en / 1021 zh
schemaVersion: 5
storage key: tarkovdex:v1
shared First Load JS: 103 kB
PWA: custom public/sw.js
SW CACHE_VERSION: 1
Phase 9 verdict: 조건부 완료
```

## Env names set locally (values redacted)

From `.env.local` (names only):

- `GEMINI_API_KEY`
- `CRON_SECRET`
- `TARKOV_LIVE_ADMIN_SECRET`

No root `.env` file.

## Known limitations carried in

- Dual-tab full UI click-through: Phase 9 used iframe/`storage` proxy, not two real tabs
- Soft keyboard / VisualViewport: 미검증
- `beforeinstallprompt` / Safari iOS install: 미검증
- Full 8-width × 3-locale overflow matrix: not fully automated
- axe full audit: not completed
- HTTPS Preview PWA A→B / kill switch: not yet run on Vercel Preview in this freeze session (to be attempted next)

## Forbidden ops confirmation

Not run: `git reset`, `git checkout`, `git clean`, stash drop, commit, push, production deploy, production alias change, destructive DB ops.


## Preview deployment (added during RC freeze)

- URL: https://tarkovdex-q3k6l59fv-furss123s-projects.vercel.app
- id: dpl_GxBkBuNQVVU3iVfFKVthogGTKZ2R
- target: preview
- Browser blocked by Vercel SSO Deployment Protection
- Production not deployed

