import type { TranslationGlossaryEntry } from '@/types/newsroom';

export const NEWS_TRANSLATION_GLOSSARY: TranslationGlossaryEntry[] = [
  { sourceTerms: ['wipe'], ko: '초기화' },
  { sourceTerms: ['trader'], ko: '상인' },
  { sourceTerms: ['Flea Market'], ko: '플리마켓' },
  { sourceTerms: ['task', 'quest'], ko: '퀘스트' },
  { sourceTerms: ['raid'], ko: '레이드' },
  { sourceTerms: ['Scav'], ko: '스캐브' },
  { sourceTerms: ['hideout'], ko: '은신처' },
  { sourceTerms: ['boss'], ko: '보스' },
  { sourceTerms: ['hotfix'], ko: '핫픽스' },
  { sourceTerms: ['maintenance'], ko: '점검' },
  { sourceTerms: ['Escape from Tarkov', 'EFT', 'EFT: Arena', 'PMC', 'PvP', 'PvE', 'Twitch Drops'], ko: '', preserveOriginal: true },
];

export function terminologyWarnings(source: string, translated: string): string[] {
  const warnings: string[] = [];
  for (const entry of NEWS_TRANSLATION_GLOSSARY) {
    const used = entry.sourceTerms.some((term) => source.toLowerCase().includes(term.toLowerCase()));
    if (!used) continue;
    if (entry.preserveOriginal) {
      const missing = entry.sourceTerms.find((term) => source.includes(term) && !translated.includes(term));
      if (missing) warnings.push(`preserve:${missing}`);
    } else if (entry.ko && !translated.includes(entry.ko)) warnings.push(`term:${entry.ko}`);
  }
  return warnings;
}
