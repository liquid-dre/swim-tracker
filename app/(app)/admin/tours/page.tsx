import { AdminToursScreen } from "@/components/admin/AdminToursScreen";

// Tour dates (super-user only). Route access is enforced by the shell's
// RoleGuard + isRouteAllowed (/admin/* is super-user territory); every
// mutation is additionally gated server-side by requireSuperUser.
export default function AdminToursPage() {
  return <AdminToursScreen />;
}
