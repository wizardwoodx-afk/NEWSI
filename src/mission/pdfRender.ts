/**
 * SelfImpulse — the PDF page reader that can see.
 *
 * WHY THIS EXISTS. `documentParsers.ts` refuses any PDF with no text layer, in these
 * words: "this PDF has no text layer — it is a scan or an image. Reading it would need
 * OCR, which this version does not do." That refusal is honest, and it is also the
 * single largest hole in the Docs door: a scanned contract, a photographed invoice and
 * a stamped circular are the documents a real operator most often has, and every one of
 * them was refused.
 *
 * WHAT CHANGED. The engine underneath the text reader already rasterises pages — it has
 * to, to draw them. That capability was simply not exposed. This module exposes it: a
 * page that carries no text can now be RENDERED, and a rendered page is an image, and an
 * image is something the engine can already hand to a vision-capable provider or to a
 * local OCR step. Nothing new is inferred; a door that was closed is opened.
 *
 * THE DIVISION IS DELIBERATE, AND IT IS THE SAME ONE THE DOCS DOOR ALREADY KEEPS.
 *   • This module READS and RENDERS. It does not call a model, and it does not decide.
 *   • What happens to a rendered image — vision pass, OCR, or a refusal in words — is
 *     the caller's decision, made at the gate, where every other decision is made.
 *   • A page that renders but yields no text is NOT a failure here. It is a page with an
 *     image and no text, reported as exactly that. The judgement belongs downstream.
 *
 * AUTHORITY + PROVENANCE. This module holds none. It cannot execute, fetch, install or
 * mutating anything. It takes bytes and returns bytes. Every cap below is a refusal in
 * words (the house rule: an unreadable file is never an empty document), and the caller
 * receipts the outcome the same way `fileIngest` already does.
 *
 * DETERMINISM. Same bytes, same options, same result — pages are read in order, nothing
 * consults the clock for its answer (the deadline only ever produces a refusal), and no
 * randomness or network is involved. The probe pins byte-identical repeat runs, because
 * a reader whose output drifts cannot be hashed into a receipt.
 *
 * DEPENDENCY, NAMED PLAINLY. One: `clawpdf` (MIT, zero transitive dependencies, PDFium
 * as WASM — the same engine Chrome renders PDFs with). It downloads nothing at runtime
 * and phones home to nothing. Its licence notice belongs in LICENSES/ beside the pdfjs,
 * mammoth and jszip notices already there.
 */

/** A cap, or a refusal. Mirrors the shape `archiveScan`/`fileIngest` already use. */
export interface RenderRefusal {
  code: string;
  words: string;
}

export interface RenderedPage {
  /** 1-based, matching how a person counts pages. */
  page: number;
  /** Text the page carries, or "" when it carries none. */
  text: string;
  /** True when this page yielded no usable text layer. */
  looksScanned: boolean;
  widthPt: number;
  heightPt: number;
  /** Present only when the page was rendered. */
  png?: Uint8Array;
  pngWidth?: number;
  pngHeight?: number;
}

export interface ReadPdfResult {
  pageCount: number;
  pages: RenderedPage[];
  /** Pages that carried no text and were rendered instead. */
  scannedPages: number[];
  /** Pages that carried no text and could NOT be rendered (cap hit, render error). */
  unreadablePages: number[];
  /** True when at least one page was rendered — i.e. the image path was actually used. */
  usedRender: boolean;
}

export type ReadPdfOutcome =
  | { ok: true; result: ReadPdfResult; refusal?: undefined }
  | { ok: false; result?: undefined; refusal: RenderRefusal };

/** The engine surfaces we depend on, named so the import stays honest and typed.
 *  Exported because a probe drives a fake through `engineFactory`. */
export interface PdfPageHandle {
  text(): string | null;
  width: number;
  height: number;
  png?(opts?: { dpi?: number }): Promise<Uint8Array>;
}
export interface PdfDocumentHandle {
  pageCount: number;
  page(n: number): Promise<PdfPageHandle>;
  close?(): Promise<void>;
}
export interface PdfEngineHandle {
  open(b: Uint8Array): Promise<PdfDocumentHandle>;
  close?(): Promise<void>;
}

export interface ReadPdfOptions {
  /** Render pages that carry no text. Off by default: a caller that only wants text
   *  should not pay for pixels, and a caller that wants images must say so. */
  renderScannedPages?: boolean;
  /** Render DPI for image pages. 96 is screen-legible; 150 is OCR-legible. */
  dpi?: number;
  /** Hard cap on pixels per rendered page, so one enormous page cannot exhaust memory. */
  maxPixelsPerPage?: number;
  /** Hard cap on how many pages may be rendered in one call. */
  maxRenderedPages?: number;
  /** Hard cap on total rendered image bytes across the call. */
  maxTotalImageBytes?: number;
  /** Minimum characters for a page to count as carrying text. */
  minTextChars?: number;
  /** Hard cap on characters returned across the call. */
  maxTextChars?: number;
  /** Wall-clock budget for one call. Exceeding it is a refusal, never a partial read. */
  budgetMs?: number;
  /** Injected clock, so the deadline is testable and the module reads no global time. */
  now?: () => number;
  /**
   * The PDF engine, injected the way `deps.fetchImpl` and `deps.gate` are injected.
   *
   * WHY THIS SEAM EXISTS, precisely. The offline verification pack must run with Node
   * and nothing else — no npm install, no network — and it is that property that makes
   * the pack reproducible by a stranger. The real engine carries a 5 MB PDFium WASM
   * binary, which no self-contained bundle can carry without doubling the shipped pack.
   *
   * So the engine is a seam. A probe drives a fake through it and stays dependency-free;
   * production passes nothing and gets the real WASM engine. The behaviour under test is
   * THIS module's — the caps, the refusal words, the scanned-page decision, the
   * deadline — and none of that lives in the engine.
   */
  engineFactory?: () => Promise<PdfEngineHandle>;
}

const DEFAULTS = {
  renderScannedPages: false,
  dpi: 96,
  MAX_RENDER_DIMENSION: 10_000,
  maxPixelsPerPage: 4_000_000,
  maxRenderedPages: 20,
  maxTotalImageBytes: 32 * 1024 * 1024,
  minTextChars: 24,
  maxTextChars: 200_000,
  budgetMs: 20_000,
} as const;

function refuse(code: string, words: string): ReadPdfOutcome {
  return { ok: false, refusal: { code, words } };
}

/**
 * Read a PDF: text where there is text, pixels where there is none.
 *
 * Never throws. The engine failing is a refusal with a reason, exactly as the existing
 * PDF path already behaves — because a reader that throws cannot be receipted.
 */
export async function readPdf(
  bytes: Uint8Array,
  options: ReadPdfOptions = {},
): Promise<ReadPdfOutcome> {
  const o = { ...DEFAULTS, ...options };
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const expired = () => now() - startedAt > o.budgetMs;

  if (!bytes || bytes.byteLength === 0) {
    return refuse("empty-file", "this file is empty, so there is nothing in it to read.");
  }

  let engine: PdfEngineHandle | null = null;
  let doc: PdfDocumentHandle | null = null;

  try {
    // The real engine is imported lazily, so a build that never reads a PDF never pays
    // for the WASM heap — and so a probe that injects a fake never loads one at all.
    const factory = o.engineFactory ?? (async () => {
      const mod = (await import("clawpdf")) as unknown as { createEngine(): Promise<PdfEngineHandle> };
      return mod.createEngine();
    });
    engine = await factory();
    doc = await engine.open(bytes);
  } catch (e) {
    return refuse(
      "reader-unavailable",
      `the PDF engine could not start, so nothing was read: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`,
    );
  }

  const openDoc = doc;

  const pages: RenderedPage[] = [];
  const scannedPages: number[] = [];
  const unreadablePages: number[] = [];
  let totalImageBytes = 0;
  let totalTextChars = 0;
  let usedRender = false;

  try {
    const pageCount = openDoc.pageCount;

    for (let n = 1; n <= pageCount; n++) {
      if (expired()) {
        return refuse(
          "deadline",
          `reading this PDF ran out of its time budget at page ${n} of ${pageCount}. No partial document is offered, because a half-read contract is worse than none.`,
        );
      }

      const page = await openDoc.page(n) as unknown as {
        text(): string | null;
        width: number;
        height: number;
        png?(opts?: { dpi?: number }): Promise<Uint8Array>;
      };

      const rawText = (page.text() ?? "").replace(/\r\n/g, "\n").trim();
      const hasText = rawText.length >= o.minTextChars;

      totalTextChars += rawText.length;
      if (totalTextChars > o.maxTextChars) {
        return refuse(
          "parsed-too-large",
          `this PDF yields more than ${Math.round(o.maxTextChars / 1000)}k characters of text. The Docs door distils one proposal at a time — drop a chapter, not the whole book.`,
        );
      }

      const entry: RenderedPage = {
        page: n,
        text: rawText,
        looksScanned: !hasText,
        widthPt: page.width,
        heightPt: page.height,
      };

      // ── The image path. Taken only when the caller asked for it AND the page has no
      //    text. A page with text is not rendered: the text is cheaper and lossless, and
      //    rendering it too would be the second pipeline this product does not keep.
      if (!hasText && o.renderScannedPages && typeof page.png === "function") {
        if (scannedPages.length >= o.maxRenderedPages) {
          unreadablePages.push(n);
        } else {
          // Bound the pixels before we pay for them. The engine renders at a DPI, so the
          // projected size is known from the page box and the requested scale.
          const scale = o.dpi / 72;
          const projected = Math.ceil(page.width * scale) * Math.ceil(page.height * scale);
          if (projected > o.maxPixelsPerPage) {
            unreadablePages.push(n);
          } else {
            try {
              const png = await page.png({ dpi: o.dpi });
              if (png && png.byteLength > 0) {
                totalImageBytes += png.byteLength;
                if (totalImageBytes > o.maxTotalImageBytes) {
                  return refuse(
                    "parsed-too-large",
                    `the rendered pages of this PDF exceed ${Math.round(o.maxTotalImageBytes / 1024 / 1024)} MB of images. Render fewer pages, at a lower DPI, or drop the file to the pages that matter.`,
                  );
                }
                entry.png = png;
                entry.pngWidth = Math.ceil(page.width * scale);
                entry.pngHeight = Math.ceil(page.height * scale);
                usedRender = true;
              } else {
                unreadablePages.push(n);
              }
            } catch {
              // A page that will not rasterise is reported as unreadable, not as empty.
              unreadablePages.push(n);
            }
          }
        }
      } else if (!hasText) {
        unreadablePages.push(n);
      }

      if (entry.looksScanned) scannedPages.push(n);
      pages.push(entry);
    }

    return {
      ok: true as const,
      result: {
        pageCount,
        pages,
        scannedPages,
        unreadablePages,
        usedRender,
      },
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (/encrypt|password/i.test(msg)) {
      return refuse(
        "encrypted",
        "this PDF is password-protected. SelfImpulse does not try an empty password and pass it off as a read, and it does not crack one: it refuses, in words. Open it, save the plaintext, and drop that.",
      );
    }
    return refuse("unrecognised-binary", `the PDF reader stopped: ${msg.slice(0, 140)}`);
  } finally {
    try { await openDoc.close?.(); } catch { /* a close failure must not mask the result */ }
    try { await engine?.close?.(); } catch { /* same */ }
  }
}

/**
 * One line for the ledger. A read is recorded, not remembered — and a read that had to
 * fall back to pixels SAYS SO, because "we read the text" and "we looked at a picture of
 * the text" are different claims and a receipt must not blur them.
 */
export function readLine(outcome: ReadPdfOutcome, sourceName: string): string {
  if (!outcome.ok || !outcome.result) {
    return `${sourceName}: PDF refused [${outcome.refusal?.code ?? "unknown"}]`;
  }
  const r = outcome.result;
  const bits = [`${r.pageCount} page(s)`];
  if (r.scannedPages.length > 0) {
    bits.push(`${r.scannedPages.length} with no text layer${r.usedRender ? " (rendered as images)" : ""}`);
  }
  if (r.unreadablePages.length > 0) bits.push(`${r.unreadablePages.length} unreadable`);
  if (r.usedRender) bits.push("image path used");
  return `${sourceName}: ${bits.join(", ")}`;
}
