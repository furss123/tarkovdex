export default function TasksLoading() {
  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-10 w-full max-w-md animate-pulse rounded-md bg-surface-2" />
        <div className="flex gap-3">
          <div className="h-10 min-w-0 flex-1 animate-pulse rounded-md bg-surface-2 sm:w-32 sm:flex-none" />
          <div className="h-10 min-w-0 flex-1 animate-pulse rounded-md bg-surface-2 sm:w-32 sm:flex-none" />
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-start gap-3 border-b border-border/60 px-4 py-4 last:border-0"
          >
            <div className="size-10 shrink-0 animate-pulse rounded bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
