"use client";

import { useId, useState } from "react";

import { formatTime, type GalaCode, type RingScale } from "@/lib/swim";
import { TierBadge, type BadgeGala } from "@/components/ui/TierBadge";
import { GALA_MEDIUM, GALA_SHORT } from "@/lib/galas";
import { usePrefersReducedMotion } from "@/hooks/use-reduced-motion";
import {
  arcPath,
  buildWheelLayout,
  cutFor,
  polar,
  ringTiers,
  STROKE_META,
  type ProfileEvent,
} from "./strokeProfile";

/*
  The radial stroke-profile wheel (Step 12.5). One bar per event around a circle,
  grouped contiguously by stroke so each stroke reads as a coloured arc. Radius =
  the headline long-course MEET PB on that event's OWN calibrated scale, so raw
  times never share an axis. OUTWARD = FASTER: a bar crossing a gala's ring beat
  that gala's cut.

  The RING COUNT is the swimmer's — the galas they can actually enter, inner ring
  easiest to outer ring hardest. That is 2-4 rings, never 5, because SANS opens at
  15 and SANY at 17 while L2/L3/SANJ close at 16. Five concentric rings would not
  read; the entry windows mean the case never arises.

  Reference rings stay NEUTRAL grey and dashed — colour here means STROKE only
  (DESIGN.md §3b). Rings are drawn per-spoke: a partial-coverage event shows ONLY
  the rings it actually has a cut for (§4.9 — never a fake ring).
*/

function badgeTier(t: GalaCode | null): BadgeGala {
  return t ?? "NONE";
}

export function StrokeWheel({
  events,
  scale,
  size = 360,
  title,
}: {
  events: ProfileEvent[];
  /** The ring layout from `getStrokeProfile` — how many rings and which galas. */
  scale: RingScale;
  size?: number;
  title?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  const L = buildWheelLayout(events, size, scale);
  const { cx, cy, hub, gap, maxBarR, ringR, ringPos } = L;
  // Outer band, spaced in ring-units so it scales with the wheel: the stroke arc
  // sits just past the longest possible bar, its label further out. Distance
  // numbers are NOT a fixed ring (that collided with the stroke labels) — each
  // is pinned to its own bar's tip, so they distribute by length, not by angle.
  const arcR = maxBarR + gap * 0.28;
  const labelR = maxBarR + gap * 0.9;

  // Bar thickness: constant px, scaled to how many spokes share the circle.
  const barWidth = Math.max(6, Math.min(15, (360 / Math.max(events.length, 1)) * 0.3));

  // Which galas appear anywhere → which ring labels to print (never a ring with
  // no cut on any spoke). The query already prunes empty rings, so this is a
  // belt-and-braces guard rather than the primary filter.
  const tiersPresent = new Set<GalaCode>();
  for (const e of events) {
    for (const c of e.cuts) tiersPresent.add(c.gala);
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
            that gala's cut (a partial spoke shows only its real rings). */}
        {scale.order.map((t) =>
          L.bars.map((b) =>
            b.hasCut(t) ? (
              <path
                key={`ring-${t}-${b.index}`}
                d={arcPath(cx, cy, ringR(ringPos[t] ?? 0), b.slotStart, b.slotEnd)}
                fill="none"
                stroke="var(--color-gray-300)"
                strokeWidth={1}
                strokeDasharray="2 3"
                strokeLinecap="butt"
              />
            ) : null,
          ),
        )}

        {/* Data spokes bloom in on mount; the hub + reference rings stay static as
            a stable frame. Resting state is fully drawn (see .wheel-bloom). */}
        <g
          className="wheel-bloom"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
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

          // Hardest first, so the sentence reads like the tooltip's cut list.
          const cuts = [...b.event.cuts]
            .reverse()
            .map((c) => `${GALA_SHORT[c.gala]} ${formatTime(c.timeMs)}`)
            .join(", ");
          const ariaLabel =
            `${b.event.label}: ` +
            (b.event.pbMs !== null ? `PB ${formatTime(b.event.pbMs)}` : "no meet time") +
            (cuts ? `; cuts ${cuts}` : "") +
            (b.event.highestGala ? `; meets ${GALA_MEDIUM[b.event.highestGala]}` : "") +
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
        </g>

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

        {/* Ring labels — small chips at 12 o'clock so they read over bars. */}
        {ringTiers(scale)
          .filter((r) => tiersPresent.has(r.tier))
          .map((r) => {
          const y = cy - ringR(ringPos[r.tier] ?? 0);
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

      {/* Tooltip — event, PB (tabular), every ring's cut, highest gala. */}
      {hovered && (
        <WheelTooltip
          bar={hovered}
          scale={scale}
          cx={cx}
          cy={cy}
          ringR={ringR}
          size={size}
        />
      )}
    </div>
  );
}

function WheelTooltip({
  bar,
  scale,
  cx,
  cy,
  ringR,
  size,
}: {
  bar: ReturnType<typeof buildWheelLayout>["bars"][number];
  scale: RingScale;
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
        <TierBadge gala={badgeTier(e.highestGala)} />
      </div>
      <div className="mt-1 time tnum text-ink">
        {e.pbMs !== null ? formatTime(e.pbMs) : "—"}
        <span className="ml-1.5 text-xs font-normal text-ink-faint">
          {e.pbMs !== null ? "meet PB" : "no meet time"}
        </span>
      </div>
      <dl className="mt-2 space-y-0.5 border-t border-border pt-1.5 text-xs">
        {ringTiers(scale).map((r) => (
          <CutRow key={r.tier} label={r.label} ms={cutFor(e, r.tier)} />
        ))}
      </dl>
      {!e.fullCoverage && (
        <p className="mt-1.5 text-2xs leading-tight text-ink-faint">
          Partial coverage — only the galas shown have a cut here.
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
