import { SquadsScreen } from "@/components/squads/SquadsScreen";

// `today` is resolved once on the server so the training-note composer's date
// default doesn't depend on an impure client clock.
export default function SquadsPage() {
  const today = new Date().toISOString().slice(0, 10);
  return <SquadsScreen today={today} />;
}
