import { AdminClubsScreen } from "@/components/admin/AdminClubsScreen";

// Clubs & coaches admin (/admin/clubs, access-control Phase 4c). Super-user only:
// the route is reserved in nav.isRouteAllowed + RoleGuard, and every clubs
// mutation requires the super-user server-side.
export default function AdminClubsPage() {
  return <AdminClubsScreen />;
}
