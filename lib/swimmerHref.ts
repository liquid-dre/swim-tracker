/*
  Where a swimmer name should link, given the area the current screen is in.
  The same shared screens (Comparison, Status matrix…) render on both the coach
  routes and the viewer's /me/* routes; a viewer must stay inside /me, where the
  read-only profile lives, so links there resolve to /me/swimmers/[id]. Staff
  link into the coach roster at /swimmers/[id].
*/
export function swimmerProfileBase(pathname: string): string {
  return pathname.startsWith("/me") ? "/me/swimmers" : "/swimmers";
}
