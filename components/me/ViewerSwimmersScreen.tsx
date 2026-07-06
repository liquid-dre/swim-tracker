"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { trailForHref } from "@/lib/nav";
import { NoLinkState, ReadOnlyChip } from "./viewerShared";

/*
  Viewer "My swimmers" — the read-only mirror of the coach roster, scoped
  server-side to the swimmer(s) this viewer has been granted access to
  (listForProfile). Each row links to that swimmer's read-only profile. When a
  viewer has no links yet, the whole screen becomes the request-access flow
  (NoLinkState embeds Find a swimmer). Otherwise a "Find a swimmer" action lets a
  parent request access to another child. No add/edit/deactivate — viewers never
  mutate the roster.
*/

type ViewerSwimmerRow = {
  _id: string;
  name: string;
  gender: "M" | "F";
  age: number;
  active: boolean;
};

export function ViewerSwimmersScreen() {
  const data = useQuery(api.swimmers.listForProfile, {});
  const swimmers = data?.swimmers as ViewerSwimmerRow[] | undefined;

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader
        title="My swimmers"
        breadcrumb={trailForHref("/me/swimmers")}
        description="The swimmer(s) you can follow. Open one to see their bests, progression and road to qualify."
        actions={
          <div className="flex items-center gap-3">
            <ReadOnlyChip />
            <Link
              href="/me/find"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Search className="size-4 text-ink-faint" strokeWidth={1.75} />
              Find a swimmer
            </Link>
          </div>
        }
      />

      {data === undefined ? (
        <TableSkeleton />
      ) : swimmers && swimmers.length === 0 ? (
        <NoLinkState />
      ) : (
        <SwimmerTable rows={swimmers ?? []} />
      )}
    </div>
  );
}

function SwimmerTable({ rows }: { rows: ViewerSwimmerRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <table className="w-full text-base">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
              Swimmer
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Age
            </th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">
              Gender
            </th>
            <th scope="col" className="px-4 py-2.5 font-medium">
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr
              key={s._id}
              className="border-t border-border transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
            >
              <td className="px-4 py-3 sm:px-6">
                <Link
                  href={`/me/swimmers/${s._id}`}
                  className={
                    "rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring " +
                    (s.active ? "text-ink" : "text-ink-muted")
                  }
                >
                  {s.name}
                </Link>
              </td>
              <td className="tnum px-4 py-3 text-ink-muted">{s.age}</td>
              <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
                {s.gender === "F" ? "Female" : "Male"}
              </td>
              <td className="px-4 py-3">
                {s.active ? (
                  <span className="inline-flex items-center gap-1.5 text-sm text-success-ink">
                    <span aria-hidden className="size-1.5 rounded-full bg-success" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm text-ink-faint">
                    <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" />
                    Inactive
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
      aria-busy
    >
      <table className="w-full text-base">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2.5 font-medium sm:px-6">Swimmer</th>
            <th className="px-4 py-2.5 font-medium">Age</th>
            <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Gender</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 3 }).map((_, i) => (
            <tr key={i} className="border-t border-border" aria-hidden>
              <td className="px-4 py-3 sm:px-6">
                <div className="h-3.5 w-40 animate-pulse rounded-sm bg-surface-2" />
              </td>
              <td className="px-4 py-3">
                <div className="h-3.5 w-6 animate-pulse rounded-sm bg-surface-2" />
              </td>
              <td className="hidden px-4 py-3 sm:table-cell">
                <div className="h-3.5 w-14 animate-pulse rounded-sm bg-surface-2" />
              </td>
              <td className="px-4 py-3">
                <div className="h-3.5 w-16 animate-pulse rounded-sm bg-surface-2" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
