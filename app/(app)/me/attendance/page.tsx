import { AttendanceCalendarScreen } from "@/components/attendance/AttendanceCalendarScreen";

// The viewer's combined attendance calendar across all their linked swimmers.
// `today` is server-resolved (see the coach page). Read-only: no marking, no
// schedule, no summary — notes appear only where a coach flagged them visible.
export default async function MyAttendancePage() {
  const today = new Date().toISOString().slice(0, 10);
  return <AttendanceCalendarScreen role="viewer" today={today} />;
}
