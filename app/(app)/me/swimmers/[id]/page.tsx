import { Suspense } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  ProfileSkeleton,
  SwimmerProfileScreen,
} from "@/components/swimmers/SwimmerProfileScreen";

// The viewer's read-only swimmer profile — the same screen coaches see, minus
// the attendance and viewer-access tabs and any edit affordances. Access is
// enforced server-side (requireSwimmerAccess): a viewer can only open a swimmer
// they are linked to. `today` is resolved once on the server. The Suspense
// boundary is for the screen's `?tab=` query-string read.
export default async function ViewerSwimmerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Suspense fallback={<ProfileSkeleton />}>
      <SwimmerProfileScreen swimmerId={id as Id<"swimmers">} today={today} />
    </Suspense>
  );
}
