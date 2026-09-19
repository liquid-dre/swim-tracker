import { describe, expect, test } from "vitest";

import { importPlan, type PlanOutcome, type PlanRow } from "./importPlan";

const row = (over: Partial<PlanRow> = {}): PlanRow => ({
  skip: false,
  target: "",
  ...over,
});
const pending: PlanOutcome = { status: "pending" };
const saved: PlanOutcome = { status: "saved" };
const failed: PlanOutcome = { status: "failed" };
const skipped: PlanOutcome = { status: "skipped" };

describe("what the next press writes", () => {
  test("a fresh file writes every row", () => {
    const rows = [row(), row(), row()];
    expect(importPlan(rows, [pending, pending, pending]).write).toEqual([
      0, 1, 2,
    ]);
  });

  test("a skipped row is not written", () => {
    const rows = [row(), row({ skip: true }), row()];
    expect(importPlan(rows, [pending, skipped, pending]).write).toEqual([0, 2]);
  });

  test("a retry writes only what has not landed", () => {
    const rows = [row(), row(), row()];
    expect(importPlan(rows, [saved, failed, pending]).write).toEqual([1, 2]);
  });
});

describe("the index bug this file exists to prevent", () => {
  /*
    The exact scenario a review executed against the previous implementation,
    which filtered the rows first and then read `outcomes` with the FILTERED
    index. Row 1 is skipped, so every lookup after it shifted by one: the plan
    reported nothing to replace, the confirmation was skipped, and row 3's
    target was overwritten with no dialog.
  */
  const rows = [row(), row({ skip: true }), row(), row({ target: "meet-X" })];
  const outcomes = [saved, skipped, saved, failed];

  test("the row that will actually run is the one reported", () => {
    expect(importPlan(rows, outcomes).write).toEqual([3]);
  });

  test("its replacement is seen, so the confirmation cannot be skipped", () => {
    const plan = importPlan(rows, outcomes);
    expect(plan.replaceIds).toEqual(["meet-X"]);
    expect(plan.replaces.length).toBeGreaterThan(0);
  });

  test("a saved row's target is never offered for replacement again", () => {
    const again = [row({ target: "meet-A" }), row({ target: "meet-B" })];
    expect(importPlan(again, [saved, pending]).replaceIds).toEqual(["meet-B"]);
  });
});

describe("two rows aiming at one meet", () => {
  test("is reported, because the second write would erase the first", () => {
    const rows = [row({ target: "meet-A" }), row({ target: "meet-A" })];
    expect(importPlan(rows, [pending, pending]).duplicateId).toBe("meet-A");
  });

  test("is not reported when one of them is skipped", () => {
    const rows = [row({ target: "meet-A" }), row({ target: "meet-A", skip: true })];
    expect(importPlan(rows, [pending, skipped]).duplicateId).toBeNull();
  });

  test("is not reported when one of them already landed", () => {
    const rows = [row({ target: "meet-A" }), row({ target: "meet-A" })];
    expect(importPlan(rows, [saved, pending]).duplicateId).toBeNull();
  });

  test("names each replaced meet once, however many rows claim it", () => {
    const rows = [
      row({ target: "meet-A" }),
      row({ target: "meet-A" }),
      row({ target: "meet-B" }),
    ];
    expect(importPlan(rows, [pending, pending, pending]).replaceIds).toEqual([
      "meet-A",
      "meet-B",
    ]);
  });
});
