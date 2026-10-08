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
 *
 * WHY A SUITE NOW PRINTS ITS EXIT CONDITION (19.7.15). For several releases this runner
 * printed `FAIL: <suite>` and nothing else: no exit code, no signal, no wall-clock, and
 * stderr was discarded outright. An intermittent failure was therefore undiagnosable,
 * and the wrong cause was written down — the timeout comment below blamed pool
 * contention for a2aBridge.test.mjs flipping between 46/46 and 45/46. It did not.
 * Measured, the mechanism is a 4-bit id collision inside that suite:
 *
 *   src/mission/a2aBridge.ts:184  builds a seat id as
 *     `a2a-${teammate.id.slice(0,8)}-${uid("seat").slice(0,6)}`
 *   and uid() returns `seat-<csprng token>`, so slice(0,6) keeps the five literal
 *   characters "seat-" plus ONE hex character. That is 16 possible seat ids: 4 bits.
 *
 *   src/mission/collaboration.ts:78 turns the seat id into a branch
 *   (`vh/<missionSlug>/<seatId>`) and into the worktree directory. The suite runs the
 *   bridge more than once against ONE repo with ONE teammate, and
 *   `git worktree remove --force` removes the worktree directory but NOT the branch it
 *   created. The second `git worktree add -b <same name>` therefore fails with
 *   `fatal: a branch named ... already exists`, teamExecutor.ts records the seat as
 *   failed ("its worktree could not be created"), the run goes `blocked`, and the
 *   suite fails.
 *
 *   Probability per run: 1/16 = 6.25%, independent of machine load. That is the whole
 *   "identical trees, different results" mystery: it is a 1-in-16 dice roll, not a
 *   race. Nothing in this runner can fix it — the defect is in the seat id, and it
 *   belongs to whoever owns src/. It is recorded here so the next person starts from
 *   the measurement instead of re-deriving it.
 *
 * What this runner DOES own, and now does:
 *   · stderr is captured and printed, so a suite that dies on stderr is not silent.
 *   · every FAIL names its exit code, signal, and wall-clock, and says KILLED when the
 *     budget actually ran out — so a timeout can never again be confused with a
 *     regression.
 *   · `--diagnose` prints per-suite durations and exit conditions.
 *   · `--pool N` makes the width explicit, so contention can be tested rather than
 *     asserted.
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
/* --pool N overrides the width for diagnosis. The default is chosen from the
   machine, which is correct for a developer box and wrong for a shared CI box
   that is already running four builds; being able to state the width is what
   makes contention reproducible instead of folklore. */
const poolArg = flag("--pool");
const diagnose = argv.includes("--diagnose");

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
const results = new Map();

/* Per-suite wall-clock budget. Matches the dev gate's own limit
   (tools/run-all-probes.mjs, suiteTimeoutMs) so a suite the sequential gate
   finishes in 9s is never SIGKILLed here for being slow in a pool. */
const SUITE_TIMEOUT_MS = (() => {
  const n = Number(process.env.HANDLE_PROBE_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 300_000;
})();

/* Pool width. Six, capped by the core count — UNCHANGED, and deliberately so.
 *
 * This number was briefly narrowed to 2 on Windows on the theory that memory was
 * the constraint. It is not, and the measurements say so: six concurrent bundles
 * peak at ~400 MB combined working set on a 13.8 GB box, the slowest suite in the
 * pack runs 96 s against a 300 s budget, and no suite has ever been killed here.
 * Narrowing it would have made the shipped gate roughly three times slower on an
 * unproven theory. `--pool N` exists so that claim can be tested instead of
 * asserted; it is how the 19.7.x flake was pinned down. */
const POOL = (() => {
  const n = Number(poolArg);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return Math.max(2, Math.min(6, os.cpus().length));
})();

async function runSuite(s) {
  const t0 = Date.now();
  /* Every suite's exit condition is recorded, not just its verdict. A gate that
     prints FAIL without saying WHY it failed cannot be debugged and cannot be
     trusted: "the suite failed" and "the pool ran it out of budget" are
     different bugs with different fixes, and until the runner distinguishes
     them every intermittent failure looks like a regression. */
  let meta = { ms: 0, code: null, signal: null, killed: false };
  try {
    const stdout = await new Promise((resolve, reject) => {
      execFile(
        process.execPath,
        [path.join(suitesDir, s)],
        {
          cwd: root,
          /* 300s, matching the dev gate's own limit (tools/run-all-probes.mjs,
             suiteTimeoutMs). A time limit is a budget, not a verdict.

             The earlier version of this comment blamed the pool for the
             a2aBridge.test.mjs flake — "SIGKILLed at 120s purely because five
             others were running beside it". That was measured and it is WRONG.
             a2aBridge finishes in 9s solo and 15-18s in a pool of six, against
             a 300s budget: it was never near a timeout, and no suite in this
             pack has ever been killed here. The real cause is a 4-bit id
             collision inside the suite — see the note at the top of this file.
             The wrong diagnosis cost the next person a long time, so it is
             recorded here rather than quietly deleted. */
          timeout: SUITE_TIMEOUT_MS,
          killSignal: "SIGKILL",
          maxBuffer: 256 * 1024 * 1024,
          encoding: "utf8",
        },
        (err, so, se) => {
          if (err) {
            err.stdout = so;
            /* stderr was being thrown away. A suite that dies on an uncaught
               exception, a native abort or a stack overflow reports there and
               nowhere else, so the runner was printing FAIL followed by nothing
               at all — an unattributable failure. */
            err.stderr = se;
            reject(err);
          } else resolve(so);
        },
      );
    });
    meta = { ms: Date.now() - t0, code: 0, signal: null, killed: false };
    results.set(s, { status: "pass", stdout, ...meta });
  } catch (err) {
    const so = err && typeof err === "object" && typeof err.stdout === "string" ? err.stdout : "";
    const se = err && typeof err === "object" && typeof err.stderr === "string" ? err.stderr : "";
    meta = {
      ms: Date.now() - t0,
      code: typeof err?.code === "number" ? err.code : null,
      signal: err?.signal ?? null,
      killed: err?.killed === true || err?.signal === "SIGKILL",
    };
    const text = `${so}${se}${err?.message || ""}`;
    if (NEEDS_DEPS.test(text)) results.set(s, { status: "skip", stdout: so, ...meta });
    else results.set(s, { status: "fail", stdout: so, stderr: se, ...meta });
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
    /* Name the exit condition. "FAIL: x.test.mjs" with no reason is the thing
       that made this gate undebuggable: a killed suite and an asserting suite
       print the same line, so an intermittent failure could be neither
       reproduced nor attributed. */
    const why = res.killed
      ? `KILLED after ${(res.ms / 1000).toFixed(1)}s (exit ${res.code}, signal ${res.signal}) — budget was ${(SUITE_TIMEOUT_MS / 1000).toFixed(0)}s`
      : `exit ${res.code}${res.signal ? ` signal ${res.signal}` : ""} after ${(res.ms / 1000).toFixed(1)}s`;
    console.log(`FAIL: ${s} — ${why}\n`);
    process.stdout.write(res.stdout);
    /* A suite that dies on stderr without saying anything on stdout would
       otherwise print FAIL followed by silence. */
    if (res.stderr) process.stderr.write(res.stderr);
    failures.push(`${s} (${why})`);
    fail++;
  }
}

console.log("========================================");
if (diagnose) {
  /* Per-suite cost and exit condition. This is the instrumentation the 19.6.x
     flake needed and did not have: without durations and exit codes, "FAILED"
     was the only fact available, so a memory-starved kill and an assertion
     failure were indistinguishable. */
  const rows = suites
    .filter((s) => results.has(s))
    .map((s) => ({ suite: s, ...results.get(s) }))
    .sort((a, b) => b.ms - a.ms);
  const slowest = rows.slice(0, 12);
  console.log(`DIAGNOSE: pool=${POOL} budget=${(SUITE_TIMEOUT_MS / 1000).toFixed(0)}s elapsed=${elapsed.toFixed(1)}s suites=${results.size}`);
  for (const r of slowest) {
    console.log(`DIAGNOSE:   ${(r.ms / 1000).toFixed(1).padStart(7)}s  exit=${r.code}${r.signal ? `/${r.signal}` : ""}  ${r.status.padEnd(5)} ${r.suite}`);
  }
  const killed = rows.filter((r) => r.killed);
  if (killed.length > 0) console.log(`DIAGNOSE:   KILLED: ${killed.map((r) => r.suite).join(", ")}`);
}
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
