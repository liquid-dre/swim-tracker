import { StrokeProfileScreen } from "@/components/profile/StrokeProfileScreen";

// Viewer Stroke profile. Already role-aware — its picker reads listForProfile,
// so a viewer sees a single-select of their own linked swimmer(s).
export default function ViewerStrokeProfilePage() {
  return <StrokeProfileScreen />;
}
