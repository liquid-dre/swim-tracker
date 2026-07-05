import { describe, expect, it } from "vitest";

import {
  isLeafActive,
  isRouteAllowed,
  navForRole,
  type NavLeaf,
  type Role,
} from "./nav";

// Flatten the role's nav to the set of hrefs it can navigate to.
function hrefsFor(role: Role): string[] {
  const out: string[] = [];
  for (const node of navForRole(role)) {
    if (node.kind === "item") out.push(node.href);
    else for (const it of node.items) out.push(it.href);
  }
  return out;
}

describe("navForRole — role decides which nav renders (R6)", () => {
  it("gives a viewer exactly the compartmentalised sections", () => {
    expect(hrefsFor("VIEWER")).toEqual([
      "/me",
      "/me/progress",
      "/me/road",
      "/me/history",
      "/me/find",
    ]);
  });

  it("shows a viewer no coach routes", () => {
    const viewer = hrefsFor("VIEWER");
    for (const coachHref of ["/dashboard", "/swimmers", "/status", "/road", "/log"]) {
      expect(viewer).not.toContain(coachHref);
    }
  });

  it("leaves the coach nav unchanged (no /me/* items leak in)", () => {
    const coach = hrefsFor("COACH");
    expect(coach).toContain("/dashboard");
    expect(coach).toContain("/road");
    for (const href of coach) expect(href.startsWith("/me")).toBe(false);
  });

  it("gives the super-user every coach item (superset) and no viewer routes", () => {
    const superUser = hrefsFor("SUPER_USER");
    // Sees the coach tree…
    for (const href of hrefsFor("COACH")) expect(superUser).toContain(href);
    // …and never the viewer-only home.
    for (const href of superUser) expect(href.startsWith("/me")).toBe(false);
  });
});

describe("isRouteAllowed — read-only scoping holds via direct URL", () => {
  it("lets a viewer reach every /me section", () => {
    for (const href of ["/me", "/me/progress", "/me/road", "/me/history"]) {
      expect(isRouteAllowed("VIEWER", href)).toBe(true);
    }
  });

  it("bars a viewer from coach routes (direct URL)", () => {
    for (const href of ["/dashboard", "/status", "/road", "/swimmers/abc"]) {
      expect(isRouteAllowed("VIEWER", href)).toBe(false);
    }
  });

  it("bars a coach from the viewer area (direct URL)", () => {
    for (const href of ["/me", "/me/progress", "/me/road", "/me/history"]) {
      expect(isRouteAllowed("COACH", href)).toBe(false);
    }
    expect(isRouteAllowed("COACH", "/dashboard")).toBe(true);
  });

  it("reserves /admin for the super-user only", () => {
    expect(isRouteAllowed("SUPER_USER", "/admin/clubs")).toBe(true);
    expect(isRouteAllowed("COACH", "/admin/clubs")).toBe(false);
    expect(isRouteAllowed("VIEWER", "/admin/clubs")).toBe(false);
  });

  it("gives the super-user the coach area but not the viewer home", () => {
    expect(isRouteAllowed("SUPER_USER", "/dashboard")).toBe(true);
    expect(isRouteAllowed("SUPER_USER", "/standards")).toBe(true);
    expect(isRouteAllowed("SUPER_USER", "/me")).toBe(false);
  });
});

describe("isLeafActive — Overview doesn't stay lit on its sub-routes", () => {
  const overview: NavLeaf = { label: "Overview", href: "/me", icon: (() => null) as never, exact: true };
  const progress: NavLeaf = { label: "Progress", href: "/me/progress", icon: (() => null) as never };

  it("highlights Overview only on an exact /me match", () => {
    expect(isLeafActive("/me", overview)).toBe(true);
    expect(isLeafActive("/me/progress", overview)).toBe(false);
    expect(isLeafActive("/me/road", overview)).toBe(false);
  });

  it("highlights a sub-route on its own path (and nested children)", () => {
    expect(isLeafActive("/me/progress", progress)).toBe(true);
    expect(isLeafActive("/me", progress)).toBe(false);
  });
});
