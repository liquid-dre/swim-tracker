import { AttendanceInsightsScreen } from "@/components/attendance/AttendanceInsightsScreen";

// `?month=YYYY-MM` (from the calendar's month strip) opens on that month rather
// than the whole season. `today` caps the month in progress at today.
export default async function AttendanceInsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  return <AttendanceInsightsScreen today={today} initialMonth={month ?? null} />;
}
