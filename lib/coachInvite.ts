// Coach-invite hand-off across the sign-in redirect (access-control P0).
//
// The invite token rides in on `/signup?invite=…`, but the account isn't a live
// Convex session until AFTER sign-in has redirected away from that page. Rather
// than race the token propagation on the auth screen, we stash the token in
// sessionStorage on the way in and redeem it from inside the authenticated app
// shell (see components/shell/InviteRedeemer), the instant useConvexAuth confirms
// the session — so redemption is never attempted before it can succeed.

export const COACH_INVITE_KEY = "swim-tracker:coach-invite";

/** If the current URL carries `?invite=<token>`, remember it for post-login redemption. */
export function stashCoachInvite(): void {
  try {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (token) sessionStorage.setItem(COACH_INVITE_KEY, token);
  } catch {
    /* sessionStorage unavailable (SSR / privacy mode) — the direct redeem path
       on the auth page is the fallback, so this is best-effort. */
  }
}

/** Read and clear the stashed invite token (single-use). */
export function takeCoachInvite(): string | null {
  try {
    const token = sessionStorage.getItem(COACH_INVITE_KEY);
    if (token) sessionStorage.removeItem(COACH_INVITE_KEY);
    return token;
  } catch {
    return null;
  }
}
