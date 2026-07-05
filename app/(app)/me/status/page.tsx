import { StatusMatrixScreen } from "@/components/status/StatusMatrixScreen";

// Viewer Status matrix. The same matrix coaches use, scoped server-side to the
// viewer's linked swimmer(s) (the squad filter is a coach concept and is hidden).
export default function ViewerStatusPage() {
  return <StatusMatrixScreen />;
}
