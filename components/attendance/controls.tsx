"use client";

import { useId } from "react";

import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import { formatHHMM, parseHHMM } from "@/convex/attendanceLib";
import { WEEKDAY_SHORT } from "./attendance-format";

// Small shared form controls for the session/pattern forms (§R18). Kept on the
// DESIGN.md tokens: 44px touch targets, brand focus ring, gray-200 hairlines.

export function TimeInput({
  label,
  value,
  onChange,
  id,
}: {
  label: string;
  value: number | null; // minutes-from-midnight
  onChange: (min: number | null) => void;
  id?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={inputId}
        type="time"
        value={value === null ? "" : formatHHMM(value)}
        onChange={(e) => {
          const parsed = e.target.value === "" ? null : parseHHMM(e.target.value);
          onChange(parsed);
        }}
        className="h-11 lg:h-9 rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-800 outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
      />
    </div>
  );
}

export function WeekdayCheckboxes({
  value,
  onChange,
}: {
  value: number[];
  onChange: (weekdays: number[]) => void;
}) {
  const set = new Set(value);
  // Present Mon-first (SA convention) but store 0=Sun..6=Sat.
  const order = [1, 2, 3, 4, 5, 6, 0];
  function toggle(d: number) {
    const next = new Set(set);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    onChange([...next].sort((a, b) => a - b));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">Days</span>
      <div className="flex flex-wrap gap-1">
        {order.map((d) => {
          const active = set.has(d);
          return (
            <button
              key={d}
              type="button"
              role="checkbox"
              aria-checked={active}
              onClick={() => toggle(d)}
              className={cn(
                "h-11 w-11 lg:h-9 lg:w-11 rounded-lg border text-sm font-medium outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-brand-500 bg-brand-50 text-brand-600"
                  : "border-gray-300 bg-white text-ink-muted hover:border-gray-400",
              )}
            >
              {WEEKDAY_SHORT[d]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SquadCheckboxes({
  squads,
  value,
  onChange,
}: {
  squads: Array<{ _id: Id<"squads">; name: string; memberCount?: number }>;
  value: Id<"squads">[];
  onChange: (ids: Id<"squads">[]) => void;
}) {
  const set = new Set(value.map(String));
  function toggle(id: Id<"squads">) {
    const next = new Set(value.map(String));
    if (next.has(String(id))) next.delete(String(id));
    else next.add(String(id));
    onChange(squads.filter((s) => next.has(String(s._id))).map((s) => s._id));
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">Squads</span>
      {squads.length === 0 ? (
        <p className="text-sm text-ink-muted">No squads yet — create one first.</p>
      ) : (
        <div className="flex flex-col gap-1 rounded-lg border border-gray-200 p-1">
          {squads.map((s) => {
            const active = set.has(String(s._id));
            return (
              <button
                key={s._id}
                type="button"
                role="checkbox"
                aria-checked={active}
                onClick={() => toggle(s._id)}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-brand-50 text-brand-700" : "hover:bg-gray-50 text-gray-700",
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid size-4 place-content-center rounded border",
                      active ? "border-brand-500 bg-brand-500 text-white" : "border-gray-300",
                    )}
                  >
                    {active && (
                      <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
                        <path
                          d="M2.5 6.5L5 9l4.5-5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  {s.name}
                </span>
                {s.memberCount !== undefined && (
                  <span className="tabular-nums text-2xs text-ink-faint">{s.memberCount}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
