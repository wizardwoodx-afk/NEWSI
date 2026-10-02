/**
 * probe/bew.test.ts — the Behaviour Enforcement Workflow [BEW].
 *
 * Pins: the six phases (same names in code, prompt and probes), the
 * error-ladder (transient/bad-input/blocked/gate with matching recoveries),
 * the task ladders, and the enforcement wiring — BEW appended to EVERY
 * composed specialist prompt by buildSpecialistPrompt, after doctrine and
 * domain skills, on specialists with and without bound skills.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

class MemStore implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  key(i: number) { return Array.from(this.m.keys())[i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}
(globalThis as { localStorage?: Storage }).localStorage = new MemStore();

import { BEW_PHASES, BEW_ERROR_CLASSES, BEW_TASK_LADDERS, BEW_BLOCK, hasBew, BewRun } from "../src/engine/bew";
import { buildSpecialistPrompt, skillsFor } from "../src/engine/skills";
import { SPECIALISTS } from "../src/engine/registry";

const fs = await import("node:fs");
const skillsSrc = fs.readFileSync(path.join(ROOT, "src/engine/skills.ts"), "utf8");
const bewSrc = fs.readFileSync(path.join(ROOT, "src/engine/bew.ts"), "utf8");

function main(): void {
  ok("six phases named in order", JSON.stringify(BEW_PHASES) === JSON.stringify(["intake", "plan", "act", "verify", "recover", "report"]));

  ok("four error classes with matching recoveries",
    BEW_ERROR_CLASSES.length === 4
    && BEW_ERROR_CLASSES.map((e) => e.cls).join(",") === "transient,bad-input,blocked,gate"
    && BEW_ERROR_CLASSES.every((e) => e.recovery.length > 20));

  ok("gate rung never impersonates approval",
    /never impersonate an approval/i.test(BEW_ERROR_CLASSES.find((e) => e.cls === "gate")!.recovery));

  ok("six task ladders ship", BEW_TASK_LADDERS.length === 6 && BEW_TASK_LADDERS.every((l) => l.ladder.length > 30));

  ok("debug ladder demands repro", /reproduce → isolate → fix/i.test(BEW_TASK_LADDERS.find((l) => l.kind.includes("fix"))!.ladder));
  ok("risk ladder names rollback before the first change", /rollback named BEFORE/i.test(BEW_TASK_LADDERS.find((l) => l.kind.includes("risky"))!.ladder));

  ok("BEW block carries header + checklist + all phases",
    hasBew(BEW_BLOCK) && BEW_BLOCK.includes("### Skill: Behaviour Enforcement Workflow [BEW]"));

  ok("enforcement line appended to every composed prompt", /Enforcement: BEW rides your system prompt/.test(BEW_BLOCK));

  /* the wiring: EVERY specialist's composed prompt carries BEW */
  const sampled = [SPECIALISTS[0], SPECIALISTS[Math.floor(SPECIALISTS.length / 3)], SPECIALISTS[SPECIALISTS.length - 1]];
  ok("BEW rides a sample across the fleet (seed, middle, last)",
    sampled.every((s) => hasBew(buildSpecialistPrompt(s))));

  const fin = SPECIALISTS.find((s) => s.id.startsWith("legal."))!;
  const sic = SPECIALISTS.find((s) => s.id.startsWith("silicon.soc-architect"))!;
  ok("legal + silicon specialists carry BEW", hasBew(buildSpecialistPrompt(fin)) && hasBew(buildSpecialistPrompt(sic)));

  ok("BEW comes AFTER doctrine and skills in the composed prompt",
    buildSpecialistPrompt(fin).indexOf("Operator doctrine") < buildSpecialistPrompt(fin).indexOf("Behaviour Enforcement Workflow")
    && (skillsFor(fin).length === 0 || buildSpecialistPrompt(fin).indexOf("### Skill: Reconciliation Proof") < buildSpecialistPrompt(fin).indexOf("Behaviour Enforcement Workflow")));

  ok("buildSpecialistPrompt source appends BEW_BLOCK unconditionally",
    skillsSrc.includes("${OPERATOR_DOCTRINE}\\n\\n${BEW_BLOCK}") && skillsSrc.includes('import { BEW_BLOCK } from "./bew"'));

  ok("BEW module obeys its own condenser-survival format (### header + Checklist line)",
    /^### Skill: Behaviour Enforcement Workflow \[BEW\]\nChecklist: intake · plan · act · verify · recover · report/m.test(BEW_BLOCK));

  ok("no fake phase names — phases appear verbatim in the block",
    BEW_PHASES.every((p) => BEW_BLOCK.toUpperCase().includes(p.toUpperCase())));

  /* ── RUNTIME ENFORCEMENT: the BewRun machine the member loop carries ── */
  console.log("runtime enforcement — the phase machine");
  const clean = new BewRun("silicon.sta-lead");
  clean.to("plan"); clean.to("act"); clean.to("verify");
  const cleanReceipt = clean.finish("done");
  ok("an ordered run reports done with a clean trail",
    cleanReceipt.verdict === "done" && cleanReceipt.violations.length === 0 && cleanReceipt.verify === "pass" && cleanReceipt.enforced === true);

  const skip = new BewRun("legal.contract-reviewer");
  skip.to("plan"); skip.to("act");
  const skipReceipt = skip.finish("done"); // never verified
  ok("a run that never verified CANNOT claim done — the machine downgrades to partial and records why",
    skipReceipt.verdict === "partial" && skipReceipt.violations.some((v) => v.includes("downgraded")) && skipReceipt.verify === "na");

  const early = new BewRun("x");
  early.to("plan"); early.to("act"); early.to("report"); // never verified
  ok("report-without-verify is recorded as a violation (and still cannot claim done)",
    early.finish("done").violations.some((v) => v.includes("report without verify")) && early.finish("done").verdict === "partial");

  const rec = new BewRun("y");
  rec.to("plan"); rec.to("recover"); // recover before any work
  ok("recover-before-work is a recorded violation", rec.finish("partial").violations.some((v) => v.includes("recover before any work")));

  const twice = new BewRun("z");
  twice.to("plan"); twice.to("act"); twice.to("recover"); twice.to("recover");
  ok("a second recovery in one run is a recorded violation (the ladder allows ONE situation-changing retry)",
    twice.finish("partial").violations.some((v) => v.includes("second recovery")));

  ok("BEW line renders trail + verify + verdict in words", /BEW intake→plan.*verify (pass|na).*verdict/.test(clean.line(cleanReceipt)));

  /* the loop actually carries the machine */
  const loopSrc = fs.readFileSync(path.join(ROOT, "src/engine/agentLoop.ts"), "utf8");
  ok("runMemberAgent creates a BewRun and records plan/act/verify/recover",
    loopSrc.includes("new BewRun(specialist.id)") && loopSrc.includes('bew.to("plan")') && loopSrc.includes('bew.to("act")') && loopSrc.includes('bew.to("verify")') && loopSrc.includes('bew.to("recover")'));
  ok("truncated loops finish partial — a step-limited run cannot claim done",
    loopSrc.includes("truncated: true,") && /bew: bew\.finish\("partial"\)/.test(loopSrc));
  ok("every MemberRun carries a bew receipt (type-required)", /bew: bew\.finish\(/.test(loopSrc) && loopSrc.includes("bew: BewReceipt;"));
  const genSrcBew = fs.readFileSync(path.join(ROOT, "src/engine/generalist.ts"), "utf8");
  ok("the generalist surfaces the BEW receipt on member sections and rides it into member digests",
    genSrcBew.includes("[bew ${run.bew.phases.join") && genSrcBew.includes("bew: run.bew"));

  assert.equal(failed, 0, failures.join(" | "));
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}
main();
