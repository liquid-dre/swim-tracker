import type { AttendanceStatus } from "./types";

// Presentation helpers for attendance (pure, client-safe). Colour follows DESIGN.md
// semantics — success/warning/error are used ONLY for genuine states, and every
// status carries a text label so meaning is never colour-only.

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const STATUS_ORDER: AttendanceStatus[] = ["PRESENT", "LATE", "ABSENT", "EXCUSED"];

export const STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string; chip: string; dot: string }
> = {
  PRESENT: {
    label: "Present",
    short: "P",
    chip: "border-success-subtle bg-success-subtle text-success-ink",
    dot: "bg-success-500",
  },
  LATE: {
    label: "Late",
    short: "L",
    chip: "border-warning-subtle bg-warning-subtle text-warning-ink",
    dot: "bg-warning-500",
  },
  ABSENT: {
    label: "Absent",
    short: "A",
    chip: "border-danger-subtle bg-danger-subtle text-danger-ink",
    dot: "bg-error-500",
  },
  EXCUSED: {
    label: "Excused",
    short: "E",
    chip: "border-gray-200 bg-gray-100 text-ink-muted",
    dot: "bg-gray-400",
  },
};

/** Minutes-from-midnight → a friendly 12-hour clock ("4:30 PM", "6 AM"). */
export function formatClock(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${ampm}` : `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** A start–end range, sharing the meridiem when both halves match ("4:30–6:00 PM"). */
export function formatTimeRange(startMin: number, endMin: number): string {
  const startAm = startMin < 720;
  const endAm = endMin < 720;
  if (startAm === endAm) {
    const strip = (s: string) => s.replace(/ (AM|PM)$/, "");
    return `${strip(formatClock(startMin))}–${formatClock(endMin)}`;
  }
  return `${formatClock(startMin)} – ${formatClock(endMin)}`;
}

/** Compact start time for a calendar chip ("4:30"). */
export function formatChipTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, "0")}`;
}

/** "Mon, Wed, Fri" for a pattern's weekday set (already 0–6). */
export function formatWeekdays(weekdays: number[]): string {
  return [...weekdays]
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_SHORT[d])
    .join(", ");
}

export function monthTitle(year: number, month: number): string {
  return `${MONTH_LONG[month]} ${year}`;
}

/** Shift a {year, month} by whole months. */
export function shiftMonth(year: number, month: number, by: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month + by, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

/** First and last ISO date of a month — the calendar's query range. */
export function monthBounds(year: number, month: number): { from: string; to: string } {
  const first = new Date(Date.UTC(year, month, 1));
  const last = new Date(Date.UTC(year, month + 1, 0));
  return {
    from: first.toISOString().slice(0, 10),
    to: last.toISOString().slice(0, 10),
  };
}
