"use client";

import { useState } from "react";
import { curveLinear } from "@visx/curve";
import { Grid } from "@/components/charts/grid";
import { Line } from "@/components/charts/line";
import { LineChart } from "@/components/charts/line-chart";
import { StaticChartPreviewProvider } from "@/components/charts/static-chart-preview-context";
import { ChartTooltip as BklitChartTooltip } from "@/components/charts/tooltip";
import { XAxis } from "@/components/charts/x-axis";
import {
  GalaCutOverlay,
  SWIM_TOOLTIP_PANEL,
  SwimDots,
  TooltipMeta,
  TooltipRows,
  TooltipValue,
  ValueAxis,
  type CutLine,
} from "@/components/charts/swim";
import { CHART, TIER_STYLE } from "@/components/analysis/chartTheme";
import { formatTime } from "@/lib/swim";
import { formatShortDate } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { Kbd } from "@/components/ui/Kbd";
import { PageHeader } from "@/components/ui/PageHeader";
import { QualifyCelebration } from "@/components/me/QualifyCelebration";
import { Segmented } from "@/components/ui/Segmented";
import { TierBadge, type BadgeGala } from "@/components/ui/TierBadge";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/useMediaQuery";

/*
  Design-system reference screen (Step 1.5). A realistic (but static) slice of the
  coaching console that exercises every core token and the shared component
  vocabulary on one page, so the system can be critiqued and later steps have a
  living reference. No product logic lives here.

  Swim times run through the real `formatTime`, and the chart is the real bklit
  composition with the real cut-overlay shapes — so this page documents the
  system as built rather than a sketch of it. Only the DATA is invented.
*/

/*
  200 Free LCM for one 15-year-old across the 2025-26 season, with a birthday in
  January. Four galas, not five: the entry windows mean nobody is ever eligible
  for all five at once (SANS opens at 15, SANY at 17, and the age-graded galas
  close at 16), so a five-line chart would document a system the app does not
  have. At 15 the real set is L2 / L3 / SANJ / SANS.
*/
const SANS_MS = 128_000; // 2:08.00 — open standard: one cut at every age
const SANJ_15 = 132_000; // 2:12.00 — age-graded, so it steps on the birthday
const SANJ_16 = 130_500; // 2:10.50
const L3_15 = 136_000; // 2:16.00
const L3_16 = 134_500; // 2:14.50
const L2_15 = 142_000; // 2:22.00
const L2_16 = 140_000; // 2:20.00

/** ISO date -> epoch ms, matching how the real chart places a swim. */
function at(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

const SEASON_START = at("2025-09-01");
const BIRTHDAY = at("2026-01-14");
const SEASON_END = at("2026-06-20");

type Point = { date: string; ms: number; type: "MEET" | "PRACTICE" };

const SERIES: Point[] = [
  { date: "2025-09-13", ms: 140_200, type: "PRACTICE" },
  { date: "2025-10-18", ms: 138_400, type: "MEET" },
  { date: "2025-11-22", ms: 137_100, type: "PRACTICE" },
  { date: "2025-12-06", ms: 135_600, type: "MEET" },
  { date: "2026-02-21", ms: 134_200, type: "MEET" },
  { date: "2026-04-11", ms: 132_900, type: "PRACTICE" },
  { date: "2026-06-20", ms: 131_800, type: "MEET" },
];

/*
  The two cut shapes the app draws, side by side. An OPEN gala (SANS) publishes
  one cut for every age, so its line spans the season. An AGE-GRADED gala steps
  on the birthday: a segment at the 15 cut, a vertical riser, then a segment at
  the 16 cut — one continuous standard rather than two floating rules.
*/
function agedCut(
  gala: "SANJ" | "LEVEL_3" | "LEVEL_2",
  at15: number,
  at16: number,
): CutLine[] {
  const st = TIER_STYLE[gala];
  const base = { color: st.color, dash: st.dash, full: false };
  return [
    { ...base, key: `${gala}-15`, y: at15, x1: SEASON_START, x2: BIRTHDAY },
    { ...base, key: `${gala}-riser`, y: at15, y2: at16, x1: BIRTHDAY, x2: BIRTHDAY },
    { ...base, key: `${gala}-16`, y: at16, x1: BIRTHDAY, x2: SEASON_END },
  ];
}

const CUT_LINES: CutLine[] = [
  {
    key: "SANS",
    color: TIER_STYLE.SANS.color,
    dash: TIER_STYLE.SANS.dash,
    y: SANS_MS,
    full: true,
    x1: SEASON_START,
    x2: SEASON_END,
  },
  ...agedCut("SANJ", SANJ_15, SANJ_16),
  ...agedCut("LEVEL_3", L3_15, L3_16),
  ...agedCut("LEVEL_2", L2_15, L2_16),
];

const PREVIEW_ROWS = SERIES.map((p, i) => ({
  date: new Date(at(p.date)),
  t: at(p.date),
  ms: p.ms,
  // The last MEET swim is the PB, so the wheel of marks is all represented.
  msmark:
    p.type === "MEET" && i === SERIES.length - 1
      ? ("pb" as const)
      : p.type === "MEET"
        ? ("meet" as const)
        : ("trial" as const),
  type: p.type,
}));

type Row = { name: string; age: number; event: string; pb: string; tier: BadgeGala; gap: string };

const ROWS: Row[] = [
  { name: "Ntando Mbeki", age: 14, event: "200 Free", pb: "2:11:80", tier: "SANJ", gap: "qualified" },
  { name: "Aisha Patel", age: 13, event: "100 Back", pb: "1:08:14", tier: "LEVEL_3", gap: "+0:00:42 to SANJ" },
  { name: "Liam van Wyk", age: 15, event: "100 Free", pb: "0:56:03", tier: "LEVEL_2", gap: "+0:01:19 to L3" },
  { name: "Zoë Adams", age: 12, event: "200 IM", pb: "2:38:57", tier: "NONE", gap: "+0:02:04 to L2" },
];

export default function PreviewPage() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [course, setCourse] = useState<"SCM" | "LCM">("LCM");
  const [demoDate, setDemoDate] = useState("2026-06-15");

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-12">
      {/* Standard page top: shared PageHeader = AppBreadcrumb + title (Step 3.5). */}
      <PageHeader
        title="Component preview"
        breadcrumb={[
          { label: "Dashboard", href: "/" },
          { label: "Design system", href: "/preview" },
          { label: "Component preview" },
        ]}
        description="The living reference for tokens and the shared component vocabulary: soft off-white canvas, Untitled-UI grays, one indigo brand accent, green only for qualified, a tier scale that always pairs colour with a label."
      />

      {/* ── Vibrance layer: deep-water header + celebration (DESIGN.md §3c) ──── */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-ink-muted">
          Vibrance — deep-water header &amp; the qualification moment
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">
          <PageHeader
            variant="water"
            title="Good morning, Coach"
            breadcrumb={[{ label: "Dashboard", href: "/" }, { label: "Dashboard" }]}
            description="The deep-water band carries the title and breadcrumb. Chrome only — no data lives here, so it never competes with the tier or stroke palettes."
          />
          <QualifyCelebration
            gala="SANS"
            eventLabel="50 Fly"
            course="LCM"
            timeMs={29880}
          />
        </div>
      </section>

      {/* ── Toolbar: search (⌘K), course toggle, primary action (N) ─────────── */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative grow sm:max-w-xs">
          <SearchIcon />
          <input
            type="search"
            placeholder="Search swimmers"
            aria-label="Search swimmers"
            className="h-9 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-14 text-base text-ink placeholder:text-ink-muted outline-none transition-[border-color] [transition-duration:var(--dur-1)] hover:border-gray-400 focus:border-brand-300 focus:shadow-focus-ring"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center">
            <Kbd>⌘K</Kbd>
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Segmented
            ariaLabel="Course"
            value={course}
            onChange={setCourse}
            options={[
              { value: "SCM", label: "SCM" },
              { value: "LCM", label: "LCM" },
            ]}
          />
          <Button variant="primary">
            Log result <Kbd>N</Kbd>
          </Button>
        </div>
      </div>

      {/* ── The single anchor: a swimmer's headline PB ─────────────────────── */}
      <section className="mt-6 rounded-2xl border border-gray-200 bg-white shadow-theme-sm p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <span className="font-medium text-ink">Ntando Mbeki</span>
              <span aria-hidden>·</span>
              <span>200 Free</span>
              <span aria-hidden>·</span>
              <span>{course}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="time text-2xl font-semibold text-ink">2:11:80</span>
              <span className="text-sm text-ink-muted">fastest meet time · Jun 2026</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TierBadge gala="SANJ" />
            <span className="inline-flex items-center gap-1.5 rounded-sm bg-success-subtle px-2 py-1 text-xs font-medium text-success-ink">
              <CheckIcon /> Qualified
            </span>
          </div>
        </div>
        {/* Contextual help — teaches the domain rule (help + error prevention). */}
        <p className="mt-4 border-t border-border pt-3 text-sm text-ink-muted">
          <InfoIcon /> Headline PB counts the fastest <span className="text-ink">meet</span> time
          only{course === "SCM" ? "" : " (LCM)"}. Time trials and practice are tracked but never
          set the PB.
        </p>
      </section>

      {/* ── Progression chart card ─────────────────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-theme-sm p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">Progression</h2>
            <p className="text-sm text-ink-muted">200 Free · LCM · season 2025–26</p>
          </div>
          <ChartLegend />
        </div>

        <div className="h-64 w-full">
          <MaybeStatic reduced={reduced}>
            <LineChart
              animationDuration={600}
              // Fill the h-64 parent rather than bklit's default "2 / 1".
              aspectRatio=""
              data={PREVIEW_ROWS}
              margin={{ top: 8, right: 16, bottom: 26, left: 56 }}
              style={{ height: "100%" }}
              xDataKey="date"
              xLabelFormat={(d) =>
                formatShortDate(d.toISOString().slice(0, 10))
              }
              // Floored well below the fastest cut, never at zero: an axis from
              // zero would squeeze this whole season into the top of the plot.
              // The real chart floors just under the world record.
              yDomain={[124_000, 144_000]}
            >
              <Grid horizontal stroke={CHART.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis numTicks={5} tickMode="domain" />
              <ValueAxis format={formatTime} label="Time" width={56} />
              <GalaCutOverlay cuts={CUT_LINES} strokeOpacity={0.9} />
              <Line
                curve={curveLinear}
                dataKey="ms"
                fadeEdges={false}
                stroke={CHART.accent}
                strokeWidth={2}
              />
              <SwimDots color={CHART.accent} dataKey="ms" markKey="msmark" />
              <BklitChartTooltip
                content={({ point }) => (
                  <PreviewTooltip row={point as (typeof PREVIEW_ROWS)[number]} />
                )}
                indicatorColor={CHART.axis}
                indicatorDasharray="3 3"
                panelStyle={SWIM_TOOLTIP_PANEL}
                showDots={false}
              />
            </LineChart>
          </MaybeStatic>
        </div>
      </section>

      {/* ── Data table with tabular swim times ─────────────────────────────── */}
      <section className="mt-8 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Squad · qualification</h2>
          <p className="text-sm text-ink-muted">Headline meet PBs and highest tier met (LCM).</p>
        </div>
        <table className="w-full text-base">
          <thead>
            <tr className="bg-surface-2 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
              <th scope="col" className="px-6 py-2.5 font-medium">Swimmer</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Age</th>
              <th scope="col" className="px-4 py-2.5 font-medium">Event</th>
              <th scope="col" className="px-4 py-2.5 text-right font-medium">
                <span className="inline-flex items-center gap-1">PB <SortIcon /></span>
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">Tier</th>
              <th scope="col" className="px-6 py-2.5 font-medium">Gap to next</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr key={r.name} className={`border-t border-border ${i === 0 ? "bg-brand-50" : ""}`}>
                <td className="px-6 py-3 font-medium text-ink">{r.name}</td>
                <td className="px-4 py-3 tnum text-ink-muted">{r.age}</td>
                <td className="px-4 py-3 text-ink-muted">{r.event}</td>
                <td className="time px-4 py-3 text-right text-ink">{r.pb}</td>
                <td className="px-4 py-3">
                  <TierBadge gala={r.tier} />
                </td>
                <td className="px-6 py-3 text-ink-muted">
                  {r.gap === "qualified" ? (
                    <span className="text-success-ink">Qualified</span>
                  ) : (
                    <span className="time text-sm">{r.gap}</span>
                  )}
                </td>
              </tr>
            ))}
            {/* Loading skeleton row — the loading-feedback pattern (no spinners in content). */}
            <tr className="border-t border-border" aria-hidden>
              <td className="px-6 py-3"><Skeleton className="w-32" /></td>
              <td className="px-4 py-3"><Skeleton className="w-6" /></td>
              <td className="px-4 py-3"><Skeleton className="w-16" /></td>
              <td className="px-4 py-3"><Skeleton className="ml-auto w-14" /></td>
              <td className="px-4 py-3"><Skeleton className="w-10" /></td>
              <td className="px-6 py-3"><Skeleton className="w-24" /></td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ── Component swatches: buttons + a "Log result" form ──────────────── */}
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm p-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Buttons</h2>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary">Log result</Button>
            <Button variant="secondary">Edit</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete</Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary" loading>Saving</Button>
            <Button variant="primary" disabled>Disabled</Button>
            <Button variant="secondary" size="sm">Small</Button>
          </div>
          <p className="mt-3 text-xs text-ink-muted">
            Destructive actions confirm before running; low-risk actions do not.
          </p>
        </section>

        {/* Form shell: Save/Cancel footer demonstrates control + freedom. */}
        <section className="rounded-2xl border border-gray-200 bg-white shadow-theme-sm p-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Log result</h2>
          <div className="mt-4 flex flex-col gap-4">
            <Input label="Meet name" placeholder="e.g. SA National Champs" defaultValue="" />
            <Input
              label="Time"
              placeholder="m:ss:hh"
              hint="Two groups means ss:hh — 59:09 is 59.09 seconds."
              defaultValue="2:11:80"
              className="time"
            />
            <DateField
              label="Date"
              value={demoDate}
              max="2026-07-04"
              onChange={setDemoDate}
              hint="The flip calendar — the one date picker across the app."
            />
          </div>
          <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
            <Button variant="ghost">Cancel</Button>
            <Button variant="primary">Save result</Button>
          </div>
        </section>
      </div>

      {/* ── Feedback & notifications (toasts) ──────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-theme-sm p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Notifications</h2>
        <p className="mt-1 max-w-[68ch] text-sm text-ink-muted">
          Every action speaks through <code className="text-ink">notify</code>: short past-tense
          success, the server&apos;s own message on error. Semantic colour lives only in the
          status icon. The last two buttons fire a throwaway async action to show
          <code className="text-ink"> notify.promise</code> resolving loading → success / error.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => notify.success("Time saved")}>
            Success
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => notify.error("Time must be a valid meet result")}
          >
            Error
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => notify.info("Showing LCM times only")}
          >
            Info
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() =>
              notify.promise(fakeSave(true), {
                loading: "Saving time…",
                success: "Time saved",
              })
            }
          >
            Promise · resolves
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              notify.promise(fakeSave(false), {
                loading: "Saving time…",
                success: "Time saved",
              })
            }
          >
            Promise · rejects
          </Button>
        </div>
      </section>

      {/* ── Tier scale legend ──────────────────────────────────────────────── */}
      <section className="mt-8 rounded-2xl border border-gray-200 bg-white shadow-theme-sm p-6">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Tier scale</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Hardest to easiest. Every badge pairs colour with a label and a glyph, so it reads in
          greyscale and under colour-blindness.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {(["SANS", "SANY", "SANJ", "LEVEL_3", "LEVEL_2", "NONE"] as BadgeGala[]).map((t) => (
            <div key={t} className="flex items-center gap-2">
              <TierBadge gala={t} />
              <span className="text-sm text-ink-muted">
                {t === "SANJ" ? "top" : t === "LEVEL_3" ? "mid" : t === "LEVEL_2" ? "entry" : "unranked"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── throwaway async action: proves notify.promise loading→success/error ── */

function fakeSave(succeeds: boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (succeeds) resolve();
      // The server would throw a real Error; notify maps its message.
      else reject(new Error("Meet not found"));
    }, 900);
  });
}

/* ── icons & bits ──────────────────────────────────────────────────────── */

function CheckIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-3" fill="none" aria-hidden>
      <path d="M2.5 6.5L5 9l4.5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
      fill="none"
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg viewBox="0 0 16 16" className="mr-1 inline-block size-3.5 -translate-y-px text-ink-faint" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v4M8 5.1v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 12 12" className="size-3 text-ink-faint" fill="none" aria-hidden>
      <path d="M6 2v8M6 10l2.5-2.5M6 10L3.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`h-3.5 animate-pulse rounded-sm bg-surface-2 ${className}`} />;
}

/* ── chart helpers ─────────────────────────────────────────────────────── */

function ChartLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-brand-500" aria-hidden /> Meet
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className="size-2.5 rounded-full border-2 border-brand-500 bg-white"
          aria-hidden
        />{" "}
        Practice
      </span>
      {/* A gala is never colour-only: glyph + short label, always. */}
      {(["SANS", "SANJ", "LEVEL_3", "LEVEL_2"] as const).map((gala) => {
        const st = TIER_STYLE[gala];
        return (
          <span className="inline-flex items-center gap-1.5" key={gala}>
            <span aria-hidden className="text-2xs leading-none" style={{ color: st.color }}>
              {st.glyph}
            </span>
            <span className="font-medium text-ink">{st.label}</span>
          </span>
        );
      })}
    </div>
  );
}

/* bklit hands `content` the hovered row. The card is bklit's TooltipBox; only
   the stack inside it is ours — the same helpers the real charts use. */
function PreviewTooltip({
  row,
}: {
  row: { t: number; ms: number; type: "MEET" | "PRACTICE" };
}) {
  if (!row?.ms) return null;
  return (
    <TooltipRows>
      <TooltipValue>{formatTime(row.ms)}</TooltipValue>
      <TooltipMeta>
        <span>{formatShortDate(new Date(row.t).toISOString().slice(0, 10))}</span>
        <span>{row.type === "MEET" ? "Meet" : "Practice"}</span>
      </TooltipMeta>
    </TooltipRows>
  );
}

/** Renders children at rest (no enter animation) when motion is reduced. */
function MaybeStatic({
  reduced,
  children,
}: {
  reduced: boolean;
  children: React.ReactNode;
}) {
  return reduced ? (
    <StaticChartPreviewProvider>{children}</StaticChartPreviewProvider>
  ) : (
    <>{children}</>
  );
}
