import { AdminGalasScreen } from "@/components/admin/AdminGalasScreen";

// Galas (super-user only): each gala's tour date and its entry age window.
// Route access is enforced by the shell's RoleGuard + isRouteAllowed (/admin/*
// is super-user territory); every mutation is additionally gated server-side by
// requireSuperUser.
export default function AdminGalasPage() {
  return <AdminGalasScreen />;
}
