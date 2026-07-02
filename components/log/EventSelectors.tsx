"use client";

import { DISTANCE_ORDER, STROKE_LABEL, STROKE_ORDER } from "@/lib/swim";
import type { Course, Stroke } from "@/lib/swim";

/*
  The event trio — Distance / Stroke / Course — as three ALWAYS-VISIBLE,
  identically styled chip groups (Step R1). Shared by /log and the result edit
  sheet so the two capture forms read the same.

  Options are driven LIVE off the event whitelist: an option that can't form a
  valid (distance, stroke, course) event with the other two current selections
  is DISABLED (greyed), never hidden — so `50 IM`, `100 IM` on LCM, `400 Back`
  etc. are visibly unavailable rather than silently missing. Selections are
  sticky: changing one control never wipes the others; if the trio becomes
  invalid we surface a brief inline hint and the parent's Save gate (via
  `isValidEventTriple`) blocks the submit. Nothing off the whitelist is
  submittable.
*/

export type EventOption = {
  distance: number;
  stroke: Stroke;
  allowedCourses: readonly Course[];
};

type Triple = { d: number; s: Stroke; c: Course };
type Partial3 = { d?: number; s?: Stroke; c?: Course };

const COURSE_ORDER: readonly Course[] = ["LCM", "SCM"];

/** Every valid (distance, stroke, course) triple the whitelist allows. */
function triplesOf(events: readonly EventOption[] | undefined): Triple[] {
  const out: Triple[] = [];
  for (const e of events ?? []) {
    for (const c of e.allowedCourses) out.push({ d: e.distance, s: e.stroke, c });
  }
  return out;
}

/** Does at least one valid event match these (possibly partial) constraints? */
function some(triples: readonly Triple[], p: Partial3): boolean {
  return triples.some(
    (t) =>
      (p.d === undefined || t.d === p.d) &&
      (p.s === undefined || t.s === p.s) &&
      (p.c === undefined || t.c === p.c),
  );
}

/**
 * True only when all three are set AND the combination is a real whitelist
 * event. The parent uses this for its Save gate so an invalid combo — even one
 * left behind after changing a single control — can never be submitted.
 */
export function isValidEventTriple(
  events: readonly EventOption[] | undefined,
  distance: number | null,
  stroke: Stroke | null,
  course: Course | null,
): boolean {
  if (distance === null || stroke === null || course === null) return false;
  return some(triplesOf(events), { d: distance, s: stroke, c: course });
}

export function EventSelectors({
  events,
  distance,
  stroke,
  course,
  onDistance,
  onStroke,
  onCourse,
  disabled,
}: {
  events: readonly EventOption[] | undefined;
  distance: number | null;
  stroke: Stroke | null;
  course: Course | null;
  onDistance: (distance: number) => void;
  onStroke: (stroke: Stroke) => void;
  onCourse: (course: Course) => void;
  disabled?: boolean;
}) {
  const triples = triplesOf(events);
  const ready = triples.length > 0;

  // Wildcards for the OTHER-two-control constraint when a control is unset.
  const d = distance ?? undefined;
  const s = stroke ?? undefined;
  const c = course ?? undefined;

  // Show every whitelist value (plus any current selection, so a seeded value
  // still renders before the whitelist has loaded).
  const distanceValues = DISTANCE_ORDER.filter(
    (v) => some(triples, { d: v }) || v === distance,
  );
  const strokeValues = STROKE_ORDER.filter(
    (v) => some(triples, { s: v }) || v === stroke,
  );
  const courseValues = COURSE_ORDER.filter(
    (v) => some(triples, { c: v }) || v === course,
  );

  // An option is enabled when it can still form a valid event alongside the two
  // OTHER current selections. Before the whitelist loads, disable nothing.
  const enabled = (p: Partial3) => !ready || some(triples, p);

  // Which control (if any) makes the current selection impossible, for the hint.
  const strokeConflict =
    ready && distance !== null && stroke !== null && !some(triples, { d, s });
  const courseConflict =
    ready &&
    !strokeConflict &&
    distance !== null &&
    stroke !== null &&
    course !== null &&
    !some(triples, { d, s, c });

  let hint: string | null = null;
  if (strokeConflict) {
    hint = `There's no ${distance} ${STROKE_LABEL[stroke as Stroke]} event — pick a different stroke or distance.`;
  } else if (courseConflict) {
    const only = triples.find((t) => t.d === distance && t.s === stroke)?.c;
    const courseName = only === "SCM" ? "short course (SCM)" : "long course (LCM)";
    hint = `${distance} ${STROKE_LABEL[stroke as Stroke]} runs ${courseName} only — switch the course.`;
  }

  return (
    <div className="flex flex-col gap-5">
      <ChipRow
        label="Distance"
        options={distanceValues.map((v) => ({
          value: String(v),
          label: String(v),
          enabled: enabled({ d: v, s, c }),
          selected: distance === v,
        }))}
        onPick={(v) => onDistance(Number(v))}
        disabled={disabled}
      />
      <ChipRow
        label="Stroke"
        options={strokeValues.map((v) => ({
          value: v,
          label: STROKE_LABEL[v],
          enabled: enabled({ d, s: v, c }),
          selected: stroke === v,
        }))}
        onPick={(v) => onStroke(v as Stroke)}
        disabled={disabled}
      />
      <ChipRow
        label="Course"
        options={courseValues.map((v) => ({
          value: v,
          label: v === "SCM" ? "SCM · 25m" : "LCM · 50m",
          enabled: enabled({ d, s, c: v }),
          selected: course === v,
        }))}
        onPick={(v) => onCourse(v as Course)}
        disabled={disabled}
      />
      {hint && (
        <p role="status" className="text-xs font-medium text-warning-ink">
          {hint}
        </p>
      )}
    </div>
  );
}

type ChipOption = {
  value: string;
  label: string;
  enabled: boolean;
  selected: boolean;
};

// A wrapping single-select chip row with whitelist-driven disabling. Radio
// semantics so it stays keyboard- and screen-reader-operable; the identical
// markup drives Distance, Stroke AND Course so all three match exactly.
function ChipRow({
  label,
  options,
  onPick,
  disabled,
}: {
  label: string;
  options: ChipOption[];
  onPick: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((opt) => {
          // A selection left behind after a conflicting change: keep it visible
          // and clickable, flagged in red, rather than greying the choice away.
          const invalidSelected = opt.selected && !opt.enabled;
          const isDisabled = Boolean(disabled) || (!opt.enabled && !opt.selected);
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={opt.selected}
              aria-disabled={isDisabled || undefined}
              disabled={isDisabled}
              onClick={() => onPick(opt.value)}
              className={
                "h-11 min-w-11 rounded-lg border px-4 text-base font-medium tabular-nums outline-none transition-colors [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring " +
                (invalidSelected
                  ? "border-error-500 bg-error-50 text-error-600"
                  : opt.selected
                    ? "border-brand-500 bg-brand-50 text-brand-500"
                    : isDisabled
                      ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-300"
                      : "border-gray-300 bg-white text-gray-500 hover:border-gray-400 hover:text-gray-800")
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
