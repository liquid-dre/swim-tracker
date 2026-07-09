import { QualificationScreen } from "@/components/qualification/QualificationScreen";

// Viewer Tour qualification. The same screen coaches use, scoped server-side
// to the viewer's linked swimmer(s) (accessibleSwimmerIds in getTourQualification).
export default function ViewerQualificationPage() {
  return <QualificationScreen />;
}
