import { computeAge } from "./swim";

/*
  Coach levels (docs/access-control.md, "Coach levels"). A COACH profile carries
  one of three levels inside its club:

    SUPER   — today's coach: edits everything in the club and runs Permissions.
    SENIOR  — reads the club; writes ONLY swimmer training notes, seniors only.
    JUNIOR  — reads the club; writes ONLY swimmer training notes, juniors only.

  `profiles.coachLevel` absent means SUPER, so every coach who existed before
  levels did keeps exactly what they had. The junior/senior split is an AGE, not
  a squad: a swimmer whose age today is ≤ the club's `juniorMaxAge` (default 12)
  is a junior, everyone older a senior — it moves on its own on a birthday.

  Pure, so the server's write gate and the UI's "show the composer" check read
  the same rule.
*/

export type CoachLevel = "SUPER" | "SENIOR" | "JUNIOR";

export const COACH_LEVELS: readonly CoachLevel[] = ["SUPER", "SENIOR", "JUNIOR"];

/** Junior = this age or younger, unless the club has set its own split. */
export const DEFAULT_JUNIOR_MAX_AGE = 12;

/** The bounds a club's split may be set to — a sanity range, not a policy. */
export const JUNIOR_MAX_AGE_MIN = 6;
export const JUNIOR_MAX_AGE_MAX = 25;

type ProfileLike = { role: "SUPER_USER" | "COACH" | "VIEWER"; coachLevel?: CoachLevel };

/** A coach's level (absent = SUPER), or null for anyone who isn't a COACH. */
export function coachLevelOf(profile: ProfileLike): CoachLevel | null {
  if (profile.role !== "COACH") return null;
  return profile.coachLevel ?? "SUPER";
}

/**
 * Full staff: the Admin, or a Super Coach. The only people who may write
 * anything beyond a training note — the single copy of that rule.
 */
export function isFullStaff(profile: ProfileLike): boolean {
  return profile.role === "SUPER_USER" || coachLevelOf(profile) === "SUPER";
}

/** An assistant coach — reads the club, writes only notes for one age group. */
export function isAssistantCoach(profile: ProfileLike): boolean {
  const level = coachLevelOf(profile);
  return level === "SENIOR" || level === "JUNIOR";
}

export function juniorMaxAgeOf(club: { juniorMaxAge?: number } | null | undefined): number {
  return club?.juniorMaxAge ?? DEFAULT_JUNIOR_MAX_AGE;
}

/** "JUNIOR" when the swimmer's age on `asOf` is ≤ `juniorMaxAge`, else "SENIOR". */
export function ageGroupFor(
  dob: string,
  asOf: string,
  juniorMaxAge: number = DEFAULT_JUNIOR_MAX_AGE,
): "JUNIOR" | "SENIOR" {
  return computeAge(dob, asOf) <= juniorMaxAge ? "JUNIOR" : "SENIOR";
}

/**
 * Whether an assistant coach's level covers this swimmer today. SUPER covers
 * everyone; a non-coach covers no one. Club membership is checked separately.
 */
export function levelCoversSwimmer(
  level: CoachLevel | null,
  dob: string,
  asOf: string,
  juniorMaxAge: number,
): boolean {
  if (level === null) return false;
  if (level === "SUPER") return true;
  return ageGroupFor(dob, asOf, juniorMaxAge) === level;
}

/** Display label — "Super coach", never the enum. */
export function coachLevelLabel(level: CoachLevel): string {
  switch (level) {
    case "SUPER":
      return "Super coach";
    case "SENIOR":
      return "Senior coach";
    case "JUNIOR":
      return "Junior coach";
  }
}

/** What each level may do, in one line — shown beside the level picker. */
export function coachLevelSummary(level: CoachLevel, juniorMaxAge: number): string {
  switch (level) {
    case "SUPER":
      return "Everything in the club, including Permissions.";
    case "SENIOR":
      return `Reads the club; writes training notes for swimmers ${juniorMaxAge + 1} and over.`;
    case "JUNIOR":
      return `Reads the club; writes training notes for swimmers ${juniorMaxAge} and under.`;
  }
}
