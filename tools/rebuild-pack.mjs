#!/usr/bin/env node
/**
 * rebuild-pack.mjs — the ONLY supported way to regenerate verify/.
 *
 * 19.8. Why this wrapper exists.
 *
 * `tools/build-offline-verify.mjs` stamps BUILD-INFO.txt with a generated
 * "N passed, 0 failed" line. That line is a CLAIM, and a build record that can
 * assert a green gate without ever having run one is worse than the hand-typed
 * counts it replaced: it would be machine-generated, machine-plausible, and
 * false. So the stamp is separated from the build:
 *
 *     1. run the full dev gate          -> if it is not green, STOP HERE
 *     2. build the offline pack         -> bundles + manifest
 *     3. run the offline pack           -> the zero-install gate, which is a
 *                                         different runner over different bytes
 *     4. only then stamp BUILD-INFO.txt
 *
 * A red gate at any step means nothing is stamped and the exit code is non-zero.
 * The counts can only ever describe a gate that actually passed.
 *
 *     node tools/rebuild-pack.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const node = process.execPath;

function run(label, file, args, opts = {}) {
  process.stdout.write(`\n==> ${label}\n`);
  const started = Date.now();
  let code = 0;
  let out = "";
  try {
    out = execFileSync(node, [file, ...args], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 30 * 60_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    out = (e.stdout ?? "") + (e.stderr ?? "");
    code = typeof e.status === "number" ? e.status : 1;
  }
  /* Keep the full log of every gate step. The runner filters to verdict lines,
     which is exactly wrong when a suite fails: the failing ASSERTION is in the
     lines the filter drops, and a flake that leaves no evidence cannot be
     root-caused — it can only be re-rolled. The log lands next to the pack. */
  try {
    fs.writeFileSync(path.join(ROOT, "verify", `last-${label.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.log`), out);
  } catch { /* a log that cannot be written must never fail the gate */ }
  // The gate is noisy; show the verdict lines and any failure, not the whole log.
  for (const line of out.split("\n")) {
    if (/ALL PROBES SUMMARY|Offline VERIFY SUMMARY|^FAIL|^Failed test suites|passed, \d+ failed/.test(line)) {
      process.stdout.write(`    ${line.trim()}\n`);
    }
  }
  const secs = ((Date.now() - started) / 1000).toFixed(1);
  process.stdout.write(`    (${secs}s, exit ${code})\n`);
  return { code, out };
}

// The order matters and is the whole point of this wrapper:
//
//   1. BUILD the pack first, which writes the COUNTS into BUILD-INFO.txt. Counts
//      are a fact about what was built, so they are safe to record before any gate
//      has run. This is what breaks the deadlock in the other direction: the
//      pack's own freshness gate checks the counts, and would otherwise fail
//      against a record that had never been regenerated.
//   2. run the dev gate
//   3. run the zero-install offline gate
//   4. only then record the PASS claim, which is a fact about a gate RESULT
//
// A red gate at any step means the pass claim is not written and the exit code is
// non-zero, so the record can never assert green over a red gate.
const built = run("1/4  build offline pack (writes the counts)", path.join(ROOT, "tools", "build-offline-verify.mjs"), [], { timeoutMs: 20 * 60_000 });
if (built.code !== 0) process.exit(built.code);

const dev = run("2/4  dev gate  (tools/run-all-probes.mjs)", path.join(ROOT, "tools", "run-all-probes.mjs"), []);
if (dev.code !== 0) {
  process.stderr.write("\nSTOP: the dev gate is red, so the PASS line was NOT written to BUILD-INFO.txt.\n");
  process.stderr.write("      Fix the failing suite first. A build record that claims green over a red gate\n");
  process.stderr.write("      is a false record, and this tool exists specifically to prevent one.\n");
  process.exit(dev.code);
}

const offline = run("3/4  offline gate  (verify/run.mjs, zero install)", path.join(ROOT, "verify", "run.mjs"), []);
if (offline.code !== 0) {
  process.stderr.write("\nSTOP: the offline gate is red, so the PASS line was NOT written to BUILD-INFO.txt.\n");
  process.exit(offline.code);
}

const { buildInfoCounts, stampGateResult } = await import(pathToFileURL(path.join(ROOT, "tools", "build-offline-verify.mjs")).href);
const actualBundles = fs.readdirSync(path.join(ROOT, "verify", "suites")).filter((f) => f.endsWith(".mjs") && !f.endsWith(".spec.mjs")).length;
const files = new Array(actualBundles).fill(0);
const { suites, bundles } = buildInfoCounts(files);
const wrote = stampGateResult(ROOT, suites, bundles);

const actualSuites = fs.readdirSync(path.join(ROOT, "probe")).filter((f) => (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) && !f.startsWith(".")).length;
if (suites !== actualSuites) {
  process.stderr.write(`\nSTOP: counted ${suites} suites but the tree holds ${actualSuites}.\n`);
  process.exit(1);
}

process.stdout.write("\n==> 4/4  the record now states\n");
process.stdout.write(`      ${suites} probe suites - ${suites} passed, 0 failed, ${bundles} self-contained bundles\n`);
process.stdout.write(`      written: ${wrote ? "yes" : "NO (BUILD-INFO.txt had no gate line to update)"}\n`);
if (!wrote) process.exit(1);
process.stdout.write("      and both gates exited 0 on this run.\n\n");
