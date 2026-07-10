import { formatShortDate } from "@/lib/format";

/*
  Qualification resolves to the swimmer's CURRENT exact single-year age, so a
  birthday moves every cut at once — the gaps a coach sees the day after a
  birthday are against the new age's (usually harder) cuts. Say so for a month
  rather than leave them wondering why the numbers shifted. Quiet by design:
  context, not a warning.
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
      {name} turned {age} on {formatShortDate(date)} — every cut now resolves to
      the age-{age} standard.
      {pinnedTiers.length > 0 &&
        ` ${pinnedTiers.join(" and ")} ${
          pinnedTiers.length === 1 ? "is" : "are"
        } unaffected — judged at age on tour day.`}
    </p>
  );
}
