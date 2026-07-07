import type { Id } from "@/convex/_generated/dataModel";

// The shaped training-note row returned by getSwimmerTrainingNotes /
// getSquadTrainingNotes (§R16). Presentational — the server owns the merge,
// scope labelling, author resolution and newest-first order.
export type TrainingNote = {
  _id: Id<"trainingNotes">;
  scope: "SQUAD" | "SWIMMER";
  squadId: Id<"squads"> | null;
  squadName: string | null;
  scopeLabel: string; // "Personal" or "Squad: <name>"
  focus: string | null;
  body: string;
  noteDate: string;
  authorName: string;
  createdAt: number;
  updatedAt: number | null;
};

// The subset the composer seeds from when EDITING an existing note. Scope is
// fixed on edit (a note never moves between a swimmer and a squad).
export type EditableTrainingNote = {
  _id: Id<"trainingNotes">;
  scope: "SQUAD" | "SWIMMER";
  squadId: Id<"squads"> | null;
  focus: string | null;
  body: string;
  noteDate: string;
};
