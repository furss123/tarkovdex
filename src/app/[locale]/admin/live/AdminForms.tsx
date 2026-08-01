'use client';

import { useActionState } from 'react';
import { CSRF_INPUT_NAME } from '@/lib/live/admin-constants';
import type { ActionState } from './actions';

/**
 * The only client code in the admin: `useActionState`, so a result message can
 * be shown next to the button that produced it. Everything else — the queue,
 * the event data, every value in every field — is server-rendered.
 *
 * Copy here is Korean-only and deliberately not in the message files. This is a
 * single-operator internal tool behind a password, not site content: it is
 * `noindex`, excluded from the sitemap, and has no hreflang alternates, so
 * translating it into three languages would add ~60 keys nobody reads.
 */

const initial: ActionState = { ok: true, message: '' };

function Result({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={`mt-2 text-xs ${state.ok ? 'text-accent' : 'text-negative'}`}>
      {state.message}
    </p>
  );
}

export function ActionForm({
  action,
  csrf,
  children,
  className = '',
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  csrf: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, submit, pending] = useActionState(action, initial);
  return (
    <form action={submit} className={className}>
      <input type="hidden" name={CSRF_INPUT_NAME} value={csrf} />
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      <Result state={state} />
    </form>
  );
}

export function LoginForm({
  action,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [state, submit, pending] = useActionState(action, initial);
  return (
    <form action={submit} className="mx-auto mt-10 max-w-sm rounded-lg border border-border p-6">
      <h1 className="text-sm text-fg">Tarkov Live 관리자</h1>
      <label className="mt-4 block text-xs text-muted" htmlFor="admin-password">
        관리자 비밀값
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="mt-1 min-h-touch w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      />
      <button
        type="submit"
        disabled={pending}
        className="mt-4 min-h-touch w-full rounded-lg border border-accent bg-accent/10 px-4 text-sm text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      >
        로그인
      </button>
      <Result state={state} />
    </form>
  );
}
