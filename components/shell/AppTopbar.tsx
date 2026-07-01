"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { type Role } from "@/lib/nav";
import { useCurrentProfile } from "@/lib/useCurrentProfile";

/*
  Slim top bar (Step 3.6). Left: the off-canvas sidebar trigger, mobile only (on
  desktop the rail, Cmd/Ctrl+B, and the footer control handle collapse). Right: a
  compact user menu so sign-out is reachable on mobile without opening the drawer.
  Each page renders its own <PageHeader> breadcrumb in the content area below.
*/
export function AppTopbar() {
  const profile = useCurrentProfile();
  const role: Role = profile?.role === "VIEWER" ? "VIEWER" : "COACH";
  const { signOut } = useAuthActions();
  const router = useRouter();

  const initials =
    profile?.name
      ?.split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "";

  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
      <SidebarTrigger className="md:hidden" />

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Account menu"
          >
            <span
              aria-hidden
              className="flex size-7 items-center justify-center rounded-md bg-accent-subtle text-xs font-semibold text-accent-strong"
            >
              {initials || <span className="size-3.5 rounded-full bg-border" />}
            </span>
            <span className="hidden max-w-40 truncate font-medium text-ink sm:inline">
              {profile?.name ?? "Account"}
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <span className="block truncate text-sm font-medium text-ink">
                {profile?.name ?? "Signed in"}
              </span>
              <span className="block truncate text-xs text-ink-muted">
                {role === "COACH" ? "Coach" : "Viewer"}
                {profile?.email ? ` · ${profile.email}` : ""}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
