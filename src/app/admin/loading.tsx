export default function AdminLoading() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar outline */}
      <aside className="hidden w-64 shrink-0 border-r border-border bg-card p-4 md:block">
        <div className="mb-6 h-8 w-32 animate-pulse rounded-md bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-9 w-full animate-pulse rounded-md bg-muted"
            />
          ))}
        </div>
      </aside>

      {/* Content placeholder */}
      <main className="flex-1 p-6">
        <div className="mb-6 h-9 w-56 animate-pulse rounded-md bg-muted" />
        <div className="mb-4 h-5 w-80 animate-pulse rounded-md bg-muted" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 w-full animate-pulse rounded-lg bg-muted"
            />
          ))}
        </div>
      </main>
    </div>
  );
}
