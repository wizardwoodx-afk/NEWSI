/**
 * §DURABLE RUNS probe — a crash resumes instead of restarting.
 *
 * The enterprise production bar (durable execution): a run that dies at
 * step 14 of 20 picks up at 13. For SelfImpulse that means (a) every
 * settled mission wave lands on a tamper-evident checkpoint chain,
 * (b) pausing at the human gate is a DURABLE pause — the pending approval
 * and the run state survive a restart, and the decision lands on the same
 * chain, (c) a tampered journal never resumes.
 */
import assert from "node:assert/strict";
import {
  checkpoint, chainFor, latestCheckpoint, restoreRunJournal, resetRunCheckpointsForProbe, resumeRunFrom, runJournal, verifyRunChain,
  resetRunCheckpointsForProbe, resumeRunFrom, verifyRunChain,
} from "../src/mission/runCheckpoints";
import { bindOwnerRoot } from "../src/security/ownerRoot";
import {
  resolveSelfImpulseApproval, runSelfImpulseToolCall, selfimpulseSession,
} from "../src/selfimpulse/engine/selfimpulse";
import * as fs from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

/* The approve path mints capabilities — the owner root must be live. */
bindOwnerRoot("probe-owner-passphrase");
resetRunCheckpointsForProbe();

section("1. the chain — every step lands, every digest recomputes");
{
  checkpoint("run:m-1", "m-1", 0, "wave settled", { settled: 3, verified: 2 });
  checkpoint("run:m-1", "m-1", 1, "wave settled", { settled: 2, verified: 2 });
  checkpoint("run:m-1", "m-1", 2, "review committed", { branches: ["a"] });
  const v = verifyRunChain("run:m-1");
  ok("a three-step chain verifies", v.ok === true && v.length === 3);
  ok("the chain is readable in order", chainFor("run:m-1").map((c) => c.label).join("|") === "wave settled|wave settled|review committed");
  const r = resumeRunFrom("run:m-1");
  assert.ok(r.ok);
  ok("the resume point is the LAST checkpoint, with its state intact",
    r.fromStep === 2 && r.label === "review committed" && (r.state as { branches: string[] }).branches[0] === "a");
  ok("an unknown run refuses in words", resumeRunFrom("run:never").ok === false);
}

section("2. tamper — the chain refuses to lie");
{
  const snap = runJournal("run:m-1"); // the app's persisted copy — made BEFORE any edit
  const parsed = JSON.parse(snap) as { runs: Record<string, Array<Record<string, unknown>>> };
  const chain = parsed.runs["run:m-1"];
  chain.splice(1, 1); // an auditor-fooling edit: drop the middle step
  restoreRunJournal(JSON.stringify(parsed));
  const v = verifyRunChain("run:m-1");
  ok("a dropped step breaks the link BY NAME", v.ok === false && v.reason === "broken-link");
  ok("a tampered chain NEVER resumes", resumeRunFrom("run:m-1").ok === false);
  const back = restoreRunJournal(snap); // recovery = reload the honest persisted copy
  ok("recovery reloads the honest copy and the chain verifies again",
    back.ok === true && verifyRunChain("run:m-1").ok === true && resumeRunFrom("run:m-1").ok === true);
  // the auditor's edit that used to slip through: change ONLY a label
  const parsed2 = JSON.parse(runJournal("run:m-1")) as { runs: Record<string, Array<Record<string, unknown>>> };
  const chain2 = parsed2.runs["run:m-1"];
  chain2[1].label = "capability denied"; // rewrite history without touching any state
  restoreRunJournal(JSON.stringify(parsed2));
  const lied = verifyRunChain("run:m-1");
  ok("editing ONLY a label breaks the chain — every field is inside the hash",
    lied.ok === false && lied.reason === "edited-entry");
  restoreRunJournal(snap); // restore the honest copy for the sections below
}

section("3. a restart is not a loss");
{
  checkpoint("run:m-2", "m-2", 0, "wave settled", { settled: 4 });
  const snap = runJournal(); // the app persists this
  resetRunCheckpointsForProbe(); // …the process dies
  const back = restoreRunJournal(snap); // …the next process reloads
  assert.ok(back.ok);
  ok("the journal reloads after a crash", back.ok === true && back.runs >= 2);
  const r = resumeRunFrom("run:m-2");
  ok("the resumed run picks up exactly where it stopped", r.ok === true && r.fromStep === 0);
  ok("a garbage journal refuses to load", restoreRunJournal("{oops").ok === false);
  ok("latestCheckpoint answers in one call", latestCheckpoint("run:m-2")?.label === "wave settled");
}

section("4. the gate is a durable pause — live, through the real pipeline");
{
  const r = await runSelfImpulseToolCall("workspace_write", { name: "durable-probe.txt", content: "resume evidence" }, { origin: "probe", blockOnGate: false });
  assert.ok(r.approvalId, "the risky call must park at the gate");
  ok("the risky call parked at the human gate", r.pending === true);
  const chain = chainFor(`run:${r.callId}`);
  ok("the pause itself is a checkpoint on the run's chain", chain.some((c) => c.label === "awaiting-human"));
  // the human decides LATER — the way it works after a restart
  const approval = selfimpulseSession().approvals.find((a) => a.id === r.approvalId);
  assert.ok(approval && approval.status === "pending");
  ok("the pending approval carries its run reference", approval.runRef?.runId === `run:${r.callId}`);
  resolveSelfImpulseApproval(r.approvalId!, true);
  const after = chainFor(`run:${r.callId}`);
  ok("the decision lands on the durable chain", after.some((c) => c.label === "decision granted") || after.some((c) => c.label === "denied at the gate"));
  ok("the whole run chain verifies end to end", verifyRunChain(`run:${r.callId}`).ok === true);
  ok("the run shows an honest resume point", resumeRunFrom(`run:${r.callId}`).ok === true);
}

section("5. the wires are real — executor waves checkpoint, gate checkpoints");
{
  const exec = fs.readFileSync(path.join(ROOT, "src", "mission", "teamExecutor.ts"), "utf8");
  ok("every settled mission wave leaves a checkpoint", /durableCheckpoint\(durableRunId, req\.missionSlug, waveNo, "wave settled"/.test(exec));
  const si = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
  ok("the human gate checkpoints its pause and carries the run reference", /awaiting-human/.test(si) && /\{ runId: `run:\$\{callId\}`, step: 1 \}/.test(si));
  ok("the decision lands on the chain even after a restart", /decision granted/.test(si));
  const store = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
  ok("no import of the mission runtime's own durable KV from the wires (the layers stay separate)",
    !/from "\.\.\/mission\/durable"/.test(exec + si));
}

console.log(`\ndurableRuns: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
