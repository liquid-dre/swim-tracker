import { QualificationScreen } from "@/components/qualification/QualificationScreen";

// Tour qualification (coach-only): who is going to which tour, each swimmer
// under the highest tier they qualify for. Server-gated via requireCoach.
export default function QualificationPage() {
  return <QualificationScreen />;
}
