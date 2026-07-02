"use client";

import Link from "next/link";
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

import { PageHeader } from "@/components/ui/PageHeader";
import { TargetTierToggle } from "@/components/qualifying/TargetTierToggle";
import { useTargetTier } from "@/lib/useTargetTier";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useGreeting } from "@/lib/useGreeting";
import { trailForHref } from "@/lib/nav";

/*
  Coach home (Step 16). The landing route for a coach after sign-in. Poolside,
  the first job is almost always "log a time", so that is the hero action; below
  it, a calm set of jump-offs into the working surfaces, and the shared target
  tier (BRD §5.10) surfaced here so it is set once and carried into every
  qualifying view. Deliberately not the full squad-analytics overview — that
  lands in a later step; this is a fast, honest home, not a metrics wall.
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
  const [tier, setTier] = useTargetTier();

  // Time-aware greeting as the heading. The breadcrumb still reads "Dashboard"
  // (where you are); the h1 greets by first name at the coach's local time.
  const greeting = useGreeting(profile?.name);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={greeting}
        breadcrumb={trailForHref("/dashboard")}
        description="Log a swim and jump into your squad's readiness. Times you log flow straight into progression, the status matrix and the road to every cut."
      />

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

      {/* Target tier — the shared control (§5.10), set once, used everywhere. */}
      <section className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:flex-row md:items-center md:justify-between md:p-6">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Target tier</h2>
          <p className="mt-1 max-w-[56ch] text-sm text-ink-muted">
            The qualifying meet you&rsquo;re aiming at. Set it once here and it
            frames the status matrix, road to qualify and the progression
            projection. Long course only.
          </p>
        </div>
        <div className="shrink-0 md:pl-6">
          <TargetTierToggle value={tier} onChange={setTier} />
        </div>
      </section>

      <p className="text-xs text-ink-faint">
        A full squad overview — recent bests, who&rsquo;s closest to a cut and
        season movement — arrives in a later step.
      </p>
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
