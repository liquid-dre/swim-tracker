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
                const active = isRouteActive(pathname, node.href);
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
                          "text-gray-700 [&>svg:last-child]:ml-auto [&>svg:last-child]:size-4 [&>svg:last-child]:text-gray-400 [&>svg:last-child]:transition-transform [&>svg:last-child]:duration-[var(--dur-2)] group-data-[state=open]/collapsible:[&>svg:last-child]:rotate-90",
                          // When the whole sidebar is an icon rail, the sub-nav is
                          // hidden — so tint the group icon brand if it holds the
                          // active route, preserving the "you are here" signal. In
                          // expanded mode this is gated off (the child shows brand).
                          groupOpen &&
                            "group-data-[collapsible=icon]:bg-brand-50 group-data-[collapsible=icon]:text-brand-500 group-data-[collapsible=icon]:[&>svg:first-child]:text-brand-500"
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
                                className={ACTIVE_BRAND}
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
