'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, Upload } from 'lucide-react';
import type { Locale } from '@/i18n/routing';
import { formatKst } from '@/lib/format';
import {
  ErrorState,
  PartialDataNotice,
  SuccessNotice,
} from '@/components/status/StatusUI';
import {
  clearTarkovDexCaches,
} from '@/contexts/ConnectivityContext';
import {
  exportFilename,
  exportLocalState,
  importLocalState,
  isStorageAvailable,
  resetLocalState,
  serializeExport,
  useLocalState,
  validateImport,
  type ImportErrorCode,
  type StorageErrorCode,
} from '@/lib/local-state';

type FeedbackCode = ImportErrorCode | StorageErrorCode;

/** Error codes are kebab-case (matching Phase 1's `DeliveryStatus` convention,
 * e.g. `'stale-cache'`); message keys are camelCase like every other key in
 * this project. This is the one place that bridges them. */
const ERROR_MESSAGE_KEY: Record<FeedbackCode, string> = {
  'too-large': 'tooLarge',
  'invalid-json': 'invalidJson',
  'invalid-shape': 'invalidShape',
  'unsupported-version': 'unsupportedVersion',
  'invalid-state': 'invalidState',
  unavailable: 'unavailable',
  'quota-exceeded': 'quotaExceeded',
  'stringify-failed': 'stringifyFailed',
  unknown: 'unknown',
};

/**
 * The Phase 2 verification surface: shows the versioned local-state document,
 * and lets a user export it, replace it from a file, or reset it. Everything
 * here is a thin UI layer over `@/lib/local-state`'s public API — no
 * `localStorage` access happens in this component.
 */
export function LocalDataPanel({ locale }: { locale: Locale }) {
  const t = useTranslations('localData');
  const state = useLocalState();
  // Defaults to available on both the server and the first client render —
  // `isStorageAvailable()` itself would report `false` during SSR (no
  // `window`), which the real browser then immediately contradicts. Reading
  // it eagerly here would be exactly the SSR/hydration mismatch pattern
  // `GameModeContext` avoids elsewhere in this app: assume the common case,
  // correct it after mount if it's ever actually wrong.
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    setStorageAvailable(isStorageAvailable());
  }, []);

  const [importPreview, setImportPreview] = useState<{
    raw: string;
    exportedAt: string;
    gameMode: string;
  } | null>(null);
  const [importError, setImportError] = useState<FeedbackCode | null>(null);
  const [importDone, setImportDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetError, setResetError] = useState<StorageErrorCode | null>(null);
  const [resetDone, setResetDone] = useState(false);
  const [confirmingCacheClear, setConfirmingCacheClear] = useState(false);
  const [cacheClearDone, setCacheClearDone] = useState(false);
  const [cacheClearFailed, setCacheClearFailed] = useState(false);
  const to = useTranslations('offline');
  const tp = useTranslations('pwa');

  function handleExport() {
    const now = new Date();
    const exported = exportLocalState(state, now.toISOString());
    const blob = new Blob([serializeExport(exported)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename(now);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleFileSelected(file: File) {
    setImportDone(false);
    setImportError(null);
    setImportPreview(null);

    const raw = await file.text();
    const validation = validateImport(raw);
    if (!validation.ok) {
      setImportError(validation.code);
      return;
    }
    setImportPreview({
      raw,
      exportedAt: validation.exportedAt,
      gameMode: validation.state.preferences.gameMode,
    });
  }

  function handleApplyImport() {
    if (!importPreview) return;
    const outcome = importLocalState(importPreview.raw);
    if (!outcome.ok) {
      setImportError(outcome.code);
      return;
    }
    setImportPreview(null);
    setImportDone(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleCancelImport() {
    setImportPreview(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleConfirmReset() {
    const outcome = resetLocalState();
    setConfirmingReset(false);
    if (!outcome.ok) {
      setResetError(outcome.code);
      return;
    }
    setResetError(null);
    setResetDone(true);
  }

  const gameModeLabel = state.preferences.gameMode === 'regular' ? 'PvP' : 'PvE';
  // Real timestamps only exist once the client has hydrated from disk — see
  // schema.ts's SERVER_DEFAULT_STATE comment. Before that, this and the
  // server's own render show the same fixed placeholder, so there is nothing
  // to gate for hydration safety; this just avoids a flash of "1970-01-01".
  const hydrated = state.metadata.createdAt !== '1970-01-01T00:00:00.000Z';

  return (
    <div className="space-y-8">
      {!storageAvailable ? (
        <PartialDataNotice
          message={t('storageUnavailableTitle')}
          hint={t('storageUnavailableHint')}
        />
      ) : null}

      <section
        aria-labelledby="local-data-current-heading"
        className="rounded-lg border border-border bg-surface/30 p-4"
      >
        <h2 id="local-data-current-heading" className="text-sm font-medium text-fg">
          {t('currentStateTitle')}
        </h2>
        <dl className="mt-3 space-y-2 text-[14px] leading-5">
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <dt className="text-muted">{t('gameModeLabel')}</dt>
            <dd className="text-fg">{gameModeLabel}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <dt className="text-muted">{t('createdAtLabel')}</dt>
            <dd className="text-fg">
              {hydrated ? formatKst(state.metadata.createdAt, locale) : t('storedInThisBrowser')}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-x-4 gap-y-1">
            <dt className="text-muted">{t('updatedAtLabel')}</dt>
            <dd className="text-fg">
              {hydrated ? formatKst(state.metadata.updatedAt, locale) : t('storedInThisBrowser')}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="local-data-export-heading"
        className="rounded-lg border border-border bg-surface/30 p-4"
      >
        <h2 id="local-data-export-heading" className="text-sm font-medium text-fg">
          {t('exportTitle')}
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">{t('exportDescription')}</p>
        <button
          type="button"
          onClick={handleExport}
          className="mt-3 inline-flex min-h-touch items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Download className="size-[14px]" aria-hidden="true" />
          {t('exportButton')}
        </button>
      </section>

      <section
        aria-labelledby="local-data-import-heading"
        className="rounded-lg border border-border bg-surface/30 p-4"
      >
        <h2 id="local-data-import-heading" className="text-sm font-medium text-fg">
          {t('importTitle')}
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">{t('importDescription')}</p>
        <p className="mt-1 text-[14px] leading-5 text-muted">{t('importReplaceWarning')}</p>

        <label className="mt-3 inline-flex min-h-touch cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg transition-colors hover:border-accent/50 hover:text-accent focus-within:outline-none focus-within:ring-2 focus-within:ring-accent/50">
          <Upload className="size-[14px]" aria-hidden="true" />
          {t('importSelectFile')}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFileSelected(file);
            }}
          />
        </label>

        {importPreview ? (
          <div className="mt-3 rounded-lg border border-border bg-surface px-4 py-3 text-[14px] leading-5">
            <p className="font-medium text-fg">{t('importPreviewTitle')}</p>
            <dl className="mt-2 space-y-1 text-muted">
              <div className="flex flex-wrap justify-between gap-x-4">
                <dt>{t('importPreviewExportedAt')}</dt>
                <dd className="text-fg">{formatKst(importPreview.exportedAt, locale)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-4">
                <dt>{t('importPreviewGameMode')}</dt>
                <dd className="text-fg">
                  {importPreview.gameMode === 'regular' ? 'PvP' : 'PvE'}
                </dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleApplyImport}
                className="inline-flex min-h-touch items-center rounded-md bg-accent px-3 py-1.5 text-[14px] font-medium leading-5 text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {t('importApply')}
              </button>
              <button
                type="button"
                onClick={handleCancelImport}
                className="inline-flex min-h-touch items-center rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('importCancel')}
              </button>
            </div>
          </div>
        ) : null}

        {importError ? (
          <div className="mt-3">
            <ErrorState title={t('importErrorTitle')} hint={t(`error.${ERROR_MESSAGE_KEY[importError]}`)} />
          </div>
        ) : null}

        {importDone ? (
          <div className="mt-3">
            <SuccessNotice message={t('importSuccess')} />
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="local-data-reset-heading"
        className="rounded-lg border border-border bg-surface/30 p-4"
      >
        <h2 id="local-data-reset-heading" className="text-sm font-medium text-fg">
          {t('resetTitle')}
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">{t('resetDescription')}</p>

        {!confirmingReset ? (
          <button
            type="button"
            onClick={() => {
              setConfirmingReset(true);
              setResetDone(false);
              setResetError(null);
            }}
            className="mt-3 inline-flex min-h-touch items-center rounded-md border border-negative/40 px-3 py-1.5 text-[14px] leading-5 text-negative transition-colors hover:bg-negative/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
          >
            {t('resetButton')}
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-labelledby="local-data-reset-confirm-title"
            className="mt-3 rounded-lg border border-negative/40 bg-negative/5 px-4 py-3"
          >
            <p id="local-data-reset-confirm-title" className="text-[14px] font-medium text-fg">
              {t('resetConfirmTitle')}
            </p>
            <p className="mt-1 text-[14px] leading-5 text-muted">{t('resetConfirmBody')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleConfirmReset}
                className="inline-flex min-h-touch items-center rounded-md border border-negative/60 bg-negative/10 px-3 py-1.5 text-[14px] font-medium leading-5 text-negative transition-colors hover:bg-negative/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative/50"
              >
                {t('resetConfirmContinue')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingReset(false)}
                className="inline-flex min-h-touch items-center rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {t('resetConfirmCancel')}
              </button>
            </div>
          </div>
        )}

        {resetError ? (
          <div className="mt-3">
            <ErrorState title={t('resetErrorTitle')} hint={t(`error.${ERROR_MESSAGE_KEY[resetError]}`)} />
          </div>
        ) : null}

        {resetDone ? (
          <div className="mt-3">
            <SuccessNotice message={t('resetSuccess')} />
          </div>
        ) : null}
      </section>

      <section
        aria-labelledby="local-data-offline-cache-heading"
        className="rounded-lg border border-border bg-surface/30 p-4"
      >
        <h2 id="local-data-offline-cache-heading" className="text-sm font-medium text-fg">
          {to('offlineCache')}
        </h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">          {to('userDataAndCacheSeparate')}</p>
        <p className="mt-1 text-[14px] leading-5 text-muted">{to('userDataNotDeleted')}</p>

        {!confirmingCacheClear ? (
          <button
            type="button"
            onClick={() => {
              setConfirmingCacheClear(true);
              setCacheClearDone(false);
              setCacheClearFailed(false);
            }}
            className="mt-3 inline-flex min-h-touch items-center rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg transition-colors hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          >
            {to('clearOfflineCache')}
          </button>
        ) : (
          <div
            role="alertdialog"
            aria-labelledby="local-data-cache-confirm-title"
            className="mt-3 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <p id="local-data-cache-confirm-title" className="text-[14px] font-medium text-fg">
              {to('clearOfflineCache')}
            </p>
            <p className="mt-1 text-[14px] leading-5 text-muted">{to('clearCacheConfirm')}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void clearTarkovDexCaches().then((ok) => {
                    setConfirmingCacheClear(false);
                    setCacheClearDone(ok);
                    setCacheClearFailed(!ok);
                  });
                }}
                className="inline-flex min-h-touch items-center rounded-md border border-accent/50 bg-accent/10 px-3 py-1.5 text-[14px] font-medium leading-5 text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {to('clearOfflineCache')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingCacheClear(false)}
                className="inline-flex min-h-touch items-center rounded-md border border-border px-3 py-1.5 text-[14px] leading-5 text-fg hover:border-accent/50 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
              >
                {tp('later')}
              </button>
            </div>
          </div>
        )}

        {cacheClearDone ? (
          <div className="mt-3">
            <SuccessNotice message={to('cacheCleared')} hint={to('userDataNotDeleted')} />
          </div>
        ) : null}
        {cacheClearFailed ? (
          <div className="mt-3">
            <ErrorState title={to('clearOfflineCache')} hint={to('tryAgainWhenOnline')} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
