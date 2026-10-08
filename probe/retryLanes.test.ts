/**
 * probe/retryLanes.test.ts — a wait is not a failure. The lift from Paperclip's
 * `execution-recovery-attempt.ts` and `approved-execution-wait.ts` (MIT,
 * Copyright (c) 2025 Paperclip AI; licence at `LICENSES/paperclip-MIT.txt`).
 *
 * THE PROPERTY UNDER TEST IS ONE SENTENCE: the number that decides whether a run
 * gets to keep trying must move only when something actually went wrong.
 *
 * SelfImpulse's defect was not a missing counter, it was a counter that could not
 * tell three different things apart — a provider that failed, a wave that
 * settled, and a person who had not answered the gate yet. The third is the one
 * that hurt: a crew parked at the gate was a crew whose steps were AGING, so
 * `timeoutLoop`, `stall` and the mission's 30-minute ceiling all charged the run
 * for the operator's reading speed. `failureDetection.ts` still measures the
 * clock; what this module changes is that the clock is no longer the only number
 * a resuming run reads.
 *
 * §1–§6 are the pure contract and are exercised directly. §7 pins the wiring in
 * the two files that own the durable chain, because a correct module with no
 * caller is exactly the thing this repository has been audited for before; those
 * assertions read the source rather than pretending to drive a live resume.
 */
import fs from "node:fs";
import path from "node:path";
import {
  advanceRetryAccounting,
  EMPTY_RETRY_ACCOUNTING,
  extendApprovalWaitDeadline,
  foldRetryAccounting,
  historicalFailureRetries,
  isNonFailureLane,
  laneOfLabel,
  NON_FAILURE_LANES,
  RETRY_ACCOUNTING_FIELD,
  savedRetryAccounting,
  stateWithRetryAccounting,
  waitExpired,
  type RunRetryAccounting,
} from "../src/mission/retryLanes";

const ROOT = process.env.SI_ROOT ?? path.resolve(import.meta.dirname, "..");

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

/* The labels this repository actually writes, lifted from the call sites rather
   than invented — a pattern matched against a hypothetical label proves nothing. */
const GATE_LABELS = [
  "awaiting-human",
  "awaiting-human (approval gate)",
  "Waiting on a human approval gate",
  "decision expired",
];
const BUSY_LABELS = ["provider rate-limit 429", "dispatch lane is full", "mission deadline reached"];
const CONTINUATION_LABELS = ["wave settled", "resuming run chain", "rollback point after approval", "decision granted"];
const FAILURE_LABELS = ["provider stream dropped mid-answer", "tool raised: fs_read ENOENT", ""];

function main(): void {
  section("1. laneOfLabel reads the labels this product emits");
  for (const l of GATE_LABELS) ok(`gate: “${l}” → awaiting-human`, laneOfLabel(l) === "awaiting-human", laneOfLabel(l));
  for (const l of BUSY_LABELS) ok(`wait: “${l}” → busy`, laneOfLabel(l) === "busy", laneOfLabel(l));
  for (const l of CONTINUATION_LABELS) ok(`advance: “${l}” → continuation`, laneOfLabel(l) === "continuation", laneOfLabel(l));
  for (const l of FAILURE_LABELS) ok(`failure: “${l || "(empty)"}” → failure`, laneOfLabel(l) === "failure", laneOfLabel(l));
  ok("classification is case-independent", laneOfLabel("AWAITING-HUMAN") === laneOfLabel("awaiting-human"));
  ok("an undefined label cannot escape as a non-failure", laneOfLabel(undefined as unknown as string) === "failure");

  section("2. the conservative default is the whole safety property");
  ok("an unrecognised label is charged, not waved through", laneOfLabel("something happened that nobody predicted") === "failure");
  ok("the three non-failure lanes are exactly the stated set",
    NON_FAILURE_LANES.join(",") === "awaiting-human,busy,continuation", NON_FAILURE_LANES.join(","));
  ok("a non-failure lane is never a failure lane",
    NON_FAILURE_LANES.every(isNonFailureLane) && !isNonFailureLane("failure"));

  section("3. only the failure lane moves the failure budget");
  let acc: RunRetryAccounting = EMPTY_RETRY_ACCOUNTING;
  const before = acc.failureRetries;
  for (const lane of ["awaiting-human", "busy", "continuation", "awaiting-human", "busy"] as const) {
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
  ok("advance never mutates the accounting it was given",
    EMPTY_RETRY_ACCOUNTING.failureRetries === 0 && EMPTY_RETRY_ACCOUNTING.humanWaits === 0);

  section("4. a chain that predates the module is read conservatively");
  /* The defect, re-expressed as a migration: four gate pauses and one genuine
     failure must read as ONE failure. `chain.length` would say five. */
  const legacy = [
    { label: "awaiting-human (approval gate)" },
    { label: "decision granted" },
    { label: "awaiting-human (approval gate)" },
    { label: "provider stream dropped mid-answer" },
    { label: "awaiting-human (approval gate)" },
    { label: "dispatch lane is full" },
    { label: "awaiting-human (approval gate)" },
  ];
  ok("historical count is not the chain length", historicalFailureRetries(legacy) !== legacy.length);
  ok("one failure among four gate pauses reads as one", historicalFailureRetries(legacy) === 1, `${historicalFailureRetries(legacy)}`);
  ok("an empty chain owes nothing", historicalFailureRetries([]) === 0);

  section("5. a torn journal cannot flatter a run");
  ok("absent state is not an accounting", savedRetryAccounting(null) === null);
  ok("a non-object is not an accounting", savedRetryAccounting(7) === null);
  ok("an array is not an accounting", savedRetryAccounting([]) === null);
  ok("a block without the format tag is refused",
    savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { failureRetries: 0 } }) === null);
  ok("a future format tag is not silently upgraded",
    savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/2", failureRetries: 0, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "busy" } }) === null);
  for (const bad of [-1, 1.5, "3", null, undefined, Number.NaN, Infinity]) {
    ok(`a ${String(bad)} counter is refused`,
      savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: bad, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "busy" } }) === null);
  }
  ok("an unknown lastLane falls back to the harsher lane",
    savedRetryAccounting({ [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: 2, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "sleeping" } })?.lastLane === "failure");

  section("6. folding, and the shape of a checkpoint's state");
  const folded = foldRetryAccounting(legacy);
  ok("a chain with no block folds to the historical reading", folded.failureRetries === 1, `${folded.failureRetries}`);
  ok("folding counts the waits too", folded.humanWaits === 4 && folded.busyWaits === 1 && folded.continuations === 1,
    `${folded.humanWaits}/${folded.busyWaits}/${folded.continuations}`);
  /* The saved block says two; the labels say one. The run is charged the number
     that is harder on it, because the soft reading is the failure mode. */
  const generous = [...legacy, { label: "provider dropped", state: { [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: 9, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "failure" } } }];
  ok("a saved block is trusted when it is the harsher number", foldRetryAccounting(generous).failureRetries === 9);
  const softer = [...legacy, { label: "provider dropped", state: { [RETRY_ACCOUNTING_FIELD]: { format: "si-retry-accounting/1", failureRetries: 0, continuations: 0, humanWaits: 0, busyWaits: 0, lastLane: "failure" } } }];
  ok("a saved block never wins by being softer", foldRetryAccounting(softer).failureRetries === 2,
    `${foldRetryAccounting(softer).failureRetries}`);
  ok("folding an empty chain is the empty accounting", foldRetryAccounting([]).failureRetries === 0);

  const kept = stateWithRetryAccounting({ stepData: "the resume payload", n: 3 }, EMPTY_RETRY_ACCOUNTING);
  ok("the caller's own state survives the merge",
    (kept as { stepData: string }).stepData === "the resume payload" && (kept as { n: number }).n === 3);
  ok("the accounting rides alongside it", savedRetryAccounting(kept) !== null);
  const prim = stateWithRetryAccounting(42, EMPTY_RETRY_ACCOUNTING);
  ok("a primitive checkpoint payload is kept, not destroyed", (prim as { payload: number }).payload === 42);
  ok("…and the accounting is still readable from it", savedRetryAccounting(prim) !== null);

  section("7. the approval-wait clock never runs backwards");
  const base = { currentDeadlineMs: 10_000, preparationWaitMs: 5_000, executionWaitMs: 20_000 };
  ok("nothing presented yet leaves the deadline untouched",
    extendApprovalWaitDeadline({ ...base, lane: "awaiting-human", waitStartedAt: null }) === 10_000);
  ok("a parked ask is measured from when it was opened",
    extendApprovalWaitDeadline({ ...base, lane: "awaiting-human", waitStartedAt: 6_000 }) === 11_000);
  ok("work that has begun gets the execution clock, not the patience clock",
    extendApprovalWaitDeadline({ ...base, lane: "failure", waitStartedAt: 6_000 }) === 26_000);
  ok("a re-entered loop cannot shorten a deadline",
    extendApprovalWaitDeadline({ ...base, currentDeadlineMs: 99_000, lane: "awaiting-human", waitStartedAt: 1_000 }) === 99_000);
  ok("expiry is strict — a deadline not yet passed is not expired",
    !waitExpired(10_000, 10_000) && waitExpired(10_001, 10_000));

  section("8. the module is wired, not merely correct");
  const ckpt = fs.readFileSync(path.join(ROOT, "src/mission/runCheckpoints.ts"), "utf8");
  const rt = fs.readFileSync(path.join(ROOT, "src/mission/missionRuntime.ts"), "utf8");
  ok("the durable chain writes the accounting into its checkpoint state",
    /stateWithRetryAccounting\(state, accounting\)/.test(ckpt) && /advanceRetryAccounting\(retryAccounting\(runId\), lane\)/.test(ckpt));
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
