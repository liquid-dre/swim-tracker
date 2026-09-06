"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, Trophy } from "lucide-react";

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

  A meet pin is deliberately NOT shaped like a session chip: it is a filled dark
  pill with a trophy, so a competition cannot be misread as a training session —
  and the difference is VALUE, not hue, so it survives greyscale and sunlight.
  It is deliberately not brand indigo either: the accent belongs to actions,
  focus and the today-cell tint, and a meet is data. Selecting a pin opens its
  programme.

  TWO kinds of pin, because there are two kinds of date and only one of them is
  load-bearing:

    MEET      — a row in `meets`. A dark pill with a TROPHY; carries a programme.
    GALA TOUR — a `galas.tourDate`. Tier-coloured with an AWARD glyph, because
                that date IS the birthday rule every qualifying screen reads
                (§4.9); it has no programme of its own.

  The two never rely on colour alone to tell them apart: different glyph,
  different value, and the tour pin carries its gala's short code as text.

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
  /** Required: a pin that opens nothing must not render as a button at all. */
  onOpen: (pin: MeetPin) => void;
}) {
  const Glyph = pin.kind === "meet" ? Trophy : Award;
  const label =
    pin.kind === "meet"
      ? pin.meet.name
      : (pin.tour.name ?? GALA_FULL[pin.tour.code]);
  // The accessible name says WHICH kind of date this is, so the distinction
  // never rests on the glyph or the colour alone.
  const title =
    pin.kind === "meet"
      ? `${pin.meet.name} — ${formatMeetDates(pin.meet)}`
      : `${GALA_FULL[pin.tour.code]} tour date`;

  return (
    <button
      type="button"
      onClick={() => onOpen(pin)}
      title={title}
      aria-label={title}
      className={cn(
        "flex w-full items-center gap-1 rounded-md border px-1.5 py-1 text-2xs outline-none",
        "transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring sm:text-xs",
        pin.kind === "meet"
          ? "border-gray-800 bg-gray-800 text-white hover:bg-gray-700"
          : tourPinClass(pin.tour.code),
      )}
    >
      <Glyph aria-hidden className="size-3 shrink-0" strokeWidth={2.25} />
      <span className="min-w-0 flex-1 truncate text-left font-medium">{label}</span>
      {pin.kind === "tour" && (
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
    // Hover darkens the BORDER rather than filtering the fill: these tints are
    // near-white, so a brightness step on them is invisible.
    case "SANS":
      return "border-tier-sans-border bg-tier-sans-bg text-tier-sans-ink hover:border-tier-sans-ink";
    case "SANY":
      return "border-tier-sany-border bg-tier-sany-bg text-tier-sany-ink hover:border-tier-sany-ink";
    case "SANJ":
      return "border-tier-sanj-border bg-tier-sanj-bg text-tier-sanj-ink hover:border-tier-sanj-ink";
    case "LEVEL_3":
      return "border-tier-l3-border bg-tier-l3-bg text-tier-l3-ink hover:border-tier-l3-ink";
    case "LEVEL_2":
      return "border-tier-l2-border bg-tier-l2-bg text-tier-l2-ink hover:border-tier-l2-ink";
  }
}

/** The legend row that says what the two pin shapes mean. */
export function MeetLegend() {
  return (
    <>
      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
        <Trophy aria-hidden className="size-3 text-gray-800" strokeWidth={2.25} />
        Meet
      </span>
      <span className="flex items-center gap-1.5 text-xs text-ink-muted">
        {/* Neutral ink, not one gala's colour: a tour pin takes the colour of
            whichever gala it is, so a gold swatch here would match SANJ and
            mislead about the other four. */}
        <Award aria-hidden className="size-3 text-ink-muted" strokeWidth={2.25} />
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
  // Radix keeps the panel mounted through its exit animation, so rendering
  // straight from `pin` would empty the sheet — title included — as it slides
  // away. Holding the last pin keeps the content intact until it is gone, and
  // guarantees the dialog always has a Title.
  const [shown, setShown] = useState<MeetPin | null>(pin);
  if (pin !== null && pin !== shown) setShown(pin);
  const current = pin ?? shown;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl" side="right">
        {current?.kind === "meet" ? (
          <>
            <SheetHeader>
              <SheetTitle>{current.meet.name}</SheetTitle>
              <SheetDescription>
                {formatMeetDates(current.meet)}
                {current.meet.venue ? ` · ${current.meet.venue}` : ""}
                {" · "}
                {current.meet.course ? COURSE_LABEL[current.meet.course] : "Course not set"}
              </SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-1">
              {current.meet.galaCode && (
                <div>
                  <Badge
                    variant={
                      GALA_TOKEN[current.meet.galaCode] as
                        | "sans"
                        | "sany"
                        | "sanj"
                        | "l3"
                        | "l2"
                    }
                  >
                    {GALA_SHORT[current.meet.galaCode]} tour
                  </Badge>
                </div>
              )}
              <Link
                href={`${meetsHref}/${current.meet._id}`}
                className={cn(buttonClasses("secondary", "sm"), "self-start")}
              >
                Open meet
              </Link>
              <MeetProgrammeTable events={current.meet.events} headingLevel={3} />
            </div>
          </>
        ) : current?.kind === "tour" ? (
          <>
            <SheetHeader>
              <SheetTitle>{current.tour.name ?? GALA_FULL[current.tour.code]}</SheetTitle>
              <SheetDescription>{GALA_FULL[current.tour.code]} tour date</SheetDescription>
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
