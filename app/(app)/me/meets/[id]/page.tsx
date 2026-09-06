import { MeetDetailScreen } from "@/components/meets/MeetDetailScreen";
import type { Id } from "@/convex/_generated/dataModel";

// The viewer's mirror of /meets/[id] — one meet's programme, read-only.
export default async function ViewerMeetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <MeetDetailScreen meetId={id as Id<"meets">} role="viewer" today={today} />
  );
}
