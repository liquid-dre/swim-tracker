"use client";

import { useChart, useYScale } from "../chart-context";

/*
  Qualifying-cut overlay (BRD §4.9).

  A gala's cut is not a constant: for an age-graded gala it changes on the
  swimmer's birthday, so the honest drawing is a STEP function — a horizontal
  segment at the cut for each stretch of age, joined by a vertical riser at the
  birthday. For an open gala (SANS / SANY) there is one cut at every age, so the
  line spans the full width.

  bklit has no reference-line primitive at all — no `ReferenceLine`, no
  `ReferenceDot`. `Grid` can place extra rows at chosen values, but a grid row
  runs the full width by construction, which would flatten a stepped cut into a
  single wrong line. So this is ours.

  It renders nothing but `<line>` elements from the geometry `buildTierOverlay`
  already produces, in the plot's own coordinate space (children sit inside a
  `<g>` translated by the margin, so scale outputs are used directly).

  Registered in UNDERLAY_COMPONENT_NAMES so cuts sit above the gridlines and
  below the swim series — a cut is context for the data, never on top of it.
*/

/** One drawn cut: a full-width rule, a dated segment, or a birthday riser. */
export type CutLine = {
  key: string;
  color: string;
  /** SVG dash pattern — the second, greyscale-legible signal beyond colour. */
  dash: string;
  /** Cut value (ms) — the y of a horizontal line, or the riser's start. */
  y: number;
  /** True when this cut applies across the whole x-domain (an open gala). */
  full: boolean;
  /** Segment start (epoch ms). Ignored when `full`. */
  x1: number;
  /** Segment end (epoch ms). Ignored when `full`. */
  x2: number;
  /** Set = this is a VERTICAL riser at x1, from cut `y` to cut `y2`. */
  y2?: number;
};

/** A dated vertical annotation — a training-note marker, not a cut. */
export type NoteLine = {
  key: string;
  /** Epoch ms. */
  x: number;
  color: string;
  dash: string;
};

export interface GalaCutOverlayProps {
  cuts: ReadonlyArray<CutLine>;
  /** Vertical annotations drawn beneath the cuts (training-phase dates). */
  notes?: ReadonlyArray<NoteLine>;
  strokeWidth?: number;
  strokeOpacity?: number;
  yAxisId?: string | number;
}

export function GalaCutOverlay({
  cuts,
  notes = [],
  strokeWidth = 1.5,
  strokeOpacity = 1,
  yAxisId,
}: GalaCutOverlayProps) {
  const { xScale, innerWidth, innerHeight } = useChart();
  const yScale = useYScale(yAxisId);

  const atX = (ms: number) => xScale(new Date(ms));

  return (
    <g className="chart-gala-cuts">
      {notes.map((note) => (
        <line
          key={note.key}
          stroke={note.color}
          strokeDasharray={note.dash}
          strokeWidth={1}
          x1={atX(note.x)}
          x2={atX(note.x)}
          y1={0}
          y2={innerHeight}
        />
      ))}
      {cuts.map((cut) =>
        cut.y2 === undefined ? (
          <line
            key={cut.key}
            stroke={cut.color}
            strokeDasharray={cut.dash}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
            x1={cut.full ? 0 : atX(cut.x1)}
            x2={cut.full ? innerWidth : atX(cut.x2)}
            y1={yScale(cut.y)}
            y2={yScale(cut.y)}
          />
        ) : (
          // Birthday riser: joins the cut before to the cut after, so a stepped
          // standard reads as one continuous line rather than two orphans.
          <line
            key={cut.key}
            stroke={cut.color}
            strokeDasharray={cut.dash}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
            x1={atX(cut.x1)}
            x2={atX(cut.x1)}
            y1={yScale(cut.y)}
            y2={yScale(cut.y2)}
          />
        ),
      )}
    </g>
  );
}

GalaCutOverlay.displayName = "GalaCutOverlay";

export default GalaCutOverlay;
