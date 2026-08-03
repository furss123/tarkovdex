# TarkovDex PWA and offline operations

Phase 8 adds an installable Progressive Web App with **safe** offline
fallbacks. Cached prices and news must never be presented as live readings.
Local user state (`tarkovdex:v1`, schemaVersion 5) stays in `localStorage` and
is never copied into Cache Storage.

## Implementation choice

**Custom service worker** (`public/sw.js`) + Next.js `src/app/manifest.ts`.

No `next-pwa` / Workbox dependency. Next.js 15.5 App Router has no first-party
PWA plugin in this repo, and library defaults would risk caching mutations,
external origins, or error responses. Cache policy is owned in
`src/lib/pwa/sw-policy.ts` (tests) and mirrored by `public/sw.js` (runtime).

## Manifest

| Field | Value |
| --- | --- |
| `id` | `/` |
| `start_url` | `/ko` (default locale; `localePrefix: always`) |
| `scope` | `/` |
| `display` | `standalone` |
| `theme_color` / `background_color` | `#17181b` |
| Icons | `/icon-192.png` (192×192), `/icon-512.png` (512×512), `purpose: any` |

One manifest for all locales. Locale after install uses existing path routing.
Maskable icons are **not** claimed (assets are not maskable-safe).

Served at `/manifest.webmanifest` via the App Router `manifest.ts` route.

## Service worker

| Concern | Detail |
| --- | --- |
| File | `/sw.js` |
| Scope | `/` |
| Register | Production only, after `load`, via `ServiceWorkerManager` |
| Dev | Unregisters leftover workers + clears `tarkovdex-*` caches |
| Cache-Control | `public, max-age=0, must-revalidate` (see `next.config.ts`) |

### Cache namespaces

Central version: `PWA_CACHE_VERSION = 1`

- `tarkovdex-static-v1`
- `tarkovdex-pages-v1`
- `tarkovdex-data-v1`
- `tarkovdex-images-v1`

Activate deletes only `tarkovdex-*` names that are not in the current set.
Other origins’ caches are never touched.

### Strategies

| Target | Strategy | Notes |
| --- | --- | --- |
| `/_next/static/*`, icons, offline.html | cache-first | Same-origin GET, 2xx only |
| HTML navigations | network-first | Offline → last page cache → `/offline.html` |
| `/api/items`, `/api/tasks`, `/api/search` | network-first | Marked with SW headers when served from cache |
| Same-origin images under `/images/` | cache-first | Caps apply; no opaque cross-origin |
| POST/PUT/PATCH/DELETE | bypass | Never handled |
| External origins | bypass | Never cached |
| `/api/cron/*`, `/admin`, `/sw.js` | bypass | |

### Runtime limits (initial)

| Bucket | Max entries |
| --- | --- |
| pages | 30 |
| data (items/tasks) | 80 |
| search | 40 |
| images | 100 |
| news HTML | 10 (via pages/data path limits) |
| body size | 2.5 MB |

Tracking query params (`utm_*`, `gclid`, …) are stripped from cache keys.
Significant keys (`q`, `mode`, `locale`, `ids`, `domain`, …) are never stripped.

### cachedAt contract

When writing a cache entry, the SW adds:

- `X-TarkovDex-Cached-At: <ISO-8601>` — storage time in Cache Storage

When serving from cache:

- `X-TarkovDex-From-SW-Cache: 1`

These headers are **delivery metadata**. They do not replace
`sourceUpdatedAt` / `fetchedAt` / `generatedAt` in API bodies.

UI copy:

- 콘텐츠 갱신 시각 → `sourceUpdatedAt`
- 오프라인 저장 시각 → `X-TarkovDex-Cached-At`
- Cached prices use `CachedDataNotice` (“마지막 저장된 가격”), never “현재 가격” alone.

## Connectivity contract

`src/lib/offline-status.ts` + `ConnectivityProvider`:

| State | Meaning |
| --- | --- |
| `online` | Recent successful network fetch (not SW-cache) |
| `offline` | Browser offline and/or confirmed fetch failure |
| `degraded` | Partial failure or SW-cache delivery while “online” |
| `unknown` | No real network evidence yet |

`navigator.onLine === true` alone never asserts `online`.

## Update lifecycle

1. New SW installs → enters `waiting` (no auto `skipWaiting` on install).
2. Banner: “새 버전을 사용할 수 있습니다” / Apply / Later.
3. Apply → `postMessage({ type: 'SKIP_WAITING' })` → `controllerchange` → **one** reload.
4. No forced reload while the user is editing.

## Install UX

`beforeinstallprompt` only. Button hidden when unsupported, already
standalone, or kill switch off. iOS “Add to Home Screen” is not guessed.

## Cache clear vs user data reset

On `/[locale]/local-data`:

- **오프라인 캐시 삭제** → `CLEAR_CACHES` message → deletes `tarkovdex-*` only.
- **사용자 데이터 초기화** → existing localStorage reset.

Never the same button.

## Kill switch / rollback

1. Set `NEXT_PUBLIC_PWA_ENABLED=false` in the environment.
2. Redeploy (value is inlined as `NEXT_PUBLIC_*`).
3. Clients on next visit: skip register, unregister workers, delete
   `tarkovdex-*` caches.
4. Site continues as a normal website.

Emergency: bump `PWA_CACHE_VERSION` and ship a fixed `sw.js`, or serve a
no-op `sw.js` that clears caches then unregisters (document in the deploy
checklist).

## Development

`next dev` does **not** register. Opening a production build after a prior
SW registration: with kill switch or non-production env, leftovers are
unregistered.

Verify PWA behaviour against `next build && next start` on localhost
(secure context), not `next dev`.

## Offline fallback

`/offline.html` — static, `noindex`, embedded ko/en/zh catalog, no network
required. SW uses it when navigation fails and no page cache exists.

## Precache

Minimal: `offline.html`, `icon-192.png`, `icon-512.png`, `favicon.ico`.
No full catalog, search index, or news corpus precache.

## Phase 9 contracts

Release sequencing lives in
[`tarkovdex-release-checklist.md`](tarkovdex-release-checklist.md).

**Re-verified locally (2026-08-03, `next start`):** SW register + control,
offline home banner, update drill (`CACHE_VERSION` 1→2 → `SKIP_WAITING` →
`tarkovdex-*-v2` with old v1 cleaned), kill switch (unregister + clear
`tarkovdex-*`, `tarkovdex:v1` schema 5 preserved), First Load JS still **103 kB**,
SW headers (`max-age=0, must-revalidate`, `Service-Worker-Allowed: /`).

**Still 미검증 / partial:** Chromium `beforeinstallprompt`, Safari/iOS Add to
Home Screen, full offline tour of every personal tool, VisualViewport soft
keyboard, dual-tab UI click-through beyond `storage` event + unit tests.

Cached prices/news must never read as live — use SW response headers +
`CachedDataNotice` / connectivity banner wording.
