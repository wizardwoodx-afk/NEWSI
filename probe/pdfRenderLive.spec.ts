/**
 * The PDF page reader — LIVE engine probe.
 *
 * WHY THIS IS A SEPARATE SUITE. `pdfRender.test.ts` drives a fake through the injection
 * seam so the offline pack stays dependency-free. That proves the LOGIC. It cannot prove
 * the ENGINE — that the real PDFium WASM binary starts, reads a text layer, and
 * rasterises a page with no text layer. That is what this suite is for, and it is the
 * suite that carries the claim "a scanned PDF can now be read".
 *
 * WHY IT MAY REFUSE. The engine carries a 5 MB WASM binary. This suite therefore needs
 * `node_modules`, and it declares that in the house way: when the tree is a bare
 * checkout, it prints the exact `REFUSED (needs node_modules)` line the offline runner
 * recognises and marks SKIP — counted separately, never as a pass, never as a failure.
 * A skip is a statement that the claim was not tested here, which is honest. It is not a
 * claim that the claim holds.
 */
import { readPdf } from "../src/mission/pdfRender";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// ── The house preflight: can the engine actually START here? ─────────────────
//
// The check must go beyond `import`. In the offline pack the module's JavaScript IS
// bundled in, so an import succeeds — and then the first real call fails, because the
// 5 MB PDFium binary is not inside the bundle and cannot be. A preflight that only
// imported would let this suite fail in the pack; a preflight that STARTS the engine
// refuses honestly, which is the whole point of the contract.
try {
  const mod = (await import("clawpdf")) as unknown as { createEngine(): Promise<{ close?(): Promise<void> }> };
  const probeEngine = await mod.createEngine();
  await probeEngine.close?.();
} catch {
  console.log(
    "REFUSED (needs node_modules): the PDF engine (clawpdf, a PDFium WASM binding) cannot " +
    "start in this tree — the binding's JavaScript may be present while its 5 MB WASM binary " +
    "is not, and no self-contained bundle can carry that binary. The reader's LOGIC is proven " +
    "by pdfRender.test.ts, which needs nothing; the ENGINE is not proven here. Run `npm ci` " +
    "first, then re-run. Refused in words, never faked.",
  );
  // EXIT NON-ZERO ON PURPOSE. The offline runner classifies a suite as SKIP only when
  // the process FAILS *and* its output carries the refusal reason: an exit of 0 is
  // unconditionally recorded as a PASS. Exiting 0 here would therefore launder "the
  // engine was never started" into "the claim was verified" — the exact failure the
  // 16.9.0 offline-honesty patch exists to prevent. A refusal to verify is not a pass.
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures, assembled in memory — no binary blobs in the repo.

/** A one-page PDF carrying a real text layer. */
const TEXT_PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
  "4 0 obj<</Length 74>>stream\nBT /F1 14 Tf 72 720 Td (INVOICE 2026-Q3) Tj 0 -22 Td (Total: 48200 INR) Tj ET\nendstream endobj\n" +
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>",
);

/**
 * A one-page PDF whose entire content is a 4x4 image — no text operators at all. This is
 * the shape `documentParsers` refused, and the whole point of the render path.
 */
function scannedPdf(): Uint8Array {
  const px = new Uint8Array(48);
  for (let i = 0; i < 48; i += 3) { px[i] = 255; px[i + 1] = 0; px[i + 2] = 0; }
  const head = new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Resources<</XObject<</Im1 4 0 R>>>>/Contents 5 0 R>>endobj\n" +
    "4 0 obj<</Type/XObject/Subtype/Image/Width 4/Height 4/ColorSpace/DeviceRGB/BitsPerComponent 8/Length 48>>stream\n",
  );
  const tail = new TextEncoder().encode(
    "\nendstream endobj\n5 0 obj<</Length 33>>stream\nq 200 0 0 100 0 0 cm /Im1 Do Q\nendstream endobj\ntrailer<</Root 1 0 R>>",
  );
  const out = new Uint8Array(head.length + px.length + tail.length);
  out.set(head, 0); out.set(px, head.length); out.set(tail, head.length + px.length);
  return out;
}

const isPng = (b?: Uint8Array) =>
  !!b && b.byteLength > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

// ─────────────────────────────────────────────────────────────────────────────
section("1. the real engine reads a text layer");

const t = await readPdf(TEXT_PDF, { renderScannedPages: true });
ok("the read succeeds against the real PDFium engine", t.ok, t.refusal?.words ?? "");
ok("one page is reported", t.result?.pageCount === 1, String(t.result?.pageCount));
ok("the invoice number is read", (t.result?.pages[0].text ?? "").includes("INVOICE 2026-Q3"),
  JSON.stringify(t.result?.pages[0].text));
ok("the total is read", (t.result?.pages[0].text ?? "").includes("48200"), JSON.stringify(t.result?.pages[0].text));
ok("the page box is reported in points", t.result?.pages[0].widthPt === 612 && t.result?.pages[0].heightPt === 792,
  `${t.result?.pages[0].widthPt}x${t.result?.pages[0].heightPt}`);
ok("nothing was rendered — text was enough", t.result?.usedRender === false);

// ─────────────────────────────────────────────────────────────────────────────
section("2. THE CLAIM — a scanned PDF is now readable");

const s = await readPdf(scannedPdf(), { renderScannedPages: true });
ok("the read succeeds — where the product previously refused outright", s.ok, s.refusal?.words ?? "");
ok("the page carries no text layer", (s.result?.pages[0].text ?? "") === "");
ok("…and is correctly flagged as scanned", s.result?.pages[0].looksScanned === true);
ok("…and a REAL PNG was rasterised by PDFium", isPng(s.result?.pages[0].png),
  `bytes=${s.result?.pages[0].png?.byteLength ?? 0}`);
ok("…of a plausible size for a 200x100pt page at 96 DPI", (s.result?.pages[0].png?.byteLength ?? 0) > 100,
  `${s.result?.pages[0].png?.byteLength ?? 0} bytes`);
ok("…and the render path reports itself as used", s.result?.usedRender === true);
ok("…and the pixel dimensions match the point box at 96 DPI",
  s.result?.pages[0].pngWidth === Math.ceil(200 * 96 / 72) && s.result?.pages[0].pngHeight === Math.ceil(100 * 96 / 72),
  `${s.result?.pages[0].pngWidth}x${s.result?.pages[0].pngHeight}`);

// A higher DPI must produce a larger page image — proves the option is honoured.
const s150 = await readPdf(scannedPdf(), { renderScannedPages: true, dpi: 150 });
ok("a higher DPI yields a larger rendering",
  (s150.result?.pages[0].png?.byteLength ?? 0) >= (s.result?.pages[0].png?.byteLength ?? 0),
  `96dpi=${s.result?.pages[0].png?.byteLength ?? 0}b  150dpi=${s150.result?.pages[0].png?.byteLength ?? 0}b`);

// ─────────────────────────────────────────────────────────────────────────────
section("3. the engine's own refusals arrive as words, not throws");

const junk = await readPdf(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]), { renderScannedPages: true });
ok("a non-PDF is refused in words", junk.ok === false, junk.result ? "returned ok" : "");
ok("…with a named code", typeof junk.refusal?.code === "string" && junk.refusal!.code.length > 0, junk.refusal?.code);
ok("…and the words explain rather than saying 'error'",
  (junk.refusal?.words ?? "").length > 40, junk.refusal?.words?.slice(0, 100));

// ─────────────────────────────────────────────────────────────────────────────
section("4. the real engine is deterministic across two runs");

const a1 = await readPdf(scannedPdf(), { renderScannedPages: true });
const a2 = await readPdf(scannedPdf(), { renderScannedPages: true });
ok("the same bytes render the same number of image bytes",
  a1.result?.pages[0].png?.byteLength === a2.result?.pages[0].png?.byteLength,
  `${a1.result?.pages[0].png?.byteLength} vs ${a2.result?.pages[0].png?.byteLength}`);
ok("…and the text read is identical",
  a1.result?.pages[0].text === a2.result?.pages[0].text);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
