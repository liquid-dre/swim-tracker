/*
  Viewer area layout. Every /me/* route is a read-only, coach-style screen with
  its own in-toolbar swimmer picker, scoped server-side to the viewer's linked
  swimmer(s) — so there is no global "Viewing:" switcher and no selection context
  to provide. Access is enforced by RoleGuard (a coach can't reach /me/*) and,
  definitively, server-side in every read.
*/
export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
