"use client";

import { Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { GALA_FULL, GALA_SHORT, GALA_TOKEN, type GalaCode } from "@/lib/galas";
import { MEET_GENDER_LABEL, compareMeetEvents, type MeetEvent } from "@/lib/meets";
import { STROKE_LABEL, type Course } from "@/lib/swim";

/*
  Shared presentation for the meets surfaces — the programme table and the small
  facts that sit beside a meet's name. Presentational only: no queries, no role
  logic, so the coach screen, the viewer mirror and the calendar sheet render one
  identical programme rather than three that drift.
*/

/** "Long course (50 m)" — spelled out, because SCM/LCM is not common knowledge. */
export const COURSE_LABEL: Record<Course, string> = {
  LCM: "Long course (50 m)",
  SCM: "Short course (25 m)",
};

/**
 * The gala this meet is tagged as. A LABEL, not a claim about qualifying: the
 * tag exists so the calendar can collapse a meet and that gala's tour pin into
 * one, and so a coach reading "5th Junior" knows which championship it feeds.
 * `galas.tourDate` remains the only thing the qualifying screens read (§4.9).
 *
 * Deliberately NOT a `TierBadge` — that badge means "this standard was met",
 * and a fixture on a calendar has met nothing. Same colour vocabulary, honest
 * wording: the word "tour" and the title say what the tag actually asserts.
 */
export function GalaTag({ code }: { code: GalaCode }) {
  return (
    <Badge
      variant={GALA_TOKEN[code] as "sans" | "sany" | "sanj" | "l3" | "l2"}
      title={`This meet is the ${GALA_FULL[code]} tour`}
    >
      {GALA_SHORT[code]} tour
    </Badge>
  );
}

/**
 * A meet's programme.
 *
 * Every line shows, in the meet's own running order. A line that resolved to a
 * real event shows the app's event name and its parts in their own columns; a
 * line that did not — a relay, a 25 m sprint, anything off the whitelist —
 * shows the source document's words and says plainly that this app has no event
 * for it, rather than being dropped or silently blanked.
 */
export function MeetProgrammeTable({ events }: { events: ReadonlyArray<MeetEvent> }) {
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-theme-sm">
        <Waves aria-hidden className="mx-auto size-5 text-ink-faint" />
        <p className="mt-2 text-sm font-medium text-ink">No programme yet</p>
        <p className="mt-1 text-sm text-ink-muted">
          The event list for this meet hasn&rsquo;t been loaded.
        </p>
      </div>
    );
  }

  const ordered = [...events].sort(compareMeetEvents);
  const numbered = ordered.some((e) => e.eventNumber !== undefined);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <caption className="sr-only">
            The meet programme, in event order. {ordered.length} events.
          </caption>
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-2xs uppercase tracking-wide text-ink-faint">
              {numbered && (
                <th scope="col" className="w-16 px-3 py-2 font-semibold">
                  Event
                </th>
              )}
              <th scope="col" className="px-3 py-2 font-semibold">
                Name
              </th>
              <th scope="col" className="w-24 px-3 py-2 font-semibold">
                For
              </th>
              <th scope="col" className="w-28 px-3 py-2 font-semibold">
                Distance
              </th>
              <th scope="col" className="w-24 px-3 py-2 font-semibold">
                Stroke
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ordered.map((event, i) => {
              const resolved = event.distance !== undefined && event.stroke !== undefined;
              return (
                <tr key={`${event.eventNumber ?? "x"}-${i}`} className="align-middle">
                  {numbered && (
                    <td className="px-3 py-2 tabular-nums text-ink-muted">
                      {event.eventNumber ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 font-medium text-ink">{event.rawLabel}</td>
                  <td className="px-3 py-2 text-ink-muted">
                    {event.gender ? MEET_GENDER_LABEL[event.gender] : "—"}
                  </td>
                  {resolved ? (
                    <>
                      <td className="px-3 py-2 tabular-nums text-ink">
                        {event.distance} m
                      </td>
                      <td className="px-3 py-2 text-ink">
                        {STROKE_LABEL[event.stroke!]}
                      </td>
                    </>
                  ) : (
                    <td colSpan={2} className="px-3 py-2 text-ink-faint">
                      Not a tracked event
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
