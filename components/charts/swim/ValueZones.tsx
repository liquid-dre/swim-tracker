"use client";

import { useChart, useYScale } from "../chart-context";

/*
  Faint tinted bands running along each bar's track, marking the value ranges
  that lead up to each qualifying gala.

  PER CATEGORY, not chart-wide — and that is the whole reason this is a separate
  component from ValueThresholds rather than a mode of it. The gala MARKERS are
  shared: on the road "all galas" view every bar is drawn on one calibrated ring
  scale, so a single set of lines labels every row (that is ValueThresholds' job).
  The BANDS are not shared, because coverage is per event (§4.9): a 50 has no L3
  or SANJ cut, a 200 Fly has no L2 cut. Tinting those ranges anyway would draw a
  zone for a standard that does not exist for that event — the same lie as a
  faked ring on the stroke-profile wheel.

  So each bar names its own bands, and anything it does not name stays neutral
  track. Drawn as an underlay (registered in chart-child-passthrough's underlay
  set alongside ValueThresholds) so the tints sit above the gridlines and below
  the data: context for the swim, never on top of it.
*/

export type ZoneBand = {
  /** Start of the band on the value scale. */
  from: number;
  /** End of the band on the value scale. */
  to: number;
  /** Fill for the band — a `-bg` tier tint, never a full-strength tier colour. */
  color: string;
};

export type CategoryZones = {
  key: string;
  /** Must match the chart's `xDataKey` value for this row. */
  category: string;
  bands: ReadonlyArray<ZoneBand>;
};

export interface ValueZonesProps {
  zones: ReadonlyArray<CategoryZones>;
  /** Cap on band thickness, matched to the bars they sit behind. Default: 26 */
  maxBarSize?: number;
  /** Corner radius on the outer ends of a category's band run. Default: 4 */
  radius?: number;
  yAxisId?: string | number;
}

export function ValueZones({
  zones,
  maxBarSize = 26,
  radius = 4,
  yAxisId,
}: ValueZonesProps) {
  const { barScale, bandWidth, orientation } = useChart();
  const yScale = useYScale(yAxisId);

  if (!(barScale && bandWidth)) return null;
  const horizontal = orientation === "horizontal";
  const thickness = Math.min(bandWidth, maxBarSize);

  return (
    <g className="chart-value-zones">
      {zones.map((z) => {
        const band = barScale(z.category);
        if (band === undefined) return null;
        // Centre on the same axis SwimBars centres on, so the tint sits exactly
        // behind its bar rather than a few pixels off it.
        const offset = band + (bandWidth - thickness) / 2;

        return (
          <g key={z.key}>
            {z.bands.map((b, i) => {
              const a = yScale(b.from);
              const c = yScale(b.to);
              const lo = Math.min(a, c);
              const span = Math.abs(c - a);
              if (!(span > 0)) return null;

              return horizontal ? (
                <rect
                  key={i}
                  fill={b.color}
                  height={thickness}
                  rx={radius}
                  width={span}
                  x={lo}
                  y={offset}
                />
              ) : (
                <rect
                  key={i}
                  fill={b.color}
                  height={span}
                  rx={radius}
                  width={thickness}
                  x={offset}
                  y={lo}
                />
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

ValueZones.displayName = "ValueZones";

export default ValueZones;
