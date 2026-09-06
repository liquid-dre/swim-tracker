import { MeetDetailScreen } from "@/components/meets/MeetDetailScreen";
import type { Id } from "@/convex/_generated/dataModel";

// One meet and its programme. The id is validated by the query, which returns
// null for a meet that no longer exists — the screen states that rather than
// throwing at a coach who followed a stale link.
export default async function MeetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <MeetDetailScreen meetId={id as Id<"meets">} role="coach" today={today} />
  );
}
