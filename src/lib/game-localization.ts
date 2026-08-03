/**
 * Shared display-layer glossary for game terms the API leaves raw or
 * untranslated: ammo caliber enums, armor material enums, and the handful of
 * boss names missing from json.tarkov.dev's Korean dictionary. Keyed on
 * stable raw values / mob ids — never on already-translated display strings.
 * Plain module (no 'server-only') so both server mapping code and client
 * components can import it.
 */

import taskTextKo from './task-ko.json';

const TASK_TEXT_KO: Record<string, string> = taskTextKo;

/** Every caliber value confirmed in a live `regular/items` fetch (30 total),
 * mapped to the familiar cartridge designation. Locale-invariant except
 * shotgun gauges. Unknown future values fall back via `formatCaliber`. */
const CALIBER_LABELS: Record<string, string> = {
  Caliber1143x23ACP: '.45 ACP',
  Caliber127x33: '.50 AE',
  Caliber127x55: '12.7×55mm',
  Caliber127x99: '.50 BMG',
  Caliber12g: '12g', // gauge — localized below
  Caliber20g: '20g',
  Caliber20x1mm: '20×1mm',
  Caliber23x75: '23×75mm',
  Caliber26x75: '26×75mm',
  Caliber366TKM: '.366 TKM',
  Caliber40mmRU: '40mm RU',
  Caliber40x46: '40×46mm',
  Caliber46x30: '4.6×30mm',
  Caliber545x39: '5.45×39mm',
  Caliber556x45NATO: '5.56×45mm NATO',
  Caliber57x28: '5.7×28mm',
  Caliber68x51: '6.8×51mm',
  Caliber762x25TT: '7.62×25mm TT',
  Caliber762x35: '.300 Blackout',
  Caliber762x39: '7.62×39mm',
  Caliber762x51: '7.62×51mm',
  Caliber762x54R: '7.62×54mmR',
  Caliber784x49: '7.84×49mm',
  Caliber86x70: '.338 Lapua Magnum',
  Caliber93x64: '9.3×64mm',
  Caliber9x18PM: '9×18mm PM',
  Caliber9x19PARA: '9×19mm',
  Caliber9x21: '9×21mm',
  Caliber9x33R: '.357 Magnum',
};

const GAUGE_LABELS: Record<string, Record<string, string>> = {
  Caliber12g: { ko: '12 게이지', en: '12 Gauge', zh: '12号口径' },
  Caliber20g: { ko: '20 게이지', en: '20 Gauge', zh: '20号口径' },
};

/** User-facing caliber label. Internal filter/query values should keep the
 * raw enum; only display goes through here. Unknown values get a generic
 * `Caliber9x39 → 9×39` prettification, else the raw string. */
export function formatCaliber(raw: string, locale: string): string {
  const gauge = GAUGE_LABELS[raw]?.[locale] ?? GAUGE_LABELS[raw]?.en;
  if (gauge) return gauge;
  const known = CALIBER_LABELS[raw];
  if (known) return known;
  const generic = raw.match(/^Caliber(\d+(?:\.\d+)?)x(\d+)(.*)$/);
  if (generic) {
    return `${generic[1]}×${generic[2]}${generic[3] ? ` ${generic[3]}` : ''}`;
  }
  return raw.replace(/^Caliber/, '');
}

/** Armor material enums confirmed in a live fetch (8 total). */
const MATERIAL_LABELS: Record<string, Record<string, string>> = {
  Aramid: { ko: '아라미드', en: 'Aramid', zh: '芳纶' },
  Aluminium: { ko: '알루미늄', en: 'Aluminium', zh: '铝' },
  ArmoredSteel: { ko: '장갑강', en: 'Armored steel', zh: '装甲钢' },
  Ceramic: { ko: '세라믹', en: 'Ceramic', zh: '陶瓷' },
  Combined: { ko: '복합 소재', en: 'Combined materials', zh: '复合材料' },
  Glass: { ko: '방탄유리', en: 'Glass', zh: '防弹玻璃' },
  Titan: { ko: '티타늄', en: 'Titanium', zh: '钛' },
  UHMWPE: { ko: '초고분자량 폴리에틸렌(UHMWPE)', en: 'UHMWPE', zh: '超高分子量聚乙烯（UHMWPE）' },
};

/** User-facing armor material label; unknown raw values pass through. */
export function localizeMaterial(raw: string | null, locale: string): string | null {
  if (!raw) return null;
  return MATERIAL_LABELS[raw]?.[locale] ?? MATERIAL_LABELS[raw]?.en ?? raw;
}

/** Soft-armor layer/slot display names whose ko dictionary entries come back
 * in English (confirmed live: 15 of 20 distinct names). Keyed on that English
 * text — the underlying dictionary keys are per-item ids, so the English
 * label is the only stable, meaningful key. Unmapped names pass through. */
const ARMOR_LAYER_NAMES_KO: Record<string, string> = {
  'FR. PLATE': '앞쪽 방탄판',
  'BK. PLATE': '뒤쪽 방탄판',
  'L. PLATE': '왼쪽 방탄판',
  'R. PLATE': '오른쪽 방탄판',
  'Aramid insert': '아라미드 삽입재',
  'Hybrid composite materials': '하이브리드 복합 소재',
  'Layers of aramid fiber': '아라미드 섬유층',
  'Armor steel': '장갑강',
  'Armor steel insert': '장갑강 삽입재',
  'Layer of UHMWPE': '초고분자량 폴리에틸렌층',
  'Layer of plastic': '플라스틱층',
  'Aluminum insert': '알루미늄 삽입재',
  'Built-in face shield': '내장 페이스 실드',
  'Composite armor plate': '복합 장갑판',
  'Titanium alloy': '티타늄 합금',
  '1.25 mm aramid insert and titanium plates': '1.25 mm 아라미드 삽입재 및 티타늄판',
  '6.5 mm aramid insert and titanium plates': '6.5 mm 아라미드 삽입재 및 티타늄판',
  '13 mm aramid insert and ceramic plates': '13 mm 아라미드 삽입재 및 세라믹판',
};

/** Localize a soft-armor layer/plate-slot display name; passthrough when
 * unknown or when the API already localized it. */
export function localizeArmorLayerName(name: string, locale: string): string {
  if (locale === 'ko') return ARMOR_LAYER_NAMES_KO[name] ?? name;
  return name;
}

/**
 * json.tarkov.dev's Korean item dictionary currently leaves every ballistic
 * plate and several newer body armors in English. Two entries also carry an
 * upstream factual mismatch, so those are corrected by stable item id before
 * the conservative term-level fallback is applied.
 */
const ARMOR_ITEM_NAMES_KO_BY_ID: Record<string, string> = {
  '5ab8dced86f774646209ec87': 'ANA Tactical M2 플레이트 캐리어 (OD Green)',
  '69cfef0d6242b966d40803e7': 'FORT Redut-M 방탄복 (검정)',
};

const ARMOR_ITEM_TERMS_KO: Array<[RegExp, string]> = [
  [/\bplate carrier\b/gi, '플레이트 캐리어'],
  [/\bbody armor\b/gi, '방탄복'],
  [/\bassault armor\b/gi, '강습 방탄복'],
  [/\barmored rig\b/gi, '방탄 리그'],
  [/\bballistic plates?\b/gi, '방탄판'],
  [/\blevel\b/gi, '레벨'],
  [/\(Front\)/gi, '(전면)'],
  [/\(Back\)/gi, '(후면)'],
  [/\(Side\)/gi, '(측면)'],
  [/\(Replica\)/gi, '(레플리카)'],
  [/Goons Edition/gi, '군즈 에디션'],
  [/Christmas Edition/gi, '크리스마스 에디션'],
  [/Head Eyes/gi, '헤드 아이즈'],
  [/바디 아머/g, '방탄복'],
];

/** Localize body-armor and ballistic-plate item names without altering brand
 * names, camouflage names, or already-localized Korean text. */
export function localizeArmorItemName(
  itemId: string,
  translated: string,
  locale: string,
): string {
  if (locale !== 'ko') return translated;
  const corrected = ARMOR_ITEM_NAMES_KO_BY_ID[itemId];
  if (corrected) return corrected;
  return ARMOR_ITEM_TERMS_KO.reduce(
    (name, [pattern, replacement]) => name.replace(pattern, replacement),
    translated,
  );
}

/** Korean names for the mobs json.tarkov.dev's ko dictionary leaves in
 * English (confirmed live: Knight, Partisan, Kaban, Kollontay, etc. come back
 * untranslated). Keyed by stable mob id, applied only when the API's own
 * dictionary produced no Hangul — so the API wins as soon as it catches up. */
const MOB_NAMES_KO: Record<string, string> = {
  bossKnight: '나이트',
  bossPartisan: '파르티잔',
  bossBoar: '카반',
  bossBoarSniper: '카반 경호 저격수',
  bossKolontay: '콜론타이',
  bossTagillaAgro: '타길라의 그림자',
  bossKillaAgro: '복수의 킬라',
  bossBullyBlackDiv: '블랙 디비전 보스',
  pmcBotBlackDiv: '블랙 디비전 레이더',
  bossWedge: '웨지',
  bossWedgeLab: '웨지 (연구소)',
  followerBigPipe: '빅 파이프',
  followerBirdEye: '버드아이',
};

const HAS_HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/;

/** Fix a mob/boss display name after the API dictionary lookup. Only fills
 * the gap for ko when the dictionary result contains no Hangul. */
export function localizeMobName(
  mobId: string,
  translated: string,
  locale: string,
): string {
  if (locale === 'ko' && !HAS_HANGUL.test(translated)) {
    return MOB_NAMES_KO[mobId] ?? translated;
  }
  return translated;
}

/**
 * Korean quest names and objective descriptions for the ~220 quests and ~540
 * objectives json.tarkov.dev's `tasks_ko` dictionary still returns in English.
 * Keyed on that English text — the underlying dictionary keys are per-task
 * ids, so the English string is the stable, meaningful key (same reasoning as
 * ARMOR_LAYER_NAMES_KO above).
 *
 * Generated offline by `scripts/generate-task-ko.mjs`; re-run it after a patch
 * adds quests. Applied only when the API's own dictionary produced no Hangul,
 * so upstream wins as soon as it catches up.
 */
export function localizeTaskText(translated: string, locale: string): string {
  if (locale === 'ko' && !HAS_HANGUL.test(translated)) {
    return TASK_TEXT_KO[translated] ?? translated;
  }
  return translated;
}
