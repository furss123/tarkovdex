import type { TranslationStyleCheck } from '@/types/newsroom';
import { terminologyWarnings } from './news-translation-glossary';

const LITERAL = [/기쁜 마음으로 알려드립니다/, /설치가 시작되었습니다/, /참여할 기회를 놓치지 마세요/, /플레이어 여러분께서는/];
const CLICHE = [/주목할 만한/, /흥미로운/, /몰입감 넘치는/, /핵심 내용을 살펴보면/, /주요 내용은 다음과 같습니다/, /종합하면/];
const MARKETING = [/놓치지 마세요/, /많은 관심 부탁드립니다/, /기대해 주세요/, /새롭고 특별한/, /놀라운 소식/];

function unsupportedNumbers(source: string, translated: string): boolean {
  const sourceNumbers = new Set(source.match(/\d+(?:[.:]\d+)*/g) ?? []);
  return (translated.match(/\d+(?:[.:]\d+)*/g) ?? []).some((value) => !sourceNumbers.has(value));
}

export function checkTranslationStyle(input: {
  sourceText: string; title: string; summary: string; facts: string[]; previousSummaries?: string[];
}): TranslationStyleCheck {
  const output = `${input.title}\n${input.summary}\n${input.facts.join('\n')}`;
  const hasLiteralTranslationPattern = LITERAL.some((pattern) => pattern.test(output));
  const hasAICliche = CLICHE.some((pattern) => pattern.test(output));
  const hasExcessiveHonorifics = (output.match(/하시기 바랍니다|해 주시기 바랍니다/g) ?? []).length > 0;
  const hasMarketingLanguage = MARKETING.some((pattern) => pattern.test(output));
  const hasRepeatedSentencePattern = (input.previousSummaries ?? []).filter((summary) => summary.slice(0, 16) === input.summary.slice(0, 16)).length >= 2;
  const hasUnsupportedFact = unsupportedNumbers(input.sourceText, output);
  const important = input.sourceText.match(/\d+(?:[.:]\d+)*(?:\s*(?:hours?|minutes?|days?|%))?/gi) ?? [];
  const hasMissingImportantFact = important.some((fact) => !output.toLowerCase().includes(fact.toLowerCase()));
  const hasTerminologyMismatch = terminologyWarnings(input.sourceText, output).length > 0;
  const isOverlongForSource = output.length > Math.max(240, input.sourceText.length * 1.45);
  const requiresReview = hasLiteralTranslationPattern || hasAICliche || hasUnsupportedFact || hasMissingImportantFact || hasTerminologyMismatch || isOverlongForSource;
  return { hasLiteralTranslationPattern, hasAICliche, hasExcessiveHonorifics, hasMarketingLanguage,
    hasRepeatedSentencePattern, hasUnsupportedFact, hasMissingImportantFact, hasTerminologyMismatch,
    isOverlongForSource, requiresReview };
}
