# TarkovDex

TarkovDex is an unofficial Escape from Tarkov data toolkit for Korean,
Simplified Chinese, and English players. It supports PvP and PvE data
side-by-side and is deployed at [tarkovdex.dev](https://tarkovdex.dev).

Game data comes from the public static JSON API at
[json.tarkov.dev](https://json.tarkov.dev). TarkovDex is not affiliated with
Battlestate Games.

## Features and routes

- `/[locale]/news` — official Steam patches and event news
- `/[locale]/economy/items` — flea prices, trader value, and value per slot
- `/[locale]/economy/barters` — hideout craft profit rankings by station
- `/[locale]/progression/tasks` — quest explorer
- `/[locale]/progression/gunsmith` — structured Gunsmith part candidates
- `/[locale]/combat/ammo` — ammo stats and armor-class performance matrix
- `/[locale]/combat/armor` — armor layers, compatible plates, and hitboxes
- `/[locale]/maps` — raid and boss data

The old `/[locale]/items` and `/[locale]/tasks` addresses permanently redirect
to their new routes. `/economy`, `/progression`, and `/combat` redirect to the
representative tool in each category.

## Data and calculation policy

- External documents are normalized on the server into feature-specific DTOs.
  Heavy weapon and armor properties are not added to the lightweight item DTO.
- Missing prices stay `null`; calculations with incomplete inputs show the
  missing item names instead of treating them as zero.
- Flea fees and craft operating costs are explicit user-adjustable planning
  inputs. Fuel/power costs are not invented.
- Ammo cells are transparent performance grades, not fabricated penetration
  probabilities.
- Gunsmith results are labeled current-data candidates. Exact final weapon
  stats and global optimality are not claimed where current authoritative
  formulas or a complete nested search are unavailable.
- Price-backed item/barter/craft documents and routes revalidate every 15
  minutes; slower structural game data uses a six-hour per-runtime cache.
  Original source update timestamps remain visible.

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
| `npm test` | Run pure calculation and normalization tests |

UI messages live in `messages/{ko,zh,en}.json`; their leaf-key schemas must stay
identical. See [CLAUDE.md](./CLAUDE.md) for the detailed architecture and
decision history.
