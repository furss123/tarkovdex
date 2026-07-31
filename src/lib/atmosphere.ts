import type { StaticImageData } from 'next/image';
import customs from '../../public/images/atmosphere/customs.webp';
import factory from '../../public/images/atmosphere/factory.webp';
import streets from '../../public/images/atmosphere/streets.webp';
import woods from '../../public/images/atmosphere/woods.webp';
import groundZero from '../../public/images/atmosphere/ground-zero.webp';
import icebreaker from '../../public/images/atmosphere/icebreaker.webp';
import interchange from '../../public/images/atmosphere/interchange.webp';
import lighthouse from '../../public/images/atmosphere/lighthouse.webp';
import reserve from '../../public/images/atmosphere/reserve.webp';
import shoreline from '../../public/images/atmosphere/shoreline.webp';
import terminal from '../../public/images/atmosphere/terminal.webp';
import theLab from '../../public/images/atmosphere/the-lab.webp';
import theLabyrinth from '../../public/images/atmosphere/the-labyrinth.webp';

/**
 * Generic dark/industrial atmosphere art, used purely as section identity —
 * never as data. These are AI-generated environment images shipped with the
 * project, **not** Escape from Tarkov screenshots and not official art (see
 * CLAUDE.md > Legal: this is an unofficial fan project, so no BSG imagery is
 * pulled in for decoration).
 *
 * Keyed by **map id**, not localized name or `normalizedName`, for the same
 * reason `BossSpawnBoard`'s `POPULAR_MAP_IDS` is: ids are stable across ko/zh/en
 * and across PvP/PvE, so a map can never pick up another map's artwork because
 * of a translation change. Maps absent from this table deliberately render with
 * no image rather than a stand-in — art for the wrong map would be worse than
 * none.
 *
 * `alt` is intentionally empty everywhere these are used: each image sits
 * directly beside the heading it decorates (the map name, or the page H1), so
 * describing the scenery to a screen reader adds noise, not information.
 *
 * Variant maps reuse their base map's art instead of a new asset (Night
 * Factory -> factory, The Lab (Dark) -> the-lab, Ground Zero 21+ / Ground
 * Zero Tutorial -> ground-zero) — same rationale as the original
 * Factory/Night Factory pairing.
 */
export const MAP_ATMOSPHERE: Record<string, StaticImageData> = {
  '55f2d3fd4bdc2d5f408b4567': factory, // Factory
  '59fc81d786f774390775787e': factory, // Night Factory
  '56f40101d2720b2a4d8b45d6': customs, // Customs
  '5704e3c2d2720bac5b8b4567': woods, // Woods
  '5714dc692459777137212e12': streets, // Streets of Tarkov
  '5704e4dad2720bb55b8b4567': lighthouse, // Lighthouse
  '5704e554d2720bac5b8b456e': shoreline, // Shoreline
  '5704e5fad2720bc05b8b4567': reserve, // Reserve
  '5714dbc024597771384a510d': interchange, // Interchange
  '5b0fc42d86f7744a585f9105': theLab, // The Lab
  '6a294a5b5eb5f9a1700417b7': theLab, // The Lab (Dark)
  '653e6760052c01c1c805532f': groundZero, // Ground Zero
  '65b8d6f5cdde2479cb2a3125': groundZero, // Ground Zero 21+
  '68236e8153654e8c1200798a': groundZero, // Ground Zero Tutorial
  '65cc8f81a9aac3e77d0cfd3e': terminal, // Terminal
  '6733700029c367a3d40b02af': theLabyrinth, // The Labyrinth
  '69af492a4819ea4ba10a69c5': icebreaker, // Icebreaker
};

/** Hero / page-header texture. The factory interior is the most neutral of the
 * four (no distinctive skyline or foliage), so it reads as atmosphere rather
 * than as "this section is about Factory". */
export const HERO_ATMOSPHERE = factory;
