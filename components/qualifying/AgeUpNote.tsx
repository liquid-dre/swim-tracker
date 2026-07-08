import { formatShortDate } from "@/lib/format";

/*
  Standards resolve to the exact single-year age, so a birthday changes which
  cuts apply — but only where nothing is already locked in: an existing best
  is judged at the age it was swum (§4.9), so only no-time events move to the
  new age's cuts. Say exactly that for a month rather than leave the swimmer
  wondering. Quiet by design: context, not a warning.
*/
export function AgeUpNote({
  name,
  age,
  date,
  pinnedTiers = [],
}: {
  name: string;
  age: number;
  date: string;
  // Tiers pinned to a tour day, which a birthday does NOT move — named so the
  // note never overclaims on surfaces judging several tiers at once.
  pinnedTiers?: string[];
}) {
  return (
    <p className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-ink-muted">
      {name} turned {age} on {formatShortDate(date)} — events without a meet
      time now target the age-{age} cuts; existing bests still count at the age
      they were swum.
      {pinnedTiers.length > 0 &&
        ` ${pinnedTiers.join(" and ")} ${
          pinnedTiers.length === 1 ? "is" : "are"
        } unaffected — judged at age on tour day.`}
    </p>
  );
}
