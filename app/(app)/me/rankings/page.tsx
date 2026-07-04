import { ViewerRankingsScreen } from "@/components/me/ViewerRankingsScreen";

// Viewer Rankings (/me/rankings, access-control Phase 3). Read-only leaderboard
// of every swimmer on one event by fastest meet time — the viewer's own swimmer
// highlighted. Public payload only (no DOB/notes); server-scoped in analysis.ts.
export default function ViewerRankingsPage() {
  return <ViewerRankingsScreen />;
}
