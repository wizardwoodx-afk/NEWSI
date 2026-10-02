#!/usr/bin/env node
/**
 * SelfImpulse — reproducible drill benchmark (16.6.0).
 *
 * Customer-facing evidence: a machine-readable report of the full drill
 * catalog run through the REAL Mission Loop, with a single stable
 * overallDigest. The same discipline as the offline pack and the MCP
 * engine bundle: build with the project's own esbuild (JS API — no shell,
 * no .bin resolution, cross-platform), run the bundle, done.
 *
 *   node tools/drill-benchmark.mjs              → JSON on stdout
 *   node tools/drill-benchmark.mjs --out f.json → also writes f.json
 *
 * probe/drill.test.ts pins the CLI: it must run, emit the report schema,
 * carry the honest verdicts (guard passed / maths passed / impossible
 * failed), and its per-scenario attestations must match the in-process
 * drill attestations (cross-process reproducibility).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

// offline-honesty patch (16.9.0): the entry needs a build step, so without
// node_modules the tool REFUSES IN WORDS (a clean, greppable refusal) instead of
// dying with ERR_MODULE_NOT_FOUND — never faked.
//
// 19.6.3: it no longer has to refuse. tools/build-offline-verify.mjs compiles
// this entry into verify/specs/drill-benchmark.spec.mjs (sha256 in
// verify/MANIFEST.json), so a tree with no node_modules runs the pinned
// pre-compiled bundle and reaches a real verdict. The path taken is announced
// on stderr; the refusal below stays for the case where neither path exists.
const require = createRequire(import.meta.url);
let buildSync = null;
try {
  ({ buildSync } = require("esbuild"));
} catch {
  buildSync = null;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "tools", "drill-benchmark.entry.ts");
const precompiled = path.join(root, "verify", "specs", "drill-benchmark.spec.mjs");

let tmp = null;
let out = precompiled;
try {
  if (buildSync) {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "si-drill-bench-"));
    out = path.join(tmp, "drill-benchmark.mjs");
    buildSync({
      entryPoints: [entry],
      bundle: true,
      platform: "node",
      format: "esm",
      /* 17.1.3: bundle npm deps (zod etc.) inline so the temp bundle runs
       * standalone out of /tmp without NODE_PATH. Native node built-ins stay
       * external via platform:"node". */
      packages: "bundle",
      outfile: out,
      logLevel: "error",
    });
  } else if (fs.existsSync(precompiled)) {
    console.error(
      "drill benchmark: esbuild is unavailable — running the pre-compiled verify/specs/drill-benchmark.spec.mjs (sha256 pinned in verify/MANIFEST.json)"
    );
  } else {
    console.error(
      "REFUSED (needs node_modules): this tool rebuilds the engine bundle with the esbuild devDependency, which is not installed here, and this tree ships no pre-compiled copy of the benchmark. Run `npm ci` first, then re-run. Refused in words, never faked."
    );
    process.exit(2);
  }
  const passArgs = process.argv.slice(2);
  const stdout = execFileSync(process.execPath, [out, ...passArgs], { cwd: root, encoding: "utf8" });
  process.stdout.write(stdout);
} finally {
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
}
