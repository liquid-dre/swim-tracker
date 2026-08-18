"use client";

import { useChart, useYScale } from "../chart-context";
import { cutSegment } from "./geometry";

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
  /** Hover/AT text. Renders a small flag at the top of the line when set. */
  title?: string;
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
        <g key={note.key} style={{ cursor: "default" }}>
          {note.title ? <title>{note.title}</title> : null}
          <line
            stroke={note.color}
            strokeDasharray={note.dash}
            strokeOpacity={0.5}
            strokeWidth={1}
            x1={atX(note.x)}
            x2={atX(note.x)}
            y1={0}
            y2={innerHeight}
          />
          {note.title ? (
            <g transform={`translate(${atX(note.x)}, 0)`}>
              {/* A generous transparent hit area so the flag is easy to tap. */}
              <rect fill="transparent" height={14} width={16} x={-4} y={-2} />
              <path d="M0 1 L8 3.5 L0 6 Z" fill={note.color} />
            </g>
          ) : null}
        </g>
      ))}
      {cuts.map((cut) => (
        // Full-width rule, dated segment or birthday riser — cutSegment decides,
        // and a test pins which shape each kind of cut gets.
        <line
          key={cut.key}
          stroke={cut.color}
          strokeDasharray={cut.dash}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          {...cutSegment(cut, atX, yScale, innerWidth)}
        />
      ))}
    </g>
  );
}

GalaCutOverlay.displayName = "GalaCutOverlay";

export default GalaCutOverlay;
