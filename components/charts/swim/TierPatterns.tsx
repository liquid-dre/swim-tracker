"use client";

import { useId } from "react";

import { renderPatternPreset } from "../pattern-preset";
import { TIER_STYLE } from "@/components/analysis/chartTheme";
import type { GalaCode } from "@/lib/swim";

/*
  Textured fills for gala-coloured BARS.

  TIER_STYLE already gives a gala two channels beyond hue when it is drawn as a
  LINE: a glyph and a dash pattern. A filled bar can carry neither — there is no
  stroke to dash and no room for a glyph inside a 22px bar — so on the
  comparison and road charts the bar's gala was hue alone. In greyscale, or for
  a red/green-blind reader, SANJ gold and Level 3 indigo can land close enough
  to be a coin toss.

  So each gala also owns a PATTERN, getting denser as the gala gets harder,
  exactly as its dash gets longer. The tile keeps the gala's colour as its
  background and draws the texture over it in a darker ink, so the bar still
  reads as "the SANJ colour" at a glance and as "the SANJ texture" on a closer
  look. Nothing is taken away; a channel is added.

  Ids are `useId`-scoped because two charts on one page (road's single-gala and
  all-gala views) would otherwise define the same pattern id twice, and SVG
  resolves a duplicate id to whichever came first.
*/

export function useTierPatternIds(): (gala: GalaCode) => string {
  const base = useId().replace(/:/g, "");
  return (gala: GalaCode) => `${base}-tier-${gala.toLowerCase()}`;
}

/**
 * The `<defs>` for every gala in `tiers`. Render inside the chart, once per
 * chart, and paint bars with `url(#id)` from the same `idFor` this was given.
 */
export function TierPatterns({
  tiers,
  idFor,
}: {
  tiers: ReadonlyArray<GalaCode>;
  idFor: (gala: GalaCode) => string;
}) {
  if (tiers.length === 0) return null;
  return (
    <defs>
      {tiers.map((gala) => {
        const st = TIER_STYLE[gala];
        return (
          <g key={gala}>
            {renderPatternPreset(st.pattern, idFor(gala), {
              // The texture is drawn in the gala's darker `ink`, over a tile
              // painted in its `color` — so the bar keeps its hue and gains a
              // shape. Using `color` for both would make the texture invisible.
              color: st.ink,
              tileBackground: st.color,
              scale: 0.85,
              strokeWidth: 1,
            })}
          </g>
        );
      })}
    </defs>
  );
}

TierPatterns.displayName = "TierPatterns";

export default TierPatterns;
