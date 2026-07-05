// Fixed competition calendar → a date-to-meet-name lookup used to pre-fill the
// "Meet / venue name" on the log form when a coach enters a known event date.
// Times logged on the same day are almost always from the scheduled gala, so
// defaulting the name saves retyping it for every swimmer — the coach can always
// override it, and a date with no scheduled event just leaves the field blank.
//
// Keyed by ISO "YYYY-MM-DD" (this is the 2026/27 season's fixtures). When the
// season's schedule changes, update this map — or later source it from a
// coach-editable settings entity (the deferred "tour dates", docs/access-control).

export const GALA_CALENDAR: Record<string, string> = {
  "2026-08-24": "SC",
  "2026-09-02": "Africa Aquatics Zone 4 Botswana",
  "2026-09-12": "1st seeded",
  "2026-09-14": "1st Junior",
  "2026-09-21": "2nd seeded",
  "2026-09-28": "2nd Junior",
  "2026-10-10": "3rd seeded",
  "2026-10-12": "3rd Junior",
  "2026-10-17": "National Sprint",
  "2026-10-31": "4th seeded",
  "2026-11-02": "4th Junior",
  "2026-11-28": "HAS senior champs",
  "2027-01-09": "5th seeded",
  "2027-01-18": "5th Junior",
  "2027-01-23": "Nat Senior Championship",
};

/** The scheduled gala / meet name for an ISO "YYYY-MM-DD" date, or null if none. */
export function galaForDate(iso: string): string | null {
  return GALA_CALENDAR[iso] ?? null;
}
