"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { QualifyingBasis } from "@/components/qualifying/QualifyingBasis";
import { formatSeconds } from "@/lib/format";
import { formatTime, GALA_FULL, GALA_SHORT } from "@/lib/swim";
import type { DashboardData } from "@/components/dashboard/squadOverview";

/*
  The swimmers behind the dashboard's "Close to a cut" count, opened from the
  card as a Sheet so the coach never leaves the dashboard. Every row is computed
  server-side by lib/closeToCut — the same loop as the count — so the number on
  the card and the length of this list cannot disagree.

  One table, one group per swimmer (closest first), each close event underneath
  (closest first). A gap is to a gala the swimmer has not made in EITHER course,
  measured in the nearer course, which the Course column names. The gala is
  named in text, never by colour alone. The name opens the swimmer's PB board.
*/

const COURSE_SHORT = { LCM: "LCM", SCM: "SCM" } as const;
const COURSE_FULL = { LCM: "Long course", SCM: "Short course" } as const;

export function CloseToCutSheet({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: DashboardData;
}) {
  const swimmers = data.closeToCut;
  const eventCount = swimmers.reduce((n, s) => n + s.events.length, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col sm:max-w-xl" side="right">
        <SheetHeader className="pr-10">
          <SheetTitle>Close to a cut</SheetTitle>
          <SheetDescription>
            <span className="tabular-nums">{swimmers.length}</span>{" "}
            {swimmers.length === 1 ? "swimmer is" : "swimmers are"} within 1.0s of
            a gala they have not made yet in either course, across{" "}
            <span className="tabular-nums">{eventCount}</span>{" "}
            {eventCount === 1 ? "event" : "events"}.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-6">
          {swimmers.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nobody is within a second of their next cut right now.
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">
                Swimmers within one second of their next gala cut, closest first
              </caption>
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">Event</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Course</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    Qualifying
                  </th>
                  <th scope="col" className="py-2 text-right font-medium">Gap</th>
                </tr>
              </thead>
              {swimmers.map((s) => (
                <tbody key={s.swimmerId} className="border-b border-gray-100 last:border-0">
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={4}
                      className="pt-4 pb-1.5 text-left font-normal"
                    >
                      <Link
                        href={`/swimmers/${s.swimmerId}?tab=bests`}
                        aria-label={`${s.name}, open personal bests`}
                        className="group inline-flex min-h-11 items-center gap-1 rounded-sm font-semibold text-ink outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                      >
                        {s.name}
                        <ChevronRight
                          aria-hidden
                          className="size-3.5 text-ink-faint transition-[color,translate] [transition-duration:var(--dur-1)] group-hover:translate-x-0.5 group-hover:text-brand-500 motion-reduce:group-hover:translate-x-0"
                        />
                      </Link>
                      <span className="ml-2 text-xs text-ink-faint tabular-nums">
                        Age {s.age}
                      </span>
                    </th>
                  </tr>
                  {s.events.map((e) => (
                    <tr key={`${e.distance}|${e.stroke}`} className="text-ink-muted">
                      <td className="py-1.5 pr-3 text-ink">{e.label}</td>
                      <td className="py-1.5 pr-3">
                        <span title={COURSE_FULL[e.course]}>{COURSE_SHORT[e.course]}</span>
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <span className="time tnum text-ink">{formatTime(e.pbMs)}</span>
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap">
                        <span
                          className="font-medium tabular-nums text-warning-ink"
                          title={`${formatSeconds(e.gapMs)}s off the ${GALA_FULL[e.nextGala]} ${COURSE_FULL[e.course].toLowerCase()} cut`}
                        >
                          {formatSeconds(e.gapMs)}s to {GALA_SHORT[e.nextGala]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          )}

          {/* The basis, once, as a footnote: the list is what the coach opened. */}
          <QualifyingBasis windows={data.qualifyingWindows} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
