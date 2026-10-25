import { PermissionsScreen } from "@/components/permissions/PermissionsScreen";

// Permissions (/permissions): coach join requests, coach levels and the club's
// junior/senior age split. Super Coach and Admin only — barred for assistant
// coaches in nav.isRouteAllowed, and every function gates on requireSuperCoachOf.
export default function PermissionsPage() {
  return <PermissionsScreen />;
}
