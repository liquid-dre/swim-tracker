import { UnassignedScreen } from "@/components/admin/UnassignedScreen";

// Admin › Unassigned (/admin/unassigned): give every legacy swimmer and squad a
// club, since coaches read only their own. Super-user only — reserved under
// /admin in nav.isRouteAllowed, and every function requires the super-user.
export default function UnassignedPage() {
  return <UnassignedScreen />;
}
