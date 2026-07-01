# Swim PB & Progression Tracker — Business Requirements Document & Build Plan

**Owner:** (Dre, on behalf of his dad — head coach)
**Primary user:** Head coach + assistant coaches
**Secondary users:** Swimmers / parents (read-only, scoped to their own data)
**Stack:** Next.js (App Router) + Convex + Recharts + TypeScript + Tailwind
**Status:** v1 scope locked, now including LCM qualifying standards (SSA-style). Splits and meet import deferred to later phases.

---

## 1. Purpose

A tool for a swim coach to record race times, surface each swimmer's personal bests, compare swimmers within an event, and visualise how every swimmer is progressing over time. The system must answer three questions instantly:

1. What is swimmer X's PB for a given event, and when was it set?
2. How do swimmers compare against each other in a given event (filtered by age group / gender)?
3. How has a swimmer (or group of swimmers) progressed since they were added?

---

## 2. Roles & access

| Role | Capabilities |
|------|-------------|
| **Coach** | Full CRUD on swimmers, squads, and results. Sees all swimmers. Can link viewer accounts to swimmers. |
| **Viewer** (swimmer / parent) | Read-only. Sees only the swimmer(s) their account is linked to: PB board, history, and progression charts for those swimmers. No comparison view across other swimmers' identities (see §4.7). |

Access control is enforced **server-side in every Convex query/mutation** via the authenticated identity → role → scope. Never rely on the client to hide data.

---

## 3. Scope

**In scope (v1)**
- Auth with two roles (coach, viewer) and swimmer↔viewer linkage.
- Swimmer records (name, DOB, gender, active flag, optional squad membership).
- Squads / groups (named, many-to-many membership).
- Logging individual race results: final time only, tagged by swim type and course.
- Personal-best board per swimmer (per event × course).
- Cross-swimmer comparison leaderboard + chart, filtered by age group, gender, and event.
- Progression view (line chart + history table) for one swimmer or a selected group.
- "Improvement since added" metric per event.
- **Qualifying standards** (LCM only): reference lines on progression + comparison charts, and a qualification-status matrix, against three tiers (Level 2, Level 3, SANJ) using single-year age cuts (§4.9).
- Mobile-first responsive UI (poolside entry on a phone is a first-class use case).

**Out of scope (v1) — deferred, see §10**
- Per-50 split times.
- Relays.
- CSV/Hy-Tek/Meet Manager import.
- Goal setting, notifications, PDF/report export.
- Predictive trend lines / taper modelling.

---

## 4. Domain rules

These are the rules the AI builder must encode correctly. Getting them wrong silently corrupts the data.

### 4.1 Strokes
`FREE`, `BACK`, `BREAST`, `FLY`, `IM` (individual medley).

### 4.2 Course (pool length)
`SCM` (short course, 25 m) and `LCM` (long course, 50 m). **PBs are tracked separately per course** — a 100 Free SCM PB and a 100 Free LCM PB are different records and must never be merged or compared against each other.

### 4.3 Event whitelist
An event is the combination **distance × stroke**. Not every combination is a real event. Seed exactly this matrix (and make it editable in a config table rather than hard-coded):

| Distance | Valid strokes | Course notes |
|----------|---------------|--------------|
| 50 m  | FREE, BACK, BREAST, FLY | SCM + LCM. No 50 IM. |
| 100 m | FREE, BACK, BREAST, FLY, IM | All SCM + LCM, **except 100 IM is SCM-only** (no long-course 100 IM). |
| 200 m | FREE, BACK, BREAST, FLY, IM | SCM + LCM. |
| 400 m | FREE, IM | SCM + LCM. No 400 of single non-free strokes. |
| 800 m | FREE | SCM + LCM. Distance free; has SANJ standards (§4.9). |
| 1500 m | FREE | SCM + LCM. Distance free; has SANJ standards (§4.9). |

`logResult` must reject any (distance, stroke, course) tuple not in this whitelist.

### 4.4 Time storage & format
- **Store** every time as an integer number of **milliseconds** (`timeMs`) — the single source of truth. This makes sorting, min(), and deltas trivial and exact.
- **Canonical text format = `m:ss:hh`** (minutes : seconds : hundredths, colon-separated, minutes always present even when 0). Examples: `28.91 s` → `0:28:91`; `1:07.47` → `1:07:47`. This is the format the standards CSV uses and what `formatTime` emits.
- **`parseTime` must be bulletproof** — it must never silently misread a valid time. Normalisation rules, applied in order:
  1. Replace commas with the appropriate separator (L2 data uses `,` as the decimal).
  2. Split on `:` and `.`. The **last** numeric group is always hundredths; the group before it is seconds; the group before that (if present) is minutes.
  3. **2 groups** → interpret as `ss:hh` (seconds.hundredths), NOT `mm:ss`. So `59:09` = 59.09 s, never 59 minutes. (This resolves the sub-minute ambiguity in the source data.)
  4. **3 groups** → `mm:ss:hh`.
  5. Validate: seconds 0–59, hundredths 0–99, result > 0 and within sane per-event bounds. **Reject** (throw) anything that fails — a bad row fails loudly rather than seeding a wrong time.
- `formatTime(ms)` is the inverse, always emitting canonical `m:ss:hh`.
- (UI note: on-screen we *may* render the swim-desk convention `mm:ss.hh` with dropped zero minutes for readability. Confirm — otherwise the app shows `0:28:91` everywhere. Flagged in §11.)

### 4.5 Swim types
Every result is tagged `MEET`, `TIME_TRIAL`, or `PRACTICE`.

### 4.6 Personal best definition
- **Headline PB = the fastest `MEET` time** for that swimmer in that (distance, stroke, course). Time trials and practice times **do not** count toward the headline PB.
- Each PB display must show **the date it was set** and the meet name.
- `overallBest` (fastest across all swim types) is computed and available, but is **secondary** — show it only where explicitly useful (e.g. progression charts), never as the headline number.
- **Progression charts plot all logged times** (all types) so the trajectory is complete, with `MEET` results visually distinguished and the headline PB marked.

### 4.7 Age groups
- Bands: **9-10, 11-12, 13-14, 15-16, 17&O** (two-year). Store the band scheme as editable config.
- Age is computed from **DOB**. Each result stores `ageAtSwim` (the swimmer's age on the swim date) so historic data stays accurate as swimmers age up.
- The **comparison filter** defaults to a swimmer's **current** age band (age as of today).
- ⚠️ **Decision to confirm before build:** "age as of when" — most federations define age-group eligibility as either *age on the day of competition* or *age as of 31 December of the season*. This changes which band a swimmer near a birthday lands in. The doc assumes **age on the swim date**. Confirm against your local (Zimbabwe / regional) federation rules and adjust the `computeAgeGroup` helper accordingly — it's the one rule most likely to need localisation.

### 4.8 Comparison correctness
A comparison is only valid within a single (distance, stroke, **course**). The comparison UI must require a course selection — you cannot rank SCM and LCM times together.

### 4.9 Qualifying standards
Three qualifying tiers are loaded from the SSA tables: `LEVEL_2`, `LEVEL_3`, `SANJ`.

- **Hierarchy (confirmed — inverted from the names):** `SANJ` is hardest (fastest cut), then `LEVEL_3`, then `LEVEL_2` (easiest / entry). All "highest standard met" logic and colour ranking must order tiers `SANJ > LEVEL_3 > LEVEL_2`.
- **Course:** every standard is **long course (LCM) only**. Qualifying reference lines and status are shown **only on LCM charts/PBs**; hidden entirely for SCM (§4.2).
- **Age matching = exact single-year age.** Cuts are per exact age, with youngest as `10&U` / `11&U` / `12&U` catch-alls (varies by tier) and `17-19` as the top band. Match a swimmer to the cut for their **exact age**, not the two-year display band (§4.7). Age taken as of the result's swim date.
- **Coverage is a hard rule, not just missing data — enforce it:**
  - **50 m: Level 2 only.** You **cannot** qualify for Level 3 or SANJ on a 50 m time. No 50 m L3/SANJ line ever renders.
  - **Level 2: maximum event is 200 m (+ 200 IM).** You **cannot** qualify for Level 2 on any event longer than 200 m. No L2 line renders for 400/800/1500 or 400 IM.
  - **Level 3:** 100/200/400 + 200 IM only (no 50s, no 800/1500, no 200 Fly, no 400 IM). Intentional.
  - **SANJ:** 100 up to **1500** Free, all strokes' 100/200, 400 Free/IM, 200 IM (no 50s). 800/1500 are now first-class app events (§4.3).
  - Where a tier has no cut for an event/age, render **no line** for that tier — never interpolate or borrow another tier's value.
- **"Qualified" = swimmer's headline LCM MEET PB (§4.6) ≤ the cut.** Time trials/practice never qualify.
- **Standards are coach-managed (§5.9).** Initial load is a bulk import from the coach's cleaned CSV; thereafter coaches view and edit cuts in-app, and those edited values are what every chart and status computation uses. The importer rejects any row it cannot parse (§4.4) rather than guessing.

---

## 5. Functional requirements

### 5.1 Swimmers
- Coach can add / edit / deactivate a swimmer (name, DOB, gender `M`/`F`, active flag, optional notes).
- Deactivating retains all history but hides the swimmer from default rosters.
- Coach can link a viewer account to one or more swimmers.

### 5.2 Squads / groups
- Coach can create named squads and assign swimmers (many-to-many).
- A swimmer can belong to multiple squads.
- Squads drive the "group progression" view and roster filtering.

### 5.3 Logging a result
- Form fields: swimmer → distance → stroke → course → swim type → date → final time → optional meet name / venue / notes.
- Validates against the event whitelist (§4.3) and course validity.
- Computes and stores `ageAtSwim`.
- Optimised for fast repeated entry on mobile (sensible defaults, keep last-used meet/date, large time keypad).
- Coach can edit / delete a result.

### 5.4 Swimmer profile
- **PB board:** grid of events × course showing headline PB, date set, and meet.
- **History table:** all results, filterable by event/course/type, sortable by date or time.
- **Progression charts:** per selected event, all logged times over time (see §5.6).
- **Improvement summary:** per event, first recorded time → current PB, with absolute and % improvement; and overall "since added" date.

### 5.5 Comparison view
- Select event = distance + stroke + course (required).
- Filters: age group, gender.
- Output: sortable leaderboard (fastest first) + **horizontal bar chart** of each qualifying swimmer's headline PB.
- **Qualifying overlay (LCM only):** draw each applicable tier's cut as a **vertical threshold line** (`SANJ`, `LEVEL_3`, `LEVEL_2`), colour-coded and labelled. Colour each swimmer's bar by the **highest tier they've met** (see §4.9 order). Because the filter can span mixed ages while cuts are per exact age, the tier line shown is for the **selected age filter**; if "all ages" is selected, suppress the lines (a single line can't be correct for mixed ages) and rely on per-bar colour instead. Hidden entirely for SCM.
- Respects role scope (a viewer does not get a cross-roster comparison of named swimmers).

### 5.6 Progression view
- Select one swimmer **or** a group (squad or ad-hoc multi-select) + an event (distance + stroke + course).
- Line chart: x = date, y = time. **Lower time is better** — invert the y-axis (or clearly label) so improvement reads as "up/down" consistently; mark `MEET` points and the current PB.
- **Qualifying overlay (LCM only):** draw the applicable `LEVEL_2` / `LEVEL_3` / `SANJ` cuts as **horizontal reference lines** (Recharts `ReferenceLine`), colour-coded and labelled. A dot dropping **below** a line = qualified for that tier. For a single swimmer the lines use their exact age (recompute if the range crosses a birthday — note the cut can step); for a group, lines are suppressed unless all selected swimmers share the same exact age. Hidden for SCM.
- **Projection overlay (optional; single swimmer, LCM, one tier selected):** fit a linear trend to the swimmer's recent `MEET` results and extend it (dashed) to where it meets the selected tier's cut, labelled with an estimated date. **Estimate only** — requires ≥ 4 meet times and a genuine downward trend; otherwise show "not enough data / no clear trend". Cap the horizon at ~12 months (beyond that, report "beyond 12 months at current rate"). Never rendered as a commitment or a promise; the caveat label is mandatory. See §5.12.
- For a group, one line per swimmer.

### 5.7 Qualification status matrix
- Grid: **rows = swimmers** (respecting age/gender/squad filters), **columns = events** (LCM).
- Each cell shows the **highest tier met** (colour-coded: e.g. SANJ / L3 / L2 / none) plus the **gap to the next tier up** (their PB minus the next cut, formatted).
- This is the "who's ready for what" dashboard; it is the coach's primary planning surface.
- LCM only. Cells for events with no cut at any tier are blank/neutral.

### 5.8 Coach standards management
- A coach-only screen to **view and edit** the qualifying cuts that drive every chart and the status matrix.
- Browse cuts filtered by tier / gender / event; edit an individual cut's time; add a missing cut; deactivate/delete one.
- **Bulk import** from the cleaned CSV (§4.4 format, §11a checklist) for the initial load and season updates; import is idempotent and rejects unparseable rows.
- Edits take effect immediately — the `standards` table is the single source of truth; no hard-coded cut values anywhere.
- Guard rails: warn (don't block) on a monotonicity break (a younger age's cut faster than an older one within a tier) so typos surface at entry time, echoing the review in §11a.

### 5.9 Viewer experience
- Login → sees only their linked swimmer(s): PB board, history, progression (with their own qualifying lines), and their own Road-to-qualify view. Read-only, no edit controls, no other swimmers' identities. No cross-roster comparison, status matrix, season ranking, or standards editing.

### 5.10 Target-tier toggle (shared control)
- A single **target-tier selector** (`LEVEL_2` / `LEVEL_3` / `SANJ`) shared across the Road-to-qualify, %-of-cut, and projection views. Choosing a tier reframes all three to "how close to *this* meet".
- The toggle only affects LCM analysis; it is inert/hidden on SCM.

### 5.11 Road to qualify (per swimmer)
Two linked visuals for a selected swimmer at the selected target tier (§5.10), **LCM only**:
- **Gap-to-cut:** one horizontal bar per applicable event = the swimmer's headline `MEET` PB minus the tier's cut for their **exact age** (§4.9). Show the gap in both seconds and %. Events where PB ≤ cut are flagged **qualified** and grouped; events with no logged time are listed separately as "no time yet" (not drawn as a huge gap). Sorted **closest-first** so the coach sees the low-hanging events immediately.
- **%-of-cut profile:** each event's PB as a percentage of its cut (100% = on the line, < 100% = qualified), as sorted horizontal bars with a reference line at 100% (a radar view is an optional alternative). Reveals the swimmer's strongest and weakest events relative to the standard.
- Only events where the selected tier has a cut for the swimmer's exact age render (respect coverage: SANJ has no 50s, L2 nothing above 200 m, etc.).

### 5.12 Season improvement ranking
- Ranks swimmers by time dropped over the current **season** (configurable season-start app setting; default: rolling 12 months).
- **By event:** pick an event → rank swimmers by % (and seconds) improved between their first in-season `MEET` time and their current `MEET` PB.
- **Overall:** rank swimmers by average % improvement across their events.
- Uses `MEET` times (consistent with the qualifying focus). Swimmers with a single in-season data point show as "insufficient data", not 0%.
- Answers "who is responding to training" and surfaces plateaus.

---

## 6. Non-functional requirements
- **Mobile-first responsive** — primary entry happens poolside on a phone.
- **Reactive** — Convex live queries; new times appear without manual refresh.
- **Auth** — Convex Auth or Clerk; email/password is sufficient for v1.
- **Performance** — index results so PB/leaderboard queries stay fast (see §7). Derived PBs are fine at club scale (hundreds of swimmers, thousands of results); denormalise only if needed.
- **Data integrity** — server-side validation of every event/course/time; no client-trusted writes.
- **Design system & quality gate** — product-mode minimalist UI built with the Impeccable skill (`pbakaus/impeccable`). Cool near-monochrome neutrals on soft off-white, a single deep-teal accent, a semantic tier scale (`--tier-sanj` gold → `--tier-l3` → `--tier-l2` → `--tier-none`) that never relies on colour alone, and tabular figures for all swim times. Every UI screen must pass `/impeccable critique` at **≥ 35/40** (fix flagged issues, don't suppress) before it is considered done. Design tokens live in DESIGN.md; no ad-hoc hex or fonts in components.

---

## 7. Data model (Convex schema)

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const stroke = v.union(
  v.literal("FREE"), v.literal("BACK"), v.literal("BREAST"),
  v.literal("FLY"), v.literal("IM"),
);
const course = v.union(v.literal("SCM"), v.literal("LCM"));
const distance = v.union(
  v.literal(50), v.literal(100), v.literal(200),
  v.literal(400), v.literal(800), v.literal(1500),
);
const swimType = v.union(
  v.literal("MEET"), v.literal("TIME_TRIAL"), v.literal("PRACTICE"),
);

export default defineSchema({
  // App users beyond the auth table; auth provider supplies identity.
  profiles: defineTable({
    authId: v.string(),            // subject from auth provider
    name: v.string(),
    email: v.string(),
    role: v.union(v.literal("COACH"), v.literal("VIEWER")),
  }).index("by_authId", ["authId"]),

  swimmers: defineTable({
    name: v.string(),
    dob: v.string(),               // ISO date
    gender: v.union(v.literal("M"), v.literal("F")),
    active: v.boolean(),
    notes: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_active", ["active"]),

  squads: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
  }),

  squadMemberships: defineTable({
    swimmerId: v.id("swimmers"),
    squadId: v.id("squads"),
  }).index("by_squad", ["squadId"])
    .index("by_swimmer", ["swimmerId"]),

  // Which viewer account may see which swimmer(s).
  swimmerAccess: defineTable({
    profileId: v.id("profiles"),   // a VIEWER profile
    swimmerId: v.id("swimmers"),
  }).index("by_profile", ["profileId"])
    .index("by_swimmer", ["swimmerId"]),

  // Editable event whitelist (seeded from §4.3).
  events: defineTable({
    distance,
    stroke,
    allowedCourses: v.array(course),  // e.g. 100 IM => ["SCM"]
    label: v.string(),                // "100 IM"
    active: v.boolean(),
  }).index("by_distance_stroke", ["distance", "stroke"]),

  // Qualifying cuts, seeded from the coach's cleaned CSV (§4.9).
  // One row per (tier, gender, distance, stroke, exact age). LCM implied.
  // Sparse: only rows that actually have a cut exist. No row => no line.
  standards: defineTable({
    tier: v.union(v.literal("LEVEL_2"), v.literal("LEVEL_3"), v.literal("SANJ")),
    gender: v.union(v.literal("M"), v.literal("F")),
    distance,
    stroke,
    // Exact age the cut applies to. Catch-alls use a bound + isCatchAll:
    // e.g. "10&U" => age 10, isCatchAllYoung true (applies to <=10).
    // "17-19" => age 17, isCatchAllOld true (applies to >=17).
    age: v.number(),
    isCatchAllYoung: v.boolean(),
    isCatchAllOld: v.boolean(),
    timeMs: v.number(),               // the cut, in integer ms
  })
    .index("by_lookup", ["gender", "distance", "stroke", "tier"])
    .index("by_event", ["gender", "distance", "stroke"]),

  results: defineTable({
    swimmerId: v.id("swimmers"),
    distance,
    stroke,
    course,
    timeMs: v.number(),            // integer milliseconds
    swimType,
    swimDate: v.string(),          // ISO date
    ageAtSwim: v.number(),         // computed from dob + swimDate
    meetName: v.optional(v.string()),
    venue: v.optional(v.string()),
    notes: v.optional(v.string()),
    enteredBy: v.id("profiles"),
    createdAt: v.number(),
  })
    .index("by_swimmer", ["swimmerId"])
    .index("by_event", ["swimmerId", "distance", "stroke", "course"])
    .index("by_event_global", ["distance", "stroke", "course"])
    .index("by_date", ["swimDate"]),
});
```

PBs are **derived** (not stored) in v1: `min(timeMs)` over the relevant index. Revisit denormalisation into a `personalBests` table only if leaderboard queries get slow.

---

## 8. Core Convex functions

**Mutations**
- `addSwimmer`, `updateSwimmer`, `setSwimmerActive`
- `createSquad`, `addToSquad`, `removeFromSquad`
- `logResult` — validates event whitelist + course validity, parses/validates `timeMs`, computes `ageAtSwim`
- `updateResult`, `deleteResult`
- `linkViewer(profileId, swimmerId)`, `setRole`

**Queries** (each enforces role scope first)
- `listSwimmers(filters)` — coach: all; viewer: only linked
- `getSwimmerProfile(swimmerId)` — PB board + improvement summary
- `getPersonalBests(swimmerId)` — headline (MEET) PB + date + meet per event×course; overallBest secondary
- `getEventComparison({ distance, stroke, course, gender?, ageGroup? })` — leaderboard of MEET PBs, sorted ascending by time
- `getProgression({ swimmerId | swimmerIds, distance, stroke, course })` — time series (all swim types, MEET flagged); when `course === "LCM"`, also returns the applicable standard lines
- `getSquadProgression(squadId, { distance, stroke, course })`
- `getApplicableStandards({ gender, distance, stroke, age })` — returns the L2/L3/SANJ cuts for that exact age (resolving catch-alls), omitting tiers with no cut. **LCM only.**
- `getQualificationMatrix({ gender?, ageBand?, squadId? })` — per swimmer × event, highest tier met + gap to next tier (powers §5.7)
- `getRoadToQualify({ swimmerId, tier })` — per applicable LCM event: `{ cutMs, pbMs|null, gapMs, gapPct, pctOfCut, qualified }`, sorted closest-first (powers §5.11 gap + %-of-cut)
- `getSeasonImprovement({ mode: "event" | "overall", distance?, stroke?, seasonStart })` — ranked per-swimmer improvement over the season using MEET times (powers §5.12)
- `getQualifyProjection({ swimmerId, distance, stroke, tier })` — linear fit over recent MEET results → `{ slopeMsPerDay, etaDate|null, note }`, capped/guarded per §5.6 (powers the projection overlay)

**Mutations (standards)**
- `importStandards(rows)` — idempotent bulk load from the cleaned CSV; rejects unparseable rows (§4.4/§4.9), never guesses
- `createStandard`, `updateStandard`, `deleteStandard` — coach edits to individual cuts (§5.8); coach-only; used by every chart thereafter

**Shared helpers**
- `parseTime(str) -> timeMs`, `formatTime(ms) -> str`
- `computeAgeGroup(dob, asOfDate) -> band` (⚠️ §4.7 — confirm the "as of when" rule)
- `resolveStandard(gender, distance, stroke, tier, exactAge) -> timeMs | null` (applies catch-all rules)
- `highestTierMet(pbMs, cutsByTier) -> "SANJ" | "LEVEL_3" | "LEVEL_2" | null` (uses §4.9 order)
- `linearFit(points) -> { slope, intercept } | null` and `projectCrossing(fit, targetMs) -> date | null` (projection; return null on too-few points or non-downward trend)
- `isValidEvent(distance, stroke, course)`

---

## 9. Screens

1. **Login** (role resolved from profile)
2. **Coach dashboard** — roster snapshot, recent results, prominent "Log a time" CTA
3. **Swimmers** — list + add/edit/deactivate
4. **Swimmer profile** — PB board, improvement summary, progression chart, history table
5. **Log time** — mobile-optimised entry form
6. **Comparison** — event + course picker, age/gender filters, leaderboard + chart
7. **Progression** — swimmer/group + event picker, line chart (+ LCM qualifying lines)
8. **Qualification status** — swimmers × events matrix, highest tier met + gap to next (§5.7)
9. **Squads** — manage groups and membership
10. **Standards management** (coach-only) — view/edit qualifying cuts + CSV import (§5.8)
11. **Road to qualify** — per-swimmer gap-to-cut + %-of-cut, driven by the target-tier toggle (§5.10–5.11)
12. **Season improvement** — swimmer ranking by time dropped this season (§5.12)
13. **Viewer home** — own swimmer(s), read-only (profile + progression + own Road-to-qualify)

Charts via **Recharts**. Remember the inverted-time convention (§5.6) and that all qualifying overlays are **LCM-only** (§4.9). The projection overlay lives on the Progression screen (7). The **target-tier toggle (§5.10)** is shared UI state across screens 7 (projection), 11, and any per-swimmer qualifying view. Season start is a coach app-setting (default rolling 12 months).

---

## 10. Roadmap / phasing

**Phase 1 — MVP (this BRD):** auth + roles, swimmers, squads, result logging, PB board, comparison, progression, improvement metric, **LCM qualifying standards (lines + status matrix), coach standards editing, Road-to-qualify (gap + %-of-cut), season improvement ranking, and the caveated time-to-qualify projection**, viewer read-only.

**Phase 2:**
- Per-50 **split times** (extend `results` with an ordered `splits: number[]`; keep final time as the headline).
- **CSV / Hy-Tek / Meet Manager import** to bulk-load meet results.
- **Squad readiness overview** (per-meet Qualified / Close / Not-yet counts by event and age group).
- **Goal times** per swimmer + progress-to-goal (reuse the standards machinery).
- **Season-versioned standard sets** (snapshot cuts per season so historic qualification status stays accurate when standards change).

**Phase 3:**
- Predictive trend lines, season/taper tagging, relays, attendance, PDF report export, notifications.

---

## 11a. Qualifying-data cleaning checklist (coach-supplied CSV)

The raw SSA PDF must be cleaned into a CSV before import. Target columns:
`tier,gender,distance,stroke,age,isCatchAllYoung,isCatchAllOld,time`
(one row per cut; `time` normalised to `mm:ss.SS` or `ss.SS`; LCM implied).

Fix these before import — flagged from a monotonicity + cross-tier review of the uploaded file (resolutions confirmed by the coach):

**Corrected values (apply these):**
- **L2 Men 100 Back, ages 16 & 17-19:** `1:02,77` → **`1:22,77`** (`1:22:77` canonical). The `02` was a transposition of `22`.
- **L2 Men 100 Fly, age 12:** `2:22,44` → **`1:50,00`** (`1:50:00` canonical).

**Inversions / steep jumps to eyeball against source:**
- **L2 Women 200 Breast** — age 15 (`3:49,22`) faster than 16 & 17-19 (`3:51,22`); 2s inversion.
- **L2 Women 100 Fly** — 13→12 jumps 16s; internally consistent with L3/SANJ, probably real.

**Format normalisation → canonical `m:ss:hh` (§4.4):**
- L2 comma decimals (`33,68` → `0:33:68`); L3/SANJ colon-as-decimal (`1:07:47` → `1:07:47`, unchanged) with sporadic periods (`5:48.28` → `5:48:28`).
- Sub-minute `SS:SS` (`59:09`, `57:24`, `56:57`, `55:50`) → seconds.hundredths → `0:59:09`, `0:57:24`, etc. The §4.4 parser enforces "last group = hundredths, 2 groups = ss:hh" so these can't be misread.

**Coverage — hard rules, leave blank (never back-fill):**
- 50 m: **Level 2 only** (no L3/SANJ 50s — you cannot qualify L3/SANJ on a 50).
- Level 2 stops at 200 m + 200 IM (no 400/800/1500, no 200 Fly, no 400 IM — you cannot qualify L2 above 200 m).
- L3: 100/200/400 + 200 IM only. SANJ: 100–1500 + 400 IM, no 50s.
- 800/1500 Free are now first-class app events (§4.3) — **include** their SANJ rows.

The importer rejects any row it can't parse rather than guessing, so a missed typo fails loudly instead of seeding a wrong cut.

---

## 11. Assumptions to confirm

1. **Age-group "as of" rule** (§4.7) — the one most likely to need localising to your federation. Default assumed: age on swim date.
2. **Gender model** — `M`/`F` only, since events are gendered. Flag if a more inclusive model is required for display purposes.
3. **Viewer scope** — viewers do **not** get the cross-roster comparison of named swimmers (privacy). Confirm whether anonymised/relative ranking ("you're 3rd of 8") is wanted later.
4. **Auth provider** — Convex Auth assumed; switch to Clerk if you want social login / invites out of the box.
5. **Distances** — 50/100/200/400/**800/1500** (800/1500 Free added for SANJ). Confirm no other distance-stroke combos are raced.
6. **Standard tier hierarchy** (§4.9) — confirmed `SANJ > LEVEL_3 > LEVEL_2` by cross-tier check. Confirm this matches how your federation talks about the tiers before the colour ranking is built.
7. **Standards are LCM-only** — confirm none of these cuts are ever applied to short-course times in your context.
8. **Mixed-age comparison lines** (§5.5) — with exact-age cuts, a single qualifying line is only correct when one age is filtered; lines are suppressed for "all ages". Confirm that behaviour is acceptable vs. showing per-age lines.
9. **Display format** (§4.4) — canonical is `m:ss:hh`. Confirm whether on-screen times should show that literally (`0:28:91`) or use the swim-desk convention `mm:ss.hh` with dropped zero minutes (`28.91`). Storage/CSV are unaffected either way.

---

## 12. How to hand this to an AI builder

Suggested build order (each step is a self-contained prompt; the ready-to-paste versions live in `swim-tracker-build-prompts.md`):

1. **Scaffold** Next.js (App Router) + Convex + Tailwind + Recharts; auth with a `profiles` table and `role`.
2. **Schema + seed** — implement §7, seed the `events` whitelist from §4.3 (incl. 800/1500).
3. **Helpers** — bulletproof `parseTime` (§4.4), `formatTime`, `computeAge`, `computeAgeGroup`, `isValidEvent`, with unit tests.
4. **Swimmers + squads** CRUD (mutations + screens).
5. **logResult** + Log-time screen, with full validation.
6. **PB board + swimmer profile** using derived PB queries.
7. **Comparison + Progression** base views + Recharts (no standards yet).
8. **Standards data layer** — `importStandards`, `resolveStandard`, `getApplicableStandards`, `highestTierMet`, with tests (catch-all + sparse-coverage + tier order).
9. **Standards management screen** (coach-only) — view/edit cuts + CSV import + monotonicity warning (§5.8).
10. **Qualifying overlays** — LCM reference lines on progression + comparison, bar colouring by tier (§4.9, §5.5–5.6).
11. **Qualification status matrix** (§5.7).
12. **Road to qualify** — gap-to-cut + %-of-cut + shared target-tier toggle (§5.10–5.11).
13. **Season improvement ranking** + season-start setting (§5.12).
14. **Time-to-qualify projection** — `linearFit`/`projectCrossing` + guarded progression overlay (§5.6).
15. **Role scoping pass** — lock every query/mutation to role + viewer linkage; viewer home (§5.9).
16. **Mobile polish** + final BRD-conformance review.

Give the builder this whole document as context, then issue the steps one at a time so each stays small enough to verify. The companion `swim-tracker-build-prompts.md` contains Prompt 0 (ground rules) plus Prompts 1–16 matching this list.
