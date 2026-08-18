import { Suspense } from "react";

import type { Id } from "@/convex/_generated/dataModel";
import {
  ProfileSkeleton,
  SwimmerProfileScreen,
} from "@/components/swimmers/SwimmerProfileScreen";

// The swimmer profile (Step 6). `today` is resolved once on the server so the
// edit form's live age + date bounds don't depend on an impure client clock.
// The screen reads its active tab from the query string, so it needs a Suspense
// boundary; the fallback is the screen's own skeleton, so nothing changes visually.
export default async function SwimmerProfilePage({
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
