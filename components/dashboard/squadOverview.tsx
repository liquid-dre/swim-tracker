"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  ListChecks,
  Timer,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { api } from "@/convex/_generated/api";
import { buttonClasses } from "@/components/ui/Button";
import { TierBadge } from "@/components/ui/TierBadge";
import { formatTime } from "@/lib/swim";
import { formatSeconds } from "@/lib/format";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { cn } from "@/lib/utils";

/*
  Coach dashboard squad overview (the vibrance revamp). Four headline counts and
  a roster "top event" table with trend sparklines, all fed by one derived read
  (convex/dashboard.getCoachDashboard). Data discipline lives server-side; this
  file is presentational — tabular times, tier badges (colour + label), and a
  trend colour (green improving / grey flat) kept deliberately separate from the
  tier palette so the two never blur.
*/

export type DashboardData = FunctionReturnType<typeof api.dashboard.getCoachDashboard>;

const NEXT_TIER_SHORT: Record<"LEVEL_2" | "LEVEL_3" | "SANJ", string> = {
  LEVEL_2: "L2",
  LEVEL_3: "L3",
  SANJ: "SANJ",
};

// ---------------------------------------------------------------------------
// Stat cards
// ---------------------------------------------------------------------------

export function SquadStats({ data }: { data: DashboardData | undefined }) {
  if (data === undefined) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-busy>
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[92px] animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm"
          />
        ))}
      </div>
    );
  }

  const { counts, setup } = data;

  // A brand-new coach gets a guided setup thread instead of a wall of zeros —
  // the three steps below are the dependency chain the whole app hangs off.
  if (counts.swimmers === 0 || !setup.hasStandards || !setup.hasResults) {
    return (
      <FirstRunChecklist
        hasSwimmers={counts.swimmers > 0}
        hasStandards={setup.hasStandards}
        hasResults={setup.hasResults}
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard label="Swimmers" value={counts.swimmers} sub="on the active roster" />
      <StatCard
        label="PBs this week"
        value={counts.pbsThisWeek}
        sub="new bests, last 7 days"
        tone={counts.pbsThisWeek > 0 ? "up" : "muted"}
      />
      <StatCard
        label="Cuts qualified"
        value={counts.cutsQualified}
        sub="across the squad"
      />
      <StatCard
        label="Close to a cut"
        value={counts.closeToCut}
        sub="within 1.0s of a cut"
        tone={counts.closeToCut > 0 ? "warn" : "muted"}
      />
    </div>
  );
}

function FirstRunChecklist({
  hasSwimmers,
  hasStandards,
  hasResults,
}: {
  hasSwimmers: boolean;
  hasStandards: boolean;
  hasResults: boolean;
}) {
  const steps: Array<{
    done: boolean;
    href: string;
    label: string;
    desc: string;
    icon: LucideIcon;
  }> = [
    {
      done: hasSwimmers,
      href: "/swimmers",
      label: "Add your swimmers",
      desc: "Name, date of birth and gender — ages drive every cut lookup.",
      icon: Users,
    },
    {
      done: hasStandards,
      href: "/standards",
      label: "Import the qualifying standards",
      desc: "One CSV import fills in every tier, gap and status across the app.",
      icon: ListChecks,
    },
    {
      done: hasResults,
      href: "/log",
      label: "Log your first time",
      desc: "Meet times set PBs; trials and practice are tracked but never count.",
      icon: Timer,
    },
  ];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm sm:p-6">
      <h2 className="text-md font-semibold text-ink">Set up your squad</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Three steps, in order — then this space becomes your live squad overview.
      </p>
      <ol className="mt-4 flex flex-col divide-y divide-gray-100">
        {steps.map((s) => {
          const rowBody = (
            <>
              {s.done ? (
                <CheckCircle2
                  aria-hidden
                  className="size-5 shrink-0 text-success-ink"
                  strokeWidth={1.75}
                />
              ) : (
                <Circle
                  aria-hidden
                  className="size-5 shrink-0 text-ink-faint"
                  strokeWidth={1.75}
                />
              )}
              <div className="min-w-0 flex-1">
                <span
                  className={cn(
                    "text-sm font-medium",
                    s.done ? "text-ink-muted" : "text-ink",
                  )}
                >
                  {s.label}
                  {s.done && (
                    <span className="ml-2 text-xs font-medium text-success-ink">
                      Done
                    </span>
                  )}
                </span>
                <p className="mt-0.5 text-xs text-ink-muted">{s.desc}</p>
              </div>
              {!s.done && (
                <ArrowRight
                  aria-hidden
                  className="size-4 shrink-0 text-ink-faint transition-transform [transition-duration:var(--dur-1)] group-hover:translate-x-0.5 group-hover:text-brand-500"
                />
              )}
            </>
          );
          return (
            <li key={s.href}>
              {/* Completed steps drop the link: only what still needs doing
                  reads (and acts) as tappable — a done-row mis-tap on a phone
                  would navigate away from the remaining steps. */}
              {s.done ? (
                <div className="flex items-center gap-3 px-1 py-3">{rowBody}</div>
              ) : (
                <Link
                  href={s.href}
                  className="group flex items-center gap-3 rounded-lg px-1 py-3 outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {rowBody}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: number;
  sub: string;
  tone?: "up" | "warn" | "muted";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-theme-sm sm:p-5">
      <div className="text-xs font-medium text-ink-muted">{label}</div>
      <div className="mt-1.5 text-2xl font-bold leading-none tracking-tight text-ink tabular-nums">
        <CountUp value={value} />
      </div>
      <div
        className={cn(
          "mt-1.5 text-xs font-medium",
          tone === "up" && "text-success-ink",
          tone === "warn" && "text-warning-ink",
          tone === "muted" && "text-ink-faint",
        )}
      >
        {sub}
      </div>
    </div>
  );
}

/** Ease-out count from 0 → value on mount; instant under reduced motion. */
function CountUp({ value }: { value: number }) {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) return; // render `value` directly — no state animation
    const start = performance.now();
    const dur = 650;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      setDisplay(Math.round((1 - Math.pow(1 - p, 3)) * value));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, reduced]);

  return <>{reduced ? value : display}</>;
}

// ---------------------------------------------------------------------------
// Roster · top event
// ---------------------------------------------------------------------------

export function RosterOverview({ data }: { data: DashboardData | undefined }) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          Roster · top event
        </h2>
        <Link
          href="/status"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-500 outline-none transition-colors [transition-duration:var(--dur-1)] hover:text-brand-600 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Status matrix
          <ArrowRight aria-hidden className="size-3.5" />
        </Link>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        {data === undefined ? (
          <div className="h-64 animate-pulse bg-surface-2/40" aria-busy />
        ) : data.roster.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span
              aria-hidden
              className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-500"
            >
              <Users className="size-5" strokeWidth={1.75} />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-ink">No active swimmers yet</p>
              <p className="mx-auto max-w-[42ch] text-sm text-ink-muted">
                Add swimmers to your roster and their bests, tiers and trends will
                appear here.
              </p>
            </div>
            <Link href="/swimmers" className={cn("mt-1", buttonClasses("primary", "md"))}>
              Go to roster
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Swimmer</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Top event</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">PB</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Trend</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Best tier</th>
                </tr>
              </thead>
              <tbody>
                {data.roster.map((r) => (
                  <RosterRow key={r.swimmerId} row={r} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function RosterRow({ row }: { row: DashboardData["roster"][number] }) {
  const { top } = row;
  const isClose =
    top?.gapMs != null && top.gapMs > 0 && top.gapMs <= 1000 && top.nextTier != null;

  return (
    <tr className="border-b border-gray-100 transition-colors [transition-duration:var(--dur-1)] last:border-0 hover:bg-aqua-50/60">
      <td className="px-4 py-2.5 sm:px-5">
        <Link
          href={`/swimmers/${row.swimmerId}`}
          className="group inline-flex items-center gap-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <Avatar name={row.name} />
          <span className="font-medium text-ink group-hover:text-brand-600">
            {row.name}
          </span>
        </Link>
      </td>
      <td className="px-4 py-2.5 text-ink-muted">
        {top ? `${top.label} LCM` : <span className="text-ink-faint">—</span>}
      </td>
      <td className="px-4 py-2.5 text-right">
        {top ? (
          <span className="time tnum text-ink">{formatTime(top.pbMs)}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        {top ? (
          <Sparkline points={top.trend} />
        ) : (
          <span className="text-xs text-ink-faint">no meet time</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex flex-col items-start gap-0.5">
          <TierBadge tier={top?.tier ?? "NONE"} />
          {isClose && (
            <span className="text-2xs font-medium tabular-nums text-warning-ink">
              {formatSeconds(top!.gapMs as number)}s to {NEXT_TIER_SHORT[top!.nextTier!]}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Presentational atoms
// ---------------------------------------------------------------------------

function Avatar({ name }: { name: string }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-600"
    >
      {initials}
    </span>
  );
}

/*
  Trend of recent MEET times. Faster (lower ms) sits HIGHER, so an improving
  swimmer's line rises to the right; the stroke is green when the latest time is
  at or under the earliest (improving), grey otherwise. Colour here means TREND
  only — never a tier. A single point renders as a dot.
*/
function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) {
    return <span className="text-xs text-ink-faint">—</span>;
  }
  const improving = points[points.length - 1] <= points[0];
  const stroke = improving
    ? "var(--color-success-500)"
    : "var(--color-gray-400)";
  const label = improving ? "Improving trend" : "Flat or slower trend";

  const w = 64;
  const h = 20;
  const pad = 2;

  if (points.length === 1) {
    return (
      <svg width={w} height={h} role="img" aria-label={label} className="block">
        <circle cx={w / 2} cy={h / 2} r={2.5} fill={stroke} />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = (w - pad * 2) / (points.length - 1);
  const coords = points
    .map((t, i) => {
      const x = pad + i * step;
      const y = pad + ((t - min) / range) * (h - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} role="img" aria-label={label} className="block">
      <polyline
        points={coords}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
