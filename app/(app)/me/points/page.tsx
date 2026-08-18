import { Suspense } from "react";

import { PointsScreen } from "@/components/points/PointsScreen";

// Viewer Points. The same screen coaches use, scoped server-side to the
// viewer's linked swimmer(s) by `getSwimmerPoints` — a viewer passing another
// swimmer's id in `?swimmer=` is rejected by `requireSwimmerAccess`, not by the
// UI. Suspense: the screen reads `useSearchParams`.
export default function ViewerPointsPage() {
  return (
    <Suspense>
      <PointsScreen />
    </Suspense>
  );
}
