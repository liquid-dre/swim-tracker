import { ViewerProvider } from "@/components/me/ViewerContext";

/*
  Viewer area layout (Step R6). Wraps every /me/* route in the shared viewer
  selection context, so the swimmer switcher persists as a viewer moves between
  Overview / Progress / Road / History. Access is enforced by RoleGuard (a coach
  can't reach /me/*) and, definitively, server-side in every read.
*/
export default function MeLayout({ children }: { children: React.ReactNode }) {
  return <ViewerProvider>{children}</ViewerProvider>;
}
