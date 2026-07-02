import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/*
  shadcn/ui Badge on our tokens (DESIGN.md §4/§5). Structure only in the base;
  colour lives in the variants so every badge reads from the same vocabulary.
  The tier variants (sanj / l3 / l2) carry the semantic tier scale — a subtle
  tinted surface + tier-coloured ink + a matching hairline border, so a tier
  badge looks deliberate rather than a default grey pill. `none` is the muted
  dashed-outline "no tier met" state. Colour is never the sole signal here — the
  label text (SANJ / L3 / L2) always rides along (see TierBadge).
*/
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium leading-none transition-[color,background-color,border-color] [transition-duration:var(--dur-1)] focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-brand-500 text-white",
        secondary: "border-transparent bg-gray-100 text-gray-700",
        outline: "border-border text-ink-muted",
        success: "border-success-subtle bg-success-subtle text-success-ink",
        sanj: "border-tier-sanj-border bg-tier-sanj-bg text-tier-sanj-ink",
        l3: "border-tier-l3-border bg-tier-l3-bg text-tier-l3-ink",
        l2: "border-tier-l2-border bg-tier-l2-bg text-tier-l2-ink",
        none: "border-dashed border-border bg-transparent text-ink-muted",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
