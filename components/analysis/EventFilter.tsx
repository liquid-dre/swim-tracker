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
import { defaultCourse, type EventOption, type EventValue } from "./EventPicker";

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
    <div className="flex flex-wrap items-center gap-2">
      <div className="w-32">
        <Select
          aria-label="Distance"
          placeholder="Distance"
          value={value.distance === null ? "" : String(value.distance)}
          onValueChange={(v) => selectDistance(Number(v))}
          disabled={!events}
          options={distances.map((d) => ({ value: String(d), label: `${d} m` }))}
        />
      </div>
      <div className="w-36">
        <Select
          aria-label="Stroke"
          placeholder="Stroke"
          value={value.stroke ?? ""}
          onValueChange={(v) => selectStroke(v as Stroke)}
          disabled={value.distance === null}
          options={strokes.map((s) => ({ value: s, label: STROKE_LABEL[s] }))}
        />
      </div>
      <div className="w-36">
        <Select
          aria-label="Course"
          placeholder="Course"
          value={value.course ?? ""}
          onValueChange={(v) => onChange({ ...value, course: v as Course })}
          disabled={value.stroke === null}
          options={courses.map((c) => ({
            value: c,
            label: c === "SCM" ? "SCM · 25m" : "LCM · 50m",
          }))}
        />
      </div>
    </div>
  );
}
