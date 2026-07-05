import type { Id } from "@/convex/_generated/dataModel";
import { LogScreen } from "@/components/log/LogScreen";

// `today` is resolved once on the server so the date bounds and live
// age-at-swim don't depend on an impure render clock. `?swimmer=<id>` (from a
// swimmer profile's "Log a time") pre-selects that swimmer so the coach doesn't
// re-pick who they're already looking at.
export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ swimmer?: string }>;
}) {
  const { swimmer } = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <LogScreen
      today={today}
      initialSwimmerId={(swimmer as Id<"swimmers"> | undefined) ?? null}
    />
  );
}
