# TarkovDex

An **unofficial** Escape from Tarkov dashboard, deployed at
[tarkovdex.dev](https://tarkovdex.dev). A live dashboard plus three topic
pages:

- **작전 시간 (raid time)** — both in-game time variants, live, home page only
- **보스 스폰률 (boss spawn rates)** — spawn chances, every map
- **은신처 제작 (hideout crafts)** — the most profitable craft per station
- **건스미스 (Gunsmith)** — one complete solved build per quest

Korean and English, with PvP, PvE and seasonal PvP data side by side. Game data
comes from the public static JSON API at
[json.tarkov.dev](https://json.tarkov.dev). TarkovDex is not affiliated with
Battlestate Games.

## Routes

| Route | What it is |
| --- | --- |
| `/[locale]` | Dashboard — raid clock, top crafts, mainline map bosses |
| `/[locale]/bosses` | Boss spawn rates, every map |
| `/[locale]/hideout` | Craft profit, every station |
| `/[locale]/gunsmith` | Gunsmith build guide |
| `/[locale]/support` | Ko-fi donation page |
| `/[locale]/privacy` | Privacy policy — required to serve ads |
| `/api/board?view=…` | JSON the live boards poll |

The home page's two data sections are summaries — six crafts, nine maps — and
each links to the full page. The projection happens server-side, so the summary
and the full page can never disagree about a number.

Old addresses with a successor 308 to it (`/maps` → `/bosses`,
`/progression/gunsmith` → `/gunsmith`, `/economy/crafts` → `/hideout`);
everything else retired (`/news`, `/combat/*`, `/status`, `/about`, …) goes to
the dashboard. Both lists are in `next.config.ts`.

## Game modes

Three, selected once in the header and read by every board:

| Mode | Upstream segment |
| --- | --- |
| PvP | `regular` |
| PvE | `pve` |
| PvP S (seasonal) | `TARKOV_SEASONAL_PATH`, default `seasonal` |

All three are fetched server-side and travel in one payload, so switching mode
is a re-render and never a request. The seasonal segment is an environment
variable because BSG renames it between seasons; when it does not resolve, the
boards for that mode say they could not load rather than falling back to PvP
numbers — a seasonal wipe has its own economy and its own boss table, so
borrowed numbers would be worse than none.

Gunsmith builds are solved offline per mode (`src/lib/gunsmith-builds.json`).
A mode with no solved builds reports that, which is a different message from a
failed load.

## How "live" works, precisely

The page server-renders its first paint (ISR, 10-minute window) so it is
useful and crawlable without JavaScript. After mount, `useLiveBoard` polls
`/api/board` every 60 seconds, immediately on the tab becoming visible, and on
the browser coming back online. Polling stops entirely while the tab is hidden.

The Gunsmith page does not poll at all: a solved build changes when the shipped
snapshot is regenerated, not minute to minute, so a refresh there would only
redraw an identical parts list.

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
stay identical (151 keys). Chinese stays implemented but unpublished — `/zh`
redirects to `/ko` in middleware, and it is absent from the sitemap and
hreflang. See [CLAUDE.md](./CLAUDE.md) for architecture and decision history.

## A note on `public/sw.js`

It is a kill switch, not a service worker. The old PWA registered a real one
in visitors' browsers; deleting the file would not have removed it, and those
browsers would keep serving the old cached site. The replacement clears every
cache, unregisters itself, and reloads. Leave it in place.
