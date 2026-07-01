import { PageHeader } from "@/components/ui/PageHeader";
import { leafForHref, titleForHref, trailForHref } from "@/lib/nav";

/*
  Placeholder for routes not yet built (Step 3.6). Every nav destination resolves
  to a real page so the sidebar never 404s during the build; later feature steps
  replace these. Renders the standard PageHeader (breadcrumb + title) derived from
  the IA, then a calm, teaching empty state — not a dead end.
*/
export function ComingSoon({
  href,
  description,
}: {
  href: string;
  description: string;
}) {
  const leaf = leafForHref(href);
  const Icon = leaf?.icon;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={titleForHref(href)} breadcrumb={trailForHref(href)} />

      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-6 py-14 text-center">
        {Icon && (
          <Icon aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Coming soon</p>
          <p className="mx-auto max-w-[46ch] text-sm text-ink-muted">{description}</p>
        </div>
      </div>
    </div>
  );
}
