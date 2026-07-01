"use client";

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
import { isGroupActive, isRouteActive, navForRole, type Role } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { cn } from "@/lib/utils";

/*
  The coach view of the app shell's sidebar (Step 3.6). Collapsible groups with a
  sub-nav; the group containing the active route auto-expands. The single teal
  accent marks the active item and nothing else — idle items are neutral, hover is
  a quiet neutral lift. Built on the shadcn Sidebar primitive; role filtering is
  the `navForRole` seam (VIEWER reduction lands in Step 15).
*/

// Override the primitive's neutral active state with the one teal accent
// (accent-subtle fill + accent-strong text + accent icon). Applied to both the
// top-level menu buttons and the sub-nav buttons so "active" reads identically.
const ACTIVE_TEAL =
  "data-[active=true]:bg-accent-subtle data-[active=true]:text-accent-strong " +
  "data-[active=true]:font-medium data-[active=true]:hover:bg-accent-subtle " +
  "data-[active=true]:hover:text-accent-strong data-[active=true]:[&>svg]:text-accent";

export function AppSidebar() {
  const pathname = usePathname();
  const profile = useCurrentProfile();
  // Assume COACH until the profile resolves (and for the whole of this build).
  const role: Role = profile?.role === "VIEWER" ? "VIEWER" : "COACH";
  const nav = navForRole(role);

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
                <Droplets className="text-accent" />
                <span className="text-base font-semibold tracking-tight text-ink group-data-[collapsible=icon]:hidden">
                  Swim Tracker
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {nav.map((node) => {
              if (node.kind === "item") {
                const active = isRouteActive(pathname, node.href);
                return (
                  <SidebarMenuItem key={node.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={node.label}
                      className={ACTIVE_TEAL}
                    >
                      <Link href={node.href}>
                        <node.icon />
                        <span>{node.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              }

              const groupOpen = isGroupActive(node, pathname);
              return (
                <Collapsible
                  key={node.label}
                  asChild
                  defaultOpen={groupOpen}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={node.label}
                        className={cn(
                          "[&>svg:last-child]:ml-auto [&>svg:last-child]:size-4 [&>svg:last-child]:text-ink-faint [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-[var(--dur-2)] group-data-[state=open]/collapsible:[&>svg:last-child]:rotate-90",
                          // When the whole sidebar is an icon rail, the sub-nav is
                          // hidden — so tint the group icon teal if it holds the
                          // active route, preserving the "you are here" signal. In
                          // expanded mode this is gated off (the child shows teal).
                          groupOpen &&
                            "group-data-[collapsible=icon]:bg-accent-subtle group-data-[collapsible=icon]:text-accent-strong group-data-[collapsible=icon]:[&>svg:first-child]:text-accent"
                        )}
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
                              <SidebarMenuSubButton
                                asChild
                                isActive={active}
                                className={ACTIVE_TEAL}
                              >
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

function SidebarUser({
  profile,
  role,
}: {
  profile: ReturnType<typeof useCurrentProfile>;
  role: Role;
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
            className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-xs font-semibold text-accent-strong"
          >
            {initials || <span className="size-4 rounded-full bg-border" />}
          </span>
          <div className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium text-ink">
              {profile?.name ?? "Loading…"}
            </span>
            <span className="truncate text-xs text-ink-muted">
              {role === "COACH" ? "Coach" : "Viewer"}
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
