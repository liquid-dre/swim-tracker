"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Gauge } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { FilterBar } from "@/components/ui/FilterBar";
import { trailForHref } from "@/lib/nav";
import { usePickerSwimmers } from "@/lib/usePickerSwimmers";
import { formatShortDate } from "@/lib/format";
import { formatTime } from "@/lib/swim";
import type { ScoredEvent } from "@/lib/points";
import { PointsBarChart } from "./PointsBarChart";
import { PointsTrendChart, TREND_MIN_MEETS } from "./PointsTrendChart";

/*
  World Aquatics points, for one swimmer.

  Seconds cannot rank a 200 breast against a 50 free, so this is the only screen
  in the app that answers "what is this swimmer actually good at" — every other
  performance screen compares a swimmer to a cut, to a squad-mate in the same
  event, or to their own past self.

  LONG COURSE ONLY, and it says so rather than implying otherwise. World
  Aquatics publishes a separate short-course table which has not been loaded
  yet; scoring a short-course swim against the long-course base times would
  inflate every one of them, so the honest answer is silence plus an
  explanation. When the short-course tables land, a course control joins the
  toolbar and this copy goes away.
*/

/** The only course with loaded base times. See `lib/points.ts`. */
const COURSE = "LCM" as const;

export function PointsScreen() {
  const pathname = usePathname();
  // Role-scoped picker: a coach picks any swimmer, a viewer only their linked
  // swimmer(s). The read itself is scoped again server-side.
  const swimmers = usePickerSwimmers();

  /*
    The chosen swimmer lives in the URL, not in component state.

    A coach comparing two swimmers' points flips back and forth, and a points
    page is the kind of thing you send to a parent or another coach. Keeping the
    selection in `?swimmer=` makes the view linkable and makes the browser's
    back button step through the swimmers you looked at, which local state
    cannot do. `replace` rather than `push` for the FIRST pick, so the toolbar
    landing on a default never traps the user on the page.
  */
  const router = useRouter();
  const params = useSearchParams();
  const swimmerId = (params.get("swimmer") ?? "") as Id<"swimmers"> | "";

  const selectSwimmer = useCallback(
    (next: string) => {
      const query = next === "" ? "" : `?swimmer=${encodeURIComponent(next)}`;
      const navigate = swimmerId === "" ? router.replace : router.push;
      navigate(`${pathname}${query}`, { scroll: false });
    },
    [pathname, router, swimmerId],
  );

  const data = useQuery(
    api.analysis.getSwimmerPoints,
    swimmerId === "" ? "skip" : { swimmerId, course: COURSE },
  );

  const loadingSwimmers = swimmers === undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Points"
        breadcrumb={trailForHref(pathname)}
        description="World Aquatics points score every swim on one 0–1000 scale, where 1000 is the world-record standard — so a 200 breaststroke and a 50 freestyle can finally be compared. Long course only, from fastest meet times; trials and practice never score."
      />

      <FilterBar
        primary={
          <div className="w-full max-w-xs sm:w-56">
            <Select
              aria-label="Swimmer"
              placeholder={loadingSwimmers ? "Loading swimmers…" : "Select a swimmer"}
              value={swimmerId}
              onValueChange={selectSwimmer}
              disabled={loadingSwimmers}
              options={(swimmers ?? []).map((s) => ({
                value: s._id,
                label: `${s.name} · ${s.age}`,
              }))}
            />
          </div>
        }
      />

      {swimmerId === "" ? (
        <EmptyState
          title="Pick a swimmer"
          body="Choose a swimmer above to see their World Aquatics points by event and by meet."
        />
      ) : data === undefined ? (
        // Also the state when switching swimmers. The skeleton mirrors the real
        // block heights, so the page holds its shape instead of jumping.
        <PointsSkeleton />
      ) : data === null ? (
        <EmptyState
          title="Swimmer not found"
          body="That swimmer may have been removed. Pick another from the list above."
        />
      ) : !data.hasBaseTimes ? (
        <EmptyState
          title="No base times loaded for this course"
          body="World Aquatics publishes a separate points table per course. Until this one is loaded, swims in it are not scored — a number borrowed from the other course would be wrong."
        />
      ) : data.events.length === 0 ? (
        <EmptyState
          title={`No scoreable long-course meet times for ${data.name}`}
          body="Points come from fastest meet times in long course. Time trials, practice and school galas never score, and World Aquatics publishes no table for 25 m events or the 100 IM."
        />
      ) : (
        <PointsResults data={data} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results — presentational, so the preview harness can render it without Convex
// ---------------------------------------------------------------------------

export type PointsData = {
  name: string;
  course: "LCM" | "SCM";
  baseYear: number;
  best: ScoredEvent | null;
  events: ScoredEvent[];
  meets: Array<{
    key: string;
    meetName: string | null;
    swimDate: string;
    points: number;
    label: string;
    timeMs: number;
  }>;
};

export function PointsResults({ data }: { data: PointsData }) {
  const { best } = data;

  return (
    <div className="flex flex-col gap-5">
      {/* The headline sits on the page itself, with no card around it. A card
          would make one number compete with the chart it summarises, and the
          bordered-box-with-a-big-number is the metric-tile shape PRODUCT.md
          lists as an anti-reference. */}
      {best && (
        <div>
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums text-ink">
              {best.points}
            </span>
            <span className="text-sm text-ink-muted">
              World Aquatics points — {data.name}&rsquo;s best swim
            </span>
          </p>
          <p className="mt-1.5 max-w-[70ch] text-sm text-ink-muted">
            {best.label} in{" "}
            <span className="tabular-nums">{formatTime(best.timeMs)}</span>,{" "}
            {formatShortDate(best.swimDate)}
            {best.meetName ? ` · ${best.meetName}` : ""}. Long course, scored
            against the {data.baseYear} base times.
          </p>
        </div>
      )}

      {/* Hero: points per event */}
      <section className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            Points by event · long course
          </h2>
          <p className="text-sm text-ink-muted">
            Longer is better. Same 0&ndash;1000 scale on every swimmer&rsquo;s page.
          </p>
        </div>
        <PointsBarChart events={data.events} />
        <EventTable events={data.events} />
      </section>

      {/* Trend. Below two meets there is no trend to draw, so the section says
          so in a sentence rather than plotting a lone dot on a year-wide axis
          and inviting a reading that is not there. */}
      <section className="flex flex-col gap-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold text-ink">
            Points by meet · long course
          </h2>
          <p className="text-sm text-ink-muted">
            Each meet&rsquo;s best-scoring swim. It can fall as well as rise.
          </p>
        </div>
        {data.meets.length >= TREND_MIN_MEETS ? (
          <PointsTrendChart meets={data.meets} />
        ) : (
          <p className="max-w-[70ch] text-sm text-ink-muted">
            {data.meets.length === 1
              ? `Only one long-course meet has scored so far. The trend appears once ${data.name} has raced a second.`
              : "No long-course meets have scored yet."}
          </p>
        )}
      </section>
    </div>
  );
}

/** The chart's data as a table — the accessible equivalent, and the exact
    numbers a coach reads off rather than estimating from a bar. */
function EventTable({ events }: { events: ScoredEvent[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <caption className="sr-only">
          World Aquatics points for each event, strongest first
        </caption>
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs font-medium text-ink-muted">
            <th className="py-2 pr-4 font-medium">Event</th>
            <th className="py-2 pr-4 text-right font-medium">Points</th>
            <th className="py-2 pr-4 text-right font-medium">Time</th>
            <th className="py-2 font-medium">Set at</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr
              key={`${e.distance}|${e.stroke}|${e.course}`}
              className="border-b border-gray-100 last:border-0"
            >
              <td className="py-2 pr-4 font-medium text-ink">{e.label}</td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink">
                {e.points}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums text-ink-muted">
                {formatTime(e.timeMs)}
              </td>
              <td className="py-2 text-ink-muted">
                {formatShortDate(e.swimDate)}
                {e.meetName ? ` · ${e.meetName}` : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-theme-sm">
      <Gauge aria-hidden className="size-6 text-ink-faint" strokeWidth={1.75} />
      <div className="space-y-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        <p className="mx-auto max-w-[48ch] text-sm text-ink-muted">{body}</p>
      </div>
    </div>
  );
}

function PointsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-80 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
      <div className="h-64 animate-pulse rounded-2xl border border-gray-200 bg-white shadow-theme-sm" />
    </div>
  );
}
