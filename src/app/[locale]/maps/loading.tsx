export default function MapsLoading() {
  return (
    <section className="mx-auto max-w-content px-4 py-10 sm:px-6">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-40 animate-pulse rounded bg-surface-2" />
        {/* max-w-full — see items/loading.tsx for why. */}
        <div className="h-4 w-72 max-w-full animate-pulse rounded bg-surface-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border p-5">
            <div className="h-5 w-2/3 animate-pulse rounded bg-surface-2" />
            <div className="mt-3 h-3 w-full animate-pulse rounded bg-surface-2" />
            <div className="mt-1.5 h-3 w-4/5 animate-pulse rounded bg-surface-2" />
            <div className="mt-4 h-3 w-1/3 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    </section>
  );
}
