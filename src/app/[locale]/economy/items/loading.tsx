export default function ItemsLoading() {
  return (
    <section className="mx-auto max-w-content px-4 py-[20px] sm:px-6 sm:py-[24px]">
      <div className="mb-4 border-b border-border pb-4">
        <div className="h-8 w-36 animate-pulse rounded bg-surface-2" />
        <div className="mt-2 h-4 w-full max-w-md animate-pulse rounded bg-surface-2" />
      </div>
      <div className="mb-4 h-[44px] w-full animate-pulse rounded-md bg-surface-2 lg:max-w-xl" />
      <div className="space-y-2 lg:hidden">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[180px] animate-pulse rounded-lg border border-border bg-surface"
          />
        ))}
      </div>
      <div className="hidden overflow-hidden rounded-lg border border-border lg:block">
        <div className="h-[48px] animate-pulse border-b border-border bg-surface-2" />
        {Array.from({ length: 8 }).map((_, index) => (
          <div
            key={index}
            className="h-[68px] animate-pulse border-b border-border bg-surface last:border-0"
          />
        ))}
      </div>
    </section>
  );
}
