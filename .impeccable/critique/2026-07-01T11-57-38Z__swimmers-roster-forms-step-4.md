---
target: Swimmers roster + forms (Step 4)
total_score: 37
p0_count: 0
p1_count: 0
timestamp: 2026-07-01T11-57-38Z
slug: swimmers-roster-forms-step-4
---
# Critique — Swimmers roster + forms (Step 4)

Register: product. Targets: `components/swimmers/RosterTable.tsx` (presentational),
`SwimmersScreen.tsx` (Convex data + toolbar), `SwimmerForm.tsx` (add/edit slide-over),
`components/ui/Textarea.tsx`. Verified with realistic mock data via a throwaway harness
(list + open form) at 1200px.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton rows while loading; every mutation speaks via notify (loading→success/error); active/all scope and search are visible state |
| 2 | Match System / Real World | 4 | Plain columns (Swimmer, Age, Gender, Squads, Status); age in whole years; squads as chips; "Add swimmer" |
| 3 | User Control and Freedom | 4 | Cancel + close on the form; deactivate is reversible (Reactivate); swimmers are never hard-deleted, preserving history/PBs |
| 4 | Consistency and Standards | 4 | Table follows DESIGN.md (surface-2 header, hairline rows, tabular age, right-aligned actions); slide-over reuses the component vocabulary; one teal accent |
| 5 | Error Prevention | 4 | Date input bounded by max=today; Save disabled until name + valid DOB; server re-validates (real date, age 0–120); duplicate squad membership is idempotent |
| 6 | Recognition Rather Than Recall | 4 | Squads, status, and age all shown inline; nothing to remember between screens |
| 7 | Flexibility and Efficiency | 3 | Search + status filter; no bulk actions or keyboard shortcuts yet |
| 8 | Aesthetic and Minimalist Design | 4 | A real table, not a card grid; calm rhythm; the form is a quiet slide-over, not a modal-first reflex |
| 9 | Error Recovery | 3 | Server errors surface as the server's own message via notify; the form stays open to retry, but field errors are toast-level, not inline |
| 10 | Help and Documentation | 3 | The DOB hint explains *why* (age-exact cuts); empty states teach the next action |
| **Total** | | **37/40** | **Strong — ships** |

## Anti-Patterns Verdict

**LLM assessment**: Not slop. The roster is a genuine table — surface-2 header, hairline row
separators, tabular-figure ages that align, squads as small neutral chips, a semantic status
dot (green = active, faint = inactive), and a right-aligned overflow menu. No card grid, no
hero tiles, no gradient. The add/edit form is a right-side slide-over (the product-register
choice over a modal-first reflex) with our own Input/Textarea/Segmented vocabulary, a live
"Age N today" hint off the DOB, and a disabled primary until the form is valid. Deactivation
is reversible and never deletes, matching the domain rule that PBs/history are sacrosanct.

**Deterministic scan**: `detect.mjs --json` over the table, screen, form, and Textarea returned
`[]` (exit 0). No ghost-card border+shadow, no side-stripe, no over-rounding, no gradient text.

**Visual overlays**: Not injected; verified by screenshots of the running build — the populated
table (active scope, squad chips, mixed ages) and the open "Add swimmer" slide-over.

## Overall Impression

This is what the BRD asks for: a coach can scan many swimmers fast and act on any row without
leaving the table. Density and scannability beat hand-holding, and the slide-over keeps add/edit
in-context. The presentational `RosterTable` is cleanly separable from its Convex data, which is
why it could be critiqued honestly with mock rows. Biggest opportunity: move validation feedback
inline so a rejected field says so next to itself, not only in a toast.

## What's Working

- **Table, not cards.** Tabular ages align, the header is the second-neutral, rows are hairline-
  separated. Exactly the dense, legible logbook the product wants.
- **Never-delete, reversible.** Deactivate toggles `active` (server-enforced) and can be undone;
  history and PBs survive. The status column and the Active/All scope make the state legible.
- **Two-sided validation.** The client disables Save and bounds the date; the server is the
  authority (real date, sane age, idempotent membership), so a crafted request can't corrupt data.

## Priority Issues

- **[P2] Field errors are toast-only.** A server rejection (e.g. an impossible DOB that slips past
  the client) shows as a toast, not beside the field. **Fix**: catch the mutation error in the form
  and map it to the relevant field's `error` prop (Input already renders it). **Command**: `$impeccable harden`.
- **[P3] Deactivate has no undo affordance.** It's reversible via the row menu, but an accidental
  tap needs a second navigation to fix. **Fix**: add an "Undo" action to the success toast that
  flips `active` back. **Command**: `$impeccable harden`.
- **[P3] Search re-queries per keystroke.** Fine at club scale, wasteful at hundreds. **Fix**: debounce
  ~200ms before updating the query arg. **Command**: `$impeccable optimize`.

## Persona Red Flags

**Coach (poolside, fast entry)**: Add is a two-field-minimum slide-over with a live age readout;
search + Active/All narrow the list; row actions are one tap. No red flag in the core flow. Bulk
CSV import is a later step, not missing here.

**Parent/Viewer**: Not applicable — these are coach-only screens (server-gated via requireCoach);
the VIEWER experience arrives in Step 15.

## Minor Observations

- Empty states are scope-aware ("No active swimmers yet" vs "No swimmers yet" vs "No match").
- Squads render as neutral chips, not tier badges, so they don't collide with the qualifying-tier
  colour language.
- The "—" in the Squads/Description cells is a null-value marker (consistent with tier-none), not
  prose punctuation.

## Questions to Consider

- Should a row open a swimmer detail view (times, progression) on click, with the menu for edit/
  deactivate — or is the roster purely a management surface?
- Is Active-only the right default, or should a coach see everyone until they choose to hide the
  inactive?
