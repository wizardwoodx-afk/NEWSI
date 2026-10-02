/**
 * The PDF page reader probe.
 *
 * THE ENGINE IS A SEAM, AND THE PROBE USES IT. `readPdf` takes an `engineFactory`, the
 * same way `generalist` takes `deps.fetchImpl` and `deps.gate`. The real engine carries a
 * 5 MB PDFium WASM binary; a self-contained bundle cannot carry that without doubling the
 * shipped offline pack, and the pack's zero-dependency property is what lets a stranger
 * reproduce the gate.
 *
 * So this probe drives a FAKE engine and tests what actually lives in this module: the
 * caps, the refusal words, the scanned-page decision, the deadline, the ledger line, and
 * the promise that nothing throws. None of that is the engine's behaviour. The real WASM
 * engine is proven separately, in `probe/pdfRenderLive.test.ts`, which declares honestly
 * that it needs node_modules.
 *
 * Two jobs, in the house style: determinism (same input, same answer, twice), and vectors
 * — including the one the product used to refuse. That refusal is asserted here as a
 * CAPABILITY, because that is what changed.
 */
import { readPdf, readLine, type ReadPdfOutcome, type PdfEngineHandle } from "../src/mission/pdfRender";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// ─────────────────────────────────────────────────────────────────────────────
// The fake engine. It answers the same surface clawpdf does, and it can be told to
// produce a text page, a scanned page, or to fail — which is what the caps need.

interface FakePage {
  text: string;
  widthPt: number;
  heightPt: number;
  pngBytes?: number;
  pngThrows?: boolean;
  noPngMethod?: boolean;
}

interface FakeSpec {
  pages: FakePage[];
  openThrows?: string;
  pageThrows?: string;
  countOpens?: { n: number };
  countRenders?: { n: number };
  countCloses?: { engine: number; doc: number };
}

function fakeEngine(spec: FakeSpec): () => Promise<PdfEngineHandle> {
  return async () => ({
    async open() {
      if (spec.openThrows) throw new Error(spec.openThrows);
      if (spec.countOpens) spec.countOpens.n++;
      const doc = {
        pageCount: spec.pages.length,
        async page(n: number) {
          if (spec.pageThrows) throw new Error(spec.pageThrows);
          if (n < 1 || n > spec.pages.length) {
            const e = new Error(`Page ${n} is outside 1..${spec.pages.length}`);
            (e as Error & { code?: string }).code = "page_range";
            throw e;
          }
          const p = spec.pages[n - 1];
          return {
            text: () => p.text,
            width: p.widthPt,
            height: p.heightPt,
            ...(p.noPngMethod ? {} : {
              async png(opts?: { dpi?: number }) {
                if (spec.countRenders) spec.countRenders.n++;
                if (p.pngThrows) throw new Error("rasteriser refused this page");
                const dpi = opts?.dpi ?? 96;
                const scale = dpi / 72;
                const px = Math.ceil(p.widthPt * scale) * Math.ceil(p.heightPt * scale);
                // A PNG-shaped payload: 8-byte signature plus a bounded body.
                const body = Math.max(16, Math.min(px, 4096));
                const out = new Uint8Array(8 + body);
                out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
                return out;
              },
            }),
          };
        },
        async close() { if (spec.countCloses) spec.countCloses.doc++; },
      };
      return doc;
    },
    async close() { if (spec.countCloses) spec.countCloses.engine++; },
  });
}

const TEXT_PAGE: FakePage = { text: "INVOICE 2026-Q3\nTotal: 48200 INR", widthPt: 612, heightPt: 792 };
const SCAN_PAGE: FakePage = { text: "", widthPt: 200, heightPt: 100 };
const THIN_PAGE: FakePage = { text: "ok", widthPt: 200, heightPt: 100 }; // below the text floor

const isPng = (b?: Uint8Array) =>
  !!b && b.byteLength > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

// ─────────────────────────────────────────────────────────────────────────────
section("1. a page WITH text is read as text, and nothing is rendered");

const renders1 = { n: 0 };
const t: ReadPdfOutcome = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true,
  engineFactory: fakeEngine({ pages: [TEXT_PAGE], countRenders: renders1 }),
});
ok("the read succeeds", t.ok, t.refusal?.words ?? "");
ok("one page is reported", t.result?.pageCount === 1, String(t.result?.pageCount));
ok("the text layer is read", (t.result?.pages[0].text ?? "").includes("INVOICE"), JSON.stringify(t.result?.pages[0].text));
ok("the page is NOT flagged as scanned", t.result?.pages[0].looksScanned === false);
ok("NO image was produced — text is lossless and cheaper", t.result?.pages[0].png === undefined);
ok("…and the engine's rasteriser was never called", renders1.n === 0, `${renders1.n} render calls`);
ok("…and the render path is honestly reported as unused", t.result?.usedRender === false);

// ─────────────────────────────────────────────────────────────────────────────
section("2. a page WITHOUT text — the case the product used to refuse");

const s = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true,
  engineFactory: fakeEngine({ pages: [SCAN_PAGE] }),
});
ok("the read still succeeds — a scan is a readable document, not an error", s.ok, s.refusal?.words ?? "");
ok("the page carries no text", (s.result?.pages[0].text ?? "") === "");
ok("the page IS flagged as scanned", s.result?.pages[0].looksScanned === true);
ok("the page index is 1-based, as a person counts", s.result?.pages[0].page === 1);
ok("…and scannedPages names it", s.result?.scannedPages.includes(1) === true, JSON.stringify(s.result?.scannedPages));
ok("an image WAS produced", isPng(s.result?.pages[0].png), `bytes=${s.result?.pages[0].png?.byteLength ?? 0}`);
ok("…and the render path reports itself as used", s.result?.usedRender === true);
ok("…with the pixel size recorded", (s.result?.pages[0].pngWidth ?? 0) > 0 && (s.result?.pages[0].pngHeight ?? 0) > 0,
  `${s.result?.pages[0].pngWidth}x${s.result?.pages[0].pngHeight}`);
ok("…and the point size preserved", s.result?.pages[0].widthPt === 200 && s.result?.pages[0].heightPt === 100,
  `${s.result?.pages[0].widthPt}x${s.result?.pages[0].heightPt}`);
ok("…and no page is listed unreadable", (s.result?.unreadablePages.length ?? -1) === 0, JSON.stringify(s.result?.unreadablePages));

// ─────────────────────────────────────────────────────────────────────────────
section("3. rendering is opt-in — a caller that wants only text pays nothing");

const renders3 = { n: 0 };
const noRender = await readPdf(new Uint8Array([1]), {
  engineFactory: fakeEngine({ pages: [SCAN_PAGE], countRenders: renders3 }),
});
ok("without the flag, the rasteriser is never called", renders3.n === 0, `${renders3.n} render calls`);
ok("…no image is produced", noRender.result?.pages[0].png === undefined);
ok("…but the page is still reported as scanned", noRender.result?.pages[0].looksScanned === true);
ok("…and it is listed as unreadable rather than silently empty",
  noRender.result?.unreadablePages.includes(1) === true, JSON.stringify(noRender.result?.unreadablePages));
ok("…and the ledger line does not claim the image path",
  !/image path used/.test(readLine(noRender, "scan.pdf")), readLine(noRender, "scan.pdf"));

// ─────────────────────────────────────────────────────────────────────────────
section("4. a page below the text floor counts as scanned, not as text");

const thin = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true,
  engineFactory: fakeEngine({ pages: [THIN_PAGE] }),
});
ok("'ok' (2 chars) is not enough to count as a text layer", thin.result?.pages[0].looksScanned === true);
ok("…so it is rendered", isPng(thin.result?.pages[0].png));
const thinHigh = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true, minTextChars: 1,
  engineFactory: fakeEngine({ pages: [THIN_PAGE] }),
});
ok("…and raising minTextChars to 1 flips the decision", thinHigh.result?.pages[0].looksScanned === false);
ok("…and then nothing is rendered", thinHigh.result?.pages[0].png === undefined);

// ─────────────────────────────────────────────────────────────────────────────
section("5. caps are refusals or honest reports — never a truncation");

const capPages = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true, maxRenderedPages: 1,
  engineFactory: fakeEngine({ pages: [SCAN_PAGE, SCAN_PAGE, SCAN_PAGE] }),
});
ok("a render cap renders up to the cap", capPages.result?.pages.filter((p) => p.png).length === 1);
ok("…and lists the rest as unreadable", capPages.result?.unreadablePages.length === 2, JSON.stringify(capPages.result?.unreadablePages));

const capPixels = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true, maxPixelsPerPage: 10,
  engineFactory: fakeEngine({ pages: [SCAN_PAGE] }),
});
ok("a pixel cap stops the render", capPixels.result?.pages[0].png === undefined);
ok("…and the page is listed unreadable", capPixels.result?.unreadablePages.includes(1) === true);

const capBytes = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true, maxTotalImageBytes: 1,
  engineFactory: fakeEngine({ pages: [SCAN_PAGE] }),
});
ok("a total-image-bytes cap REFUSES the read rather than truncating it", capBytes.ok === false, capBytes.result ? "returned ok" : "");
ok("…with words that name the remedy", /lower DPI|drop the file|fewer pages/i.test(capBytes.refusal?.words ?? ""), capBytes.refusal?.words?.slice(0, 90));
ok("…and nothing partial is offered", capBytes.result === undefined);

const capText = await readPdf(new Uint8Array([1]), {
  maxTextChars: 5,
  engineFactory: fakeEngine({ pages: [TEXT_PAGE] }),
});
ok("a text cap refuses rather than truncating", capText.ok === false, capText.result ? "returned ok" : "");
ok("…naming the remedy", /drop a chapter/i.test(capText.refusal?.words ?? ""), capText.refusal?.words?.slice(0, 90));

// ─────────────────────────────────────────────────────────────────────────────
section("6. the deadline is a refusal, never a partial read");

let calls = 0;
const dl = await readPdf(new Uint8Array([1]), {
  budgetMs: 1, now: () => (++calls > 1 ? 10_000_000 : 0),
  engineFactory: fakeEngine({ pages: [SCAN_PAGE] }),
});
ok("an expired budget refuses", dl.ok === false, dl.result ? "returned ok" : "");
ok("…with the deadline code", dl.refusal?.code === "deadline", dl.refusal?.code);
ok("…and names the pages, so a partial read is never dressed as a whole one",
  /page \d+ of \d+/.test(dl.refusal?.words ?? ""), dl.refusal?.words?.slice(0, 90));

// ─────────────────────────────────────────────────────────────────────────────
section("7. an engine that will not rasterise is reported, not silently empty");

const throwPng = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true,
  engineFactory: fakeEngine({ pages: [{ ...SCAN_PAGE, pngThrows: true }] }),
});
ok("a rasteriser that throws does not throw the read", throwPng.ok);
ok("…the page is listed unreadable", throwPng.result?.unreadablePages.includes(1) === true);
ok("…and it is NOT claimed as rendered", throwPng.result?.usedRender === false);

const noPngMethod = await readPdf(new Uint8Array([1]), {
  renderScannedPages: true,
  engineFactory: fakeEngine({ pages: [{ ...SCAN_PAGE, noPngMethod: true }] }),
});
ok("an engine with no rasteriser at all is handled", noPngMethod.ok);
ok("…page listed unreadable", noPngMethod.result?.unreadablePages.includes(1) === true);

// ─────────────────────────────────────────────────────────────────────────────
section("8. the engine is always released, on every path");

for (const [label, spec] of [
  ["a clean read", { pages: [TEXT_PAGE] }],
  ["a scanned read", { pages: [SCAN_PAGE] }],
] as const) {
  const closes = { engine: 0, doc: 0 };
  await readPdf(new Uint8Array([1]), { renderScannedPages: true, engineFactory: fakeEngine({ ...spec, countCloses: closes }) });
  ok(`both handles are closed after ${label}`, closes.engine === 1 && closes.doc === 1, JSON.stringify(closes));
}

const closeOnRefuse = { engine: 0, doc: 0 };
await readPdf(new Uint8Array([1]), {
  maxTextChars: 5, engineFactory: fakeEngine({ pages: [TEXT_PAGE], countCloses: closeOnRefuse }),
});
ok("…and after a refusal, too", closeOnRefuse.engine === 1 && closeOnRefuse.doc === 1, JSON.stringify(closeOnRefuse));

// ─────────────────────────────────────────────────────────────────────────────
section("9. determinism — the same input gives the same answer, twice");

const strip = (r: ReadPdfOutcome) => JSON.stringify({
  ...r,
  result: r.result && { ...r.result, pages: r.result.pages.map((p) => ({ ...p, png: p.png ? `png:${p.png.byteLength}` : undefined })) },
});
for (const [label, spec] of [["a text page", { pages: [TEXT_PAGE] }], ["a scanned page", { pages: [SCAN_PAGE] }], ["a mixed two-page file", { pages: [TEXT_PAGE, SCAN_PAGE] }]] as const) {
  const a = await readPdf(new Uint8Array([1]), { renderScannedPages: true, engineFactory: fakeEngine(spec) });
  const b = await readPdf(new Uint8Array([1]), { renderScannedPages: true, engineFactory: fakeEngine(spec) });
  ok(`identical outcome on repeat — ${label}`, strip(a) === strip(b));
}

// ─────────────────────────────────────────────────────────────────────────────
section("10. the reader never throws, whatever it is handed");

const HOSTILE: Array<[string, unknown]> = [
  ["empty bytes", new Uint8Array(0)],
  ["null", null],
  ["undefined", undefined],
  ["a string", "not bytes"],
  ["random bytes", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])],
  ["a zip file's bytes", new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])],
];
for (const [label, v] of HOSTILE) {
  let threw = false;
  let out: ReadPdfOutcome | null = null;
  try { out = await readPdf(v as Uint8Array, { engineFactory: fakeEngine({ pages: [TEXT_PAGE] }) }); } catch { threw = true; }
  ok(`does not throw on ${label}`, !threw && out !== null && (out!.ok || !!out!.refusal?.code), threw ? "THREW" : JSON.stringify(out?.refusal?.code ?? "ok"));
}

const emptyMsg = await readPdf(new Uint8Array(0), { engineFactory: fakeEngine({ pages: [] }) });
ok("empty input refuses in words", /nothing in it to read/i.test(emptyMsg.refusal?.words ?? ""), emptyMsg.refusal?.words);

const engineDown = await readPdf(new Uint8Array([1]), {
  engineFactory: fakeEngine({ pages: [], openThrows: "wasm heap exhausted" }),
});
ok("an engine that will not start refuses in words, not with a throw",
  engineDown.ok === false && engineDown.refusal?.code === "reader-unavailable", engineDown.refusal?.code);
ok("…and says what happened", /could not start/i.test(engineDown.refusal?.words ?? ""), engineDown.refusal?.words?.slice(0, 80));

const pageRange = await readPdf(new Uint8Array([1]), {
  engineFactory: fakeEngine({ pages: [TEXT_PAGE], pageThrows: "Page 7 is outside 1..1" }),
});
ok("a page-range error is a refusal, not an escape", pageRange.ok === false, pageRange.refusal?.code);

// ─────────────────────────────────────────────────────────────────────────────
section("11. the ledger line tells the truth about which path was used");

const lineText = readLine(t, "invoice.pdf");
ok("a text read does not claim the image path", !/image path used/.test(lineText), lineText);
ok("…and names the page count", /1 page/.test(lineText), lineText);

const lineScan = readLine(s, "stamped-circular.pdf");
ok("a rendered scan SAYS the image path was used", /image path used/.test(lineScan), lineScan);
ok("…and says why, not just that it happened", /no text layer/.test(lineScan), lineScan);
ok("…and names the file", lineScan.includes("stamped-circular.pdf"), lineScan);

const lineMixed = readLine(capPages, "batch.pdf");
ok("a partial render reports the unreadable pages", /unreadable/.test(lineMixed), lineMixed);

const lineRefused = readLine(capBytes, "huge-scan.pdf");
ok("a refusal line names the code", /refused \[/.test(lineRefused), lineRefused);

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
