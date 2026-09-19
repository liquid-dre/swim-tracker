"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { formatMeetDayDate, meetDayCount } from "@/lib/meets";
import { formatTime } from "@/lib/swim";
import { SwimOutcome } from "./SwimOutcome";

/*
  What a swimmer's family came to the page for.

  A real programme runs to sixty lines and four of them concern this household,
  so their events lead the page rather than being marked somewhere down the
  full list. Before the meet that answers "am I in this, and what am I
  swimming"; after it, "what did I go, and was it any better".

  Renders nothing at all when nobody linked to this account is entered — an
  empty "Your events" heading would be a worse answer than no heading.
*/

export function ViewerMeetEntries({
  meetId,
  meet,
  upcoming,
}: {
  meetId: Id<"meets">;
  /** The meet's dates: a one-day meet has no day worth naming on every row. */
  meet: { startDate: string; endDate?: string | null };
  /** Before the meet there are no times to show, only what is scheduled. */
  upcoming: boolean;
}) {
  const swimmers = useQuery(api.meetEntries.getMyMeetEntries, { meetId });

  if (swimmers === undefined || swimmers.length === 0) return null;

  // "Which day do we need to be there" is the whole question a multi-day gala
  // raises for a family, and it is a fact about each entry rather than about
  // the meet — four events can fall across three mornings.
  const multiDay = meetDayCount(meet) > 1;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-ink">
        {upcoming ? "Your events" : "How it went"}
      </h2>

      <div className="flex flex-col gap-3">
        {swimmers.map((swimmer) => (
          <div
            key={swimmer.swimmerId}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
          >
            {/* The name is a heading only when there is more than one swimmer
                to tell apart; one linked swimmer needs no label. */}
            {swimmers.length > 1 && (
              <h3 className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-sm font-medium text-ink">
                {swimmer.name}
              </h3>
            )}
            <ul className="divide-y divide-gray-100">
              {swimmer.entries.map((entry) => (
                <li
                  key={entry._id}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
                >
                  {entry.eventNumber !== null && (
                    <span className="w-8 shrink-0 tabular-nums text-xs text-ink-faint">
                      {entry.eventNumber}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                    {entry.label}
                    {multiDay && (
                      <span className="ml-2 whitespace-nowrap text-xs font-normal text-ink-muted">
                        {formatMeetDayDate(entry.swimDate)}
                      </span>
                    )}
                  </span>

                  {entry.timeMs === null ? (
                    <span className="text-sm text-ink-muted">Scheduled</span>
                  ) : (
                    <span className="text-sm font-medium tabular-nums text-ink">
                      {formatTime(entry.timeMs)}
                    </span>
                  )}

                  <p className="w-full text-xs text-ink-muted">
                    <SwimOutcome row={entry} />
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
