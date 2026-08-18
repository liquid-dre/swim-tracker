// Gala badge — the five qualifying galas plus "none", rendered on the shared
// shadcn Badge (components/ui/badge.tsx) so the gala identity set reads as one
// deliberate system across the status matrix, standards and Road screens.
//
// Colour is NEVER the sole signal: each badge carries its text label (SANS /
// SANY / SANJ / L3 / L2 / —), so it reads in greyscale and under colour-blindness
// (DESIGN.md, PRODUCT.md A11y). Colour also never encodes difficulty ORDER —
// with five galas the hues are categorical; order lives in GALA_ORDER.
//
// A course marker (L/S) can ride along when the surface needs to say WHICH
// course earned the qualification, since both courses are valid for entry (§4.2).
// It is plain text with a full-word title, never a colour or a glyph alone.

import { Medal } from "lucide-react";

import { Badge, type badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { GALA_FULL, GALA_SHORT, GALA_TOKEN, type GalaCode } from "@/lib/galas";
import type { Course } from "@/lib/swim";
import type { VariantProps } from "class-variance-authority";

/** A gala, or the explicit "nothing met" state. */
export type BadgeGala = GalaCode | "NONE";

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

function variantFor(gala: BadgeGala): BadgeVariant {
  return gala === "NONE" ? "none" : (GALA_TOKEN[gala] as BadgeVariant);
}

function labelFor(gala: BadgeGala): string {
  return gala === "NONE" ? "—" : GALA_SHORT[gala];
}

const COURSE_LABEL: Record<Course, string> = {
  LCM: "L",
  SCM: "S",
};

const COURSE_FULL: Record<Course, string> = {
  LCM: "long course",
  SCM: "short course",
};

export function TierBadge({
  gala,
  course,
  className,
}: {
  gala: BadgeGala;
  /** When set, names the course this qualification was earned in. */
  course?: Course | null;
  className?: string;
}) {
  const isNone = gala === "NONE";
  const title = isNone
    ? "No gala standard met"
    : `${GALA_FULL[gala]} standard met${
        course ? ` on ${COURSE_FULL[course]}` : ""
      }`;
  return (
    <Badge
      variant={variantFor(gala)}
      className={cn("gap-0.5", className)}
      title={title}
    >
      {gala === "SANS" && (
        <Medal aria-hidden strokeWidth={2.25} className="-ml-0.5" />
      )}
      <span>{labelFor(gala)}</span>
      {!isNone && course ? (
        <span className="text-[0.9em] opacity-70">
          {COURSE_LABEL[course]}
          {/* The bare L/S is a scanning aid for sighted density; the full word is
              what a screen reader announces, since a `title` on a span is not
              reliably read out. */}
          <span className="sr-only"> ({COURSE_FULL[course]})</span>
        </span>
      ) : null}
    </Badge>
  );
}
