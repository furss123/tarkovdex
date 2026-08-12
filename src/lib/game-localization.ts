/**
 * Shared display-layer glossary for game terms the API leaves untranslated.
 * Keyed on stable raw values / mob ids — never on already-translated display
 * strings. Plain module (no 'server-only') so both server mapping code and
 * client components can import it.
 *
 * Scope note: the caliber and armor-material glossaries were removed with the
 * ammo and armor routes. The boss-name gap (dashboard spawn board) and the
 * quest-text gap (gunsmith quest names) remain, because both are still
 * rendered and both are still incomplete upstream.
 */
import TASK_TEXT_KO from '@/lib/task-ko.json';

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
 * Fill upstream's Korean quest-text gap. `tasks_ko` returns a large share of
 * quest names byte-identical to English (audited live), so a static glossary
 * generated offline by `scripts/generate-task-ko.mjs` supplies the Korean —
 * but only when the API's own lookup produced no Hangul, so upstream wins the
 * moment it catches up. Keyed on the English text because the underlying
 * dictionary keys are per-task ids.
 */
export function localizeTaskText(translated: string, locale: string): string {
  if (locale === 'ko' && !HAS_HANGUL.test(translated)) {
    return (TASK_TEXT_KO as Record<string, string>)[translated] ?? translated;
  }
  return translated;
}
