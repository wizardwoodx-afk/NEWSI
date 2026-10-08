/**
 * Real artefacts, not fixtures — pushes files that actually exist on this machine
 * through the same door the Docs screen uses, plus a ZIP assembled from real repo
 * files. Where the rest of the suite proves the parsers with authored bytes, this
 * proves the door with messy, large, producer-made ones.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { configurePdfWorker } from "../src/mission/documentParsers";
import { createIngestRun, ingestFile, INGEST_LIMITS } from "../src/mission/fileIngest";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
configurePdfWorker(pathToFileURL(path.resolve(ROOT, "vendor", "pdfjs", "pdf.worker.min.mjs")).href);

const memStore = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (memStore.has(k) ? memStore.get(k)! : null),
  setItem: (k: string, v: string) => void memStore.set(k, String(v)),
  removeItem: (k: string) => void memStore.delete(k),
  clear: () => memStore.clear(),
  key: (i: number) => [...memStore.keys()][i] ?? null,
  get length() { return memStore.size; },
} as Storage;

let passed = 0;
let failed = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const words = (r: Awaited<ReturnType<typeof ingestFile>>) =>
  r.ok ? r.content.slice(0, 160) : r.refusal.words;

async function file(name: string, rel: string) {
  return { name, bytes: new Uint8Array(fs.readFileSync(path.join(ROOT, rel))) };
}

async function main(): Promise<void> {
  section("0. what is actually on this machine");
  const real = ["demo/Synthetic-Industrial-FY26-RAW.xlsx", "demo/Synthetic-Industrial-FY26-CLASSIFIED.xlsx",
    "docs/legal/THIRD-PARTY-NOTICES.md", "public/ocr/tessdata/eng.traineddata"];
  const present = real.filter((r) => fs.existsSync(path.join(ROOT, r)));
  ok(`found ${present.length}/${real.length} real artefacts to feed the door`, present.length >= 2, present.join(", "));

  section("1. a real 2.8 MB workbook from a spreadsheet producer");
  const raw = await ingestFile(createIngestRun(INGEST_LIMITS), await file("Synthetic-Industrial-FY26-RAW.xlsx", "demo/Synthetic-Industrial-FY26-RAW.xlsx"));
  ok("the real workbook ingests", raw.ok === true, words(raw));
  ok("…and carries named sheets, not a blob", raw.ok && /## Sheet: \S/.test(raw.content), raw.ok ? "" : words(raw));
  ok("…and reports the columns it found", raw.ok && /Columns \(\d+\):/.test(raw.content), raw.ok ? "" : words(raw));

  section("2. the 4.3 MB classified workbook");
  const cls = await ingestFile(createIngestRun(INGEST_LIMITS), await file("Synthetic-Industrial-FY26-CLASSIFIED.xlsx", "demo/Synthetic-Industrial-FY26-CLASSIFIED.xlsx"));
  ok("the larger workbook ingests too", cls.ok === true, words(cls));
  ok("…and the char cap is stated rather than silently truncating", cls.ok && cls.content.length <= INGEST_LIMITS.maxParsedChars, cls.ok ? `${cls.content.length} chars` : "");

  section("3. a real ZIP assembled from real repo files");
  const zip = new JSZip();
  zip.file("README.md", fs.readFileSync(path.join(ROOT, "docs/legal/THIRD-PARTY-NOTICES.md"), "utf8"));
  zip.file("notes/lead-times.csv", "part,lead_days,vendor\nA-100,12,Northline\nB-77,5,Kestrel\n");
  zip.file("notes/deep/deep2/policy.md", "# Recourse\n\nNever check a grant after the gate has been consumed.\n");
  const zipBytes = new Uint8Array(await zip.generateAsync({ type: "uint8array" }));
  const zin = await ingestFile(createIngestRun(INGEST_LIMITS), { name: "vendor-pack.zip", bytes: zipBytes });
  ok("the zip expands and ingests", zin.ok === true, words(zin));
  ok("…and a file from the nested folder reaches the markdown", zin.ok && /Never check a grant/.test(zin.content), zin.ok ? "" : words(zin));
  ok("…and the CSV rows survive as content", zin.ok && /A-100/.test(zin.content) && /Kestrel/.test(zin.content), zin.ok ? "" : words(zin));

  section("4. a second run of the same bytes is stable");
  const again = await ingestFile(createIngestRun(INGEST_LIMITS), await file("Synthetic-Industrial-FY26-RAW.xlsx", "demo/Synthetic-Industrial-FY26-RAW.xlsx"));
  ok("identical bytes, identical markdown", raw.ok && again.ok && raw.content === again.content);

  section("5. a pre-2007 file is refused IN WORDS, not by crashing");
  const ole = await ingestFile(createIngestRun(INGEST_LIMITS), { name: "legacy.doc", bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]) });
  ok("the OLE header is recognised and refused politely", ole.ok === false && /modern format|\.docx/.test(ole.refusal.words), ole.ok ? "it accepted a fake .doc" : ole.refusal.words);

  section("6. the operator's own documents, from the real Downloads folder");
  const HOME = "D:/edge  downloads/";
  const realPdf = HOME + "K.S.SreeHarshen Resume.pdf";
  const emptyPdf = HOME + "K.S.SreeHarshen.Resume.pdf";
  const guide = HOME + "00_Start_Here.pdf";
  for (const [label, abs] of [["the real resume PDF", realPdf], ["a guide PDF", guide]] as const) {
    if (!fs.existsSync(abs)) { ok(`${label} is present`, false, `missing: ${abs}`); continue; }
    const r = await ingestFile(createIngestRun(INGEST_LIMITS), { name: path.basename(abs), bytes: new Uint8Array(fs.readFileSync(abs)) });
    ok(`${label} (${fs.statSync(abs).size.toLocaleString()} bytes) ingests`, r.ok === true, words(r));
    if (r.ok) ok(`…and produced real prose, not a stub`, r.content.length > 200, `${r.content.length} chars`);
  }
  if (fs.existsSync(emptyPdf)) {
    const e = await ingestFile(createIngestRun(INGEST_LIMITS), { name: path.basename(emptyPdf), bytes: new Uint8Array(fs.readFileSync(emptyPdf)) });
    ok("the 0-byte PDF is refused", e.ok === false, words(e));
    ok("…and the refusal names the emptiness, not the format", e.ok === false && /0 bytes/.test(e.refusal.words) && !/not a format/.test(e.refusal.words), e.ok ? "" : e.refusal.words);
  }

  console.log(`\n${"=".repeat(40)}\nREAL-ARTEFACT DOOR: ${passed} passed, ${failed} failed.\n${"=".repeat(40)}`);
  if (failed > 0) process.exitCode = 1;
}

void main();
