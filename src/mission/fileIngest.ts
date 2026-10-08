/**
 * SelfImpulse §13 — the file door. One function, `ingestFile`, and one rule:
 * everything that could stop a bad file happens HERE, on the call path.
 *
 * Law L12 is the reason this module exists as a module. A cap that lives in
 * `Docs.tsx` is a suggestion — anything else that reaches for a file (a future
 * bulk import, the desktop host, a specialist tool) walks straight past it. So
 * the door's UI holds no limits at all: it hands bytes over and reports what
 * came back. The limits, the format decision, the containment gate and the
 * receipt are all downstream of the one call.
 *
 * WHAT HAPPENS TO A FILE THAT PASSES:
 *   sniff → contain (archiveScan, for every zip-family input, including the
 *   Office documents) → parse to markdown → hand the markdown to
 *   `proposeKnowledgeSkill`, the SAME function the paste box uses. That is the
 *   whole pipeline. There is no file-shaped copy of the knowledge path, no
 *   second structure gate, no second proposal list.
 *
 * WHAT HAPPENS TO A FILE THAT DOES NOT PASS:
 *   it is refused in words, and the refusal is a receipt — who/what/when/how
 *   big, with the digest of the exact bytes that were rejected. A silent empty
 *   success is the failure mode this door was built to avoid (that is F17, in
 *   a new costume: an outcome that renders as success because nothing
 *   classified it). So `ingestFile` has exactly two returns, and both carry a
 *   receipt.
 *
 * THE CAPS, and why each number is where it is:
 *   25 MB in         a dropped file's own bytes. Bounds the worst case any
 *                    parser can multiply (deflate tops out near 1000:1).
 *   15s per file     a wall budget checked before every page, sheet, slide and
 *                    archive entry. A parse that overruns is abandoned, not
 *                    summarised — half a document is not a document.
 *   60s per run,     one run is one drop. The human should not lose the door
 *   25 files         to a folder; the leftovers are reported, not skipped.
 *   400k chars       the engine's own MAX_CONTENT in knowledgeSkills. Inheriting
 *                    it is deliberate: the cap that decides "distil a chapter,
 *                    not a library" must be one cap, not two that drift.
 *
 * SCOPE HONESTY: this reads PDF, DOCX, XLSX, XLSM, PPTX, JSON, Markdown and
 * plain text, plus those members inside a ZIP — and, since §13, PNG and JPEG.
 *
 * IT DOES DO OCR, AND THE OLD COMMENT SAYING IT DID NOT WAS A LIE THAT OUTLIVED
 * THE FEATURE BY ONE EDIT. `read()` dispatches both image formats to
 * `parseImage`, and a PDF page with no text layer is rasterised by `pdfRender`
 * and read by the same recogniser; the recogniser is tesseract.js, running on
 * this machine. What is still true, and was the point the old sentence was
 * fumbling for: OCR never reaches the network. The trained language data must
 * already be on this machine (`ocr.ts` refuses rather than downloading it), a
 * missing pack is a refusal in words naming the remedy, and a page that reads
 * below the confidence floor is reported as unreliable rather than kept quiet.
 *
 * What this door still does NOT do: it does not read the pre-2007 binary Office
 * formats (.doc/.xls/.ppt — OLE compound files), it does not call a vision
 * model or a provider, and it does not open a second archive inside an archive.
 * Each of those is a refusal in words with the reason, not a quiet zero.
 */
import { ARCHIVE_LIMITS, extractVetted, looksLikeZip, refuse, scanContainer, unsafeEntryName } from "./archiveScan";
import type { ArchiveLimits, Refusal, RefusalCode } from "./archiveScan";
import { parseDocx, parseImage, parseJson, parsePdf, parsePptx, parseXlsx } from "./documentParsers";
import type { ParseResult } from "./documentParsers";
import { scanForInjection, stripInvisible, scanLine } from "../security/injectionGuard";

/* §13 — "png" and "jpeg" are formats this door READS, not formats it carries. A screenshot
 * or a photographed invoice is a document a person wants in their knowledge base, and the
 * reader for it already existed; what was missing was this door's willingness to accept one.
 * They are listed as two formats rather than one "image" because they are two signatures and
 * the sniff below is by signature. */
export type IngestFormat = "pdf" | "docx" | "xlsx" | "pptx" | "zip" | "json" | "text" | "png" | "jpeg" | "unknown";

export interface IngestLimits extends ArchiveLimits {
  maxParsedChars: number;
  perFileDeadlineMs: number;
  runDeadlineMs: number;
  maxFilesPerRun: number;
  maxRunExpandedBytes: number;
}

export const INGEST_LIMITS: IngestLimits = {
  ...ARCHIVE_LIMITS,
  maxParsedChars: 400_000,
  perFileDeadlineMs: 15_000,
  runDeadlineMs: 60_000,
  maxFilesPerRun: 25,
  maxRunExpandedBytes: 150_000_000,
};

export interface IngestReceipt {
  id: string;
  at: string;
  file: string;
  format: IngestFormat;
  decision: "accepted" | "refused";
  code: RefusalCode | null;
  /** What the human is told, in words. Never empty on a refusal. */
  words: string;
  bytesIn: number;
  bytesExpanded: number;
  entries: number;
  membersRead: number;
  parsedChars: number;
  elapsedMs: number;
  /** sha256 of the exact bytes that were accepted or rejected. */
  sourceSha256: string;
  /** Ingestion itself never egresses; what the distiller does is recorded on
   *  the proposal as `dataHandling`, and that is the authority for it. */
  egressDuringParse: false;
}

/** A file the run turned away for CAPACITY — the drop was too big or too slow —
 *  as opposed to a file that was bad. The distinction is the whole reason this
 *  type exists: `too-many-files` and `run-deadline` describe a drop that was
 *  cut short, and they read in a flat receipt list exactly like a document that
 *  failed on its own merits. A human looking at "3 refused" cannot tell "3 files
 *  were unsafe" from "the folder was bigger than one run and I never saw the
 *  rest of it". */
export interface CapacityRefusal {
  file: string;
  code: RefusalCode;
  words: string;
}

export interface IngestRun {
  readonly startedAt: number;
  readonly deadlineAt: number;
  /** The run owns its limits, so a per-run cap cannot be bypassed by a caller
   *  that remembers the deadline but not the numbers it was built with. */
  readonly limits: IngestLimits;
  files: number;
  expandedBytes: number;
  receipts: IngestReceipt[];
  /** Capacity cut-offs, kept beside the receipts so a run can be reported as
   *  TRUNCATED rather than merely as having refused some files. See
   *  `ingestTruncationNotice`. */
  capacityRefusals: CapacityRefusal[];
}

export function createIngestRun(limits: IngestLimits = INGEST_LIMITS, now: () => number = Date.now): IngestRun {
  const startedAt = now();
  return { startedAt, deadlineAt: startedAt + limits.runDeadlineMs, limits, files: 0, expandedBytes: 0, receipts: [], capacityRefusals: [] };
}

/** The capacity codes: a refusal that means "the run stopped taking files", not
 *  "this file was refused". Everything else is about the document itself. */
const CAPACITY_CODES: RefusalCode[] = ["too-many-files", "run-deadline"];

/**
 * Did this drop get cut short? Returns honest words when it did, `null` when the
 * run took everything it was handed.
 *
 * WHAT THIS CAN AND CANNOT SEE, stated because the limit is the point. The door
 * can only report a file it was actually handed the bytes of. The file-picker
 * (`src/ui/screens/Composer.tsx`, MAX_FILES 500 / MAX_DEPTH 8) stops the WALK
 * before anything reaches this module, so files it never enqueued are invisible
 * here by construction and cannot be reported from this side of the seam — only
 * from the UI, by comparing the count it collected against what it asked for.
 * What this function does cover is the door's own, much tighter, budget: 25 files
 * and 60s against the picker's 500, so a 60-file folder passes the picker's cap
 * untouched and is then truncated here, silently, unless the caller asks.
 */
export function ingestTruncationNotice(run: IngestRun): string | null {
  const cut = run.capacityRefusals.length;
  if (cut === 0) return null;
  const names = run.capacityRefusals.slice(0, 3).map((r) => `"${r.file}"`).join(", ");
  const more = cut > 3 ? ` and ${cut - 3} more` : "";
  const why = run.capacityRefusals[0]?.code === "run-deadline"
    ? `this run used up its ${Math.round(run.limits.runDeadlineMs / 1000)}s budget`
    : `this run takes ${run.limits.maxFilesPerRun} files at a time`;
  return `${run.files} file(s) were opened and ${cut} were turned away because ${why}: ${names}${more}. The drop was larger than one run — send the rest, and the ones listed here were not read at all.`;
}

export interface DroppedFile { name: string; bytes: Uint8Array }

export type IngestOutcome =
  | { ok: true; content: string; sourceName: string; receipt: IngestReceipt }
  | { ok: false; refusal: Refusal; receipt: IngestReceipt };

const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0];

/**
 * Does the NAME claim to be a container? The Office trio is deliberately NOT in
 * this set: a `.docx` whose bytes are not a zip is a plain-OLE file or a lie, and
 * both already carry their own refusal (the OLE one names the pre-2007 format).
 * What is here is the plain archive family, where nothing downstream would ever
 * notice that the container gate was skipped.
 */
function claimsAnArchive(name: string): boolean {
  return /\.(zip|jar|war|ear|apk|epub|cbz|egg|whl|kmz|7z|rar|tar|tgz|gz|bz2|xz|zst)$/i.test(name);
}

/**
 * Magic bytes decide, the extension only names. A file called `invoice.pdf`
 * that opens with `PK` is a zip wearing a label, and the label is not evidence.
 */
export function sniffFormat(name: string, bytes: Uint8Array): IngestFormat {
  const lower = name.toLowerCase();
  const starts = (sig: number[]) => sig.every((b, i) => bytes.length > i && bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46])) return "pdf";
  // §13 — a document that is an image. Sniffed by signature, like everything else here, so a
  // .png that is really a PDF is not read as a picture and a .pdf that is really a JPEG is
  // not handed to pdf.js to fail on. JPEG is recognised by its start-of-image marker; the
  // recogniser's own decoder is what reads it, and probe/scanDoor.spec.ts drives a real JPEG
  // rather than a renamed PNG.
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (starts([0xff, 0xd8, 0xff])) return "jpeg";
  // "PK\x03\x04" is a populated zip; "PK\x05\x06" is an empty one. Both are
  // containers, and an empty one is refused by the scan, not by this guess.
  if (starts([0x50, 0x4b, 0x03, 0x04]) || starts([0x50, 0x4b, 0x05, 0x06])) {
    if (/\.(docx|dotx)$/.test(lower)) return "docx";
    if (/\.(xlsx|xlsm)$/.test(lower)) return "xlsx";
    if (/\.(pptx|potx)$/.test(lower)) return "pptx";
    return "zip";
  }
  // The pre-2007 binary Office formats are OLE compound files: same extensions
  // people expect, a format none of the adopted readers speaks.
  if (OLE_MAGIC.every((b, i) => bytes[i] === b)) return "unknown";
  if (/\.(json|jsonl|ndjson)$/.test(lower)) return "json";
  if (/\.(md|markdown|txt|text|csv|tsv)$/.test(lower)) return "text";
  if (!looksLikeText(bytes)) return "unknown";
  return looksLikeJson(bytes) ? "json" : "text";
}

/** Printable-dominant, no NULs, valid UTF-8 — the definition text ingestion can use. */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let control = 0;
  for (const b of sample) if (b === 0 || (b < 9 && b !== 0) || (b > 13 && b < 32)) control += 1;
  if (control / sample.length > 0.02) return false;
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return false; }
  return true;
}

function looksLikeJson(bytes: Uint8Array): boolean {
  const s = new TextDecoder().decode(bytes.subarray(0, 64)).trimStart();
  return s.startsWith("{") || s.startsWith("[");
}

async function sha256HexBytes(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", bytes.slice(0));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * One dropped file, start to finish. `run` carries the per-run budget; a caller
 * with no run context gets a fresh one, so the caps cannot be skipped by
 * forgetting to pass it.
 */
export async function ingestFile(
  run: IngestRun | null,
  file: DroppedFile,
  limitsOverride: IngestLimits | null = null,
  now: () => number = Date.now,
  iso: () => string = () => new Date().toISOString(),
): Promise<IngestOutcome> {
  const started = now();
  const activeRun = run ?? createIngestRun(limitsOverride ?? INGEST_LIMITS, now);
  const limits = limitsOverride ?? activeRun.limits;
  const name = file.name.trim() || "dropped file";
  const sourceSha256 = await sha256HexBytes(file.bytes);
  let expanded = 0;
  let entries = 0;
  let membersRead = 0;

  const finish = (o: { ok: true; content: string; sourceName: string } | { ok: false; refusal: Refusal }, format: IngestFormat): IngestOutcome => {
    const receipt: IngestReceipt = {
      id: `ingest-${started.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      at: iso(),
      file: name,
      format,
      decision: o.ok ? "accepted" : "refused",
      code: o.ok ? null : o.refusal.code,
      words: o.ok ? `${o.content.length.toLocaleString()} characters of structure read on this machine.` : o.refusal.words,
      bytesIn: file.bytes.length,
      bytesExpanded: expanded,
      entries,
      membersRead,
      parsedChars: o.ok ? o.content.length : 0,
      elapsedMs: now() - started,
      sourceSha256,
      egressDuringParse: false,
    };
    activeRun.files += 1;
    activeRun.expandedBytes += expanded;
    activeRun.receipts.push(receipt);
    return o.ok ? { ok: true, content: o.content, sourceName: o.sourceName, receipt } : { ok: false, refusal: o.refusal, receipt };
  };

  const blocked = (code: RefusalCode, words: string, format: IngestFormat) => {
    /* Record the cut-off on the RUN as well as in the receipt. A receipt says
     * "this file was refused"; only the run can say "the drop was truncated",
     * which is a different fact and the one the human is owed. */
    if (CAPACITY_CODES.includes(code)) activeRun.capacityRefusals.push({ file: name, code, words });
    return finish({ ok: false, refusal: { code, words } }, format);
  };

  /* — the run budget first: a 200-file drop must not spend the door's time on
       file 26 after refusing 25. — */
  if (activeRun.files >= limits.maxFilesPerRun) {
    return blocked("too-many-files", `this drop already brought ${activeRun.files} files, past the ${limits.maxFilesPerRun} a single run takes. "${name}" was not opened.`, "unknown");
  }
  if (now() > activeRun.deadlineAt) {
    return blocked("run-deadline", `this run has used its ${Math.round(limits.runDeadlineMs / 1000)}s budget on ${activeRun.files} file(s). "${name}" was not opened — a drop that runs long is a drop to make in two.`, "unknown");
  }
  if (file.bytes.length > limits.maxFileBytes) {
    return blocked("too-large-compressed", `${name} is ${(file.bytes.length / 1e6).toFixed(1)} MB, above the ${(limits.maxFileBytes / 1e6).toFixed(0)} MB ceiling for one file. Nothing was opened, not even to look.`, "unknown");
  }

  /* A 0-byte file has no signature to sniff, so it fell through to
     `unrecognised-binary` and was told it is "not a format this door reads".
     That is false — the format may be perfectly supported and the file simply
     never finished downloading — and it sends the operator hunting for a format
     problem that does not exist. Name the actual condition. */
  if (file.bytes.length === 0) {
    return blocked("empty-document", `${name} is 0 bytes — there is nothing in it. This is an unfinished download or export, not an unsupported format. Save it again and drop that.`, "unknown");
  }

  const format = sniffFormat(name, file.bytes);
  if (format === "unknown") {
    const isOle = OLE_MAGIC.every((b, i) => file.bytes[i] === b);
    return blocked("unrecognised-binary", isOle
      ? `${name} is a pre-2007 binary Office file (an OLE compound document). SelfImpulse reads the XML-era formats — .docx, .xlsx, .pptx — not the legacy binary ones. Save it in the modern format and drop that.`
      : `${name} is not a format this door reads. It takes PDF, DOCX, XLSX/XLSM, PPTX, JSON, ZIP, Markdown and plain text — and says so rather than returning an empty document for it.`, "unknown");
  }
  /* A NAME that claims a container the bytes do not are refused, in words.
   *
   * This check used to be written `format === "zip" && !looksLikeZip(bytes)` — a
   * condition that cannot fire: `sniffFormat` only ever returns "zip" for bytes
   * that already opened as one, so the branch was unreachable. The result was
   * that `notes.zip` containing plain ASCII was read as PROSE and offered as a
   * document, which is the same class of lie as an empty acceptance: the receipt
   * says a container arrived and the content says a paragraph did. (A document
   * label that lies is deliberately NOT this error — the door's own rule is that
   * content decides and the extension only names, so ASCII named `fake.png` is
   * read as the ASCII it is. A CONTAINER label is different: it is the one claim
   * that decides whether the containment gate runs at all.) */
  if (claimsAnArchive(name) && !looksLikeZip(file.bytes)) {
    return blocked("not-an-archive", `${name} is named like a container (${name.split(".").pop()}) but does not open as one. SelfImpulse does not rename a file to make a format fit, and it does not read a container label off something that is not a container.`, format);
  }

  const fileDeadline = started + limits.perFileDeadlineMs;

  /* — containment, before any parser touches the bytes. Every zip-family file
       gets this, including the Office documents: a .docx IS a container. — */
  let containerMarkdown: string | null = null;
  if (looksLikeZip(file.bytes)) {
    const scan = scanContainer(file.bytes, limits);
    entries = scan.report.entries.length;
    expanded = scan.report.expandedBytes;
    if (!scan.ok) return blocked(scan.refusal.code, scan.refusal.words, format);
    if (format === "zip") {
      const extracted = await extractVetted(file.bytes, scan.report, limits, fileDeadline, now);
      if (!extracted.ok) return blocked(extracted.refusal.code, extracted.refusal.words, format);
      const parts: string[] = [`# Container: ${name}`];
      if (extracted.files.length === 0) {
        return blocked("empty-document", `${name} opened cleanly and contains nothing readable — ${scan.report.entries.length} entries, all directories or names this door declines. An empty container is not knowledge.`, format);
      }
      const skipped: string[] = [];
      for (const member of extracted.files) {
        if (now() > fileDeadline) return blocked("deadline", `${name} ran past the ${Math.round(limits.perFileDeadlineMs / 1000)}s budget for one file after ${membersRead} member(s). Half a container is not a container, so nothing was kept.`, format);
        const memberFormat = sniffFormat(member.name, member.bytes);
        if (memberFormat === "unknown") { skipped.push(`${member.name} — not a format this door reads`); continue; }
        if (memberFormat === "zip") { skipped.push(`${member.name} — an archive inside an archive (depth cap ${limits.maxDepth})`); continue; }
        const parsed = await read(memberFormat, member.bytes, fileDeadline, now, limits.maxParsedChars);
        if (!parsed.ok) {
          parts.push(`## Member: ${member.name}\n\n(refused: ${parsed.refusal.words})`);
          membersRead += 1;
          continue;
        }
        // Every member is untrusted for the same reason the single document is, and a
        // container is the easier place to hide something: 49 ordinary files and one that
        // carries instructions in an invisible channel. Same normalisation, same rule.
        const memberText = stripInvisible(parsed.markdown);
        const memberScan = scanForInjection(memberText.text);
        if (memberScan.tier === "critical") {
          // Refused BY NAME, like every other member this door will not read. A member that
          // is silently dropped would leave a container that reads as complete.
          parts.push(`## Member: ${member.name}\n\n(refused: ${memberScan.refusal ?? "carries text shaped like instructions aimed at the agent"} — read it yourself before bringing it in)`);
          membersRead += 1;
          continue;
        }
        if (memberText.zeroWidth + memberText.tags + memberText.bidi > 0) {
          parts.push(`## Member: ${member.name}\n\n> Removed ${memberText.zeroWidth + memberText.tags + memberText.bidi} invisible character(s).\n\n${memberText.text}`);
          membersRead += 1;
          continue;
        }
        parts.push(`## Member: ${member.name}\n\n${memberText.text}`);
        membersRead += 1;
        if (parts.join("\n").length > limits.maxParsedChars) {
          return blocked("parsed-too-large", `${name} holds more than ${Math.round(limits.maxParsedChars / 1000)}k characters of structure across its ${extracted.files.length} members (${membersRead} read so far). One proposal is one document — drop the member that decides something, or drop them one by one.`, format);
        }
      }
      /* A member that was not read is named. A container that quietly handed
         back the four files it liked out of fifty would read, downstream, as a
         complete document — the same class of lie as an empty acceptance. */
      if (skipped.length > 0) {
        parts.push(`## Members not read (${skipped.length})\n\n${skipped.slice(0, 20).map((s) => `- ${s}`).join("\n")}${skipped.length > 20 ? `\n- …and ${skipped.length - 20} more` : ""}`);
      }
      if (membersRead === 0) {
        return blocked("no-extractable-structure", `${name} has ${extracted.files.length} member(s) and none of them is a format this door reads. Nothing was proposed from it.`, format);
      }
      containerMarkdown = parts.join("\n\n").trim();
    }
  }

  /* — the single-document path. — */
  if (containerMarkdown === null) {
    const parsed = await read(format, file.bytes, fileDeadline, now, limits.maxParsedChars);
    if (!parsed.ok) return blocked(parsed.refusal.code, parsed.refusal.words, format);
    const notes = parsed.notes.filter((n) => n.length > 0);

    /* THE DOCUMENT IS UNTRUSTED, AND THAT IS NOW TRUE IN A NEW WAY.
     *
     * Everything reaching this line came off a disk, and since §13 some of it also came off
     * an IMAGE — a photographed page, a scanned contract — so its text was inferred by a
     * recogniser rather than read from a font. Either way it is content the owner did not
     * write, headed for a pipeline that will hand it to a model. That is the exact shape of
     * a prompt injection, and this door is where it gets stopped.
     *
     * Two things happen, and they are different in kind:
     *   1. INVISIBLE CHARACTERS ARE REMOVED. A document carrying instructions in a channel
     *      no human can see should be stored the way it READS, not the way it was written —
     *      otherwise the receipt and the stored text disagree about what the file says.
     *   2. THE CONTENT IS SCANNED, AND `critical` IS A REFUSAL. The guard's tiers are
     *      defined so that `critical` means content that names the engine's own tools, or
     *      hides an instruction behind an invisible channel, or trips several high-severity
     *      detectors at once. That is not a document with an odd turn of phrase; that is a
     *      document aimed at the agent. It is refused, in words, and the refusal says which
     *      detectors fired so the owner can open the file and judge for themselves.
     *
     * A scan that finds less than `critical` does NOT block. The owner still decides — the
     * guard is a seatbelt, not a wall — but the finding rides the receipt, so the decision
     * is made by someone who was told. */
    const stripped = stripInvisible(parsed.markdown);
    const scan = scanForInjection(stripped.text);
    if (scan.tier === "critical") {
      return blocked("injection-suspected", scan.refusal ?? `${name} carries text shaped like instructions aimed at the agent rather than content written for a person. It was refused, not distilled. Open the file and read it yourself before bringing it in.`, format);
    }
    if (stripped.zeroWidth + stripped.tags + stripped.bidi > 0) {
      notes.push(`removed ${stripped.zeroWidth + stripped.tags + stripped.bidi} invisible character(s) — the text is kept the way it reads.`);
    }
    notes.push(scanLine(scan, name));

    const content = [stripped.text, notes.length > 0 ? `\n> Read notes: ${notes.join("; ")}` : ""].join("");
    if (content.length > limits.maxParsedChars) {
      return blocked("parsed-too-large", `${name} yielded ${content.length.toLocaleString()} characters, above the ${limits.maxParsedChars.toLocaleString()} one proposal holds. The Docs door distils a chapter, not a library.`, format);
    }
    containerMarkdown = content;
  }

  return finish({ ok: true, content: containerMarkdown, sourceName: name }, format);
}

/** The format dispatch. Kept tiny and total: every IngestFormat is answered,
 *  so a format added to the union cannot silently fall through to nothing. */
async function read(
  format: IngestFormat,
  bytes: Uint8Array,
  deadlineAt: number,
  now: () => number,
  maxChars = INGEST_LIMITS.maxParsedChars,
): Promise<ParseResult> {
  switch (format) {
    case "pdf": return parsePdf(bytes, maxChars, deadlineAt, now);
    case "docx": return parseDocx(bytes, maxChars);
    case "xlsx": return parseXlsx(bytes, maxChars);
    case "pptx": return parsePptx(bytes, maxChars);
    case "json": return parseJson(bytes, maxChars);
    case "text": return readText(bytes, maxChars);
    // Both image formats go to one reader. The recogniser sniffs the bytes itself, so the
    // distinction this union draws for the receipt is not one the reader has to care about.
    case "png":
    case "jpeg": return parseImage(bytes, maxChars, deadlineAt, now);
    case "zip":
    case "unknown":
      return refuse("unrecognised-binary", `a "${format}" is not a document format this reader parses.`);
  }
}

/** Markdown and plain text need no parser — but they still get the same caps. */
function readText(bytes: Uint8Array, maxChars: number): { ok: true; markdown: string; notes: string[] } | { ok: false; refusal: Refusal } {
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch {
    return { ok: false, refusal: { code: "unrecognised-binary", words: "this is not valid UTF-8 text, so it is not something the door can read as prose." } };
  }
  if (text.length > maxChars) {
    return { ok: false, refusal: { code: "parsed-too-large", words: `${text.length.toLocaleString()} characters of text, above the ${maxChars.toLocaleString()} a single proposal holds. Distil a section.` } };
  }
  return { ok: true, markdown: text.trim(), notes: [] };
}

/**
 * A guard the UI cannot forget: the name rule lives with the bytes, not with a
 * file picker. Re-exported so the door and any future host path share one
 * definition of "safe to call this a path".
 */
export { unsafeEntryName };
export type { Refusal, RefusalCode, ArchiveLimits };
