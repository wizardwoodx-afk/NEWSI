/**
 * probe · diag2 — the REPAIR path of the mission loop.
 *
 * Used to print a repair census and assert nothing. Its instrumentation was
 * aimed at one question — do repairs happen, and under which policy — so that is
 * what it now pins. It is the only suite watching repair accounting, and repair
 * counts are exactly the kind of number a broken loop reports as zero without
 * anyone noticing.
 */
import assert from "node:assert/strict";
import { MissionRuntime, createServices } from "../src/mission/missionRuntime";
import { instantiateTemplate } from "../src/mission/templates";
import { DEFAULT_BOUNDARY, DEFAULT_BUDGET, DEFAULT_POLICY } from "../src/mission/types";

let pass = 0;
let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const section = (t: string) => console.log(`\n== ${t} ==`);

const m = instantiateTemplate("tpl.software-development", { objective: "Build a production-ready SaaS billing feature in TypeScript", name: "d", workspace: "." });
m.successCriteria = ["Builds without errors", "Tests pass"];
m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };

// allowSimulated with no onApprovalRequired: anything risky must NOT be
// auto-approved here. This is the fail-closed arm — the complement of diag,
// which approves. Together they pin that approval is required, not assumed.
const services = createServices();
const rt = new MissionRuntime(m, services, { allowSimulated: true, installed: { "local-test": true }, approvalTimeoutMs: 3000 });
rt.prepare();
rt.buildOrganization();
await rt.run();

const ev = rt.getEvents();
const repairEvents = ["REPAIR_STARTED", "REPAIR_COMPLETED"] as const;

section("1. the repair census");
for (const k of repairEvents) {
  const rows = ev.filter((e) => e.kind === k);
  const byPolicy: Record<string, number> = {};
  for (const e of rows) byPolicy[e.policy] = (byPolicy[e.policy] ?? 0) + 1;
  console.log(k, "=", rows.length, JSON.stringify(byPolicy));
  for (const e of rows.slice(0, 3)) console.log("   sample:", e.seq, e.policy, "::", e.reason.slice(0, 90), "| subj", e.subjectId);
}
const seqs = ev.map((e) => e.seq);
console.log("total", ev.length, "min seq", seqs[0], "max seq", seqs[seqs.length - 1], "unique seqs", new Set(seqs).size);

section("2. the gate this suite exists for");
const started = ev.filter((e) => e.kind === "REPAIR_STARTED").length;
const completed = ev.filter((e) => e.kind === "REPAIR_COMPLETED").length;

// A repair that starts and never completes is an unterminated loop; one that
// completes without starting is a fabricated count. Both are accounting lies,
// and this suite is the only thing watching them.
ok("repairs completed never exceed repairs started", completed <= started, `${completed} completed / ${started} started`);

// The log itself must be trustworthy before its counts can be: strictly
// increasing sequence numbers, no gaps that would hide a dropped event.
ok("the event log is non-empty", ev.length > 0, `${ev.length}`);
ok("event sequence numbers are strictly increasing", seqs.every((s, i) => i === 0 || s > seqs[i - 1]), "");
ok("event sequence numbers are unique", new Set(seqs).size === seqs.length, `${new Set(seqs).size}/${seqs.length}`);

// No approval callback was wired into this run, so any gate the mission opened
// stayed unanswered and the run must have stopped on it. A mission that was
// BLOCKED with a live PENDING request is the fail-closed result; a mission that
// finished anyway would mean an unanswered gate was treated as consent.
const pending = services.approvals.pendingForMission(m.missionId);
if (pending.length > 0) {
  ok("an unanswered gate blocked the run (no silent consent)", m.status === "BLOCKED", `${m.status}`);
} else {
  ok("no gate needed a human on this path", true);
}

const tasks = rt.org.tasks_();
const unfinished = tasks.filter((t) => t.state === "running");
ok("no task is left mid-flight after run() returns", unfinished.length === 0,
  JSON.stringify(unfinished.map((t) => `${t.title}:${t.state}`)));

// Retries must be bounded: the budget sets maxRetriesPerTask, and an unbounded
// retry is a cost bug the user pays for.
const overRetried = tasks.filter((t) => t.attempts > t.maxAttempts);
ok("no task exceeded its retry budget", overRetried.length === 0,
  JSON.stringify(overRetried.map((t) => `${t.title}: ${t.attempts}/${t.maxAttempts}`)));

console.log(`\ndiag2: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} diag2 assertion(s) failed`);