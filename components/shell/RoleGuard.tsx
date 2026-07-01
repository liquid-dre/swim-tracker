"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { homeForRole, isRouteAllowed, type Role } from "@/lib/nav";

/*
  Route guard for the app shell (Step 15). The server is the real boundary —
  every Convex query/mutation rejects an out-of-scope caller (convex/authz.ts) —
  so this is purely UX: it keeps a VIEWER from ever mounting a coach screen
  (whose reads would throw) and a COACH out of the viewer-only home. While the
  profile (and thus the role) is still resolving we render a calm placeholder
  rather than guess, so no coach navigation flashes to a viewer mid-redirect.
*/
export function RoleGuard({ children }: { children: React.ReactNode }) {
  const profile = useCurrentProfile();
  const pathname = usePathname();
  const router = useRouter();

  // `undefined` = loading; `null` = signed in but not yet provisioned (transient,
  // auth.ts creates the profile on first sign-in). Either way, role is unknown.
  const role: Role | null =
    profile === undefined || profile === null ? null : profile.role;
  const allowed = role !== null && isRouteAllowed(role, pathname);

  useEffect(() => {
    if (role !== null && !allowed) {
      router.replace(homeForRole(role));
    }
  }, [role, allowed, router]);

  // Hold the content until the role is known AND the route is permitted. A barred
  // route always has a redirect in flight here, so this placeholder is what shows
  // during that hop — never the wrong screen.
  if (role === null || !allowed) {
    return <RouteResolving />;
  }
  return <>{children}</>;
}

function RouteResolving() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <span
        aria-hidden
        className="size-6 animate-spin rounded-full border-2 border-gray-200 border-t-brand-500"
      />
    </div>
  );
}
