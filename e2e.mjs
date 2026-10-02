import { createEngine } from "clawpdf";
import { createWorker } from "tesseract.js";
import { writeFileSync } from "node:fs";

// ── A PDF that exists ONLY as text (the "born-digital" case)
const PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
  "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
  "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n" +
  "4 0 obj<</Length 96>>stream\nBT /F1 24 Tf 72 700 Td (INVOICE 2026-Q3) Tj 0 -40 Td (Total: 48200 INR) Tj ET\nendstream endobj\n" +
  "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>"
);

// ── STEP 1: render the page to a PNG. This IS what a scan looks like:
//    an image of text with no text layer.
const engine = await createEngine();
const doc = await engine.open(PDF);
const page = await doc.page(1);
const png = await page.png({ dpi: 200 });
writeFileSync("/tmp/ocrtest/page.png", png);
console.log(`1. RENDER   : ${png.byteLength} byte PNG  (${page.width}x${page.height}pt @200dpi)`);

// The text layer, for comparison
const layerText = (page.text() ?? "").trim();
console.log(`   text layer: ${JSON.stringify(layerText)}`);

// ── STEP 2: OCR the PNG — treating it as if it were a scan
const worker = await createWorker("eng");
const { data } = await worker.recognize("/tmp/ocrtest/page.png");
await worker.terminate();

const ocrText = (data.text ?? "").replace(/\s+/g, " ").trim();
console.log(`2. OCR      : ${JSON.stringify(ocrText)}`);
console.log(`   confidence: ${data.confidence?.toFixed(1)}%`);

// ── STEP 3: the comparison that matters
const norm = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
console.log("\n3. MATCH");
for (const needle of ["INVOICE", "2026", "48200", "INR", "TOTAL"]) {
  console.log(`   ${needle.padEnd(9)} ${norm(ocrText).includes(needle) ? "FOUND" : "MISSING"}`);
}
await engine.close?.();
