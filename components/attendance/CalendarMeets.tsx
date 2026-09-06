"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";

import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { buttonClasses } from "@/components/ui/Button";
import { GALA_FULL, GALA_SHORT, GALA_TOKEN, type GalaCode } from "@/lib/galas";
import { formatMeetDates, meetDates, type MeetEvent } from "@/lib/meets";
import { COURSE_LABEL, MeetProgrammeTable } from "@/components/meets/meetShared";
import type { Course } from "@/lib/swim";
import { cn } from "@/lib/utils";

/*
  Competitions on the attendance calendar (§R19).

  The app has ONE calendar, and a season is training and racing together — the
  attendance model already says as much, since `EXCUSED` is documented as
  "illness, GALA, notified ahead". These pins make the gala that caused the
  excusal visible in the same grid.

  A meet pin is deliberately NOT shaped like a session chip: it is a filled,
  trophy-marked pill that spans the cell, so a competition can never be misread
  as a training session at a glance. Selecting one opens its programme.

  TWO kinds of pin, because there are two kinds of date and only one of them is
  load-bearing:

    MEET      — a row in `meets`. Neutral chrome; carries a programme.
    GALA TOUR — a `galas.tourDate`. Tier-coloured, because that date IS the
                birthday rule every qualifying screen reads (§4.9); it has no
                programme of its own.

  A meet tagged with a gala code AND landing on that gala's tour date is ONE
  event in the world, so `mergeCalendarMeets` collapses the two into a single
  pin rather than stacking a duplicate.
*/

export type CalendarMeet = {
  _id: Id<"meets">;
  name: string;
  startDate: string;
  endDate: string | null;
  venue: string | null;
  course: Course | null;
  galaCode: GalaCode | null;
  events: MeetEvent[];
};

/** A gala's tour date, from `galas.tourDate` — a date with no programme. */
export type CalendarGalaTour = {
  code: GalaCode;
  date: string;
  name: string | null;
};

/** What a calendar cell draws: either a real meet or a bare gala tour date. */
export type MeetPin =
  | { kind: "meet"; key: string; meet: CalendarMeet }
  | { kind: "tour"; key: string; tour: CalendarGalaTour };

/**
 * Meets + gala tour dates, keyed by every ISO date they occupy.
 *
 * A gala tour date is dropped when a meet already carries that gala's tag on the
 * same day: the meet is the richer record (it has a programme), and drawing both
 * would tell a coach there are two competitions when there is one.
 */
export function mergeCalendarMeets(
  meets: ReadonlyArray<CalendarMeet>,
  tours: ReadonlyArray<CalendarGalaTour>,
): Map<string, MeetPin[]> {
  const byDate = new Map<string, MeetPin[]>();
  const push = (date: string, pin: MeetPin) => {
    const list = byDate.get(date) ?? [];
    list.push(pin);
    byDate.set(date, list);
  };

  const taggedDays = new Set<string>();
  for (const meet of meets) {
    for (const date of meetDates(meet)) {
      push(date, { kind: "meet", key: `${meet._id}-${date}`, meet });
      if (meet.galaCode) taggedDays.add(`${meet.galaCode}|${date}`);
    }
  }

  for (const tour of tours) {
    if (taggedDays.has(`${tour.code}|${tour.date}`)) continue;
    push(tour.date, { kind: "tour", key: `tour-${tour.code}`, tour });
  }
  return byDate;
}

/** One pin in a calendar cell. */
export function MeetPinChip({
  pin,
  onOpen,
}: {
  pin: MeetPin;
  onOpen: (pin: MeetPin) => void;
}) {
  const isMeet = pin.kind === "meet";
  const label = isMeet ? pin.meet.name : (pin.tour.name ?? GALA_FULL[pin.tour.code]);
  const title = isMeet
    ? `${pin.meet.name} — ${formatMeetDates(pin.meet)}`
    : `${GALA_FULL[pin.tour.code]} tour date`;

  return (
    <button
      type="button"
      onClick={() => onOpen(pin)}
      title={title}
      className={cn(
        "flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-2xs outline-none",
        "transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring sm:text-xs",
        isMeet
          ? "border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100"
          : tourPinClass(pin.tour.code),
      )}
    >
      <Trophy aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />
      <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
      {!isMeet && (
        <span className="shrink-0 font-semibold">{GALA_SHORT[pin.tour.code]}</span>
      )}
    </button>
  );
}

/**
 * The tier palette, written out per code rather than interpolated: Tailwind
 * scans class names statically, so a template-built `bg-tier-${code}-bg` would
 * simply not exist in the stylesheet.
 */
function tourPinClass(code: GalaCode): string {
  switch (code) {
    case "SANS":
      return "border-tier-sans-border bg-tier-sans-bg text-tier-sans-ink hover:brightness-95";
    case "SANY":
      return "border-tier-sany-border bg-tier-sany-bg text-tier-sany-ink hover:brightness-95";
    case "SANJ":
      return "border-tier-sanj-border bg-tier-sanj-bg text-tier-sanj-ink hover:brightness-95";
    case "LEVEL_3":
      return "border-tier-l3-border bg-tier-l3-bg text-tier-l3-ink hover:brightness-95";
    case "LEVEL_2":
      return "border-tier-l2-border bg-tier-l2-bg text-tier-l2-ink hover:brightness-95";
  }
}

/** The legend row that says what the two pin shapes mean. */
export function MeetLegend() {
  return (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Trophy aria-hidden className="size-3 text-brand-500" strokeWidth={2.25} />
        Meet
      </span>
      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Trophy aria-hidden className="size-3 text-tier-sanj-ink" strokeWidth={2.25} />
        Gala tour date
      </span>
    </>
  );
}

/**
 * The programme, opened from a calendar pin. A sheet rather than a navigation:
 * a coach checking what clashes with Tuesday's session should not lose the month
 * they were reading. The full meet page is one link away for everything else.
 */
export function MeetPinSheet({
  pin,
  onOpenChange,
  meetsHref,
}: {
  pin: MeetPin | null;
  onOpenChange: (open: boolean) => void;
  /** "/meets" for staff, "/me/meets" for a viewer. */
  meetsHref: string;
}) {
  const open = pin !== null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl" side="right">
        {pin?.kind === "meet" ? (
          <>
            <SheetHeader>
              <SheetTitle>{pin.meet.name}</SheetTitle>
              <SheetDescription>
                {formatMeetDates(pin.meet)}
                {pin.meet.venue ? ` · ${pin.meet.venue}` : ""}
                {" · "}
                {pin.meet.course ? COURSE_LABEL[pin.meet.course] : "Course not set"}
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-1">
              {pin.meet.galaCode && (
                <div>
                  <Badge
                    variant={
                      GALA_TOKEN[pin.meet.galaCode] as
                        | "sans"
                        | "sany"
                        | "sanj"
                        | "l3"
                        | "l2"
                    }
                  >
                    {GALA_SHORT[pin.meet.galaCode]} tour
                  </Badge>
                </div>
              )}
              <MeetProgrammeTable events={pin.meet.events} />
              <Link
                href={`${meetsHref}/${pin.meet._id}`}
                className={cn(buttonClasses("secondary", "sm"), "self-start")}
              >
                Open meet
              </Link>
            </div>
          </>
        ) : pin?.kind === "tour" ? (
          <>
            <SheetHeader>
              <SheetTitle>{pin.tour.name ?? GALA_FULL[pin.tour.code]}</SheetTitle>
              <SheetDescription>{GALA_FULL[pin.tour.code]} tour date</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-1">
              <p className="text-sm text-ink-muted">
                No programme is loaded for this date. From this date on, every
                qualifying screen judges swimmers against the cut for the age
                they will be on the day.
              </p>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
