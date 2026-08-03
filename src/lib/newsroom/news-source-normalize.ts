import type { OfficialNewsSource, OfficialSourcePost } from '@/types/newsroom';

export const DEFAULT_TELEGRAM_CHANNELS = {
  'telegram-en': 'escapefromtarkovEN',
  'telegram-ru': 'escapefromtarkovRU',
} as const;

export const DEFAULT_OFFICIAL_HOSTS = [
  'escapefromtarkov.com', 'tarkov.com', 'arena.tarkov.com',
  'profile.tarkov.com', 'support.tarkov.com', 'telegra.ph',
] as const;

export interface OfficialSourceAllowlist {
  telegramEn: string;
  telegramRu: string;
  officialHosts: string[];
}

export interface OfficialSourcePostInput {
  source: OfficialNewsSource;
  sourceMessageId: string;
  sourceUrl: string;
  channelId?: string;
  channelUsername?: string;
  sourceLanguage: 'en' | 'ru';
  publishedAt: string;
  editedAt?: string;
  originalText?: string;
  linkedOfficialUrls?: string[];
  mediaKinds?: OfficialSourcePost['mediaKinds'];
}

export class NewsSourceValidationError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'NewsSourceValidationError';
  }
}

export function normalizeNewsText(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function newsTextHash(value: string): string {
  const normalized = normalizeNewsText(value).toLocaleLowerCase('en-US')
    .replace(/https?:\/\/\S+/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  let hash = 0x811c9dc5;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function safeUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new NewsSourceValidationError('invalid_url'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new NewsSourceValidationError('unsafe_url');
  }
  return url;
}

function canonicalChannel(value: string | undefined): string {
  return (value ?? '').trim().replace(/^@/, '').toLowerCase();
}

function officialHost(host: string, allowlist: OfficialSourceAllowlist): boolean {
  const normalized = host.toLowerCase();
  return allowlist.officialHosts.some((item) => normalized === item || normalized.endsWith(`.${item}`));
}

export function normalizeOfficialSourcePost(
  input: OfficialSourcePostInput,
  allowlist: OfficialSourceAllowlist,
  importedAt = new Date().toISOString(),
): OfficialSourcePost {
  const sourceUrl = safeUrl(input.sourceUrl);
  const publishedAt = new Date(input.publishedAt);
  const editedAt = input.editedAt ? new Date(input.editedAt) : null;
  if (!Number.isFinite(publishedAt.getTime())) throw new NewsSourceValidationError('invalid_published_at');
  if (editedAt && !Number.isFinite(editedAt.getTime())) throw new NewsSourceValidationError('invalid_edited_at');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(input.sourceMessageId)) {
    throw new NewsSourceValidationError('invalid_message_id');
  }

  let channelUsername: string | undefined;
  if (input.source === 'telegram-en' || input.source === 'telegram-ru') {
    if (!['t.me', 'telegram.me'].includes(sourceUrl.hostname.toLowerCase())) {
      throw new NewsSourceValidationError('invalid_telegram_host');
    }
    const expected = canonicalChannel(input.source === 'telegram-en' ? allowlist.telegramEn : allowlist.telegramRu);
    const pathParts = sourceUrl.pathname.split('/').filter(Boolean);
    if (pathParts[0]?.toLowerCase() === 's') pathParts.shift();
    const pathChannel = canonicalChannel(pathParts[0]);
    channelUsername = canonicalChannel(input.channelUsername) || pathChannel;
    if (!expected || channelUsername !== expected || (pathChannel && pathChannel !== expected)) {
      throw new NewsSourceValidationError('invalid_channel');
    }
    if (pathParts[1] && pathParts[1] !== input.sourceMessageId) {
      throw new NewsSourceValidationError('message_id_mismatch');
    }
    const expectedLanguage = input.source === 'telegram-en' ? 'en' : 'ru';
    if (input.sourceLanguage !== expectedLanguage) throw new NewsSourceValidationError('invalid_source_language');
  } else if (!officialHost(sourceUrl.hostname, allowlist)) {
    throw new NewsSourceValidationError('invalid_official_host');
  }

  const normalizedText = normalizeNewsText(input.originalText ?? '');
  if (!normalizedText && (input.mediaKinds?.length ?? 0) === 0) {
    throw new NewsSourceValidationError('empty_post');
  }
  const linkedOfficialUrls = [...new Set((input.linkedOfficialUrls ?? []).map((raw) => {
    const url = safeUrl(raw);
    if (!officialHost(url.hostname, allowlist)) throw new NewsSourceValidationError('invalid_linked_host');
    return url.toString();
  }))];

  const id = `${input.source}:${channelUsername ?? sourceUrl.hostname}:${input.sourceMessageId}`;
  return {
    id, source: input.source, sourceMessageId: input.sourceMessageId,
    sourceUrl: sourceUrl.toString(), channelId: input.channelId,
    channelUsername: channelUsername || input.channelUsername,
    sourceLanguage: input.sourceLanguage, publishedAt: publishedAt.toISOString(),
    editedAt: editedAt?.toISOString(), rawText: input.originalText,
    normalizedText, textHash: newsTextHash(normalizedText), linkedOfficialUrls,
    mediaKinds: [...new Set(input.mediaKinds ?? [])], importedAt,
  };
}
