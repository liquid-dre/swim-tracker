#!/usr/bin/env node
// Generate convex/standardsSeedData.ts from data/qualifying-times.csv.
//
// The CSV is the source of truth: it is the artefact you proofread against the
// SSA qualifying-standard PDFs. Convex mutations cannot read the repo's
// filesystem, so the seeding path needs the same rows as a TS module — this
// script produces it, and lib/qualifyingTimes.test.ts asserts the two match row
// for row so they cannot drift.
//
//   node scripts/gen-standards-seed.mjs      (or: npm run seed:standards:gen)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = resolve(root, "data/qualifying-times.csv");
const OUT = resolve(root, "convex/standardsSeedData.ts");

const EXPECTED_HEADER =
  "gala,course,gender,distance,stroke,age,isCatchAllYoung,isCatchAllOld,time";

const lines = readFileSync(CSV, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
if (lines[0] !== EXPECTED_HEADER) {
  throw new Error(`unexpected CSV header:\n  got      ${lines[0]}\n  expected ${EXPECTED_HEADER}`);
}

const rows = lines.slice(1).map((line, i) => {
  const cells = line.split(",");
  if (cells.length !== 9) {
    throw new Error(`line ${i + 2}: expected 9 columns, got ${cells.length}`);
  }
  const [gala, course, gender, distance, stroke, age, young, old, time] = cells;
  if (young !== "true" && young !== "false") {
    throw new Error(`line ${i + 2}: isCatchAllYoung must be true/false, got "${young}"`);
  }
  if (old !== "true" && old !== "false") {
    throw new Error(`line ${i + 2}: isCatchAllOld must be true/false, got "${old}"`);
  }
  if (young === "true" && old === "true") {
    throw new Error(`line ${i + 2}: row flagged as BOTH young and old catch-all`);
  }
  const catchAll = young === "true" ? "Y" : old === "true" ? "O" : "";
  return `  ["${gala}", "${course}", "${gender}", ${Number(distance)}, "${stroke}", ${
    age === "" ? "null" : Number(age)
  }, "${time}", "${catchAll}"],`;
});

const header = `// GENERATED FILE — do not edit by hand.
//
// The 2027 SSA qualifying standards, mirrored from data/qualifying-times.csv so
// \`migrations.seedStandards\` can load them inside Convex (a mutation cannot read
// the repo's filesystem). The CSV remains the source of truth you proofread
// against the federation PDFs; \`lib/qualifyingTimes.test.ts\` asserts this module
// matches it row for row, so the two cannot drift.
//
// Regenerate after editing the CSV:  npm run seed:standards:gen
//
// Columns: [gala, course, gender, distance, stroke, age, time, catchAll]
//   age      — null on an OPEN gala (SANS/SANY): one cut for every age.
//   time     — canonical m:ss:hh / ss:hh, parsed by \`parseTime\`.
//   catchAll — "Y" youngest-band catch-all ("10&U"), "O" oldest, "" exact age.

export type StandardSeedRow = readonly [
  gala: string,
  course: string,
  gender: string,
  distance: number,
  stroke: string,
  age: number | null,
  time: string,
  catchAll: "" | "Y" | "O",
];

export const STANDARDS_SEED_ROWS: ReadonlyArray<StandardSeedRow> = [
`;

writeFileSync(OUT, `${header}${rows.join("\n")}\n];\n`);
console.log(`wrote ${OUT} (${rows.length} rows)`);
