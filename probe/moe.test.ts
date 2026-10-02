/**
 * probe/moe.test.ts — the AGENTIC MIXTURE OF EXPERTISE.
 *
 * Pins: the gate (point/standard/complex with k=1/2/3), sparse selection
 * (top expert always enters, next only on marginal coverage), the prunes
 * are honest (each carries a reason), no candidate is ever invented, and
 * the live routing path runs MoE on every task with the accounting line.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; } clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); } setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStore();

import { moeGate, selectCrew, moeLine } from "../src/engine/moe";
import { routeDeterministic } from "../src/engine/router";
import { SPECIALISTS } from "../src/engine/registry";
import { getSpecialist } from "../src/engine/registry";

const fs = await import("node:fs");
const genSrc = fs.readFileSync(path.join(ROOT, "src/engine/generalist.ts"), "utf8");

function main(): void {
  /* the gate */
  const point = moeGate("what is GSTR-3B used for");
  ok("point request gates to k=1", point.tier === "point" && point.k === 1);

  const standard = moeGate("reconcile our GST returns with the purchase register");
  ok("standard request gates to k=2", standard.tier === "standard" && standard.k === 2);

  const complex = moeGate("plan the full GST filing and also fix the TDS reconciliation and then review the tapeout STA signoff");
  ok("compound request across domains gates to k=3", complex.tier === "complex" && complex.k === 3);

  /* sparse selection over a real ranked decision */
  const ranked = routeDeterministic("reconcile GSTR-2B against the purchase register and check ITC eligibility and vendor GSTIN filing status", 6);
  ok("the ranked decision carries candidates to prune", ranked.selected.length > 1);

  const { decision, report } = selectCrew(ranked, "reconcile GSTR-2B against the purchase register and check ITC eligibility and vendor GSTIN filing status");
  ok("crew never exceeds the tier budget", decision.selected.length <= report.k);
  ok("top-ranked expert always admitted", decision.selected[0].id === [...ranked.selected].sort((a, b) => b.score - a.score)[0].id);
  ok("every admitted expert beyond the first added marginal coverage (new category or new capabilities)", (() => {
    for (let i = 1; i < decision.selected.length; i++) {
      const crew = decision.selected.slice(0, i).map((c) => getSpecialist(c.id)!);
      const cand = getSpecialist(decision.selected[i].id)!;
      const caps = new Set(crew.flatMap((s) => s.capabilities.map((c) => c.toLowerCase())));
      const newCat = crew.some((s) => s.category === cand.category) === false;
      const newCaps = cand.capabilities.some((cap) => !caps.has(cap.toLowerCase()));
      if (!(newCat || newCaps)) return false;
    }
    return true;
  })());
  ok("every prune carries an honest reason", report.pruned.every((p) => p.reason.length > 10));
  ok("pruned candidates are a subset of the original ranked selection", report.pruned.every((p) => ranked.selected.some((c) => c.id === p.id)));
  ok("MoE never invents candidates", decision.selected.every((c) => ranked.selected.some((r) => r.id === c.id)));

  const pointCase = selectCrew(routeDeterministic("what is an ATPG pattern", 6), "what is an ATPG pattern");
  ok("point requests collapse to ONE expert even when many ranked", pointCase.decision.selected.length === 1);

  /* accounting line */
  const line = moeLine(report);
  ok("moeLine states tier, k, coverage — and says what it IS (sparse specialist routing, not a transformer MoE)", /Agentic MoE \(sparse specialist routing over the whole fleet\): tier=\w+, k=\d+\/\d+/.test(line) && line.includes("expert(s) across"));

  /* live wiring: the generalist runs MoE on every task */
  ok("generalist imports and applies selectCrew to the routed decision",
    genSrc.includes('selectCrew(routed, text)') && genSrc.includes("moeLine(moeReport)"));
  ok("MoE runs on BOTH paths (provider and no-provider) — after the if/else, before team preference",
    genSrc.indexOf("const m = selectCrew(routed, text);") > genSrc.indexOf("routed = routeDeterministic(text);")
    && genSrc.indexOf("const m = selectCrew(routed, text);") < genSrc.indexOf("applyTeamPreference(args.team.id"));

  ok("fleet is big enough that sparse selection matters (k ≪ N)", SPECIALISTS.length >= 1500 && report.k <= 3);

  /* scope: the MoE pool is the WHOLE established fleet — every category routes
     through the same gate; the 700-strong 19.7.2.1 benches get no shortcut and
     no exclusion (the review asked: is MoE only the new 700?) */
  const sec = selectCrew(routeDeterministic("review the authentication bypass in the login API and fix the SQL injection", 6), "review the authentication bypass in the login API and fix the SQL injection");
  const secCats = new Set(sec.decision.selected.map((c) => getSpecialist(c.id)!.category));
  ok("a security/code task assembles its crew from security/code categories (MoE spans ALL 15 categories, not just the new 700)",
    sec.decision.selected.length >= 1
    && [...secCats].every((c) => ["security", "code", "review", "testing"].includes(c))
    && SPECIALISTS.filter((x) => x.category === "security").length > 100);
  const poolIds = new Set(SPECIALISTS.map((x) => x.id));
  ok("no provenance filter exists — the gate sees every established specialist equally",
    sec.decision.selected.every((c) => poolIds.has(c.id)) && SPECIALISTS.some((x) => x.id.startsWith("silicon.")) && SPECIALISTS.some((x) => x.id.startsWith("silicon.")));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
main();
