import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/excel.test.ts
import assert from "node:assert/strict";

// src/engine/finance/xlsxLite.ts
import * as zlib from "node:zlib";
var CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf2) {
  let c = 4294967295;
  for (let i = 0; i < buf2.length; i++) c = CRC_TABLE[(c ^ buf2[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function findEocd(buf2) {
  const min = Math.max(0, buf2.length - 22 - 65535);
  for (let i = buf2.length - 22; i >= min; i--) {
    if (buf2.readUInt32LE(i) === 101010256) return i;
  }
  throw new Error("xlsxLite: not a zip archive (no end-of-central-directory)");
}
function readZipEntries(buf2) {
  const out = /* @__PURE__ */ new Map();
  const eocd = findEocd(buf2);
  const total = buf2.readUInt16LE(eocd + 10);
  let off = buf2.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf2.readUInt32LE(off) !== 33639248) throw new Error("xlsxLite: bad central directory");
    const method = buf2.readUInt16LE(off + 10);
    const csize = buf2.readUInt32LE(off + 20);
    const nameLen = buf2.readUInt16LE(off + 28);
    const extraLen = buf2.readUInt16LE(off + 30);
    const commentLen = buf2.readUInt16LE(off + 32);
    const localOff = buf2.readUInt32LE(off + 42);
    const name = buf2.toString("utf8", off + 46, off + 46 + nameLen);
    const lNameLen = buf2.readUInt16LE(localOff + 26);
    const lExtraLen = buf2.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw2 = buf2.subarray(dataStart, dataStart + csize);
    const data = method === 0 ? Buffer.from(raw2) : zlib.inflateRawSync(raw2);
    out.set(name, data);
    off += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
function writeZipEntries(entries) {
  const now = /* @__PURE__ */ new Date();
  const dosTime = (now.getHours() & 31) << 11 | (now.getMinutes() & 63) << 5 | now.getSeconds() / 2 & 31;
  const dosDate = (now.getFullYear() - 1980 & 127) << 9 | (now.getMonth() + 1 & 15) << 5 | now.getDate() & 31;
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const crc = crc32(e.data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(67324752, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(2048, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(33639248, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(2048, 8);
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
  eocd.writeUInt32LE(101010256, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, eocd]);
}
function unescapeXml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&amp;/g, "&");
}
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function colToIndex(ref) {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
function indexToCol(i) {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
function parseSharedStrings(xml) {
  const out = [];
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
function parseSheetRows(xml, shared) {
  const rows = [];
  for (const rowXml of xml.match(/<row\b[^>]*>([\s\S]*?)<\/row>/g) ?? []) {
    const inner = rowXml.replace(/^<row\b[^>]*>/, "").replace(/<\/row>$/, "");
    const cells = [];
    const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m;
    while (m = re.exec(inner)) {
      const attrs = m[1] ?? "";
      const body = m[2] ?? "";
      const rMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      const col = rMatch ? colToIndex(rMatch[1]) : cells.length;
      const tMatch = attrs.match(/\bt="(\w+)"/);
      const t = tMatch ? tMatch[1] : "n";
      let value = null;
      if (t === "inlineStr") {
        const tm = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = tm ? unescapeXml(tm[1]) : "";
      } else {
        const vm = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
        const raw2 = vm ? unescapeXml(vm[1]) : "";
        if (raw2 === "") value = null;
        else if (t === "s") value = shared[Number(raw2)] ?? "";
        else if (t === "b") value = raw2 === "1";
        else if (t === "str" || t === "e") value = raw2;
        else {
          const n = Number(raw2);
          value = Number.isNaN(n) ? raw2 : n;
        }
      }
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    rows.push(cells);
  }
  return rows;
}
function readXlsx(buf2, opts) {
  const files = readZipEntries(buf2);
  const sharedXml = files.get("xl/sharedStrings.xml");
  const shared = sharedXml ? parseSharedStrings(sharedXml.toString("utf8")) : [];
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
  const headers = (rows[headerAt] ?? []).map((c) => c === null ? "" : String(c));
  const width = headers.length;
  const data = rows.slice(headerAt + 1).map((r) => {
    const out = [];
    for (let i = 0; i < width; i++) out.push(r[i] ?? null);
    return out;
  });
  return { name: sheetName, headers, rows: data };
}
function writeXlsx(sheet) {
  const width = Math.max(sheet.headers.length, ...sheet.rows.map((r) => r.length), 1);
  const allRows = [sheet.headers.map((h) => h), ...sheet.rows];
  const rowXml = allRows.map((row, ri) => {
    const cells = row.map((cell, ci) => {
      if (cell === null || cell === void 0) return "";
      const ref = `${indexToCol(ci)}${ri + 1}`;
      if (typeof cell === "number" && Number.isFinite(cell)) {
        return `<c r="${ref}"><v>${cell}</v></c>`;
      }
      if (typeof cell === "boolean") {
        return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell))}</t></is></c>`;
    }).join("");
    return `<row r="${ri + 1}">${cells}</row>`;
  }).join("");
  const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
  void width;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheet.name)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  return writeZipEntries([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rootRels, "utf8") },
    { name: "xl/workbook.xml", data: Buffer.from(workbook, "utf8") },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(wbRels, "utf8") },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml, "utf8") }
  ]);
}

// probe/excel.test.ts
var checks = 0;
var ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
function buildSheet(rows) {
  const headers = ["id", "date", "party", "quantity", "unit_price", "currency", "note"];
  const body = Array.from({ length: rows }, (_, i) => [
    String(i + 1),
    `2026-0${i % 9 + 1}-${String(i % 28 + 1).padStart(2, "0")}`,
    `Party ${String.fromCharCode(65 + i % 26)}${(i % 97).toString().padStart(2, "0")}`,
    String(i * 7 % 500),
    (i % 100 + 0.5).toFixed(2),
    i % 3 === 0 ? "USD" : "EUR",
    // deliberately awkward: commas, ampersands, angle brackets, a newline
    i % 11 === 0 ? "a, b & <c>\nwrapped" : `note ${i}`
  ]);
  return { name: "Sheet1", headers, rows: body };
}
var raw = buildSheet(5200);
ok(raw.rows.length === 5200, "sheet has 5200 data rows");
ok(raw.headers.length === 7, "sheet has 7 columns");
var buf = writeXlsx(raw);
ok(Buffer.isBuffer(buf) && buf.length > 0, "a workbook is written");
ok(buf.subarray(0, 2).toString("latin1") === "PK", "the workbook is a real zip container, not a renamed csv");
var back = readXlsx(buf);
ok(back.name === "Sheet1", "the sheet name survives the round-trip");
ok(back.headers.join("|") === raw.headers.join("|"), "headers survive round-trip");
ok(back.rows.length === raw.rows.length, "row count survives round-trip");
ok(String(back.rows[0][2]) === raw.rows[0][2], "first anchor row survives");
ok(String(back.rows[5199][0]) === "5200", "last anchor row survives");
ok(String(back.rows[0][6]).includes(","), "a comma inside a cell survives");
ok(String(back.rows[0][6]).includes("&"), "an ampersand inside a cell survives");
ok(String(back.rows[0][6]).includes("<c>"), "angle brackets inside a cell survive");
ok(String(back.rows[0][6]).split("\n").length === 2, "an embedded newline survives");
ok(back.rows.every((r) => r.length === raw.headers.length), "every row keeps its full width \u2014 no ragged rows");
ok(new Set(back.rows.map((r) => String(r[5]))).size === 2, "mixed cell types stay distinct");
ok(indexToCol(0) === "A" && indexToCol(25) === "Z" && indexToCol(26) === "AA", "column letters");
ok(indexToCol(701) === "ZZ" && indexToCol(702) === "AAA", "column letters past ZZ");
ok(colToIndex("A") === 0 && colToIndex("AA") === 26, "column indexes");
ok(colToIndex(indexToCol(255)) === 255, "the two directions agree at 256 columns");
console.log(`
${checks} checks, 0 failed`);
