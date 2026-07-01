import { SeasonScreen } from "@/components/season/SeasonScreen";

// Season improvement ranking (Step 13, BRD §5.12). Ranks swimmers by the time
// they've dropped this season — by event or averaged across events — over an
// editable, coach-set season start (default rolling 12 months). MEET times only.
export default function SeasonPage() {
  return <SeasonScreen />;
}
