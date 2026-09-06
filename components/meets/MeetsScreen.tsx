"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { CalendarPlus, MapPin, Upload } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { formatMeetDates, isUpcoming } from "@/lib/meets";
import { trailForHref } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { cn } from "@/lib/utils";
import { COURSE_LABEL, GalaTag } from "./meetShared";
import { ImportMeetSheet } from "./ImportMeetSheet";
import { MeetForm } from "./MeetForm";

/*
  The season's fixtures (§R19) — one component for the coach surface (/meets) and
  the viewer mirror (/me/meets). The only role-aware part is which links it
  builds and whether the editing controls render; the DATA is identical, because
  meets are global reference data every signed-in role reads.

  Editing is the super-user's. The controls below are hidden for anyone else as a
  convenience — the boundary itself is `requireSuperUser` in every meets mutation,
  so a hidden button is never what keeps a coach out.

  Upcoming leads, because "what's next" is the question this screen answers. Past
  meets are one toggle away rather than gone: they are where the logged times came
  from, and a coach reading back through a season needs them.
*/

type Filter = "upcoming" | "past" | "all";

const FILTER_OPTIONS: ReadonlyArray<{ value: Filter; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All" },
];

export function MeetsScreen({
  role,
  today,
}: {
  role: "coach" | "viewer";
  today: string;
}) {
  const isViewer = role === "viewer";
  const href = isViewer ? "/me/meets" : "/meets";
  const base = isViewer ? "/me/meets" : "/meets";

  const meets = useQuery(api.meets.listMeets, {});
  const profile = useCurrentProfile();
  const canEdit = !isViewer && profile?.role === "SUPER_USER";

  const [filter, setFilter] = useState<Filter>("upcoming");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const shown = useMemo(() => {
    if (!meets) return undefined;
    const rows = meets.filter((m) => {
      if (filter === "all") return true;
      const upcoming = isUpcoming(m, today);
      return filter === "upcoming" ? upcoming : !upcoming;
    });
    // Upcoming reads soonest-first; past reads most-recent-first. Both put the
    // meet nearest to today at the top, which is the one being looked for.
    return filter === "past"
      ? [...rows].sort((a, b) => b.startDate.localeCompare(a.startDate))
      : rows;
  }, [meets, filter, today]);

  const importOptions = useMemo(
    () =>
      (meets ?? []).map((m) => ({
        _id: m._id,
        name: m.name,
        startDate: m.startDate,
        endDate: m.endDate,
        eventCount: m.events.length,
      })),
    [meets],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Meets"
        breadcrumb={trailForHref(href)}
        description={
          isViewer
            ? "The season's galas and what's on each programme."
            : "The season's galas and their event programmes. Times you log still record their own meet name."
        }
        actions={
          canEdit ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="size-4" aria-hidden />
                Import programme
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <CalendarPlus className="size-4" aria-hidden />
                Add meet
              </Button>
            </>
          ) : undefined
        }
      />

      <FilterBar
        primary={
          <FilterField label="Show">
            <Select
              aria-label="Which meets to show"
              value={filter}
              onValueChange={(v) => setFilter(v as Filter)}
              options={FILTER_OPTIONS.map((o) => ({ ...o }))}
            />
          </FilterField>
        }
      />

      {shown === undefined ? (
        <MeetsSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState filter={filter} canEdit={canEdit} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm">
              <caption className="sr-only">
                {FILTER_OPTIONS.find((o) => o.value === filter)?.label} meets,
                {filter === "past" ? " most recent first" : " soonest first"}.
              </caption>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-2xs uppercase tracking-wide text-ink-faint">
                  <th scope="col" className="px-4 py-2 font-semibold">
                    Meet
                  </th>
                  <th scope="col" className="w-44 px-4 py-2 font-semibold">
                    Dates
                  </th>
                  <th scope="col" className="w-40 px-4 py-2 font-semibold">
                    Course
                  </th>
                  <th scope="col" className="w-24 px-4 py-2 text-right font-semibold">
                    Events
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {shown.map((meet) => {
                  const past = !isUpcoming(meet, today);
                  return (
                    <tr
                      key={meet._id}
                      className="transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-50/40"
                    >
                      <td className="px-4 py-2.5">
                        <Link
                          href={`${base}/${meet._id}`}
                          className="rounded-sm font-medium text-ink outline-none hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {meet.name}
                        </Link>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                          {meet.galaCode && <GalaTag code={meet.galaCode} />}
                          {meet.venue && (
                            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
                              <MapPin aria-hidden className="size-3" />
                              {meet.venue}
                            </span>
                          )}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-2.5 tabular-nums",
                          past ? "text-ink-faint" : "text-ink",
                        )}
                      >
                        {formatMeetDates(meet)}
                      </td>
                      <td className="px-4 py-2.5 text-ink-muted">
                        {meet.course ? COURSE_LABEL[meet.course] : "Not set"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                        {meet.events.length === 0 ? "—" : meet.events.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {canEdit && (
        <>
          <MeetForm
            key={addOpen ? "add-open" : "add-closed"}
            open={addOpen}
            onOpenChange={setAddOpen}
            today={today}
          />
          <ImportMeetSheet
            open={importOpen}
            onOpenChange={setImportOpen}
            meets={importOptions}
          />
        </>
      )}
    </div>
  );
}

function EmptyState({ filter, canEdit }: { filter: Filter; canEdit: boolean }) {
  const copy =
    filter === "upcoming"
      ? "No meets are coming up."
      : filter === "past"
        ? "No past meets on the calendar."
        : "No meets on the calendar yet.";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-theme-sm">
      <p className="text-sm font-medium text-ink">{copy}</p>
      <p className="mx-auto mt-1 max-w-[48ch] text-sm text-ink-muted">
        {canEdit
          ? "Add a fixture, or import a meet programme to load one with its full event list."
          : "The season's fixtures are added by the administrator."}
      </p>
    </div>
  );
}

function MeetsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0">
          <div className="h-4 flex-1 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-24 animate-pulse rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
