---
target: RoadScreen (Step A galas rework)
total_score: 38
p0_count: 0
p1_count: 0
timestamp: 2026-08-17T10-49-06Z
slug: components-road-roadscreen-tsx
---
# Critique — the four Step A qualifying screens (5 galas, both courses)

Target: `components/status/StatusMatrixScreen.tsx`, `components/road/RoadScreen.tsx`,
`components/standards/StandardsScreen.tsx`, `components/admin/AdminToursScreen.tsx`.

Reviewed after reworking the qualifying model from three long-course-only tiers into five
galas with separate short- and long-course cuts. Three defects were found and fixed during
this pass; scores below are post-fix.

## Anti-Patterns Verdict

**LLM assessment: not AI-generated.** These screens inherit a committed, specific design
system (Outfit, `gray-50` canvas, one indigo accent, `rounded-2xl` cards, tabular figures on
every time) and the new work stays inside it. No card-in-card, no gradient text, no
glassmorphism, no eyebrow-above-every-section, no hero-metric tile, no over-rounding, no
border-plus-wide-shadow pairing. Density is deliberate and earned: the matrix is a real
data grid with a sticky header and sticky swimmer column, not a card wall.

The one genuinely novel decision — extending a 3-hue "ascending prestige ramp" to five
galas — was resolved by *abandoning the ramp claim* rather than inventing two more ramp
steps. `DESIGN.md` now states that with five galas the hues are a categorical identity set
and that difficulty order lives in `GALA_ORDER` and the label, never in colour. That is the
honest reading and it removes a claim the code could no longer support.

**Deterministic scan: clean.** `detect.mjs --json` over all four screens plus `TierBadge`
and `TargetTierToggle` returned `[]` (exit 0). No false positives to discount.

## Design Health Score

### StatusMatrixScreen — 36/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton on first load; refetch dims the grid instead of replacing it; the tour-date note names exactly which galas judge on tour-day age |
| 2 | Match System / Real World | 4 | "Best of both / Long / Short", real gala names, "time to next gala" |
| 3 | User Control and Freedom | 3 | Filters clear cleanly, but no state is in the URL — a coach cannot bookmark or share a filtered grid |
| 4 | Consistency and Standards | 4 | FilterBar primary/popover split, shared Select + Segmented, one TierBadge vocabulary |
| 5 | Error Prevention | 4 | Read-only surface; the display age-band filter is structurally unable to leak into a cut lookup (enforced server-side) |
| 6 | Recognition Rather Than Recall | 3 | The L/S marker is explained in the legend, but "Best of both = either course counts" lives only in the page description, far from the cells it governs |
| 7 | Flexibility and Efficiency | 3 | Sticky header/column and a genuinely dense grid, but no cell keyboard navigation and no export |
| 8 | Aesthetic and Minimalist Design | 4 | The grid is the hero; toolbar is one slim row; no nested containers |
| 9 | Error Recovery | 3 | Distinct empty states for "no standards" and "no swimmers match", but no state for a failed query |
| 10 | Help and Documentation | 4 | Resolution note, legend and description carry the domain rules without a help modal |

### RoadScreen — 38/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Skeleton, tour note, aged-up note, and an explicit ineligible state |
| 2 | Match System / Real World | 4 | "Gap to the cut", gala names, LC/SC row tags |
| 3 | User Control and Freedom | 3 | Swimmer, target and course all selectable; no URL state |
| 4 | Consistency and Standards | 4 | Same picker and toolbar language as the matrix |
| 5 | Error Prevention | 4 | Nothing destructive |
| 6 | Recognition Rather Than Recall | 4 | Every row now names its own course, so no cross-referencing the toolbar |
| 7 | Flexibility and Efficiency | 3 | "All galas" covers only the three age-graded galas — SANS/SANY need the single-gala target |
| 8 | Aesthetic and Minimalist Design | 4 | Bars lead; chasing / qualified / no-time are grouped, not interleaved |
| 9 | Error Recovery | 4 | Swimmer-not-found, no-standards, ineligible, and no-cuts-at-this-age are four distinct, specific states |
| 10 | Help and Documentation | 4 | Description explains the either-course rule; the tour note explains the age rule |

### StandardsScreen — 35/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Skeleton rows and inversion warnings, but nothing tells you how many cuts exist for the selected course |
| 2 | Match System / Real World | 4 | "Long (50m)" / "Short (25m)", gala names, "All ages" for an open standard |
| 3 | User Control and Freedom | 3 | Delete confirms; a mistyped time save has no undo beyond retyping |
| 4 | Consistency and Standards | 4 | Shared Select / Segmented / FilterField throughout |
| 5 | Error Prevention | 4 | Server-side `assertValidCut`, an inversion warning *before* commit, and "+add" disabled where the gala has no coverage |
| 6 | Recognition Rather Than Recall | 3 | The single "All ages" row for an open gala is correct but takes a beat to read as "one cut, every age" |
| 7 | Flexibility and Efficiency | 3 | One event at a time; bulk work means the CSV import |
| 8 | Aesthetic and Minimalist Design | 4 | One table, flush rows, no nesting |
| 9 | Error Recovery | 4 | The importer reports every rejected row with a reason rather than failing the batch |
| 10 | Help and Documentation | 3 | The inversion legend is present; nothing explains the open-gala age model until you see the row |

### AdminToursScreen (Galas) — 38/40

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Loading, "Not set up", "Tour day <date>", "No date set", and a past-date hint |
| 2 | Match System / Real World | 4 | "Entry age range", "Youngest" / "Oldest", "Leave a field blank for no limit" |
| 3 | User Control and Freedom | 4 | Age range and tour date save independently; Clear is confirmed and explains the consequence |
| 4 | Consistency and Standards | 4 | Input / Button / DateField / ConfirmDialog all shared |
| 5 | Error Prevention | 4 | Inline bound validation, min-above-max rejected server-side, year bounds on the date |
| 6 | Recognition Rather Than Recall | 4 | The saved window is printed in the fieldset legend, so the blank fields are never ambiguous |
| 7 | Flexibility and Efficiency | 3 | Five cards means scrolling; no way to set one date across several galas |
| 8 | Aesthetic and Minimalist Design | 3 | Each card now carries two fieldsets and a divider — denser than the old single-purpose card, and five uneven cards read a little listy |
| 9 | Error Recovery | 4 | `notify.promise` surfaces the server message; local overrides clear only on success |
| 10 | Help and Documentation | 4 | The page description explains the birthday rule in plain terms |

**All four clear the ≥ 35/40 gate. StandardsScreen sits exactly on it.**

## Overall Impression

The qualifying model got materially more complex — five galas instead of three, two courses
instead of one, plus an age-eligibility gate — and the screens absorbed it without becoming
harder to read. That is the win. The matrix still answers "is my swimmer in?" in one glance,
and it now answers it *correctly*, because "either course qualifies" is the real entry rule.

The biggest remaining opportunity is not visual: it is that none of these screens put their
state in the URL. A coach who filters the matrix to one squad and short course cannot send
that view to anyone.

## What's Working

**The course dimension did not double the interface.** The honest naive implementation of
"both courses qualify" is two grids, or twice the columns. Instead the matrix carries one
grid with a three-way mode and a two-character marker on the cells that earned it. The
column set genuinely does not change between modes, because the only SCM-exclusive events
(25 m, 100 IM) have no cut at any gala — that is a real domain fact doing design work.

**Ineligibility is a named state, not an empty list.** A 13-year-old targeting SANS now gets
"Age 13 can't enter SA Senior National Aquatic Championships" and a pointer to the admin
screen. The lazy version returns zero rows, which reads identically to "no standards
imported" — a coach would have gone looking for a data bug that isn't there.

**Warn-don't-block survived contact with real bad data.** The 2027 tables contain a genuine
age inversion (SANJ women 100 Back, 12&U faster than 13). It is transcribed verbatim, the
editor flags it, and a test pins it as the *only* permitted one so a new inversion still
fails CI. Nothing was quietly "fixed" to make the data look tidy.

## Priority Issues

### [P0] Road rows did not say which course they were measured in — FIXED

**Why it matters:** In "best of both" mode different events legitimately resolve in different
courses, because a swimmer can be nearer the short-course cut on one event and the
long-course cut on another. A row reading `1:01.00 → 1:00.00 · +1.0s to SANJ` gave no
indication whether that was the 50 m or the 25 m cut. A coach planning entries would act on
the wrong number, and the screen's own description promised the opposite.

**Fix applied:** a `CourseTag` (`LC` / `SC`, with an `sr-only` full word) on every row of all
three groups — chasing, qualified, and no-time-yet. Suppressed when the course is pinned,
where the toolbar already answers it and a tag on every row would be noise.

### [P1] The badge's course marker was invisible to screen readers — FIXED

**Why it matters:** `TierBadge` rendered the course as a bare `L` or `S` with the expansion
only in a `title` on a `<span>`, which assistive tech does not reliably announce. A screen
reader user heard "SANJ L". DESIGN.md's own rule is that colour is never the sole signal;
the same logic applies to a single letter.

**Fix applied:** an `sr-only` "(long course)" / "(short course)" rides with the letter.

### [P1] The standards gala filter was a six-segment control — FIXED

**Why it matters:** This is the exact control I had just replaced on the Road screen for not
fitting on a phone, reintroduced two files later ("All" + five galas = six segments). Shipping
both would have been an internal inconsistency, and the standards editor is the screen most
likely to be used on a laptop *and* poolside.

**Fix applied:** the shared styled `Select`, matching the Road target picker.

### [P2] No screen puts its state in the URL

**Why it matters:** The matrix has four independent controls (gender, age band, squad, course
mode) and Road has three. None survive a refresh or a shared link. For a tool whose job is
squad decisions, "look at this view" is a normal thing to want to say to an assistant coach.

**Fix:** lift the filters into `useSearchParams` / `router.replace`, defaulting to today's
values so existing links keep working.

**Suggested command:** `$impeccable harden components/status/StatusMatrixScreen.tsx`

### [P2] "Best of both" explains itself too far from the cells

**Why it matters:** The rule that either course qualifies is genuinely surprising — it
overturns what this app did last week. It is stated in the page description, then never
again near the grid. A coach who lands mid-scroll sees `SANJ S` and has to infer.

**Fix:** put the sentence in the legend row, next to the `L / S` key that already lives
there, rather than only in the header.

**Suggested command:** `$impeccable clarify components/status/StatusMatrixScreen.tsx`

### [P3] Road's "All galas" silently covers only three of the five

**Why it matters:** The option reads as "all", and it is not: it renders the three
age-graded galas, because it is fed by the calibrated ring scale that SANS/SANY have no
place on. The label overclaims.

**Fix:** rename the option "All age-graded galas", or say so in the section subtitle. The
underlying five-ring redesign is deliberately Step B; the label should not pretend otherwise
in the meantime.

**Suggested command:** `$impeccable clarify components/road/RoadScreen.tsx`

## Persona Red Flags

**Sam (Coach, poolside on a phone, right after a session).** The matrix toolbar now carries
a three-option course Segmented plus a Filters popover; on a narrow screen the Segmented
labels ("Best of both") are the widest thing in the row and will wrap before the grid does.
The grid itself scrolls horizontally inside its card, which is correct, but finding one
swimmer's 200 Breast cell on a phone is still a two-axis scroll hunt. No search-by-swimmer
on this screen.

**Priya (Parent / viewer, on a phone, occasionally).** Lands on Road for her daughter. The
course tags `LC` / `SC` are new vocabulary with no expansion visible on screen — the
`sr-only` text helps a screen reader but not a sighted parent who does not know that a
25 m pool produces faster times. She may read the SC row as simply "a better result".

**Alex (Super-user, maintaining reference data).** The Galas screen is genuinely good for
them: independent saves, inline validation, and the saved window echoed in the legend. But
correcting SANY's real age window means editing one card among five, and there is no
indication anywhere in the app that the seeded 17–25 is a *provisional* value rather than a
federation fact. A "not confirmed" marker on that one gala would prevent it silently
hardening into truth.

## Minor Observations

- `getQualificationMatrix` returns `courseMode` but the client ignores it in favour of local
  state. Harmless, but it is now a value with no reader.
- The matrix legend has grown to eight items (five badges plus three key entries). It still
  wraps cleanly, but it is at the point where a second row of explanation is likely.
- `AdminToursScreen` is still filed under `/admin/tours` and named `AdminToursScreen` while
  the screen is now titled "Galas". The route and the component name have drifted from the
  content.
- The `windowLabel` in the fieldset legend shows the *saved* value while the inputs may be
  dirty. That is arguably correct (it is the current state) but there is no cue that the
  fields have diverged from it beyond the enabled Save button.

## Questions to Consider

- The matrix asks a coach to choose a course mode before it can answer. Is "best of both"
  ever the wrong default, or should the toggle be demoted to the Filters popover so the
  screen simply answers the question and offers the breakdown on request?
- Road's target picker and the matrix's course mode are both per-page and unpersisted.
  `CLAUDE.md` claimed a persisted default existed for two revisions before this pass caught
  that it never did. Was the original instinct right — should a coach set "we are aiming at
  SANJ this season" once, globally?
- Five galas, two courses, and an age window is three dimensions on one grid. Is there a
  swimmer-centric view that would answer "where is this swimmer going?" better than a matrix
  ever can — closer to what the Road screen already does for one gala at a time?
