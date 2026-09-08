import { describe, expect, test } from "vitest";

import {
  decodeXml,
  parseDateStyles,
  parseSharedStrings,
  parseWorksheet,
  readWorkbookText,
  serialToIso,
} from "./sheetText";
import { parseMeetProgramme } from "./meetImport";

/*
  The workbook reader, exercised against real bytes rather than a mock: every
  test below builds an actual .xlsx (a ZIP of the same XML parts Excel writes)
  and reads it back, so the ZIP walk and the DEFLATE path are covered, not just
  the XML.
*/

// ---------------------------------------------------------------------------
// A minimal .xlsx builder — the same parts Excel writes, in the same order
// ---------------------------------------------------------------------------

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

type Part = { name: string; xml: string; store?: boolean };

/** Write real ZIP bytes. CRCs are left zero — nothing in the reader checks them. */
async function zip(parts: Part[]): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const part of parts) {
    const name = encoder.encode(part.name);
    const raw = encoder.encode(part.xml);
    const method = part.store ? 0 : 8;
    const body = part.store ? raw : await deflate(raw);

    const local = new Uint8Array(30 + name.length + body.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(body, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const directorySize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, parts.length, true);
  ev.setUint16(10, parts.length, true);
  ev.setUint32(12, directorySize, true);
  ev.setUint32(16, offset, true);

  const all = [...locals, ...centrals, eocd];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let cursor = 0;
  for (const block of all) {
    out.set(block, cursor);
    cursor += block.length;
  }
  return out.buffer;
}

/** Rows of cell XML → one worksheet part. */
function sheet(rows: string[]): string {
  return `<?xml version="1.0"?><worksheet><sheetData>${rows
    .map((cells, i) => `<row r="${i + 1}">${cells}</row>`)
    .join("")}</sheetData></worksheet>`;
}

/** A shared-string cell. */
function s(ref: string, index: number): string {
  return `<c r="${ref}" t="s"><v>${index}</v></c>`;
}
/** A number cell, optionally carrying a style index. */
function n(ref: string, value: string, style?: number): string {
  return `<c r="${ref}"${style === undefined ? "" : ` s="${style}"`}><v>${value}</v></c>`;
}

function workbook(sheets: { name: string; rows: string[] }[]): Part[] {
  return [
    {
      name: "xl/workbook.xml",
      xml: `<workbook><sheets>${sheets
        .map((sh, i) => `<sheet name="${sh.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets></workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      xml: `<Relationships>${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join("")}</Relationships>`,
    },
    ...sheets.map((sh, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      xml: sheet(sh.rows),
    })),
  ];
}

const SHARED = (strings: string[]): Part => ({
  name: "xl/sharedStrings.xml",
  xml: `<sst>${strings.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`,
});

// ---------------------------------------------------------------------------

describe("readWorkbookText", () => {
  test("a row's cells become one tab-separated line", async () => {
    const bytes = await zip([
      SHARED(["Boys 11 years", "Backstroke"]),
      ...workbook([
        { name: "Programme", rows: [n("A1", "1") + s("B1", 0) + n("C1", "50") + s("D1", 1)] },
      ]),
    ]);
    const read = await readWorkbookText(bytes);
    expect(read.text).toBe("1\tBoys 11 years\t50\tBackstroke");
    expect(read.sheetsRead).toEqual(["Programme"]);
    expect(read.totalSheets).toBe(1);
  });

  test("stored (uncompressed) entries read the same as deflated ones", async () => {
    const parts = [
      SHARED(["Freestyle"]),
      ...workbook([{ name: "S", rows: [n("A1", "50") + s("B1", 0)] }]),
    ].map((p) => ({ ...p, store: true }));
    expect((await readWorkbookText(await zip(parts))).text).toBe("50\tFreestyle");
  });

  test("EVERY sheet is read — a two-day meet is two sheets", async () => {
    const bytes = await zip([
      SHARED(["Day one", "Day two"]),
      ...workbook([
        { name: "Day 1", rows: [s("A1", 0)] },
        { name: "Day 2", rows: [s("A1", 1)] },
      ]),
    ]);
    const read = await readWorkbookText(bytes);
    expect(read.text).toBe("Day one\nDay two");
    expect(read.sheetsRead).toEqual(["Day 1", "Day 2"]);
  });

  test("empty rows and trailing empty cells collapse", async () => {
    const bytes = await zip([
      SHARED(["Butterfly"]),
      ...workbook([
        { name: "S", rows: [s("A1", 0), "", `<c r="A3"/>`] },
      ]),
    ]);
    expect((await readWorkbookText(bytes)).text).toBe("Butterfly");
  });

  test("a date-formatted cell reads as its date, an unformatted one as its number", async () => {
    const bytes = await zip([
      {
        name: "xl/styles.xml",
        xml: `<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      },
      ...workbook([{ name: "S", rows: [n("A1", "46276", 1) + n("B1", "46276", 0)] }]),
    ]);
    expect((await readWorkbookText(bytes)).text).toBe("2026-09-11\t46276");
  });

  test("a file that isn't a workbook is refused by name, not half-read", async () => {
    const notAZip = new TextEncoder().encode("Event 1,100 Free\n").buffer;
    await expect(readWorkbookText(notAZip as ArrayBuffer)).rejects.toThrow(/isn't a spreadsheet/i);
  });

  test("a ZIP with no workbook part is refused", async () => {
    const bytes = await zip([{ name: "hello.txt", xml: "hi" }]);
    await expect(readWorkbookText(bytes)).rejects.toThrow(/isn't an Excel workbook/i);
  });

  test("a workbook with no text says so rather than returning an empty programme", async () => {
    const bytes = await zip(workbook([{ name: "S", rows: [] }]));
    await expect(readWorkbookText(bytes)).rejects.toThrow(/no text in it/i);
  });
});

describe("a real club programme, end to end", () => {
  test("a four-column spreadsheet becomes the same draft a CSV would", async () => {
    const strings = [
      "1st Junior Gala",
      "Short Course",
      "Event #",
      "Age Group",
      "Distance",
      "Event",
      "Boys 11 years",
      "Backstroke",
      "Girls 11 years",
      "Freestyle",
      "Mixed 11 years",
      "Freestyle relay",
    ];
    const bytes = await zip([
      SHARED(strings),
      ...workbook([
        {
          name: "Ist Junior Gala",
          rows: [
            s("A1", 0),
            s("A2", 1),
            s("A3", 2) + s("B3", 3) + s("C3", 4) + s("D3", 5),
            n("A4", "1") + s("B4", 6) + n("C4", "50") + s("D4", 7),
            n("A5", "2") + s("B5", 8) + n("C5", "50") + s("D5", 9),
            n("A6", "3") + s("B6", 10) + n("C6", "100") + s("D6", 11),
          ],
        },
      ]),
    ]);

    const draft = parseMeetProgramme((await readWorkbookText(bytes)).text);

    // The title in cell A1 is REPORTED, never adopted — the sheet holds its
    // button until a person types the name.
    expect(draft.name).toBe("");
    expect(draft.warnings.some((w) => /No meet name found/.test(w))).toBe(true);
    // The document states its course; the parser reports that and sets nothing.
    expect(draft.warnings.some((w) => /Short Course/.test(w))).toBe(true);
    // No date anywhere in the file — never invented.
    expect(draft.startDate).toBeNull();

    expect(draft.events).toEqual([
      {
        eventNumber: 1,
        rawLabel: "Boys 11 years 50 Backstroke",
        gender: "M",
        distance: 50,
        stroke: "BACK",
      },
      {
        eventNumber: 2,
        rawLabel: "Girls 11 years 50 Freestyle",
        gender: "F",
        distance: 50,
        stroke: "FREE",
      },
      // A relay keeps its words and never resolves to an event.
      {
        eventNumber: 3,
        rawLabel: "Mixed 11 years 100 Freestyle relay",
        gender: "MIXED",
      },
    ]);
    // The column heading row is furniture; nothing else vanishes.
    expect(draft.skipped.map((k) => k.text)).toEqual(["1st Junior Gala", "Short Course"]);
  });
});

describe("the XML pieces", () => {
  test("decodeXml handles named and numeric entities", () => {
    expect(decodeXml("Boys &amp; Girls &lt;11&gt; &#65;&#x42;")).toBe("Boys & Girls <11> AB");
    expect(decodeXml("100&nbsp;Free")).toBe("100&nbsp;Free"); // unknown, left alone
  });

  test("parseSharedStrings joins a cell's formatting runs into one string", () => {
    const xml = `<sst><si><t>Plain</t></si><si><r><t>Indiv</t></r><r><t>idual Medley</t></r></si><si/></sst>`;
    expect(parseSharedStrings(xml)).toEqual(["Plain", "Individual Medley", ""]);
    expect(parseSharedStrings(null)).toEqual([]);
  });

  test("parseDateStyles marks built-in and custom date formats", () => {
    const xml = `<styleSheet><numFmts><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="0.00&quot;m&quot;"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/><xf numFmtId="165"/></cellXfs></styleSheet>`;
    expect(parseDateStyles(xml)).toEqual([false, true, true, false]);
    expect(parseDateStyles(null)).toEqual([]);
  });

  test("parseWorksheet reads inline strings, booleans and formula results", () => {
    const xml = sheet([
      `<c r="A1" t="inlineStr"><is><t>Girls 10 years</t></is></c><c r="B1" t="b"><v>1</v></c><c r="C1" t="str"><v>25 Free</v></c>`,
    ]);
    expect(parseWorksheet(xml, [], [])).toEqual(["Girls 10 years\tTRUE\t25 Free"]);
  });
});

describe("serialToIso", () => {
  test("converts a real spreadsheet serial", () => {
    expect(serialToIso(46276)).toBe("2026-09-11");
    expect(serialToIso(61)).toBe("1900-03-01"); // the first day past the 1900 bug
  });
  test("refuses serials inside the 1900 leap-year bug, and absurd ones", () => {
    expect(serialToIso(60)).toBeNull(); // 29 Feb 1900 — a day that never existed
    expect(serialToIso(0)).toBeNull();
    expect(serialToIso(-5)).toBeNull();
    expect(serialToIso(9e9)).toBeNull();
    expect(serialToIso(Number.NaN)).toBeNull();
  });
});
