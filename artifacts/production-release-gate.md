# Production release gate

- Session: `PRODUCTION_RELEASE_GATE_AND_VALIDATION`
- Recorded at: **2026-08-03T19:59:40+09:00**
- Branch: `master`
- HEAD: `5533c33ae584d2edfb4f72b104bf5c7ec2c53479`
- Deploy approval: **none** (awaiting approval)
- Production deploy this session: **not executed**

---

## 1. Protect check

| Metric | Value |
| --- | --- |
| `git status --short` lines | 195 |
| Modified | 89 |
| Deleted | 0 |
| Untracked (`??` short lines) | 106 |
| Untracked (`git ls-files --others --exclude-standard`) | 321 |
| Stash | `stash@{0}` preserved |
| Branch | `master` |
| HEAD | `5533c33ae584d2edfb4f72b104bf5c7ec2c53479` |

Forbidden ops not run: reset/checkout/clean/stash-drop/commit/push/prod-deploy/alias-change/DB-migration/LS-wipe/SSO-bypass.

---

## 2. Static gate (re-run this session)

| Check | Result |
| --- | --- |
| `npm test` | **495 pass / 0 fail** |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run build` | pass |
| Message keys | **ko 1021 / en 1021 / zh 1021** |
| `SCHEMA_VERSION` | **5** |
| Storage key | `tarkovdex:v1` |
| Shared First Load JS | **103 kB** |
| SW `CACHE_VERSION` | **1** |

Logs: `artifacts/prod-gate-*.log`.

---

## 3. Release artifacts present

- `public/sw.js`, `public/offline.html`, manifest build output: yes
- SW headers: Cache-Control max-age=0 must-revalidate; Service-Worker-Allowed /
- sitemap / robots / noindex policy: present (local-data, search, tool-private, admin)
- `docs/operations/tarkovdex-release-checklist.md`: yes
- `artifacts/release-candidate-state.md`, `artifacts/release-candidate-qa-report.md`: yes

---

## 4. PWA environment (names only)

Local `.env.local` names: `GEMINI_API_KEY`, `CRON_SECRET`, `TARKOV_LIVE_ADMIN_SECRET`.

Not in local env file: `DATABASE_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_PWA_ENABLED`.

Policy: production PWA on by default unless `NEXT_PUBLIC_PWA_ENABLED` is `false`/`0`.

**Recommended (not applied): Mode B** `NEXT_PUBLIC_PWA_ENABLED=false` — website-first; Preview SSO blocked HTTPS PWA lifecycle. Mode A only if operator accepts gap and immediate prod PWA drill + kill-switch readiness.

---

## 5. Deployments (reference)

| Role | Value |
| --- | --- |
| RC Preview | https://tarkovdex-q3k6l59fv-furss123s-projects.vercel.app (`dpl_GxBkBuNQVVU3iVfFKVthogGTKZ2R`, SSO) |
| Current live production (rollback) | `dpl_3KDTC6PJBnkJdYqgSxnq8GVNB1sG` → tarkovdex-gnqgs4kju… aliases tarkovdex.dev / www / vercel.app |
| This RC on production alias | **not deployed** |

---

## 6. Prior QA carry-forward

- Dual-tab LS on localhost :3010: pass
- Localhost PWA A→B + kill switch: pass (LS preserved)
- Preview browser: SSO blocked; vercel curl headers/SEO OK

---

## 7. Approval gate

Accepted phrases only:

```text
배포 실행 — PWA 활성
배포 실행 — PWA 비활성
배포 보류
```

Received this session: **none**. Not run: `vercel deploy --prod`, commit, push, env mutation.

---

## 8. Remaining unverified

- Real Android soft keyboard / VisualViewport
- Safari/iOS install / beforeinstallprompt
- axe critical/serious
- Full 8-width × 3-locale overflow matrix
- HTTPS Preview PWA A→B / kill (SSO)
- Production-alias smoke / dual-tab / PWA (until approval)

---

## 9. Rollback plan

- App: promote prior production `dpl_3KDTC6PJBnkJdYqgSxnq8GVNB1sG`; restore alias; no DB change
- PWA: `NEXT_PUBLIC_PWA_ENABLED=false`; unregister SW; clear `tarkovdex-*` caches; keep `tarkovdex:v1` schema 5

---

## Verdict

```text
배포 준비 완료 — 승인 대기
```

Static gate green. Working tree + stash@{0} protected. No production deploy executed.
