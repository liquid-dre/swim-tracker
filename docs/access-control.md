# Access control model

How Swim Tracker decides who can see and edit what. This is the **authoritative
spec** for roles, club scoping, and field-level swimmer privacy. Every rule here
is **enforced server-side** in Convex queries/mutations (never only hidden in the
UI). Extends BRD §2, §5.9.

## Roles

| Role | Who | Powers |
|---|---|---|
| **SUPER_USER** ("Admin") | The system owner (one, or few) | Manages **global reference data** — qualifying standards, season dates, tour dates, galas — and clubs. Sees every club. Can act on any club's Permissions. |
| **COACH**, level **SUPER** ("Super coach") | A club's lead coach — belongs to exactly one club (`profiles.clubId`) | **Edits** everything in **their own club** (swimmers, times, attendance, squads, sign-ups, viewer access) and runs the club's **Permissions**. |
| **COACH**, level **SENIOR** / **JUNIOR** ("Senior / Junior coach") | An assistant coach of one club | **Reads** their own club like a Super coach, minus sensitive swimmer fields, Audit, viewer access and Permissions. **Writes only swimmer training notes** — for swimmers in their age group — and edits only notes they wrote. |
| **VIEWER** | A swimmer or parent | Read-only, and **scoped to their linked swimmer(s) only**. |

`profiles.coachLevel` absent means SUPER, so coaches created before levels kept
everything they had. One coach ↔ one club.

### Coach levels and the age split

A swimmer is a **junior** when their age **today** is at or under the club's
`clubs.juniorMaxAge` (default **12**, set by the club's Super coaches in
Permissions), and a **senior** otherwise. A Junior coach writes training notes
on juniors, a Senior coach on seniors; the swimmer moves over on their
birthday. One copy of the rule: `lib/coachLevel.ts` (`ageGroupFor`,
`levelCoversSwimmer`), enforced by `mayWriteNoteFor` in `convex/authz.ts`.

`requireCoach` is the **write** gate and refuses assistants (fail-closed — a
write that forgets about levels blocks them); `requireStaff` is the **read**
gate for any coach. `managesSwimmer` is the single "may edit this swimmer"
rule (Admin, or own-club Super coach).

### Joining a club

Signing up as a **coach** asks for a club (names only — the list is public).
The account is created as a VIEWER with a PENDING `coachRequests` row and sees a
**waiting screen** until the club's Super coaches — or the Admin — approve it
**with a level** (no default) or reject it (with an optional note the requester
sees). A parent may ask later from the account menu and keeps their swimmers
while waiting. Admin invites and "Assign coach" carry a level (default Super:
how a club gets its first) and skip approval. A club can never lose its **last
Super coach** to one of its own coaches; the Admin is exempt so they can put a
club right. Every decision is a `coachPermissionEvents` row, shown as the
club's history on `/permissions`.

## Who sees a swimmer at all

A swimmer's data — **name, times, and history included** — is visible only to:

- **coaches of the swimmer's own club** (any level),
- the **SUPER_USER**, and
- the swimmer's **coach-approved linked viewer(s)** (parent/self).

**Own club only.** Every coach reads only their own club — the roster,
comparison, the status matrix, season improvement, the dashboard, squads and
the audit trails alike. One copy of that boundary: `staffSeesSwimmer` /
`staffSwimmers` / `readableSwimmerSet` in `convex/authz.ts`. A coach with no
club reads nothing. A swimmer or squad with **no club** is visible to the Admin
only, who gives it one in **Admin › Unassigned** (squads whose members all
share a club are filled in from them).

The **one deliberate exception** is *Find a swimmer* (`/me/find`): a viewer may
search the roster by name to **request** coach-approved access to their own
child. That surfaces names (identity only — no times/history) purely to drive an
access request; it grants nothing until a coach approves.

## Sensitive vs public fields (per swimmer)

Among the users who may see a swimmer at all, a further **field-level** split
applies:

**Sensitive** — the swimmer's **own-club coach**, the **SUPER_USER**, and the
swimmer's **linked viewer(s)** see these; a coach from another club does not:

- Exact **date of birth**
- **Height / weight** and other personal info
- **Coach notes** (swimmer notes + per-result notes)

**Coach-only** — visible only to coaches (own club) and the SUPER_USER, **not**
even to the swimmer/parent:

- **Projections** (time-to-qualify estimates)

## Edit rules

- Only the **Admin** and a club's **Super coaches** write swimmer records,
  times, attendance, squads, sign-ups and viewer access — a Super coach only
  when `swimmer.clubId === coach.clubId`.
- **Senior / Junior coaches** write one thing: a SWIMMER-scope training note on
  a swimmer of their club in their age group. They never write squad notes, and
  edit or delete only notes they wrote.
- Viewers never write, except a parent's school-gala time for their own child.
- **Standards, season dates, tour dates, galas and meets** are written by the
  **SUPER_USER only**; every other role reads them.

## Access by email (viewer linking) — *implemented*

A coach grants viewer access by **email** (at swimmer creation or on the profile's
Viewer access panel). If an account already uses that email it is linked
immediately; otherwise the grant is stored in **`pendingSwimmerAccess`** and
**binds automatically on first sign-in** (materialised in `auth.ts`) — so a coach
can pre-authorise a parent/swimmer **before** they have an account. Pending
invites are listed and can be withdrawn. Managing access is **club-scoped**: only
the swimmer's own-club coach (or the super-user) can add or revoke viewers.

## Permission matrix

| Capability | Admin | Super coach (own club) | Senior / Junior coach (own club) | Any coach (other club) | Swimmer/parent (own child) |
|---|---|---|---|---|---|
| Name, age band, times, history | ✅ | ✅ | ✅ | ❌ | ✅ |
| Comparison / status matrix / season improvement | ✅ (all clubs) | ✅ | ✅ | ❌ | ❌ |
| Sensitive: coach notes, height/weight | ✅ | ✅ | 🔒 | ❌ | ✅ |
| Training notes — write | ✅ | ✅ | ✅ (own age group, own notes) | ❌ | ❌ |
| Times, attendance, squads, sign-ups — write | ✅ | ✅ | ❌ | ❌ | ❌ |
| Viewer access, Audit | ✅ | ✅ | ❌ | ❌ | ❌ |
| Permissions (join requests, levels, age split) | ✅ (any club) | ✅ | ❌ | ❌ | ❌ |
| Edit standards / season dates / tour dates | ✅ | 👁 | 👁 | 👁 | 👁 |

## Build phases

1. **Foundations** *(done)* — schema: `clubs`, `profiles.clubId`, `swimmers.clubId`,
   `heightCm`/`weightKg`, `settings.seasonEnd`; this spec. (All additive/optional,
   so the running app is unaffected until later phases consume them.)
2. **Field-level privacy** *(done; `public` view later removed in Phase 8)* — a
   per-swimmer `full`/`sensitive`/`public` split; `getProgression` gates
   projections (`canSeeProjections`). Phase 8 drops the `public` tier: a viewer no
   longer reaches any swimmer outside their linked set, so the split is now just
   `full` (staff) vs `sensitive` (linked viewer).
3. **Open viewer reads** — *SUPERSEDED by Phase 8.* This phase briefly let any
   signed-in user read every swimmer's public data (comparison, cross-swimmer
   progression, a `/me/rankings` leaderboard). Phase 8 reverses it: a viewer is
   now scoped to their own linked swimmer(s) everywhere.
4. **Super-user admin** *(done)* — `SUPER_USER` role wired through auth (env
   allow-list bootstrap `SUPER_USER_EMAILS`), authz (superset of a coach), and
   nav/guards (`/admin/*` reserved). Standards + season start/end are
   super-user-write / everyone-read; the editors show read-only for coaches. New
   `convex/clubs.ts` (create/rename clubs, assign/remove coaches) + a super-user
   `/admin/clubs` screen (impeccable 36/40). Tour dates were deferred at this
   point; they landed later as `/admin/galas`, which sets each gala's tour date
   and its entry age window.
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

8. **Viewer read lock-down** *(done)* — reverses Phase 3. A viewer/parent now sees
   the name, times, and history of **only** their coach-approved linked swimmer(s):
   - `getEventComparison` is coach/super-user only (`requireCoach`) — no viewer
     leaderboard. The `/me/rankings` route + `ViewerRankingsScreen` are removed.
   - `getProgression` gates every requested id through `requireSwimmersAccess`, so
     a viewer can chart only their own swimmer(s); a mixed selection with one
     unlinked swimmer is rejected outright (never trimmed). `swimmerViewer` and the
     `"public"` per-swimmer view are removed — the field-level split is now just
     `full` (staff) vs `sensitive` (linked viewer).
   - `/me/progress` charts the viewer's own swimmer(s): a single-swimmer viewer has
     no picker; a parent with >1 gets a **group** overlay across their own children.
     No roster picker, so no other swimmer is ever named there.
   - `getStrokeProfile` / `getRoadToQualify` were already access-gated
     (`requireSwimmerAccess`); the status matrix / season improvement stay
     coach-only. `listSwimmersForPicker` survives for one purpose only: the
     `/me/find` name search that lets a viewer *request* coach-approved access
     (identity only, no times/history — grants nothing until a coach approves).

**Deferred:** tour dates entity (fields TBD).
