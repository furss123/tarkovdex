'use client';

import { useEffect, useRef, useState } from 'react';
import './globals.css';

type SupportedLocale = 'en' | 'ko' | 'zh';

const COPY: Record<
  SupportedLocale,
  { title: string; body: string; retry: string; home: string }
> = {
  en: {
    title: 'Something went wrong',
    body: 'Try loading the page again. If the problem continues, return to the home page.',
    retry: 'Try again',
    home: 'Go to home',
  },
  ko: {
    title: '문제가 발생했습니다',
    body: '페이지를 다시 불러와 주세요. 문제가 계속되면 홈으로 이동해 주세요.',
    retry: '다시 시도',
    home: '홈으로 이동',
  },
  zh: {
    title: '发生了错误',
    body: '请重新加载页面。如果问题仍然存在，请返回首页。',
    retry: '重试',
    home: '返回首页',
  },
};

function localeFromPathname(): SupportedLocale {
  if (typeof window === 'undefined') return 'en';
  const candidate = window.location.pathname.split('/')[1];
  return candidate === 'ko' || candidate === 'zh' ? candidate : 'en';
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<SupportedLocale>('en');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const copy = COPY[locale];

  useEffect(() => {
    setLocale(localeFromPathname());
    if (process.env.NODE_ENV !== 'production') console.error(error);
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [error]);

  return (
    <html lang={locale}>
      <head>
        <title>{copy.title} | TarkovDex</title>
      </head>
      <body className="bg-bg text-fg">
        <main
          aria-labelledby="global-error-title"
          aria-describedby="global-error-description"
          className="mx-auto flex min-h-screen max-w-content flex-col items-start justify-center px-4 py-20 sm:px-6"
        >
          <p className="text-sm font-medium text-accent">TarkovDex</p>
          <h1
            ref={titleRef}
            id="global-error-title"
            tabIndex={-1}
            className="mt-2 text-2xl font-medium tracking-tight focus:outline-none"
          >
            {copy.title}
          </h1>
          <p
            id="global-error-description"
            className="mt-3 max-w-xl text-sm leading-relaxed text-muted"
          >
            {copy.body}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-touch items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
            >
              {copy.retry}
            </button>
            <a
              href={`/${locale}`}
              className="inline-flex min-h-touch items-center rounded-md border border-border bg-surface px-5 text-sm font-medium hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {copy.home}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
