import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  assertCoachManagesSwimmer,
  mayWriteNoteFor,
  requireCoach,
  requireStaff,
  requireSwimmerAccess,
} from "./authz";
import { isAssistantCoach, isFullStaff } from "../lib/coachLevel";
import { ownsSquad } from "./squads";

/*
  Training notes (§R16). Dated coaching notes about training FOCUS, scoped to a
  whole squad or one swimmer, forming a running audit trail that both the coach
  and the swimmer's viewers can read. SEPARATE from the per-result `notes` field.

  The collection is treated as a LOG: past notes persist and stay visible so a
  reader can line a training phase up against how times moved in that period —
  deletion is deliberately de-emphasised (still possible, for a genuine mistake).

  Access:
    • Writes are staff-only (authorizeNoteWrite). A SWIMMER note is open to
      whoever manages the swimmer AND to an assistant (Senior / Junior) coach of
      the swimmer's club for their own age group — the one write an assistant
      has. A SQUAD note is full-staff only, on the coach's own club's squad. An
      assistant edits or deletes only notes they wrote.
    • getSwimmerTrainingNotes is role-scoped (requireSwimmerAccess): a coach reads
      any swimmer, a viewer only their linked swimmer(s). It merges the swimmer's
      personal notes with the squad notes of every squad they belong to.
    • getSquadTrainingNotes is coach-only (squad management).
*/

const FOCUS_MAX = 80;
const BODY_MAX = 4000;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Validate an ISO "YYYY-MM-DD"; empty/undefined falls back to today. */
function cleanNoteDate(noteDate: string | undefined): string {
  if (noteDate === undefined || noteDate.trim() === "") return todayIso();
  const trimmed = noteDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new ConvexError("Note date must be YYYY-MM-DD.");
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== trimmed
  ) {
    throw new ConvexError("That is not a real date.");
  }
  return trimmed;
}

function cleanFocus(focus: string | undefined): string | undefined {
  if (focus === undefined) return undefined;
  const trimmed = focus.trim();
  if (trimmed === "") return undefined;
  if (trimmed.length > FOCUS_MAX) throw new ConvexError("Focus is too long.");
  return trimmed;
}

function cleanBody(body: string): string {
  const trimmed = body.trim();
  if (trimmed === "") throw new ConvexError("A note is required.");
  if (trimmed.length > BODY_MAX) throw new ConvexError("This note is too long.");
  return trimmed;
}

/**
 * Assert the caller may WRITE a note of this scope, and return their profile.
 * Shared by create / update / delete.
 *
 *   - SWIMMER note: anyone who manages the swimmer (Admin, own-club Super Coach),
 *     or an assistant coach of the swimmer's club whose level covers the
 *     swimmer's age group today (`mayWriteNoteFor`).
 *   - SQUAD note: full staff only — a squad can mix juniors and seniors, so an
 *     assistant never writes one — and a coach only on their own club's squad.
 *   - `existing`: on an edit / delete, an assistant may touch only a note they
 *     wrote themselves; a Super Coach still moderates every note.
 */
async function authorizeNoteWrite(
  ctx: MutationCtx,
  scope: "SQUAD" | "SWIMMER",
  ids: { squadId?: Id<"squads">; swimmerId?: Id<"swimmers"> },
  existing?: Doc<"trainingNotes">,
): Promise<Doc<"profiles">> {
  const profile = await requireStaff(ctx);
  if (scope === "SWIMMER") {
    if (!ids.swimmerId) throw new ConvexError("Pick a swimmer for this note.");
    const swimmer = await ctx.db.get(ids.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");
    if (!(await mayWriteNoteFor(ctx, profile, swimmer))) {
      throw new ConvexError(
        isAssistantCoach(profile)
          ? "Your coach role covers a different age group."
          : "You can only edit swimmers in your own club.",
      );
    }
  } else {
    if (!isFullStaff(profile)) {
      throw new ConvexError("Squad notes are written by the club's super coaches.");
    }
    if (!ids.squadId) throw new ConvexError("Pick a squad for this note.");
    const squad = await ctx.db.get(ids.squadId);
    if (!squad) throw new ConvexError("Squad not found.");
    if (!ownsSquad(profile, squad)) {
      throw new ConvexError("You can only write notes on your own club's squads.");
    }
  }
  if (
    existing !== undefined &&
    isAssistantCoach(profile) &&
    existing.authorId !== profile._id
  ) {
    throw new ConvexError("You can only change notes you wrote.");
  }
  return profile;
}

// ---------------------------------------------------------------------------
// Mutations (coach-only)
// ---------------------------------------------------------------------------

export const createTrainingNote = mutation({
  args: {
    scope: v.union(v.literal("SQUAD"), v.literal("SWIMMER")),
    squadId: v.optional(v.id("squads")),
    swimmerId: v.optional(v.id("swimmers")),
    focus: v.optional(v.string()),
    body: v.string(),
    noteDate: v.optional(v.string()), // defaults to today
  },
  returns: v.id("trainingNotes"),
  handler: async (ctx, args) => {
    const profile = await authorizeNoteWrite(ctx, args.scope, {
      squadId: args.squadId,
      swimmerId: args.swimmerId,
    });

    return await ctx.db.insert("trainingNotes", {
      scope: args.scope,
      // Persist only the id that matches the scope, so a mismatched pair can never
      // masquerade as the wrong scope on read.
      squadId: args.scope === "SQUAD" ? args.squadId : undefined,
      swimmerId: args.scope === "SWIMMER" ? args.swimmerId : undefined,
      authorId: profile._id,
      focus: cleanFocus(args.focus),
      body: cleanBody(args.body),
      noteDate: cleanNoteDate(args.noteDate),
      createdAt: Date.now(),
    });
  },
});

export const updateTrainingNote = mutation({
  args: {
    noteId: v.id("trainingNotes"),
    focus: v.optional(v.string()),
    body: v.optional(v.string()),
    noteDate: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) throw new ConvexError("Note not found.");
    // Re-authorise against the note's OWN scope (never trust the client's claim).
    await authorizeNoteWrite(
      ctx,
      note.scope,
      { squadId: note.squadId, swimmerId: note.swimmerId },
      note,
    );

    const patch: Partial<{
      focus: string | undefined;
      body: string;
      noteDate: string;
      updatedAt: number;
    }> = {};
    if (args.focus !== undefined) patch.focus = cleanFocus(args.focus);
    if (args.body !== undefined) patch.body = cleanBody(args.body);
    if (args.noteDate !== undefined) patch.noteDate = cleanNoteDate(args.noteDate);
    patch.updatedAt = Date.now();

    await ctx.db.patch(args.noteId, patch);
    return null;
  },
});

export const deleteTrainingNote = mutation({
  args: { noteId: v.id("trainingNotes") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) return null; // already gone — treat as success
    await authorizeNoteWrite(
      ctx,
      note.scope,
      { squadId: note.squadId, swimmerId: note.swimmerId },
      note,
    );
    await ctx.db.delete(args.noteId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Shared shaping
// ---------------------------------------------------------------------------

const NOTES_LIMIT = 1000;

const trainingNote = v.object({
  _id: v.id("trainingNotes"),
  scope: v.union(v.literal("SQUAD"), v.literal("SWIMMER")),
  squadId: v.union(v.id("squads"), v.null()),
  squadName: v.union(v.string(), v.null()), // set for a SQUAD note
  scopeLabel: v.string(), // "Personal" or "Squad: <name>"
  focus: v.union(v.string(), v.null()),
  body: v.string(),
  noteDate: v.string(),
  authorName: v.string(),
  createdAt: v.number(),
  updatedAt: v.union(v.number(), v.null()),
  // Whether the CALLER may edit / delete this note: the timeline's edit controls
  // are per note, because an assistant may change only the notes they wrote.
  canModify: v.boolean(),
});

/** The read-side mirror of authorizeNoteWrite's SQUAD branch, for edit controls. */
function mayModifySquadNote(
  profile: Doc<"profiles">,
  squad: Doc<"squads">,
): boolean {
  return isFullStaff(profile) && ownsSquad(profile, squad);
}

/** Newest-first: by the phase date, then by when it was written (stable). */
function newestFirst(
  a: { noteDate: string; createdAt: number },
  b: { noteDate: string; createdAt: number },
): number {
  if (a.noteDate !== b.noteDate) return a.noteDate < b.noteDate ? 1 : -1;
  return b.createdAt - a.createdAt;
}

/** Resolve author names once, memoised across a batch of notes. */
function authorNameResolver(ctx: QueryCtx) {
  const cache = new Map<Id<"profiles">, string>();
  return async (authorId: Id<"profiles">): Promise<string> => {
    const cached = cache.get(authorId);
    if (cached !== undefined) return cached;
    const author = await ctx.db.get(authorId);
    const name = author?.name ?? "Coach";
    cache.set(authorId, name);
    return name;
  };
}

// ---------------------------------------------------------------------------
// getSwimmerTrainingNotes — the merged personal + squad timeline (§R16)
// ---------------------------------------------------------------------------
//
// The swimmer's own SWIMMER-scope notes PLUS the SQUAD-scope notes of every
// squad they belong to, merged newest-first, each labelled "Personal" or
// "Squad: <name>". This IS the audit trail: past phases stay so a reader sees
// what was worked on and can align it with how times changed. Role-scoped: a
// coach reads any swimmer, a viewer only their linked swimmer(s).

export const getSwimmerTrainingNotes = query({
  args: { swimmerId: v.id("swimmers") },
  returns: v.object({
    // Whether the caller may ADD / EDIT notes for this swimmer (own-club coach /
    // super-user). Drives the composer + per-note edit controls; a viewer is
    // read-only.
    editable: v.boolean(),
    // Whether the composer may offer "A squad" — full staff only.
    canWriteSquadNotes: v.boolean(),
    notes: v.array(trainingNote),
  }),
  handler: async (ctx, args) => {
    // Coach → any swimmer; viewer → only their linked swimmer(s). Rejected
    // server-side, so a direct call can't read an unlinked swimmer's notes.
    const profile = await requireSwimmerAccess(ctx, args.swimmerId);
    const swimmer = await ctx.db.get(args.swimmerId);
    if (!swimmer) throw new ConvexError("Swimmer not found.");

    // An assistant coach may add notes when the swimmer is in their age group.
    const editable =
      profile.role !== "VIEWER" && (await mayWriteNoteFor(ctx, profile, swimmer));

    // Personal (SWIMMER-scope) notes for this swimmer.
    const personal = await ctx.db
      .query("trainingNotes")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId))
      .take(NOTES_LIMIT);

    // Every squad the swimmer belongs to, and that squad's SQUAD-scope notes.
    const memberships = await ctx.db
      .query("squadMemberships")
      .withIndex("by_swimmer", (q) => q.eq("swimmerId", args.swimmerId))
      .take(100);

    const squadNotes: Array<{
      note: Doc<"trainingNotes">;
      squadName: string;
      squad: Doc<"squads">;
    }> = [];
    for (const m of memberships) {
      const squad = await ctx.db.get(m.squadId);
      if (!squad) continue;
      const notes = await ctx.db
        .query("trainingNotes")
        .withIndex("by_squad", (q) => q.eq("squadId", m.squadId))
        .take(NOTES_LIMIT);
      for (const note of notes) squadNotes.push({ note, squadName: squad.name, squad });
    }

    const authorName = authorNameResolver(ctx);

    const shaped = [
      ...(await Promise.all(
        personal.map(async (note) => ({
          _id: note._id,
          scope: "SWIMMER" as const,
          squadId: null,
          squadName: null,
          scopeLabel: "Personal",
          focus: note.focus ?? null,
          body: note.body,
          noteDate: note.noteDate,
          authorName: await authorName(note.authorId),
          createdAt: note.createdAt,
          updatedAt: note.updatedAt ?? null,
          canModify:
            editable && (isFullStaff(profile) || note.authorId === profile._id),
        })),
      )),
      ...(await Promise.all(
        squadNotes.map(async ({ note, squadName, squad }) => ({
          _id: note._id,
          scope: "SQUAD" as const,
          squadId: note.squadId ?? null,
          squadName,
          scopeLabel: `Squad: ${squadName}`,
          focus: note.focus ?? null,
          body: note.body,
          noteDate: note.noteDate,
          authorName: await authorName(note.authorId),
          createdAt: note.createdAt,
          updatedAt: note.updatedAt ?? null,
          canModify: mayModifySquadNote(profile, squad),
        })),
      )),
    ];

    shaped.sort(newestFirst);
    return { editable, canWriteSquadNotes: isFullStaff(profile), notes: shaped };
  },
});

// ---------------------------------------------------------------------------
// getSquadTrainingNotes — a squad's own notes, for squad management (§R16)
// ---------------------------------------------------------------------------

export const getSquadTrainingNotes = query({
  args: { squadId: v.id("squads") },
  returns: v.array(trainingNote),
  handler: async (ctx, args) => {
    const profile = await requireStaff(ctx);
    const squad = await ctx.db.get(args.squadId);
    if (!squad) throw new ConvexError("Squad not found.");
    if (!ownsSquad(profile, squad)) {
      throw new ConvexError("That squad is in another club.");
    }
    const canModify = mayModifySquadNote(profile, squad);

    const notes = await ctx.db
      .query("trainingNotes")
      .withIndex("by_squad", (q) => q.eq("squadId", args.squadId))
      .take(NOTES_LIMIT);

    const authorName = authorNameResolver(ctx);
    const shaped = await Promise.all(
      notes.map(async (note) => ({
        _id: note._id,
        scope: "SQUAD" as const,
        squadId: note.squadId ?? null,
        squadName: squad.name,
        scopeLabel: `Squad: ${squad.name}`,
        focus: note.focus ?? null,
        body: note.body,
        noteDate: note.noteDate,
        authorName: await authorName(note.authorId),
        createdAt: note.createdAt,
        updatedAt: note.updatedAt ?? null,
        canModify,
      })),
    );

    shaped.sort(newestFirst);
    return shaped;
  },
});
