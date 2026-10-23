"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarDays, ChevronDown, Clock, MapPin } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Segmented } from "@/components/ui/Segmented";
import { Skeleton } from "@/components/ui/skeleton";
import { SwimOutcome } from "@/components/meets/SwimOutcome";
import { formatMeetDates } from "@/lib/meets";
import { formatTime } from "@/lib/swim";

/*
  A swimmer's meets — the two questions a coach asks about one swimmer that no
  other tab on this profile answers.

  UPCOMING is deliberately ONE meet. "What is Andile down for next" has a single
  answer, and listing four future fixtures would bury it. The date is the point
  as much as the events are, so it leads.

  PAST expands in place rather than navigating. A coach checking what somebody
  went at the last gala should not lose the profile they were reading to find
  out — the same reasoning the attendance calendar's meet pins follow.

  Both lists come from one subscription (`getSwimmerMeets`), which merges
  sign-ups with times logged straight against a meet, so a club that never uses
  the sign-up sheet still has a history here.
*/

type Mode = "upcoming" | "past";

export function SwimmerMeetsTab({
  swimmerId,
  swimmerName,
}: {
  swimmerId: Id<"swimmers">;
  swimmerName: string;
}) {
  const data = useQuery(api.meetEntries.getSwimmerMeets, { swimmerId });
  const [mode, setMode] = useState<Mode>("upcoming");

  const firstName = swimmerName.split(" ")[0];

  return (
    <div className="flex flex-col gap-4">
      <Segmented<Mode>
        ariaLabel="Which meets"
        value={mode}
        onChange={setMode}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "past", label: "Past" },
        ]}
      />

      {data === undefined ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : mode === "upcoming" ? (
        data.upcoming === null ? (
          <Empty>
            {firstName} isn&rsquo;t entered for anything yet. Sign them up from
            a meet&rsquo;s programme.
          </Empty>
        ) : (
          <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm">
            <header className="flex flex-col gap-2">
              <h3 className="text-base font-semibold text-ink">
                {data.upcoming.name}
              </h3>
              <MeetFacts meet={data.upcoming} />
            </header>
            <EventList
              events={data.upcoming.events}
              emptyLabel={`${firstName} is on this meet's sheet but not down for any event yet.`}
            />
          </section>
        )
      ) : data.past.length === 0 ? (
        <Empty>
          No past meets for {firstName} yet. A meet appears here once they have
          been entered for it or a time has been logged against it.
        </Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {data.past.map((meet) => (
            <PastMeetRow key={meet.meetId} meet={meet} />
          ))}
          {data.pastTruncated && (
            <p className="px-1 text-xs text-ink-faint">
              Showing the most recent {data.past.length} meets.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The shape `getSwimmerMeets` returns for one meet. */
type MeetBlock = NonNullable<
  ReturnType<typeof useQuery<typeof api.meetEntries.getSwimmerMeets>>
>["past"][number];

/** Dates, start time and venue — the "where and when", never invented. */
function MeetFacts({ meet }: { meet: MeetBlock }) {
  return (
    <dl className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-ink-muted">
      <Fact icon={CalendarDays} label="Dates">
        <span className="tabular-nums">{formatMeetDates(meet)}</span>
      </Fact>
      {meet.startTime && (
        <Fact icon={Clock} label="Starts at">
          <span className="tabular-nums">{meet.startTime}</span>
        </Fact>
      )}
      {meet.venue && (
        <Fact icon={MapPin} label="Venue">
          {meet.venue}
        </Fact>
      )}
    </dl>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon aria-hidden className="size-4 shrink-0 text-ink-faint" />
      <dt className="sr-only">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One meet's events for this swimmer.
 *
 * A row without a time is a PLAN, and says so rather than showing a dash that
 * reads as a missing value — before the meet that is the normal state.
 */
function EventList({
  events,
  emptyLabel,
}: {
  events: MeetBlock["events"];
  emptyLabel: string;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-ink-muted">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
      {events.map((event, i) => (
        <li
          key={event.lineId ?? `${event.label}-${event.swimDate}-${i}`}
          className="flex flex-col gap-1 px-3 py-2.5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 text-sm font-medium text-ink">
              {event.eventNumber !== null && (
                <span className="mr-2 tabular-nums text-ink-faint">
                  {event.eventNumber}
                </span>
              )}
              {event.label}
            </p>
            <p className="time tnum shrink-0 text-sm text-ink">
              {event.timeMs === null ? (
                <span className="text-sm text-ink-faint">Not swum yet</span>
              ) : (
                formatTime(event.timeMs)
              )}
            </p>
          </div>
          <p className="text-xs text-ink-muted">
            <SwimOutcome row={event} />
          </p>
        </li>
      ))}
    </ul>
  );
}

/** A past meet: name and date always, its events on demand. */
function PastMeetRow({ meet }: { meet: MeetBlock }) {
  const [open, setOpen] = useState(false);
  const swum = meet.events.filter((e) => e.timeMs !== null).length;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-xl border border-gray-200 bg-white shadow-theme-xs"
    >
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {meet.name}
          </span>
          <span className="block text-xs tabular-nums text-ink-muted">
            {formatMeetDates(meet)}
          </span>
        </span>
        <span className="shrink-0 text-xs tabular-nums text-ink-faint">
          {swum === meet.events.length
            ? `${meet.events.length} ${meet.events.length === 1 ? "swim" : "swims"}`
            : `${swum} of ${meet.events.length} timed`}
        </span>
        <ChevronDown
          aria-hidden
          className={`size-4 shrink-0 text-ink-faint transition-transform [transition-duration:var(--dur-1)] ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4">
        <EventList
          events={meet.events}
          emptyLabel="No events recorded for this meet."
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-10 text-center">
      <p className="mx-auto max-w-[44ch] text-sm text-ink-muted">{children}</p>
    </div>
  );
}
