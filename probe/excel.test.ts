/**
 * probe · excel — the spreadsheet layer, on its own.
 *
 * This used to be `financeExcel`: it built a synthetic invoice ledger, classified
 * every line into statutory buckets, minted receipts and verified the chain. That
 * was one jurisdiction's bookkeeping wearing the name of a product feature, and it
 * is gone.
 *
 * What is left is the part that is not about any ledger at all: a dependency-free
 * XLSX reader and writer, on the Documents wing, against a sheet big enough to
 * break naive implementations. Large-spreadsheet handling is a real product
 * surface — a user drops a 5,000-row export on it — so it keeps its own probe
 * rather than inheriting one from a feature that no longer exists.
 */
import assert from "node:assert/strict";
import { writeXlsx, readXlsx, indexToCol, colToIndex } from "../src/engine/finance/xlsxLite";

let checks = 0;
const ok = (cond: boolean, msg: string): void => {
  assert.ok(cond, msg);
  checks += 1;
};

/** A wide, mixed-type sheet: the shape a real export has, not a tidy toy. */
function buildSheet(rows: number) {
  const headers = ["id", "date", "party", "quantity", "unit_price", "currency", "note"];
  const body = Array.from({ length: rows }, (_, i) => [
    String(i + 1),
    `2026-0${(i % 9) + 1}-${String((i % 28) + 1).padStart(2, "0")}`,
    `Party ${String.fromCharCode(65 + (i % 26))}${(i % 97).toString().padStart(2, "0")}`,
    String((i * 7) % 500),
    ((i % 100) + 0.5).toFixed(2),
    i % 3 === 0 ? "USD" : "EUR",
    // deliberately awkward: commas, ampersands, angle brackets, a newline
    i % 11 === 0 ? "a, b & <c>\nwrapped" : `note ${i}`,
  ]);
  return { name: "Sheet1", headers, rows: body };
}

const raw = buildSheet(5200);
ok(raw.rows.length === 5200, "sheet has 5200 data rows");
ok(raw.headers.length === 7, "sheet has 7 columns");

const buf = writeXlsx(raw);
ok(Buffer.isBuffer(buf) && buf.length > 0, "a workbook is written");
ok(buf.subarray(0, 2).toString("latin1") === "PK", "the workbook is a real zip container, not a renamed csv");

const back = readXlsx(buf);
ok(back.name === "Sheet1", "the sheet name survives the round-trip");
ok(back.headers.join("|") === raw.headers.join("|"), "headers survive round-trip");
ok(back.rows.length === raw.rows.length, "row count survives round-trip");
ok(String(back.rows[0][2]) === raw.rows[0][2], "first anchor row survives");
ok(String(back.rows[5199][0]) === "5200", "last anchor row survives");

/* The XML escaping is where a hand-rolled writer quietly corrupts a file: a
 * stray comma or an angle bracket makes the workbook unopenable in Excel while
 * looking perfectly fine to us. So the awkward cells are pinned, not the tidy
 * ones. */
ok(String(back.rows[0][6]).includes(","), "a comma inside a cell survives");
ok(String(back.rows[0][6]).includes("&"), "an ampersand inside a cell survives");
ok(String(back.rows[0][6]).includes("<c>"), "angle brackets inside a cell survive");
ok(String(back.rows[0][6]).split("\n").length === 2, "an embedded newline survives");
ok(back.rows.every((r) => r.length === raw.headers.length), "every row keeps its full width — no ragged rows");
ok(new Set(back.rows.map((r) => String(r[5]))).size === 2, "mixed cell types stay distinct");

/* Excel's column addressing: get it wrong and a 27th column is unreachable. */
ok(indexToCol(0) === "A" && indexToCol(25) === "Z" && indexToCol(26) === "AA", "column letters");
ok(indexToCol(701) === "ZZ" && indexToCol(702) === "AAA", "column letters past ZZ");
ok(colToIndex("A") === 0 && colToIndex("AA") === 26, "column indexes");
ok(colToIndex(indexToCol(255)) === 255, "the two directions agree at 256 columns");

console.log(`\n${checks} checks, 0 failed`);
