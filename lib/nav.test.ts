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

describe("navForRole — role decides which nav renders", () => {
  it("gives a viewer the coach-mirroring IA, scoped under /me", () => {
    expect(hrefsFor("VIEWER")).toEqual([
      "/me/swimmers",
      "/me/attendance",
      "/me/compare",
      "/me/progression",
      "/me/stroke-profile",
      "/me/season",
      "/me/status",
      "/me/road",
      "/me/qualification",
      "/me/standards",
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

  it("gives a coach the attendance surface but not the viewer calendar", () => {
    const coach = hrefsFor("COACH");
    expect(coach).toContain("/attendance");
    expect(coach).toContain("/attendance/schedule");
    expect(coach).toContain("/attendance/insights");
    expect(coach).not.toContain("/me/attendance");
  });

  it("gives the super-user every coach item (superset) and no viewer routes", () => {
    const superUser = hrefsFor("SUPER_USER");
    // Sees the coach tree…
    for (const href of hrefsFor("COACH")) expect(superUser).toContain(href);
    // …and never the viewer-only area.
    for (const href of superUser) expect(href.startsWith("/me")).toBe(false);
  });
});

describe("isRouteAllowed — read-only scoping holds via direct URL", () => {
  it("lets a viewer reach every /me section (nav + the request-access flow)", () => {
    for (const href of [
      "/me/swimmers",
      "/me/swimmers/abc",
      "/me/compare",
      "/me/status",
      "/me/road",
      "/me/standards",
      "/me/find",
    ]) {
      expect(isRouteAllowed("VIEWER", href)).toBe(true);
    }
  });

  it("bars a viewer from coach routes (direct URL)", () => {
    for (const href of ["/dashboard", "/status", "/road", "/swimmers/abc"]) {
      expect(isRouteAllowed("VIEWER", href)).toBe(false);
    }
  });

  it("bars a coach from the viewer area (direct URL)", () => {
    for (const href of ["/me", "/me/swimmers", "/me/compare", "/me/status"]) {
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

describe("isLeafActive — a leaf lights on its own path and nested children", () => {
  const mySwimmers: NavLeaf = {
    label: "My swimmers",
    href: "/me/swimmers",
    icon: (() => null) as never,
  };
  const compare: NavLeaf = {
    label: "Comparison",
    href: "/me/compare",
    icon: (() => null) as never,
  };

  it("highlights My swimmers on its path and on a swimmer profile beneath it", () => {
    expect(isLeafActive("/me/swimmers", mySwimmers)).toBe(true);
    expect(isLeafActive("/me/swimmers/abc", mySwimmers)).toBe(true);
    expect(isLeafActive("/me/compare", mySwimmers)).toBe(false);
  });

  it("highlights a sibling section only on its own path", () => {
    expect(isLeafActive("/me/compare", compare)).toBe(true);
    expect(isLeafActive("/me/swimmers", compare)).toBe(false);
  });
});
