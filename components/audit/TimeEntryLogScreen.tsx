"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { ClipboardList } from "lucide-react";

import { api } from "@/convex/_generated/api";
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

// The entry date in the viewer's local timezone (matches the "When" column), so a
// date-range filter lines up with what the coach reads on screen.
function localDay(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function TimeEntryLogScreen() {
  const pathname = usePathname();
  // Cursor-paginated so the trail is complete; "Load more" walks further back.
  const {
    results: rows,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(api.audit.listTimeEntryLog, {}, { initialNumItems: PAGE });

  const [swimmer, setSwimmer] = useState("ALL");
  const [enterer, setEnterer] = useState("ALL");
  const [role, setRole] = useState<"ALL" | Role>("ALL");
  const [type, setType] = useState<"ALL" | SwimType>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const swimmers = useMemo(
    () => distinct(rows.map((r) => r.swimmerName)),
    [rows],
  );
  const enterers = useMemo(
    () => distinct(rows.map((r) => r.enteredBy?.name ?? "")),
    [rows],
  );

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        const day = localDay(r.createdAt);
        return (
          (swimmer === "ALL" || r.swimmerName === swimmer) &&
          (enterer === "ALL" || r.enteredBy?.name === enterer) &&
          (role === "ALL" || r.enteredBy?.role === role) &&
          (type === "ALL" || r.swimType === type) &&
          (from === "" || day >= from) &&
          (to === "" || day <= to)
        );
      }),
    [rows, swimmer, enterer, role, type, from, to],
  );

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
                onValueChange={setSwimmer}
                options={[
                  { value: "ALL", label: "All swimmers" },
                  ...swimmers.map((s) => ({ value: s, label: s })),
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                aria-label="Filter by who entered it"
                value={enterer}
                onValueChange={setEnterer}
                options={[
                  { value: "ALL", label: "Anyone" },
                  ...enterers.map((e) => ({ value: e, label: e })),
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
        <EmptyState
          title="No times logged yet"
          body="Once times are captured, every entry and edit will be recorded here with who did it and when."
        />
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
                {filtered.map((r) => (
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

          {filtered.length === 0 && (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-ink">
                No entries match these filters
              </p>
              <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink-muted">
                Clear a filter to see more of the entry history.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-xs text-ink-faint">
            {/* Filters search only the loaded window — say so while older rows
                remain, or a filtered read looks complete when it isn't. */}
            {filtering && pageStatus !== "Exhausted"
              ? `${filtered.length} matching — only the ${rows.length} loaded entries were searched`
              : filtered.length === rows.length
                ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"}${pageStatus !== "Exhausted" ? " loaded" : ""}`
                : `${filtered.length} of ${rows.length} entries`}
            {" · newest first"}
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

// Page size: generous enough that the filter dropdowns (derived from loaded
// rows) are useful on first paint, small enough to stay snappy.
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

function distinct(values: string[]): string[] {
  return [...new Set(values.filter((v) => v.trim() !== ""))].sort((a, b) =>
    a.localeCompare(b),
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
