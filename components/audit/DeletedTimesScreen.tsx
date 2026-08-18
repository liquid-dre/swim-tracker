"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { SchoolGalaBadge } from "@/components/ui/SchoolGalaBadge";
import { trailForHref } from "@/lib/nav";
import type { Role } from "@/lib/nav";
import { formatTime, type SwimType } from "@/lib/swim";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { RoleChip } from "./shared";

/*
  Deleted times (§R17, Part C). A coach-only, read-only record of every result
  removed from the system — the swim itself, who logged it, who deleted it, and
  why if they said.

  This is a separate screen from the time-entry log rather than a filter on it,
  because the two answer different questions on different clocks: Part B is
  ordered by when a time was ENTERED and reads from the live rows, while a
  deletion is ordered by when it was REMOVED and its row no longer exists. Every
  value below was snapshotted at deletion time, so nothing here can be re-derived
  and nothing needs joining.
*/

const TYPE_LABEL: Record<SwimType, string> = {
  MEET: "Meet",
  TIME_TRIAL: "Trial",
  PRACTICE: "Practice",
  SCHOOL_GALA: "School gala",
};

// The date pickers speak local days (matching the "Deleted" column); the server
// filters on epoch ms, so convert at the local-midnight boundaries.
function dayStartMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function dayEndMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function DeletedTimesScreen() {
  const pathname = usePathname();

  const [swimmer, setSwimmer] = useState<"ALL" | Id<"swimmers">>("ALL");
  const [deleter, setDeleter] = useState<"ALL" | Id<"profiles">>("ALL");
  const [type, setType] = useState<"ALL" | SwimType>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // Every filter applies server-side, so a filtered read searches the FULL
  // history; changing a filter restarts pagination from the newest match.
  const {
    results: rows,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.audit.listDeletedTimeLog,
    {
      swimmerId: swimmer === "ALL" ? undefined : swimmer,
      deletedBy: deleter === "ALL" ? undefined : deleter,
      swimType: type === "ALL" ? undefined : type,
      deletedFrom: from === "" ? undefined : dayStartMs(from),
      deletedTo: to === "" ? undefined : dayEndMs(to),
    },
    { initialNumItems: PAGE },
  );

  // Full option lists (not derived from loaded rows, which would hide anyone
  // whose deletions aren't paged in yet). Both queries are coach-gated.
  const swimmerOptions = useQuery(api.swimmers.listSwimmers, {});
  const deleterOptions = useQuery(api.audit.listEnterers, {});

  const secondaryCount =
    (type !== "ALL" ? 1 : 0) + (from !== "" || to !== "" ? 1 : 0);
  const filtering = swimmer !== "ALL" || deleter !== "ALL" || secondaryCount > 0;
  const loading = pageStatus === "LoadingFirstPage";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Deleted times"
        breadcrumb={trailForHref(pathname)}
        description="Every result removed from the system, with the swim it held and who removed it. The time-entry log reads the live rows, so a deleted swim only appears here. Read-only."
      />

      <FilterBar
        primary={
          <>
            <div className="w-48">
              <Select
                aria-label="Filter by swimmer"
                value={swimmer}
                onValueChange={(v) => setSwimmer(v as "ALL" | Id<"swimmers">)}
                options={[
                  { value: "ALL", label: "All swimmers" },
                  ...(swimmerOptions ?? []).map((s) => ({
                    value: s._id,
                    label: s.name,
                  })),
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                aria-label="Filter by who deleted it"
                value={deleter}
                onValueChange={(v) => setDeleter(v as "ALL" | Id<"profiles">)}
                options={[
                  { value: "ALL", label: "Anyone" },
                  ...(deleterOptions ?? []).map((e) => ({
                    value: e._id,
                    label: e.name,
                  })),
                ]}
              />
            </div>
          </>
        }
        filterCount={secondaryCount}
        onClear={() => {
          setType("ALL");
          setFrom("");
          setTo("");
        }}
        filters={
          <>
            <FilterField label="Swim type">
              <Select
                aria-label="Filter by swim type"
                value={type}
                onValueChange={(v) => setType(v as "ALL" | SwimType)}
                options={[
                  { value: "ALL", label: "Any type" },
                  { value: "MEET", label: "Meet" },
                  { value: "TIME_TRIAL", label: "Trial" },
                  { value: "PRACTICE", label: "Practice" },
                  { value: "SCHOOL_GALA", label: "School gala" },
                ]}
              />
            </FilterField>
            <DateField
              label="Deleted from"
              value={from}
              onChange={setFrom}
              max={to || undefined}
              placeholder="Any start"
            />
            <DateField
              label="Deleted to"
              value={to}
              onChange={setTo}
              min={from || undefined}
              placeholder="Any end"
            />
          </>
        }
      />

      {loading ? (
        <TableSkeleton />
      ) : rows.length === 0 ? (
        pageStatus !== "Exhausted" ? (
          // Never claim the search is done while the Load-older control below
          // can still reach further back.
          <EmptyState
            title="No matches in the newest deletions yet"
            body="Older history hasn't been searched — use “Load older deletions” below to keep looking."
          />
        ) : filtering ? (
          <EmptyState
            title="No deletions match these filters"
            body="The whole log was searched. Clear a filter to see more of the record."
          />
        ) : (
          <EmptyState
            title="No times have been deleted"
            body="If a time is ever removed — by a coach or by a parent clearing a school-gala entry — the swim and the reason are recorded here."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
          <div className="relative overflow-x-auto custom-scrollbar">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <Th className="sm:px-6">Deleted</Th>
                  <Th>Swimmer</Th>
                  <Th>Event</Th>
                  <Th className="text-right">Time</Th>
                  <Th>Type</Th>
                  <Th>Swum</Th>
                  <Th>Entered by</Th>
                  <Th className="sm:px-6">Deleted by</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r._id}
                    className="border-t border-border align-top transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted sm:px-6">
                      {formatDateTime(r.at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">
                      {r.swimmerName}
                    </td>
                    {/* The reason rides under the event rather than taking a
                        column of its own: free text of any length would wreck
                        the grid every other row keeps. It WRAPS rather than
                        truncating to a tooltip — this is the log a coach opens
                        to find out why a swim vanished, and a reason reachable
                        only by hovering a mouse is no answer on a phone. It is
                        capped at 200 characters server-side, so it can't run
                        away with the row. */}
                    <td className="px-4 py-3">
                      <span className="whitespace-nowrap">
                        <span className="font-medium text-ink">{r.label}</span>
                        <span className="ml-1.5 text-xs text-ink-faint">
                          {r.course}
                        </span>
                      </span>
                      {r.reason && (
                        <p className="mt-0.5 max-w-[40ch] text-xs text-ink-muted">
                          {r.reason}
                        </p>
                      )}
                    </td>
                    <td className="time tnum whitespace-nowrap px-4 py-3 text-right font-medium text-ink">
                      {formatTime(r.timeMs)}
                    </td>
                    <td className="px-4 py-3">
                      {r.swimType === "SCHOOL_GALA" ? (
                        <SchoolGalaBadge compact />
                      ) : (
                        <span className="whitespace-nowrap text-sm text-ink-muted">
                          {TYPE_LABEL[r.swimType]}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatShortDate(r.swimDate)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <PersonCell name={r.enteredByName} role={r.enteredByRole} />
                        <span className="whitespace-nowrap text-xs text-ink-faint">
                          {formatDateTime(r.originalCreatedAt)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      <PersonCell name={r.actorName} role={r.actorRole} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && (rows.length > 0 || pageStatus !== "Exhausted") && (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-ink-faint">
            {`${rows.length} ${filtering ? "matching " : ""}${
              rows.length === 1 ? "deletion" : "deletions"
            }${pageStatus !== "Exhausted" ? " loaded" : ""} · newest first`}
          </p>
          {pageStatus !== "Exhausted" && (
            <Button
              variant="secondary"
              size="sm"
              loading={pageStatus === "LoadingMore"}
              onClick={() => loadMore(PAGE)}
            >
              Load older deletions
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Page size: a meaningful first window of history, small enough to stay snappy.
const PAGE = 300;

function PersonCell({ name, role }: { name: string; role: Role }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-ink">{name}</span>
      <RoleChip role={role} />
    </span>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th scope="col" className={"px-4 py-2.5 font-medium " + className}>
      {children}
    </th>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <Trash2 aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
      aria-busy
    />
  );
}
