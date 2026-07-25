import { AttendanceCalendarScreen } from "@/components/attendance/AttendanceCalendarScreen";

// `today` is resolved once on the server so the calendar's "today" and the future-
// session rule don't depend on an impure render clock. `?swimmer=<id>` (from a
// swimmer profile) opens the calendar filtered to that swimmer; `?squad=<id>`
// narrows to a squad.
export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ swimmer?: string; squad?: string }>;
}) {
  const { swimmer, squad } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <AttendanceCalendarScreen
      role="coach"
      today={today}
      initialSwimmerId={swimmer ?? null}
      initialSquadId={squad ?? null}
    />
  );
}
