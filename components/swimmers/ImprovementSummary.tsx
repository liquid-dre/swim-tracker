"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import type { EventPB } from "@/lib/swim";
import { formatTime } from "@/lib/swim";
import { formatSeconds, formatShortDate } from "@/lib/format";

/*
  Improvement summary (Step 6, BRD §5.4): per event with a headline PB, the
  earliest logged swim (any type) → the current PB, as absolute seconds and a
  percentage. A faster-now delta reads as an improvement (green, ▼); a slower
  current PB than an old fast practice reads honestly as a regression. Only
  events that have a meet PB appear — improvement is defined against the PB.
*/

const TYPE_WORD: Record<string, string> = {
  MEET: "meet",
  TIME_TRIAL: "trial",
  PRACTICE: "practice",
};

export function ImprovementSummary({ pbs }: { pbs: EventPB[] }) {
  const rows = pbs.filter((p) => p.improvement !== null);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center shadow-theme-sm">
        <p className="text-sm text-ink-muted">
          Improvement appears once an event has a meet time to measure against.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
      <div className="relative overflow-x-auto custom-scrollbar">
        <table className="w-full text-base">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
              <th scope="col" className="px-4 py-2.5 font-medium sm:px-6">Event</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Course</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">First</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">Current PB</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-6">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const imp = p.improvement!;
              return (
                <tr key={`${p.distance}-${p.stroke}-${p.course}`} className="border-t border-border">
                  <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-medium text-ink sm:px-6">
                    {p.label}
                  </th>
                  <td className="px-4 py-3 text-ink-muted">{p.course}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="time tnum text-ink">{formatTime(imp.fromMs)}</span>
                      <span className="text-xs text-ink-faint">
                        {formatShortDate(imp.fromDate)} · {TYPE_WORD[imp.fromSwimType] ?? "swim"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="time tnum font-medium text-ink">{formatTime(imp.toMs)}</span>
                  </td>
                  <td className="px-4 py-3 text-right sm:px-6">
                    <ChangeBadge absMs={imp.absMs} pct={imp.pct} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ChangeBadge({ absMs, pct }: { absMs: number; pct: number }) {
  // Positive absMs = time dropped = faster now = an improvement. Direction is
  // carried by the arrow + label, never colour alone — green stays reserved for
  // qualifying/status signals, so an improved time reads as "present" (ink) and
  // a regression recedes (muted). Calm by design (PRODUCT.md: unshowy).
  if (absMs === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-muted">
        <Minus aria-hidden className="size-3.5 text-ink-faint" /> No change
      </span>
    );
  }

  const improved = absMs > 0;
  const magnitude = Math.abs(absMs);
  const Icon = improved ? ArrowDown : ArrowUp;

  return (
    <span
      className={
        "inline-flex items-center justify-end gap-1.5 text-sm " +
        (improved ? "font-medium text-ink" : "text-ink-muted")
      }
    >
      <Icon aria-hidden className="size-3.5 text-ink-faint" strokeWidth={2.25} />
      <span className="time tnum">
        {improved ? "−" : "+"}
        {formatSeconds(magnitude)}s
      </span>
      <span className="tnum text-xs font-normal text-ink-faint">
        {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="sr-only">{improved ? "faster" : "slower"}</span>
    </span>
  );
}
