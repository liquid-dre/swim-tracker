/*
  Swim-specific chart parts.

  `components/charts/` is VENDORED from the bklit registry — treat it as
  third-party and expect `shadcn add` to overwrite it. This folder is OURS, kept
  separate for exactly that reason. Each piece exists because bklit has no
  equivalent, not because bklit's was inconvenient:

    ValueAxis        bklit labels dates and categories, never the value scale.
    GalaCutOverlay   there is no reference-line primitive at all, and a cut is a
                     step function that a full-width grid row cannot express.
    ValueThresholds  the bar-chart sibling of the above — a value on a
                     categorical chart, not a date on a time scale.
    SwimDots         SeriesMarkers styles a whole series; swim type is per point.
    SwimBars         Bar takes one fill for the series and has no value labels;
                     the comparison chart needs a colour per bar and a time on
                     each. Attendance keeps bklit's Bar, which suffices there.
    tooltip          the panel is bklit's; only the stack inside it was duplicated.

  Four deliberate edits DO live in the vendored tree, each commented LOCAL EDIT:

    yDomain          time-series-chart-shell.tsx + line-chart.tsx — the derived
                     domain pins positive data to a zero baseline.
    xLabelFormat     the same two files — upstream x labels drop the year.
    valueDomain      bar-chart.tsx — the derived value domain scans <Bar>
                     dataKeys and falls back to [0, 110] when a chart draws its
                     own bars, and cannot reach past the slowest threshold.
    maxLabelWidth    bar-y-axis.tsx — the category label was capped at 70px
                     regardless of the gutter reserved for it.

  Plus the two names in the underlay set in chart-child-passthrough.ts.
*/

export { GalaCutOverlay, type CutLine, type NoteLine } from "./GalaCutOverlay";
export { SwimBars, type SwimBar } from "./SwimBars";
export { SwimDots, type SwimMark } from "./SwimDots";
export { ValueAxis } from "./ValueAxis";
export { ValueThresholds, type Threshold } from "./ValueThresholds";
export {
  ValueZones,
  type CategoryZones,
  type ZoneBand,
} from "./ValueZones";
export {
  SWIM_TOOLTIP_PANEL,
  TooltipMeta,
  TooltipMetaDivider,
  TooltipRows,
  TooltipTitle,
  TooltipValue,
} from "./tooltip";
