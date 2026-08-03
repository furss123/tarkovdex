import 'server-only';
import { DEFAULT_OFFICIAL_HOSTS, DEFAULT_TELEGRAM_CHANNELS, type OfficialSourceAllowlist } from './news-source-normalize';

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export const newsroomConfig = {
  get allowlist(): OfficialSourceAllowlist {
    return {
      telegramEn: process.env.BSG_TELEGRAM_CHANNEL_EN || DEFAULT_TELEGRAM_CHANNELS['telegram-en'],
      telegramRu: process.env.BSG_TELEGRAM_CHANNEL_RU || DEFAULT_TELEGRAM_CHANNELS['telegram-ru'],
      officialHosts: (process.env.BSG_OFFICIAL_HOSTS || DEFAULT_OFFICIAL_HOSTS.join(','))
        .split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
    };
  },
  get ingestionMode() { return oneOf(process.env.NEWS_INGEST_MODE, ['manual', 'authorized-api', 'existing-adapter'] as const, 'manual'); },
  get publicationMode() { return oneOf(process.env.NEWS_PUBLICATION_MODE, ['review', 'auto'] as const, 'review'); },
  get importSecret() { return process.env.NEWS_IMPORT_SECRET; },
  get cronSecret() { return process.env.NEWS_CRON_SECRET || process.env.CRON_SECRET; },
  get translationProvider() { return process.env.NEWS_TRANSLATION_PROVIDER || ''; },
};
