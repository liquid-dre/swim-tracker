import { CompareScreen } from "@/components/compare/CompareScreen";

// Viewer Comparison. The same leaderboard screen coaches use, scoped
// server-side to the viewer's linked swimmer(s) (a parent comparing their own
// children against each other and the cut).
export default function ViewerComparePage() {
  return <CompareScreen />;
}
