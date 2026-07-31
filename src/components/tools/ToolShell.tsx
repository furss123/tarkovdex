import { Clock3, Database } from 'lucide-react';
import { GameModeBadge } from './GameModeBadge';

export function ToolIntro({
  title,
  description,
  updatedAt,
  sourceLabel,
  locale,
  showMode = true,
}: {
  title: string;
  description: string;
  updatedAt?: string | null;
  sourceLabel?: string;
  locale?: string;
  showMode?: boolean;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-[28px] font-medium leading-9 tracking-tight text-fg sm:text-[30px] sm:leading-10">
          {title}
        </h1>
        {showMode ? <GameModeBadge /> : null}
      </div>
      <p className="mt-2 max-w-3xl text-[15px] leading-6 text-muted">{description}</p>
      {sourceLabel || updatedAt ? (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[13px] leading-5 text-muted">
          {sourceLabel ? (
            <span className="inline-flex items-center gap-1.5">
              <Database className="size-3.5" aria-hidden="true" />
              {sourceLabel}
            </span>
          ) : null}
          {updatedAt ? (
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="size-3.5" aria-hidden="true" />
              {new Date(updatedAt).toLocaleString(locale)}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

export function DataError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-lg border border-negative/40 bg-negative/5 p-6 text-sm text-negative">
      {message}
    </div>
  );
}
