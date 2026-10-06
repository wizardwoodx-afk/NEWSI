/**
 * probe · diag3 — artifacts and their evaluation honesty.
 *
 * Used to print an artifact dump and assert nothing. Its own output was asking
 * one question of every artifact — did it pass, was it fully MEASURED, and what
 * stayed unmeasured — which is the product's honesty contract: a claim is
 * fetched and checked before it is called verified. So that is what it pins.
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

const services = createServices();
const rt = new MissionRuntime(m, services, { allowSimulated: true, installed: { "local-test": true }, approvalTimeoutMs: 3000 });
rt.prepare();
rt.buildOrganization();
await rt.run();

console.log("mission status:", m.status);
for (const t of rt.org.tasks_()) console.log(` task ${t.title} | ${t.state} | risk=${t.risk} cls=${t.cls} deps=[${t.dependsOn.join(",")}] err=${(t.error ?? "").slice(0, 60)}`);
console.log("approvals opened:", services.approvals.forMission(m.missionId).length, "still PENDING:", services.approvals.pendingForMission(m.missionId).length);
const arts = services.artifacts.forMission(m.missionId);
console.log("artifacts:", arts.length);
for (const a of arts.slice(0, 8)) console.log(`  ${a.name} v${a.version} passed=${a.evaluation?.passed} fullyMeasured=${a.evaluation?.fullyMeasured} unmeasured=[${(a.evaluation?.unmeasured ?? []).join("; ")}]`);
const ev = rt.getEvents();
console.log("event kinds:", [...new Set(ev.map(e => e.kind))].sort().join(", "));
console.log("last 3:", ev.slice(-3).map(e => e.kind + " :: " + e.reason.slice(0, 100)).join("\n        "));

section("1. artifact honesty — the contract this suite was reaching for");
ok("the run produced a mission status", !!m.status, `${m.status}`);

// THE load-bearing assertion: an artifact may not report itself fully measured
// while naming something it did not measure. `fullyMeasured` is the flag the
// UI and the receipt both lean on, so a contradiction between it and the
// unmeasured list is a false claim, not a cosmetic inconsistency.
const contradictory = arts.filter((a) => a.evaluation?.fullyMeasured === true && (a.evaluation?.unmeasured?.length ?? 0) > 0);
ok("no artifact claims fullyMeasured while listing what it did not measure",
  contradictory.length === 0,
  contradictory.map((a) => `${a.name}: fullyMeasured=true but unmeasured=[${(a.evaluation?.unmeasured ?? []).join(", ")}]`).join("; "));

// The converse: if nothing was measured, nothing may claim it was.
const unmeasuredButPassed = arts.filter((a) => (a.evaluation?.unmeasured?.length ?? 0) > 0 && a.evaluation?.passed === true && a.evaluation?.fullyMeasured);
ok("no partially-measured artifact reports a verified pass", unmeasuredButPassed.length === 0,
  unmeasuredButPassed.map((a) => a.name).join("; "));

// Every artifact that carries an evaluation must carry the fields that make it
// readable — an evaluation object missing `passed` is indistinguishable from one
// that was never run.
const malformed = arts.filter((a) => a.evaluation !== undefined && a.evaluation !== null && typeof a.evaluation.passed !== "boolean");
ok("every artifact evaluation reports a boolean passed", malformed.length === 0,
  malformed.map((a) => `${a.name}: ${typeof a.evaluation?.passed}`).join("; "));

section("2. the run left nothing dangling");
// No approval callback here, so a gate the mission opened stays unanswered and
// the run stops on it. That is the fail-closed path, and it is what the observed
// BLOCKED mission should show — the assertion is that BLOCKED and PENDING agree.
const stillPending = services.approvals.pendingForMission(m.missionId);
if (stillPending.length > 0) {
  ok("an unanswered gate is reflected as a BLOCKED mission", m.status === "BLOCKED", `${m.status}`);
  ok("…and the blocked task says it is waiting on a human",
    rt.org.tasks_().filter((t) => t.state === "BLOCKED").every((t) => /approval|human/i.test(t.error ?? "")),
    JSON.stringify(rt.org.tasks_().filter((t) => t.state === "BLOCKED").map((t) => t.error)));
  ok("no approval-gated task was marked done while unanswered",
    rt.org.tasks_().filter((t) => t.cls === "APPROVAL_GATED").every((t) => t.state !== "done"),
    JSON.stringify(rt.org.tasks_().filter((t) => t.cls === "APPROVAL_GATED").map((t) => `${t.title}:${t.state}`)));
}
const stuck = rt.org.tasks_().filter((t) => t.state === "running");
ok("no task is still running after run() returned", stuck.length === 0,
  JSON.stringify(stuck.map((t) => t.title)));

// Artifacts are evidence, so their identity must be stable and non-empty.
ok("every artifact is named", arts.every((a) => !!a.name), `${arts.length} artifacts`);
ok("every artifact carries a version", arts.every((a) => a.version !== undefined && a.version !== null),
  JSON.stringify(arts.filter((a) => a.version === undefined).map((a) => a.name)));

console.log(`\ndiag3: ${pass} passed, ${fail} failed`);
assert.equal(fail, 0, `${fail} diag3 assertion(s) failed`);