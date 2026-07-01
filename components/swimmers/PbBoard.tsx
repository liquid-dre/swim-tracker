"use client";

import type { Course, EventPB } from "@/lib/swim";
import { formatTime } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";

/*
  PB board (Step 6, BRD §5.4): the events × course grid. One row per distinct
  (distance, stroke) the swimmer has swum, with a headline-PB cell per course.
  The headline PB is the fastest MEET time only; cells with no meet time say so
  plainly rather than showing a misleading practice/trial number as the PB.

  Presentational: it pivots the flat `pbs` list (one row per distance·stroke·
  course) into the grid, but does no data fetching.
*/

const COURSES: Course[] = ["LCM", "SCM"];
const TYPE_WORD: Record<string, string> = {
  MEET: "meet",
  TIME_TRIAL: "trial",
  PRACTICE: "practice",
};

type Cell = EventPB | undefined;
type BoardRow = { distance: number; stroke: string; label: string; cells: Record<Course, Cell> };

function pivot(pbs: EventPB[]): BoardRow[] {
  const rows = new Map<string, BoardRow>();
  for (const pb of pbs) {
    const key = `${pb.distance}|${pb.stroke}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        distance: pb.distance,
        stroke: pb.stroke,
        label: pb.label,
        cells: { LCM: undefined, SCM: undefined },
      };
      rows.set(key, row);
    }
    row.cells[pb.course] = pb;
  }
  // `pbs` already arrives event-sorted, so first-seen insertion order is correct.
  return [...rows.values()];
}

export function PbBoard({ pbs }: { pbs: EventPB[] }) {
  if (pbs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-theme-sm">
        <p className="text-sm font-medium text-ink">No times logged yet</p>
        <p className="mx-auto mt-1 max-w-[44ch] text-sm text-ink-muted">
          Log a meet result and this swimmer&apos;s personal bests will appear here,
          one per event and course.
        </p>
      </div>
    );
  }

  const rows = pivot(pbs);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-base">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">Event</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                Long course
                <span className="ml-1 font-normal normal-case text-ink-faint">LCM</span>
              </th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-6">
                Short course
                <span className="ml-1 font-normal normal-case text-ink-faint">SCM</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.distance}-${row.stroke}`} className="border-t border-border align-top">
                <th
                  scope="row"
                  className="whitespace-nowrap px-4 py-3 text-left align-middle text-base font-medium text-ink sm:px-6"
                >
                  {row.label}
                </th>
                {COURSES.map((course) => (
                  <td
                    key={course}
                    className={
                      "px-4 py-3 text-right" + (course === "SCM" ? " sm:px-6" : "")
                    }
                  >
                    <PbCell pb={row.cells[course]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PbCell({ pb }: { pb: Cell }) {
  // No swim at all for this event+course.
  if (!pb) {
    return <span className="text-sm text-ink-faint">—</span>;
  }

  // Swum, but never in a meet — no headline PB by definition (BRD §4.6).
  if (!pb.headline) {
    return (
      <div className="flex flex-col items-end gap-0.5">
        <span className="text-sm text-ink-muted">No meet time yet</span>
        <span className="text-xs text-ink-faint">
          {TYPE_WORD[pb.overallBest.swimType] ?? "best"}{" "}
          <span className="time tnum text-ink-muted">{formatTime(pb.overallBest.timeMs)}</span>
        </span>
      </div>
    );
  }

  const fasterElsewhere = pb.overallBest.timeMs < pb.headline.timeMs;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="time tnum text-base font-semibold text-ink">
        {formatTime(pb.headline.timeMs)}
      </span>
      <span className="text-xs text-ink-muted">
        {formatShortDate(pb.headline.swimDate)}
        {pb.headline.meetName ? ` · ${pb.headline.meetName}` : ""}
      </span>
      {fasterElsewhere && (
        <span className="text-xs text-ink-faint">
          faster in {TYPE_WORD[pb.overallBest.swimType] ?? "training"}:{" "}
          <span className="time tnum">{formatTime(pb.overallBest.timeMs)}</span>
        </span>
      )}
    </div>
  );
}
