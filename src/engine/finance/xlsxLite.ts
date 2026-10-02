/**
 * xlsxLite — the SelfImpulse Documents engine's SpreadsheetML core.
 *
 * Pure TypeScript, zero dependencies: reads and writes .xlsx workbooks by speaking
 * SpreadsheetML over a minimal ZIP implementation (node:zlib for DEFLATE). Nothing here
 * talks to the network, spawns a process, or loads a native addon — the Removal Test
 * applies to binaries, not to the language runtime we already live in.
 *
 *   read  — Excel-written workbooks (sharedStrings, inlineStr, numbers, booleans)
 *   write — single-sheet workbooks with inline strings (opens in Excel / Sheets / Numbers)
 *
 * Every cell that crosses this engine is plain data: string | number | boolean | null.
 */
import * as zlib from "node:zlib";

export type Cell = string | number | boolean | null;
export interface SheetData {
  name: string;
  headers: string[];
  /** Data rows (no header). Cells align 1:1 with headers, ragged rows are padded with null. */
  rows: Cell[][];
}

/* ------------------------------------------------------------------ CRC32 */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ ZIP read */

function findEocd(buf: Buffer): number {
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("xlsxLite: not a zip archive (no end-of-central-directory)");
}

/** Decompress every entry of a zip buffer: entry name -> bytes. */
export function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  const eocd = findEocd(buf);
  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error("xlsxLite: bad central directory");
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);
    // local header: name/extra lengths repeat at +26/+28
    const lNameLen = buf.readUInt16LE(localOff + 26);
    const lExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + csize);
    const data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw);
    out.set(name, data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/* ------------------------------------------------------------------ ZIP write */

interface ZipOut {
  name: string;
  data: Buffer;
}

/** Build a stored (method 0) zip — valid everywhere; slightly larger, never wrong. */
export function writeZipEntries(entries: ZipOut[]): Buffer {
  const now = new Date();
  const dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() / 2) & 31);
  const dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(dosTime, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(e.data.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    locals.push(local, e.data);
    centrals.push(central);
    offset += local.length + e.data.length;
  }
  const cdSize = centrals.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}

/* ------------------------------------------------------------------ SpreadsheetML */

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function colToIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function indexToCol(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  for (const si of xml.match(/<si\b[^>]*>([\s\S]*?)<\/si>/g) ?? []) {
    const inner = si.replace(/^<si\b[^>]*>/, "").replace(/<\/si>$/, "");
    let text = "";
    for (const t of inner.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []) {
      text += unescapeXml(t.replace(/^<t\b[^>]*>/, "").replace(/<\/t>$/, ""));
    }
    out.push(text);
  }
  return out;
}

function parseSheetRows(xml: string, shared: string[]): Cell[][] {
  const rows: Cell[][] = [];
  for (const rowXml of xml.match(/<row\b[^>]*>([\s\S]*?)<\/row>/g) ?? []) {
    const inner = rowXml.replace(/^<row\b[^>]*>/, "").replace(/<\/row>$/, "");
    const cells: Cell[] = [];
    const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner))) {
      const attrs = m[1] ?? "";
      const body = m[2] ?? "";
      const rMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const col = rMatch ? colToIndex(rMatch[1]) : cells.length;
      const tMatch = attrs.match(/\bt="(\w+)"/);
      const t = tMatch ? tMatch[1] : "n";
      let value: Cell = null;
      if (t === "inlineStr") {
        const tm = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = tm ? unescapeXml(tm[1]) : "";
      } else {
        const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const raw = vm ? unescapeXml(vm[1]) : "";
        if (raw === "") value = null;
        else if (t === "s") value = shared[Number(raw)] ?? "";
        else if (t === "b") value = raw === "1";
        else if (t === "str" || t === "e") value = raw;
        else {
          const n = Number(raw);
          value = Number.isNaN(n) ? raw : n;
        }
      }
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows;
}

/** Read a .xlsx buffer into one sheet: first row = headers, rest = data. */
export function readXlsx(buf: Buffer, opts?: { headerRow?: number }): SheetData {
  const files = readZipEntries(buf);
  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml.toString("utf8")) : [];
  // locate first worksheet (via rels, with the conventional fallback)
  let sheetPath = "xl/worksheets/sheet1.xml";
  const rels = files.get("xl/_rels/workbook.xml.rels");
  const wb = files.get("xl/workbook.xml");
  let sheetName = "Sheet1";
  if (wb) {
    const sm = wb.toString("utf8").match(/<sheet\b[^>]*\bname="([^"]*)"/);
    if (sm) sheetName = unescapeXml(sm[1]);
  }
  if (rels) {
    const rm = rels.toString("utf8").match(/<Relationship\b[^>]*Target="([^"]*sheet[^"]*)"/);
    if (rm) {
      const target = rm[1].startsWith("/") ? rm[1].slice(1) : `xl/${rm[1].replace(/^\.\//, "")}`;
      sheetPath = target;
    }
  }
  const sheetXml = files.get(sheetPath) ?? files.get("xl/worksheets/sheet1.xml");
  if (!sheetXml) throw new Error("xlsxLite: workbook contains no worksheet");
  const rows = parseSheetRows(sheetXml.toString("utf8"), shared);
  const headerAt = opts?.headerRow ?? 0;
  const headers = (rows[headerAt] ?? []).map((c) => (c === null ? "" : String(c)));
  const width = headers.length;
  const data = rows.slice(headerAt + 1).map((r) => {
    const out: Cell[] = [];
    for (let i = 0; i < width; i++) out.push(r[i] ?? null);
    return out;
  });
  return { name: sheetName, headers, rows: data };
}

/** Write one sheet (headers + rows) as a .xlsx buffer. */
export function writeXlsx(sheet: SheetData): Buffer {
  const width = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1);
  const allRows: Cell[][] = [sheet.headers.map((h) => h), ...sheet.rows];
  const rowXml = allRows.map((row, ri) => {
    const cells = row
      .map((cell, ci) => {
        if (cell === null || cell === undefined) return "";
        const ref = `${indexToCol(ci)}${ri + 1}`;
        if (typeof cell === "number" && Number.isFinite(cell)) {
          return `<c r="${ref}"><v>${cell}</v></c>`;
        }
        if (typeof cell === "boolean") {
          return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
      })
      .join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const sheetXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetData>${rowXml}</sheetData></worksheet>`;
  void width;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    `<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>` +
    `</Types>`;
  const rootRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
    `</Relationships>`;
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<sheets><sheet name="${escapeXml(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>` +
    `</Relationships>`;
  return writeZipEntries([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(wbRels, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml, "utf8") },
  ]);
}
