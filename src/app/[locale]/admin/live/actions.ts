'use server';

import { revalidatePath } from 'next/cache';
import { actorFor, login, logout, requireSession } from '@/lib/live/admin-auth';
import { revalidateNews, runIngestion } from '@/lib/live/pipeline';
import { getRepository } from '@/lib/live/repository-client';
import type { EventContent, LiveRepository, LocalizedText } from '@/lib/live/repository';
import { seedManualEntries } from '@/lib/live/seed';
import { kstInputToInstant } from '@/lib/live/status';

/**
 * Admin actions. Every one of them starts with `requireSession(form)`, which
 * checks the signed session cookie *and* the CSRF token and throws if either
 * fails — so a missing check is a crash rather than an unauthenticated write.
 *
 * These are what make the review workflow a website instead of a git commit and
 * a redeploy: an approval here lands in the database and revalidates all three
 * locale pages immediately.
 */

const LOCALES = ['ko', 'en', 'zh'] as const;

export interface ActionState {
  ok: boolean;
  message: string;
}

function repoOrThrow(): LiveRepository {
  const repo = getRepository();
  if (!repo) throw new Error('database_not_configured');
  return repo;
}

function text(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function list(form: FormData, key: string): string[] | undefined {
  const value = text(form, key);
  if (value === undefined) return undefined;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const password = form.get('password');
  const ok = typeof password === 'string' && (await login(password));
  // One message for every failure mode: wrong secret, no secret configured, and
  // throttled all look identical from the outside.
  return ok ? { ok: true, message: '' } : { ok: false, message: '로그인에 실패했습니다.' };
}

export async function logoutAction(): Promise<void> {
  await logout();
}

export async function updateEventAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession(form);
  const repo = repoOrThrow();
  const id = String(form.get('eventId') ?? '');
  const event = await repo.getEvent(id);
  if (!event) return { ok: false, message: '항목을 찾을 수 없습니다.' };

  const patch: Record<string, unknown> = {};

  // Per-locale text: merged into a complete content object, so an edit to the
  // Korean summary can't drop the English body.
  const content: EventContent = JSON.parse(JSON.stringify(event.content)) as EventContent;
  let contentTouched = false;
  for (const locale of LOCALES) {
    const current: LocalizedText = content[locale] ?? {
      title: content.original?.title ?? '',
      content: content.original?.content ?? '',
      translated: false,
    };
    const next = { ...current } as LocalizedText & Record<string, unknown>;
    for (const field of ['title', 'content', 'summary', 'playerImpact', 'recommendedAction'] as const) {
      const value = text(form, `${locale}_${field}`);
      if (value !== undefined && value !== (current[field] ?? '')) {
        next[field] = value;
        contentTouched = true;
      }
    }
    content[locale] = next;
  }
  if (contentTouched) patch.content = content;

  for (const field of ['category', 'reliability'] as const) {
    const value = text(form, field);
    if (value) patch[field] = value;
  }

  /**
   * Status is deliberately not treated like the other selects. It is normally
   * *derived* from the event window, and `unknown` is the sentinel for "derive
   * it" — so a plain save with the dropdown left alone must not pin the event
   * to `unknown` forever, which is exactly what an earlier version did: an
   * approved, currently-running event kept rendering as 일정 미확인.
   */
  const statusValue = text(form, 'status');
  if (statusValue) patch.status = statusValue;
  const modes = form.getAll('gameModes').map(String).filter(Boolean);
  if (modes.length > 0) patch.gameModes = modes;
  for (const field of ['maps', 'bosses', 'traders', 'items', 'quests'] as const) {
    const value = list(form, field);
    if (value) patch[field] = value;
  }

  const endUnknown = form.get('endUnknown') === 'on';
  const startsAt = kstInputToInstant(text(form, 'startsAt'));
  const endsAt = endUnknown ? null : kstInputToInstant(text(form, 'endsAt'));
  if (startsAt !== event.startsAt) patch.startsAt = startsAt;
  if (endsAt !== event.endsAt) patch.endsAt = endsAt;
  patch.endConfirmed = Boolean(endsAt);

  const note = text(form, 'note');
  if (note) patch.reviewNote = note;

  const decision = text(form, 'decision');
  if (decision === 'approve') {
    patch.reviewStatus = 'reviewed';
    patch.publishedAt = new Date().toISOString();
  } else if (decision === 'reject') {
    patch.reviewStatus = 'rejected';
  } else if (decision === 'end') {
    patch.reviewStatus = 'reviewed';
    patch.status = 'ended';
    patch.endedAt = new Date().toISOString();
  } else if (decision === 'reopen') {
    patch.status = 'unknown';
    patch.endedAt = null;
  }

  await repo.transaction(async (transactionRepo) => {
    await transactionRepo.updateEventFields(id, patch, {
      manual: true,
      actor: actorFor(session),
      note: note ?? null,
    });
    if (!statusValue && event.manualFields.includes('status')) {
      await transactionRepo.clearEventOverride(id, 'status', actorFor(session));
    }
  });
  const revalidated = revalidateNews();
  revalidatePath('/[locale]/admin/live', 'page');
  return {
    ok: true,
    message: revalidated ? '저장했습니다. 뉴스 페이지에 반영되었습니다.' : '저장했습니다. 캐시 갱신은 실패했습니다.',
  };
}

export async function clearOverrideAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession(form);
  const repo = repoOrThrow();
  const id = String(form.get('eventId') ?? '');
  const field = String(form.get('field') ?? '');
  await repo.clearEventOverride(id, field, actorFor(session));
  revalidateNews();
  revalidatePath('/[locale]/admin/live', 'page');
  return { ok: true, message: `${field} 수동 수정을 해제했습니다.` };
}

/** Merge: the post's own board item is rejected and its sources move onto the
 * event it actually belongs to, so the feed shows one card, not two. */
export async function mergeEventAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession(form);
  const repo = repoOrThrow();
  const id = String(form.get('eventId') ?? '');
  const targetId = String(form.get('targetId') ?? '');
  const role = (String(form.get('role') ?? 'confirmation') || 'confirmation') as 'confirmation' | 'update' | 'end';

  const source = await repo.getEvent(id);
  const target = await repo.getEvent(targetId);
  if (!source || !target) return { ok: false, message: '병합 대상 항목을 찾을 수 없습니다.' };

  await repo.transaction(async (transactionRepo) => {
    for (const item of source.sources) {
      await transactionRepo.linkPostToEvent(targetId, `${item.source}:${item.postId}`, role);
    }
    await transactionRepo.deleteEvent(id, actorFor(session));
    if (role === 'end') {
      await transactionRepo.updateEventFields(
        targetId,
        { status: 'ended', endedAt: new Date().toISOString(), reviewStatus: 'reviewed' },
        { manual: true, actor: actorFor(session), note: `merged_end:${id}` },
      );
    }
  });
  revalidateNews();
  revalidatePath('/[locale]/admin/live', 'page');
  return { ok: true, message: '기존 이벤트에 연결했습니다.' };
}

/** Bounded on purpose: one small synchronous run, no job queue. There is no
 * background worker on this deployment, so an action that promised to keep
 * working after the response would be a lie. */
export async function runIngestionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession(form);
  const repo = repoOrThrow();
  const only = [String(form.get('source') ?? '')].filter(Boolean);

  await repo.migrate();
  await seedManualEntries(repo);
  const summary = await runIngestion(repo, { trigger: 'manual', only, holder: actorFor(session) });
  revalidatePath('/[locale]/admin/live', 'page');

  if (summary.locked) return { ok: false, message: '이미 수집이 실행 중입니다.' };
  const fetched = summary.sources.reduce((total, source) => total + source.newPosts, 0);
  return {
    ok: summary.ok,
    message: `수집 완료 · 신규 ${fetched}건 · 해석 ${summary.interpreted}건 · 실패 ${summary.interpretFailures}건`,
  };
}

/** Re-queue one post for interpretation — for a provider outage that has since
 * been fixed, or a prompt change. */
export async function reinterpretAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const session = await requireSession(form);
  const repo = repoOrThrow();
  const postId = String(form.get('postId') ?? '');
  await repo.transaction(async (transactionRepo) => {
    await transactionRepo.setInterpretStatus(postId, 'pending');
    await transactionRepo.appendAudit({
      targetType: 'raw_post',
      targetId: postId,
      action: 'reinterpret',
      actor: actorFor(session),
    });
  });
  revalidatePath('/[locale]/admin/live', 'page');
  return { ok: true, message: '다음 수집 때 다시 해석합니다.' };
}

export async function revalidateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireSession(form);
  const ok = revalidateNews();
  return { ok, message: ok ? '뉴스 페이지 캐시를 갱신했습니다.' : '캐시 갱신에 실패했습니다.' };
}
