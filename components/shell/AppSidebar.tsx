"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FocusEvent as ReactFocusEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Droplets, LogOut, PanelLeftClose } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  isGroupActive,
  isLeafActive,
  isRouteActive,
  navForRole,
  type NavGroup,
  type Role,
} from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { cn } from "@/lib/utils";

/*
  The coach view of the app shell's sidebar (Step 3.6). Collapsible groups with a
  sub-nav; the group containing the active route auto-expands. The single brand
  accent marks the active item and nothing else — idle items are neutral, hover is
  a quiet neutral lift. Built on the shadcn Sidebar primitive; role filtering is
  the `navForRole` seam (VIEWER reduction lands in Step 15).
*/

// Override the primitive's neutral active state with the one brand accent
// (brand-50 fill + brand-500 text + brand-500 icon), per DESIGN.md §5. Applied to
// both the top-level menu buttons and the sub-nav buttons so "active" reads
// identically. Inactive items stay gray-700 with a quiet gray-100 hover.
const ACTIVE_BRAND =
  "text-gray-700 data-[active=true]:bg-brand-50 data-[active=true]:text-brand-500 " +
  "data-[active=true]:font-medium data-[active=true]:hover:bg-brand-50 " +
  "data-[active=true]:hover:text-brand-500 data-[active=true]:[&>svg]:text-brand-500";

export function AppSidebar() {
  const pathname = usePathname();
  const profile = useCurrentProfile();
  // Role drives which nav a user sees. While the profile is still resolving the
  // role is unknown, so we render NO items rather than guess COACH — a viewer
  // must never see the coach tree flash by (the content is held by RoleGuard).
  const role: Role | undefined =
    profile === undefined
      ? undefined
      : profile?.role === "VIEWER"
        ? "VIEWER"
        : "COACH";
  const nav = role ? navForRole(role) : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              size="lg"
              tooltip="Swim Tracker"
              className="hover:bg-transparent active:bg-transparent"
            >
              <Link href="/dashboard">
                <Droplets className="text-brand-500" />
                <span className="text-base font-semibold tracking-tight text-gray-800 group-data-[collapsible=icon]:hidden">
                  Swim Tracker
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="custom-scrollbar">
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((node) => {
              if (node.kind === "item") {
                const active = isLeafActive(pathname, node);
                return (
                  <SidebarMenuItem key={node.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={node.label}
                      className={ACTIVE_BRAND}
                    >
                      <Link href={node.href}>
                        <node.icon />
                        <span>{node.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              return <GroupNav key={node.label} node={node} pathname={pathname} />;
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator className="mx-0" />
        <SidebarUser profile={profile} role={role} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

// ---------------------------------------------------------------------------
// Groups — inline collapsible when expanded (or in the mobile sheet); a floating
// rail flyout when the sidebar is the collapsed icon rail (Step R10).
// ---------------------------------------------------------------------------

function GroupNav({ node, pathname }: { node: NavGroup; pathname: string }) {
  const { state, isMobile } = useSidebar();
  // The icon rail only exists on desktop; the mobile sheet always renders the
  // full-width expanded tree, so it keeps the inline collapsible.
  const collapsed = state === "collapsed" && !isMobile;
  return collapsed ? (
    <RailFlyoutGroup node={node} pathname={pathname} />
  ) : (
    <InlineGroup node={node} pathname={pathname} />
  );
}

function InlineGroup({ node, pathname }: { node: NavGroup; pathname: string }) {
  const groupOpen = isGroupActive(node, pathname);
  return (
    <Collapsible asChild defaultOpen={groupOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className="text-gray-700 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-4 [&>svg:last-child]:text-gray-400 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-[var(--dur-2)] group-data-[state=open]/collapsible:[&>svg:last-child]:rotate-90"
          >
            <node.icon />
            <span>{node.label}</span>
            <ChevronRight />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub>
            {node.items.map((item) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <SidebarMenuSubItem key={item.href}>
                  <SidebarMenuSubButton asChild isActive={active} className={ACTIVE_BRAND}>
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

/*
  Collapsed-rail flyout. A group's icon can't reveal its children inline on the
  32px rail, so hovering OR keyboard-focusing it opens a floating panel to the
  right listing every sub-item as a clickable row. The trigger is a button with
  aria-haspopup/-expanded/-controls; the panel is an aria-labelled role="menu" of
  roving-tabindex menuitems, portalled to <body> so the rail's overflow-hidden
  never clips it. Keyboard: ↑/↓ roves the rows, Home/End jump, Esc / ← / Tab
  return to the trigger; hover keeps it open across the small gap. The entrance
  (fade + short slide) is zeroed by the global prefers-reduced-motion rule.
*/
function RailFlyoutGroup({ node, pathname }: { node: NavGroup; pathname: string }) {
  const groupActive = isGroupActive(node, pathname);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const wrapRef = useRef<HTMLLIElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelId = useId();

  // The portal only renders once `open` is true, which happens solely from client
  // pointer/focus handlers — so document.body is never touched during SSR.
  const triggerEl = () =>
    wrapRef.current?.querySelector<HTMLElement>('[data-sidebar="menu-button"]') ?? null;

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }
  function openFlyout(focus?: "first" | "last") {
    cancelClose();
    const el = triggerEl();
    if (el) {
      const r = el.getBoundingClientRect();
      // Keep the panel on-screen: a group near the rail's bottom would otherwise
      // spill below the viewport (≤4 short rows, so an estimate is enough).
      const estH = node.items.length * 36 + 44;
      const top = Math.max(8, Math.min(r.top, window.innerHeight - estH - 8));
      setPos({ top, left: r.right + 8 });
    }
    setOpen(true);
    if (focus) {
      // The panel may mount this commit; rAF runs after it, so the rows exist.
      requestAnimationFrame(() => {
        const list = items();
        (focus === "last" ? list[list.length - 1] : list[0])?.focus();
      });
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }
  function closeAndReturn() {
    cancelClose();
    setOpen(false);
    triggerEl()?.focus();
  }

  const items = () =>
    itemRefs.current.filter((el): el is HTMLAnchorElement => el !== null);

  // Position is captured on open; a scroll or resize invalidates it, so dismiss.
  useEffect(() => {
    if (!open) return;
    const drop = () => setOpen(false);
    window.addEventListener("scroll", drop, true);
    window.addEventListener("resize", drop);
    return () => {
      window.removeEventListener("scroll", drop, true);
      window.removeEventListener("resize", drop);
    };
  }, [open]);

  function onTriggerKeyDown(e: ReactKeyboardEvent) {
    if (["ArrowRight", "ArrowDown", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openFlyout("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openFlyout("last");
    }
  }
  function onPanelKeyDown(e: ReactKeyboardEvent) {
    const list = items();
    if (list.length === 0) return;
    const i = list.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1 + list.length) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Escape" || e.key === "ArrowLeft" || e.key === "Tab") {
      // Tab exits back to the trigger so focus order stays sane despite the portal.
      e.preventDefault();
      closeAndReturn();
    }
  }
  function onBlurCapture(e: ReactFocusEvent) {
    const next = e.relatedTarget as Node | null;
    if (next && (wrapRef.current?.contains(next) || panelRef.current?.contains(next))) return;
    setOpen(false);
  }

  return (
    <li
      ref={wrapRef}
      className="group/menu-item relative"
      onMouseEnter={() => openFlyout()}
      onMouseLeave={scheduleClose}
      onFocusCapture={() => openFlyout()}
      onBlurCapture={onBlurCapture}
    >
      <SidebarMenuButton
        isActive={groupActive}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onKeyDown={onTriggerKeyDown}
        className={ACTIVE_BRAND}
      >
        <node.icon />
        <span className="sr-only">{node.label}</span>
      </SidebarMenuButton>

      {/* "Has children" cue on the rail icon — a small chevron pinned to the edge,
          brand-tinted when a child route is active. */}
      <ChevronRight
        aria-hidden
        strokeWidth={2.5}
        className={cn(
          "pointer-events-none absolute right-0.5 top-1/2 size-2.5 -translate-y-1/2",
          groupActive ? "text-brand-500" : "text-gray-400",
        )}
      />

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="menu"
            aria-label={node.label}
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            className="z-50 min-w-[13rem] max-w-[15rem] rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-theme-md outline-none animate-in fade-in-0 slide-in-from-left-2 [animation-duration:var(--dur-1)]"
            onMouseEnter={cancelClose}
            onMouseLeave={scheduleClose}
            onKeyDown={onPanelKeyDown}
          >
            <p className="px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-ink-faint">
              {node.label}
            </p>
            {node.items.map((item, i) => {
              const active = isRouteActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  href={item.href}
                  role="menuitem"
                  // Roving tabindex: the menu has one entry point (arrow in from
                  // the trigger); Tab never stops on individual rows.
                  tabIndex={-1}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none transition-colors [transition-duration:var(--dur-1)]",
                    active
                      ? "bg-brand-50 font-medium text-brand-500"
                      : "text-gray-700 hover:bg-brand-50 hover:text-brand-500 focus:bg-brand-50 focus:text-brand-500",
                  )}
                >
                  <item.icon
                    aria-hidden
                    className={cn("size-4 shrink-0", active ? "text-brand-500" : "text-gray-400")}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>,
          document.body,
        )}
    </li>
  );
}

function SidebarUser({
  profile,
  role,
}: {
  profile: ReturnType<typeof useCurrentProfile>;
  role: Role | undefined;
}) {
  const { signOut } = useAuthActions();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  const initials =
    profile?.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "";

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Rail collapse toggle — pairs with Cmd/Ctrl+B and the draggable rail. */}
        <SidebarMenuButton
          onClick={toggleSidebar}
          tooltip="Collapse sidebar"
          className="text-ink-muted hover:text-ink"
        >
          <PanelLeftClose />
          <span>Collapse</span>
        </SidebarMenuButton>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <div className="flex items-center gap-2 rounded-md p-2 group-data-[collapsible=icon]:p-0">
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-500"
          >
            {initials || <span className="size-4 rounded-full bg-gray-200" />}
          </span>
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium text-ink">
              {profile?.name ?? "Loading…"}
            </span>
            <span className="truncate text-xs text-ink-muted">
              {role ? (role === "COACH" ? "Coach" : "Viewer") : ""}
              {profile?.email ? ` · ${profile.email}` : ""}
            </span>
          </div>
        </div>
      </SidebarMenuItem>

      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="Sign out"
          className="text-ink-muted hover:text-ink"
          onClick={async () => {
            await signOut();
            router.push("/login");
          }}
        >
          <LogOut />
          <span>Sign out</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
