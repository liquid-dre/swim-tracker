import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

/*
  Contrast, checked rather than asserted.

  Every round of review on this codebase has found at least one comment stating
  a ratio the code does not produce — "4.97:1" for ink that measures 4.52:1 on
  the ground it actually sits on, "3.76:1" carried over after the fill changed.
  A number written in prose beside a class name drifts the moment either moves,
  and nothing catches it.

  So the numbers live here instead. These read the real token values out of
  globals.css, so a token edit either keeps the pair passing or fails this file
  — and a comment can say "AA, locked in lib/contrast.test.ts" without carrying
  a figure that can rot.

  WCAG 2.1: normal text 4.5:1 (1.4.3), large text and non-text UI 3:1 (1.4.11).
*/

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** A `--token: #hex;` declaration from the `@theme` palette block. */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})\\s*;`).exec(CSS);
  if (m === null) throw new Error(`No literal hex for --${name} in globals.css`);
  return m[1];
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const WHITE = "#ffffff";

describe("text pairs the app relies on", () => {
  const canvas = token("color-gray-50");

  test.each([
    ["body ink on the canvas", "color-gray-900", canvas],
    ["muted ink on white", "color-gray-500", WHITE],
    ["muted ink on the canvas", "color-gray-500", canvas],
    ["inert ink on the inert fill", "color-gray-500", token("color-gray-100")],
    ["brand ink on its own tint", "color-brand-600", token("color-brand-50")],
    ["brand ink on the canvas", "color-brand-600", canvas],
    ["success ink on white", "color-success-700", WHITE],
    ["success ink on its tint", "color-success-700", token("color-success-50")],
    ["warning ink on its tint", "color-warning-700", token("color-warning-50")],
    ["danger ink on its tint", "color-error-700", token("color-error-50")],
    ["danger ink on white", "color-error-700", WHITE],
  ])("%s reaches AA", (_name, fg, bg) => {
    expect(contrast(token(fg), bg.startsWith("#") ? bg : token(bg))).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the three ink tiers", () => {
  /*
    A tier that renders the same colour as the tier above it is not a tier. In
    light mode `--ink-muted` and `--ink-faint` were both gray-500, so every
    "secondary vs tertiary" call in the app came out identical.
  */
  const ALIAS = /--ink-(muted|faint):\s*var\(--(color-gray-\d+)\)/g;
  const tiers = Object.fromEntries(
    [...CSS.matchAll(ALIAS)].slice(0, 2).map((m) => [m[1], m[2]]),
  ) as { muted: string; faint: string };

  test("muted and faint resolve to different greys in light mode", () => {
    expect(tiers.muted).not.toBe(tiers.faint);
  });

  test.each([
    ["muted", WHITE],
    ["faint", WHITE],
    ["muted", token("color-gray-50")],
    ["faint", token("color-gray-50")],
  ])("%s ink reaches AA", (tier, bg) => {
    expect(contrast(token(tiers[tier as "muted" | "faint"]), bg)).toBeGreaterThanOrEqual(4.5);
  });

  test("muted is the more legible of the two, as its name implies", () => {
    expect(contrast(token(tiers.muted), WHITE)).toBeGreaterThan(
      contrast(token(tiers.faint), WHITE),
    );
  });
});

describe("button fills carrying white labels", () => {
  test.each([
    ["primary", "color-brand-500"],
    ["danger", "color-error-600"],
  ])("%s reaches AA with white text", (_name, fill) => {
    expect(contrast(token(fill), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  test("the fill danger was moved OFF stays below AA, so the move is load-bearing", () => {
    // If error-500 ever reaches 4.5 this test should be deleted, not the
    // variant reverted — but until then it records why danger is 600.
    expect(contrast(token("color-error-500"), WHITE)).toBeLessThan(4.5);
  });
});

describe("non-text UI, which needs 3:1", () => {
  test.each([["focus ring on the canvas", "color-brand-500", token("color-gray-50")]])(
    "%s reaches 3:1",
    (_name, fg, bg) => {
      expect(contrast(token(fg), bg)).toBeGreaterThanOrEqual(3);
    },
  );

  /*
    KNOWN GAP, recorded rather than quietly dropped.

    `--color-gray-300` is the border on every input, select and date field in
    the app, and against white it is far under the 3:1 WCAG 1.4.11 asks for to
    identify a control's boundary. Raising it is a design-system decision with
    a visual cost on every form in the product — it is not something to change
    from inside a meets bug-fix — so this states the number instead of hiding
    it, and fails if anyone edits the token without settling the question.
  */
  test("the control border is a known AA gap, not an accident", () => {
    expect(contrast(token("color-gray-300"), WHITE)).toBeLessThan(3);
  });
});

describe("the pairs earlier rounds shipped and had to undo", () => {
  test("brand-500 on brand-50 is below AA — why menus and tabs use brand-600", () => {
    expect(contrast(token("color-brand-500"), token("color-brand-50"))).toBeLessThan(4.5);
  });

  test("success-600 is below AA on white — why --success-ink is 700", () => {
    expect(contrast(token("color-success-600"), WHITE)).toBeLessThan(4.5);
  });

  /*
    The canvas, specifically, because that is the ground the comment beside
    `--success-ink` names and it is darker than white — so a pair that only
    just clears on white is the one to check here, not assume.
  */
  test("success-600 is below AA on the canvas too", () => {
    expect(
      contrast(token("color-success-600"), token("color-gray-50")),
    ).toBeLessThan(4.5);
  });

  test("success-700 clears AA on the canvas, which is why it replaced it", () => {
    expect(
      contrast(token("color-success-700"), token("color-gray-50")),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
