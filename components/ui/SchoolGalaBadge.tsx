// School-gala badge (BRD §R15). A school gala is a PARENT-entered, UNOFFICIAL
// time: it tracks a swimmer's progress but never counts toward a personal best
// or any qualifying surface. Wherever such a time appears it must say so LOUDLY
// — a warning-toned pill with a hollow-ring glyph that mirrors the chart's
// hollow marker, never a faint grey pill. Colour is never the sole signal: the
// "School gala · unofficial" label always rides along.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TITLE =
  "Unofficial — a school gala time. It shows your swimmer's progress but never counts toward personal bests or qualifying.";

export function SchoolGalaBadge({
  compact = false,
  className,
}: {
  /** Drop the "· unofficial" tail for very tight rows (the glyph + title keep the meaning). */
  compact?: boolean;
  className?: string;
}) {
  return (
    <Badge variant="warning" className={cn("gap-1.5", className)} title={TITLE}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full border-[1.5px] border-current bg-transparent"
      />
      School gala
      {!compact && <span className="font-normal opacity-80">· unofficial</span>}
    </Badge>
  );
}
