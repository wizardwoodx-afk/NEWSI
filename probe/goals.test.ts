/**
 * probe/goals.test.ts — Assignments (goal mode) + session Auto-Review rules (18.5.0).
 *
 * Pins governed goal mode on VH's floor: goals decompose with the
 * product's OWN router, steps settle only by reported outcomes (never fiat),
 * gated steps pause and resume only by explicit human act, progress
 * checkpoints in the local store; session rules answer ONLY risky asks,
 * ONLY when every category in the ask is ruled, NEVER critical, are
 * forgotten on demand, and log every answer they give.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

import {
  clearGoals, createGoal, executedProgress, getGoal, goalProgress, goalStatus, loadGoals, nextPendingStep, resumeGoal, settleStep,
} from "../src/engine/goals";
import { clearHandoffs, listHandoffs, recordHandoff } from "../src/engine/handoffs";
import {
  allowCategoryForSession, answerGateWithRules, clearSessionRules, listSessionRules, revokeSessionRule, sessionRuleLog,
} from "../src/engine/gateRules";
import { getSpecialist } from "../src/engine/registry";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
};

test("goals + session rules — governed goal mode", async () => {
  console.log("\n── 1. goals decompose with the product's own router ──");
  clearGoals();
  const g = createGoal("probe-user", "typescript types refactor and react component state");
  check("a goal gets specialist steps from the real router", g.steps.length >= 1 && g.steps.some((s) => s.specialistId !== null));
  check("steps start pending and the goal is active", g.state === "active" && g.steps.every((s) => s.status === "pending"));
  check("no more than five steps — a goal is not a wishlist", g.steps.length <= 5);
  check("the goal checkpoints into the local store", getGoal(g.id)?.text === g.text);

  console.log("\n── 2. steps settle only by reported outcomes ──");
  const s0 = nextPendingStep(g)!;
  settleStep(g.id, s0.id, { status: "done", receiptDigest: "abc123", note: "executed" });
  check("a done step carries its receipt digest", getGoal(g.id)?.steps.find((s) => s.id === s0.id)?.receiptDigest === "abc123");
  const before = getGoal(g.id)!;
  settleStep(g.id, s0.id, { status: "refused", note: "attempted overwrite" });
  check("a settled step cannot be re-settled (no outcome laundering)", JSON.stringify(getGoal(g.id)) === JSON.stringify(before));
  check("unknown goals refuse politely", settleStep("goal-nope", "st-0", { status: "done" }) === null);

  console.log("\n── 3. gated steps pause; resuming is a human act ──");
  const s1 = nextPendingStep(getGoal(g.id)!)!;
  settleStep(g.id, s1.id, { status: "gated" });
  check("a gated step pauses the goal", getGoal(g.id)?.state === "paused");
  check("next pending still finds the gated step after resume", (() => { resumeGoal(g.id); return nextPendingStep(getGoal(g.id)!)?.id === s1.id; })());
  check("resume re-activates the goal", getGoal(g.id)?.state === "active");

  console.log("\n── 4. progress and completion — the honest verdict (18.6.0 review fix) ──");
  const cur = getGoal(g.id)!;
  for (const s of cur.steps) settleStep(g.id, s.id, { status: "planned", note: "plan" });
  check("all-settled is 100% SETTLED — but the state is 'settled', never 'done'", goalProgress(getGoal(g.id)!) === 100 && getGoal(g.id)?.state === "settled");
  check("one executed step among plans reads PARTIAL, not DONE", goalStatus(getGoal(g.id)!) === "PARTIAL" && executedProgress(getGoal(g.id)!) < 100);
  check("loadGoals survives as the checkpoint list", loadGoals().some((x) => x.id === g.id));

  const gp = createGoal("probe-user", "typescript types refactor and react component state");
  for (const s of gp.steps) settleStep(gp.id, s.id, { status: "planned", note: "plan" });
  check("a goal of pure plans says PLANNED — done means executed", goalStatus(getGoal(gp.id)!) === "PLANNED" && executedProgress(getGoal(gp.id)!) === 0);
  const gb = createGoal("probe-user", "typescript types refactor and react component state");
  settleStep(gb.id, gb.steps[0].id, { status: "refused", note: "denied at the gate" });
  for (const s of getGoal(gb.id)!.steps.slice(1)) settleStep(gb.id, s.id, { status: "planned", note: "plan" });
  check("a refusal with nothing executed says BLOCKED", goalStatus(getGoal(gb.id)!) === "BLOCKED");
  const gd = createGoal("probe-user", "typescript types refactor and react component state");
  for (const s of gd.steps) settleStep(gd.id, s.id, { status: "done", receiptDigest: "d1", note: "ran" });
  check("only a fully executed goal says DONE — at 100% executed", goalStatus(getGoal(gd.id)!) === "DONE" && getGoal(gd.id)?.state === "done" && executedProgress(getGoal(gd.id)!) === 100);

  console.log("\n── 6. the A2A handoff ledger ──");
  clearHandoffs();
  const h1 = recordHandoff({ peer: "peer-selfimpulse", task: "run the suite", outcome: "delegated", detail: "ran on peer", receiptDigest: "si-peer-1" });
  recordHandoff({ peer: "peer-selfimpulse", task: "deploy prod", outcome: "refused", detail: "no bridge wired — nothing sent" });
  const led = listHandoffs();
  check("a delegated handoff keeps the peer receipt digest", led[0].receiptDigest === "si-peer-1" && led[0].outcome === "delegated" && h1.id === led[0].id);
  check("a refused handoff is recorded with the reason in words", led[1].outcome === "refused" && led[1].detail.includes("nothing sent"));
  check("the ledger lists in order and clears", led.length === 2 && (clearHandoffs(), listHandoffs().length === 0));

  console.log("\n── 5. session Auto-Review rules ──");
  clearSessionRules();
  const cat = getSpecialist("code.typescript")!.category;
  const askRisky = { action: "run", riskTier: "risky" as const, specialistIds: ["code.typescript"], summary: "risky ts work" };
  const askCritical = { ...askRisky, riskTier: "critical" as const };
  check("without rules the gate is unanswered (human asked)", answerGateWithRules(askRisky) === null);
  check("critical work is NEVER answered by a rule", (() => { allowCategoryForSession(cat); return answerGateWithRules(askCritical) === null; })());
  check("a risky ask in a ruled category is answered", answerGateWithRules(askRisky)?.approved === true);
  check("the answer was logged", sessionRuleLog().some((l) => l.category === cat));
  const mixed = { ...askRisky, specialistIds: ["code.typescript", "testing.unit"] };
  check("a multi-category ask needs EVERY category ruled", answerGateWithRules(mixed) === null);
  check("unknown specialists never get a rule answer", answerGateWithRules({ ...askRisky, specialistIds: ["nope.404"] }) === null);
  revokeSessionRule(cat);
  check("revoking is one click and takes effect", answerGateWithRules(askRisky) === null && listSessionRules().length === 0);

  console.log(`\n${fail === 0 ? "✅" : "❌"} goals probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} goals checks failed`);
});
