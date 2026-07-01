import type { LucideIcon } from "lucide-react";
import {
  Award,
  BarChart3,
  Gauge,
  Grid3x3,
  LayoutDashboard,
  LineChart,
  Ruler,
  Target,
  Timer,
  TrendingUp,
  Users,
  UsersRound,
  Waves,
} from "lucide-react";

/*
  Navigation IA for the app shell (Step 3.6). Single source of truth for both the
  sidebar and (later) any command palette. Each entry declares an optional `roles`
  allow-list; `navForRole` is the filter seam. Today everything is COACH; in Step
  15 VIEWER collapses to its reduced set purely by this filter — no component edits.
*/

export type Role = "COACH" | "VIEWER";

export type NavLeaf = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If present, only these roles see the item. Absent = visible to all roles. */
  roles?: Role[];
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
  { kind: "item", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  {
    kind: "group",
    label: "Swimmers",
    icon: Waves,
    items: [
      { label: "Roster", href: "/swimmers", icon: Users },
      { label: "Squads", href: "/squads", icon: UsersRound },
      { label: "Log a time", href: "/log", icon: Timer },
    ],
  },
  {
    kind: "group",
    label: "Performance",
    icon: Gauge,
    items: [
      { label: "Comparison", href: "/compare", icon: BarChart3 },
      { label: "Progression", href: "/progression", icon: LineChart },
      { label: "Season improvement", href: "/season", icon: TrendingUp },
    ],
  },
  {
    kind: "group",
    label: "Qualifying",
    icon: Award,
    items: [
      { label: "Status matrix", href: "/status", icon: Grid3x3 },
      { label: "Road to qualify", href: "/road", icon: Target },
      { label: "Standards", href: "/standards", icon: Ruler, roles: ["COACH"] },
    ],
  },
];

function allowed(roles: Role[] | undefined, role: Role): boolean {
  return !roles || roles.includes(role);
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
