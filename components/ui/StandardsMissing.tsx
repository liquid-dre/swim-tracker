import Link from "next/link";
import { ListChecks } from "lucide-react";

/*
  Zero standards is a setup gap, not "no data" — without cuts the qualifying
  surfaces (status matrix, road to qualify, tier overlays) render blank and
  look broken. This state names the gap and points a coach at the fix; a
  viewer just gets the explanation (the import lives on a coach-only screen).
*/
export function StandardsMissing({ isStaff }: { isStaff: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <ListChecks aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">
          No qualifying standards imported yet
        </p>
        <p className="mx-auto max-w-[52ch] text-sm text-ink-muted">
          {isStaff
            ? "This screen compares meet times against the qualifying cuts. Import the standards once and every tier, gap, and status fills in."
            : "Qualifying tiers appear here once the coach has imported the standards."}
        </p>
      </div>
      {isStaff && (
        <Link
          href="/standards"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-sm font-medium text-white shadow-theme-xs outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-600 focus-visible:ring-2 focus-visible:ring-ring lg:h-9"
        >
          Import standards
        </Link>
      )}
    </div>
  );
}
