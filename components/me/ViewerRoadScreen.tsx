"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { UserRound } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { TargetTierToggle } from "@/components/qualifying/TargetTierToggle";
import type { Tier } from "@/lib/swim";
import { RoadResults } from "@/components/road/RoadScreen";
import { useViewer } from "./ViewerContext";
import { MiniEmpty, ReadOnlyChip } from "./viewerShared";

/*
  Viewer Road to qualify (/me/road, Step R6). The selected swimmer's readiness at
  one target tier: the qualifying-progress bars + gap-to-cut list, closest first.
  Reuses the already-built RoadResults; LCM only, meet PBs, exact-age cuts.
*/
export function ViewerRoadScreen() {
  const { selectedId } = useViewer();
  // Per-session tier for this page (default L2, the nearest cut); no global default.
  const [tier, setTier] = useState<Tier>("LEVEL_2");

  const data = useQuery(api.analysis.getRoadToQualify, {
    swimmerId: selectedId,
    tier,
  });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Road to qualify"
        breadcrumb={[{ label: "Overview", href: "/me" }, { label: "Road to qualify" }]}
        description="How close your fastest long-course meet time is to each qualifying cut, closest first. Standards resolve to your exact age."
        actions={<ReadOnlyChip />}
      />

      {/* Slim toolbar: the shared target tier drives the whole view. */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-medium text-ink-muted">Target tier</span>
        <TargetTierToggle value={tier} onChange={setTier} />
      </div>

      {data === undefined ? (
        <div className="flex flex-col gap-5" aria-busy>
          <div className="h-14 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
          <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
        </div>
      ) : data === null ? (
        <MiniEmpty
          icon={<UserRound aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
          title="Swimmer unavailable"
          body="This swimmer may have been removed. Ask your coach to check the link."
        />
      ) : data.events.length === 0 ? (
        <MiniEmpty
          icon={<UserRound aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />}
          title={`No cuts at age ${data.swimmer.age}`}
          body="This tier has no events at your exact age. Try another target tier."
        />
      ) : (
        <RoadResults data={data} tier={tier} />
      )}
    </div>
  );
}
