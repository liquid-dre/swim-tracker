"use client";

import { useId, useState } from "react";

import { formatTime, type Tier } from "@/lib/swim";
import { TierBadge, type Tier as BadgeTier } from "@/components/ui/TierBadge";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import {
  arcPath,
  buildWheelLayout,
  polar,
  RING_TIERS,
  STROKE_META,
  type ProfileEvent,
} from "./strokeProfile";

/*
  The radial stroke-profile wheel (Step 12.5). One bar per event around a circle,
  grouped contiguously by stroke so each stroke reads as a coloured arc. Radius =
  the headline LCM MEET PB on that event's OWN calibrated L2→L3→SANJ scale, so
  raw times never share an axis. OUTWARD = FASTER: a bar crossing the SANJ ring
  beat the SANJ cut.

  The three reference rings stay NEUTRAL grey and dashed — colour here means
  STROKE only (DESIGN.md §3b). Rings are drawn per-spoke: a partial-coverage
  event shows ONLY the rings it actually has a cut for (§4.9 — never a fake ring).
*/

const RING_TIER_ORDER: ReadonlyArray<Tier> = ["LEVEL_2", "LEVEL_3", "SANJ"];

function badgeTier(t: Tier | null): BadgeTier {
  return t ?? "NONE";
}

export function StrokeWheel({
  events,
  size = 360,
  title,
}: {
  events: ProfileEvent[];
  size?: number;
  title?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  const L = buildWheelLayout(events, size);
  const { cx, cy, hub, gap, maxBarR, ringR, ringPos } = L;
  // Outer band, spaced in ring-units so it scales with the wheel: the stroke arc
  // sits just past the longest possible bar, its label further out. Distance
  // numbers are NOT a fixed ring (that collided with the stroke labels) — each
  // is pinned to its own bar's tip, so they distribute by length, not by angle.
  const arcR = maxBarR + gap * 0.28;
  const labelR = maxBarR + gap * 0.9;

  // Bar thickness: constant px, scaled to how many spokes share the circle.
  const barWidth = Math.max(6, Math.min(15, (360 / Math.max(events.length, 1)) * 0.3));

  // Which tiers appear anywhere → which ring labels to print (never a tier with
  // no cut on any spoke).
  const tiersPresent = new Set<Tier>();
  for (const e of events) {
    if (e.l2Ms !== null) tiersPresent.add("LEVEL_2");
    if (e.l3Ms !== null) tiersPresent.add("LEVEL_3");
    if (e.sanjMs !== null) tiersPresent.add("SANJ");
  }

  const hovered = hover !== null ? L.bars[hover] : null;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-labelledby={titleId}
        className="overflow-visible"
      >
        <title id={titleId}>
          {title ? `${title} — ` : ""}stroke profile wheel: each bar is an event’s
          long-course meet PB on its own L2/L3/SANJ scale; further out is faster.
        </title>

        {/* Hub — a faint disc the bars radiate from (calibrated centre). */}
        <circle
          cx={cx}
          cy={cy}
          r={hub}
          fill="var(--color-surface)"
          stroke="var(--color-border)"
          strokeWidth={1}
        />

        {/* Reference rings — neutral, dashed, drawn ONLY across spokes that have
            that tier's cut (a partial spoke shows only its real rings). */}
        {RING_TIER_ORDER.map((t) =>
          L.bars.map((b) =>
            b.hasCut(t) ? (
              <path
                key={`ring-${t}-${b.index}`}
                d={arcPath(cx, cy, ringR(ringPos[t]), b.slotStart, b.slotEnd)}
                fill="none"
                stroke="var(--color-gray-300)"
                strokeWidth={1}
                strokeDasharray="2 3"
                strokeLinecap="butt"
              />
            ) : null,
          ),
        )}

        {/* Stroke arcs — the coloured identity band grouping each stroke. */}
        {L.arcs.map((a) => {
          const padDeg = Math.min(3, L.anglePer * 0.15);
          return (
            <path
              key={`arc-${a.stroke}`}
              d={arcPath(cx, cy, arcR, a.startAngle + padDeg, a.endAngle - padDeg)}
              fill="none"
              stroke={a.color}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={hover === null ? 1 : 0.85}
            />
          );
        })}

        {/* Bars + empty spokes + hit areas. */}
        {L.bars.map((b) => {
          const stroke = STROKE_META[b.event.stroke];
          const p0 = polar(cx, cy, hub, b.angle);
          const dim = hover !== null && hover !== b.index;

          const cuts = [
            b.event.l2Ms !== null ? `L2 ${formatTime(b.event.l2Ms)}` : null,
            b.event.l3Ms !== null ? `L3 ${formatTime(b.event.l3Ms)}` : null,
            b.event.sanjMs !== null ? `SANJ ${formatTime(b.event.sanjMs)}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          const ariaLabel =
            `${b.event.label}: ` +
            (b.event.pbMs !== null ? `PB ${formatTime(b.event.pbMs)}` : "no meet time") +
            (cuts ? `; cuts ${cuts}` : "") +
            (b.event.highestTier ? `; meets ${b.event.highestTier.replace("_", " ")}` : "") +
            (!b.event.fullCoverage ? "; partial coverage" : "");

          const tip = polar(cx, cy, b.tipR ?? hub, b.angle);
          const hitEnd = polar(cx, cy, maxBarR, b.angle);
          // Distance label pinned just past this bar's own tip (empty spokes:
          // just past the tick), capped inside the stroke arc.
          const stubR = hub + Math.max(5, gap * 0.18);
          const labelAt = Math.min((b.tipR ?? stubR) + gap * 0.5, maxBarR - 1);
          const dl = polar(cx, cy, labelAt, b.angle);

          return (
            <g key={`bar-${b.index}`}>
              {b.tipR !== null ? (
                <line
                  x1={p0.x}
                  y1={p0.y}
                  x2={tip.x}
                  y2={tip.y}
                  stroke={stroke.color}
                  strokeWidth={barWidth}
                  strokeLinecap="round"
                  opacity={dim ? 0.32 : 1}
                  style={{
                    transition: reduced ? undefined : "opacity var(--dur-1) var(--ease-out)",
                  }}
                />
              ) : (
                // No PB → an empty spoke: a small neutral tick at the hub only.
                <line
                  x1={p0.x}
                  y1={p0.y}
                  x2={polar(cx, cy, stubR, b.angle).x}
                  y2={polar(cx, cy, stubR, b.angle).y}
                  stroke="var(--color-gray-300)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={dim ? 0.4 : 1}
                />
              )}

              {/* Distance label at the bar's tip — identifies the event without a
                  scattered number ring. */}
              <text
                x={dl.x}
                y={dl.y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={size < 320 ? 8 : 9}
                className="tnum"
                fill={b.tipR !== null ? "var(--color-ink-muted)" : "var(--color-ink-faint)"}
                opacity={dim ? 0.4 : 1}
              >
                {b.event.distance}
              </text>

              {/* Transparent, focusable hit area drives hover + keyboard tooltip. */}
              <line
                x1={p0.x}
                y1={p0.y}
                x2={hitEnd.x}
                y2={hitEnd.y}
                stroke="transparent"
                strokeWidth={barWidth + 12}
                strokeLinecap="round"
                tabIndex={0}
                role="button"
                aria-label={ariaLabel}
                style={{ cursor: "pointer", outline: "none" }}
                onMouseEnter={() => setHover(b.index)}
                onMouseLeave={() => setHover((h) => (h === b.index ? null : h))}
                onFocus={() => setHover(b.index)}
                onBlur={() => setHover((h) => (h === b.index ? null : h))}
              />
            </g>
          );
        })}

        {/* Stroke labels outside the arcs. */}
        {L.arcs.map((a) => {
          const p = polar(cx, cy, labelR, a.midAngle);
          return (
            <text
              key={`lbl-${a.stroke}`}
              x={p.x}
              y={p.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={size < 320 ? 10 : 11}
              fontWeight={600}
              fill={a.color}
            >
              {a.label}
            </text>
          );
        })}

        {/* Ring tier labels — small chips at 12 o'clock so they read over bars. */}
        {RING_TIERS.filter((r) => tiersPresent.has(r.tier)).map((r) => {
          const y = cy - ringR(ringPos[r.tier]);
          const w = r.label.length * 6 + 8;
          return (
            <g key={`ringlbl-${r.tier}`}>
              <rect
                x={cx - w / 2}
                y={y - 7}
                width={w}
                height={14}
                rx={3}
                fill="var(--color-surface)"
                opacity={0.9}
              />
              <text
                x={cx}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={9}
                fontWeight={500}
                fill="var(--color-ink-muted)"
              >
                {r.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip — event, PB (tabular), all three cuts, highest tier. */}
      {hovered && <WheelTooltip bar={hovered} cx={cx} cy={cy} ringR={ringR} size={size} />}
    </div>
  );
}

function WheelTooltip({
  bar,
  cx,
  cy,
  ringR,
  size,
}: {
  bar: ReturnType<typeof buildWheelLayout>["bars"][number];
  cx: number;
  cy: number;
  ringR: (n: number) => number;
  size: number;
}) {
  const e = bar.event;
  // Anchor near the bar tip; nudge toward whichever side keeps it on-card.
  const anchor = polar(cx, cy, (bar.tipR ?? ringR(0)) + 6, bar.angle);
  const onLeft = anchor.x > size / 2;

  return (
    <div
      className="pointer-events-none absolute z-10 w-max max-w-[15rem] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-theme-md"
      style={{
        left: anchor.x,
        top: anchor.y,
        transform: `translate(${onLeft ? "-100%" : "0"}, -50%)`,
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink">{e.label}</span>
        <TierBadge tier={badgeTier(e.highestTier)} />
      </div>
      <div className="mt-1 time tnum text-ink">
        {e.pbMs !== null ? formatTime(e.pbMs) : "—"}
        <span className="ml-1.5 text-xs font-normal text-ink-faint">
          {e.pbMs !== null ? "meet PB" : "no meet time"}
        </span>
      </div>
      <dl className="mt-2 space-y-0.5 border-t border-border pt-1.5 text-xs">
        <CutRow label="SANJ" ms={e.sanjMs} />
        <CutRow label="L3" ms={e.l3Ms} />
        <CutRow label="L2" ms={e.l2Ms} />
      </dl>
      {!e.fullCoverage && (
        <p className="mt-1.5 text-[0.7rem] leading-tight text-ink-faint">
          Partial coverage — only the tiers shown have a cut here.
        </p>
      )}
    </div>
  );
}

function CutRow({ label, ms }: { label: string; ms: number | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="time tnum text-ink">{ms !== null ? formatTime(ms) : "—"}</dd>
    </div>
  );
}
