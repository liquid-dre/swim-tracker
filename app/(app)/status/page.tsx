import { StatusMatrixScreen } from "@/components/status/StatusMatrixScreen";

// Qualification status matrix (Step 11, BRD §5.7). Coach-facing, LCM only:
// swimmers × long-course events, highest tier met + gap to the next tier up.
export default function StatusPage() {
  return <StatusMatrixScreen />;
}
