import { ProgressionScreen } from "@/components/progression/ProgressionScreen";

// Progression view (Step 7, BRD §5.6). Time series for one swimmer or a group on
// one event, on a zero-anchored y-axis so a faster time sits lower. Standards
// overlays (qualifying reference lines) arrive in Step 10.
export default function ProgressionPage() {
  return <ProgressionScreen />;
}
