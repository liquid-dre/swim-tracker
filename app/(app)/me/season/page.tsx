import { SeasonScreen } from "@/components/season/SeasonScreen";

// Viewer Season improvement. The same ranking screen coaches use, scoped
// server-side to the viewer's linked swimmer(s). The season window is read-only
// for viewers (only the super-user sets it).
export default function ViewerSeasonPage() {
  return <SeasonScreen />;
}
