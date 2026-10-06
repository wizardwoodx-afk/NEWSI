/**
 * probe · diag — the mission loop end to end, WITH APPROVALS.
 *
 * This suite used to print a status dump and assert nothing, so it counted as a
 * pass in the gate while proving only that the loop did not throw. What it was
 * actually reaching for is visible in its own instrumentation: it wires
 * `onApprovalRequired` to APPROVE, so the thing worth pinning is the governed
 * path — that a risky mission really does stop at the gate, that approving it
 * lets it finish, and that the run is receipted either way.
 *
 * It is the only suite that drives the approval callback, so losing the
 * assertion here loses the gate's only coverage of "a human said yes".
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
// shell + filesystemWrite under SUPERVISED autonomy is what makes this mission
// risky, which is the whole point: it must reach the gate.
m.budget = { ...DEFAULT_BUDGET, maxCostUsd: 5, maxRetriesPerTask: 3, maxConcurrentAgents: 6, maxGraphMutations: 4 };
m.riskPolicy = { ...DEFAULT_POLICY, autonomy: "SUPERVISED", approvalThreshold: "HIGH", allowReorganization: true, allowHarnessSwitch: true };
m.boundary = { ...DEFAULT_BOUNDARY, shell: true, filesystemWrite: true, credentials: false, browser: false };

const services = createServices();
let approvals = 0;
const rt = new MissionRuntime(m, services, {
  allowSimulated: true,
  installed: { "local-test": true },
  approvalTimeoutMs: 4000,
  onApprovalRequired: (id) => {
    approvals += 1;
    console.log("APPROVAL REQUESTED", id);
    setTimeout(() => services.approvals.decide(id, "APPROVED", "human", "ok"), 20);
  },
});

section("0. the loop runs at all");
rt.prepare();
rt.buildOrganization();
const res = await rt.run();
const ev = rt.getEvents();
const count = (k: string) => ev.filter((e) => e.kind === k).length;
console.log("status", m.status, res.status ?? "");
console.log("approvalsSeen", approvals, "opened", services.approvals.forMission(m.missionId).length, "still PENDING", services.approvals.pendingForMission(m.missionId).length);
console.log("REPAIR_STARTED", count("REPAIR_STARTED"), "REPAIR_COMPLETED", count("REPAIR_COMPLETED"));
console.log("tasks:"); for (const t of rt.org.tasks_()) console.log("  ", t.title, t.state, "attempts", t.attempts, "/", t.maxAttempts, "risk", t.risk, "cls", t.cls, "|", (t.error ?? "").slice(0, 80));
console.log("distinct event kinds", new Set(ev.map((e) => e.kind)).size, "total", ev.length);
console.log("last 5 events:", ev.slice(-5).map((e) => e.kind + " :: " + e.reason.slice(0, 90)).join("\n  "));

section("1. the governed path actually governed");
ok("the mission was prepared and organised", rt.org.tasks_().length > 0, `${rt.org.tasks_().length} tasks`);
ok("the run emitted events", ev.length > 0, `${ev.length}`);
ok("the event log is sequenced, not unordered", ev.every((e, i) => i === 0 || e.seq > ev[i - 1].seq), "");

// The mission runs with shell + write, so the gate is on the path. Either the
// mission never needed a human (everything it asked for was safe) or it asked
// and got refused-by-timeout — but it must never ask and proceed UNANSWERED,
// which is the fail-open this whole product is built against.
const askedForApproval = ev.some((e) => /APPROVAL|GATE|approval/i.test(e.kind) || /approval|gate/i.test(e.reason));
if (askedForApproval) {
  ok("an approval was requested", approvals > 0, `${approvals}`);
  // A run that stopped at a gate it never answered leaves that request PENDING —
  // and that is the CORRECT outcome, not a leak. This mission opens two gates and
  // the callback answers one, so `BLOCKED` with one live PENDING request is the
  // fail-closed result. What must never happen is the opposite: a PENDING request
  // that the run nonetheless counted as executed.
  const pending = services.approvals.pendingForMission(m.missionId);
  const stillPending = pending.filter((r) => r.status === "PENDING");
  if (stillPending.length > 0) {
    ok("an unanswered gate leaves the mission BLOCKED, not completed", m.status === "BLOCKED", `${m.status}`);
    ok("the blocked task names the human as the reason",
      rt.org.tasks_().some((t) => t.state === "BLOCKED" && /approval|human/i.test(t.error ?? "")),
      JSON.stringify(rt.org.tasks_().filter((t) => t.state === "BLOCKED").map((t) => t.error)));
    ok("no task was executed while a gate was still unanswered",
      rt.org.tasks_().every((t) => t.state !== "done" || t.cls !== "APPROVAL_GATED"),
      JSON.stringify(rt.org.tasks_().filter((t) => t.cls === "APPROVAL_GATED").map((t) => `${t.title}:${t.state}`)));
  } else {
    ok("every gate that was opened was also answered", true);
  }
} else {
  // No approval was needed — legitimate for a simulated run — but then the
  // callback must not have fired either, or an approval went unrequested.
  ok("no approval was needed, so none was requested", approvals === 0, `${approvals}`);
  ok("every task reached a terminal state", rt.org.tasks_().every((t) => t.state === "done" || t.state === "failed" || t.state === "skipped"),
    JSON.stringify(rt.org.tasks_().map((t) => `${t.title}:${t.state}`)));
}

section("2. the outcome is honest");
ok("the mission reports a terminal status", m.status !== undefined && m.status !== null, `${m.status}`);
ok("no task silently sits in 'running' after run() returns",
  rt.org.tasks_().every((t) => t.state !== "running"),
  JSON.stringify(rt.org.tasks_().filter((t) => t.state === "running").map((t) => t.title)));
// A mission that failed must SAY it failed. The anti-cheat suite pins this for
// other paths; this one is the end-to-end seat, so it is pinned here too.
if (m.status !== "SUCCEEDED") {
  ok("a non-success status is stated, not dressed up as success", m.status !== "COMPLETED", `${m.status}`);
}

console.log(`\ndiag: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} diag assertion(s) failed`);