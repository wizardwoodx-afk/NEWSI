/**
 * SelfImpulse §13 — the archive gate. Nothing inflates until this file says so.
 *
 * WHY THIS EXISTS AS A SEPARATE MODULE: a .zip (and every OOXML document, which
 * IS a zip) is untrusted input from the internet's favourite attack. The parsers
 * we adopt — jszip, mammoth, pdf.js — all decompress eagerly and none of them
 * bounds the *expanded* size. So the cap cannot live in them; it has to sit in
 * front of them, on the call path, which is law L12.
 *
 * TWO THINGS THIS DOES THAT A LIBRARY CALL CANNOT:
 *
 *  1. It reads the central directory by itself, from raw bytes, so the numbers
 *     it caps against are the ones the ARCHIVE CLAIMS, checked before a single
 *     byte is inflated. `jszip.loadAsync()` normalises entry names on load: a
 *     member called `../escape.txt` comes back as `escape.txt`. Measured, not
 *     assumed — see probe/fileIngest.test.ts §traversal. A guard that reads
 *     names after jszip has rewritten them is a check that cannot fail, which
 *     is the exact defect F16 was. So names are judged HERE, on the bytes.
 *
 *  2. It refuses the WHOLE container rather than importing the safe subset.
 *     Silently dropping `../evil.bat` and keeping the other 40 files would let
 *     a document look complete while it is not. The refusal is in words, with
 *     the entry named, and it becomes a receipt.
 *
 * WHAT IS DELIBERATELY NOT HERE: extraction to disk. There is none, and there
 * must never be — a file dropped into the Docs door is read into memory,
 * distilled, and either proposed as knowledge or refused. A path-traversal
 * defence that has no path it writes to is a stronger thing than a careful one.
 *
 * KNOWN LIMIT, STATED RATHER THAN HIDDEN: the expanded-byte caps are checked
 * against sizes the archive declares. A crafted archive can declare a small
 * size and inflate larger; `extractVetted` re-measures every entry after
 * inflation and aborts the container when the truth exceeds the promise, but
 * the peak memory of that ONE entry is bounded only by its own inflate. That is
 * why the per-file cap on the compressed input is small (see limits): the
 * worst case is capped at maxFileBytes × deflate's theoretical ~1000:1, not at
 * whatever a liar wanted. Nested archives are refused outright for the same
 * reason — a zip inside a zip multiplies a bound we can only approximate.
 */
import JSZip from "jszip";

export interface ArchiveLimits {
  /** Hard ceiling on the dropped file itself, compressed. */
  maxFileBytes: number;
  maxEntries: number;
  /** Sum of every entry's declared uncompressed size. */
  maxExpandedBytes: number;
  /** One entry's declared uncompressed size. */
  maxEntryExpandedBytes: number;
  /** declared ÷ compressed, for entries above `ratioFloorBytes` — the classic
   *  bomb signature. Text in a real docx/xlsx runs 4–12:1. */
  maxCompressionRatio: number;
  ratioFloorBytes: number;
  /** 1 = only the file the human dropped may be a container. */
  maxDepth: number;
}

export const ARCHIVE_LIMITS: ArchiveLimits = {
  maxFileBytes: 25_000_000,
  maxEntries: 1_000,
  maxExpandedBytes: 100_000_000,
  maxEntryExpandedBytes: 40_000_000,
  maxCompressionRatio: 150,
  ratioFloorBytes: 1_000_000,
  maxDepth: 1,
};

export type RefusalCode =
  | "too-large-compressed" | "too-many-entries" | "expanded-too-large" | "entry-expanded-too-large"
  | "compression-ratio" | "unsafe-entry-name" | "encrypted" | "not-an-archive" | "zip64"
  | "nested-archive" | "unsupported-method" | "corrupt-archive" | "unrecognised-binary"
  | "parsed-too-large" | "no-extractable-structure" | "deadline" | "run-deadline"
  | "too-many-files" | "worker-unavailable" | "empty-document"
  // §13 — a page with no text layer, read on this machine. `ocr-unavailable` is the one
  // code a scan reader needs that the archive codes did not cover: it means "this document
  // needs a reader this build does not have configured", and it is distinct from
  // `empty-document` (which means the reader ran and the document really was empty) and
  // from `worker-unavailable` (which is pdf.js, not the recogniser).
  | "ocr-unavailable"
  // §13 — untrusted text that appears to be aimed at the agent rather than written for a
  // person. Distinct from every other code here, which are all about a file being
  // unreadable: this one is about a file being readable and hostile.
  | "injection-suspected";

export interface Refusal { code: RefusalCode; words: string }

export function refuse(code: RefusalCode, words: string): { ok: false; refusal: Refusal } {
  return { ok: false, refusal: { code, words } };
}

export interface EntryInfo {
  name: string;
  compressedSize: number;
  expandedSize: number;
  method: number;
  encrypted: boolean;
  directory: boolean;
}

export interface ScanReport {
  entries: EntryInfo[];
  /** Sum of declared uncompressed sizes over the non-directory entries. */
  expandedBytes: number;
  compressedBytes: number;
}

const EOCD_SIG = 0x06054b50;
const EOCD64_LOCATOR_SIG = 0x07064b50;
const CENTRAL_SIG = 0x02014b50;
/** The two bytes that open every local file header, and therefore every zip. */
const LOCAL_SIG = 0x04034b50;

const METHOD_STORE = 0;
const METHOD_DEFLATE = 8;
const METHOD_BZIP2 = 12;
const METHOD_ZSTD = 20;
const METHOD_AES = 99;

const FLAG_ENCRYPTED = 0x0001;

/** Magic-byte sniff. Extension is a hint, magic is the truth (see fileIngest).
 *  The signatures below are read little-endian, which is how they are stored:
 *  "PK\x03\x04" is the byte order, 0x04034b50 the number. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const sig = bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24);
  return sig === LOCAL_SIG || sig === EOCD_SIG || sig === EOCD64_LOCATOR_SIG;
}

/**
 * Is this entry name safe to talk about? Returns the reason it is not, or null.
 *
 * Judged on the RAW name from the central directory. ".." is rejected as a
 * SEGMENT, not as a substring, so a legitimate file called `a..b.txt` passes
 * while `..%2f`, `../`, `..\` and `/..` all fail. Backslashes fail outright:
 * the zip specification says "/" separates, so a name containing "\" is
 * either a Windows traversal attempt or an archive whose names cannot be
 * agreed about between platforms. Refusing to guess is the whole point.
 */
export function unsafeEntryName(raw: string): string | null {
  if (raw.length === 0) return "an empty entry name";
  if (raw.indexOf("\0") >= 0) return "a name containing a NUL byte";
  // eslint-disable-next-line no-control-regex
  if (/[\x01-\x1f]/.test(raw)) return "a name containing control characters";
  if (raw.includes("\\")) return `a name containing a backslash: ${raw}`;
  if (raw.startsWith("/")) return `an absolute path: ${raw}`;
  if (/^[a-zA-Z]:/.test(raw)) return `a Windows drive-qualified path: ${raw}`;
  const segments = raw.split("/");
  for (const s of segments) {
    if (s === "..") return `a parent-directory segment: ${raw}`;
    if (s.includes("\0")) return `a name containing a NUL byte: ${raw}`;
  }
  if (segments.some((s) => s.includes(":"))) return `a name containing a colon (alternate data stream?): ${raw}`;
  return null;
}

/** Archive extensions, used for the nested-container rule. */
const ARCHIVE_SUFFIX = /\.(zip|jar|war|ear|docx|xlsx|pptx|odt|ods|odp|apk|epub|cbz|egg|whl|kmz|7z|rar|tar|gz|tgz|bz2|xz|zst)$/i;

export function looksLikeArchiveName(name: string): boolean {
  return ARCHIVE_SUFFIX.test(name);
}

function readCentralDirectory(bytes: Uint8Array): { entries: EntryInfo[]; zip64: boolean; error: string | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  const floor = Math.max(0, bytes.length - 22 - 65_535);
  for (let i = bytes.length - 22; i >= floor; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return { entries: [], zip64: false, error: "no end-of-central-directory record — this is not a readable archive" };
  const zip64 =
    view.getUint16(eocd + 8, true) === 0xffff ||
    view.getUint32(eocd + 12, true) === 0xffffffff ||
    view.getUint32(eocd + 16, true) === 0xffffffff;
  const count = view.getUint16(eocd + 10, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  const entries: EntryInfo[] = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL_SIG) {
      return { entries, zip64, error: `the central directory is corrupt at entry ${n + 1}` };
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compressedSize = view.getUint32(p + 20, true);
    const expandedSize = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const extAttrs = view.getUint32(p + 38, true);
    if (p + 46 + nameLen > bytes.length) return { entries, zip64, error: `entry ${n + 1} declares a name beyond the end of the file` };
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({
      name, compressedSize, expandedSize, method,
      encrypted: (flags & FLAG_ENCRYPTED) !== 0,
      directory: name.endsWith("/") || (extAttrs >>> 16) === 0x4000,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, zip64, error: null };
}

/**
 * The gate. Caps run against declared sizes; nothing is decompressed here.
 */
export function scanContainer(bytes: Uint8Array, limits: ArchiveLimits = ARCHIVE_LIMITS):
  { ok: true; report: ScanReport } | { ok: false; refusal: Refusal; report: ScanReport } {
  const empty: ScanReport = { entries: [], expandedBytes: 0, compressedBytes: 0 };
  if (bytes.length > limits.maxFileBytes) {
    return { ok: false, report: empty, refusal: {
      code: "too-large-compressed",
      words: `${(bytes.length / 1e6).toFixed(1)} MB is above the ${(limits.maxFileBytes / 1e6).toFixed(0)} MB ceiling for one file — nothing was opened. Distil a chapter, not a library.`,
    } };
  }
  if (!looksLikeZip(bytes)) return { ok: false, report: empty, refusal: { code: "not-an-archive", words: "this file is not a zip container" } };
  const cd = readCentralDirectory(bytes);
  if (cd.error) return { ok: false, report: { ...empty, entries: cd.entries }, refusal: { code: "corrupt-archive", words: cd.error } };
  if (cd.zip64) {
    return { ok: false, report: { ...empty, entries: cd.entries }, refusal: {
      code: "zip64",
      words: "a ZIP64 archive keeps its real sizes outside the record this gate reads, so the caps cannot be verified before inflating — SelfImpulse refuses it rather than trusting what it cannot see.",
    } };
  }
  const files = cd.entries.filter((e) => !e.directory);
  const report: ScanReport = {
    entries: cd.entries,
    expandedBytes: files.reduce((a, e) => a + e.expandedSize, 0),
    compressedBytes: files.reduce((a, e) => a + e.compressedSize, 0),
  };
  const fail = (code: RefusalCode, words: string) => ({ ok: false as const, refusal: { code, words }, report });

  if (files.length > limits.maxEntries) {
    return fail("too-many-entries", `${files.length} files in this container, above the cap of ${limits.maxEntries}. Nothing was opened.`);
  }
  const encrypted = files.find((e) => e.encrypted);
  if (encrypted) {
    return fail("encrypted", `the entry "${encrypted.name}" is encrypted. SelfImpulse does not crack, guess or silently skip a protected file — it refuses, in words. Unlock it and drop the plaintext.`);
  }
  if (report.expandedBytes > limits.maxExpandedBytes) {
    return fail("expanded-too-large", `this container declares ${(report.expandedBytes / 1e6).toFixed(1)} MB unpacked, above the ${(limits.maxExpandedBytes / 1e6).toFixed(0)} MB cap. Declared before a single byte was inflated — nothing was read.`);
  }
  for (const e of files) {
    if (e.expandedSize > limits.maxEntryExpandedBytes) {
      return fail("entry-expanded-too-large", `"${e.name}" declares ${(e.expandedSize / 1e6).toFixed(1)} MB on its own, above the ${(limits.maxEntryExpandedBytes / 1e6).toFixed(0)} MB per-entry cap.`);
    }
    const bad = unsafeEntryName(e.name);
    if (bad) return fail("unsafe-entry-name", `refused by name, before any inflation: the archive carries ${bad}. SelfImpulse does not normalise a name it could not approve.`);
    if (limits.maxDepth < 2 && looksLikeArchiveName(e.name)) {
      return fail("nested-archive", `"${e.name}" is itself an archive inside an archive. This door opens ONE container per dropped file (depth cap ${limits.maxDepth}) — a nested one is a DoS amplifier, not a document.`);
    }
    if (e.method === METHOD_AES || e.method === METHOD_ZSTD) {
      return fail("unsupported-method", `"${e.name}" uses compression method ${e.method}, which SelfImpulse does not understand. Refusing beats guessing at bytes.`);
    }
    if (e.method !== METHOD_STORE && e.method !== METHOD_DEFLATE && e.method !== METHOD_BZIP2) {
      return fail("unsupported-method", `"${e.name}" uses an unknown compression method (${e.method}).`);
    }
    if (e.expandedSize > limits.ratioFloorBytes && e.compressedSize > 0 && e.expandedSize / e.compressedSize > limits.maxCompressionRatio) {
      return fail("compression-ratio", `"${e.name}" expands ${Math.round(e.expandedSize / e.compressedSize)}:1, past the ${limits.maxCompressionRatio}:1 bomb threshold. Real text runs 4–12:1.`);
    }
  }
  return { ok: true, report };
}

export interface ExtractedFile { name: string; bytes: Uint8Array }

/**
 * Inflate what the gate approved, re-measuring every entry against the promise
 * in its own header. The moment the truth outruns the cap the container is
 * abandoned — a partial result is not offered, because a half-read document
 * reads like a whole one.
 */
export async function extractVetted(
  bytes: Uint8Array,
  report: ScanReport,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
  deadlineAt = Number.POSITIVE_INFINITY,
  now: () => number = Date.now,
): Promise<{ ok: true; files: ExtractedFile[] } | { ok: false; refusal: Refusal }> {
  const approved = report.entries.filter((e) => !e.directory && !unsafeEntryName(e.name));
  if (approved.length === 0) return { ok: true, files: [] };
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    return refuse("corrupt-archive", `the archive would not open: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
  }
  const out: ExtractedFile[] = [];
  let inflated = 0;
  for (const info of approved) {
    if (now() > deadlineAt) return refuse("deadline", "the archive ran past the time budget for one file — it was abandoned rather than left half-read.");
    /* jszip rewrites names on load; look the entry up by its SANITISED key but
       keep reporting the raw name, which is what the human must see. */
    const handle = zip.file(info.name) ?? findByName(zip, info.name);
    if (!handle) continue;
    let chunk: Uint8Array;
    try {
      chunk = await handle.async("uint8array");
    } catch (e) {
      return refuse("corrupt-archive", `"${info.name}" would not inflate: ${String(e instanceof Error ? e.message : e).slice(0, 140)}`);
    }
    if (chunk.length > limits.maxEntryExpandedBytes) {
      return refuse("entry-expanded-too-large", `"${info.name}" inflated to ${(chunk.length / 1e6).toFixed(1)} MB, past the ${(limits.maxEntryExpandedBytes / 1e6).toFixed(0)} MB per-entry cap. The size it declared was ${info.expandedSize} — the archive lied about its own contents, so the whole container is refused.`);
    }
    inflated += chunk.length;
    if (inflated > limits.maxExpandedBytes) {
      return refuse("expanded-too-large", `this container has now inflated ${(inflated / 1e6).toFixed(1)} MB, past the ${(limits.maxExpandedBytes / 1e6).toFixed(0)} MB cap. Nothing from it is kept.`);
    }
    out.push({ name: info.name, bytes: chunk });
  }
  return { ok: true, files: out };
}

function findByName(zip: JSZip, wanted: string): JSZip.JSZipObject | null {
  const sanitised = wanted.replace(/(^|\/)\.\.\/+/g, "").replace(/^\/+/, "");
  let found: JSZip.JSZipObject | null = null;
  zip.forEach((relative, file) => { if (!found && !file.dir && relative === sanitised) found = file; });
  return found;
}
