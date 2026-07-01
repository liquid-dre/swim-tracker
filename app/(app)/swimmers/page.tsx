import { SwimmersScreen } from "@/components/swimmers/SwimmersScreen";

// `today` is resolved once on the server (per request) and passed down, so the
// client form's live age + date bounds don't depend on an impure render clock.
export default function SwimmersPage() {
  const today = new Date().toISOString().slice(0, 10);
  return <SwimmersScreen today={today} />;
}
