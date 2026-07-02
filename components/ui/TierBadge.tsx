// Tier badge — the standard hierarchy SANJ > LEVEL_3 > LEVEL_2 > none, rendered
// on the shared shadcn Badge (components/ui/badge.tsx) so the tier scale reads as
// one deliberate system across the status matrix, standards and Road screens.
//
// Colour is NEVER the sole signal: each badge carries its text label (SANJ / L3 /
// L2 / —), so it reads in greyscale and under colour-blindness (DESIGN.md,
// PRODUCT.md A11y). The medal glyph rides only on the top tier (SANJ) as an
// optional flourish, aria-hidden, never the meaning itself.

import { Medal } from "lucide-react";

import { Badge, type badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";

export type Tier = "SANJ" | "LEVEL_3" | "LEVEL_2" | "NONE";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

const TIER_VARIANT: Record<Tier, BadgeVariant> = {
  SANJ: "sanj",
  LEVEL_3: "l3",
  LEVEL_2: "l2",
  NONE: "none",
};

const TIER_LABEL: Record<Tier, string> = {
  SANJ: "SANJ",
  LEVEL_3: "L3",
  LEVEL_2: "L2",
  NONE: "—",
};

export function TierBadge({
  tier,
  className,
}: {
  tier: Tier;
  className?: string;
}) {
  const isNone = tier === "NONE";
  return (
    <Badge
      variant={TIER_VARIANT[tier]}
      className={cn("gap-0.5", className)}
      title={isNone ? "No tier met" : `${TIER_LABEL[tier]} standard met`}
    >
      {tier === "SANJ" && (
        <Medal aria-hidden strokeWidth={2.25} className="-ml-0.5" />
      )}
      <span>{TIER_LABEL[tier]}</span>
    </Badge>
  );
}
