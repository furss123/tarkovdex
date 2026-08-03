import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';
import { csrfToken, getSession } from '@/lib/live/admin-auth';
import { liveConfig } from '@/lib/live/config';
import { formatKst } from '@/lib/format';
import { getRepository } from '@/lib/live/repository-client';
import type { LiveEventRow, LiveRepository } from '@/lib/live/repository';
import { computeEventStatus, instantToKstInput } from '@/lib/live/status';
import {
  NATURAL_SCHEDULE_LABEL_KO,
  SCHEDULER_HEALTH_LABEL_KO,
  classifyFromSourceStates,
  classifyNaturalScheduleStatus,
  extractSchedulerInvocationEvidence,
} from '@/lib/live/scheduler-health';
import { ActionForm, LoginForm } from './AdminForms';
import {
  clearOverrideAction,
  loginAction,
  logoutAction,
  mergeEventAction,
  reinterpretAction,
  revalidateAction,
  runIngestionAction,
  updateEventAction,
} from './actions';

/**
 * The review desk. This is what replaces "edit a JSON file, commit it, wait for
 * a redeploy" — an operator approves, corrects or rejects here and all three
 * locale news pages update immediately.
 *
 * Never prerendered and never cached: it reads a session cookie and shows
 * unpublished content. It is also `noindex` and absent from `sitemap.ts`, and
 * `robots.ts` disallows the path.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = {
  title: 'Tarkov Live 관리',
  robots: { index: false, follow: false, nocache: true },
};

type PageProps = { params: Promise<{ locale: string }> };

const CATEGORIES = [
  'event',
  'patch',
  'maintenance',
  'server_status',
  'developer_comment',
  'announcement',
  'sale',
  'community',
  'unknown',
];
const RELIABILITIES = [
  'official_confirmed',
  'official_statement',
  'developer_hint',
  'tarkovdex_inference',
  'unverified',
];
/** `''` means "derive from the window", which is the normal case — see the
 * status note in `actions.ts`. */
const STATUSES = ['', 'scheduled', 'active', 'ending_soon', 'ended'];
const MODES = ['pvp', 'pve', 'arena', 'unknown'];
const LOCALES = ['ko', 'en', 'zh'] as const;

const inputClass =
  'min-h-touch w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const areaClass =
  'w-full rounded-lg border border-border bg-bg p-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const buttonClass =
  'min-h-touch rounded-lg border border-border px-4 text-xs text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';
const primaryButtonClass =
  'min-h-touch rounded-lg border border-accent bg-accent/10 px-4 text-xs text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-sm text-fg">{value}</div>
    </div>
  );
}

function EventEditor({ event, csrf, candidates }: { event: LiveEventRow; csrf: string; candidates: LiveEventRow[] }) {
  const status = computeEventStatus(
    { startsAt: event.startsAt ?? null, endsAt: event.endsAt ?? null, manualFields: event.manualFields, status: event.status },
    Date.now(),
  );
  const original = event.content.original ?? { title: '', content: '' };
  const suggested = event.reviewNote?.startsWith('link_candidate:')
    ? event.reviewNote.split(':')[1]
    : null;

  return (
    <details className="border-b border-border/60 last:border-0">
      <summary className="cursor-pointer px-4 py-4 text-sm text-fg">
        <span className="text-muted">[{event.category}]</span> {original.title || event.slug}
        <span className="ml-2 text-xs text-muted">
          {event.reviewStatus} · {status} · {formatKst(event.postedAt, 'ko')}
        </span>
      </summary>

      <div className="px-4 pb-6">
        <p className="whitespace-pre-line rounded-lg border border-border p-3 text-xs text-muted">
          {original.content}
        </p>
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
          {event.sources.map((source) => (
            <span key={`${source.source}:${source.postId}`}>
              {source.source} · {source.role}
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 underline underline-offset-4 hover:text-accent"
                >
                  원문
                </a>
              ) : null}
            </span>
          ))}
          {event.reviewNote ? <span>사유: {event.reviewNote}</span> : null}
          {event.manualFields.length > 0 ? <span>수동 수정: {event.manualFields.join(', ')}</span> : null}
        </div>

        <ActionForm action={updateEventAction} csrf={csrf} className="mt-4 space-y-4">
          <input type="hidden" name="eventId" value={event.id} />

          {LOCALES.map((locale) => {
            const text = event.content[locale];
            return (
              <div key={locale} className="space-y-2 rounded-lg border border-border p-3">
                <div className="text-xs text-muted">{locale.toUpperCase()}</div>
                <Field label="제목">
                  <input name={`${locale}_title`} defaultValue={text?.title ?? ''} className={inputClass} />
                </Field>
                <Field label="본문">
                  <textarea name={`${locale}_content`} defaultValue={text?.content ?? ''} rows={4} className={areaClass} />
                </Field>
                <Field label="요약">
                  <input name={`${locale}_summary`} defaultValue={text?.summary ?? ''} className={inputClass} />
                </Field>
                <Field label="플레이어 영향">
                  <input name={`${locale}_playerImpact`} defaultValue={text?.playerImpact ?? ''} className={inputClass} />
                </Field>
                <Field label="추천 행동">
                  <input
                    name={`${locale}_recommendedAction`}
                    defaultValue={text?.recommendedAction ?? ''}
                    className={inputClass}
                  />
                </Field>
              </div>
            );
          })}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="분류">
              <select name="category" defaultValue={event.category} className={inputClass}>
                {CATEGORIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="신뢰도">
              <select name="reliability" defaultValue={event.reliability} className={inputClass}>
                {RELIABILITIES.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`상태 (현재: ${status})`}>
              <select
                name="status"
                defaultValue={event.manualFields.includes('status') ? event.status : ''}
                className={inputClass}
              >
                {STATUSES.map((value) => (
                  <option key={value || 'auto'} value={value}>
                    {value || '자동 (일정 기준)'}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset>
            <legend className="text-xs text-muted">적용 모드</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {MODES.map((mode) => (
                <label key={mode} className="inline-flex min-h-touch items-center gap-2 text-sm text-fg">
                  <input type="checkbox" name="gameModes" value={mode} defaultChecked={event.gameModes.includes(mode as never)} />
                  {mode}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="시작 (KST)">
              <input
                type="datetime-local"
                name="startsAt"
                defaultValue={instantToKstInput(event.startsAt)}
                className={inputClass}
              />
            </Field>
            <Field label="종료 (KST)">
              <input
                type="datetime-local"
                name="endsAt"
                defaultValue={instantToKstInput(event.endsAt)}
                className={inputClass}
              />
            </Field>
          </div>
          <label className="inline-flex min-h-touch items-center gap-2 text-sm text-fg">
            <input type="checkbox" name="endUnknown" defaultChecked={!event.endsAt} />
            종료 시각 미확인 (추측하지 않음)
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            {(['maps', 'bosses', 'traders', 'items', 'quests'] as const).map((field) => (
              <Field key={field} label={`${field} (쉼표 구분)`}>
                <input name={field} defaultValue={(event[field] ?? []).join(', ')} className={inputClass} />
              </Field>
            ))}
          </div>

          <Field label="메모">
            <input name="note" className={inputClass} />
          </Field>

          <div className="flex flex-wrap gap-2">
            <button type="submit" name="decision" value="save" className={buttonClass}>
              저장
            </button>
            <button type="submit" name="decision" value="approve" className={primaryButtonClass}>
              승인 후 게시
            </button>
            <button type="submit" name="decision" value="reject" className={buttonClass}>
              거절
            </button>
            <button type="submit" name="decision" value="end" className={buttonClass}>
              이벤트 종료
            </button>
            <button type="submit" name="decision" value="reopen" className={buttonClass}>
              종료 취소
            </button>
          </div>
        </ActionForm>

        {event.manualFields.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {event.manualFields.map((field) => (
              <ActionForm key={field} action={clearOverrideAction} csrf={csrf}>
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="field" value={field} />
                <button type="submit" className={buttonClass}>
                  {field} 수동 수정 해제
                </button>
              </ActionForm>
            ))}
          </div>
        ) : null}

        {candidates.length > 0 ? (
          <ActionForm action={mergeEventAction} csrf={csrf} className="mt-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="eventId" value={event.id} />
            <Field label="기존 이벤트에 연결">
              <select name="targetId" defaultValue={suggested ?? ''} className={inputClass}>
                {candidates.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.content.original?.title ?? candidate.slug}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="역할">
              <select name="role" className={inputClass}>
                <option value="confirmation">추가 확인</option>
                <option value="update">내용 업데이트</option>
                <option value="end">종료 공지</option>
              </select>
            </Field>
            <button type="submit" className={buttonClass}>
              연결
            </button>
          </ActionForm>
        ) : null}

        {event.primaryPostId ? (
          <ActionForm action={reinterpretAction} csrf={csrf} className="mt-3">
            <input type="hidden" name="postId" value={event.primaryPostId} />
            <button type="submit" className={buttonClass}>
              AI 해석 다시 실행
            </button>
          </ActionForm>
        ) : null}
      </div>
    </details>
  );
}

async function Dashboard({ repo, csrf }: { repo: LiveRepository; csrf: string }) {
  const [states, runs, pending, published, audit] = await Promise.all([
    repo.listSourceStates(),
    repo.listRuns(10),
    repo.listEvents({ reviewStatus: ['pending_review'], limit: 50 }),
    repo.listEvents({ reviewStatus: ['reviewed'], limit: 50 }),
    repo.listAudit(15),
  ]);

  const now = Date.now();
  const lastSuccess = states
    .map((state) => state.lastSuccessAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const latestRun = runs[0] ?? null;
  const schedulerStatus = classifyFromSourceStates(
    states.map((state) => ({
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      consecutiveFailures: state.consecutiveFailures,
      lastError: state.lastError,
      active: state.active,
    })),
    latestRun
      ? {
          ok: latestRun.ok,
          newPosts: latestRun.newPosts,
          eventsUpserted: latestRun.eventsUpserted,
          finishedAt: latestRun.finishedAt,
        }
      : null,
    now,
  );
  const scheduleEvidence = extractSchedulerInvocationEvidence(
    runs.map((run) => ({
      trigger: run.trigger,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      ok: run.ok,
    })),
    lastSuccess ?? null,
  );
  const naturalScheduleStatus = classifyNaturalScheduleStatus(scheduleEvidence, now);
  const active = published.filter((event) =>
    ['active', 'ending_soon', 'scheduled'].includes(
      computeEventStatus(
        { startsAt: event.startsAt ?? null, endsAt: event.endsAt ?? null, manualFields: event.manualFields, status: event.status },
        now,
      ),
    ),
  );
  const endUnknown = published.filter((event) => event.startsAt && !event.endsAt);

  return (
    <div className="space-y-10">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-sm text-fg">Tarkov Live 관리</h1>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={runIngestionAction} csrf={csrf}>
              <button type="submit" className={primaryButtonClass}>
                지금 전체 수집
              </button>
            </ActionForm>
            {states.map((state) => (
              <ActionForm key={state.sourceKey} action={runIngestionAction} csrf={csrf}>
                <input type="hidden" name="source" value={state.sourceKey} />
                <button type="submit" className={buttonClass}>
                  {state.sourceKey} 수집
                </button>
              </ActionForm>
            ))}
            <ActionForm action={revalidateAction} csrf={csrf}>
              <button type="submit" className={buttonClass}>
                캐시 재검증
              </button>
            </ActionForm>
            <form action={logoutAction}>
              <button type="submit" className={buttonClass}>
                로그아웃
              </button>
            </form>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="출처 확인" value={SCHEDULER_HEALTH_LABEL_KO[schedulerStatus]} />
          <Stat label="자연 스케줄" value={NATURAL_SCHEDULE_LABEL_KO[naturalScheduleStatus]} />
          <Stat
            label="마지막 자연 스케줄"
            value={formatKst(scheduleEvidence.lastScheduledSuccessAt, 'ko') ?? '기록 없음'}
          />
          <Stat
            label="마지막 수동 실행"
            value={formatKst(scheduleEvidence.lastManualSuccessAt, 'ko') ?? '기록 없음'}
          />
          <Stat label="마지막 성공 수집" value={formatKst(lastSuccess ?? null, 'ko') ?? '기록 없음'} />
          <Stat label="검수 대기" value={`${pending.length}건`} />
          <Stat label="진행/예정 이벤트" value={`${active.length}건`} />
          <Stat label="종료 시각 미확인" value={`${endUnknown.length}건`} />
        </div>
      </section>

      <section>
        <h2 className="text-sm text-fg">출처 상태</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[40rem] text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3">출처</th>
                <th className="px-4 py-3">마지막 성공</th>
                <th className="px-4 py-3">마지막 오류</th>
                <th className="px-4 py-3">연속 실패</th>
                <th className="px-4 py-3">커서</th>
              </tr>
            </thead>
            <tbody className="text-fg">
              {states.map((state) => (
                <tr key={state.sourceKey} className="border-t border-border/60">
                  <td className="px-4 py-3">{state.sourceKey}</td>
                  <td className="px-4 py-3">{formatKst(state.lastSuccessAt, 'ko') ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{state.lastError ?? '—'}</td>
                  <td className="px-4 py-3">{state.consecutiveFailures}</td>
                  <td className="px-4 py-3 text-muted">{state.sinceId ?? '—'}</td>
                </tr>
              ))}
              {states.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={5}>
                    아직 수집이 실행되지 않았습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm text-fg">검수 대기 ({pending.length})</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          {pending.length > 0 ? (
            pending.map((event) => (
              <EventEditor key={event.id} event={event} csrf={csrf} candidates={published} />
            ))
          ) : (
            <p className="px-4 py-12 text-center text-sm text-muted">검수 대기 중인 항목이 없습니다.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-fg">게시 중 ({published.length})</h2>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          {published.length > 0 ? (
            published.map((event) => (
              <EventEditor
                key={event.id}
                event={event}
                csrf={csrf}
                candidates={published.filter((item) => item.id !== event.id)}
              />
            ))
          ) : (
            <p className="px-4 py-12 text-center text-sm text-muted">게시 중인 항목이 없습니다.</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm text-fg">최근 수집 실행</h2>
        <div className="mt-3 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[44rem] text-left text-xs">
            <thead className="text-muted">
              <tr>
                <th className="px-4 py-3">시각</th>
                <th className="px-4 py-3">출처</th>
                <th className="px-4 py-3">실행</th>
                <th className="px-4 py-3">결과</th>
                <th className="px-4 py-3">요청</th>
                <th className="px-4 py-3">신규/중복</th>
                <th className="px-4 py-3">소요</th>
              </tr>
            </thead>
            <tbody className="text-fg">
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-border/60">
                  <td className="px-4 py-3">{formatKst(run.startedAt, 'ko')}</td>
                  <td className="px-4 py-3">{run.source}</td>
                  <td className="px-4 py-3">{run.trigger}</td>
                  <td className="px-4 py-3 text-muted">{run.ok === null ? '진행 중' : run.ok ? '성공' : run.errorCode}</td>
                  <td className="px-4 py-3">{run.requests}</td>
                  <td className="px-4 py-3">
                    {run.newPosts}/{run.duplicates}
                  </td>
                  <td className="px-4 py-3">{run.durationMs == null ? '—' : `${run.durationMs}ms`}</td>
                </tr>
              ))}
              {runs.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-muted" colSpan={7}>
                    실행 기록이 없습니다.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-sm text-fg">감사 기록</h2>
        <ul className="mt-3 divide-y divide-border/60 rounded-lg border border-border text-xs">
          {audit.map((entry) => (
            <li key={entry.id} className="px-4 py-3 text-muted">
              <span className="text-fg">{entry.action}</span> · {entry.targetType}:{entry.targetId} ·{' '}
              {entry.actor} · {formatKst(entry.createdAt, 'ko')}
              {entry.note ? ` · ${entry.note}` : ''}
            </li>
          ))}
          {audit.length === 0 ? <li className="px-4 py-6 text-center text-muted">기록이 없습니다.</li> : null}
        </ul>
      </section>
    </div>
  );
}

export default async function AdminLivePage({ params }: PageProps) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);

  const session = await getSession();
  const repo = getRepository();

  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      {!liveConfig.admin.enabled ? (
        <p className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
          TARKOV_LIVE_ADMIN_SECRET이 설정되지 않아 관리자 기능이 비활성화되어 있습니다.
        </p>
      ) : !session ? (
        <LoginForm action={loginAction} />
      ) : !repo ? (
        <p className="rounded-lg border border-border px-4 py-12 text-center text-sm text-muted">
          DATABASE_URL이 설정되지 않아 저장소를 사용할 수 없습니다. docs/tarkov-live.md를 참고하세요.
        </p>
      ) : (
        <Dashboard repo={repo} csrf={csrfToken(session)} />
      )}
    </section>
  );
}
