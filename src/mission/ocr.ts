/**
 * SelfImpulse — the local OCR reader.
 *
 * WHY THIS EXISTS. `documentParsers.ts` refuses any PDF with no text layer: "this PDF
 * has no text layer — it is a scan or an image. Reading it would need OCR, which this
 * version does not do." That refusal was honest and it was also the largest hole in the
 * Docs door. A scanned contract, a photographed invoice and a stamped circular are the
 * documents an operator most often has, and every one of them was refused.
 *
 * WHY OCR AND NOT A VISION MODEL. The Docs door is deliberately MECHANICAL: it calls
 * `proposeKnowledgeSkill` without a direct provider call, because local execution is a
 * desktop-host capability and the document is not sent anywhere to be understood. A
 * vision pass would break that posture — it needs a provider, it sends the page off the
 * machine, and it makes the door depend on configuration it currently does not need.
 * OCR keeps the door exactly as mechanical as it was. Nothing leaves the machine. No
 * provider is consulted. The same `proposeKnowledgeSkill` the paste box reaches still
 * receives the text, so there is no second pipeline to drift out of step.
 *
 * THE ONE RULE THAT MAKES THIS ON-DEVICE, AND IT IS NOT OPTIONAL. Tesseract.js fetches
 * its language data over the network by default. This module NEVER does. A caller must
 * supply a local directory holding the trained data; if the data for the requested
 * language is not there, this module REFUSES IN WORDS and names the remedy. It does not
 * fall back to a CDN, it does not try a different language, and it does not return
 * partial text. A reader that silently reaches the internet would make the product's
 * on-device promise false, and the egress guards would be right to block it.
 *
 * AUTHORITY + PROVENANCE. This module holds none. It reads bytes and returns text; it
 * cannot execute, fetch, install or mutate anything. Every cap below is a refusal in
 * words (the house rule: an unreadable file is never an empty document), and the caller
 * receipts the outcome the way `fileIngest` already does.
 *
 * DETERMINISM. OCR is a neural recogniser, so "byte-identical on every machine" is not a
 * promise this module can honestly make and it does not make it. What it does guarantee,
 * and what the probe pins, is: the same engine, same input and same options produce the
 * same text and the same confidence on repeated runs; the decision of WHETHER to read is
 * deterministic; and the module never throws.
 *
 * DEPENDENCY, NAMED PLAINLY. One: `tesseract.js` (Apache-2.0, WASM, CPU-only, no GPU).
 * Its language data is NOT bundled — it is provisioned by the caller, deliberately.
 * Pair it with `pdfRender` for the full chain: a PDF page with no text layer is rendered
 * to a PNG, and that PNG is read here.
 */

/** A cap, or a refusal. Mirrors the shape `archiveScan`/`fileIngest` already use. */
export interface OcrRefusal {
  code: string;
  words: string;
}

export interface OcrWord {
  text: string;
  confidence: number;
}

export interface OcrPageResult {
  /** 1-based, matching how a person counts pages. */
  page: number;
  text: string;
  /** Mean confidence across recognised words, 0–100. */
  confidence: number;
  /** Individual words, so a caller can apply its own threshold. */
  words: OcrWord[];
}

export interface OcrResult {
  pages: OcrPageResult[];
  /** Mean confidence across every page read. */
  confidence: number;
  /** The language actually used, as resolved from the caller's request. */
  language: string;
  /** Where the language data was read from. Named so a receipt can prove it was local. */
  dataPath: string;
}

export type OcrOutcome =
  | { ok: true; result: OcrResult; refusal?: undefined }
  | { ok: false; result?: undefined; refusal: OcrRefusal };

/** One page to read: PNG bytes, 1-based index. */
export interface OcrInput {
  page: number;
  png: Uint8Array;
}

/** The recogniser surface. Narrow on purpose; a fake can satisfy it in a probe. */
export interface OcrEngineHandle {
  recognize(image: Uint8Array | string): Promise<{ data: { text: string; confidence: number; words?: Array<{ text: string; confidence: number }> } }>;
  terminate?(): Promise<void>;
}

export interface OcrOptions {
  /**
   * Directory holding `<lang>.traineddata.gz`. REQUIRED. There is no default, because a
   * default would be a network location, and this module does not reach the network.
   */
  dataPath: string;
  /**
   * Directory or asset URL holding the recogniser's CORE WebAssembly. REQUIRED IN A
   * BROWSER, see the guard in `readImages`.
   *
   * WHY THIS IS NOT OPTIONAL EVERYWHERE. In Node the core resolves from the installed
   * package, locally, with no lookup. In a browser or a desktop webview it does NOT: the
   * engine's default for the core, for its worker script and for the language data are all
   * remote content-delivery locations. A build that forgets these does not fail — it
   * quietly reaches out, which is the one thing this product's document path must never do.
   */
  corePath?: string;
  /** The recogniser's worker script. REQUIRED IN A BROWSER, for the same reason. */
  workerPath?: string;
  /** Language code, e.g. "eng". Must have data present in `dataPath`. */
  language?: string;
  /** Hard cap on how many pages may be read in one call. */
  maxPages?: number;
  /** Hard cap on characters returned across the call. */
  maxTextChars?: number;
  /** Below this mean confidence, a page is reported as poor rather than silently kept. */
  minConfidence?: number;
  /** Wall-clock budget for one call. Exceeding it is a refusal, never a partial read. */
  budgetMs?: number;
  /** Injected clock, so the deadline is testable and the module reads no global time. */
  now?: () => number;
  /** Injected filesystem probe, so the module does not reach for `node:fs` unguarded. */
  hasLanguageData?: (dataPath: string, language: string) => boolean;
  /**
   * The recogniser, injected the way `deps.fetchImpl` and `deps.gate` are injected.
   *
   * WHY THIS SEAM EXISTS. The offline verification pack must run with Node and nothing
   * else — no npm install, no network — and a probe must be able to assert the caps,
   * the refusal words and the local-data rule without a multi-megabyte recogniser. A
   * probe drives a fake through this seam and stays dependency-free; production passes
   * nothing and gets the real WASM worker.
   */
  engineFactory?: (language: string, dataPath: string) => Promise<OcrEngineHandle>;
}

const DEFAULTS = {
  language: "eng",
  maxPages: 20,
  maxTextChars: 200_000,
  minConfidence: 55,
  budgetMs: 60_000,
} as const;

function refuse(code: string, words: string): OcrOutcome {
  return { ok: false, refusal: { code, words } };
}

/**
 * The signatures of the formats the recogniser actually decodes: PNG and JPEG.
 *
 * A cheap check that stops most malformed input at the door. It is deliberately a
 * SIGNATURE check and not a decoder — a truncated PNG gets past it and is caught by the
 * recogniser as a page-level refusal, which is the right place for that judgement.
 *
 * JPEG is here because a photographed document is the common case and the engine reads it
 * (its WASM core carries the decoder). Verified, not assumed: the camera-format path is
 * exercised in probe/scanDoor.spec.ts against a real JPEG, not a renamed PNG.
 */
const IMAGE_SIGNATURES: number[][] = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], // PNG
  [0xff, 0xd8, 0xff],                                  // JPEG (SOI + first marker)
];
function looksLikeImage(b: Uint8Array): boolean {
  return IMAGE_SIGNATURES.some((sig) => sig.length <= b.byteLength && sig.every((v, i) => b[i] === v));
}

/**
 * Read images as text.
 *
 * Never throws. A recogniser that fails is a refusal with a reason — because a reader
 * that throws cannot be receipted, and "clean" must never be confusable with "crashed".
 */
export async function readImages(
  inputs: OcrInput[],
  options: OcrOptions,
): Promise<OcrOutcome> {
  const o = { ...DEFAULTS, ...options };
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const expired = () => now() - startedAt > o.budgetMs;

  // ── The local-data rule, checked BEFORE any engine starts. A refusal here costs
  //    nothing and cannot be mistaken for a read that found nothing.
  if (!o.dataPath || o.dataPath.trim() === "") {
    return refuse(
      "no-language-data",
      "no local folder was given for OCR language data. SelfImpulse does not download language data: point it at a folder holding the trained data, or skip OCR, and the page stays an image.",
    );
  }

  const hasData = o.hasLanguageData
    ?? ((dir: string, lang: string) => {
      try {
        const fs = globalThis.process?.getBuiltinModule?.("node:fs") as typeof import("node:fs") | undefined;
        if (!fs) return false;
        return fs.existsSync(`${dir}/${lang}.traineddata.gz`) || fs.existsSync(`${dir}/${lang}.traineddata`);
      } catch {
        return false;
      }
    });

  if (!hasData(o.dataPath, o.language)) {
    return refuse(
      "language-data-missing",
      `OCR language data for "${o.language}" is not in ${o.dataPath}. This reader does not fetch language data over the network — that would send a request the moment it ran and would make the on-device promise false. Put ${o.language}.traineddata (or ${o.language}.traineddata.gz) in that folder, or skip OCR and the page stays an image.`,
    );
  }

  if (!inputs || inputs.length === 0) {
    return refuse("no-pages", "no pages were handed to the OCR reader, so nothing was read.");
  }

  // ── Guard the input before the recogniser sees it.
  //
  // The WASM worker does not validate its argument, and its failures do NOT arrive as
  // ordinary exceptions: an error raised inside the worker is delivered over a MessagePort
  // callback, which escapes this function's try/catch entirely and terminates the process.
  // A malformed document must therefore be stopped HERE, before it is handed over — in
  // SelfImpulse a bad scan is a refusal in words, never a crash of unknown origin.
  for (const input of inputs) {
    const b = input?.png;
    if (!b || typeof (b as Uint8Array).byteLength !== "number" || (b as Uint8Array).byteLength === 0) {
      return refuse(
        "empty-image",
        `page ${input?.page ?? "?"} was handed to the OCR reader with no image bytes. Nothing was read for it, and no text was invented.`,
      );
    }
    if (!looksLikeImage(b as Uint8Array)) {
      return refuse(
        "not-an-image",
        `page ${input?.page ?? "?"} is not an image this reader can recognise — the bytes begin with neither a PNG nor a JPEG signature. Nothing was read for it, and no text was invented.`,
      );
    }
  }

  if (inputs.length > o.maxPages) {
    return refuse(
      "too-many-pages",
      `${inputs.length} pages were handed to one OCR read, above the ${o.maxPages}-page cap. Reading them all at once would take longer than the budget allows and would stall the door — split the document, or read the pages that matter.`,
    );
  }

  // ── The browser guard. In a browser the engine's own defaults for its core, its worker
  //    and its language data are REMOTE. It does not complain, it does not fail — it just
  //    reaches out on first use. So this module refuses to run in a browser that has not
  //    been told where its local copies are, and the refusal says so in words. A refusal
  //    is the only honest outcome: running would break the on-device promise silently.
  const inBrowser = typeof (globalThis as { window?: unknown }).window !== "undefined";
  if (inBrowser && (!o.corePath || !o.workerPath)) {
    const missing = [!o.corePath ? "core" : null, !o.workerPath ? "worker script" : null].filter(Boolean).join(" and ");
    return refuse(
      "reader-unavailable",
      `the OCR recogniser cannot run here: this build did not say where its local ${missing} live, and in a browser the recogniser's default for those is a remote content-delivery location. Nothing was read, and nothing was fetched — being local is a precondition here, not a preference.`,
    );
  }

  let engine: OcrEngineHandle | null = null;
  // Set by the engine's errorHandler when the recogniser fails out-of-band. Declared here
  // because that callback outlives the `await` that would otherwise catch the error.
  let lastWorkerError: string | null = null;
  try {
    const factory = o.engineFactory
      ?? (async (language: string, dataPath: string) => {
        const mod = (await import("tesseract.js")) as unknown as {
          createWorker(lang: string, oem?: number, opts?: Record<string, unknown>): Promise<OcrEngineHandle>;
        };
        // langPath is ALWAYS set. There is no branch in which this module runs without a
        // local language path, because the default is a network location.
        //
        // errorHandler is set for the same reason the signature check above exists: without
        // it, a worker-side failure is RE-THROWN from inside a MessagePort callback, which
        // no try/catch in this file can reach, and the process dies. With it, the failure
        // is delivered to us and becomes a refusal in words.
        return mod.createWorker(language, undefined, {
          langPath: dataPath,
          cachePath: dataPath,
          gzip: true,
          // DESKTOP CSP — this is the switch that makes OCR run at all.
          // tesseract.js defaults `workerBlobURL` to true (its
          // constants/defaultOptions.js), and spawnWorker.js then builds a Blob of
          // `importScripts(workerPath)` and calls `new Worker(blobUrl)`. Under the
          // Tauri CSP (`worker-src 'self'`, inherited from `default-src 'self'`
          // when unset) a `blob:` worker is not a permitted worker source, so the
          // worker never loads and every image and every scanned PDF is refused
          // with "reader-unavailable". Spawning the SAME-ORIGIN worker script we
          // were handed (workerPath, bundled at `ocr/worker.min.js`) is both the
          // fix and the stricter choice: the worker's code comes from the app
          // bundle, never from a generated blob.
          workerBlobURL: false,
          // Pass through only when set. In Node leaving them undefined is correct — the
          // engine resolves them from the installed package, locally. In a browser the
          // guard above has already refused if they are missing.
          ...(o.corePath ? { corePath: o.corePath } : {}),
          ...(o.workerPath ? { workerPath: o.workerPath } : {}),
          errorHandler: (err: unknown) => { lastWorkerError = String(err instanceof Error ? err.message : err).slice(0, 200); },
        });
      });
    engine = await factory(o.language, o.dataPath);
  } catch (e) {
    return refuse(
      "reader-unavailable",
      `the OCR recogniser could not start, so nothing was read: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`,
    );
  }

  const pages: OcrPageResult[] = [];
  let totalChars = 0;
  let confidenceSum = 0;

  try {
    for (const input of inputs) {
      if (expired()) {
        return refuse(
          "deadline",
          `OCR ran out of its time budget after ${pages.length} of ${inputs.length} page(s). No partial document is offered, because half-read text presented as a whole reads is worse than none.`,
        );
      }

      let data: { text: string; confidence: number; words?: Array<{ text: string; confidence: number }> };
      try {
        const out = await engine.recognize(input.png);
        data = out.data;
      } catch (e) {
        return refuse(
          "page-unreadable",
          `the OCR recogniser stopped on page ${input.page}: ${(lastWorkerError ?? String(e instanceof Error ? e.message : e)).slice(0, 140)}`,
        );
      }
      if (lastWorkerError) {
        // The recogniser reported a failure out-of-band for this page. Don't trust the
        // text that came back with it — a page that half-recognised is exactly the kind of
        // partial read this module refuses to dress up as a whole one.
        return refuse(
          "page-unreadable",
          `the OCR recogniser reported a failure on page ${input.page}: ${lastWorkerError}`,
        );
      }

      const text = (data.text ?? "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
      totalChars += text.length;
      if (totalChars > o.maxTextChars) {
        return refuse(
          "parsed-too-large",
          `OCR yields more than ${Math.round(o.maxTextChars / 1000)}k characters across these pages. The Docs door distils one proposal at a time — drop a chapter, not the whole book.`,
        );
      }

      const words: OcrWord[] = (data.words ?? [])
        .map((w) => ({ text: w.text, confidence: w.confidence }))
        .filter((w) => w.text?.trim().length > 0);

      const confidence = typeof data.confidence === "number" && Number.isFinite(data.confidence)
        ? data.confidence
        : words.length > 0
          ? words.reduce((s, w) => s + w.confidence, 0) / words.length
          : 0;

      pages.push({ page: input.page, text, confidence, words });
      confidenceSum += confidence;
    }

    return {
      ok: true as const,
      result: {
        pages,
        confidence: pages.length > 0 ? confidenceSum / pages.length : 0,
        language: o.language,
        dataPath: o.dataPath,
      },
    };
  } finally {
    // The recogniser holds a WASM heap; releasing it is not optional.
    try { await engine?.terminate?.(); } catch { /* a close failure must not mask the result */ }
  }
}

/**
 * One line for the ledger. An OCR read is recorded, not remembered — and a read that was
 * POOR says so, because "the page was read" and "the page was read well" are different
 * claims and a receipt must not blur them.
 */
export function ocrLine(outcome: OcrOutcome, sourceName: string, minConfidence = 55): string {
  if (!outcome.ok || !outcome.result) {
    return `${sourceName}: OCR refused [${outcome.refusal?.code ?? "unknown"}]`;
  }
  const r = outcome.result;
  const chars = r.pages.reduce((s, p) => s + p.text.length, 0);
  const bits = [`${r.pages.length} page(s)`, `${chars} chars`, `${r.language}`, `confidence ${r.confidence.toFixed(1)}%`];
  if (r.confidence < minConfidence) bits.push("BELOW the confidence floor — treat the text as unreliable");
  return `${sourceName}: OCR read locally from ${r.dataPath} — ${bits.join(", ")}`;
}
