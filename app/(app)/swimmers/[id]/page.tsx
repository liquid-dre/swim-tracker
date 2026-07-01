import type { Id } from "@/convex/_generated/dataModel";
import { SwimmerProfileScreen } from "@/components/swimmers/SwimmerProfileScreen";

// The swimmer profile (Step 6). `today` is resolved once on the server so the
// edit form's live age + date bounds don't depend on an impure client clock.
export default async function SwimmerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  return <SwimmerProfileScreen swimmerId={id as Id<"swimmers">} today={today} />;
}
