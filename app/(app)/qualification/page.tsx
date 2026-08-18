import { QualificationScreen } from "@/components/qualification/QualificationScreen";

// Gala qualification (coach-only): which gala each swimmer is going to, each
// under the highest tier they qualify for. Server-gated via requireCoach.
export default function QualificationPage() {
  return <QualificationScreen />;
}
