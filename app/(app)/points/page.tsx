import { Suspense } from "react";

import { PointsScreen } from "@/components/points/PointsScreen";

// World Aquatics points for one swimmer. The app's only cross-EVENT scale:
// every meet PB scored on one 0–1000 axis, so a 200 breast and a 50 free can be
// ranked against each other. Long course only until the short-course base times
// are loaded (see lib/points.ts).
//
// Suspense because the screen keeps its swimmer selection in `?swimmer=`, and
// `useSearchParams` opts a client component into deferred rendering.
export default function PointsPage() {
  return (
    <Suspense>
      <PointsScreen />
    </Suspense>
  );
}
