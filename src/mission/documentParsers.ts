/**
 * SelfImpulse §13 — the format readers. Each one turns a binary document into
 * MARKDOWN WITH REAL HEADINGS, and that shape is the whole design.
 *
 * WHY MARKDOWN AND NOT PLAIN TEXT: the Docs door already owns the judgement
 * about what counts as knowledge. `knowledgeSkills.extractStructure` reads
 * headings, bullets and decision rules out of text, and `proposeKnowledgeSkill`
 * REFUSES anything with no extractable structure (guardline G2). If these
 * parsers emitted flat prose, every PDF and deck would either fail that gate
 * spuriously — or, worse, be waved through by a second, softer gate built just
 * for files. There is no second gate. A .docx's heading levels become `##`, a
 * spreadsheet's sheet names and header row become `##` and `-`, a deck becomes
 * one `##` per slide, and from there the document walks the SAME path a pasted
 * note walks: distil → propose → a human decides. The structural rule the owner
 * asked to preserve is preserved by construction, not by a promise.
 *
 * WHAT THESE DO NOT DO: they do not decide whether a document is worth
 * approving, and they do not cap bytes (see archiveScan.ts — that is the gate,
 * this is the reader). They report two kinds of fact and nothing else: the text
 * they found, or a refusal in words. An unreadable file is never an empty
 * success — that is the whole of F17's lesson applied to ingestion.
 *
 * EGRESS: none, in any direction. Every function here is pure bytes-in,
 * text-out; nothing fetches, nothing loads a remote font, dictionary or
 * stylesheet. pdf.js is the one library with a habit of fetching auxiliary
 * data, so `useSystemFonts`/no `cMapUrl`/no `standardFontDataUrl` is a
 * deliberate choice and probe/fileIngest.test.ts §egress pins that no module
 * in this path can call out.
 */
import JSZip from "jszip";
import * as mammoth from "mammoth";
import type { PDFDocumentProxy } from "pdfjs-dist";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { Refusal } from "./archiveScan";
import { refuse } from "./archiveScan";
import { readScannedPdf, readImageDocument } from "./scannedPdf";

/**
 * A parse result is either text that was found or a refusal in words. There is
 * deliberately no third shape — no `{ markdown: "" }` success — because an
 * empty success is what a human later mistakes for a document with nothing in
 * it rather than a door that failed to read one.
 */
export type ParseResult =
  | { ok: true; markdown: string; notes: string[] }
  | { ok: false; refusal: Refusal };

const utf8 = new TextDecoder();
const MAX_LINE_CHARS = 400;

/* ── the pdf.js seam ─────────────────────────────────────────────────────── */

/**
 * pdf.js runs its parser in a Worker in the browser and, without one, refuses
 * to start. `main.tsx` hands us the built worker's URL at boot (a bundler
 * asset, so the path can never drift from the shipped pdf.js); a Node probe has
 * no `document`, so it resolves the vendored copy from the tree root instead.
 *
 * SI_ROOT is the house convention: it is defined at bundle time by both
 * probe runners. Deriving this from import.meta.url instead breaks inside the
 * offline pack, where the bundle's own location says nothing about the tree.
 */
declare const SI_ROOT: string | undefined;
export { configurePdfWorker } from "./pdfWorker";
import { pdfWorkerSrc } from "./pdfWorker";

async function resolvePdfWorker(): Promise<string | null> {
  const configured = pdfWorkerSrc();
  if (configured) return configured;
  if (typeof document !== "undefined") return null;
  const root = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
  const fs = await import("node:fs");
  const path = await import("node:path");
  const url = await import("node:url");
  const vendored = path.join(root, "vendor", "pdfjs", "pdf.worker.min.mjs");
  return fs.existsSync(vendored) ? url.pathToFileURL(vendored).href : null;
}

/** A PDF's real text, its outline, and its heading levels — from font size. */
export async function parsePdf(bytes: Uint8Array, maxChars: number, deadlineAt = Number.POSITIVE_INFINITY, now: () => number = Date.now): Promise<ParseResult> {
  const workerSrc = await resolvePdfWorker();
  if (!workerSrc) {
    return refuse("worker-unavailable", "this build has no pdf.js worker configured, so a PDF cannot be read here. The browser app ships one; this runtime is not the browser app.");
  }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  let doc: PDFDocumentProxy;
  try {
    // pdf.js ships its security-relevant options (enableScripting /
    // isEvalSupported) without declaring them on the public TypeScript
    // DocumentInitParameters — they exist at runtime but are missing from the
    // .d.ts, which is how the unsafe default survived an honest read of the
    // types. The cast keeps the compiler happy while the probe pins the
    // flags at their values (see probe/fileIngest §pdf-js-disabled).
    const pdfOpts = {
      data: bytes.slice(0),
      useSystemFonts: true,
      disableFontFace: true,
      // V-security (CVE-2026-16633): a malicious PDF can embed JavaScript
      // actions (OpenAction / AA / JS entries) and XFA forms which pdf.js
      // evaluates by default. The Docs door is a PURE text-extraction pass —
      // it has no reason to run a document's JavaScript or execute XFA, ever.
      // All three flags are set explicitly:
      //   • enableScripting = false — JS action sandbox never starts (primary
      //     fix; pdfjs defaults enableScripting to true);
      //   • enableXfa       = false — no XFA form parsing (XFA is JS-driven);
      //   • isEvalSupported = false — pdf.js's own just-in-time worklets
      //     refuse any dynamic-code fallback during rendering.
      enableScripting: false,
      enableXfa: false,
      isEvalSupported: false,
      // Font and content warnings are noise; this path returns text or refuses.
      verbosity: 0,
      // Deliberately unset: cMapUrl and standardFontDataUrl are how a PDF
      // reader reaches the network. Nothing here may.
    } as Parameters<typeof pdfjs.getDocument>[0];
    doc = await pdfjs.getDocument(pdfOpts).promise;
  } catch (e) {
    const err = e as { name?: string; message?: string };
    const msg = String(err?.message ?? err ?? "");
    if (/password/i.test(msg) || err?.name === "PasswordException") {
      return refuse("encrypted", "this PDF is password-protected. SelfImpulse does not try an empty password and pass it off as a read, and it does not crack one: it refuses, in words. Open it, save the plaintext, and drop that.");
    }
    if (/Invalid PDF/i.test(msg)) return refuse("unrecognised-binary", `this is not a PDF this reader can parse: ${msg.slice(0, 120)}`);
    return refuse("unrecognised-binary", `the PDF reader stopped: ${msg.slice(0, 140)}`);
  }
  const notes: string[] = [];
  const outlineLines: string[] = [];
  /* Each page that carries text becomes a BLOCK keyed by its page number, not a flat run of
     lines. The reason is the mixed document: pages 1 and 3 can be typed while page 2 is a
     scan, and the block shape is what lets the image reader's results be spliced back into
     the right position instead of appended to the end. */
  const blocks: Array<{ page: number; lines: string[] }> = [];
  /* Pages with no text layer at all. These are not skipped — they are the pages the image
     reader will be given, and naming them is the whole difference between a document that
     reads as complete and one that quietly is not. */
  const textlessPages: number[] = [];
  try {
    const outline = await doc.getOutline();
    const outlineTitles = (outline ?? []).map((o) => String(o.title ?? "").trim()).filter(Boolean).slice(0, 40);
    if (outlineTitles.length > 0) {
      outlineLines.push("# Document outline");
      for (const t of outlineTitles) outlineLines.push(`## ${clip(t)}`);
    }
    const pageCount = doc.numPages;
    for (let p = 1; p <= pageCount; p++) {
      if (now() > deadlineAt) return refuse("deadline", `this PDF stopped being read at page ${p} of ${pageCount} — the time budget for one file ran out, so no partial document is offered.`);
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items.filter((it): it is TextItem => typeof (it as TextItem).str === "string");
      const heights = items.map((it) => it.height).filter((h) => h > 0).sort((a, b) => a - b);
      const bodySize = heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 0;
      // Rebuild visual lines: pdf.js hands back runs, not rows.
      const rows = new Map<number, { text: string; size: number }>();
      for (const it of items) {
        const y = Math.round(it.transform[5]);
        const prev = rows.get(y);
        rows.set(y, { text: (prev?.text ?? "") + (prev && !/\s$/.test(prev.text) && it.str ? " " : "") + it.str, size: Math.max(prev?.size ?? 0, it.height) });
      }
      const ordered = [...rows.entries()].sort((a, b) => b[0] - a[0]);
      const nonEmpty = ordered.filter(([, r]) => r.text.trim().length > 0);
      if (nonEmpty.length === 0) { textlessPages.push(p); continue; }
      const blockLines: string[] = [];
      if (pageCount > 1) blockLines.push(`## Page ${p}`);
      for (const [, r] of nonEmpty) {
        const text = clip(r.text.replace(/\s+/g, " ").trim());
        if (!text) continue;
        const isHeading = bodySize > 0 && r.size >= bodySize * 1.18 && text.length <= 90;
        blockLines.push(isHeading && !/^\d+\.$/.test(text) ? `## ${text}` : text);
      }
      blocks.push({ page: p, lines: blockLines });
    }
    if (blocks.flatMap((b) => b.lines).join("\n").length > maxChars) {
      return refuse("parsed-too-large", `this PDF yields more than ${(maxChars / 1000).toFixed(0)}k characters of structure (${doc.numPages} pages). The Docs door distils one proposal at a time — drop a chapter, not the whole book.`);
    }
    if (pageCount > 0 && notes.length === 0) notes.push(`${pageCount} page${pageCount === 1 ? "" : "s"} read on this machine.`);
  } catch (e) {
    return refuse("unrecognised-binary", `the PDF reader stopped mid-document: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
  }

  /* ── THE IMAGE PATH, AND WHY IT IS NO LONGER ALL-OR-NOTHING ────────────────
   *
   * This used to be a single branch: if the document produced NO markdown at all, hand the
   * whole thing to the image reader; otherwise use the text and never look at the images.
   * That reads as reasonable and it silently loses pages. A PDF with a typed cover sheet, a
   * scanned body and a typed appendix produced pages 1 and 3 as text — so `markdown` was
   * non-empty, the image reader was never called, and PAGE 2 SIMPLY WAS NOT THERE. No
   * mention, no note, no refusal: a document that reads as complete and is not. It is the
   * same class of lie as an empty acceptance, and the codebase refuses that everywhere else.
   *
   * So the decision is per PAGE, not per document. Pages with text keep their text; pages
   * without it are given to the image reader; the results are spliced back in page order.
   * `readScannedPdf` renders exactly the pages whose text is absent, so no page that already
   * has a text layer is ever rasterised and re-recognised — the cheap lossless path stays
   * the path for pages that have one.
   *
   * The two outcomes are deliberately different in kind:
   *   • the whole document has no text  → if it cannot be read, REFUSE it. A file that is
   *     entirely unreadable is not a document this door can propose, and approving it as an
   *     empty one is exactly the failure this reading of the code exists to prevent.
   *   • SOME pages have no text         → if they cannot be read, NAME the gap and carry on.
   *     Refusing a mostly-legible contract because one page is a scan would be worse than
   *     the bug being fixed. Naming the page is what the container path already does for a
   *     member it would not read: "## Member: x — (refused: …)". Same rule, same shape. */
  if (blocks.length === 0 || textlessPages.length > 0) {
    const scan = await readScannedPdf(bytes, { maxChars, deadlineAt, now });

    if (blocks.length === 0) {
      if (!scan.ok) return refuse(scan.refusal.code, scan.refusal.words);
      const markdown = [...outlineLines, scan.markdown].filter((l) => l.length > 0).join("\n").trim();
      return { ok: true, markdown, notes: [...notes, ...scan.notes] };
    }

    if (scan.ok) {
      const spliced = new Set<number>();
      for (const sp of scan.pages) {
        if (!textlessPages.includes(sp.page)) continue; // the engines disagreed; the text wins
        const lines = pageCountOf(blocks) > 1 ? [`## Page ${sp.page}`] : [];
        for (const raw of sp.text.split("\n")) {
          const line = raw.replace(/\s+/g, " ").trim();
          if (line.length > 0) lines.push(line);
        }
        blocks.push({ page: sp.page, lines });
        spliced.add(sp.page);
      }
      // A page the text reader found empty that the image reader did not return at all —
      // the two engines disagreeing about what "has text" means. Named, never dropped.
      for (const p of textlessPages) {
        if (spliced.has(p)) continue;
        blocks.push({ page: p, lines: [`## Page ${p}`, `(this page carries no text layer and no image was produced for it — it was not read)`, ]});
      }
      notes.push(...scan.notes);
    } else {
      for (const p of textlessPages) {
        blocks.push({ page: p, lines: [`## Page ${p}`, `(not read: ${scan.refusal.words})`] });
      }
      notes.push(`${textlessPages.length} page${textlessPages.length === 1 ? "" : "s"} in this PDF carry no text layer and were not read: ${scan.refusal.words}`);
    }
    blocks.sort((a, b) => a.page - b.page);
  }

  const markdown = [...outlineLines, ...blocks.flatMap((b) => b.lines)].join("\n").trim();
  if (!markdown) return refuse("empty-document", "this PDF has no text layer — it is a scan or an image. Reading it would need OCR, which this build could not do here, so it is refused rather than approved as an empty document.");
  return { ok: true, markdown, notes };
}

/** The block list's page count, for the heading rule shared with the text path. */
function pageCountOf(blocks: Array<{ page: number }>): number {
  return blocks.length === 0 ? 0 : Math.max(...blocks.map((b) => b.page));
}

/**
 * A DOCUMENT THAT IS AN IMAGE — a screenshot, a photographed invoice, an exported page.
 *
 * Composed from the same pieces as a scanned PDF page, deliberately: same preflight, same
 * caps, same refusals, same markdown shaper. A second pipeline for the same question is how
 * two answers start to differ.
 */
export async function parseImage(bytes: Uint8Array, maxChars: number, deadlineAt = Number.POSITIVE_INFINITY, now: () => number = Date.now): Promise<ParseResult> {
  const read = await readImageDocument(bytes, { maxChars, deadlineAt, now });
  if (!read.ok) return refuse(read.refusal.code, read.refusal.words);
  return { ok: true, markdown: read.markdown, notes: read.notes };
}

/* ── DOCX ────────────────────────────────────────────────────────────────── */

/** mammoth reads real Word heading levels and list structure; both survive. */
export async function parseDocx(bytes: Uint8Array, maxChars: number): Promise<ParseResult> {
  let html: string;
  let messages: { message?: string }[] = [];
  try {
    /* mammoth's node build takes a Buffer, its browser build an ArrayBuffer,
       and the two input shapes are not interchangeable in its own types. */
    const r = typeof document === "undefined"
      ? await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
      : await mammoth.convertToHtml({ arrayBuffer: bytes.slice(0).buffer as ArrayBuffer });
    html = r.value;
    messages = r.messages ?? [];
  } catch (e) {
    return refuse("unrecognised-binary", `that .docx would not open: ${String(e instanceof Error ? e.message : e).slice(0, 160)}`);
  }
  const markdown = htmlToMarkdown(html);
  if (!markdown.trim()) {
    return refuse("empty-document", "this .docx has no readable body text — a drawing, an image or an empty file. Nothing was invented to fill it in.");
  }
  if (markdown.length > maxChars) {
    return refuse("parsed-too-large", `this .docx expands to ${(markdown.length / 1000).toFixed(0)}k characters of text, above the ${Math.round(maxChars / 1000)}k one proposal can hold. Distil a section.`);
  }
  const notes = messages.slice(0, 4).map((m) => `docx: ${m.message ?? ""}`.trim()).filter((s) => s.length > 6);
  return { ok: true, markdown, notes };
}

/**
 * OOXML/HTML → the markdown dialect `extractStructure` already reads.
 * Heading depth is preserved (h1→#, h6→######), lists become `-`, and a table
 * becomes one line per row — which is structure, not a summary of it.
 */
export function htmlToMarkdown(html: string): string {
  let out = html.replace(/<\s*(script|style)[\s\S]*?<\/\1\s*>/gi, " ");
  out = out.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, body: string) => `\n\n${"#".repeat(Number(lvl))} ${inline(body)}\n\n`);
  out = out.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, body: string) => `\n- ${inline(body).replace(/\n+/g, " ")}`);
  out = out.replace(/<\/(p|div|section|article|tr|br)>/gi, "\n\n").replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<(td|th)[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _t: string, body: string) => `${inline(body)} | `);
  out = out.replace(/<[^>]+>/g, "");
  out = out
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return out.split("\n").map((l) => clip(l.trimEnd())).join("\n").trim();
}

function inline(fragment: string): string {
  return fragment.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function clip(line: string): string {
  return line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)} …` : line;
}

/* ── the shared OOXML walk (xlsx + pptx are zips of XML) ─────────────────── */

/** An opened container, or the reason it would not open. `null` was the old
 *  shape and it is the reason this reads as a defect: an empty
 *  `catch { return null }` threw the JSZip error away, so every way a workbook
 *  can fail to inflate — truncated, encrypted, a bad central directory, a
 *  QuotaExceeded from the inflate buffer — produced one identical message with
 *  no cause in it, and nothing anywhere recorded what actually went wrong. */
type OpenedParts =
  | { ok: true; zip: JSZip; text(name: string): Promise<string | null> }
  | { ok: false; reason: string };

async function openParts(bytes: Uint8Array): Promise<OpenedParts> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    return {
      ok: true,
      zip,
      text: async (name: string) => {
        const f = zip.file(name);
        return f ? utf8.decode(await f.async("uint8array")) : null;
      },
    };
  } catch (e) {
    return { ok: false, reason: String(e instanceof Error ? e.message : e).slice(0, 160) || "the archive reader gave no reason" };
  }
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? m[1] : null;
}

function relTargets(xml: string | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!xml) return map;
  for (const m of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id"); const target = attr(m[0], "Target");
    if (id && target) map.set(id, target.replace(/^\.\//, ""));
  }
  return map;
}

/** `<si>` / `<is>` runs joined — a shared string is often split into rich runs. */
function textRuns(xml: string, tag: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "g"))) {
    const parts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeEntities(t[1]));
    const one = (parts.length > 0 ? parts.join("") : decodeEntities(m[1].replace(/<[^>]+>/g, ""))).trim();
    out.push(one);
  }
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Cell column letter → index, so a sparse row still lines up with its header. */
function columnIndexOf(ref: string | null): number {
  if (!ref) return -1;
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase());
  if (!letters) return -1;
  let n = 0;
  for (const ch of letters[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/* ── XLSX ────────────────────────────────────────────────────────────────── */

const MAX_SHEETS = 40;
const SAMPLE_ROWS = 12;
/** Rows `rowValues` reads per sheet. This is a READING cap, not a count of what
 *  the sheet holds, and the wording at the call site has to say so — see the
 *  note there on why `rows.length - SAMPLE_ROWS` was a lie past 400 rows. */
const MAX_SHEET_ROWS = 400;

/**
 * Sheet names and the header row are the structure a spreadsheet carries; the
 * rows beneath are its content. Both are reported, in that order, per sheet —
 * and no dependency is added to get it: an .xlsx is a zip of XML, which
 * archiveScan has already vetted by the time this runs.
 */
export async function parseXlsx(bytes: Uint8Array, maxChars: number): Promise<ParseResult> {
  const parts = await openParts(bytes);
  if (!parts.ok) return refuse("corrupt-archive", `that .xlsx would not open as a spreadsheet: ${parts.reason}`);
  const workbook = await parts.text("xl/workbook.xml");
  if (!workbook) return refuse("unrecognised-binary", "this .xlsx has no xl/workbook.xml, so it is not a workbook.");
  const rels = relTargets(await parts.text("xl/_rels/workbook.xml.rels"));
  const shared = textRuns((await parts.text("xl/sharedStrings.xml")) ?? "", "si");
  const sheetTags = [...workbook.matchAll(/<sheet\b[^>]*>/g)];
  if (sheetTags.length === 0) return refuse("empty-document", "this workbook declares no sheets, so there is nothing here to learn from.");
  const lines: string[] = ["# Workbook"];
  const notes: string[] = [];
  for (const [i, tag] of sheetTags.slice(0, MAX_SHEETS).entries()) {
    const name = decodeEntities(attr(tag[0], "name") ?? `Sheet ${i + 1}`);
    const target = rels.get(attr(tag[0], "r:id") ?? "");
    const path = target ? (target.startsWith("xl/") ? target : `xl/${target}`) : `xl/worksheets/sheet${i + 1}.xml`;
    const xml = await parts.text(path);
    if (!xml) { notes.push(`sheet "${name}" has no readable part at ${path}`); continue; }
    lines.push(`## Sheet: ${name}`);
    const { rows, hitRowCap } = rowValues(xml, shared);
    if (rows.length === 0) { lines.push("(empty sheet)"); continue; }
    const header = rows[0];
    const width = Math.max(...rows.slice(0, SAMPLE_ROWS).map((r) => r.length), 1);
    lines.push(`- Columns (${header.filter(Boolean).length || width}): ${header.map((h, c) => h || `column ${columnLabel(c)}`).join(" · ")}`);
    for (const r of rows.slice(1, SAMPLE_ROWS)) {
      const cells = r.map((c) => c || "").join(" · ").trim();
      if (cells.replace(/[ ·]/g, "")) lines.push(`- ${clip(cells)}`);
    }
    /* THE CAP IS STATED AS A CAP. This line used to print
     * `rows.length - SAMPLE_ROWS` "further rows" unconditionally, and `rowValues`
     * stops collecting at MAX_SHEET_ROWS — so a 12,000-row sheet was reported as
     * having "388 further rows". That is not a rounding, it is a floorless claim
     * about a number the reader never counted, and it under-reported the sheet by
     * however much the owner most needed to know. Past the cap the honest sentence
     * names the cap and says the rest was not counted. */
    if (hitRowCap) {
      lines.push(`- …and more rows beyond the ${MAX_SHEET_ROWS}-row reading cap for one sheet — this reader stopped counting at ${MAX_SHEET_ROWS}, so the rows after it were not read and their number is not known here`);
      notes.push(`sheet "${name}" was read to its ${MAX_SHEET_ROWS}-row cap; rows beyond it were not read and are not counted`);
    } else if (rows.length > SAMPLE_ROWS) {
      lines.push(`- …and ${rows.length - SAMPLE_ROWS} further row${rows.length - SAMPLE_ROWS === 1 ? "" : "s"} on this sheet (${rows.length} in total, all of them read)`);
    }
    notes.push(`sheet "${name}": ${rows.length} row${rows.length === 1 ? "" : "s"} × ${width} column${width === 1 ? "" : "s"}${hitRowCap ? " (at the read cap)" : ""}`);
    if (lines.join("\n").length > maxChars) {
      return refuse("parsed-too-large", `this workbook is larger than one proposal can hold (${Math.round(maxChars / 1000)}k characters of structure). Drop the sheet that matters.`);
    }
  }
  if (sheetTags.length > MAX_SHEETS) notes.push(`only the first ${MAX_SHEETS} of ${sheetTags.length} sheets were read`);
  return { ok: true, markdown: lines.join("\n").trim(), notes };
}

function columnLabel(index: number): string {
  let n = index + 1; let s = "";
  while (n > 0) { const rem = (n - 1) % 26; s = String.fromCharCode(65 + rem) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Rows, and whether the read stopped at `MAX_SHEET_ROWS`. The flag is the whole
 *  point: without it the caller cannot tell "this sheet has 400 rows" from "this
 *  sheet has more rows than were counted", and those two are different claims. */
function rowValues(xml: string, shared: string[]): { rows: string[][]; hitRowCap: boolean } {
  const rows: string[][] = [];
  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] ?? "";
      const type = attr(attrs, "t");
      const col = columnIndexOf(attr(attrs, "r"));
      const value =
        type === "s" ? shared[Number(/<v>([\s\S]*?)<\/v>/.exec(body)?.[1])] ?? "" :
        type === "inlineStr" ? textRuns(body, "is").join(" ") :
        type === "str" || type === "e" ? /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "" :
        type === "b" ? (/<v>1<\/v>/.test(body) ? "TRUE" : "FALSE") :
        /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
      const text = decodeEntities(value ?? "").trim();
      const index = col >= 0 ? col : cells.length;
      while (cells.length < index) cells.push("");
      cells[index] = text;
    }
    if (cells.some((c) => c !== "")) rows.push(cells);
    if (rows.length >= MAX_SHEET_ROWS) return { rows, hitRowCap: true };
  }
  return { rows, hitRowCap: false };
}

/* ── PPTX ────────────────────────────────────────────────────────────────── */

const MAX_SLIDES = 200;

/** One heading per slide, the title as its own heading, the rest as bullets. */
export async function parsePptx(bytes: Uint8Array, maxChars: number): Promise<ParseResult> {
  const parts = await openParts(bytes);
  if (!parts.ok) return refuse("corrupt-archive", `that .pptx would not open as a deck: ${parts.reason}`);
  const presentation = await parts.text("ppt/presentation.xml");
  const presRels = relTargets(await parts.text("ppt/_rels/presentation.xml.rels"));
  const ordered: string[] = [];
  if (presentation && presRels.size > 0) {
    for (const m of presentation.matchAll(/<p:sldId\b[^>]*>/g)) {
      const target = presRels.get(attr(m[0], "r:id") ?? "");
      if (target) ordered.push(target.replace(/^\/?slides?\//i, "ppt/slides/").replace(/^ppt\/ppt\//, "ppt/"));
    }
  }
  const slideFiles = ordered.length > 0 ? ordered : Object.keys(parts.zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort();
  if (slideFiles.length === 0) return refuse("empty-document", "this deck declares no slides.");
  const lines: string[] = ["# Deck"];
  const notes: string[] = [];
  for (const [i, file] of slideFiles.slice(0, MAX_SLIDES).entries()) {
    const xml = await parts.text(file);
    if (!xml) { notes.push(`${file} could not be read`); continue; }
    const runs = textRuns(xml, "a:t");
    const number = /(\d+)\.xml$/.exec(file)?.[1] ?? String(i + 1);
    const title = runs.find((r) => r.length > 0) ?? "";
    lines.push(title ? `## Slide ${number}: ${clip(title)}` : `## Slide ${number}`);
    for (const r of runs.slice(title ? 1 : 0)) if (r.trim()) lines.push(`- ${clip(r.trim())}`);
    const noteFile = file.replace("ppt/slides/", "ppt/notesSlides/");
    const noteXml = await parts.text(noteFile);
    if (noteXml) for (const r of textRuns(noteXml, "a:t")) if (r.trim().length > 20) lines.push(`- Speaker note: ${clip(r.trim())}`);
    if (lines.join("\n").length > maxChars) {
      return refuse("parsed-too-large", `this deck is more than ${Math.round(maxChars / 1000)}k characters of structure — ${(i + 1)} slides in. A deck this size is not one piece of knowledge; distil the slides that decide something.`);
    }
  }
  if (slideFiles.length > MAX_SLIDES) notes.push(`only the first ${MAX_SLIDES} of ${slideFiles.length} slides were read`);
  notes.push(`${slideFiles.length} slide${slideFiles.length === 1 ? "" : "s"}`);
  const markdown = lines.join("\n").trim();
  if (markdown.split("\n").every((l) => l.startsWith("#"))) return refuse("no-extractable-structure", "every slide in this deck is an image. Text-free slides carry no structure to distil, so nothing was proposed from them.");
  return { ok: true, markdown, notes };
}

/* ── JSON ────────────────────────────────────────────────────────────────── */

const JSON_DEPTH = 4;
const JSON_ARRAY_SAMPLES = 8;
const JSON_KEYS = 60;

/**
 * JSON has no headings, so its structure is its SHAPE: which keys exist, how
 * deep they nest, what a repeated record looks like. That is what this prints.
 * Refusing to print a value wall matters as much: 40k transactions rendered as
 * text would produce a proposal that reads like knowledge and means nothing.
 */
export function parseJson(bytes: Uint8Array, maxChars: number): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(utf8.decode(bytes));
  } catch (e) {
    return refuse("unrecognised-binary", `this is not valid JSON: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
  }
  const lines: string[] = ["# JSON structure"];
  const notes: string[] = [];
  describe(value, lines, 0, notes);
  const markdown = lines.join("\n").trim();
  if (markdown.length > maxChars) return refuse("parsed-too-large", `this JSON renders more than ${Math.round(maxChars / 1000)}k characters of structure. Narrow it to the records that decide something.`);
  if (lines.length <= 1) return refuse("no-extractable-structure", "this JSON carries no shape to distil — a bare scalar or an empty container.");
  return { ok: true, markdown, notes };
}

function describe(value: unknown, lines: string[], depth: number, notes: string[]): void {
  const pad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    lines.push(`${pad}## array of ${value.length}`);
    if (value.length === 0) return;
    const objectItems = value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v));
    if (objectItems.length > 0) {
      const keys = [...new Set(objectItems.flatMap((o) => Object.keys(o)))];
      lines.push(`${pad}- record fields: ${keys.slice(0, JSON_KEYS).map((k) => clip(k)).join(", ")}${keys.length > JSON_KEYS ? ` …and ${keys.length - JSON_KEYS} more` : ""}`);
      const present = keys.filter((k) => objectItems.every((o) => o[k] !== undefined));
      if (present.length < keys.length) lines.push(`${pad}- optional fields: ${keys.filter((k) => !present.includes(k)).slice(0, JSON_KEYS).join(", ")}`);
      if (depth >= JSON_DEPTH) { notes.push(`array items not described further (depth cap ${JSON_DEPTH})`); return; }
      for (const item of objectItems.slice(0, JSON_ARRAY_SAMPLES)) describe(item, lines, depth + 1, notes);
      if (objectItems.length > JSON_ARRAY_SAMPLES) lines.push(`${pad}  …and ${objectItems.length - JSON_ARRAY_SAMPLES} further records`);
      return;
    }
    if (depth >= JSON_DEPTH) { notes.push(`array scalars not described further (depth cap ${JSON_DEPTH})`); return; }
    for (const item of value.slice(0, JSON_ARRAY_SAMPLES)) describe(item, lines, depth + 1, notes);
    if (value.length > JSON_ARRAY_SAMPLES) lines.push(`${pad}  …and ${value.length - JSON_ARRAY_SAMPLES} further values`);
    return;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (depth === 0) lines.push(`${pad}## object with ${entries.length} keys`);
    for (const [k, v] of entries.slice(0, JSON_KEYS)) {
      if (v !== null && typeof v === "object") {
        lines.push(`${pad}## ${clip(k)}`);
        if (depth >= JSON_DEPTH) {
          const shape = Array.isArray(v) ? `array of ${v.length}` : `object with ${Object.keys(v).length} keys`;
          lines.push(`${pad}  (${shape} — not described further, depth cap ${JSON_DEPTH})`);
          if (!notes.some((n) => /depth cap/i.test(n))) notes.push(`values below depth ${JSON_DEPTH} were not described (depth cap)`);
          continue;
        }
        describe(v, lines, depth + 1, notes);
      } else {
        lines.push(`${pad}- ${clip(k)}: ${scalar(v)}`);
      }
    }
    if (entries.length > JSON_KEYS) lines.push(`${pad} …and ${entries.length - JSON_KEYS} further keys`);
    return;
  }
  lines.push(`${pad}- ${scalar(value)}`);
}

function scalar(v: unknown): string {
  if (typeof v === "string") return v.length > 120 ? `${v.slice(0, 120)}…` : v;
  if (v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return typeof v;
}
