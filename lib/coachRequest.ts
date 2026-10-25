// Coach-request hand-off across the sign-up redirect.
//
// A person signing up as a coach picks their club on /signup, but the account
// isn't a live Convex session until AFTER sign-in has redirected away. Like the
// coach invite (lib/coachInvite.ts) we stash the choice in sessionStorage and
// file the request from inside the authenticated shell (CoachRequestGate) the
// moment the session is live — never on the auth page, where it could race.

export const COACH_REQUEST_KEY = "swim-tracker:coach-request-club";

/** Remember the club a new coach asked to join, for post-sign-up filing. */
export function stashCoachRequest(clubId: string): void {
  try {
    sessionStorage.setItem(COACH_REQUEST_KEY, clubId);
  } catch {
    /* sessionStorage unavailable — they can still ask from the account menu. */
  }
}

/** Whether a request is waiting to be filed (without consuming it). */
export function hasStashedCoachRequest(): boolean {
  try {
    return sessionStorage.getItem(COACH_REQUEST_KEY) !== null;
  } catch {
    return false;
  }
}

/** Read and clear the stashed club id (single attempt). */
export function takeCoachRequest(): string | null {
  try {
    const clubId = sessionStorage.getItem(COACH_REQUEST_KEY);
    if (clubId) sessionStorage.removeItem(COACH_REQUEST_KEY);
    return clubId;
  } catch {
    return null;
  }
}
