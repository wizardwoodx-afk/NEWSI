#!/usr/bin/env node
/**
 * §13 — vendor the OCR assets the BROWSER build needs, and nothing else.
 *
 * WHY THIS EXISTS. In Node the recogniser resolves its core and its worker from the
 * installed package, locally, with no lookup — so nothing has to be vendored and `npm ci`
 * is the whole story. In a browser or a desktop webview it does not: the engine's defaults
 * for the core Wasm, the worker script AND the language data are all remote
 * content-delivery locations, and a build that forgets them does not fail — it quietly
 * reaches out on first use. That is the single thing this product's document path must
 * never do, so the browser build gets local copies of all three, made here, at build time.
 *
 * THE LANGUAGE DATA IS THE ONE FILE WE DO NOT GET FROM node_modules. It is fetched ONCE,
 * here, with its SHA-256 pinned, and written into the tree. After this script has run the
 * app never fetches anything again — which is the point. A mismatch is a hard failure
 * rather than a warning: swapping the recogniser's model under a pinned hash is exactly
 * the kind of change that should stop a build.
 *
 * Usage:  node tools/vendor-ocr-assets.mjs
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
/*
 * WHERE THEY GO, AND WHY THERE IS ONLY ONE COPY. `public/` is the bundler's own asset
 * directory: every file in it is copied verbatim into the build output under its own name,
 * which is exactly what the recogniser's worker needs — it resolves its core by NAME at run
 * time, picking the build matching the machine's CPU features, so these files cannot be
 * content-hashed and must not be renamed.
 *
 * An earlier version wrote a second, byte-identical copy under `vendor/` to have a readable
 * source of truth. That is 12 MB of pure duplication in every release and it buys nothing:
 * this script IS the source of truth, and it regenerates `public/ocr/` from the installed
 * packages plus one hash-pinned download. One copy, on the path that ships. */
const PUBLIC_OCR = path.join(ROOT, "public", "ocr");
const PUBLIC_CORE = path.join(PUBLIC_OCR, "core");
const PUBLIC_DATA = path.join(PUBLIC_OCR, "tessdata");

/** The recogniser's core builds. The browser worker picks one at runtime by CPU feature. */
const CORE_FILES = [
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
];

/** Language pack: url + the hash this build is pinned to. */
const LANGS = [
  {
    code: "eng",
    url: "https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz",
    sha256: "ed350f3752f81ee8f38769edc14d92d997dababe23b565c59879372cc46a2468",
  },
];

function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }

let failed = false;
function fail(msg) { console.error(`  FAIL ${msg}`); failed = true; }
function ok(msg) { console.log(`  ok   ${msg}`); }

mkdirSync(PUBLIC_CORE, { recursive: true });
mkdirSync(PUBLIC_DATA, { recursive: true });

console.log("== the recogniser's core (from the installed package, never the network)");
for (const file of CORE_FILES) {
  const from = path.join(ROOT, "node_modules", "tesseract.js-core", file);
  if (!existsSync(from)) { fail(`${file} is not installed — run npm ci first`); continue; }
  copyFileSync(from, path.join(PUBLIC_CORE, file));
  ok(`${file} — ${(readFileSync(from).length / 1024 / 1024).toFixed(1)} MB`);
}
for (const lic of ["LICENSE"]) {
  const from = path.join(ROOT, "node_modules", "tesseract.js-core", lic);
  if (existsSync(from)) copyFileSync(from, path.join(PUBLIC_CORE, lic));
}

// The engine's own worker script. In a browser this too defaults to a remote location.
const worker = path.join(ROOT, "node_modules", "tesseract.js", "dist", "worker.min.js");
if (existsSync(worker)) {
  copyFileSync(worker, path.join(PUBLIC_OCR, "worker.min.js"));
  ok(`worker.min.js — ${(readFileSync(worker).length / 1024).toFixed(0)} kB`);
} else {
  fail("tesseract.js/dist/worker.min.js is not installed — the webview would fall back to a remote worker");
}

console.log("\n== the language packs (fetched once, here, pinned by hash)");
for (const lang of LANGS) {
  const shipped = path.join(PUBLIC_DATA, `${lang.code}.traineddata.gz`);
  const dest = shipped;
  if (existsSync(dest)) {
    const have = sha256(readFileSync(dest));
    if (have === lang.sha256) {
      copyFileSync(dest, shipped);
      ok(`${lang.code}.traineddata.gz already vendored, hash matches`);
      continue;
    }
    console.log(`  ..   ${lang.code} on disk does not match the pinned hash — re-fetching`);
  }
  try {
    const res = await fetch(lang.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = sha256(buf);
    if (got !== lang.sha256) { fail(`${lang.code}: hash ${got.slice(0, 16)}… does not match the pinned ${lang.sha256.slice(0, 16)}… — refusing to vendor it`); continue; }
    writeFileSync(dest, buf);
    copyFileSync(dest, shipped);
    ok(`${lang.code}.traineddata.gz — ${(buf.length / 1024 / 1024).toFixed(1)} MB, hash verified`);
  } catch (e) {
    fail(`${lang.code}: could not fetch (${String(e instanceof Error ? e.message : e).slice(0, 80)}). ` +
      `Nothing was written. Download it by hand to ${dest} if this build must be made offline — the hash is pinned above.`);
  }
}

console.log(failed
  ? "\nVENDORING FAILED — the browser build would have no local copies and would reach out. Fix the above."
  : "\nVendored. The app now has local copies of the core, the worker and the language data; it fetches nothing at run time.");
process.exit(failed ? 1 : 0);
