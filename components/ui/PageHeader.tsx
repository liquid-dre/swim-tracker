import type { ReactNode } from "react";

import { AppBreadcrumb, type Crumb } from "@/components/ui/AppBreadcrumb";

/*
  The standard top-of-page block used by EVERY screen: breadcrumb trail, screen
  title, and optional right-aligned actions. Keeps the vertical rhythm and the
  title/crumb relationship identical everywhere.

  - `breadcrumb` is the full trail; its last crumb should equal `title`.
  - `actions` is the primary action zone (e.g. "Log result") — kept on one row
    with the title on wide screens, wrapping below on narrow ones.
*/
export function PageHeader({
  title,
  breadcrumb,
  actions,
  description,
}: {
  title: string;
  breadcrumb: Crumb[];
  actions?: ReactNode;
  description?: ReactNode;
}) {
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
