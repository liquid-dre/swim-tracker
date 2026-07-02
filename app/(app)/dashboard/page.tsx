import { CoachDashboardScreen } from "@/components/dashboard/CoachDashboardScreen";

// Coach home (Step 16): the landing route for a coach — a fast log CTA and
// jump-offs into the working surfaces. RoleGuard (app layout) bounces viewers to
// /me, so this screen is always a coach.
export default function DashboardPage() {
  return <CoachDashboardScreen />;
}
