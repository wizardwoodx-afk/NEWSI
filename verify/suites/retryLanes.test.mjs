import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/retryLanes.test.ts
import fs from "node:fs";
import path from "node:path";

// src/mission/retryLanes.ts
var NON_FAILURE_LANES = ["awaiting-human", "busy", "continuation"];
function isNonFailureLane(lane) {
  return NON_FAILURE_LANES.includes(lane);
}
var RETRY_ACCOUNTING_FIELD = "siRetry";
function count(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
var EMPTY_RETRY_ACCOUNTING = {
  format: "si-retry-accounting/1",
  failureRetries: 0,
  continuations: 0,
  humanWaits: 0,
  busyWaits: 0,
  lastLane: "continuation"
};
function savedRetryAccounting(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return null;
  const block = state[RETRY_ACCOUNTING_FIELD];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const b = block;
  if (b.format !== "si-retry-accounting/1") return null;
  const failureRetries = count(b.failureRetries);
  const continuations = count(b.continuations);
  const humanWaits = count(b.humanWaits);
  const busyWaits = count(b.busyWaits);
  if (failureRetries === null || continuations === null || humanWaits === null || busyWaits === null) return null;
  const lanes = ["failure", "awaiting-human", "busy", "continuation"];
  const lastLane = lanes.includes(b.lastLane) ? b.lastLane : "failure";
  return { format: "si-retry-accounting/1", failureRetries, continuations, humanWaits, busyWaits, lastLane };
}
function laneOfLabel(label) {
  const l = (label ?? "").toLowerCase();
  if (/awaiting[-_ ]human|human approval|approval gate|awaiting your|at the gate|decision expired|waiting on a human/.test(l)) return "awaiting-human";
  if (/busy|rate[-_ ]limit|\b429\b|lane is full|dispatch lane|pool wait|resource exhausted|deadline/.test(l)) return "busy";
  if (/wave settled|capability redeemed|after planning|after reorganization|resuming|resumed|rollback point|decision granted|settled a (?:new|fresh) budget/.test(l)) return "continuation";
  return "failure";
}
function historicalFailureRetries(entries) {
  return entries.reduce((n, e) => laneOfLabel(e.label) === "failure" ? n + 1 : n, 0);
}
function advanceRetryAccounting(prior, lane) {
  const next = {
    format: "si-retry-accounting/1",
    failureRetries: prior.failureRetries,
    continuations: prior.continuations,
    humanWaits: prior.humanWaits,
    busyWaits: prior.busyWaits,
    lastLane: lane
  };
  if (lane === "failure") next.failureRetries = prior.failureRetries + 1;
  else if (lane === "awaiting-human") next.humanWaits = prior.humanWaits + 1;
  else if (lane === "busy") next.busyWaits = prior.busyWaits + 1;
  else next.continuations = prior.continuations + 1;
  return next;
}
function foldRetryAccounting(entries) {
  const last = entries[entries.length - 1];
  const saved = last ? savedRetryAccounting(last.state) : null;
  const historical = historicalFailureRetries(entries);
  if (!saved) {
    return {
      format: "si-retry-accounting/1",
      failureRetries: historical,
      continuations: entries.reduce((n, e) => laneOfLabel(e.label) === "continuation" ? n + 1 : n, 0),
      humanWaits: entries.reduce((n, e) => laneOfLabel(e.label) === "awaiting-human" ? n + 1 : n, 0),
      busyWaits: entries.reduce((n, e) => laneOfLabel(e.label) === "busy" ? n + 1 : n, 0),
      lastLane: last ? laneOfLabel(last.label) : "continuation"
    };
  }
  return { ...saved, failureRetries: Math.max(saved.failureRetries, historical) };
}
function stateWithRetryAccounting(state, accounting) {
  if (state !== null && typeof state === "object" && !Array.isArray(state)) {
    return { ...state, [RETRY_ACCOUNTING_FIELD]: accounting };
  }
  return { payload: state ?? null, [RETRY_ACCOUNTING_FIELD]: accounting };
}
function extendApprovalWaitDeadline(input) {
  if (input.lane === "awaiting-human" || input.lane === "busy") {
    return input.waitStartedAt === null ? input.currentDeadlineMs : Math.max(input.currentDeadlineMs, input.waitStartedAt + input.preparationWaitMs);
  }
  return input.waitStartedAt === null ? input.currentDeadlineMs : Math.max(input.currentDeadlineMs, input.waitStartedAt + input.executionWaitMs);
}
function waitExpired(nowMs, deadlineMs) {
  return nowMs > deadlineMs;
}

// probe/retryLanes.test.ts
var ROOT = process.env.SI_ROOT ?? path.resolve(import.meta.dirname, "..");
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function section(name) {
  console.log(`
== ${name}`);
}
var GATE_LABELS = [
  "awaiting-human",
  "awaiting-human (approval gate)",
  "Waiting on a human approval gate",
  "decision expired"
];
var BUSY_LABELS = ["provider rate-limit 429", "dispatch lane is full", "mission deadline reached"];
var CONTINUATION_LABELS = ["wave settled", "resuming run chain", "rollback point after approval", "decision granted"];
var FAILURE_LABELS = ["provider stream dropped mid-answer", "tool raised: fs_read ENOENT", ""];
function main() {
  section("1. laneOfLabel reads the labels this product emits");
  for (const l of GATE_LABELS) ok(`gate: \u201C${l}\u201D \u2192 awaiting-human`, laneOfLabel(l) === "awaiting-human", laneOfLabel(l));
  for (const l of BUSY_LABELS) ok(`wait: \u201C${l}\u201D \u2192 busy`, laneOfLabel(l) === "busy", laneOfLabel(l));
  for (const l of CONTINUATION_LABELS) ok(`advance: \u201C${l}\u201D \u2192 continuation`, laneOfLabel(l) === "continuation", laneOfLabel(l));
  for (const l of FAILURE_LABELS) ok(`failure: \u201C${l || "(empty)"}\u201D \u2192 failure`, laneOfLabel(l) === "failure", laneOfLabel(l));
  ok("classification is case-independent", laneOfLabel("AWAITING-HUMAN") === laneOfLabel("awaiting-human"));
  ok("an undefined label cannot escape as a non-failure", laneOfLabel(void 0) === "failure");
  section("2. the conservative default is the whole safety property");
  ok("an unrecognised label is charged, not waved through", laneOfLabel("something happened that nobody predicted") === "failure");
  ok(
    "the three non-failure lanes are exactly the stated set",
    NON_FAILURE_LANES.join(",") === "awaiting-human,busy,continuation",
    NON_FAILURE_LANES.join(",")
  );
  ok(
    "a non-failure lane is never a failure lane",
    NON_FAILURE_LANES.every(isNonFailureLane) && !isNonFailureLane("failure")
  );
  section("3. only the failure lane moves the failure budget");
  let acc = EMPTY_RETRY_ACCOUNTING;
  const before = acc.failureRetries;
  for (const lane of ["awaiting-human", "busy", "continuation", "awaiting-human", "busy"]) {
    acc = advanceRetryAccounting(acc, lane);
  }
  ok("five waits leave the failure count exactly where it was", acc.failureRetries === before, `${acc.failureRetries}`);
  ok("human waits counted separately", acc.humanWaits === 2, `${acc.humanWaits}`);
  ok("busy waits counted separately", acc.busyWaits === 2, `${acc.busyWaits}`);
  ok("continuations counted separately", acc.continuations === 1, `${acc.continuations}`);
  ok("the last lane is remembered", acc.lastLane === "busy");
  acc = advanceRetryAccounting(acc, "failure");
  ok("one real failure moves it by one", acc.failureRetries === 1, `${acc.failureRetries}`);
  ok("the waits were not re-charged by the failure", acc.humanWaits === 2 && acc.busyWaits === 2);
  ok(
    "advance never mutates the accounting it was given",
    EMPTY_RETRY_ACCOUNTING.failureRetries === 0 && EMPTY_RETRY_ACCOUNTING.humanWaits === 0
  );
  section("4. a chain that predates the module is read conservatively");
  const legacy = [
    { label: "awaiting-human (approval gate)" },
    { label: "decision granted" },
    { label: "awaiting-human (approval gate)" },
    { label: "provider stream dropped mid-answer" },
    { label: "awaiting-human (approval gate)" },
    { label: "dispatch lane is full" },
    { label: "awaiting-human (approval gate)" }
  ];
  ok("historical count is not the chain length", historicalFailureRetries(legacy) !== legacy.length);
  ok("one failure among four gate pauses reads as one", historicalFailureRetries(legacy) === 1, `${historicalFailureRetries(legacy)}`);
  ok("an empty chain owes nothing", historicalFailureRetries([]) === 0);
  section("5. a torn journal cannot flatter a run");
  ok("absent state is not an accounting", savedRetryAccounting(null) === null);
  ok("a non-object is not an accounting", savedRetryAccounting(7) === null);
  ok("an array is not an accounting", savedRetryAccounting([]) === null);
  ok(
    "a block without the format tag is refused",
    savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { failureRetries: 0 } }) === null
  );
  ok(
    "a future format tag is not silently upgraded",
    savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/2", failureRetries: 0, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "busy" } }) === null
  );
  for (const bad of [-1, 1.5, "3", null, void 0, Number.NaN, Infinity]) {
    ok(
      `a ${String(bad)} counter is refused`,
      savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: bad, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "busy" } }) === null
    );
  }
  ok(
    "an unknown lastLane falls back to the harsher lane",
    savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: 2, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "sleeping" } })?.lastLane === "failure"
  );
  section("6. folding, and the shape of a checkpoint's state");
  const folded = foldRetryAccounting(legacy);
  ok("a chain with no block folds to the historical reading", folded.failureRetries === 1, `${folded.failureRetries}`);
  ok(
    "folding counts the waits too",
    folded.humanWaits === 4 && folded.busyWaits === 1 && folded.continuations === 1,
    `${folded.humanWaits}/${folded.busyWaits}/${folded.continuations}`
  );
  const generous = [...legacy, { label: "provider dropped", state: { [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: 9, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "failure" } } }];
  ok("a saved block is trusted when it is the harsher number", foldRetryAccounting(generous).failureRetries === 9);
  const softer = [...legacy, { label: "provider dropped", state: { [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: 0, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "failure" } } }];
  ok(
    "a saved block never wins by being softer",
    foldRetryAccounting(softer).failureRetries === 2,
    `${foldRetryAccounting(softer).failureRetries}`
  );
  ok("folding an empty chain is the empty accounting", foldRetryAccounting([]).failureRetries === 0);
  const kept = stateWithRetryAccounting({ stepData: "the resume payload", n: 3 }, EMPTY_RETRY_ACCOUNTING);
  ok(
    "the caller's own state survives the merge",
    kept.stepData === "the resume payload" && kept.n === 3
  );
  ok("the accounting rides alongside it", savedRetryAccounting(kept) !== null);
  const prim = stateWithRetryAccounting(42, EMPTY_RETRY_ACCOUNTING);
  ok("a primitive checkpoint payload is kept, not destroyed", prim.payload === 42);
  ok("\u2026and the accounting is still readable from it", savedRetryAccounting(prim) !== null);
  section("7. the approval-wait clock never runs backwards");
  const base = { currentDeadlineMs: 1e4, preparationWaitMs: 5e3, executionWaitMs: 2e4 };
  ok(
    "nothing presented yet leaves the deadline untouched",
    extendApprovalWaitDeadline({ ...base, lane: "awaiting-human", waitStartedAt: null }) === 1e4
  );
  ok(
    "a parked ask is measured from when it was opened",
    extendApprovalWaitDeadline({ ...base, lane: "awaiting-human", waitStartedAt: 6e3 }) === 11e3
  );
  ok(
    "work that has begun gets the execution clock, not the patience clock",
    extendApprovalWaitDeadline({ ...base, lane: "failure", waitStartedAt: 6e3 }) === 26e3
  );
  ok(
    "a re-entered loop cannot shorten a deadline",
    extendApprovalWaitDeadline({ ...base, currentDeadlineMs: 99e3, lane: "awaiting-human", waitStartedAt: 1e3 }) === 99e3
  );
  ok(
    "expiry is strict \u2014 a deadline not yet passed is not expired",
    !waitExpired(1e4, 1e4) && waitExpired(10001, 1e4)
  );
  section("8. the module is wired, not merely correct");
  const ckpt = fs.readFileSync(path.join(ROOT, "src/mission/runCheckpoints.ts"), "utf8");
  const rt = fs.readFileSync(path.join(ROOT, "src/mission/missionRuntime.ts"), "utf8");
  ok(
    "the durable chain writes the accounting into its checkpoint state",
    /stateWithRetryAccounting\(state, accounting\)/.test(ckpt) && /advanceRetryAccounting\(retryAccounting\(runId\), lane\)/.test(ckpt)
  );
  ok("the chain exposes a reader for a resuming run", /export function retryAccounting/.test(ckpt));
  ok("the runtime classifies before it charges", /laneOfLabel\(label\)/.test(rt));
  ok("a parked gate is declared a non-failure at the write site", /"awaiting-human"/.test(ckpt) || /"awaiting-human"/.test(rt));
  const pkg = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
  ok("no npm package was added for this", !/bottleneck|p-queue|retry|exponential-backoff/.test(pkg));
  ok("the module imports nothing at all", !/^import /m.test(fs.readFileSync(path.join(ROOT, "src/mission/retryLanes.ts"), "utf8")));
  console.log("\n========================================");
  console.log(`RETRY LANES PROBE SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log("========================================");
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
main();
