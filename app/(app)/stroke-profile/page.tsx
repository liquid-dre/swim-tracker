import { StrokeProfileScreen } from "@/components/profile/StrokeProfileScreen";

// Stroke profile (Step 12.5, BRD §5). A radial wheel of a swimmer's events
// grouped by stroke, calibrated per-event against the L2/L3/SANJ cuts (LCM
// only). Coach compare = up to 3 side by side; viewer = own swimmer(s) only.
export default function StrokeProfilePage() {
  return <StrokeProfileScreen />;
}
