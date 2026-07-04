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

## Access by email (viewer linking) — *implemented*

A coach grants viewer access by **email** (at swimmer creation or on the profile's
Viewer access panel). If an account already uses that email it is linked
immediately; otherwise the grant is stored in **`pendingSwimmerAccess`** and
**binds automatically on first sign-in** (materialised in `auth.ts`) — so a coach
can pre-authorise a parent/swimmer **before** they have an account. Pending
invites are listed and can be withdrawn. Managing access is **club-scoped**: only
the swimmer's own-club coach (or the super-user) can add or revoke viewers.

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
   callout) with a viewer nav entry. Passed impeccable critique 36/40. A
   browse-any-swimmer picker on `/me/progress` (public `listSwimmersForPicker`)
   lets a viewer chart any swimmer's progression; cuts/projection stay to their
   own swimmer.
4. **Super-user admin** *(done)* — `SUPER_USER` role wired through auth (env
   allow-list bootstrap `SUPER_USER_EMAILS`), authz (superset of a coach), and
   nav/guards (`/admin/*` reserved). Standards + season start/end are
   super-user-write / everyone-read; the editors show read-only for coaches. New
   `convex/clubs.ts` (create/rename clubs, assign/remove coaches) + a super-user
   `/admin/clubs` screen (impeccable 36/40). Tour dates still deferred.
5. **Club-scoped editing** *(done)* — `authz.assertCoachManagesSwimmer` gates
   every coach write (swimmer add/update/active, result add/edit/delete, squad
   add/remove) on `swimmer.clubId === coach.clubId`; a super-user bypasses.
   `addSwimmer` stamps the owning club (coach's own, or a super-user's pick via a
   `SwimmerForm` club picker). The roster shows every swimmer but disables edit
   actions on other clubs' rows (`editable` flag). `admin.backfillDefaultClub`
   assigns legacy club-less coaches + swimmers to one default club — **run once
   after deploy**.
6. **Email-based viewer access** *(done)* — a coach grants access by email that
   links an existing account now or PRE-AUTHORISES the email (`pendingSwimmerAccess`)
   so it binds when they sign up (materialised in `auth.ts`). Emails can be entered
   at swimmer creation (`SwimmerForm`) or on the profile; `ViewerAccessSection`
   lists linked viewers and pending invites (withdrawable) and is read-only for a
   coach outside the swimmer's club. All grant/revoke mutations are club-scoped.

7. **Invite emails (Resend)** *(done)* — granting viewer access schedules a
   Resend invite (`convex/emails.ts`, an internal action) with a sign-up / open
   link, so a parent gets a real email instead of being told out-of-band. No-op
   when `RESEND_API_KEY` / `EMAIL_FROM` are unset. See `docs/environment.md`.

**Deferred:** tour dates entity (fields TBD).
