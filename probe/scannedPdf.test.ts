/**
 * The scanned-document reader probe — the Docs door's new branch.
 *
 * WHAT CHANGED, AND WHY THIS PROBE EXISTS. `documentParsers.parsePdf` used to refuse a PDF
 * with no text layer: "this PDF has no text layer — it is a scan or an image." Honest, and
 * a dead end. `scannedPdf.readScannedPdf` is what that branch now calls. This probe proves
 * the branch's behaviour with both engines faked, so it runs inside the self-contained
 * offline pack with Node and nothing else — the same reason `pdfRender.test.ts` and
 * `ocr.test.ts` drive fakes. The REAL engines are proven in `probe/scanDoor.spec.ts`.
 *
 * The four things that would make this feature a liability rather than a capability, and
 * which are therefore each pinned below:
 *   1. it must never reach the network for language data — a refusal in words instead;
 *   2. it must produce MARKDOWN WITH STRUCTURE, or the door's next gate rejects the very
 *      document it just read;
 *   3. it must stay inside the same caps every other reader obeys;
 *   4. it must never turn a document nobody could read into a cheerful empty success.
 */
import { readScannedPdf, readImageDocument, ensureLocalAssets } from "../src/mission/scannedPdf";
import type { ReadPdfOptions, PdfEngineHandle } from "../src/mission/pdfRender";
import type { OcrEngineHandle, OcrOptions } from "../src/mission/ocr";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

// A checksum-valid 16×16 white PNG. Real bytes, because ocr.ts checks the signature
// before it hands anything to the recogniser — a fake string would not exercise that.
const BLANK_PNG = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR42mP4TyJgGNUwqmH4agAAr639H23ooMoAAAAASUVORK5CYII=",
  "base64",
));

type Factory<T> = (() => Promise<T>) | undefined;
function pdfEngine(pages: Array<{ text: string; png?: Uint8Array }>): NonNullable<ReadPdfOptions["engineFactory"]> {
  return async () => ({
    async open() {
      return {
        pageCount: pages.length,
        async page(n: number) {
          if (n < 1 || n > pages.length) throw new Error(`Page ${n} is outside 1..${pages.length}`);
          const p = pages[n - 1];
          return { text: () => p.text, width: 612, height: 792, png: () => p.png ?? BLANK_PNG };
        },
        close() {},
      };
    },
    close() { return Promise.resolve(); },
  }) as unknown as PdfEngineHandle as never;
}
function ocrEngine(text: string, confidence = 90, countStarts?: { n: number }): NonNullable<OcrOptions["engineFactory"]> {
  return async () => {
    if (countStarts) countStarts.n++;
    return {
      async recognize() { return { data: { text, confidence, words: [] } }; },
      async terminate() {},
    } as unknown as OcrEngineHandle;
  };
}

const DATA = "/local/tessdata";
const hasData = (dir: string) => dir === DATA;
const SCAN = pdfEngine([{ text: "" }, { text: "" }]);   // no text layer: two scanned pages

// ─────────────────────────────────────────────────────────────────────────────
section("1. a scan with no text layer becomes markdown the door can distil");

const read = await readScannedPdf(new Uint8Array([1, 2, 3]), {
  dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: SCAN as Factory<PdfEngineHandle> as never,
  ocrEngineFactory: ocrEngine("INVOICE 2026-Q3\nTotal: 48200 INR") as Factory<OcrEngineHandle> as never,
});
ok("the read succeeds where it used to refuse", read.ok === true, read.ok ? "" : read.refusal.words);
const md = read.ok ? read.markdown : "";
console.log(`           markdown: ${JSON.stringify(md)}`);
ok("…and carries the recognised text", md.includes("INVOICE 2026-Q3") && md.includes("48200"), md);
ok("…with a heading per page — the structure the next gate requires", md.split("\n").filter((l) => l.startsWith("## Page ")).length === 2, md);
ok("…so it is not flat prose", md.split("\n").some((l) => /^## /.test(l)), md);

// ─────────────────────────────────────────────────────────────────────────────
section("2. the read says, in the document's own notes, that it came off an image");

const notes = read.ok ? read.notes.join(" | ") : "";
ok("the notes say the pages were read as images", /no text layer and were read as images/.test(notes), notes);
ok("…and say it happened ON THIS MACHINE", /on this machine/.test(notes), notes);
ok("…and report the confidence", /confidence 90\.0%/.test(notes), notes);
ok("…and name the language", /\beng\b/.test(notes), notes);
ok("a good read is not nagged about", !/below the/.test(notes), notes);

// ─────────────────────────────────────────────────────────────────────────────
section("3. a poor read is offered WITH its caveat, never quietly");

const poor = await readScannedPdf(new Uint8Array([1]), {
  dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: pdfEngine([{ text: "" }]) as never,
  ocrEngineFactory: ocrEngine("smudged w0rds", 31) as never,
});
ok("a low-confidence read still succeeds", poor.ok === true, poor.ok ? "" : poor.refusal.words);
const pn = poor.ok ? poor.notes.join(" | ") : "";
ok("…but its note says it is unreliable", /below the 55% floor/.test(pn), pn);
ok("…and says what to do about it", /worth a look/.test(pn), pn);
ok("…and names the page", /Page 1 was read at 31\.0%/.test(pn), pn);

// ─────────────────────────────────────────────────────────────────────────────
section("4. the language data is a precondition — no data, no fetch, no read");

const noPath = await readScannedPdf(new Uint8Array([1]), {
  dataPath: null, hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: SCAN as never, ocrEngineFactory: ocrEngine("x") as never,
});
ok("an unconfigured build refuses", noPath.ok === false, noPath.ok ? "read succeeded" : "");
ok("…with the code the door can act on", !noPath.ok && noPath.refusal.code === "ocr-unavailable", !noPath.ok ? noPath.refusal.code : "");
ok("…saying nothing was read", !noPath.ok && /Nothing was read/.test(noPath.refusal.words), "");
ok("…saying nothing was fetched", !noPath.ok && /nothing was fetched/.test(noPath.refusal.words), "");

const missing = await readScannedPdf(new Uint8Array([1]), {
  dataPath: "/local/empty", hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: SCAN as never, ocrEngineFactory: ocrEngine("x") as never,
});
ok("a folder with no language data refuses", missing.ok === false, missing.ok ? "read succeeded" : "");
ok("…and names the folder it looked in", !missing.ok && missing.refusal.words.includes("/local/empty"), !missing.ok ? missing.refusal.words.slice(0, 120) : "");
ok("…and says the network is not the fallback", !missing.ok && /nothing was fetched over the network/.test(missing.refusal.words), "");

// ─────────────────────────────────────────────────────────────────────────────
section("5. the recogniser is never started when the precondition fails");

const starts = { n: 0 };
const guarded = await readScannedPdf(new Uint8Array([1]), {
  dataPath: "/local/empty", hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: SCAN as never, ocrEngineFactory: ocrEngine("x", 90, starts) as never,
});
ok("the precondition refusal happened", guarded.ok === false);
ok("…and no recogniser was started for it", starts.n === 0, `${starts.n} starts`);

// ─────────────────────────────────────────────────────────────────────────────
section("6. an unreadable document is refused, never approved as empty");

const blankPages = await readScannedPdf(new Uint8Array([1]), {
  dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: pdfEngine([{ text: "" }, { text: "" }]) as never,
  ocrEngineFactory: ocrEngine("", 0) as never,
});
ok("two pages that yield no text are refused", blankPages.ok === false, blankPages.ok ? "approved as empty" : "");
ok("…with the empty-document code", !blankPages.ok && blankPages.refusal.code === "empty-document", !blankPages.ok ? blankPages.refusal.code : "");
ok("…stating the dpi it tried", !blankPages.ok && /200 dpi/.test(blankPages.refusal.words), "");
ok("…and stating nothing was invented", !blankPages.ok && /Nothing was invented/.test(blankPages.refusal.words), "");

// ─────────────────────────────────────────────────────────────────────────────
section("7. the door's caps still hold on the new path");

const huge = await readScannedPdf(new Uint8Array([1]), {
  dataPath: DATA, hasLanguageData: hasData, maxChars: 40,
  pdfEngineFactory: SCAN as never,
  ocrEngineFactory: ocrEngine("A fairly long line of recognised text") as never,
});
ok("text above the door's character cap is refused", huge.ok === false, huge.ok ? "accepted over cap" : "");
ok("…with the parsed-too-large code", !huge.ok && huge.refusal.code === "parsed-too-large", !huge.ok ? huge.refusal.code : "");

const capped = await readScannedPdf(new Uint8Array([1]), {
  dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000, minConfidence: 55,
  pdfEngineFactory: pdfEngine([{ text: "" }, { text: "" }, { text: "" }]) as never,
  ocrEngineFactory: ocrEngine("text", 90) as never,
});
ok("three pages read in one call", capped.ok === true && (capped.ok ? capped.markdown.split("## Page").length - 1 : 0) === 3, "");

// ─────────────────────────────────────────────────────────────────────────────
section("8. it never throws, whatever it is handed");

const hostile: Array<[string, () => Promise<unknown>]> = [
  ["zero bytes", () => readScannedPdf(new Uint8Array(0), { dataPath: DATA, hasLanguageData: hasData, maxChars: 100, pdfEngineFactory: SCAN as never, ocrEngineFactory: ocrEngine("t") as never })],
  ["a rasteriser that throws", () => readScannedPdf(new Uint8Array([1]), {
    dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
    pdfEngineFactory: (async () => { throw new Error("pdfium refused"); }) as never,
    ocrEngineFactory: ocrEngine("t") as never,
  })],
  ["a recogniser that throws", () => readScannedPdf(new Uint8Array([1]), {
    dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
    pdfEngineFactory: SCAN as never,
    ocrEngineFactory: (async () => { throw new Error("worker died"); }) as never,
  })],
  ["no options at all", () => readScannedPdf(new Uint8Array([1]), { maxChars: 100 })],
  ["a data path of empty string", () => readScannedPdf(new Uint8Array([1]), { dataPath: "", hasLanguageData: hasData, maxChars: 100, pdfEngineFactory: SCAN as never })],
];
for (const [label, run] of hostile) {
  let threw = false; let out: { ok?: boolean; refusal?: { code: string; words: string } } = {};
  try { out = (await run()) as typeof out; } catch { threw = true; }
  ok(`does not throw on ${label}`, !threw, "threw");
  if (!threw) ok(`…and refuses in words on ${label}`, out.ok === false && typeof out.refusal?.code === "string", JSON.stringify(out).slice(0, 80));
}

// ─────────────────────────────────────────────────────────────────────────────
section("9a. THE PREFLIGHT ASKS THE QUESTION THAT FITS THE RUNTIME");

// The regression this section exists for, in the words it was found in:
//   "In an actual browser/Tauri WebView there is no node:fs, so defaultHasLanguageData
//    returns false, and the app can ship the OCR assets correctly and still refuse to OCR."
// The check was correct about the world it could see and wrong about the world it was in:
// it asked a filesystem about a URL. These cases pin both halves — the browser must not be
// refused for data that is present, and must not be waved through when it is absent.
{
  // `null` is not "a filesystem that says no" — it is "THERE IS NO FILESYSTEM HERE", which
  // is precisely what `ambientFs()` returns inside a webview and precisely why the old check
  // was wrong there. A filesystem that exists and lacks the file is a different, correct
  // refusal, and case (e) pins that too.
  const NO_FS = null;
  const fsPresent = { existsSync: (p: string) => p.includes("eng.traineddata") };

  // (a) A webview with no filesystem, asking its OWN ORIGIN: the asset is there → proceed.
  const okUrl = await ensureLocalAssets(
    { maxChars: 1000, dataPath: "/ocr/tessdata", language: "eng", fsImpl: NO_FS,
      corePath: "/ocr/core", workerPath: "/ocr/worker.min.js" },
    { fetchImpl: async () => ({ ok: true, status: 200 }) },
  );
  ok("a browser with the asset at its own origin is NOT refused", okUrl.ok === true, okUrl.ok ? "" : okUrl.words);
  ok("…and the check reports which question it answered", okUrl.ok === true && okUrl.how === "asset-url", okUrl.ok ? okUrl.how : "");

  // (b) The same webview, but the build genuinely did not ship the asset → refuse, naming it.
  const missing = await ensureLocalAssets(
    { maxChars: 1000, dataPath: "/ocr/tessdata", language: "eng", fsImpl: NO_FS, corePath: "/ocr/core" },
    { fetchImpl: async () => ({ ok: false, status: 404 }) },
  );
  ok("a browser missing the asset IS refused", missing.ok === false, missing.ok ? "read allowed" : "");
  ok("…naming the exact URL, so the fix is obvious", missing.ok === false && missing.words.includes("/ocr/tessdata/eng.traineddata.gz"), missing.ok ? "" : missing.words.slice(0, 140));
  ok("…and saying nothing was fetched from outside the app", missing.ok === false && /outside this app/.test(missing.words), "");

  // (c) A webview whose server will not answer the question at all. Absence of information
  //     must NOT be turned into a refusal — that would be the original bug, inverted.
  const unknown = await ensureLocalAssets(
    { maxChars: 1000, dataPath: "/ocr/tessdata", language: "eng", fsImpl: NO_FS },
    { fetchImpl: async () => { throw new Error("offline"); } },
  );
  ok("an unanswerable presence check does NOT refuse", unknown.ok === true, unknown.ok ? "" : unknown.words);
  ok("…and says so rather than claiming the asset is there", unknown.ok === true && unknown.how === "unverifiable", unknown.ok ? unknown.how : "");

  // (d) There is no fetch at all (a bare sandbox). Same rule: unknown is not absent.
  const noFetch = await ensureLocalAssets(
    { maxChars: 1000, dataPath: "/ocr/tessdata", language: "eng", fsImpl: NO_FS, corePath: "/c", workerPath: "/w" },
    { fetchImpl: null },
  );
  ok("no way to check is not the same as missing", noFetch.ok === true, noFetch.ok ? "" : noFetch.words);

  // (e) A real filesystem still wins, and a real absence there is still a refusal.
  const onDisk = await ensureLocalAssets({ maxChars: 1000, dataPath: "/local/tessdata", language: "eng", fsImpl: fsPresent }, { fetchImpl: null });
  ok("a filesystem that has the data is accepted", onDisk.ok === true && onDisk.how === "filesystem", onDisk.ok ? onDisk.how : "");
  const notOnDisk = await ensureLocalAssets({ maxChars: 1000, dataPath: "/local/tessdata", language: "jpn", fsImpl: fsPresent }, { fetchImpl: null });
  ok("…and a language the filesystem lacks is refused", notOnDisk.ok === false, notDiskWords(notOnDisk));

  // (f) An injected answer still overrides everything — how the other sections pin refusals.
  const injected = await ensureLocalAssets({ maxChars: 1000, dataPath: "/x", hasLanguageData: () => true, fsImpl: null }, { fetchImpl: null });
  ok("an injected presence answer overrides both probes", injected.ok === true, injected.ok ? "" : injected.words);

  // (g) No configuration at all is a refusal, and it happens before any probing.
  const unconfigured = await ensureLocalAssets({ maxChars: 1000, dataPath: null }, { fetchImpl: null });
  ok("an unconfigured build refuses", unconfigured.ok === false, unconfigured.ok ? "allowed" : "");
  ok("…with words that name the situation", unconfigured.ok === false && /no OCR language data configured/.test(unconfigured.words), "");
}
function notDiskWords(r: { ok: boolean; words?: string }): string { return r.ok ? "ALLOWED" : (r.words ?? "").slice(0, 90); }

// ─────────────────────────────────────────────────────────────────────────────
section("9b. a MIXED document is spliced by page, not decided as a whole");

// The second half of the same review: `documentParsers` only called the image reader when
// the WHOLE document produced no text, so a typed cover sheet over a scanned body meant the
// scanned pages were never read and were never mentioned. `readScannedPdf` now renders with
// the reader's DEFAULT text floor, so it returns exactly the pages that have no text — and
// this section pins that it is those pages, keyed by number, that come back.
{
  const mixed = await readScannedPdf(new Uint8Array([1]), {
    dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
    pdfEngineFactory: pdfEngine([{ text: "" }, { text: "" }]) as never,
    ocrEngineFactory: ocrEngine("SCANNED BODY") as never,
  });
  ok("the read returns pages keyed by their real page number", mixed.ok === true && mixed.pages.every((p) => typeof p.page === "number"),
    mixed.ok ? JSON.stringify(mixed.pages.map((p) => p.page)) : mixed.refusal.words);
  ok("…so a caller can splice them into a document it is already building",
    mixed.ok === true && mixed.pages.length === 2 && mixed.pages[0].page === 1 && mixed.pages[1].page === 2, "");
  ok("…and the markdown it would shape them into is per-page", mixed.ok === true && /## Page 1/.test(mixed.markdown) && /## Page 2/.test(mixed.markdown), "");
}

// ─────────────────────────────────────────────────────────────────────────────
section("9c. a DOCUMENT THAT IS AN IMAGE is read by the same pieces");

{
  const one = await readImageDocument(BLANK_PNG, {
    dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
    ocrEngineFactory: ocrEngine("PHOTOGRAPHED INVOICE\nTotal 1200") as never,
  });
  ok("an image is read", one.ok === true, one.ok ? "" : one.refusal.words);
  ok("…as one page", one.ok === true && one.pages.length === 1 && one.pages[0].page === 1, "");
  ok("…with a heading, like every other read", one.ok === true && one.markdown.startsWith("## Page 1"), one.ok ? one.markdown.slice(0, 40) : "");
  ok("…and a note that says it was an image read on this machine",
    one.ok === true && /document is an image/.test(one.notes.join(" ")) && /on this machine/.test(one.notes.join(" ")), one.ok ? one.notes.join(" | ") : "");
  ok("…and it reports confidence like the PDF path", one.ok === true && /OCR confidence/.test(one.notes.join(" ")), "");
}

// ─────────────────────────────────────────────────────────────────────────────
section("9. determinism — the same scan gives the same read, twice");

const open = async () => readScannedPdf(new Uint8Array([9, 9]), {
  dataPath: DATA, hasLanguageData: hasData, maxChars: 100_000,
  pdfEngineFactory: SCAN as never,
  ocrEngineFactory: ocrEngine("SAME TEXT EVERY TIME") as never,
});
const a = await open(); const b = await open();
ok("identical markdown on repeat", a.ok && b.ok && a.markdown === b.markdown, "");
ok("…and identical notes", a.ok && b.ok && a.notes.join("|") === b.notes.join("|"), "");

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
