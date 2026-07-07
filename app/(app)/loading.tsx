/*
  Shell-level loading state: covers the code-split + first-data gap for any
  page without its own skeleton, so navigation never shows a blank content
  well. Mirrors the page anatomy (breadcrumb line, heading, two content cards).
*/
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="space-y-2">
        <div className="h-4 w-56 animate-pulse rounded-sm bg-surface-2" />
        <div className="h-7 w-40 animate-pulse rounded-sm bg-surface-2" />
      </div>
      <div className="h-40 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
