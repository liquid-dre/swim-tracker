# Access control model

How Swim Tracker decides who can see and edit what. This is the **authoritative
spec** for roles, club scoping, and field-level swimmer privacy. Every rule here
is **enforced server-side** in Convex queries/mutations (never only hidden in the
UI). Extends BRD §2, §5.9.

## Roles

| Role | Who | Powers |
|---|---|---|
| **SUPER_USER** | The system owner (one, or few) | Manages **global reference data** — qualifying standards, season start/end dates, tour dates. Sees everything. |
| **COACH** | A club's coach — belongs to exactly one club (`profiles.clubId`) | **Edits** the swimmers in **their own club** (times, coach notes, sensitive fields). Reads every swimmer as **public** for comparison. |
| **VIEWER** | A swimmer or parent | Read-only. Sees the **sensitive** view only for their **linked** swimmer(s); everyone else is public-only. |

One coach ↔ one club (assumption — revisit if a coach must span clubs).

## Public vs sensitive fields (per swimmer)

**Public** — visible to *any signed-in user* for *any* swimmer (this is what
makes the leaderboard / cross-swimmer progression work):

- Name, gender, **age / age band** (derived — not the exact DOB)
- Event times & full **progression history**, PBs, comparison/leaderboard standing

**Sensitive** — visible only to the swimmer's **own-club coach**, the
**SUPER_USER**, and the swimmer's **linked viewer(s)** (parent/self):

- Exact **date of birth**
- **Height / weight** and other personal info
- **Coach notes** (swimmer notes + per-result notes)

**Coach-only** — visible only to coaches (own club) and the SUPER_USER, **not**
even to the swimmer/parent:

- **Projections** (time-to-qualify estimates)

## Edit rules

- Only **coaches** (and the SUPER_USER) write swimmer records. Viewers never write.
- A coach may edit a swimmer **only when `swimmer.clubId === coach.clubId`**. Other
  clubs' records are read-only to them (public view). This lets many clubs share
  one system: each coach logs times/notes for their own swimmers and still sees how
  they compare against everyone, without being able to touch other clubs' data.
- **Standards, season start/end dates, tour dates** are written by the
  **SUPER_USER only**; every other role reads them (read-only).

## Access by email (viewer linking)

When a coach creates a swimmer they enter the swimmer's / parents' **email
addresses**. Each becomes a grant so those accounts get the **sensitive** view of
that swimmer. Grants are stored **by email** and bind to the account on first
sign-in, so a coach can pre-authorise people **before** they have signed up.

## Permission matrix

| Capability | Super-user | Coach (own club) | Coach (other club) | Swimmer/parent (own child) | Anyone (other swimmers) |
|---|---|---|---|---|---|
| Public: name, age band, times, history, comparison | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sensitive: DOB, height/weight | ✅ | ✅ | 🔒 | ✅ | 🔒 |
| Coach notes | ✅ | ✅ | 🔒 | ✅ | 🔒 |
| Projections | ✅ | ✅ | 🔒 | ❌ | ❌ |
| Edit swimmer records | ✅ (all) | ✅ | ❌ | ❌ | ❌ |
| Edit standards / season dates / tour dates | ✅ | 👁 | 👁 | 👁 | 👁 |

## Build phases

1. **Foundations** *(done)* — schema: `clubs`, `profiles.clubId`, `swimmers.clubId`,
   `heightCm`/`weightKg`, `settings.seasonEnd`; this spec. (All additive/optional,
   so the running app is unaffected until later phases consume them.)
2. **Field-level privacy** *(done)* — `authz.swimmerViewer` (`full`/`sensitive`/
   `public` per swimmer); `getProgression` redacts DOB for a public view and gates
   projections (`canSeeProjections`); the chart omits the cut overlay when DOB is
   hidden.
3. **Open viewer reads** — *done:* `getEventComparison` + `getProgression` accept
   any signed-in user with public-scoped payloads (non-regressive); public read on
   `getApplicableStandards`; a `/me/rankings` viewer leaderboard (reuses the coach
   `ComparisonBarChart`, highlights the viewer's own swimmer, personal standing
   callout) with a viewer nav entry. Passed impeccable critique 36/40.
   *Still to add:* a browse-any-swimmer picker on `/me/progress`.
4. **Super-user admin** — add the `SUPER_USER` role (nav, guards, return
   validators); standards, season start/end, tour dates editable only by the
   super-user; read-only elsewhere.
5. **Club-scoped editing** — coaches edit only their own club's swimmers.
6. **Email-at-creation linking** + UI/nav for every role (each screen re-passing
   the impeccable ≥ 35/40 gate).

**Deferred:** tour dates entity (fields TBD).
