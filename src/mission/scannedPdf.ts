/**
 * SelfImpulse §13 — the SCANNED-DOCUMENT reader: a page with no text layer, read on this
 * machine.
 *
 * WHY THIS EXISTS. `documentParsers.parsePdf` reads a PDF's text layer and, finding none,
 * used to refuse with "this PDF has no text layer — it is a scan or an image". That refusal
 * was honest but it was also a dead end: a scanned invoice, a photographed contract or a
 * deck exported as images could not enter the Docs door at all. This module closes that
 * dead end without opening a new one, by composing two narrow pieces that are already
 * proven separately:
 *
 *   `pdfRender.readPdf`  — rasterises the pages that carry no text (pdf.js is the reader
 *                          for text and stays the reader for text; it cannot rasterise in
 *                          Node without a native canvas, which is why a second, pure-WASM
 *                          renderer does this one job).
 *   `ocr.readImages`     — recognises those page images locally.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not call a vision model, it does not call a
 * provider, and it does not fetch language data. The Docs door is mechanical: bytes in,
 * markdown out, and the SAME `proposeKnowledgeSkill` a pasted note walks decides the rest.
 *
 * WHY THE OUTPUT IS MARKDOWN WITH HEADINGS. `proposeKnowledgeSkill` refuses anything with no
 * extractable structure (guardline G2), and a scan yields flat prose — so a reader that
 * returned the recognised text as-is would hand the Docs door a document that walks through
 * the door and is then refused by the next gate, for a reason that has nothing to do with
 * the document. A scan has exactly one structural fact available and it is a true one: which
 * page each line came from. So every page becomes a `##` heading. That is enough for
 * `extractStructure` to read, and it is not invented — the heading states a fact about the
 * file, not a guess about its content.
 *
 * ── THE PREFLIGHT, AND THE BUG THAT TAUGHT IT ────────────────────────────────
 *
 * This module checks that the reader's language data is present BEFORE it starts, so a
 * missing file is a clear refusal rather than an engine-internal error twenty pages in. That
 * check used to ask `node:fs`. In a browser there is no `node:fs`, so it answered "absent"
 * for data that was in fact sitting in the build output — every scanned PDF refused with
 * "OCR unavailable", on the one platform where the feature was meant to be the default. The
 * check was correct about the world it could see and wrong about the world it was in.
 *
 * So the check now asks whichever question fits the runtime it is actually running in:
 * a filesystem where there is one, and the ASSET URL where there is not. A same-origin
 * request to the app's own bundle is not egress — it never leaves the machine — and it is
 * the only honest way to ask "is the bundled asset there" from inside a webview. When the
 * answer cannot be determined at all, the read PROCEEDS rather than refusing: inventing a
 * failure because a precondition could not be verified would be the same bug wearing the
 * opposite coat.
 *
 * EGRESS: none. The language data is required to be present on this machine, a missing file
 * is a refusal in words, and the only request this module can make is to its own origin.
 */
import type { Refusal } from "./archiveScan";
import { refuse } from "./archiveScan";
import { readPdf, readLine } from "./pdfRender";
import type { ReadPdfOutcome } from "./pdfRender";
import { readImages, ocrLine } from "./ocr";
import type { OcrOutcome, OcrRefusal } from "./ocr";
import { ocrDataPath, ocrLanguage, ocrCorePath, ocrWorkerPath } from "./ocrData";

/** The markdown a scan produced, or a refusal in words. Structurally a `ParseResult`. */
export type ScanReadResult =
  | {
      ok: true;
      markdown: string;
      notes: string[];
      /** Per-page results, so a caller reading a MIXED document can splice by page number. */
      pages: Array<{ page: number; text: string; confidence: number }>;
    }
  | { ok: false; refusal: Refusal };

/** The minimum a filesystem probe has to offer. `null` means "there is no filesystem here". */
export interface FsProbe {
  existsSync(p: string): boolean;
}
/** The minimum a fetch probe has to offer. */
export type FetchProbe = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
}>;

export interface ScanReadOptions {
  /**
   * Directory holding `<lang>.traineddata.gz`. Omit to use the boot-configured seam
   * (`configureOcrData`); null means explicitly unconfigured, which refuses.
   */
  dataPath?: string | null;
  /** Language code. Default "eng". */
  language?: string;
  /** Dots per inch used to rasterise. Too low loses small type; 200 is the proven floor. */
  dpi?: number;
  /** Cap on pages rasterised and recognised in one read. */
  capPages?: number;
  /** Cap on characters handed to the door. */
  maxChars: number;
  /** Wall-clock deadline for the whole read, as an absolute ms timestamp. */
  deadlineAt?: number;
  /** Injected clock; the module reads no global time. */
  now?: () => number;
  /** Below this confidence a page is reported as poor, not quietly kept. */
  minConfidence?: number;
  /** Injected engines, so both halves stay testable without WASM or a recogniser. */
  pdfEngineFactory?: Parameters<typeof readPdf>[1] extends { engineFactory?: infer F } ? F : never;
  ocrEngineFactory?: Parameters<typeof readImages>[1] extends { engineFactory?: infer F } ? F : never;
  /**
   * Injected presence check. Takes precedence over everything else, which is how the
   * probes pin the refusals without a filesystem, a download or a recogniser.
   */
  hasLanguageData?: (dataPath: string, language: string) => boolean;
  /**
   * Injected filesystem probe. Omit to use the real one where there is one; `null` asserts
   * "no filesystem here" (a webview), which sends the check down the asset-URL branch.
   */
  fsImpl?: FsProbe | null;
  /** Injected fetch, for the asset-URL branch. */
  fetchImpl?: FetchProbe;
  /** Local core Wasm and worker script. Required by the browser build; see `ocr.ts`. */
  corePath?: string;
  workerPath?: string;
}

/**
 * The one place the tree is allowed to look for language data, in the order it should.
 *
 * NOT a network fallback — there is no network fallback anywhere in this path. If none of
 * these exist the read refuses, in words, and says where it looked, so the fix is obvious
 * and the failure is never silent.
 */
export function resolveOcrDataPath(candidates: Array<string | null | undefined>): string | null {
  for (const c of candidates) if (c && c.length > 0) return c;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The preflight — "is the reader actually here?", asked in the runtime's own terms.

/**
 * The real filesystem, if this runtime has one. Reached through `process.getBuiltinModule`
 * rather than a static `node:fs` import so this module still loads in a webview, where the
 * bundler would otherwise rewrite or reject the import.
 */
function ambientFs(): FsProbe | null {
  try {
    const g = globalThis as { process?: { getBuiltinModule?: (n: string) => unknown } };
    const fs = g.process?.getBuiltinModule?.("node:fs") as { existsSync?: (p: string) => boolean } | undefined;
    if (typeof fs?.existsSync !== "function") return null;
    return { existsSync: (p: string) => fs.existsSync!(p) };
  } catch {
    return null;
  }
}

/** Join a base path/URL and a file, tolerating a trailing separator. */
function joinAsset(base: string, file: string): string {
  return `${base.replace(/[\\/]+$/, "")}/${file}`;
}

/**
 * Ask the app's OWN ORIGIN whether a bundled asset is there.
 *
 * HEAD first because the language pack is 10 MB and confirming its existence must not cost
 * a download. A server that will not answer HEAD gets a one-byte ranged GET instead, which
 * is the cheapest question it will accept.
 *
 * The three answers are deliberately distinct. "missing" is a real, actionable fact and
 * becomes a refusal naming the exact URL. "unknown" is the absence of information, and the
 * caller must not turn it into a refusal — see `ensureLocalAssets`.
 */
async function assetState(url: string, fetchImpl: FetchProbe | null): Promise<"present" | "missing" | "unknown"> {
  if (!fetchImpl) return "unknown";
  try {
    const head = await fetchImpl(url, { method: "HEAD" });
    if (head.status >= 200 && head.status < 400) return "present";
    // 4xx says the URL is wrong or the file is absent. 5xx says the server is unwell, which
    // is not evidence about the asset.
    if (head.status >= 400 && head.status < 500) return "missing";
    if (head.status !== 405 && head.status !== 501) return "unknown";
  } catch {
    return "unknown";
  }
  try {
    const ranged = await fetchImpl(url, { method: "GET", headers: { Range: "bytes=0-0" } });
    if (ranged.status >= 200 && ranged.status < 400) return "present";
    return ranged.status >= 400 && ranged.status < 500 ? "missing" : "unknown";
  } catch {
    return "unknown";
  }
}

export type AssetCheck =
  | { ok: true; how: "filesystem" | "asset-url" | "unverifiable"; words: string }
  | { ok: false; code: "ocr-unavailable"; words: string };

/**
 * THE PREFLIGHT. Decides whether this machine can read an image, and says so in words.
 *
 * Order, and why:
 *   1. an injected answer, because a probe must be able to pin both outcomes;
 *   2. the filesystem, where there is one — the strongest evidence available;
 *   3. the app's own asset URL, where there is not;
 *   4. proceed, if neither question can be answered. See the header: refusing because a
 *      precondition could not be *verified* would recreate the original bug in reverse.
 */
export async function ensureLocalAssets(options: ScanReadOptions, deps?: { fetchImpl?: FetchProbe | null }): Promise<AssetCheck> {
  const language = options.language ?? ocrLanguage();
  const dataPath = options.dataPath === undefined ? ocrDataPath() : options.dataPath;

  if (!dataPath) {
    return {
      ok: false,
      code: "ocr-unavailable",
      words:
        "this document has no text layer, so it would have to be read as an image — and this build has no OCR language data configured. Nothing was read, and nothing was fetched: the language data must be present on this machine. Add it, then drop the file again.",
    };
  }

  if (options.hasLanguageData) {
    if (options.hasLanguageData(dataPath, language)) {
      return { ok: true, how: "filesystem", words: `local language data at ${dataPath}` };
    }
    return {
      ok: false,
      code: "ocr-unavailable",
      words: `this document has no text layer, so it would have to be read as an image — and there is no "${language}" language data in ${dataPath}. Nothing was read, and nothing was fetched over the network. Add the language data there, then drop the file again.`,
    };
  }

  const fs = options.fsImpl === undefined ? ambientFs() : options.fsImpl;
  if (fs) {
    const base = joinAsset(dataPath, `${language}.traineddata`);
    if (fs.existsSync(base) || fs.existsSync(`${base}.gz`)) {
      return { ok: true, how: "filesystem", words: `local language data at ${dataPath}` };
    }
    return {
      ok: false,
      code: "ocr-unavailable",
      words: `this document has no text layer, so it would have to be read as an image — and there is no "${language}" language data in ${dataPath}. Nothing was read, and nothing was fetched over the network. Add the language data there, then drop the file again.`,
    };
  }

  // ── A browser or a desktop webview. There is no filesystem to ask, and asking for one
  //    was the bug this branch exists to fix. The assets are bundled at the app's own
  //    origin, so that origin is asked instead.
  const fetchImpl = deps?.fetchImpl === undefined ? (options.fetchImpl ?? ambientFetch()) : deps.fetchImpl;
  const wanted: Array<{ label: string; url: string }> = [
    { label: "language data", url: joinAsset(dataPath, `${language}.traineddata.gz`) },
  ];
  const core = options.corePath ?? ocrCorePath();
  const worker = options.workerPath ?? ocrWorkerPath();
  if (core) wanted.push({ label: "recogniser core", url: joinAsset(core, "tesseract-core-simd-lstm.wasm.js") });
  if (worker) wanted.push({ label: "recogniser worker", url: worker });

  let answered = 0;
  for (const item of wanted) {
    const state = await assetState(item.url, fetchImpl ?? null);
    if (state === "unknown") continue;
    answered += 1;
    if (state === "missing") {
      return {
        ok: false,
        code: "ocr-unavailable",
        words: `this document has no text layer, so it would have to be read as an image — and this build's ${item.label} was not found at ${item.url}. Nothing was read, and nothing was fetched from anywhere outside this app. Check that the build shipped its OCR assets, then drop the file again.`,
      };
    }
  }

  if (answered === 0) {
    return {
      ok: true,
      how: "unverifiable",
      words: `local language data at ${dataPath} (could not be checked from here)`,
    };
  }
  return { ok: true, how: "asset-url", words: `local language data at ${dataPath}` };
}

function ambientFetch(): FetchProbe | null {
  const f = (globalThis as { fetch?: unknown }).fetch;
  return typeof f === "function" ? (f as FetchProbe).bind(globalThis) : null;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The recogniser's refusal codes are richer than the door's. Translate rather than flatten:
 * each of the door's codes tells the OWNER to do something different, and mapping every
 * failure to one code would send a person whose document is merely too big off to install
 * language data they already have. The mapping below is by what the owner must DO.
 */
function translateOcrRefusal(refusal: OcrRefusal): Refusal {
  switch (refusal.code) {
    // Already the door's own vocabulary — pass through untouched.
    case "deadline":
    case "parsed-too-large":
      return { code: refusal.code, words: refusal.words };
    // The owner's action is "give this build a reader": missing language data, or a
    // recogniser that would not start at all.
    case "language-data-missing":
    case "reader-unavailable":
      return { code: "ocr-unavailable", words: refusal.words };
    // The DOCUMENT is the problem, not the build: bytes that are not an image, a page the
    // recogniser stopped on. The door already has a word for "this file is not readable".
    case "empty-image":
    case "not-an-image":
    case "page-unreadable":
      return { code: "unrecognised-binary", words: refusal.words };
    // Nothing to read at all. Distinct from a failure: there was no document here.
    case "no-pages":
      return { code: "empty-document", words: refusal.words };
    default:
      return { code: "ocr-unavailable", words: refusal.words };
  }
}

/**
 * Recognised pages → markdown with a heading per page, plus the notes that tell the human
 * deciding where this text came from and how well it was read.
 *
 * Shared by the scanned-PDF path and the direct-image path DELIBERATELY: if a photographed
 * invoice and a scanned invoice reached `proposeKnowledgeSkill` in two different shapes,
 * one of them would eventually be the one that behaves. There is one shaper.
 */
export function pagesToMarkdown(
  pages: Array<{ page: number; text: string; confidence: number }>,
  opts: { language: string; dpi?: number; sourceNote: string; minConfidence?: number },
): { markdown: string; notes: string[] } {
  const lines: string[] = [];
  for (const page of pages) {
    lines.push(`## Page ${page.page}`);
    for (const raw of page.text.split("\n")) {
      const line = raw.replace(/\s+/g, " ").trim().slice(0, 400);
      if (line.length > 0) lines.push(line);
    }
  }
  const markdown = lines.join("\n").trim();

  const notes: string[] = [];
  const floor = opts.minConfidence ?? 55;
  const mean = pages.length > 0 ? pages.reduce((s, p) => s + p.confidence, 0) / pages.length : 0;
  notes.push(opts.sourceNote);
  notes.push(`OCR confidence ${mean.toFixed(1)}%.`);
  if (mean < floor) {
    notes.push(`That is below the ${floor}% floor this door treats as reliable — the text is offered with that caveat, and the source it came from is worth a look.`);
  }
  for (const page of pages) {
    if (page.confidence < floor) notes.push(`Page ${page.page} was read at ${page.confidence.toFixed(1)}% — treat its text as approximate.`);
  }
  return { markdown, notes };
}

/**
 * Read a PDF's pages that carry no text layer, and ONLY those pages.
 *
 * `readPdf` is asked to render scanned pages with its default `minTextChars`, so it renders
 * exactly the pages whose text is absent or negligible — no page with a real text layer is
 * ever turned into pixels and re-recognised. That is what makes this call usable for a MIXED
 * document (a typed cover sheet over a scanned body): the caller gets back the pages that
 * needed reading, keyed by page number, and splices them into the document it is already
 * building.
 *
 * (An earlier version forced EVERY page down the render path with `minTextChars:
 * MAX_SAFE_INTEGER`. That was a workaround for this function only ever being called on a
 * document with no text at all — but it meant a mixed document could never be handled, only
 * mis-handled, and the workaround hid that. The default is correct for both cases.)
 */
export async function readScannedPdf(bytes: Uint8Array, options: ScanReadOptions): Promise<ScanReadResult> {
  const now = options.now ?? (() => Date.now());
  const language = options.language ?? ocrLanguage();
  const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY;
  const dpi = options.dpi ?? 200;

  const assets = await ensureLocalAssets(options);
  if (!assets.ok) return refuse(assets.code, assets.words);

  const rendered: ReadPdfOutcome = await readPdf(bytes, {
    renderScannedPages: true,
    dpi,
    now,
    engineFactory: options.pdfEngineFactory,
  });
  if (!rendered.ok) {
    return refuse(
      rendered.refusal.code === "deadline" ? "deadline" : "unrecognised-binary",
      `this PDF has no text layer, so it was taken to be read as images — and the rasteriser refused: ${rendered.refusal.words}`,
    );
  }

  const images = (rendered.result?.pages ?? [])
    .filter((p) => typeof p.png !== "undefined" && p.png !== null)
    .map((p) => ({ page: p.page, png: p.png as Uint8Array }));
  if (images.length === 0) {
    return refuse(
      "empty-document",
      "this PDF has no text layer and no page that could be rasterised, so there is nothing to read. Nothing was invented to fill it in.",
    );
  }

  const read: OcrOutcome = await readImages(images, {
    dataPath: options.dataPath === undefined ? (ocrDataPath() as string) : (options.dataPath as string),
    language,
    maxPages: options.capPages,
    maxTextChars: options.maxChars,
    minConfidence: options.minConfidence,
    budgetMs: Number.isFinite(deadlineAt) ? Math.max(1_000, deadlineAt - now()) : undefined,
    now,
    hasLanguageData: () => true, // already established above, by the fitting test
    corePath: options.corePath ?? ocrCorePath(),
    workerPath: options.workerPath ?? ocrWorkerPath(),
    engineFactory: options.ocrEngineFactory,
  });
  if (!read.ok) {
    const translated = translateOcrRefusal(read.refusal);
    return refuse(
      translated.code,
      `this PDF has no text layer, so it was read as images — and the reader refused: ${read.refusal.words}`,
    );
  }

  const pages = (read.result?.pages ?? []).map((p) => ({ page: p.page, text: p.text, confidence: p.confidence }));
  const bodyChars = pages.reduce((n, p) => n + p.text.length, 0);
  if (bodyChars === 0) {
    return refuse(
      "empty-document",
      `${pages.length} page(s) were rasterised at ${dpi} dpi and read on this machine, and no text was found in any of them. Nothing was invented to fill the gap: an image-only document is refused rather than approved as an empty one.`,
    );
  }

  const shaped = pagesToMarkdown(pages, {
    language,
    dpi,
    minConfidence: options.minConfidence,
    sourceNote: `${pages.length} page${pages.length === 1 ? "" : "s"} had no text layer and were read as images on this machine (${language}, ${dpi} dpi).`,
  });
  if (shaped.markdown.length > options.maxChars) {
    return refuse(
      "parsed-too-large",
      `reading this scan on this machine yields more than ${Math.round(options.maxChars / 1000)}k characters of text, above the ${Math.round(options.maxChars / 1000)}k one proposal can hold. Drop the chapters that matter, not the whole book.`,
    );
  }

  return { ok: true, markdown: shaped.markdown, notes: shaped.notes, pages };
}

/**
 * Read a DOCUMENT THAT IS AN IMAGE — a screenshot, a phone photograph of an invoice, a page
 * exported as a PNG. One page, because an image is one page.
 *
 * This exists because the module already had everything needed to read one. A user who
 * photographs an invoice and drops the JPEG has asked exactly the question a scanned PDF
 * asks, and answering it in a second pipeline is how two shapes of the same answer start to
 * drift. So the image goes to `readImages` through the same preflight, the same caps, the
 * same refusals and the same markdown shaper as a rasterised PDF page.
 */
export async function readImageDocument(bytes: Uint8Array, options: ScanReadOptions): Promise<ScanReadResult> {
  const assets = await ensureLocalAssets(options);
  if (!assets.ok) return refuse(assets.code, assets.words);

  const language = options.language ?? ocrLanguage();
  const now = options.now ?? (() => Date.now());
  const deadlineAt = options.deadlineAt ?? Number.POSITIVE_INFINITY;

  const read: OcrOutcome = await readImages([{ page: 1, png: bytes }], {
    dataPath: options.dataPath === undefined ? (ocrDataPath() as string) : (options.dataPath as string),
    language,
    maxTextChars: options.maxChars,
    minConfidence: options.minConfidence,
    budgetMs: Number.isFinite(deadlineAt) ? Math.max(1_000, deadlineAt - now()) : undefined,
    now,
    hasLanguageData: () => true,
    corePath: options.corePath ?? ocrCorePath(),
    workerPath: options.workerPath ?? ocrWorkerPath(),
    engineFactory: options.ocrEngineFactory,
  });
  if (!read.ok) {
    const translated = translateOcrRefusal(read.refusal);
    return refuse(translated.code, `this image could not be read on this machine: ${read.refusal.words}`);
  }

  const first = read.result?.pages[0];
  const text = first?.text ?? "";
  if (text.trim().length === 0) {
    return refuse(
      "empty-document",
      "this image was read on this machine and no text was found in it. Nothing was invented to fill the gap: a picture with no words in it is refused rather than approved as an empty document.",
    );
  }

  const pages = [{ page: 1, text, confidence: first?.confidence ?? 0 }];
  const shaped = pagesToMarkdown(pages, {
    language,
    minConfidence: options.minConfidence,
    sourceNote: `this document is an image; its text was read on this machine (${language}).`,
  });
  if (shaped.markdown.length > options.maxChars) {
    return refuse(
      "parsed-too-large",
      `reading this image on this machine yields more than ${Math.round(options.maxChars / 1000)}k characters of text, above the ${Math.round(options.maxChars / 1000)}k one proposal can hold. Crop it to the part that matters.`,
    );
  }
  return { ok: true, markdown: shaped.markdown, notes: shaped.notes, pages };
}

/** The ledger line for a scan read, so a receipt can show what was read and how well. */
export function scanLine(pdf: ReadPdfOutcome, ocr: OcrOutcome, sourceName: string): string {
  return `${readLine(pdf, sourceName)} ${ocrLine(ocr, sourceName)}`;
}
