/**
 * THE DOCS DOOR, END TO END — a scan dropped on it comes back as knowledge.
 *
 * WHAT THIS PROVES THAT NOTHING ELSE DOES. `scannedPdf.test.ts` proves the branch's logic
 * with fakes; `ocrLive.spec.ts` proves the recogniser. Neither proves the thing the owner
 * actually asked for: that a PDF with NO text layer, dropped on the real door, walks the
 * real `parsePdf` path with the real renderer and the real recogniser and comes out as
 * markdown the next gate can distil.
 *
 * So this suite builds an actual SCAN — it renders a text page to pixels (which is what
 * scanning does) and wraps those pixels in a PDF that carries no text object at all — and
 * pushes it through `parsePdf`. Before this change, that returned
 * `empty-document: this PDF has no text layer`. The assertion is that it is now a
 * successful read, and the text matches.
 *
 * WHY IT REFUSES RATHER THAN SKIPS. It needs clawpdf (a 5 MB WASM engine) and the
 * recogniser's language data. If either is absent it prints the house refusal line and
 * EXITS NON-ZERO, so both runners classify it as a skip — never as a pass it did not earn.
 */
import { parsePdf } from "../src/mission/documentParsers";
import { readPdf } from "../src/mission/pdfRender";
import { existsSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// ── Preflight: both engines and the language data must be usable here.
// Where the language data actually ships. `tools/vendor-ocr-assets.mjs` puts it here.
const DATA = process.env.SI_TESSDATA ?? path.join(process.cwd(), "public", "ocr", "tessdata");
try {
  if (!existsSync(path.join(DATA, "eng.traineddata.gz")) && !existsSync(path.join(DATA, "eng.traineddata"))) {
    throw new Error(`no eng language data in ${DATA}`);
  }
  await import("clawpdf");
} catch (e) {
  console.log(
    "REFUSED (needs node_modules): the Docs-door scan path needs clawpdf (a WASM PDF renderer) " +
    `and OCR language data — ${String(e instanceof Error ? e.message : e).slice(0, 120)}. ` +
    "The door's LOGIC is proven by scannedPdf.test.ts, which needs nothing; the end-to-end read is NOT proven here.",
  );
  process.exit(2);
}
process.env.SI_OCR_DATA = DATA;

// ─────────────────────────────────────────────────────────────────────────────
// Build a SCAN. A PDF whose only content is an image of text, and which contains no text
// object anywhere — exactly the shape a flatbed scanner produces.

/**
 * Decode a PNG to raw RGB. A scan IS a PNG — the rasteriser hands back PNG bytes, and a
 * scanned PDF carries decoded pixels — so this is the honest round-trip, not a workaround.
 * Handles the shape clawpdf emits: 8-bit, non-interlaced, colour type 2 (RGB) or 6 (RGBA).
 */
function decodePng(png: Uint8Array): { rgb: Uint8Array; w: number; h: number } {
  const buf = Buffer.from(png);
  let off = 8, w = 0, h = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error(`unsupported PNG bit depth ${body[8]}`);
      if (body[12] !== 0) throw new Error("interlaced PNG not supported");
      colorType = body[9];
    } else if (type === "IDAT") { idat.push(body); }
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (channels === 0) throw new Error(`unsupported PNG colour type ${colorType}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[x] = v & 0xff;
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  const rgb = new Uint8Array(w * h * 3);
  for (let i = 0, j = 0; i < out.length; i += channels, j += 3) {
    rgb[j] = out[i]; rgb[j + 1] = out[i + 1]; rgb[j + 2] = out[i + 2];
  }
  return { rgb, w, h };
}

/**
 * Wrap raw RGB pixels in a PDF that has an image and nothing else.
 *
 * `pageW`/`pageH` are POINTS, and they matter: the reader bounds the pixels it is willing
 * to rasterise, and it projects that cost from the page box and the requested dpi. A PDF
 * whose MediaBox is stated in pixels rather than points therefore projects ~7.7× too large
 * and is correctly refused. A real scan is a US-Letter page holding a big image, so this
 * builds the same thing: an image at 200 dpi placed in a box of its size in points.
 */
function pdfOfImage(rgb: Uint8Array, w: number, h: number, pageW: number, pageH: number): Uint8Array {
  // The `cm` maps the image's UNIT square onto the page box: the image is `w`×`h` PIXELS
  // painted across `pageW`×`pageH` POINTS. Scaling by the pixel count instead would paint
  // a 1700×2200 image onto a 612×792 page, so only the bottom 36% would fall inside the
  // visible area — which for this page is blank paper, and the suite would "prove" that
  // OCR cannot read text that was never drawn.
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  const img = zlib.deflateSync(Buffer.from(rgb));
  const objects: string[] = [
    "<</Type/Catalog/Pages 2 0 R>>",
    "<</Type/Pages/Kids[3 0 R]/Count 1>>",
    `<</Type/Page/Parent 2 0 R/MediaBox[0 0 ${pageW} ${pageH}]/Resources<</XObject<</Im0 4 0 R>>>>/Contents 5 0 R>>`,
    `<</Type/XObject/Subtype/Image/Width ${w}/Height ${h}/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/FlateDecode/Length ${img.length}>>`,
    `<</Length ${content.length}>>`,
  ];
  let out = Buffer.from("%PDF-1.4\n");
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    const stream = i === 3 ? Buffer.concat([Buffer.from(img)]) : i === 4 ? Buffer.from(content) : null;
    if (stream) {
      out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n${body}\nstream\n`), stream, Buffer.from("\nendstream\nendobj\n")]);
    } else {
      out = Buffer.concat([out, Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`)]);
    }
  });
  const xref = out.length;
  let tail = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) tail += `${String(o).padStart(10, "0")} 00000 n \n`;
  tail += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.concat([out, Buffer.from(tail)]));
}

// Step 1: a text PDF — the source material.
const TEXT_PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
  "4 0 obj<</Length 104>>stream\nBT /F1 28 Tf 60 660 Td (INVOICE 2026-Q3) Tj 0 -60 Td (Total: 48200 INR) Tj ET\nendstream endobj\n" +
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>",
);

section("0. control — a PDF WITH a text layer still reads the old way, un-rasterised");

const withText = await parsePdf(TEXT_PDF, 100_000);
ok("the text-layer path still succeeds", withText.ok === true, withText.ok ? "" : withText.refusal.words);
ok("…and it did NOT go through OCR", withText.ok && !withText.notes.join(" ").includes("read as images"), withText.ok ? withText.notes.join(" | ") : "");
ok("…and it read the real text", withText.ok && withText.markdown.includes("INVOICE 2026-Q3"), withText.ok ? withText.markdown.slice(0, 80) : "");

section("1. build a genuine scan — pixels only, no text object in the file");

const rendered = await readPdf(TEXT_PDF, { renderScannedPages: true, dpi: 200, minTextChars: 10_000 });
ok("the source page rasterises", rendered.ok === true && rendered.result?.pages[0].png !== undefined, rendered.ok ? "no png" : rendered.refusal.words);

const decoded = decodePng(rendered.result!.pages[0].png!);
const { rgb, w, h } = decoded;
// Place the pixels in a Letter-sized box, the way a real scan does: the image is big, the
// PAGE is 612×792 points. Stating the box in pixels instead would (correctly) make the
// reader refuse to rasterise 28 megapixels, and this suite would be testing that refusal
// rather than the new branch.
const SCAN_PDF = pdfOfImage(rgb, w, h, 612, 792);
console.log(`           scan: ${w}×${h}px image on a 612×792pt page, ${SCAN_PDF.length} bytes, image-only`);

// THE PREMISE. The constructed PDF must genuinely carry no text object, or this suite
// proves nothing about the new branch — a PDF that admits to having text would be read by
// the old path and the assertions below would pass for the wrong reason. So this is
// asserted as a check, not left as an assumption.
const { readPdf: checkPdf } = await import("../src/mission/pdfRender");
const premise = await checkPdf(SCAN_PDF, { renderScannedPages: false });
ok("the constructed PDF really has no text layer", premise.ok === true && (premise.result?.pageCount ?? 0) === 1, "the scan is malformed");
ok("…and its one page carries no text at all", premise.ok === true && (premise.result?.pages[0].text ?? "x") === "", JSON.stringify(premise.ok ? premise.result?.pages[0].text : "?"));

section("2. the door reads the scan ON THIS MACHINE");

// The door needs to know where the language data is. In the app this is set once at boot
// by `configureOcrData`; here the suite sets it the same way the app does.
const { configureOcrData } = await import("../src/mission/ocrData");
configureOcrData({ dataPath: DATA, language: "eng" });

const scanned = await parsePdf(SCAN_PDF, 100_000);
ok("a PDF with no text layer is no longer refused", scanned.ok === true, scanned.ok ? "" : `${scanned.refusal.code}: ${scanned.refusal.words}`);
if (!scanned.ok) {
  console.log(`\n  refusal: ${scanned.refusal.code} — ${scanned.refusal.words}`);
} else {
  console.log(`           markdown: ${JSON.stringify(scanned.markdown.replace(/\n/g, " ⏎ ").slice(0, 160))}`);
  console.log(`           notes   : ${scanned.notes.join(" | ").slice(0, 200)}`);
  const md = scanned.markdown;
  const flat = md.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const needle of ["INVOICE", "2026", "48200", "INR", "TOTAL"]) {
    ok(`the door read "${needle}" out of the image`, flat.includes(needle));
  }
  ok("…and produced markdown with a heading", md.split("\n").some((l) => l.startsWith("## ")), md.slice(0, 120));
  ok("…and told the owner it was read off an image", scanned.notes.join(" ").includes("read as images"), scanned.notes.join(" | "));
  ok("…and said it happened on this machine", scanned.notes.join(" ").includes("on this machine"));
  ok("…and reported a confidence", /OCR confidence \d/.test(scanned.notes.join(" ")), scanned.notes.join(" | "));
  // THE POINT OF THE WHOLE EXERCISE: the markdown must be distillable by the next gate.
  const { extractStructure } = await import("../src/mission/knowledgeSkills");
  const structure = extractStructure(md);
  ok("the next gate finds structure in it", Boolean(structure) && (Array.isArray(structure) ? structure.length > 0 : true), JSON.stringify(structure).slice(0, 120));
}

// ─────────────────────────────────────────────────────────────────────────────
section("3. no language data means a refusal in words — never a download");

configureOcrData({ dataPath: "/nonexistent/tessdata/here", language: "eng" });
const noData = await parsePdf(SCAN_PDF, 100_000);
ok("an unconfigured read refuses", noData.ok === false, noData.ok ? "read succeeded with no data" : "");
ok("…with the ocr-unavailable code", !noData.ok && noData.refusal.code === "ocr-unavailable", !noData.ok ? noData.refusal.code : "");
ok("…naming the folder it looked in", !noData.ok && noData.refusal.words.includes("/nonexistent/tessdata/here"), !noData.ok ? noData.refusal.words.slice(0, 160) : "");
ok("…and saying the network is not the fallback", !noData.ok && /fetched over the network/.test(noData.refusal.words), "");
configureOcrData({ dataPath: DATA, language: "eng" });

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
