import type { ReactNode } from "react";

import { AppBreadcrumb, type Crumb } from "@/components/ui/AppBreadcrumb";

/*
  The standard top-of-page block used by EVERY screen: breadcrumb trail, screen
  title, and optional right-aligned actions. Keeps the vertical rhythm and the
  title/crumb relationship identical everywhere.

  - `breadcrumb` is the full trail; its last crumb should equal `title`.
  - `actions` is the primary action zone (e.g. "Log result") — kept on one row
    with the title on wide screens, wrapping below on narrow ones.
  - `variant` is `"water"` by DEFAULT (DESIGN.md §3c): the title/crumb sit inside
    the deep-water header band, light-on-dark, with a slow ambient wave. Chrome
    only — no data lives here, so the band never competes with the tier/stroke
    palettes. Actions on the band want solid or translucent backgrounds (buttons
    already have them; bare chips use their `onWater` tone). Pass `variant="plain"`
    to opt a screen back out to the flat header.
*/
export function PageHeader({
  title,
  breadcrumb,
  actions,
  description,
  variant = "water",
}: {
  title: string;
  breadcrumb: Crumb[];
  actions?: ReactNode;
  description?: ReactNode;
  variant?: "plain" | "water";
}) {
  if (variant === "water") {
    return (
      <header className="relative overflow-hidden rounded-2xl bg-[linear-gradient(120deg,var(--color-water-1),var(--color-water-2)_52%,var(--color-water-3))] px-5 py-5 text-white shadow-theme-sm sm:px-6 sm:py-6">
        {/* Ambient wave, tiled wider than the band so the drift loops seamlessly. */}
        <svg
          aria-hidden
          className="water-wave pointer-events-none absolute inset-x-0 bottom-0 h-7 w-[calc(100%+72px)] text-aqua-500 opacity-45"
          viewBox="0 0 572 28"
          preserveAspectRatio="none"
        >
          <path
            d="M0 15 Q 36 5 72 15 T 144 15 T 216 15 T 288 15 T 360 15 T 432 15 T 504 15 T 572 15 V28 H0Z"
            fill="currentColor"
          />
        </svg>
        <div className="relative flex flex-col gap-3">
          <AppBreadcrumb trail={breadcrumb} tone="onWater" />
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white">{title}</h1>
              {description && (
                <p className="mt-1 max-w-[68ch] text-sm text-white/80">{description}</p>
              )}
            </div>
            {actions && (
              <div className="flex shrink-0 items-center gap-2">{actions}</div>
            )}
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="flex flex-col gap-3">
      <AppBreadcrumb trail={breadcrumb} />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-1 max-w-[68ch] text-sm text-ink-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
