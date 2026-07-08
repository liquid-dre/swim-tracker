"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { usePaginatedQuery, useQuery } from "convex/react";
import { ClipboardList } from "lucide-react";

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
import { formatDateTime } from "@/lib/format";
import { RoleChip } from "./shared";

/*
  Time-entry log (§R17, Part B). A coach-only, read-only audit of every result's
  provenance — who captured a time and when, and who last changed it. Parent-
  entered school-gala times are attributed to the parent (a viewer) and marked
  unofficial. Filterable by swimmer, enterer, role, swim type and entry date, so a
  coach can answer "who logged / changed this?" with certainty.
*/

type Person = { name: string; role: Role };

const TYPE_LABEL: Record<SwimType, string> = {
  MEET: "Meet",
  TIME_TRIAL: "Trial",
  PRACTICE: "Practice",
  SCHOOL_GALA: "School gala",
};

// The date pickers speak local days (matching the "When" column); the server
// filters on createdAt epoch ms, so convert at the local-midnight boundaries.
function dayStartMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function dayEndMs(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}

export function TimeEntryLogScreen() {
  const pathname = usePathname();

  const [swimmer, setSwimmer] = useState<"ALL" | Id<"swimmers">>("ALL");
  const [enterer, setEnterer] = useState<"ALL" | Id<"profiles">>("ALL");
  const [role, setRole] = useState<"ALL" | Role>("ALL");
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
    api.audit.listTimeEntryLog,
    {
      swimmerId: swimmer === "ALL" ? undefined : swimmer,
      enteredBy: enterer === "ALL" ? undefined : enterer,
      swimType: type === "ALL" ? undefined : type,
      role: role === "ALL" ? undefined : role,
      enteredFrom: from === "" ? undefined : dayStartMs(from),
      enteredTo: to === "" ? undefined : dayEndMs(to),
    },
    { initialNumItems: PAGE },
  );

  // Full option lists (not derived from loaded rows, which would hide anyone
  // whose entries aren't paged in yet). Both queries are coach-gated.
  const swimmerOptions = useQuery(api.swimmers.listSwimmers, {});
  const entererOptions = useQuery(api.audit.listEnterers, {});

  const secondaryCount =
    (role !== "ALL" ? 1 : 0) +
    (type !== "ALL" ? 1 : 0) +
    (from !== "" || to !== "" ? 1 : 0);
  const filtering =
    swimmer !== "ALL" || enterer !== "ALL" || secondaryCount > 0;
  const loading = pageStatus === "LoadingFirstPage";

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title="Time-entry log"
        breadcrumb={trailForHref(pathname)}
        description="Who captured each time and when, and who last changed it. Parent-entered school-gala times are marked unofficial. Read-only."
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
                aria-label="Filter by who entered it"
                value={enterer}
                onValueChange={(v) => setEnterer(v as "ALL" | Id<"profiles">)}
                options={[
                  { value: "ALL", label: "Anyone" },
                  ...(entererOptions ?? []).map((e) => ({
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
          setRole("ALL");
          setType("ALL");
          setFrom("");
          setTo("");
        }}
        filters={
          <>
            <FilterField label="Entered by role">
              <Select
                aria-label="Filter by role"
                value={role}
                onValueChange={(v) => setRole(v as "ALL" | Role)}
                options={[
                  { value: "ALL", label: "Any role" },
                  { value: "COACH", label: "Coach" },
                  { value: "SUPER_USER", label: "Admin" },
                  { value: "VIEWER", label: "Viewer (parent)" },
                ]}
              />
            </FilterField>
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
              label="Entered from"
              value={from}
              onChange={setFrom}
              max={to || undefined}
              placeholder="Any start"
            />
            <DateField
              label="Entered to"
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
        filtering ? (
          <EmptyState
            title="No entries match these filters"
            body="The whole history was searched. Clear a filter to see more of the entry log."
          />
        ) : (
          <EmptyState
            title="No times logged yet"
            body="Once times are captured, every entry and edit will be recorded here with who did it and when."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
          <div className="relative overflow-x-auto custom-scrollbar">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                  <Th className="sm:px-6">Entered</Th>
                  <Th>Swimmer</Th>
                  <Th>Event</Th>
                  <Th className="text-right">Time</Th>
                  <Th>Type</Th>
                  <Th>Entered by</Th>
                  <Th className="sm:px-6">Last edited</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r._id}
                    className="border-t border-border align-top transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted sm:px-6">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">
                      {r.swimmerName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="font-medium text-ink">{r.label}</span>
                      <span className="ml-1.5 text-xs text-ink-faint">{r.course}</span>
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
                    <td className="px-4 py-3">
                      <PersonCell person={r.enteredBy} />
                    </td>
                    <td className="px-4 py-3 sm:px-6">
                      {r.editedBy && r.updatedAt !== null ? (
                        <div className="flex flex-col gap-0.5">
                          <PersonCell person={r.editedBy} />
                          <span className="whitespace-nowrap text-xs text-ink-faint">
                            {formatDateTime(r.updatedAt)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-ink-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-ink-faint">
            {`${rows.length} ${filtering ? "matching " : ""}${
              rows.length === 1 ? "entry" : "entries"
            }${pageStatus !== "Exhausted" ? " loaded" : ""} · newest first`}
          </p>
          {pageStatus !== "Exhausted" && (
            <Button
              variant="secondary"
              size="sm"
              loading={pageStatus === "LoadingMore"}
              onClick={() => loadMore(PAGE)}
            >
              Load older entries
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Page size: a meaningful first window of history, small enough to stay snappy.
const PAGE = 300;

function PersonCell({ person }: { person: Person | null }) {
  if (!person) return <span className="text-ink-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-ink">{person.name}</span>
      <RoleChip role={person.role} />
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
      <ClipboardList aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
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
