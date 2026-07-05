import type { Id } from "@/convex/_generated/dataModel";
import { SwimmerProfileScreen } from "@/components/swimmers/SwimmerProfileScreen";

// The viewer's read-only swimmer profile — the same screen coaches see, minus
// the viewer-access admin (hidden for viewers) and any edit affordances. Access
// is enforced server-side (requireSwimmerAccess): a viewer can only open a
// swimmer they are linked to. `today` is resolved once on the server.
export default async function ViewerSwimmerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const today = new Date().toISOString().slice(0, 10);
  return <SwimmerProfileScreen swimmerId={id as Id<"swimmers">} today={today} />;
}
