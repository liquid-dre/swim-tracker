"use client";

import { useMemo } from "react";

import { Select } from "@/components/ui/Select";
import {
  DISTANCE_ORDER,
  STROKE_LABEL,
  STROKE_ORDER,
  type Course,
  type Stroke,
} from "@/lib/swim";
import type { EventOption, EventValue } from "./EventPicker";

/*
  Compact inline event picker for the analysis toolbars (Step R2). Same
  whitelist-narrowing rules as the full EventPicker (distance → stroke → course,
  course required, nothing off the whitelist reachable), rendered as three slim
  selects that sit in one toolbar row instead of a tall stacked card.
*/

export function EventFilter({
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

  const strokes = useMemo(() => {
    if (!events || value.distance === null) return [];
    const present = new Set(
      events.filter((e) => e.distance === value.distance).map((e) => e.stroke),
    );
    return STROKE_ORDER.filter((s) => present.has(s));
  }, [events, value.distance]);

  const courses = useMemo<Course[]>(() => {
    if (!events || value.distance === null || value.stroke === null) return [];
    const ev = events.find(
      (e) => e.distance === value.distance && e.stroke === value.stroke,
    );
    return (ev?.allowedCourses ?? []) as Course[];
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
      const allowed = (events?.find(
        (e) => e.distance === d && e.stroke === value.stroke,
      )?.allowedCourses ?? []) as Course[];
      onChange({
        distance: d,
        stroke: value.stroke,
        course:
          allowed.length === 1
            ? allowed[0]
            : value.course && allowed.includes(value.course)
              ? value.course
              : null,
      });
      return;
    }
    onChange({ distance: d, stroke: null, course: null });
  }

  function selectStroke(s: Stroke) {
    const allowed = (events?.find(
      (e) => e.distance === value.distance && e.stroke === s,
    )?.allowedCourses ?? []) as Course[];
    // Auto-pick when there's no choice (e.g. 100 IM ⇒ SCM only).
    const course =
      allowed.length === 1
        ? allowed[0]
        : value.course && allowed.includes(value.course)
          ? value.course
          : null;
    onChange({ distance: value.distance, stroke: s, course });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Distance"
        value={value.distance === null ? "" : String(value.distance)}
        onChange={(e) => selectDistance(Number(e.target.value))}
        disabled={!events}
      >
        <option value="" disabled>
          Distance
        </option>
        {distances.map((d) => (
          <option key={d} value={d}>
            {d} m
          </option>
        ))}
      </Select>
      <Select
        aria-label="Stroke"
        value={value.stroke ?? ""}
        onChange={(e) => selectStroke(e.target.value as Stroke)}
        disabled={value.distance === null}
      >
        <option value="" disabled>
          Stroke
        </option>
        {strokes.map((s) => (
          <option key={s} value={s}>
            {STROKE_LABEL[s]}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Course"
        value={value.course ?? ""}
        onChange={(e) =>
          onChange({ ...value, course: e.target.value as Course })
        }
        disabled={value.stroke === null}
      >
        <option value="" disabled>
          Course
        </option>
        {courses.map((c) => (
          <option key={c} value={c}>
            {c === "SCM" ? "SCM · 25m" : "LCM · 50m"}
          </option>
        ))}
      </Select>
    </div>
  );
}
