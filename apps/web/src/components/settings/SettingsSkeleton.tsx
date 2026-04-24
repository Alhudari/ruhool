/**
 * Shared skeleton for slow settings tabs. Renders as soon as a Suspense
 * boundary hits its fallback — so the user never sees a blank panel
 * during a slow fetch. Theme-token only; RTL-safe because the layout
 * is symmetrical.
 */
export function SettingsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-5 animate-pulse" aria-hidden="true">
      <div className="h-6 w-48 rounded bg-surface-secondary" />
      <div className="h-3 w-64 rounded bg-surface-secondary" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="rounded-[var(--radius-lg)] border border-border p-4 space-y-2">
            <div className="h-3 w-32 rounded bg-surface-secondary" />
            <div className="h-9 w-full rounded bg-surface-secondary" />
          </div>
        ))}
      </div>
    </div>
  );
}
