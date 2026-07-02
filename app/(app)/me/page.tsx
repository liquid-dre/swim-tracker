import { ViewerOverviewScreen } from "@/components/me/ViewerOverviewScreen";

// Viewer Overview (Step R6, BRD §5.9). The lean landing summary for a linked
// viewer: greeting, PB board and a short "closest to qualifying" read. The full
// charts live in the focused sections (/me/progress, /me/road, /me/history).
// Wrapped by the /me layout's ViewerProvider; every read is scoped to the
// viewer's linked swimmer(s) server-side.
export default function ViewerOverviewPage() {
  return <ViewerOverviewScreen />;
}
