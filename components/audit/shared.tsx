import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { roleLabel, type Role } from "@/lib/nav";

/*
  Shared vocabulary for the two coach-only audit logs (§R17). Every status, event
  and role carries a TEXT label — colour is a second cue, never the only one
  (DESIGN.md / PRODUCT.md A11y). Kept deliberately quiet so a long log reads like
  a logbook, not a status board.
*/

// --- Access-event current status -------------------------------------------

export type LinkStatus = "active" | "pending" | "revoked" | "expired";

const STATUS_META: Record<
  LinkStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "border-success-subtle bg-success-subtle text-success-ink",
  },
  pending: {
    label: "Pending",
    className: "border-warning-subtle bg-warning-subtle text-warning-ink",
  },
  revoked: {
    label: "Revoked",
    className: "border-border bg-surface-2 text-ink-muted",
  },
  expired: {
    label: "Expired",
    className: "border-dashed border-border bg-transparent text-ink-faint",
  },
};

export function StatusPill({ status }: { status: LinkStatus }) {
  const m = STATUS_META[status];
  return <Badge className={cn("gap-1", m.className)}>{m.label}</Badge>;
}

// --- Access-event type ------------------------------------------------------

export type AccessEventType =
  | "INVITED"
  | "CLAIMED"
  | "REVOKED"
  | "UNLINKED"
  | "EXPIRED"
  | "REQUESTED"
  | "APPROVED"
  | "DENIED";

type Tone = "info" | "positive" | "neutral" | "muted";

export const ACCESS_EVENT_META: Record<
  AccessEventType,
  { label: string; tone: Tone }
> = {
  INVITED: { label: "Invited", tone: "info" },
  CLAIMED: { label: "Claimed", tone: "positive" },
  APPROVED: { label: "Approved", tone: "positive" },
  REQUESTED: { label: "Requested", tone: "info" },
  REVOKED: { label: "Revoked", tone: "neutral" },
  UNLINKED: { label: "Unlinked", tone: "neutral" },
  DENIED: { label: "Denied", tone: "neutral" },
  EXPIRED: { label: "Expired", tone: "muted" },
};

const TONE_DOT: Record<Tone, string> = {
  info: "bg-brand-500",
  positive: "bg-success-500",
  neutral: "bg-gray-400",
  muted: "border border-gray-300 bg-transparent",
};

export function AccessEventBadge({ type }: { type: AccessEventType }) {
  const m = ACCESS_EVENT_META[type];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink">
      <span aria-hidden className={cn("size-1.5 rounded-full", TONE_DOT[m.tone])} />
      {m.label}
    </span>
  );
}

// --- Role chip (who acted) --------------------------------------------------

const ROLE_CLASS: Record<Role, string> = {
  // A viewer (parent) acting is the one to notice, so it wears the warning tone.
  VIEWER: "border-warning-subtle bg-warning-subtle text-warning-ink",
  COACH: "border-brand-100 bg-brand-50 text-brand-600",
  SUPER_USER: "border-border bg-surface-2 text-ink-muted",
};

export function RoleChip({ role }: { role: Role }) {
  return (
    <Badge className={cn("px-1.5 font-medium", ROLE_CLASS[role])}>
      {roleLabel(role)}
    </Badge>
  );
}
