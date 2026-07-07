import { User, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
  Scope badge for a training note (§R16). A note is either PERSONAL (about this
  one swimmer) or a SQUAD note (about a whole squad the swimmer belongs to). The
  two must never be confused, so each wears a distinct tone AND a distinct icon —
  colour is never the only signal; the label ("Personal" / the squad name) always
  rides along. Personal takes the brand tint (it's the swimmer's own thread);
  squad notes read as a quieter, shared neutral so a run of them doesn't shout.
*/
export function ScopeBadge({
  scope,
  squadName,
  className,
}: {
  scope: "SQUAD" | "SWIMMER";
  squadName?: string | null;
  className?: string;
}) {
  if (scope === "SWIMMER") {
    return (
      <Badge
        className={cn(
          "gap-1 border-brand-100 bg-brand-50 text-brand-600",
          className,
        )}
        title="A note about this swimmer"
      >
        <User aria-hidden strokeWidth={2} />
        Personal
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className={cn("max-w-[16rem] gap-1", className)}
      title={squadName ? `A squad note — ${squadName}` : "A squad note"}
    >
      <Users aria-hidden strokeWidth={2} />
      <span className="truncate">
        Squad{squadName ? <span className="text-ink">: {squadName}</span> : ""}
      </span>
    </Badge>
  );
}
