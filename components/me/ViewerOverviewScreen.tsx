"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, LineChart, ListOrdered, Target } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { useCurrentProfile } from "@/lib/useCurrentProfile";
import { useGreeting } from "@/lib/useGreeting";
import { useTargetTier } from "@/lib/useTargetTier";
import { formatTime, type Tier } from "@/lib/swim";
import { formatSeconds } from "@/lib/format";
import { PbBoard } from "@/components/swimmers/PbBoard";
import { useViewer } from "./ViewerContext";
import { IdentityStrip, ReadOnlyChip, Section } from "./viewerShared";

/*
  Viewer Overview (/me, Step R6). The calm landing summary — the R4 greeting, the
  swimmer's identity, their personal-best board, and a short "closest to
  qualifying" list that links INTO the focused sections. No charts live here;
  progression, the stroke wheel and the full road each have their own page.
*/

const TIER_FULL: Record<Tier, string> = {
  LEVEL_2: "Level 2",
  LEVEL_3: "Level 3",
  SANJ: "SANJ",
};

export function ViewerOverviewScreen() {
  const { selectedId } = useViewer();
  const profile = useCurrentProfile();
  const greeting = useGreeting(profile?.name);
  const [tier] = useTargetTier();

  const data = useQuery(api.personalBests.getSwimmerProfile, {
    swimmerId: selectedId,
  });
  const road = useQuery(api.analysis.getRoadToQualify, {
    swimmerId: selectedId,
    tier,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={greeting}
        breadcrumb={[{ label: "Overview" }]}
        description="Your bests and how close you are to each qualifying cut. Open Progress, Road to qualify or History for the full picture."
        actions={<ReadOnlyChip />}
      />

      {data === undefined ? (
        <OverviewSkeleton />
      ) : (
        <>
          <IdentityStrip
            name={data.swimmer.name}
            age={data.swimmer.age}
            gender={data.swimmer.gender}
            active={data.swimmer.active}
            inSystemSince={data.swimmer.inSystemSince}
            resultCount={data.swimmer.resultCount}
          />

          <Section
            title="Personal bests"
            hint="Fastest meet time per event and course. Trials and practice never set a PB."
          >
            <PbBoard pbs={data.personalBests} />
          </Section>

          <ClosestToQualifying road={road} tier={tier} />

          <JumpTo />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Closest to qualifying — a short read that links into /me/road
// ---------------------------------------------------------------------------

type RoadData = FunctionReturnType<typeof api.analysis.getRoadToQualify>;

function ClosestToQualifying({
  road,
  tier,
}: {
  road: RoadData | undefined;
  tier: Tier;
}) {
  const chasing = road
    ? road.events.filter((e) => e.pbMs !== null && !e.qualified).slice(0, 3)
    : [];
  const qualifiedCount = road
    ? road.events.filter((e) => e.qualified).length
    : 0;

  return (
    <Section
      title="Closest to qualifying"
      hint={`How near your fastest long-course meet times are to the ${TIER_FULL[tier]} cut. Full detail on the Road to qualify page.`}
    >
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        {road === undefined ? (
          <div className="h-28 animate-pulse bg-surface-2/40" aria-busy />
        ) : road === null || road.events.length === 0 ? (
          <div className="px-5 py-6 text-sm text-ink-muted">
            No {TIER_FULL[tier]} cuts apply at your exact age yet.
          </div>
        ) : chasing.length === 0 ? (
          <div className="px-5 py-6 text-sm text-ink-muted">
            {qualifiedCount > 0
              ? `You've met the ${TIER_FULL[tier]} cut on every applicable event with a time. `
              : "No long-course meet times to measure yet. "}
            See the full road for every cut.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {chasing.map((e) => (
              <li
                key={`${e.distance}|${e.stroke}`}
                className="flex items-center justify-between gap-4 px-5 py-3"
              >
                <div className="min-w-0">
                  <span className="font-medium text-ink">{e.label}</span>
                  <span className="time tnum ml-2 text-xs text-ink-faint">
                    {formatTime(e.pbMs as number)} → {formatTime(e.cutMs)}
                  </span>
                </div>
                <span className="shrink-0 font-medium tabular-nums text-ink">
                  {formatSeconds(e.gapMs as number)}s to go
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/me/road"
          className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 text-sm font-medium text-brand-500 outline-none transition-colors [transition-duration:var(--dur-1)] hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Road to qualify
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Jump-to tiles into the focused sections
// ---------------------------------------------------------------------------

function JumpTo() {
  const tiles = [
    { href: "/me/progress", label: "Progress", desc: "Times over the season and your stroke profile.", icon: LineChart },
    { href: "/me/road", label: "Road to qualify", desc: "Your gap to every qualifying cut.", icon: Target },
    { href: "/me/history", label: "History", desc: "Every logged swim.", icon: ListOrdered },
  ];
  return (
    <ul className="grid gap-4 sm:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className="group flex h-full items-start gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm outline-none transition-[border-color,box-shadow] [transition-duration:var(--dur-1)] hover:border-gray-300 hover:shadow-theme-md focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-ink-muted transition-colors [transition-duration:var(--dur-1)] group-hover:bg-brand-50 group-hover:text-brand-500"
            >
              <t.icon className="size-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-ink">{t.label}</span>
                <ArrowRight
                  aria-hidden
                  className="size-3.5 text-ink-faint transition-transform [transition-duration:var(--dur-1)] group-hover:translate-x-0.5 group-hover:text-brand-500"
                />
              </div>
              <p className="mt-0.5 text-xs text-ink-muted">{t.desc}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-busy>
      <div className="h-4 w-72 animate-pulse rounded-sm bg-surface-2" />
      <div className="h-56 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
