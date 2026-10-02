/**
 * probe/selfEvolve.test.ts — recursive self-evolution, floor first (18.2.0).
 *
 * Pins the whole stance: VH proposes from your ledger (tighten-only), you
 * decide, every change reverts exactly, rejecting three times in one category
 * silences that category (the recursion), and the floor — receipts, human
 * gate, honesty, no loosenings — stays intact through all of it.
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

import { recordDecision } from "../src/engine/memory";
import { effectiveRiskTier, getSpecialist, SPECIALISTS } from "../src/engine/registry";
import { loadSelfOverrides, resetSelfOverrides } from "../src/engine/selfOverrides";
import {
  applySelfChange,
  floorIntact,
  proposeSelfChanges,
  rejectSelfChange,
  revertAppliedChange,
  SELF_EVOLUTION_FLOOR,
  selfProposals,
} from "../src/engine/selfEvolve";
import { routeDeterministic } from "../src/engine/router";

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, detail?: unknown): void => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? "✅" : "❌"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
};

const USER = "probe-user";
// pick a real specialist: prefer a safe-tier one so tightening is observable
const victim = SPECIALISTS.find((s) => s.riskTier === "safe" && s.category === "code") ?? SPECIALISTS[0];
const victimCat = victim.category;

test("selfEvolve — bounded, human-gated, revert-exact", async () => {
  console.log("\n── 1. silence before evidence ──");
  resetSelfOverrides();
  localStorage.removeItem("engine.self.proposals.v1");
  check("an empty ledger proposes nothing", (await proposeSelfChanges(USER)).proposals.length === 0);
  check("the floor is declared in words", SELF_EVOLUTION_FLOOR.length === 4 && SELF_EVOLUTION_FLOOR.join(" ").includes("receipt"));

  console.log("\n── 2. rejections mint tighten-only proposals ──");
  const others = SPECIALISTS.filter((s) => s.category === victimCat && s.id !== victim.id).slice(0, 2);
  for (const sp of [victim, ...others]) {
    for (let i = 0; i < 3; i++) {
      recordDecision({ userId: USER, scenario: "probe task", action: `${sp.id} proposed`, kind: "reject", specialistId: sp.id, category: sp.category, reason: "not what I needed" });
    }
  }
  const minted = (await proposeSelfChanges(USER)).proposals;
  check("three rejections of one specialist mint a tighten-tier proposal", minted.length >= 1 && minted.some((p) => p.kind === "tighten-tier" && p.target === victim.id));
  check("one proposal per rejected specialist in the category", minted.filter((x) => x.kind === "tighten-tier").length >= 3, minted.filter((x) => x.kind === "tighten-tier").length);
  check("the rationale cites your own ledger", minted[0]?.rationale.includes("rejected") === true);
  const p = selfProposals().find((x) => x.kind === "tighten-tier")!;
  check("the proposal can only go UP — 'to' is risky/critical, never safe", p.to === "risky" || p.to === "critical");

  console.log("\n── 3. applying is yours, and reverts exactly ──");
  const before = effectiveRiskTier(victim);
  const applied = applySelfChange(p.id);
  check("applying takes effect immediately", applied.ok && effectiveRiskTier(victim) !== before, [before, effectiveRiskTier(victim)]);
  check("rejection never loosens anything — store still tighten-only", loadSelfOverrides().tierTightens[victim.id] !== "safe");
  const hist = loadSelfOverrides().history[0];
  revertAppliedChange(hist.id);
  check("revert restores the exact previous tier", effectiveRiskTier(victim) === before);
  check("a reverted proposal becomes actionable again", selfProposals().find((x) => x.id === p.id)?.state === "pending");

  console.log("\n── 4. the router bar moves only up ──");
  recordDecision({ userId: USER, scenario: "tenth task", action: `${victim.id} proposed`, kind: "reject", specialistId: victim.id, category: victim.category }); // 10th decision, 0% acceptance
  const round2 = (await proposeSelfChanges(USER)).proposals;
  const minProposal = round2.find((x) => x.kind === "raise-min-score" && x.state === "pending");
  check("a ledger that accepts nothing proposes raising the bar", minProposal !== undefined);
  const barBefore = routeDeterministic("typescript types refactor", USER).selected.length;
  if (minProposal) {
    applySelfChange(minProposal.id);
    check("raising the bar can only shrink the bench", routeDeterministic("typescript types refactor", USER).selected.length <= barBefore);
    check("minScoreDelta never goes below zero", loadSelfOverrides().minScoreDelta >= 0);
  } else {
    check("no min-score proposal pending on this ledger (bar unchanged)", true);
  }

  console.log("\n── 5. recursion — three rejections silence a category ──");
  let autoSuppressed: string | null = null;
  const inCat = selfProposals().filter((x) => x.state === "pending" && x.kind === "tighten-tier" && (getSpecialist(x.target)?.category ?? "") === victimCat).slice(0, 3);
  for (const q of inCat) {
    const r = rejectSelfChange(q.id, "not wanted");
    if (r.autoSuppressed) autoSuppressed = r.autoSuppressed;
  }
  check("rejecting three proposals auto-suppresses their category", autoSuppressed === victimCat, { autoSuppressed, found: inCat.length });
  const afterSuppress = (await proposeSelfChanges(USER)).proposals;
  check("suppressed categories stop generating proposals", afterSuppress.filter((x) => x.state === "pending").every((x) => (getSpecialist(x.target)?.category ?? "") !== victimCat), afterSuppress.filter((x) => x.state === "pending").map((x) => ({ k: x.kind, t: x.target })));
  check("rejection is sticky — rejected proposals don't reappear", selfProposals().filter((x) => x.state === "rejected").length >= 3);

  console.log("\n── 6. floor intact ──");
  const audit = floorIntact();
  check("the floor survived everything", audit.ok === true, audit);
  check("every proposal targets a real specialist or category", selfProposals().every((x) => getSpecialist(x.target) !== null || SPECIALISTS.some((s) => s.category === x.target) || x.kind === "raise-min-score"));

  console.log(`\n${fail === 0 ? "✅" : "❌"} selfEvolve probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} selfEvolve checks failed`);
});
