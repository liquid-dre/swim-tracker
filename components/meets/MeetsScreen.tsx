"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { CalendarPlus, MapPin, Search, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { FilterBar, FilterField } from "@/components/ui/FilterBar";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { formatMeetDates, isUpcoming } from "@/lib/meets";
import { trailForHref } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { COURSE_LABEL, GalaTag } from "./meetShared";
import { describeTally, type EntryTally } from "@/lib/meetEntries";
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isViewer = role === "viewer";
  const base = isViewer ? "/me/meets" : "/meets";

  const meets = useQuery(api.meets.listMeets, {});
  // Sign-ups per meet: this club's for a coach, this family's for a viewer.
  // Both are read for the whole season in one seek rather than per row.
  const clubCounts = useQuery(
    api.meetEntries.getEntryCounts,
    isViewer ? "skip" : { from: "2000-01-01", to: "2100-12-31" },
  );
  const myCounts = useQuery(
    api.meetEntries.getMyEntryCounts,
    isViewer ? {} : "skip",
  );
  const tallies = useMemo(() => {
    const out = new Map<string, EntryTally>();
    for (const row of clubCounts ?? []) {
      out.set(String(row.meetId), { entered: row.entered, timed: row.timed });
    }
    // A viewer is told how many events their swimmer is down for; "how many
    // have times" is the coach's outstanding-work question, not theirs.
    for (const row of myCounts ?? []) {
      out.set(String(row.meetId), { entered: row.entered, timed: row.entered });
    }
    return out;
  }, [clubCounts, myCounts]);
  const profile = useCurrentProfile();
  const canEdit = !isViewer && profile?.role === "SUPER_USER";

  // WHICH meets lives in the URL — the pattern the profile tabs already set —
  // so a refresh, a back-navigation, or a link sent to another coach all keep
  // the view. An unknown `?show=` falls back to Upcoming rather than erroring.
  const requested = searchParams.get("show");
  const filter: Filter = FILTER_OPTIONS.some((o) => o.value === requested)
    ? (requested as Filter)
    : "upcoming";

  function setFilter(value: Filter) {
    // Merge rather than overwrite: `show` is one param among whatever else the
    // URL carries. replace, not push — a filter toggle must not bury the page
    // the coach came from.
    const next = new URLSearchParams(searchParams);
    if (value === "upcoming") next.delete("show");
    else next.set("show", value);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  // The search box stays local: it changes on every keystroke, and a router
  // navigation per character is a cost with no matching benefit — nobody shares
  // a link to a half-typed query.
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const shown = useMemo(() => {
    if (!meets) return undefined;
    const needle = search.trim().toLowerCase();
    const rows = meets.filter((m) => {
      // Name or venue: a coach looking for "Les Brown" is looking for a meet.
      if (
        needle !== "" &&
        !m.name.toLowerCase().includes(needle) &&
        !(m.venue ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }
      if (filter === "all") return true;
      const upcoming = isUpcoming(m, today);
      return filter === "upcoming" ? upcoming : !upcoming;
    });
    // Upcoming reads soonest-first; past reads most-recent-first. Both put the
    // meet nearest to today at the top, which is the one being looked for.
    return filter === "past"
      ? [...rows].sort((a, b) => b.startDate.localeCompare(a.startDate))
      : rows;
  }, [meets, filter, today, search]);

  const importOptions = useMemo(
    () =>
      (meets ?? []).map((m) => ({
        _id: m._id,
        name: m.name,
        startDate: m.startDate,
        endDate: m.endDate,
        venue: m.venue,
        course: m.course,
        eventCount: m.events.length,
      })),
    [meets],
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Meets"
        breadcrumb={trailForHref(base)}
        description={
          isViewer
            ? "Every meet this season, and what's on each programme."
            : "Every meet this season and its programme. A logged time still records its own meet name."
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
            {/* Three options fit a segmented control — a dropdown only became
                right for the target-gala toggle once it had five plus "All". */}
            <Segmented
              options={FILTER_OPTIONS.map((o) => ({ ...o }))}
              value={filter}
              onChange={setFilter}
              ariaLabel="Which meets to show"
            />
          </FilterField>
        }
        trailing={
          <FilterField label="Find">
            {/* The roster's search, verbatim: leading magnifier, text-base (14px
                triggers iOS zoom-on-focus), grows with its container. */}
            <div className="relative w-full min-w-48">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meets"
                aria-label="Search meets by name or venue"
                className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-base text-ink outline-none transition-[border-color] [transition-duration:var(--dur-1)] placeholder:text-ink-muted hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring lg:h-9"
              />
            </div>
          </FilterField>
        }
      />

      {/* Filtering and searching change the list silently. This says what came
          back, for a reader who cannot see it change. */}
      <p className="sr-only" role="status">
        {shown === undefined
          ? "Loading meets."
          : `${shown.length} meet${shown.length === 1 ? "" : "s"} shown.`}
      </p>

      {shown === undefined ? (
        <MeetsSkeleton />
      ) : shown.length === 0 ? (
        <EmptyState
          filter={filter}
          canEdit={canEdit}
          searching={search.trim() !== ""}
        />
      ) : (
        <>
          {/* Wide: one dense table. Narrow: stacked rows — a viewer meets this
              screen on a phone, and a 36rem table would push the two columns
              they came for (course, events) off the side. Same data, same
              order; only the layout differs, exactly as AttendanceAgenda does
              for the calendar. */}
          <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm lg:block">
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full min-w-[36rem] text-sm">
                <caption className="sr-only">{captionFor(filter)}</caption>
                <thead>
                  <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                    <th scope="col" className="px-4 py-2.5 font-medium">
                      Meet
                    </th>
                    <th scope="col" className="w-44 px-4 py-2.5 font-medium">
                      Dates
                    </th>
                    <th scope="col" className="w-40 px-4 py-2.5 font-medium">
                      Course
                    </th>
                    <th
                      scope="col"
                      className="w-28 px-4 py-2.5 text-right font-medium"
                    >
                      Events
                    </th>
                    <th
                      scope="col"
                      className="w-40 px-4 py-2.5 text-right font-medium"
                    >
                      {isViewer ? "Yours" : "Swimmers"}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shown.map((meet) => {
                    const past = !isUpcoming(meet, today);
                    return (
                      <tr
                        key={meet._id}
                        className="relative transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-50/40 focus-within:bg-brand-50/40"
                      >
                        <td className="px-4 py-2.5">
                          {/* The link stretches over the whole row, so the row
                              hover is a real affordance rather than a highlight
                              that does nothing when clicked. */}
                          <Link
                            href={`${base}/${meet._id}`}
                            className="font-medium text-ink outline-none after:absolute after:inset-0 after:rounded-sm hover:text-brand-600 focus-visible:after:ring-2 focus-visible:after:ring-ring"
                          >
                            {meet.name}
                          </Link>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            {past && <PastBadge />}
                            {meet.galaCode && <GalaTag code={meet.galaCode} />}
                            {meet.venue && <VenueLabel venue={meet.venue} />}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-ink">
                          {formatMeetDates(meet)}
                        </td>
                        <td className="px-4 py-2.5 text-ink-muted">
                          {meet.course ? COURSE_LABEL[meet.course] : "Not set"}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                          {meet.events.length === 0
                            ? "None yet"
                            : meet.events.length}
                        </td>
                        <td className="px-4 py-2.5 text-right text-ink-muted">
                          <EntryCount
                            tally={tallies.get(String(meet._id))}
                            upcoming={!past}
                            viewer={isViewer}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <ul
            aria-label={captionFor(filter)}
            className="flex flex-col gap-2 lg:hidden"
          >
            {shown.map((meet) => {
              const past = !isUpcoming(meet, today);
              return (
                <li
                  key={meet._id}
                  className="relative rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-theme-sm transition-colors [transition-duration:var(--dur-1)] focus-within:border-brand-300 hover:border-brand-300"
                >
                  <Link
                    href={`${base}/${meet._id}`}
                    className="font-medium text-ink outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
                  >
                    {meet.name}
                  </Link>
                  <p className="mt-0.5 text-sm tabular-nums text-ink-muted">
                    {formatMeetDates(meet)}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
                    {past && <PastBadge />}
                    {meet.galaCode && <GalaTag code={meet.galaCode} />}
                    <span>
                      {meet.events.length === 0
                        ? "No programme yet"
                        : `${meet.events.length} events`}
                    </span>
                    <span aria-hidden>·</span>
                    <span>
                      {meet.course
                        ? COURSE_LABEL[meet.course]
                        : "Course not set"}
                    </span>
                    {tallies.get(String(meet._id)) && (
                      <>
                        <span aria-hidden>·</span>
                        <EntryCount
                          tally={tallies.get(String(meet._id))}
                          upcoming={!past}
                          viewer={isViewer}
                        />
                      </>
                    )}
                  </p>
                  {meet.venue && (
                    <p className="mt-1">
                      <VenueLabel venue={meet.venue} />
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {canEdit && (
        <>
          <MeetForm
            key={addOpen ? "add-open" : "add-closed"}
            open={addOpen}
            onOpenChange={setAddOpen}
            today={today}
          />
          {/* From the list there is no meet in context, so the sheet may
              suggest one — and jumps to whatever it created or corrected. */}
          <ImportMeetSheet
            key={importOpen ? "import-open" : "import-closed"}
            open={importOpen}
            onOpenChange={setImportOpen}
            meets={importOptions}
            onImported={(meetId) => router.push(`${base}/${meetId}`)}
          />
        </>
      )}
    </div>
  );
}

/**
 * "Past" as a WORD, not a grey date. In the All view the two kinds of meet are
 * interleaved by date, and colour alone must never carry meaning (DESIGN.md §8).
 */
function PastBadge() {
  return <Badge variant="secondary">Past</Badge>;
}

function VenueLabel({ venue }: { venue: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
      <MapPin aria-hidden className="size-3" />
      {venue}
    </span>
  );
}

/** What the table is actually showing, for a screen reader. */
function captionFor(filter: Filter): string {
  switch (filter) {
    case "upcoming":
      return "Meets still to come, soonest first.";
    case "past":
      return "Meets already swum, most recent first.";
    case "all":
      return "Every meet on the calendar, earliest first. Past meets are labelled.";
  }
}

function EmptyState({
  filter,
  canEdit,
  searching,
}: {
  filter: Filter;
  canEdit: boolean;
  searching: boolean;
}) {
  // "Nothing matched what you typed" and "there is nothing here" are different
  // facts, and only one of them is the administrator's problem to fix.
  if (searching) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-theme-sm">
        <p className="text-sm font-medium text-ink">No meets match that.</p>
        <p className="mx-auto mt-1 max-w-[48ch] text-sm text-ink-muted">
          Try a shorter name, or switch to All to include past meets.
        </p>
      </div>
    );
  }
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

/** Echoes the real table, header row included, so nothing pops in on load. */
function MeetsSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <div className="h-9 border-b border-gray-200 bg-gray-50" />
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0"
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-4 w-2/5 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-1/5 animate-pulse rounded bg-gray-100" />
          </div>
          <div className="hidden h-4 w-32 animate-pulse rounded bg-gray-100 lg:block" />
          <div className="hidden h-4 w-28 animate-pulse rounded bg-gray-100 lg:block" />
          <div className="hidden h-4 w-10 animate-pulse rounded bg-gray-100 lg:block" />
        </div>
      ))}
    </div>
  );
}

/**
 * A meet's sign-up state in one phrase.
 *
 * A meet still to come has only a number to report. A meet that has been swum
 * has a more useful fact: how many of its times are still missing — which turns
 * the Past filter into a worklist rather than an archive.
 */
function EntryCount({
  tally,
  upcoming,
  viewer,
}: {
  tally: EntryTally | undefined;
  upcoming: boolean;
  viewer: boolean;
}) {
  if (tally === undefined || tally.entered === 0) {
    return <span className="text-ink-faint">&mdash;</span>;
  }
  const summary = describeTally(tally, upcoming);
  const outstanding = !upcoming && tally.timed < tally.entered;
  return (
    <span
      className={outstanding && !viewer ? "text-warning-ink" : undefined}
      title={
        viewer
          ? `${tally.entered === 1 ? "1 event" : `${tally.entered} events`} scheduled`
          : outstanding
            ? "Some times have not been recorded yet"
            : undefined
      }
    >
      <span className="tabular-nums">{summary}</span>
      {viewer && (tally.entered === 1 ? " event" : " events")}
    </span>
  );
}
