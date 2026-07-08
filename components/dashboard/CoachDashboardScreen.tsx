"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  BarChart3,
  Grid3x3,
  LineChart,
  Target,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { SquadStats, RosterOverview } from "@/components/dashboard/squadOverview";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useGreeting } from "@/lib/useGreeting";
import { trailForHref } from "@/lib/nav";

/*
  Coach home (Step 16, extended in the vibrance revamp). The landing route for a
  coach after sign-in. It now opens with a live squad read — four headline counts
  and a roster "top event" table with trend sparklines (convex/dashboard) — then
  the poolside hero action, "log a time", and a calm set of jump-offs into the
  working surfaces. Still honest, not a metrics wall: every number is derived by
  the same rules as the rest of the app (meet-only PBs, exact-age LCM cuts).
*/

type Shortcut = {
  href: string;
  label: string;
  desc: string;
  icon: LucideIcon;
};

// The coach's day-to-day surfaces, in the order a session tends to flow:
// who's ready → who's closest → trajectory → season → the standards behind it.
const SHORTCUTS: Shortcut[] = [
  { href: "/swimmers", label: "Roster", desc: "Swimmers, ages and squads.", icon: Users },
  { href: "/status", label: "Status matrix", desc: "Who's ready for what, per event.", icon: Grid3x3 },
  { href: "/road", label: "Road to qualify", desc: "Gap to the cut for one swimmer.", icon: Target },
  { href: "/progression", label: "Progression", desc: "Times over the season, per event.", icon: LineChart },
  { href: "/season", label: "Season improvement", desc: "Who has dropped the most time.", icon: TrendingUp },
  { href: "/compare", label: "Comparison", desc: "Rank an event across the squad.", icon: BarChart3 },
];

export function CoachDashboardScreen() {
  const profile = useCurrentProfile();

  // Time-aware greeting as the heading. The breadcrumb still reads "Dashboard"
  // (where you are); the h1 greets by first name at the coach's local time.
  const greeting = useGreeting(profile?.name);

  // Stamp this visit ONCE and hold the previous visit in state — the anchor
  // for "since you were last here". State (not the live profile field) keeps
  // the window stable while the reactive query refreshes; the ref guards
  // strict-mode's double effect from stamping twice and zeroing the window.
  const beginSession = useMutation(api.profiles.beginSession);
  const [digestSince, setDigestSince] = useState<number | null | undefined>(
    undefined,
  );
  const stamped = useRef(false);
  useEffect(() => {
    if (stamped.current) return;
    stamped.current = true;
    void beginSession({}).then(setDigestSince).catch(() => setDigestSince(null));
  }, [beginSession]);

  // The squad overview — one derived read, coach-scoped server-side.
  const dashboard = useQuery(api.dashboard.getCoachDashboard, {
    digestSince: digestSince ?? undefined,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        variant="water"
        title={greeting}
        breadcrumb={trailForHref("/dashboard")}
        description="Log a swim and jump into your squad's readiness. Times you log flow straight into progression, the status matrix and the road to every cut."
      />

      {/* What changed while the coach was away — one calm, specific line.
          Silent when nothing happened; never a placeholder. */}
      {dashboard?.digest &&
        (dashboard.digest.swimsLogged > 0 ||
          dashboard.digest.newPbSwimmers.length > 0) && (
          <p className="rounded-lg bg-surface-2 px-4 py-2.5 text-sm text-ink-muted">
            Since your last visit:{" "}
            {[
              dashboard.digest.newPbSwimmers.length > 0 &&
                `${dashboard.digest.newPbSwimmers.length} new lifetime ${
                  dashboard.digest.newPbSwimmers.length === 1 ? "best" : "bests"
                } (${dashboard.digest.newPbSwimmers.slice(0, 3).join(", ")}${
                  dashboard.digest.newPbSwimmers.length > 3
                    ? ` +${dashboard.digest.newPbSwimmers.length - 3} more`
                    : ""
                })`,
              `${dashboard.digest.swimsLogged} ${
                dashboard.digest.swimsLogged === 1 ? "swim" : "swims"
              } logged`,
            ]
              .filter(Boolean)
              .join(" · ")}
            .
          </p>
        )}

      {/* Squad at a glance — headline counts across the roster. */}
      <SquadStats data={dashboard} />

      {/* Hero — log a time. The one action a coach reaches for most, poolside. */}
      <section className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-500"
          >
            <Timer className="size-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-md font-semibold text-ink">Log a time</h2>
            <p className="mt-1 max-w-[52ch] text-sm text-ink-muted">
              Record a meet, trial or practice swim. The form keeps your last meet
              and date, so entering a whole heat stays fast.
            </p>
          </div>
        </div>
        <Link
          href="/log"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 text-base font-medium text-white shadow-theme-xs outline-none transition-[background-color,transform] [transition-duration:var(--dur-1)] [transition-timing-function:var(--ease-standard)] hover:bg-brand-600 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98]"
        >
          <Timer className="size-4" aria-hidden />
          Log a time
        </Link>
      </section>

      {/* Roster · top event — one representative event per swimmer, with trend. */}
      <RosterOverview data={dashboard} />

      {/* Jump to — the working surfaces, one calm tile each. */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-ink-muted">Jump to</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SHORTCUTS.map((s) => (
            <li key={s.href}>
              <ShortcutCard {...s} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ShortcutCard({ href, label, desc, icon: Icon }: Shortcut) {
  return (
    <Link
      href={href}
      className="group flex h-full items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-300 hover:shadow-theme-md focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted transition-colors [transition-duration:var(--dur-1)] group-hover:bg-brand-50 group-hover:text-brand-500"
      >
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-ink">{label}</span>
          <ArrowRight
            aria-hidden
            className="size-3.5 text-ink-faint transition-transform [transition-duration:var(--dur-1)] group-hover:translate-x-0.5 group-hover:text-brand-500"
          />
        </div>
        <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>
      </div>
    </Link>
  );
}
