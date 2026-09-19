/*
  The SKIN of a notice — its border, fill and ink — in one place, because it had
  drifted into four spellings across the meets surfaces alone:

    border-warning-subtle bg-warning-subtle   (ImportMeetSheet, ×3)
    border-warning-500/30 bg-warning-50       (MultiMeetReview, MeetEntriesSheet)
    border-warning-500/30 bg-warning-50 +2xl  (MeetDetailScreen)

  The first of those is not a quieter variant, it is a mistake: `--warning-subtle`
  IS `--color-warning-50`, so it painted a border in exactly the fill colour —
  1.00:1, a declared edge that does not exist. It sat two elements from a danger
  callout that had a real one.

  Only the skin lives here. Radius, padding, type size and layout stay at the
  call site, because a notice inside a 576px sheet and one across a page are the
  same warning at two geometries, and a shared class that fixed both would be
  the wrong seam. Where `border-warning-subtle` is a CHIP (badge.tsx,
  audit/shared.tsx) it is left alone: a border matching the fill is how a chip
  keeps a consistent box without drawing an outline.
*/

/** Amber notice: something is off but the action can still proceed. */
export const WARNING_SURFACE =
  "border border-warning-500/30 bg-warning-50 text-warning-ink";

/** Red notice: the action is blocked, or has already gone wrong. */
export const DANGER_SURFACE =
  "border border-error-500/40 bg-error-50 text-danger-ink";
