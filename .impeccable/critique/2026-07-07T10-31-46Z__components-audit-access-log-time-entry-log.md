---
target: Access log + Time-entry log (R17)
total_score: 36
p0_count: 0
p1_count: 0
timestamp: 2026-07-07T10-31-46Z
slug: components-audit-access-log-time-entry-log
---
# Critique — Access log + Time-entry log (§R17)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeletons, "X of Y events" count, capped-list footnote, active-filter badge, empty states. |
| 2 | Match System / Real World | 4 | "Access log", Invited/Claimed/Revoked, "Logged by", "Entered by role", status pills — coach language. |
| 3 | User Control and Freedom | 3 | Read-only surface (nothing to escape); every filter clears, secondary filters reset via Clear all. |
| 4 | Consistency and Standards | 4 | Reuses PageHeader, FilterBar, Select, DateField, Badge, and the exact table vocabulary of HistoryTable. |
| 5 | Error Prevention | 4 | Read-only, so few error surfaces; the date-range fields are min/max-bounded so an invalid range can't be set. |
| 6 | Recognition Rather Than Recall | 4 | Filter options are derived from the log (pick, don't type); events, roles and status are labelled chips. |
| 7 | Flexibility and Efficiency | 3 | Five filters per log cover the audit questions; no keyboard shortcuts or export yet. |
| 8 | Aesthetic and Minimalist Design | 4 | Dense but quiet — one accent, colour always paired with a label, no decoration. |
| 9 | Error Recovery | 3 | Filtered-to-empty state names the fix ("Clear a filter"); no destructive paths to recover from. |
| 10 | Help and Documentation | 3 | Each log's PageHeader explains it; "approver" tag, "System" enterer, and the cap footnote teach in place. |
| **Total** | | **36/40** | **Excellent** |

## Anti-Patterns Verdict

**LLM assessment**: Reads as a competent admin/audit surface, not AI slop. These are dense filterable tables with status pills, event badges and role chips — the earned-familiarity pattern the product register wants (Linear/Stripe-adjacent), not invented affordances. Colour is always paired with a text label (status, event, role), so both logs read in greyscale. No hero-metric tile, no gradient, no card-in-card, no eyebrow. The one deliberate accent (indigo) is reserved for the active filter badge and coach role chip; the warning tone is used only where it means something (a viewer/parent acted, a pending state).

**Deterministic scan**: `detect.mjs --json` over `components/audit` + `HistoryTable.tsx` returned `[]` (clean).

**Visual overlays**: Not available — rendering the logs needs a live Convex deployment (not provisioned here), so Assessment B is the deterministic detector only; browser overlay skipped (fallback signal: no deployment).

## Overall Impression

Both logs do the one job an audit trail must: answer "who did what, when, by which account" without ambiguity. The single anchor per screen is the chronological table; filters collapse into a slim toolbar so nothing competes with the record. The biggest craft decision that pays off is treating the two logs as one system — identical toolbar, table chrome, chips and empty states — so a coach learns one surface and reads both.

## What's Working

1. **Colour-plus-label discipline.** Every status (Active/Pending/Revoked/Expired), event (Invited/Claimed/…) and role (Coach/Admin/Viewer) carries its word, so nothing depends on a coach distinguishing two greens. The viewer/parent role deliberately takes the warning tone — the one actor a coach most needs to notice.
2. **Provenance that can't be faked.** Revoke/unlink delete the live row, so the append-only `accessEvents` log captures who removed access before it's gone; the time log reads real `enteredBy`/`lastEditedBy` — a removed account degrades to "(removed account)", never a fabricated name.
3. **Honest capping.** The time log footnote says "showing the most recent" when it hits the server limit, instead of implying the list is exhaustive.

## Priority Issues

- **[P2] Wide tables scroll horizontally on ~375px.** Both logs are 6–7 columns; on mobile they scroll inside their card (the documented pattern) rather than reflowing to stacked rows. Acceptable for a coach's occasional audit on a phone, but a stacked card layout under `sm` would read better. *Fix later:* a `<md` card variant per row. Command: `$impeccable adapt`.
- **[P3] No export.** A true audit trail often needs to leave the tool (CSV/print) for records. Out of scope for R17; worth a follow-up.
- **[P3] Time-log date range filters entry date only.** A coach might want to filter by swim date too; a small toggle would cover both. Minor.

## Persona Red Flags

**Sam (Accessibility)**: Tables use `<th scope="col">`; status/event/role meaning is text, never colour alone; selects and the calendar inherit the app's focus rings; the horizontal scroll region is keyboard-scrollable. No red flags. One watch item: the row-provenance detail in the swimmer history rides in a `title` tooltip, but the same facts are fully spelled out in the dedicated Time-entry log, so nothing is hover-locked.

**Riley (Stress-tester)**: Long viewer emails / names sit on a `nowrap` line and scroll rather than breaking layout. Empty log → teaching empty state; filtered-to-nothing → distinct "clear a filter" state; a capped result set is labelled. A removed account or swimmer resolves to "(removed …)" rather than crashing or blanking. Self-request events (Requested/Approved/Denied) are recorded too, so the log stays truthful even though R17's headline is coach-initiated invites.

**Casey (Distracted mobile coach)**: Filters stack cleanly; the table scrolls horizontally under a thumb; state is query-backed so leaving and returning loses nothing. Touch targets follow the app's h-9/size-8 standard.

## Minor Observations

- The "By" column resolves correctly per event: the inviting coach (tagged "approver") on Claimed, "System" on Expired, the acting coach elsewhere — so a single column answers "which account" honestly across event types.
- Parent-entered school-gala times read as unofficial in two reinforcing ways: the SchoolGala badge in the Type column and the Viewer role chip on the enterer.
- Filter option lists are derived from the visible log, so they never offer a swimmer/coach with zero rows.

## Questions to Consider

- Should the access log expose UNLINKED vs REVOKED as distinct statuses, or is the single "Revoked" status (with the precise event in the Event column) the right altitude? (Current answer: status is the *current* state; the event column carries the nuance.)
- Is a CSV/print export worth adding for coaches who must keep off-tool records?
