#!/usr/bin/env node
/**
 * V11.7.2 — offline verification runner. Requires ONLY Node.js: no npm install, no
 * network. Run from the extracted release tree:
 *
 *     node verify/run.mjs
 *
 * It executes every self-contained bundle in verify/suites/ (built by
 * tools/build-offline-verify.mjs from the same suite list `npm test` uses) with cwd set
 * to the tree root, and prints the same PASS/FAIL summary as the dev gate. This exists
 * because the 11.7.0 review environment could not `npm ci` offline — a shipped gate
 * should be reproducible by anyone with Node, anywhere, with zero install.
 *
 * offline-honesty patch (16.9.0): two bundles spawn tools/*.mjs that rebuild the engine
 * bundle via the esbuild devDependency. Without node_modules those tools now REFUSE IN
 * WORDS, and this runner honestly marks such bundles `SKIP (needs node_modules)` —
 * counted separately, never as passes, never as verification failures.
 *
 * SHARDING AND TIME BUDGETS (19.6.3). A reviewer whose execution window cannot fit the
 * whole pack (it is ~86s on a two-core box, and four suites are most of it) previously
 * had no way to reproduce the gate at all. Now the same gate can be completed in
 * bounded pieces, and the pieces are honest about being pieces:
 *
 *     node verify/run.mjs                      the whole gate, unchanged
 *     node verify/run.mjs --shard 1/4           quarter 1 of 4 (deterministic split)
 *     node verify/run.mjs --time-budget 30      run until 30s are nearly spent
 *     node verify/collect.mjs                   merge every shard, print the whole verdict
 *
 * A shard writes `verify/shards/shard-<i>-of-<n>.json`. `--time-budget` stops early and
 * exits with code 3 — INCOMPLETE, never 0 — so no CI can mistake a partial run for a
 * pass. Suites not reached are NAMED in the summary. The default invocation prints
 * exactly what it always printed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitesDir = path.join(root, "verify", "suites");
const allSuites = fs.readdirSync(suitesDir).filter((f) => f.endsWith(".mjs")).sort();

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};
const shardArg = flag("--shard");
const budgetSec = flag("--time-budget") === null ? null : Number(flag("--time-budget"));

/* A shard is a deterministic slice of the sorted suite list: shard i of n takes every
   suite whose index ≡ i-1 (mod n). Sorting first means two machines with the same tree
   shard identically, so a merged verdict is a verdict about the tree, not the machine. */
let shard = null;
if (shardArg) {
  const m = /^(\d+)\/(\d+)$/.exec(shardArg);
  if (!m) {
    console.error("--shard must look like i/n (e.g. --shard 1/4)");
    process.exit(2);
  }
  const index = Number(m[1]);
  const count = Number(m[2]);
  if (index < 1 || index > count || count < 1) {
    console.error(`--shard ${shardArg} is out of range: index must be 1..${count}`);
    process.exit(2);
  }
  shard = { index, count };
}
const suites = shard
  ? allSuites.filter((_, i) => i % shard.count === shard.index - 1)
  : allSuites;

let pass = 0;
let fail = 0;
let skippedNeedDeps = 0;
const failures = [];
const skipped = [];
// offline-honesty patch (16.9.0): an environment limitation is not a verification
// failure. A bundle whose tools refuse because esbuild/node_modules is absent is
// reported as SKIP, with the reason, and never laundered into a pass.
const NEEDS_DEPS = new RegExp([
  "REFUSED \\(needs node_modules\\)",              // the tools' honest preflight refusal
  "Cannot find package .esbuild",                  // ERR_MODULE_NOT_FOUND, any TAP quoting
  "no such file or directory, open .node_modules", // pinned-dep provenance reads (E4)
].join("|"));
// Performance (18.7.0): the sequential pass took ~2.5 min, which exceeded the
// 18.6.0 reviewer's execution window before the pack finished. Suites are
// independent, so they run in a bounded pool; output is buffered per suite and
// printed in deterministic sort order, so a PASS/FAIL is always attributable
// and two runs of the same tree print the same transcript.
const { execFile } = await import("node:child_process");
const os = await import("node:os");
const POOL = Math.max(2, Math.min(6, os.cpus().length));
const results = new Map();

async function runSuite(s) {
  try {
    const stdout = await new Promise((resolve, reject) => {
      const child = execFile(
        process.execPath,
        [path.join(suitesDir, s)],
        { cwd: root, timeout: 120_000, killSignal: "SIGKILL", maxBuffer: 256 * 1024 * 1024, encoding: "utf8" },
        (err, so) => (err ? reject(Object.assign(err, { stdout: so })) : resolve(so)),
      );
      void child;
    });
    results.set(s, { status: "pass", stdout });
  } catch (err) {
    const text = `${err && typeof err === "object" ? `${err.stdout || ""}${err.stderr || ""}` : ""}${err?.message || ""}`;
    if (NEEDS_DEPS.test(text)) results.set(s, { status: "skip", stdout: err?.stdout || "" });
    else results.set(s, { status: "fail", stdout: err && typeof err === "object" && "stdout" in err && typeof err.stdout === "string" ? err.stdout : "" });
  }
}

const started = Date.now();
const deadline = budgetSec === null ? null : started + budgetSec * 1000;
/* A suite already started is always allowed to finish — killing one mid-flight would
   turn a time limit into a false failure. The budget decides what is STARTED, never
   what is judged. */
const ran = new Set();
let cursor = 0;
await Promise.all(
  Array.from({ length: Math.min(POOL, suites.length) }, async () => {
    while (cursor < suites.length) {
      if (deadline !== null && Date.now() >= deadline) return;
      const next = suites[cursor++];
      ran.add(next);
      await runSuite(next);
    }
  }),
);
const elapsed = (Date.now() - started) / 1000;
const notRun = suites.filter((s) => !ran.has(s));

for (const s of suites) {
  const res = results.get(s);
  if (!res) continue; // never started: named in the summary, never counted
  if (res.status === "pass") {
    process.stdout.write(res.stdout);
    console.log(`PASS: ${s}\n`);
    pass++;
  } else if (res.status === "skip") {
    console.log(`SKIP (needs node_modules): ${s}\n`);
    process.stdout.write(res.stdout);
    skipped.push(s);
    skippedNeedDeps++;
  } else {
    console.log(`FAIL: ${s}\n`);
    process.stdout.write(res.stdout);
    failures.push(s);
    fail++;
  }
}

console.log("========================================");
const skipNote = skippedNeedDeps > 0 ? `, ${skippedNeedDeps} skipped (need node_modules — esbuild)` : "";
const partial = notRun.length > 0;
const scopeNote = shard && !partial ? ` [shard ${shard.index}/${shard.count} of ${allSuites.length}]` : "";
console.log(`OFFLINE VERIFY SUMMARY: ${pass} passed, ${fail} failed${skipNote}${partial ? `, ${notRun.length} not run` : ""}. (node ${process.version})${scopeNote}`);
console.log("========================================");
if (skipped.length > 0) {
  console.error("Skipped (environment, not a verification failure):", skipped);
}
if (failures.length > 0) {
  console.error("Failed suites:", failures);
}

/* The shard record. Written for an explicit --shard, and for a budgeted run that
   stopped early — a partial run is exactly the thing worth recording, so it can be
   merged later instead of repeated. */
const shardsDir = path.join(root, "verify", "shards");
const shouldRecord = shard !== null || partial;
if (shouldRecord && !process.argv.includes("--no-record")) {
  fs.mkdirSync(shardsDir, { recursive: true });
  const label = shard ? `shard-${shard.index}-of-${shard.count}` : `partial-${Date.now()}`;
  const record = {
    label, at: new Date().toISOString(), node: process.version, tree: [
      ["package.json version", (() => { try { return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version; } catch { return "unknown"; } })()],
    ][0][1],
    shard: shard ?? null,
    ran: [...ran].sort(), notRun: [...notRun].sort(),
    passed: results.size > 0 ? [...results].filter(([, r]) => r.status === "pass").map(([s]) => s).sort() : [],
    failed: failures, skipped, elapsedSec: Number(elapsed.toFixed(1)),
  };
  fs.writeFileSync(path.join(shardsDir, `${label}.json`), JSON.stringify(record, null, 2) + "\n");
  console.log(`shard record: verify/shards/${label}.json — merge with: node verify/collect.mjs`);
}

if (failures.length > 0) {
  process.exit(1);
}
if (partial) {
  console.error(`NOT VERIFIED: ${notRun.length} suite(s) were not reached inside the time budget.`);
  console.error("Continue with: node verify/run.mjs --shard k/n   then:  node verify/collect.mjs");
  /* Exit 3, never 0. A partial run that exits 0 is the exact failure this whole
     runner exists to prevent: a gate that says "passed" about suites it never ran. */
  process.exit(3);
}
