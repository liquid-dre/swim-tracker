"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Kbd } from "@/components/ui/Kbd";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { TierBadge, type Tier } from "@/components/ui/TierBadge";
import { notify } from "@/lib/notify";
import { useMediaQuery } from "@/lib/useMediaQuery";

/*
  Design-system reference screen (Step 1.5). A realistic (but static) slice of the
  coaching console that exercises every core token and the shared component
  vocabulary on one page, so the system can be critiqued and later steps have a
  living reference. No product logic lives here.

  NOTE: swim times are shown as literal canonical `m:ss:hh` strings — the real
  ms<->text parser is a later step. `fmtAxis` is a preview-only tick helper.
*/

const SANJ_MS = 132000; // 2:12.00
const L3_MS = 136000; // 2:16.00
const L2_MS = 142000; // 2:22.00

type Point = { label: string; ms: number; type: "MEET" | "PRACTICE" };

const SERIES: Point[] = [
  { label: "Sep", ms: 140200, type: "PRACTICE" },
  { label: "Oct", ms: 138400, type: "MEET" },
  { label: "Nov", ms: 137100, type: "PRACTICE" },
  { label: "Dec", ms: 135600, type: "MEET" },
  { label: "Feb", ms: 134200, type: "MEET" },
  { label: "Apr", ms: 132900, type: "PRACTICE" },
  { label: "Jun", ms: 131800, type: "MEET" },
];

function fmtAxis(ms: number): string {
  const totalSec = ms / 1000;
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Row = { name: string; age: number; event: string; pb: string; tier: Tier; gap: string };

const ROWS: Row[] = [
  { name: "Ntando Mbeki", age: 14, event: "200 Free", pb: "2:11:80", tier: "SANJ", gap: "qualified" },
  { name: "Aisha Patel", age: 13, event: "100 Back", pb: "1:08:14", tier: "LEVEL_3", gap: "+0:00:42 to SANJ" },
  { name: "Liam van Wyk", age: 15, event: "100 Free", pb: "0:56:03", tier: "LEVEL_2", gap: "+0:01:19 to L3" },
  { name: "Zoë Adams", age: 12, event: "200 IM", pb: "2:38:57", tier: "NONE", gap: "+0:02:04 to L2" },
];

export default function PreviewPage() {
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [course, setCourse] = useState<"SCM" | "LCM">("LCM");

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
            <TierBadge tier="SANJ" />
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
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={SERIES} margin={{ top: 8, right: 12, bottom: 4, left: 8 }}>
              <CartesianGrid stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis
                reversed
                width={52}
                domain={[130500, 143000]}
                tickFormatter={fmtAxis}
                tick={{ fill: "var(--color-ink-muted)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip cursor={{ stroke: "var(--color-border-strong)" }} content={<ChartTooltip />} />

              {/* LCM qualifying standards. Faster (lower ms) sits higher on the reversed axis. */}
              <ReferenceLine
                y={L2_MS}
                stroke="var(--color-tier-l2)"
                strokeDasharray="4 4"
                label={{ value: "L2", position: "left", fill: "var(--color-tier-l2-ink)", fontSize: 11 }}
              />
              <ReferenceLine
                y={L3_MS}
                stroke="var(--color-tier-l3)"
                strokeDasharray="4 4"
                label={{ value: "L3", position: "left", fill: "var(--color-tier-l3-ink)", fontSize: 11 }}
              />
              <ReferenceLine
                y={SANJ_MS}
                stroke="var(--color-tier-sanj)"
                strokeDasharray="4 4"
                label={{ value: "SANJ", position: "left", fill: "var(--color-tier-sanj-ink)", fontSize: 11 }}
              />

              <Line
                type="monotone"
                dataKey="ms"
                stroke="var(--color-brand-500)"
                strokeWidth={2}
                dot={<SwimDot />}
                activeDot={{ r: 5, fill: "var(--color-brand-500)", stroke: "var(--color-surface)", strokeWidth: 2 }}
                isAnimationActive={!reduced}
                animationDuration={600}
                animationEasing="ease-out"
              />
            </LineChart>
          </ResponsiveContainer>
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
                  <TierBadge tier={r.tier} />
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
            <Input label="Date" defaultValue="2026-13-02" error="Not a real date. Use YYYY-MM-DD." />
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
          {(["SANJ", "LEVEL_3", "LEVEL_2", "NONE"] as Tier[]).map((t) => (
            <div key={t} className="flex items-center gap-2">
              <TierBadge tier={t} />
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
    <div className="flex items-center gap-4 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-brand-500" aria-hidden /> Meet
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full border-2 border-brand-500 bg-white" aria-hidden /> Practice
      </span>
    </div>
  );
}

type DotProps = { cx?: number; cy?: number; payload?: Point };

function SwimDot({ cx, cy, payload }: DotProps) {
  if (cx == null || cy == null || !payload) return null;
  const isMeet = payload.type === "MEET";
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={isMeet ? "var(--color-brand-500)" : "var(--color-surface)"}
      stroke="var(--color-brand-500)"
      strokeWidth={2}
    />
  );
}

type TooltipProps = { active?: boolean; payload?: Array<{ payload: Point }> };

function ChartTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-theme-md">
      <div className="time text-base text-ink">{fmtAxis(p.ms)}</div>
      <div className="mt-0.5 text-xs text-ink-muted">
        {p.label} · {p.type === "MEET" ? "Meet" : "Practice"}
      </div>
    </div>
  );
}
