import type { Id } from "@/convex/_generated/dataModel";

// Normalised calendar shapes shared by the coach + viewer surfaces. The screen is
// the only role-aware layer: it picks the query and maps its result into these,
// so the grid/agenda stay presentational and identical for both roles (§R18).

export type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type SessionStatus = "SCHEDULED" | "CANCELLED";

export type CalendarSwimmer = {
  swimmerId: Id<"swimmers">;
  name: string;
  status: AttendanceStatus | null;
  note?: string | null;
};

export type CalendarSession = {
  id: Id<"sessions">;
  startMin: number;
  endMin: number;
  label: string | null;
  location?: string | null;
  status: SessionStatus;
  /** Summary counts (coach unfiltered view); absent in per-swimmer mode. */
  counts?: { attended: number; total: number; marked: number };
  /** Per-swimmer statuses (coach single-swimmer + viewer views). */
  perSwimmer: CalendarSwimmer[];
};

export type CalendarDay = {
  date: string; // ISO YYYY-MM-DD
  sessions: CalendarSession[];
};

/** "summary" shows attendance counts; "swimmer" colours by per-swimmer status. */
export type CalendarVariant = "summary" | "swimmer";
