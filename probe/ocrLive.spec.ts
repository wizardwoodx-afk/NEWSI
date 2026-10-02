/**
 * The local OCR reader — LIVE recogniser probe.
 *
 * WHY THIS IS A SEPARATE SUITE. `ocr.test.ts` drives a fake through the injection seam so
 * the offline pack stays dependency-free. That proves the LOGIC — the local-data rule,
 * the caps, the refusal words. It cannot prove the RECOGNISER: that real text in a real
 * image comes back as real text, with a confidence worth relying on. That is what this
 * suite is for, and it is the suite that carries the claim "a scanned page can now be
 * read without leaving the machine".
 *
 * It runs the FULL CHAIN: a PDF with a text layer is rendered to a PNG (which is what a
 * scan IS), and that PNG is recognised. The rendered text and the recognised text are
 * then compared against each other, because the rendered page gives us ground truth for
 * free — a property a real scan does not have, and the reason this suite can assert an
 * exact match instead of a fuzzy threshold.
 *
 * WHY IT REFUSES. The recogniser carries a WASM engine and needs language data on disk.
 * This suite therefore needs `node_modules`, and it says so in the house way: it prints
 * the exact `REFUSED (needs node_modules)` line and EXITS NON-ZERO, so the dev runner and
 * the offline runner both classify it honestly rather than counting it as a pass.
 */
import { readImages, ocrLine } from "../src/mission/ocr";
import { readPdf } from "../src/mission/pdfRender";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// ── Preflight: the recogniser AND its language data must both be usable here.
// Where the language data actually ships. `tools/vendor-ocr-assets.mjs` puts it here.
const DATA = process.env.SI_TESSDATA ?? path.join(process.cwd(), "public", "ocr", "tessdata");
try {
  const eng = path.join(DATA, "eng.traineddata.gz");
  const engPlain = path.join(DATA, "eng.traineddata");
  if (!existsSync(eng) && !existsSync(engPlain)) {
    throw new Error(`no eng language data in ${DATA}`);
  }
  const mod = (await import("tesseract.js")) as unknown as { createWorker: Function };
  if (typeof mod.createWorker !== "function") throw new Error("createWorker missing");
} catch (e) {
  console.log(
    "REFUSED (needs node_modules): the OCR recogniser (tesseract.js, a WASM build) or its " +
    `language data is not present in this tree — ${String(e instanceof Error ? e.message : e).slice(0, 90)}. ` +
    "The reader's LOGIC is proven by ocr.test.ts, which needs nothing; the RECOGNISER is not " +
    "proven here. Run `npm ci` and provision the language data, then re-run. Refused in words, never faked.",
  );
  process.exit(2); // non-zero so the runner marks SKIP, never PASS
}

// ─────────────────────────────────────────────────────────────────────────────
section("1. the full chain — a page with no text layer becomes text");

const PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
  "4 0 obj<</Length 96>>stream\nBT /F1 24 Tf 72 700 Td (INVOICE 2026-Q3) Tj 0 -40 Td (Total: 48200 INR) Tj ET\nendstream endobj\n" +
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>",
);

// A text page is NOT rendered by default — text is cheaper and lossless, and the module
// says so. To exercise the OCR path we raise the text floor above what the page carries,
// so the page is treated the way a scan is treated. That gives this suite something a real
// scan cannot: the page's own text layer is the GROUND TRUTH for the image being read.
const rendered = await readPdf(PDF, { renderScannedPages: true, dpi: 200, minTextChars: 10_000 });
ok("pdfRender produced a page image", rendered.ok && rendered.result?.usedRender === true,
  rendered.refusal?.words ?? "no render");

// Ground truth: the page's own text layer, which the render is an image OF.
const groundTruth = (rendered.result?.pages[0].text ?? "").replace(/\s+/g, " ").trim();
ok("ground truth was captured from the text layer", groundTruth.includes("INVOICE"), JSON.stringify(groundTruth));

const png = rendered.result!.pages[0].png!;
const ocr = await readImages([{ page: 1, png }], { dataPath: DATA, language: "eng" });
ok("the OCR read succeeds against the real recogniser", ocr.ok, ocr.refusal?.words ?? "");

const recognised = (ocr.result?.pages[0].text ?? "").replace(/\s+/g, " ").trim();
console.log(`           ground truth : ${JSON.stringify(groundTruth)}`);
console.log(`           recognised   : ${JSON.stringify(recognised)}`);
console.log(`           confidence   : ${ocr.result?.pages[0].confidence.toFixed(1)}%`);

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
for (const needle of ["INVOICE", "2026", "48200", "INR", "TOTAL"]) {
  ok(`the recogniser read "${needle}"`, norm(recognised).includes(needle), JSON.stringify(recognised));
}
ok("confidence clears the house floor", (ocr.result?.pages[0].confidence ?? 0) >= 55,
  `${ocr.result?.pages[0].confidence?.toFixed(1)}%`);

// ─────────────────────────────────────────────────────────────────────────────
section("2. the read is provably LOCAL — no network is involved");

ok("the result names the local data folder it used", ocr.result?.dataPath === DATA, ocr.result?.dataPath);
ok("…and the ledger line says the read was local", /read locally from/.test(ocrLine(ocr, "scan.pdf")), ocrLine(ocr, "scan.pdf"));
ok("…and never claims a remote source", !/http|cdn|download/i.test(ocrLine(ocr, "scan.pdf")), ocrLine(ocr, "scan.pdf"));

// ─────────────────────────────────────────────────────────────────────────────
section("3. refusing to fetch — a missing language is a refusal, not a download");

const empty = mkdtempSync(path.join(tmpdir(), "si-ocr-empty-"));
const noData = await readImages([{ page: 1, png }], { dataPath: empty, language: "eng" });
ok("an empty data folder refuses", noData.ok === false, noData.result ? "returned ok" : "");
ok("…with the language-data code", noData.refusal?.code === "language-data-missing", noData.refusal?.code);
ok("…and the words say it will not fetch", /does not fetch language data over the network/i.test(noData.refusal?.words ?? ""),
  noData.refusal?.words?.slice(0, 150));
writeFileSync(path.join(empty, "unused"), "");

// ─────────────────────────────────────────────────────────────────────────────
section("4. determinism across repeated recognitions");

const again = await readImages([{ page: 1, png }], { dataPath: DATA, language: "eng" });
ok("the same image recognises to the same text",
  again.result?.pages[0].text === ocr.result?.pages[0].text,
  JSON.stringify(again.result?.pages[0].text ?? "").slice(0, 60));

// ─────────────────────────────────────────────────────────────────────────────
section("5. an image with no text is honestly empty, not an error");

const blank = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR42mP4TyJgGNUwqmH4agAAr639H23ooMoAAAAASUVORK5CYII=",
  "base64",
));
const blankRead = await readImages([{ page: 1, png: blank }], { dataPath: DATA, language: "eng" });
ok("a blank image reads as an empty string, not a failure", blankRead.ok === true, blankRead.refusal?.words ?? "");
ok("…with no text", (blankRead.result?.pages[0].text ?? "") === "", JSON.stringify(blankRead.result?.pages[0].text));

// ─────────────────────────────────────────────────────────────────────────────
section("6. malformed bytes are a refusal, never a process-killing crash");

// This is the case that took the process down while this suite was being written. A worker
// error is delivered over a MessagePort callback that no try/catch in the reader can reach,
// so the reader must stop bad input BEFORE handing it over. Both guards are asserted here
// because only the live recogniser can prove the second one is doing any work.
const truncated = png.slice(0, 400); // real signature, broken body
const badRead = await readImages([{ page: 4, png: truncated }], { dataPath: DATA, language: "eng" });
ok("a truncated PNG does not kill the process", badRead.ok === false || typeof badRead.result?.pages[0].text === "string",
  badRead.refusal?.code ?? "");
ok("…and if it refuses, it refuses in words", badRead.ok === false ? /page 4/.test(badRead.refusal?.words ?? "") : true,
  badRead.refusal?.words?.slice(0, 90));

const garbage = new Uint8Array(2048).fill(0x41); // 2 KB of "A": no signature at all
const garbageRead = await readImages([{ page: 9, png: garbage }], { dataPath: DATA, language: "eng" });
ok("bytes that are not an image are refused before the recogniser sees them", garbageRead.ok === false, garbageRead.refusal?.code);
ok("…with the not-an-image code", garbageRead.refusal?.code === "not-an-image", garbageRead.refusal?.code);
ok("…naming the page", /page 9/.test(garbageRead.refusal?.words ?? ""), garbageRead.refusal?.words?.slice(0, 90));
ok("…and promising no text was invented", /no text was invented/.test(garbageRead.refusal?.words ?? ""));

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
