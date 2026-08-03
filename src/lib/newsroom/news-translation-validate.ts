import type { NewsTranslationDraft, OfficialSourcePost } from '@/types/newsroom';
import { checkTranslationStyle } from './news-translation-style';

export interface TranslationValidationResult { valid: boolean; errors: string[]; }

function validOptionalInstant(value: string | undefined): boolean {
  return value === undefined || Number.isFinite(Date.parse(value));
}

export function validateTranslationDraft(input: {
  post: OfficialSourcePost; draft: NewsTranslationDraft; section: string; category: string;
}): TranslationValidationResult {
  const { post, draft } = input;
  const errors: string[] = [];
  if (!draft.title.trim()) errors.push('missing_title');
  if (!draft.summary.trim()) errors.push('missing_summary');
  if (!Array.isArray(draft.facts) || draft.facts.some((fact) => !fact.trim())) errors.push('invalid_facts');
  if (!validOptionalInstant(draft.startsAt) || !validOptionalInstant(draft.endsAt)) errors.push('invalid_timestamp');
  const source = post.normalizedText;
  const output = `${draft.title} ${draft.summary} ${draft.facts.join(' ')}`;
  if (draft.game === 'arena' && !/arena/i.test(source)) errors.push('unsupported_arena_scope');
  if (draft.game === 'eft' && /arena/i.test(source) && !/escape\s+from\s+tarkov|#escapefromtarkov/i.test(source)) errors.push('game_scope_conflict');
  if (draft.gameModes?.includes('pve') && !/\bpve\b/i.test(source)) errors.push('unsupported_pve_scope');
  if (draft.gameModes?.includes('regular') && !/\bpvp\b/i.test(source)) errors.push('unsupported_pvp_scope');
  if ((output.match(/\d+(?:[.:]\d+)*/g) ?? []).some((value) => !source.includes(value))) errors.push('unsupported_fact');
  const style = checkTranslationStyle({ sourceText: source, title: draft.title, summary: draft.summary, facts: draft.facts });
  if (style.requiresReview) errors.push('style_requires_review');
  if (draft.warnings.length > 0) errors.push('provider_warning');
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export function canAutoPublish(input: {
  sourceVerified: boolean; duplicate: boolean; classificationConfirmed: boolean;
  draft: NewsTranslationDraft; validation: TranslationValidationResult;
}): boolean {
  return input.sourceVerified && !input.duplicate && input.classificationConfirmed &&
    input.draft.confidence === 'high' && input.draft.warnings.length === 0 && input.validation.valid;
}
