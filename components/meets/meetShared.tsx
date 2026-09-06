"use client";

import { Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { GALA_FULL, GALA_SHORT, GALA_TOKEN, type GalaCode } from "@/lib/galas";
import {
  MEET_GENDER_LABEL,
  compareMeetEvents,
  meetEventLabel,
  type MeetEvent,
} from "@/lib/meets";
import { describeTally, type EntryTally } from "@/lib/meetEntries";
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
export function MeetProgrammeTable({
  events,
  headingLevel = 2,
  signups,
  upcoming = false,
  onOpenLine,
}: {
  events: ReadonlyArray<MeetEvent>;
  /** 2 under a page h1; 3 inside a sheet whose own title is already an h2. */
  headingLevel?: 2 | 3;
  /** This club's sign-ups per line id. Absent = don't show the column at all. */
  signups?: ReadonlyMap<string, EntryTally>;
  /** Before the meet, a count is all there is to say; after it, what is missing. */
  upcoming?: boolean;
  /** Present = each row opens its sign-up sheet. Absent = a read-only table. */
  onOpenLine?: (lineId: string) => void;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  // The column exists only where sign-ups do. The viewer mirror and the
  // calendar's programme sheet pass neither prop and render exactly as before.
  const entering = onOpenLine !== undefined;
  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-theme-sm">
        <Waves aria-hidden className="mx-auto size-5 text-ink-faint" />
        <p className="mt-2 text-sm font-medium text-ink">No programme yet</p>
        <p className="mt-1 text-sm text-ink-muted">
          No programme has been loaded for this meet yet.
        </p>
      </div>
    );
  }

  const ordered = [...events].sort(compareMeetEvents);
  const numbered = ordered.some((e) => e.eventNumber !== undefined);
  // Only claim the meet's own running order when the meet actually numbered its
  // events; otherwise this is canonical event order and the caption says so.
  const caption = numbered
    ? `The meet programme in event order. ${ordered.length} events.`
    : `The meet programme, ordered by distance and stroke. ${ordered.length} events.`;

  return (
    <section className="flex flex-col gap-2">
      <Heading className="text-sm font-semibold text-ink">
        Programme{" "}
        <span className="font-normal tabular-nums text-ink-muted">
          ({ordered.length})
        </span>
      </Heading>
      <div className="hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm sm:block">
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                {numbered && (
                  <th scope="col" className="w-16 px-3 py-2.5 font-medium">
                    Event
                  </th>
                )}
                <th scope="col" className="px-3 py-2.5 font-medium">
                  Name
                </th>
                <th scope="col" className="w-24 px-3 py-2.5 font-medium">
                  For
                </th>
                <th scope="col" className="w-28 px-3 py-2.5 font-medium">
                  Distance
                </th>
                <th scope="col" className="w-24 px-3 py-2.5 font-medium">
                  Stroke
                </th>
                {entering && (
                  <th
                    scope="col"
                    className="w-40 px-3 py-2.5 text-right font-medium"
                  >
                    Swimmers
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordered.map((event, i) => {
                const resolved =
                  event.distance !== undefined && event.stroke !== undefined;
                return (
                  <tr
                    key={`${event.eventNumber ?? "x"}-${i}`}
                    className="align-middle"
                  >
                    {numbered && (
                      <td className="px-3 py-2 tabular-nums text-ink-muted">
                        {event.eventNumber ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-ink">
                      {event.rawLabel}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {event.gender
                        ? MEET_GENDER_LABEL[event.gender]
                        : "All entrants"}
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
                      <td colSpan={2} className="px-3 py-2 text-ink-muted">
                        Not a tracked event
                      </td>
                    )}
                    {entering && (
                      <td className="px-3 py-2 text-right">
                        <SignupCell
                          event={event}
                          tally={event.id ? signups?.get(event.id) : undefined}
                          upcoming={upcoming}
                          onOpen={onOpenLine}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Narrow: one line per event. A parent checking "what is my swimmer in"
          reads this on a phone, where a five-column table would hide the stroke
          off the right-hand edge. */}
      <ul
        aria-label={caption}
        className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm sm:hidden"
      >
        {ordered.map((event, i) => (
          <li
            key={`${event.eventNumber ?? "x"}-${i}`}
            className="flex items-baseline gap-3 px-4 py-2.5"
          >
            {numbered && (
              <span className="w-8 shrink-0 tabular-nums text-xs text-ink-faint">
                {event.eventNumber ?? "—"}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">
                {event.rawLabel}
              </span>
              <span className="mt-0.5 block text-xs text-ink-muted">
                {event.gender
                  ? MEET_GENDER_LABEL[event.gender]
                  : "All entrants"}
                {" · "}
                {event.distance !== undefined && event.stroke !== undefined
                  ? `${event.distance} m ${STROKE_LABEL[event.stroke]}`
                  : "Not a tracked event"}
              </span>
            </span>
            {entering && (
              <SignupCell
                event={event}
                tally={event.id ? signups?.get(event.id) : undefined}
                upcoming={upcoming}
                onOpen={onOpenLine}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The sign-up state of one programme line, and the way into it.
 *
 * Reads as a count before the meet and as what is still outstanding after it,
 * so a coach scanning a past meet can see at a glance which events they still
 * owe times for without opening each one.
 *
 * A relay or a 25 m sprint is not something a swimmer can be entered for here,
 * and a line saved before programme lines had identities cannot be pointed at
 * — both say so rather than offering a control that would not work.
 */
function SignupCell({
  event,
  tally,
  upcoming,
  onOpen,
}: {
  event: MeetEvent;
  tally: EntryTally | undefined;
  upcoming: boolean;
  onOpen?: (lineId: string) => void;
}) {
  const resolved = event.distance !== undefined && event.stroke !== undefined;
  if (!resolved) {
    return <span className="text-xs text-ink-faint">No entries</span>;
  }
  if (event.id === undefined || onOpen === undefined) {
    return (
      <span
        className="text-xs text-ink-faint"
        title="This programme predates sign-ups. Save the meet once to enable them."
      >
        Not available
      </span>
    );
  }

  const summary = tally ? describeTally(tally, upcoming) : "";
  return (
    <button
      type="button"
      onClick={() => onOpen(event.id!)}
      className="inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-primary transition-colors [transition-duration:var(--dur-1)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      {summary === "" ? (
        <span className="text-ink-muted">Add swimmers</span>
      ) : (
        <span className="tabular-nums">{summary}</span>
      )}
      <span className="sr-only">for {meetEventLabel(event)}</span>
    </button>
  );
}
