"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MoreHorizontal } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import type { Course, SwimType } from "@/lib/swim";
import { formatTime } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Select";
import { SchoolGalaBadge } from "@/components/ui/SchoolGalaBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/*
  History table (Step 6, BRD §5.4): every logged result, filterable by event /
  course / type and sortable by date or time, with edit + delete per row. Times
  are right-aligned + tabular. Presentational — the parent owns the data and the
  edit/delete mutations; this owns only view state (filters + sort).
*/

export type HistoryResult = {
  _id: Id<"results">;
  distance: number;
  stroke: string;
  course: Course;
  label: string;
  timeMs: number;
  swimType: SwimType;
  swimDate: string;
  ageAtSwim: number;
  meetName: string | null;
  venue: string | null;
  notes: string | null;
};

type SortField = "date" | "time";
type SortDir = "asc" | "desc";
type CourseFilter = "ALL" | Course;
type TypeFilter = "ALL" | SwimType;

const TYPE_LABEL: Record<SwimType, string> = {
  MEET: "Meet",
  TIME_TRIAL: "Trial",
  PRACTICE: "Practice",
  SCHOOL_GALA: "School gala",
};

export function HistoryTable({
  rows,
  onEdit,
  onDelete,
  canEditRow,
}: {
  rows: HistoryResult[];
  // Omitted for a read-only viewer: no actions column, no edit/delete affordance.
  onEdit?: (row: HistoryResult) => void;
  onDelete?: (row: HistoryResult) => void;
  // Per-row gate (§R15): a coach may edit every row, but a viewer (parent) may
  // only edit/delete the SCHOOL_GALA rows they entered. When it returns false the
  // row shows no actions even though handlers are wired. Absent = every row.
  canEditRow?: (row: HistoryResult) => boolean;
}) {
  // Read-only when neither handler is supplied — the whole actions column drops.
  const readOnly = !onEdit && !onDelete;
  const rowEditable = (row: HistoryResult) =>
    !readOnly && (canEditRow ? canEditRow(row) : true);
  const [eventFilter, setEventFilter] = useState<string>("ALL");
  const [courseFilter, setCourseFilter] = useState<CourseFilter>("ALL");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Distinct events present, in the order the (already event-... no) rows give;
  // sort by distance then label for a stable menu.
  const events = useMemo(() => {
    const seen = new Map<string, { distance: number; label: string }>();
    for (const r of rows) {
      if (!seen.has(r.label)) seen.set(r.label, { distance: r.distance, label: r.label });
    }
    return [...seen.values()].sort(
      (a, b) => a.distance - b.distance || a.label.localeCompare(b.label),
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const out = rows.filter(
      (r) =>
        (eventFilter === "ALL" || r.label === eventFilter) &&
        (courseFilter === "ALL" || r.course === courseFilter) &&
        (typeFilter === "ALL" || r.swimType === typeFilter),
    );
    out.sort((a, b) => {
      const cmp =
        sortField === "time"
          ? a.timeMs - b.timeMs
          : a.swimDate < b.swimDate
            ? -1
            : a.swimDate > b.swimDate
              ? 1
              : a.timeMs - b.timeMs; // stable tiebreak within a day
      return sortDir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, eventFilter, courseFilter, typeFilter, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Sensible default direction per field: newest first, fastest first.
      setSortDir(field === "time" ? "asc" : "desc");
    }
  }

  // Truly empty (no swims at all) reads differently from filtered-to-nothing.
  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-theme-sm">
        <p className="text-sm font-medium text-ink">No swims logged yet</p>
        <p className="mx-auto mt-1 max-w-[44ch] text-sm text-ink-muted">
          Times you log for this swimmer will appear here, with the newest first.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <NativeSelect
          ariaLabel="Filter by event"
          value={eventFilter}
          onChange={setEventFilter}
          options={[
            { value: "ALL", label: "All events" },
            ...events.map((e) => ({ value: e.label, label: e.label })),
          ]}
        />
        <NativeSelect
          ariaLabel="Filter by type"
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as TypeFilter)}
          options={[
            { value: "ALL", label: "All types" },
            { value: "MEET", label: "Meet" },
            { value: "TIME_TRIAL", label: "Trial" },
            { value: "PRACTICE", label: "Practice" },
            { value: "SCHOOL_GALA", label: "School gala" },
          ]}
        />
        <div className="ml-auto">
          <Segmented
            ariaLabel="Filter by course"
            value={courseFilter}
            onChange={setCourseFilter}
            options={[
              { value: "ALL", label: "All" },
              { value: "LCM", label: "LCM" },
              { value: "SCM", label: "SCM" },
            ]}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        {/* relative: contains the cells' absolute sr-only spans within the scroll
            box (else off-screen ones leak to the app inset and widen the page). */}
        <div className="relative overflow-x-auto custom-scrollbar">
          <table className="w-full text-base">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">
                  <SortHeader
                    label="Date"
                    active={sortField === "date"}
                    dir={sortDir}
                    onClick={() => toggleSort("date")}
                  />
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">Event</th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium sm:table-cell">Course</th>
                <th scope="col" className="px-4 py-2.5 font-medium">Type</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">
                  <SortHeader
                    label="Time"
                    align="right"
                    active={sortField === "time"}
                    dir={sortDir}
                    onClick={() => toggleSort("time")}
                  />
                </th>
                <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Meet</th>
                {!readOnly && (
                  <th scope="col" className="px-4 py-2.5 sm:px-6">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r._id} className="border-t border-border transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2">
                  <td className="whitespace-nowrap px-4 py-3 text-ink sm:px-6">
                    {formatShortDate(r.swimDate)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-ink">{r.label}</td>
                  <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">{r.course}</td>
                  <td className="px-4 py-3">
                    <TypeBadge type={r.swimType} />
                  </td>
                  <td className="time tnum px-4 py-3 text-right font-medium text-ink">
                    {formatTime(r.timeMs)}
                  </td>
                  <td className="hidden max-w-[22ch] truncate px-4 py-3 text-ink-muted md:table-cell">
                    {r.meetName ?? <span className="text-ink-faint">—</span>}
                  </td>
                  {!readOnly && (
                    <td className="px-4 py-3 text-right sm:px-6">
                      {rowEditable(r) ? (
                        <RowActions
                          onEdit={() => onEdit?.(r)}
                          onDelete={() => onDelete?.(r)}
                        />
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-ink">No results match these filters</p>
            <p className="mx-auto mt-1 max-w-[40ch] text-sm text-ink-muted">
              Clear a filter to see more of this swimmer&apos;s history.
            </p>
          </div>
        )}
      </div>

      <p className="px-1 text-xs text-ink-faint">
        {filtered.length} of {rows.length} {rows.length === 1 ? "result" : "results"}
      </p>
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  align,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  align?: "right";
  onClick: () => void;
}) {
  const Arrow = dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Sort by ${label}${active ? (dir === "asc" ? ", ascending" : ", descending") : ""}`}
      className={
        "inline-flex items-center gap-1 rounded-sm font-medium uppercase tracking-wide outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-ink focus-visible:ring-2 focus-visible:ring-ring " +
        (active ? "text-ink" : "text-gray-500") +
        (align === "right" ? " flex-row-reverse" : "")
      }
    >
      {label}
      <Arrow
        aria-hidden
        className={"size-3 " + (active ? "opacity-100" : "opacity-0")}
        strokeWidth={2.25}
      />
    </button>
  );
}

function TypeBadge({ type }: { type: SwimType }) {
  // A school gala is unofficial — it gets the loud warning-toned badge, never the
  // quiet dot treatment the official types share (§R15).
  if (type === "SCHOOL_GALA") return <SchoolGalaBadge />;

  const isMeet = type === "MEET";
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 text-sm " +
        (isMeet ? "text-ink" : "text-ink-muted")
      }
    >
      <span
        aria-hidden
        className={
          "size-1.5 rounded-full " +
          (isMeet ? "bg-brand-500" : "border border-gray-400 bg-transparent")
        }
      />
      {TYPE_LABEL[type]}
    </span>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Result actions"
        className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
      >
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        <DropdownMenuItem onClick={onEdit}>Edit</DropdownMenuItem>
        <DropdownMenuItem
          onClick={onDelete}
          className="text-danger-ink focus:text-danger-ink"
        >
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  // Thin fixed-width wrapper over the shared styled Select so the history
  // filters read like every other picker in the app.
  return (
    <div className="w-44">
      <Select
        aria-label={ariaLabel}
        value={value}
        onValueChange={onChange}
        options={options}
      />
    </div>
  );
}
