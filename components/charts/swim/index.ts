/*
  Swim-specific chart parts.

  `components/charts/` is VENDORED from the bklit registry — treat it as
  third-party and expect `shadcn add` to overwrite it. This folder is OURS, kept
  separate for exactly that reason. Each piece exists because bklit has no
  equivalent, not because bklit's was inconvenient:

    ValueAxis       bklit labels dates and categories, never the value scale.
    GalaCutOverlay  there is no reference-line primitive at all, and a cut is a
                    step function that a full-width grid row cannot express.
    SwimDots        SeriesMarkers styles a whole series; swim type is per point.
    tooltip         the panel is bklit's; only the stack inside it was duplicated.

  Two deliberate edits DO live in the vendored tree, both commented as LOCAL
  EDIT: the `yDomain` and `xLabelFormat` props on time-series-chart-shell.tsx /
  line-chart.tsx, and "GalaCutOverlay" in the underlay set in
  chart-child-passthrough.ts.
*/

export { GalaCutOverlay, type CutLine, type NoteLine } from "./GalaCutOverlay";
export { SwimDots, type SwimMark } from "./SwimDots";
export { ValueAxis } from "./ValueAxis";
export {
  SWIM_TOOLTIP_PANEL,
  TooltipMeta,
  TooltipMetaDivider,
  TooltipRows,
  TooltipTitle,
  TooltipValue,
} from "./tooltip";
