"use client";

import { MoreHorizontal, Plus, UserPlus } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Presentational roster table (Step 4). Pure props → markup, so the same table
// is rendered by the live screen (Convex data) and the design-preview harness
// (mock data). No data fetching here.

export type RosterRow = {
  _id: Id<"swimmers">;
  name: string;
  dob: string;
  gender: "M" | "F";
  active: boolean;
  notes?: string;
  age: number;
  squads: { _id: string; name: string }[];
};

export function RosterTable({
  rows,
  scope,
  search,
  onEdit,
  onToggleActive,
  onAdd,
}: {
  rows: RosterRow[] | undefined; // undefined => loading
  scope: "active" | "all";
  search: string;
  onEdit: (row: RosterRow) => void;
  onToggleActive: (row: RosterRow) => void;
  onAdd: () => void;
}) {
  const loading = rows === undefined;
  const isEmpty = !loading && rows.length === 0;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-base">
        <thead>
          <tr className="bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
            <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">Swimmer</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Age</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Gender</th>
            <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Squads</th>
            <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-4 py-2.5 sm:px-6">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}

          {!loading &&
            rows.map((s) => (
              <tr
                key={s._id}
                className="border-t border-border transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
              >
                <td className="px-4 py-3 sm:px-6">
                  <span className={s.active ? "font-medium text-ink" : "font-medium text-ink-muted"}>
                    {s.name}
                  </span>
                </td>
                <td className="tnum px-4 py-3 text-ink-muted">{s.age}</td>
                <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
                  {s.gender === "F" ? "Female" : "Male"}
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <SquadChips squads={s.squads} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge active={s.active} />
                </td>
                <td className="px-4 py-3 text-right sm:px-6">
                  <RowActions
                    active={s.active}
                    onEdit={() => onEdit(s)}
                    onToggleActive={() => onToggleActive(s)}
                  />
                </td>
              </tr>
            ))}
        </tbody>
      </table>

      {isEmpty && (
        <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
          <UserPlus aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">
              {search.trim() !== ""
                ? "No swimmers match that search"
                : scope === "active"
                  ? "No active swimmers yet"
                  : "No swimmers yet"}
            </p>
            <p className="mx-auto max-w-[42ch] text-sm text-ink-muted">
              {search.trim() !== ""
                ? "Try a different name, or clear the search."
                : "Add your first swimmer to start tracking times and squads."}
            </p>
          </div>
          {search.trim() === "" && (
            <Button variant="secondary" size="sm" onClick={onAdd}>
              <Plus className="size-4" /> Add swimmer
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-sm text-success-ink">
      <span aria-hidden className="size-1.5 rounded-full bg-success" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-faint">
      <span aria-hidden className="size-1.5 rounded-full bg-ink-faint" />
      Inactive
    </span>
  );
}

function SquadChips({ squads }: { squads: { _id: string; name: string }[] }) {
  if (squads.length === 0) {
    return <span className="text-sm text-ink-faint">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {squads.map((sq) => (
        <span
          key={sq._id}
          className="inline-flex items-center rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-xs text-ink-muted"
        >
          {sq.name}
        </span>
      ))}
    </div>
  );
}

function RowActions({
  active,
  onEdit,
  onToggleActive,
}: {
  active: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Swimmer actions"
        className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem onClick={onToggleActive}>
          {active ? "Deactivate" : "Reactivate"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-t border-border" aria-hidden>
      <td className="px-4 py-3 sm:px-6"><Skeleton className="w-40" /></td>
      <td className="px-4 py-3"><Skeleton className="w-6" /></td>
      <td className="hidden px-4 py-3 sm:table-cell"><Skeleton className="w-14" /></td>
      <td className="hidden px-4 py-3 md:table-cell"><Skeleton className="w-24" /></td>
      <td className="px-4 py-3"><Skeleton className="w-16" /></td>
      <td className="px-4 py-3 sm:px-6"><Skeleton className="ml-auto w-8" /></td>
    </tr>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`h-3.5 animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}
