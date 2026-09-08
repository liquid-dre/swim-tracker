// lib/sheetText.ts — turn a spreadsheet into the plain text `parseMeetProgramme`
// reads, so a workbook joins the PDF, the CSV and the paste at the SAME parser.
//
// A club programme arrives as often in a spreadsheet as in a HY-TEK export, and
// its shape is a table rather than a sentence: "1 | Boys 11 years | 50 |
// Backstroke" across four columns instead of "1  Boys 11 50 Backstroke" on one
// line. Joining a row's cells with tabs turns it back into exactly the line the
// programme parser already understands — a CSV row by another name — which is
// why this module ends at text and decides nothing about events.
//
// Why no library: an .xlsx is a ZIP of XML, and both halves are already in the
// platform. `DecompressionStream("deflate-raw")` is the inflater, and the four
// parts we need (the workbook, its rels, the shared strings, each sheet) are
// small, machine-generated documents. That is a few hundred lines here against a
// dependency in every bundle — and, unlike pdf.js, it is pure enough to test
// against real bytes on node.

// ---------------------------------------------------------------------------
// Limits — refused loudly, never silently truncated
// ---------------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024;
/** A workbook's sheets are all read; past this many, the rest are REPORTED. */
const MAX_SHEETS = 10;
/** Rows read per sheet. A programme is tens of lines; this is far past any. */
const MAX_ROWS = 5000;
/** Refuse a single entry that inflates absurdly (a zip bomb). */
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;

/** What was read, and — the point of this shape — what was NOT. */
export type SheetText = {
  text: string;
  /** The sheets actually read, in workbook order. */
  sheetsRead: string[];
  totalSheets: number;
};

// ---------------------------------------------------------------------------
// 1. ZIP
// ---------------------------------------------------------------------------
//
// Only what an .xlsx uses: a central directory of stored (method 0) or deflated
// (method 8) entries, no encryption, no zip64. Anything else is refused by name
// rather than half-read.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
};

/** Read the central directory. Throws a message the caller can show verbatim. */
function readCentralDirectory(view: DataView): ZipEntry[] {
  // The EOCD sits at the very end, after a comment of up to 64 KB.
  const scanFrom = Math.max(0, view.byteLength - 22 - 0xffff);
  let eocd = -1;
  for (let i = view.byteLength - 22; i >= scanFrom; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error(
      "That file isn't a spreadsheet this app can open — save it as .xlsx or CSV.",
    );
  }

  const count = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (count === 0xffff || directoryOffset === 0xffffffff) {
    throw new Error("That workbook uses the ZIP64 format — save it as CSV instead.");
  }

  const entries: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > view.byteLength || view.getUint32(cursor, true) !== CENTRAL_SIG) {
      throw new Error("That workbook is damaged — its file list could not be read.");
    }
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    entries.push({
      name: utf8(new Uint8Array(view.buffer, view.byteOffset + cursor + 46, nameLength)),
      method: view.getUint16(cursor + 10, true),
      compressedSize: view.getUint32(cursor + 20, true),
      uncompressedSize: view.getUint32(cursor + 24, true),
      localHeaderOffset: view.getUint32(cursor + 42, true),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** One entry's bytes → text. `null` when the workbook has no such part. */
async function readEntry(
  bytes: Uint8Array,
  view: DataView,
  entries: ZipEntry[],
  name: string,
): Promise<string | null> {
  const entry = entries.find((e) => e.name === name);
  if (!entry) return null;
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
    throw new Error("That workbook is too large to read — save just the event list.");
  }

  const header = entry.localHeaderOffset;
  if (view.getUint32(header, true) !== LOCAL_SIG) {
    throw new Error("That workbook is damaged — an entry could not be located.");
  }
  const start =
    header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);

  if (entry.method === 0) return utf8(raw);
  if (entry.method !== 8) {
    throw new Error("That workbook uses a compression this app can't read — save it as CSV.");
  }
  // `deflate-raw` is a headerless deflate stream, which is exactly what a ZIP
  // entry stores (a `.zip` has no zlib wrapper).
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return utf8(new Uint8Array(await new Response(stream).arrayBuffer()));
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

// ---------------------------------------------------------------------------
// 2. XML
// ---------------------------------------------------------------------------
//
// These four documents are written by spreadsheet software, never by hand, so
// they are flat and predictable. `DOMParser` would tie this module to a browser
// for no gain; matching the handful of elements we need keeps it testable.

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

export function decodeXml(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return String.fromCodePoint(parseInt(body.slice(2), 16));
    }
    if (body.startsWith("#")) return String.fromCodePoint(Number(body.slice(1)));
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Every `<t>` inside a fragment, concatenated — a cell's runs are one string. */
function textRuns(fragment: string): string {
  let out = "";
  for (const match of fragment.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)) {
    out += decodeXml(match[1] ?? "");
  }
  return out;
}

/** `xl/sharedStrings.xml` → the string each `t="s"` cell indexes into. */
export function parseSharedStrings(xml: string | null): string[] {
  if (xml === null) return [];
  const out: string[] = [];
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)) {
    out.push(textRuns(match[1] ?? ""));
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Dates
// ---------------------------------------------------------------------------
//
// A spreadsheet stores 11 September 2026 as the number 46276 and leaves the
// meaning to the cell's FORMAT. Reading the number back as text would put
// "46276" in front of the importer, so the format is read too — but only to
// recognise a date, never to invent one: a cell with no date format stays the
// number it is.

/** Built-in numFmtIds that are dates or date-times (ECMA-376 §18.8.30). */
const BUILT_IN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

/**
 * The style index of every cell format, mapped to whether it renders a DATE.
 * `cellXfs` is the list a cell's `s="N"` points into.
 */
export function parseDateStyles(xml: string | null): boolean[] {
  if (xml === null) return [];

  // Custom formats first: a code carrying y/m/d (outside a literal) is a date.
  const custom = new Map<number, boolean>();
  for (const match of xml.matchAll(/<numFmt\b[^>]*\/>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(match[0])?.[1]);
    const code = decodeXml(/formatCode="([^"]*)"/.exec(match[0])?.[1] ?? "");
    if (!Number.isInteger(id)) continue;
    custom.set(id, /[ymd]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]/g, "")));
  }

  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) return [];
  const out: boolean[] = [];
  for (const match of block[1].matchAll(/<xf\b[^>]*>[\s\S]*?<\/xf>|<xf\b[^>]*\/>/g)) {
    const id = Number(/numFmtId="(\d+)"/.exec(match[0])?.[1] ?? "0");
    out.push(BUILT_IN_DATE_FORMATS.has(id) || custom.get(id) === true);
  }
  return out;
}

/**
 * A spreadsheet date serial → ISO "YYYY-MM-DD", or null when it isn't one.
 *
 * Day 1 is 1 Jan 1900, and the format keeps a deliberate error: 1900 is treated
 * as a leap year, so serial 60 is a day that never existed and everything after
 * it is offset by one. Both facts are baked into the epoch below, which is why
 * serials at or below 60 are refused rather than silently shifted.
 */
export function serialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial <= 60 || serial > 2958465) return null;
  // Serial 61 = 1 Mar 1900. Anchor there and step in whole days.
  const ms = Date.UTC(1900, 2, 1) + (Math.floor(serial) - 61) * 86400000;
  const iso = new Date(ms).toISOString().slice(0, 10);
  return iso;
}

// ---------------------------------------------------------------------------
// 4. A worksheet → lines
// ---------------------------------------------------------------------------

/**
 * One worksheet's rows as tab-separated lines.
 *
 * Tabs, because that is the separator `parseMeetProgramme` already reads as a
 * column break: a leading "1" then "Boys 11 years 50 Backstroke" becomes the
 * numbered programme line it would have been in a CSV. Empty cells collapse
 * rather than padding the line, and an entirely empty row is dropped.
 */
export function parseWorksheet(
  xml: string,
  sharedStrings: ReadonlyArray<string>,
  dateStyles: ReadonlyArray<boolean>,
): string[] {
  const lines: string[] = [];
  let rows = 0;

  for (const row of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    if (rows++ >= MAX_ROWS) break;
    const cells: string[] = [];
    for (const cell of row[1].matchAll(/<c\b([^>]*)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cell[1] ?? cell[2] ?? "";
      const body = cell[3] ?? "";
      const type = /\bt="([^"]*)"/.exec(attrs)?.[1] ?? "n";

      if (type === "inlineStr") {
        cells.push(textRuns(body));
        continue;
      }
      const value = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      if (value === undefined) continue;
      const text = decodeXml(value);

      if (type === "s") {
        cells.push(sharedStrings[Number(text)] ?? "");
      } else if (type === "b") {
        cells.push(text === "1" ? "TRUE" : "FALSE");
      } else if (type === "str" || type === "e") {
        cells.push(text);
      } else {
        const styleIndex = Number(/\bs="(\d+)"/.exec(attrs)?.[1] ?? "-1");
        const iso = dateStyles[styleIndex] ? serialToIso(Number(text)) : null;
        // The number's own printed digits when it is not a date: "50" must stay
        // "50", not become 50.000000001 through a float round-trip.
        cells.push(iso ?? text);
      }
    }

    const line = cells.map((c) => c.trim()).join("\t").replace(/\t+$/, "");
    if (line.trim() !== "") lines.push(line);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 5. The workbook
// ---------------------------------------------------------------------------

/** `xl/workbook.xml` + its rels → each sheet's name and its part path. */
function sheetParts(
  workbook: string | null,
  rels: string | null,
): { name: string; path: string }[] {
  if (workbook === null) return [];
  const targets = new Map<string, string>();
  for (const rel of (rels ?? "").matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = /Id="([^"]*)"/.exec(rel[0])?.[1];
    const target = /Target="([^"]*)"/.exec(rel[0])?.[1];
    if (id && target) targets.set(id, target.replace(/^\/?xl\//, "").replace(/^\.\//, ""));
  }

  const out: { name: string; path: string }[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = decodeXml(/name="([^"]*)"/.exec(sheet[0])?.[1] ?? "");
    const relId = /r:id="([^"]*)"/.exec(sheet[0])?.[1] ?? "";
    const target = targets.get(relId);
    // A workbook with no readable rel still has the conventional layout.
    const path = target ? `xl/${target}` : `xl/worksheets/sheet${out.length + 1}.xml`;
    out.push({ name, path });
  }
  return out;
}

/**
 * A workbook's bytes → the text the programme parser reads.
 *
 * EVERY sheet is read, not just the first: a two-day meet is routinely one
 * sheet per day, and presenting day one as the whole programme is the failure
 * this module (like `pdfText`) exists to avoid. Past the sheet cap the rest are
 * reported through `sheetsRead` / `totalSheets` so the caller can say so.
 */
export async function readWorkbookText(data: ArrayBuffer): Promise<SheetText> {
  const bytes = new Uint8Array(data);
  const view = new DataView(data);
  const entries = readCentralDirectory(view);

  const read = (name: string) => readEntry(bytes, view, entries, name);
  const [workbook, rels, shared, styles] = await Promise.all([
    read("xl/workbook.xml"),
    read("xl/_rels/workbook.xml.rels"),
    read("xl/sharedStrings.xml"),
    read("xl/styles.xml"),
  ]);
  if (workbook === null) {
    throw new Error("That file isn't an Excel workbook — save it as .xlsx or CSV.");
  }

  const sharedStrings = parseSharedStrings(shared);
  const dateStyles = parseDateStyles(styles);
  const sheets = sheetParts(workbook, rels);

  const sheetsRead: string[] = [];
  const blocks: string[] = [];
  for (const sheet of sheets.slice(0, MAX_SHEETS)) {
    const xml = await read(sheet.path);
    if (xml === null) continue;
    sheetsRead.push(sheet.name);
    blocks.push(parseWorksheet(xml, sharedStrings, dateStyles).join("\n"));
  }

  const text = blocks.filter((b) => b !== "").join("\n");
  if (text.trim() === "") {
    throw new Error(
      "That workbook has no text in it — check the event list is on a sheet, not in an image.",
    );
  }
  return { text, sheetsRead, totalSheets: sheets.length };
}

/**
 * A chosen file → its text. The File-shaped wrapper, mirroring `extractPdfText`,
 * so the import sheet treats a workbook exactly as it treats a PDF.
 *
 * The old binary `.xls` is routed here on purpose, to be REFUSED by name: a
 * coach who picked the wrong export needs to be told which one to pick, not
 * handed "that file isn't a spreadsheet".
 */
export async function extractSheetText(file: File): Promise<SheetText> {
  if (file.size > MAX_BYTES) {
    throw new Error("That workbook is larger than 8 MB — export just the event list.");
  }
  if (/\.xls$/i.test(file.name)) {
    throw new Error(
      "That's the older .xls format — re-save it as .xlsx (or CSV) and try again.",
    );
  }
  return await readWorkbookText(await file.arrayBuffer());
}
