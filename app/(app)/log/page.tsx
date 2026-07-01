import { LogScreen } from "@/components/log/LogScreen";

// `today` is resolved once on the server so the date bounds and live
// age-at-swim don't depend on an impure render clock.
export default function LogPage() {
  const today = new Date().toISOString().slice(0, 10);
  return <LogScreen today={today} />;
}
