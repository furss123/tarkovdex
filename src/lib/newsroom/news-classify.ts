import type { NewsCategoryV2, NewsGame, NewsSection, OfficialSourcePost } from '@/types/newsroom';

export interface NewsClassification {
  section: NewsSection;
  category: NewsCategoryV2;
  tags: string[];
  game: NewsGame;
  gameModes: Array<'regular' | 'pve'>;
  confidence: 'high' | 'medium' | 'low';
}

const RULES: Array<[NewsCategoryV2, RegExp]> = [
  ['drops', /twitch\s*drops?|drops? event/i], ['sale', /\bdiscount|\bsale\b|скидк/i],
  ['tournament', /tournament|cup series|турнир|esports/i], ['contest', /contest|competition|конкурс/i],
  ['expo', /gamescom|game show|expo|pax|chinajoy|выставк/i], ['broadcast', /broadcast|livestream|streaming|трансляц/i],
  ['trailer', /trailer|трейлер/i], ['teaser', /teaser|тизер/i],
  ['hotfix', /hotfix|хотфикс/i], ['maintenance', /maintenance|technical works?|installation (?:has begun|will)|техническ|установк/i],
  ['outage', /outage|server (?:issue|problem)|connection issue|недоступ|проблем.*сервер/i],
  ['patch', /patch(?:notes)?\s*[\d.]|патч\s*[\d.]/i], ['quest', /\bquest|\btask|задани/i],
  ['trader', /\btrader|merchant|торгов/i], ['economy', /flea market|econom|барахолк|эконом/i],
  ['ammo', /ammunition|\bammo\b|боеприпас/i], ['armor', /\barmor|брон/i], ['boss', /\bboss|босс/i],
  ['map', /\bmap\b|location|карт|локаци/i], ['season-wipe', /\bwipe\b|new season|сезон|вайп/i],
  ['account-security', /two-factor|2fa|account security|cheater|безопасност|читер/i],
  ['xp-reward', /experience points?|\bxp\b|reward increase|опыт|наград/i],
  ['event', /in-game event|event (?:has|is|will)|ивент|событи/i],
  ['video', /youtube|official video|episode|интервью|видео/i], ['merchandise', /merch|мерч/i],
];

const MEDIA = new Set<NewsCategoryV2>([
  'video', 'trailer', 'teaser', 'broadcast', 'expo', 'tournament', 'esports',
  'contest', 'drops', 'sale', 'merchandise', 'community', 'company', 'other-promo',
]);

export function classifyOfficialPost(post: Pick<OfficialSourcePost, 'normalizedText' | 'mediaKinds'>): NewsClassification {
  const text = post.normalizedText;
  const first = RULES.find(([, pattern]) => pattern.test(text));
  let category: NewsCategoryV2 = first?.[0] ?? (post.mediaKinds.includes('video') ? 'video' : 'other-game');
  if (/(?:patch|патч)\s*(?:version\s*)?[0-9]+(?:\.[0-9]+){1,4}/i.test(text) && category !== 'hotfix') category = 'patch';
  // A patch trailer is game news only when the copy actually describes a patch/change.
  if ((category === 'trailer' || category === 'video') && /patch\s*[\d.]|patch notes|патч\s*[\d.]/i.test(text)) {
    category = 'patch';
  }
  const section: NewsSection = MEDIA.has(category) ? 'media-promo' : 'game';
  const hasEft = /#?escapefromtarkov|\bEFT\b/i.test(text);
  const hasArena = /#?tarkovarena|EFT:\s*Arena|\bArena\b/i.test(text);
  const game: NewsGame = hasEft && hasArena ? 'both' : hasArena ? 'arena' : hasEft ? 'eft' : 'unknown';
  const modes: Array<'regular' | 'pve'> = [];
  if (/\bPvP\b/i.test(text)) modes.push('regular');
  if (/\bPvE\b/i.test(text)) modes.push('pve');
  const tags = [...new Set([
    section, category, ...(post.mediaKinds.includes('video') ? ['video'] : []),
    ...(game === 'eft' || game === 'both' ? ['eft'] : []), ...(game === 'arena' || game === 'both' ? ['arena'] : []),
  ])];
  return { section, category, tags, game, gameModes: modes, confidence: first ? 'high' : 'low' };
}
