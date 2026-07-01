// Tier badge — the standard hierarchy SANJ > LEVEL_3 > LEVEL_2 > none.
// Colour is NEVER the sole signal: each badge carries a text label AND a glyph,
// so it reads in greyscale and under colour-blindness (DESIGN.md, PRODUCT.md A11y).

export type Tier = "SANJ" | "LEVEL_3" | "LEVEL_2" | "NONE";

type TierSpec = { label: string; glyph: string; className: string };

const TIERS: Record<Tier, TierSpec> = {
  SANJ: {
    label: "SANJ",
    glyph: "◆",
    className: "bg-tier-sanj-bg text-tier-sanj-ink border-tier-sanj-border",
  },
  LEVEL_3: {
    label: "L3",
    glyph: "●",
    className: "bg-tier-l3-bg text-tier-l3-ink border-tier-l3-border",
  },
  LEVEL_2: {
    label: "L2",
    glyph: "○",
    className: "bg-tier-l2-bg text-tier-l2-ink border-tier-l2-border",
  },
  NONE: {
    label: "—",
    glyph: "",
    className: "bg-transparent text-ink-muted border-border border-dashed",
  },
};

export function TierBadge({ tier }: { tier: Tier }) {
  const spec = TIERS[tier];
  const isNone = tier === "NONE";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs font-medium leading-none ${spec.className}`}
      title={isNone ? "No tier met" : `${spec.label} standard met`}
    >
      {spec.glyph && (
        <span aria-hidden className="text-[0.65em] leading-none">
          {spec.glyph}
        </span>
      )}
      <span>{spec.label}</span>
    </span>
  );
}
