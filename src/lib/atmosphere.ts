import type { StaticImageData } from 'next/image';
import customs from '../../public/images/atmosphere/customs.webp';
import factory from '../../public/images/atmosphere/factory.webp';
import streets from '../../public/images/atmosphere/streets.webp';
import woods from '../../public/images/atmosphere/woods.webp';

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
 */
export const MAP_ATMOSPHERE: Record<string, StaticImageData> = {
  '55f2d3fd4bdc2d5f408b4567': factory, // Factory
  '59fc81d786f774390775787e': factory, // Night Factory
  '56f40101d2720b2a4d8b45d6': customs, // Customs
  '5704e3c2d2720bac5b8b4567': woods, // Woods
  '5714dc692459777137212e12': streets, // Streets of Tarkov
};

/** Hero / page-header texture. The factory interior is the most neutral of the
 * four (no distinctive skyline or foliage), so it reads as atmosphere rather
 * than as "this section is about Factory". */
export const HERO_ATMOSPHERE = factory;
