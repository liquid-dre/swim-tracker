"use client";

import { Waves } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { GALA_FULL, GALA_SHORT, GALA_TOKEN, type GalaCode } from "@/lib/galas";
import {
  MEET_GENDER_LABEL,
  groupEventsByDay,
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
 *
 * A MULTI-DAY meet is banded by day ("Day 2 · Sun 29 Nov"), because sixty lines
 * in one list does not answer the question actually asked of a three-day gala,
 * which is "what is being swum on the Saturday". The bands appear only once
 * someone has placed a line on a day: a programme nobody has dayed reads
 * exactly as it always did, as one list.
 *
 * ONE CARD, banded inside — not one card per day (DESIGN.md §5), which also
 * keeps the table to a single horizontal scroll container.
 */
export function MeetProgrammeTable({
  events,
  meet,
  headingLevel = 2,
  signups,
  upcoming = false,
  onOpenLine,
}: {
  events: ReadonlyArray<MeetEvent>;
  /**
   * The meet's dates, for the day bands. Absent = draw one flat list, which is
   * what a surface with no dates to hand should do rather than inventing a day
   * it cannot name.
   */
  meet?: { startDate: string; endDate?: string | null };
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

  const numbered = events.some((e) => e.eventNumber !== undefined);
  // Only claim the meet's own running order when the meet actually numbered its
  // events; otherwise this is canonical event order and the caption says so.
  const order = numbered ? "in event order" : "ordered by distance and stroke";
  const groups = groupEventsByDay(
    events,
    meet ?? { startDate: "", endDate: null },
  );
  const banded = groups.length > 1 || groups[0].label !== "";
  const columns = 4 + (numbered ? 1 : 0) + (entering ? 1 : 0);
  const caption = `The meet programme, ${order}. ${events.length} events${
    banded ? `, banded by day` : ""
  }.`;

  return (
    <section className="flex flex-col gap-2">
      <Heading className="text-sm font-semibold text-ink">
        Programme{" "}
        <span className="font-normal tabular-nums text-ink-muted">
          ({events.length})
        </span>
      </Heading>
      {banded && groups.some((g) => g.day === null) && (
        <p className="text-xs text-ink-muted">
          The programme doesn&rsquo;t say which day the last group is swum on.
        </p>
      )}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        <div className="custom-scrollbar hidden overflow-x-auto sm:block">
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
            {/* One tbody per day, so the band is a row of the same table the
                column headers belong to rather than a heading floating above a
                second table. `scope="rowgroup"` — the band heads a ROW GROUP,
                not a column, and that is what lets a screen reader answer
                "which day is this event on" without leaving the table. */}
            {groups.map((group) => (
              <tbody
                key={group.day ?? "unplaced"}
                className="divide-y divide-gray-100 border-t border-gray-100"
              >
                {group.label !== "" && (
                  <tr>
                    <th
                      scope="rowgroup"
                      colSpan={columns}
                      className="bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink"
                    >
                      {group.label}
                      <span className="ml-2 font-normal normal-case tracking-normal text-ink-muted">
                        <DayCount n={group.events.length} />
                      </span>
                    </th>
                  </tr>
                )}
                {group.events.map((event, i) => (
                    <ProgrammeRow
                      key={event.id ?? `${event.eventNumber ?? "x"}-${i}`}
                      event={event}
                      numbered={numbered}
                      entering={entering}
                      signups={signups}
                      upcoming={upcoming}
                      onOpenLine={onOpenLine}
                    />
                ))}
              </tbody>
            ))}
          </table>
        </div>

        {/* Narrow: one line per event. A parent checking "what is my swimmer in"
            reads this on a phone, where a five-column table would hide the
            stroke off the right-hand edge.

            The band is deliberately NOT sticky. A twenty-four-row day is two
            flicks tall and keeping the day on screen would be worth having, but
            the card clips its corners with `overflow-hidden`, which makes it
            the sticky element's scroll container — and a container that never
            scrolls never triggers `sticky`. Dropping the clip to get it would
            cost every rounded corner on the card. A band that silently does
            nothing is worse than one that plainly scrolls away. */}
        <div className="sm:hidden">
          {groups.map((group) => (
            <div key={group.day ?? "unplaced"}>
              {group.label !== "" && (
                <p className="border-y border-gray-100 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-ink">
                  {group.label}
                  <span className="ml-2 font-normal normal-case tracking-normal text-ink-muted">
                    <DayCount n={group.events.length} />
                  </span>
                </p>
              )}
              {group.events.length > 0 && (
                <ul
                  aria-label={group.label === "" ? caption : group.label}
                  className="divide-y divide-gray-100"
                >
                  {group.events.map((event, i) => (
                    <li
                      key={event.id ?? `${event.eventNumber ?? "x"}-${i}`}
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
                          {event.distance !== undefined &&
                          event.stroke !== undefined
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
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The one per-day count format. "Nothing" reads better than "0 events". */
function DayCount({ n }: { n: number }) {
  if (n === 0) return <>nothing listed</>;
  return (
    <>
      <span className="tabular-nums">{n}</span> {n === 1 ? "event" : "events"}
    </>
  );
}

/** One programme line as a table row. */
function ProgrammeRow({
  event,
  numbered,
  entering,
  signups,
  upcoming,
  onOpenLine,
}: {
  event: MeetEvent;
  numbered: boolean;
  entering: boolean;
  signups?: ReadonlyMap<string, EntryTally>;
  upcoming: boolean;
  onOpenLine?: (lineId: string) => void;
}) {
  const resolved =
    event.distance !== undefined && event.stroke !== undefined;
  return (
    <tr className="align-middle">
      {numbered && (
        <td className="px-3 py-2 tabular-nums text-ink-muted">
          {event.eventNumber ?? "—"}
        </td>
      )}
      <td className="px-3 py-2 font-medium text-ink">{event.rawLabel}</td>
      <td className="px-3 py-2 text-ink-muted">
        {event.gender ? MEET_GENDER_LABEL[event.gender] : "All entrants"}
      </td>
      {resolved ? (
        <>
          <td className="px-3 py-2 tabular-nums text-ink">
            {event.distance} m
          </td>
          <td className="px-3 py-2 text-ink">{STROKE_LABEL[event.stroke!]}</td>
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
      // ≥44px on touch (PRODUCT.md): this is the only way into a sign-up
      // sheet, and the table it sits in renders from `sm` up, which includes
      // every tablet a coach works from poolside.
      className="tap inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-brand-600 transition-colors [transition-duration:var(--dur-1)] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      {summary === "" ? (
        <span className="text-ink-muted">Add swimmers</span>
      ) : (
        <span className="tabular-nums">{summary}</span>
      )}
      {/* The line the meet page's banner is counting. Marked here so the total
          is scannable down the programme rather than being a number the coach
          has to go hunting for one sheet at a time. Never colour alone — the
          count carries the fact in words. */}
      {(tally?.dayMismatched ?? 0) > 0 && (
        <span className="text-xs font-medium text-warning-ink">
          <span className="tabular-nums">{tally!.dayMismatched}</span> on
          another day
        </span>
      )}
      <span className="sr-only">for {meetEventLabel(event)}</span>
    </button>
  );
}
