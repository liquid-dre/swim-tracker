import { ScheduleScreen } from "@/components/attendance/ScheduleScreen";

// `today` is resolved once on the server, like the calendar's, so the note about
// whether the season end has already passed never depends on a render clock.
export default function SchedulePage() {
  const today = new Date().toISOString().slice(0, 10);
  return <ScheduleScreen today={today} />;
}
