---
target: tour-dates feature (admin tours + tour qualification + resolution-rule surfacing)
total_score: 28
p0_count: 0
p1_count: 1
timestamp: 2026-07-08T07-12-53Z
slug: tours-tour-qualification-resolution-rule-surfacing
---
# Critique — Tour dates feature (admin tours, tour qualification, resolution-rule surfacing)

Source-read critique of git range 1923915..HEAD (app not launchable; no browser evidence). Detector: clean (0 findings) on the five changed UI files.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Projection silently retargets the tour-day cut; stroke profile / Road-All judged under the tour rule with no caption |
| 2 | Match System / Real World | 2 | Lower-tier empty state is factually false under highest-tier-only grouping; AgeUpNote overclaims under partial tour coverage |
| 3 | User Control and Freedom | 3 | Clear behind ConfirmDialog with honest consequences; no undo after save (acceptable) |
| 4 | Consistency and Standards | 3 | Margin chip "−7.00" (unitless, sign-prefixed) vs app-wide "7.00s under"/"+7.00s to go"; rule surfaced on 3 of 6 affected surfaces |
| 5 | Error Prevention | 3 | Past-date warning only appears after save; Save silently disabled when date empty |
| 6 | Recognition Rather Than Recall | 2 | Cut value hover-title only (unreachable on touch); matrix caption never names which tiers have dates |
| 7 | Flexibility and Efficiency | 2 | No accelerators beyond deep links (app norm) |
| 8 | Aesthetic and Minimalist Design | 4 | Calm, on-token, table-first; zero detector findings |
| 9 | Error Recovery | 3 | ConfirmDialog inline alert; specific server messages surfaced via notify.promise |
| 10 | Help and Documentation | 3 | Good contextual rule captions, but one (AgeUpNote) is now wrong in a tour-date world |
| **Total** | | **28/40** | **Good — below the ≥35 gate; fails chiefly on copy accuracy** |

## Anti-Patterns Verdict
Does not read as AI slop. Detector clean. Tokens, tables, badges, empty states all reuse the committed system. The failures are semantic (copy that misstates the resolution rule), not visual.

## Priority Issues

- **[P1] Lower-tier empty state states a falsehood** — components/qualification/QualificationScreen.tsx:105: "No one has met a {tier} cut yet." Grouping is highest-tier-only (convex/tours.ts:256-262 walks TIER_ORDER and breaks at the first qualifying tier), so a swimmer qualifying SANJ never appears under L3/L2 even though she has met those cuts. Squad of one SANJ qualifier → L3 and L2 sections both claim no one has met their cuts. On a product whose brand is "correctness is the feature", this is the exact overclaim class from the last round. Fix: "No one whose highest tour is Level 3" / "Anyone who qualifies here is already listed under a higher tour."
- **[P2] AgeUpNote's blanket claim is wrong under partial tour coverage** — components/qualifying/AgeUpNote.tsx:23-26 says "existing bests still count at the age they were swum." convex/analysis.ts (getStrokeProfile) suppresses the note only when ALL THREE tiers have tour dates. With only SANJ dated, a swimmer's birthday triggers the note on Stroke profile and Road-All while their SANJ judgement is actually pinned to age-on-tour-day — the note misstates the rule for that tier. Fix: scope the wording ("for tiers without a tour date…") or mention the pinned tiers.
- **[P2] Progression projection retargets the tour-day cut invisibly** — components/progression/ProgressionChart.tsx:483-486 aims the projection at computeAge(dob, tourDate); ProjectionNote (519-556) and ProgressionScreen render no mention of the tour. Swimmer aged 13 with a SANJ tour after her 14th birthday: dashed line heads to the age-14 cut while the drawn stepped SANJ overlay shows the age-13 cut today — the projection crosses a y-value matching no visible line, unexplained. The convex validator comment even promises "screens that explain their resolution" (convex/analysis.ts:31-36); the screen doesn't. Fix: extend ProjectionNote: "targets the SANJ cut at age 14 — their age on tour day (1 Dec 2026)."
- **[P2] Margin chip breaks the app's delta vocabulary and has a −0.00 edge** — QualificationScreen.tsx:154-156 renders "−{formatSeconds(marginMs)}" with no unit; the title (148) says "inside by 7.00", also unitless. Everywhere else deltas read "+7.00s" (RoadScreen.tsx:477), "7.00s under" (514), "7.00s to go" (QualifyingProgress.tsx:190). And equality qualifies (convex/tours.ts:243 skips only timeMs > cutMs), so a PB exactly on the cut renders "−0.00". Fix: reuse "0.42s under", special-case zero as "on the cut".
- **[P3] Cut time reachable only via hover title** — QualificationScreen.tsx:148: the cut and margin explanation live in a title attribute on a static li. On touch (below lg — poolside, the stated context) and for keyboard/screen-reader users the cut value is unreachable; the matrix at least pairs titles with visible gap text and sr-only spans. Fix: visible cut in the chip or an sr-only span.

## Persona Red Flags
- **Coach, mid-season scan (power user)**: reads "No one has met a Level 3 cut yet" and reports to parents that nobody is L3-ready — wrong, the L3-ready kids are all in the SANJ section. Also can't see cut times on a phone (title-only).
- **Super-user (admin)**: sets last season's date by mistake; no warning until after save (AdminToursScreen.tsx:90,137 shows the past-date hint only for the persisted value), and every screen keeps saying "age on tour day" with no staleness cue.
- **Parent viewer**: sees the AgeUpNote on their swimmer's stroke profile claiming existing bests still count at age-as-swum while the SANJ judgement has quietly moved to tour-day age.

## Minor Observations
- Status matrix caption (StatusMatrixScreen.tsx:158-161) never names which tiers have dates or the dates; the qualification headers do — inconsistent recognition support.
- Admin description "every qualifying screen judges swimmers… the age they'll be on tour day" (AdminToursScreen.tsx:47): future tense wrong for past dates; the progression historical overlay deliberately stays age-as-of-date, so "every" is a slight overclaim.
- Save silently disabled when a name is typed but no date set — no hint why.
- TIER_FULL map duplicated in four components — drift risk.
- getTourQualification is N+1 (up to 500 swimmers × take(2000) results) — Convex read-limit risk at large rosters.
- cleanTourDate accepts any 4-digit year server-side (client constrains 1900–2100).
- AdminToursScreen `today` uses UTC while DateField is local — inPast can flip near midnight.

## What's Working
- The resolution rule is genuinely one rule: tierResolutionAges / pickApplicableStandardsPerTier feed matrix, dashboard, comparison, stroke profile; getTourQualification's cutAge chain (tourAge ?? ageAtSwim ?? today) matches exactly; the flip and clear round-trip is tested (convex/authz.test.ts:244-304).
- Access control is airtight and tested: requireSuperUser on writes, requireCoach on the cross-roster read, viewer rejection asserted; nav + isRouteAllowed boundary consistent.
- Per-tier qualification headers state the applicable rule truthfully for partial coverage, with a role-aware "set a date" deep link only the super-user sees.
- States are complete (skeletons, standards-missing, empty roster, no-date) and everything sits on DESIGN.md tokens; tiers stay labeled, never colour-only.

## Questions to Consider
- Should a swimmer who qualifies for SANJ also be visible (dimmed?) under the lower tours they'd otherwise make, since squads often send one swimmer to multiple tours?
- When a tour date passes, should the tier auto-revert to age-as-swum rather than keep judging at a stale past-day age?
- Should the projection's target dot carry the tour name on the chart itself, not just the note?
