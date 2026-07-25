import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Building2,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  LineChart,
  Plane,
  Radar,
  Ruler,
  ScrollText,
  Shield,
  ShieldCheck,
  Target,
  Timer,
  TrendingUp,
  UserCheck,
  Users,
  UsersRound,
  Waves,
} from "lucide-react";

/*
  Navigation IA for the app shell (Step 3.6). Single source of truth for both the
  sidebar and (later) any command palette. Each entry declares an optional `roles`
  allow-list; `navForRole` is the filter seam. As of Step 15 the whole coach tree
  is `roles: ["COACH"]` and the VIEWER sees exactly one calm entry — their own
  swimmer home (`/me`). The sidebar filters here; the server enforces the boundary
  in every query/mutation regardless (see convex/authz.ts).
*/

export type Role = "SUPER_USER" | "COACH" | "VIEWER";

export type NavLeaf = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If present, only these roles see the item. Absent = visible to all roles. */
  roles?: Role[];
  /** Highlight only on an EXACT path match — for a parent route (e.g. /me) that
   *  also has children (/me/progress…), so it doesn't stay lit on every child. */
  exact?: boolean;
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
  roles?: Role[];
};

export type NavNode =
  | ({ kind: "item" } & NavLeaf)
  | ({ kind: "group" } & NavGroup);

// Full coach navigation. Group icons are deliberately distinct from their
// children's (Waves / Gauge / Award) so the collapsed icon rail never shows a
// parent and child with the same glyph.
export const NAV: NavNode[] = [
  // Viewer nav. A read-only mirror of the coach IA, scoped server-side to the
  // viewer's OWN linked swimmer(s): the same Swimmer / Performance / Qualifying
  // shape and the same screens as staff, minus anything that edits. Every route
  // is under /me — the viewer boundary — and each analysis screen has its own
  // in-toolbar swimmer picker, so there is no global "Viewing:" switcher. The
  // request-access flow (/me/find) is reached from the My swimmers screen.
  {
    kind: "group",
    label: "Swimmer",
    icon: Waves,
    roles: ["VIEWER"],
    items: [
      { label: "My swimmers", href: "/me/swimmers", icon: UserCheck },
      { label: "Attendance", href: "/me/attendance", icon: CalendarCheck },
    ],
  },
  {
    kind: "group",
    label: "Performance",
    icon: Gauge,
    roles: ["VIEWER"],
    items: [
      { label: "Comparison", href: "/me/compare", icon: BarChart3 },
      { label: "Progression", href: "/me/progression", icon: LineChart },
      { label: "Stroke profile", href: "/me/stroke-profile", icon: Radar },
      { label: "Season improvement", href: "/me/season", icon: TrendingUp },
    ],
  },
  {
    kind: "group",
    label: "Qualifying",
    icon: Award,
    roles: ["VIEWER"],
    items: [
      { label: "Status matrix", href: "/me/status", icon: Grid3x3 },
      { label: "Road to qualify", href: "/me/road", icon: Target },
      { label: "Tour qualification", href: "/me/qualification", icon: Plane },
      { label: "Standards", href: "/me/standards", icon: Ruler },
    ],
  },
  {
    kind: "item",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["COACH"],
  },
  {
    kind: "group",
    label: "Swimmers",
    icon: Waves,
    roles: ["COACH"],
    items: [
      { label: "Roster", href: "/swimmers", icon: Users },
      { label: "My swimmers", href: "/my-swimmers", icon: UserCheck },
      { label: "Squads", href: "/squads", icon: UsersRound },
      { label: "Log a time", href: "/log", icon: Timer },
    ],
  },
  {
    kind: "group",
    label: "Performance",
    icon: Gauge,
    roles: ["COACH"],
    items: [
      { label: "Comparison", href: "/compare", icon: BarChart3 },
      { label: "Progression", href: "/progression", icon: LineChart },
      { label: "Stroke profile", href: "/stroke-profile", icon: Radar },
      { label: "Season improvement", href: "/season", icon: TrendingUp },
    ],
  },
  {
    kind: "group",
    label: "Qualifying",
    icon: Award,
    roles: ["COACH"],
    items: [
      { label: "Status matrix", href: "/status", icon: Grid3x3 },
      { label: "Road to qualify", href: "/road", icon: Target },
      { label: "Tour qualification", href: "/qualification", icon: Plane },
      { label: "Standards", href: "/standards", icon: Ruler },
    ],
  },
  // Session attendance (§R18). Coach-owned: the calendar (view + mark), the
  // recurring schedule, and season insights. Any club coach manages it; server-
  // enforced club-scoped in every function.
  {
    kind: "group",
    label: "Attendance",
    icon: CalendarDays,
    roles: ["COACH"],
    items: [
      { label: "Calendar", href: "/attendance", icon: CalendarCheck, exact: true },
      { label: "Schedule", href: "/attendance/schedule", icon: CalendarClock },
      { label: "Insights", href: "/attendance/insights", icon: BarChart3 },
    ],
  },
  // Coach-only audit trails (§R17). Read-only history of who did what: viewer
  // access grants/revocations, and time entry/edit provenance. Server-enforced
  // coach-only (requireCoach); viewers never see these (route + query gated).
  {
    kind: "group",
    label: "Audit",
    icon: ScrollText,
    roles: ["COACH"],
    items: [
      { label: "Access log", href: "/audit/access", icon: ShieldCheck },
      { label: "Time-entry log", href: "/audit/times", icon: ClipboardList },
    ],
  },
  // Super-user only (access-control Phase 4). Reserved under /admin, which
  // isRouteAllowed keeps coaches out of.
  {
    kind: "group",
    label: "Admin",
    icon: Shield,
    roles: ["SUPER_USER"],
    items: [
      { label: "Clubs & coaches", href: "/admin/clubs", icon: Building2 },
      { label: "Tour dates", href: "/admin/tours", icon: CalendarDays },
    ],
  },
];

/** The landing route for a role after login / on redirect from a barred route. */
export function homeForRole(role: Role): string {
  return role === "VIEWER" ? "/me/swimmers" : "/dashboard";
}

/** Human label for a role, shown in the shell's user menu. */
export function roleLabel(role: Role): string {
  switch (role) {
    case "SUPER_USER":
      return "Admin";
    case "COACH":
      return "Coach";
    case "VIEWER":
      return "Viewer";
  }
}

/**
 * The route-access boundary, mirrored server-side in every Convex function.
 *   - VIEWER: only their own home (`/me/*`).
 *   - COACH: everything except `/me/*` and the super-user `/admin/*` area.
 *   - SUPER_USER: everything except `/me/*` (they own `/admin/*` too).
 * `/me` is exclusively the viewer's, so staff landing there is bounced home.
 * Deny-by-default: a brand-new coach route is coach-visible, a new `/admin`
 * route is super-user-only, and a new viewer route opts in via `roles` below.
 */
export function isRouteAllowed(role: Role, pathname: string): boolean {
  const underViewerHome = pathname === "/me" || pathname.startsWith("/me/");
  const underAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (role === "VIEWER") return underViewerHome;
  if (role === "SUPER_USER") return !underViewerHome;
  return !underViewerHome && !underAdmin; // COACH
}

/**
 * Whether `role` may see a nav node with the given `roles` allow-list. A
 * SUPER_USER is a superset of a coach, so they see every coach item too (but
 * never viewer-only items, which live under the viewer's `/me` home).
 */
function allowed(roles: Role[] | undefined, role: Role): boolean {
  if (!roles) return true;
  if (roles.includes(role)) return true;
  return role === "SUPER_USER" && roles.includes("COACH");
}

/**
 * Filter the nav for a role. Drops role-gated leaves the role can't see, then
 * drops any group left with no visible items. Coach gets the full tree.
 */
export function navForRole(role: Role): NavNode[] {
  const out: NavNode[] = [];
  for (const node of NAV) {
    if (!allowed(node.roles, role)) continue;
    if (node.kind === "item") {
      out.push(node);
      continue;
    }
    const items = node.items.filter((it) => allowed(it.roles, role));
    if (items.length > 0) out.push({ ...node, items });
  }
  return out;
}

/** True when `pathname` is within `href` (exact, or a nested route under it). */
export function isRouteActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

/** Active state for a nav leaf, honouring its `exact` flag (parent routes). */
export function isLeafActive(pathname: string, leaf: NavLeaf): boolean {
  return leaf.exact ? pathname === leaf.href : isRouteActive(pathname, leaf.href);
}

/** A group is "active" (auto-expanded) when any of its items matches the route. */
export function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((it) => isRouteActive(pathname, it.href));
}

export type Crumb = { label: string; href?: string };

/**
 * Build a PageHeader breadcrumb trail for a nav href, derived from the IA so it
 * stays in sync with the sidebar. Dashboard is the root; grouped pages read
 * "Dashboard / <Group> / <Page>" with the group as a non-link middle crumb.
 */
export function trailForHref(href: string): Crumb[] {
  // Viewer area: rooted at "My swimmers" (the viewer's home), mirroring the
  // coach Dashboard root. Grouped pages read "My swimmers / <Group> / <Page>".
  if (href === "/me" || href.startsWith("/me/")) {
    const root: Crumb = { label: "My swimmers", href: "/me/swimmers" };
    if (href === "/me/swimmers") return [{ label: "My swimmers" }];
    for (const node of NAV) {
      if (node.roles && !node.roles.includes("VIEWER")) continue;
      if (node.kind === "item" && node.href === href) {
        return [root, { label: node.label }];
      }
      if (node.kind === "group") {
        const item = node.items.find((it) => it.href === href);
        if (item) return [root, { label: node.label }, { label: item.label }];
      }
    }
    return [root, { label: leafForHref(href)?.label ?? href }];
  }

  const root: Crumb = { label: "Dashboard", href: "/dashboard" };
  if (href === "/dashboard") return [{ label: "Dashboard" }];

  for (const node of NAV) {
    if (node.kind === "item" && node.href === href) {
      return [root, { label: node.label }];
    }
    if (node.kind === "group") {
      const item = node.items.find((it) => it.href === href);
      if (item) return [root, { label: node.label }, { label: item.label }];
    }
  }
  return [root, { label: href }];
}

/** The page title for an href (the item's own label), for PageHeader. */
export function titleForHref(href: string): string {
  const trail = trailForHref(href);
  return trail[trail.length - 1]?.label ?? href;
}

/** The nav leaf (label + icon) for an href, if any. */
export function leafForHref(href: string): NavLeaf | undefined {
  for (const node of NAV) {
    if (node.kind === "item" && node.href === href) return node;
    if (node.kind === "group") {
      const it = node.items.find((i) => i.href === href);
      if (it) return it;
    }
  }
  return undefined;
}
