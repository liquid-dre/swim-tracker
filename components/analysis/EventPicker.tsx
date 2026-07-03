"use client";

import { useMemo } from "react";

import { Segmented } from "@/components/ui/Segmented";
import {
  DISTANCE_ORDER,
  STROKE_ORDER,
  STROKE_LABEL,
  type Course,
  type Stroke,
} from "@/lib/swim";

/*
  The event selector shared by Comparison and Progression (Step 7). Distance →
  stroke → course, each narrowing the next from the whitelist so nothing off it
  (e.g. "50 IM", "100 IM" LCM) is reachable. Course is MANDATORY (BRD §4.8): both
  screens hold their read until it is set. Fully controlled — the parent owns the
  value and decides what a complete selection unlocks.
*/

export type EventValue = {
  distance: number | null;
  stroke: Stroke | null;
  course: Course | null;
};

export type EventOption = {
  distance: number;
  stroke: Stroke;
  allowedCourses: Course[];
};

/**
 * Resolve the course to hold after a distance/stroke change. When both courses
 * are open we default to LCM — qualifying standards are long-course (§4.2), so
 * LCM is the primary lens — while still keeping the SCM option in the dropdown.
 * A single allowed course is auto-picked (e.g. 100 IM ⇒ SCM only), and a prior
 * deliberate choice that's still valid is preserved so switching event doesn't
 * silently drop a chosen SCM.
 */
export function defaultCourse(allowed: Course[], prev: Course | null): Course | null {
  if (allowed.length === 1) return allowed[0];
  if (prev && allowed.includes(prev)) return prev;
  if (allowed.includes("LCM")) return "LCM";
  return allowed[0] ?? null;
}

export function EventPicker({
  events,
  value,
  onChange,
}: {
  events: EventOption[] | undefined;
  value: EventValue;
  onChange: (next: EventValue) => void;
}) {
  const distances = useMemo(() => {
    if (!events) return [];
    const present = new Set(events.map((e) => e.distance));
    return DISTANCE_ORDER.filter((d) => present.has(d));
  }, [events]);

  const strokesForDistance = useMemo(() => {
    if (!events || value.distance === null) return [];
    const present = new Set(
      events.filter((e) => e.distance === value.distance).map((e) => e.stroke),
    );
    return STROKE_ORDER.filter((s) => present.has(s));
  }, [events, value.distance]);

  const coursesForEvent = useMemo<Course[]>(() => {
    if (!events || value.distance === null || value.stroke === null) return [];
    const event = events.find(
      (e) => e.distance === value.distance && e.stroke === value.stroke,
    );
    return event?.allowedCourses ?? [];
  }, [events, value.distance, value.stroke]);

  function selectDistance(d: number) {
    if (value.stroke !== null) {
      const stillValid = events?.some(
        (e) => e.distance === d && e.stroke === value.stroke,
      );
      if (!stillValid) {
        onChange({ distance: d, stroke: null, course: null });
        return;
      }
      // Stroke survives, but its allowed courses may differ — re-derive.
      const allowed = (events?.find(
        (e) => e.distance === d && e.stroke === value.stroke,
      )?.allowedCourses ?? []) as Course[];
      onChange({
        distance: d,
        stroke: value.stroke,
        course: defaultCourse(allowed, value.course),
      });
      return;
    }
    onChange({ distance: d, stroke: null, course: null });
  }

  function selectStroke(s: Stroke) {
    const allowed = (events?.find(
      (e) => e.distance === value.distance && e.stroke === s,
    )?.allowedCourses ?? []) as Course[];
    // Default to LCM (the qualifying lens) when both are open; auto-pick when
    // there's no choice (e.g. 100 IM ⇒ SCM only).
    onChange({
      distance: value.distance,
      stroke: s,
      course: defaultCourse(allowed, value.course),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Distance">
        <ChipGroup
          ariaLabel="Distance"
          options={distances.map((d) => ({ value: String(d), label: String(d) }))}
          value={value.distance === null ? null : String(value.distance)}
          onChange={(v) => selectDistance(Number(v))}
        />
      </Field>

      {value.distance !== null && (
        <Field label="Stroke">
          <ChipGroup
            ariaLabel="Stroke"
            options={strokesForDistance.map((s) => ({
              value: s,
              label: STROKE_LABEL[s],
            }))}
            value={value.stroke}
            onChange={(v) => selectStroke(v as Stroke)}
          />
        </Field>
      )}

      {value.stroke !== null && (
        <Field label="Course" hint="Required — SCM and LCM times are never ranked together.">
          {coursesForEvent.length === 1 ? (
            <p className="text-sm text-ink-muted">
              This event runs{" "}
              <span className="font-medium text-ink">
                {coursesForEvent[0] === "SCM" ? "short course (25m)" : "long course (50m)"}
              </span>{" "}
              only.
            </p>
          ) : (
            <Segmented
              ariaLabel="Course"
              value={value.course ?? ("" as Course)}
              onChange={(c) =>
                onChange({ distance: value.distance, stroke: value.stroke, course: c })
              }
              options={coursesForEvent.map((c) => ({
                value: c,
                label: c === "SCM" ? "SCM · 25m" : "LCM · 50m",
              }))}
            />
          )}
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-ink">{label}</span>
        {hint && <span className="text-xs text-ink-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ChipGroup({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: string; label: string }[];
  value: string | null;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(opt.value)}
            className={
              "h-10 min-w-10 rounded-lg border px-4 text-sm font-medium tabular-nums outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
              (active
                ? "border-brand-500 bg-brand-50 text-brand-500"
                : "border-gray-300 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-800")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
