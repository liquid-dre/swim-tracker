import type { Id } from "@/convex/_generated/dataModel";
import { SessionMarkingScreen } from "@/components/attendance/SessionMarkingScreen";

// The roster-marking view for one session. Deep-linkable (opened from the calendar
// by navigation); `today` is server-resolved so the future/past distinction is
// stable.
export default async function SessionMarkingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  return <SessionMarkingScreen sessionId={id as Id<"sessions">} today={today} />;
}
