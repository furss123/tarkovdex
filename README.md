# TarkovDex

An **unofficial** Escape from Tarkov dashboard, deployed at
[tarkovdex.dev](https://tarkovdex.dev). One page, three things:

- **작전 시간 (raid time)** — both in-game time variants, live
- **보스 스폰률 (boss spawn rates)** — spawn chances on the main maps
- **하이드아웃 최적 생산품 (hideout crafts)** — the most profitable craft per station

Korean and English, with PvP and PvE data side by side. Game data comes from
the public static JSON API at [json.tarkov.dev](https://json.tarkov.dev).
TarkovDex is not affiliated with Battlestate Games.

## Routes

| Route | What it is |
| --- | --- |
| `/[locale]` | The dashboard. Everything is here. |
| `/[locale]/support` | Ko-fi donation page |
| `/[locale]/privacy` | Privacy policy — required to serve ads |
| `/api/dashboard` | JSON the dashboard polls for live updates |

Every retired section (`/news`, `/economy/*`, `/progression/*`, `/combat/*`,
`/maps`, `/status`, `/about`, …) 301s to the dashboard — see
`RETIRED_SECTIONS` in `next.config.ts`.

## How "live" works, precisely

The page server-renders its first paint (ISR, 10-minute window) so it is
useful and crawlable without JavaScript. After mount, `useLiveDashboard`
polls `/api/dashboard` every 60 seconds, immediately on the tab becoming
visible, and on the browser coming back online. Polling stops entirely while
the tab is hidden.

Two timestamps are shown, and they are not the same thing:

- **가격 기준 시각 (prices as of)** — upstream's own content timestamp. This is
  the number that decides whether acting on the ranking is sane.
- **갱신 (synced)** — when we last asked.

A recent sync over a day-old price stamp is still day-old data. Upstream
regenerates its dumps on its own schedule, so polling faster than that would
only redraw identical numbers — the honest ceiling on freshness is
json.tarkov.dev's, not ours.

Raid time is not fetched at all: it is client-side math off `Date.now()` at
Tarkov's fixed 7x rate, so it keeps running even if every request fails.

Boss spawn rates are structural — they change with a patch or an event, not
minute to minute. They ride the same payload for convenience, not because
they move.

## Monetization

Both paths are wired but inert until configured:

| Variable | Effect when set |
| --- | --- |
| `NEXT_PUBLIC_ADSENSE_CLIENT` | Loads the AdSense script and enables the in-content slot |
| `NEXT_PUBLIC_ADSENSE_SLOT_MAIN` | The slot id for that unit |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Contact address on the privacy policy |

With `NEXT_PUBLIC_ADSENSE_CLIENT` unset, no third-party script is loaded and
`AdSlot` renders nothing — no empty box, no broken tag. `NEXT_PUBLIC_*` values
are inlined at build time, so setting one requires a redeploy.

Before applying to AdSense, replace the placeholder publisher id in
`public/ads.txt` and uncomment that line.

## Development

Requires Node.js 18.18 or newer.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000` (the root redirects to `/ko`).

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run build` | Create the production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | Run strict TypeScript checking |
| `npm run lint` | Run Next ESLint rules |

Verify layout against `next start`, not `next dev` — in dev, Next keeps a
hidden copy of the previous route in the DOM and `getBoundingClientRect()`
reads a `display: none` subtree, reporting zeros.

UI messages live in `messages/{ko,zh,en}.json`; their leaf-key schemas must
stay identical (89 keys). Chinese stays implemented but unpublished — `/zh`
redirects to `/ko` in middleware, and it is absent from the sitemap and
hreflang. See [CLAUDE.md](./CLAUDE.md) for architecture and decision history.

## A note on `public/sw.js`

It is a kill switch, not a service worker. The old PWA registered a real one
in visitors' browsers; deleting the file would not have removed it, and those
browsers would keep serving the old cached site. The replacement clears every
cache, unregisters itself, and reloads. Leave it in place.
