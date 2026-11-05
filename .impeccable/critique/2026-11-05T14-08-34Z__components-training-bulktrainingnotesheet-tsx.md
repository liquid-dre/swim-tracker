---
target: Bulk training note sheet
total_score: 35
p0_count: 0
p1_count: 0
timestamp: 2026-11-05T14-08-34Z
slug: components-training-bulktrainingnotesheet-tsx
---
# Critique — Bulk training note sheet (`components/training/BulkTrainingNoteSheet.tsx`)

Assessment A (independent design review, source-level) scored the first cut **29/40**; Assessment B (detector) found **0** issues. The P1/P2 items below were fixed in the same change; the table is the post-fix score.

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 4 | Skeleton now uses the Skeleton primitive (was white-on-white); result/empty states are `role="status"`. |
| 2 | Match system / real world | 3 | Roster button now reads "Note to several swimmers". |
| 3 | User control and freedom | 3 | Cancel / Escape / Clear / per-group untick; no batch undo (copies are deleted one by one). |
| 4 | Consistency and standards | 4 | Checkbox focus ring matches MeetEntriesSheet; description carries the sibling's "and to their viewers" clause. |
| 5 | Error prevention | 4 | Select-all under a search is labelled "Select the N shown in X" and the count stays over the whole squad. |
| 6 | Recognition rather than recall | 4 | `picked/total · N shown` while searching. |
| 7 | Flexibility and efficiency | 4 | List capped at 40vh with sticky squad headers; search; per-squad select-all; Clear. |
| 8 | Aesthetic and minimalist design | 3 | One picker, three fields, one footer. |
| 9 | Error recovery | 3 | Server error verbatim with the form preserved; the disabled submit still gives no reason (same as the single composer). |
| 10 | Help and documentation | 3 | Band stated once in the header; both empty states explain themselves. |
| **Total** | | **35/40** | Passes the gate |

## Fixed from Assessment A
- [P1] Group had no accessible name (legend nested in a flex div) → `role="group" aria-labelledby`.
- [P1] Uncapped list pushed the note fields off-screen → `max-h-[40vh] overflow-y-auto`, sticky headers.
- [P1] Select-all under search mislabelled, header count read "1/1" → separate shown vs total; aria-label names the shown count.
- [P2] Invisible skeleton → Skeleton primitive, `aria-label="Loading swimmers"`.
- [P2] Live region included the Clear button → live span isolated; rows get `focus-within`, 44px touch height, checkbox `focus-visible` ring.
- [P2] Coach not told parents read these → "visible to them and to their viewers."
- [P3] Search input focus shadow snapped → transitions box-shadow too; button copy.

## Still open (P3)
- No batch undo; disabled submit without a reason (sibling parity). Age column at `text-xs` is at AA, not above.
