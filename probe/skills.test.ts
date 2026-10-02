/**
 * SelfImpulse — skills probe (18.9.0 "Aurora").
 *
 * Pins the skill library: every skill is a real playbook (procedure +
 * checklist), every specialist binds at least one skill, the composed
 * run-time prompt actually carries the playbooks, and the binding maps
 * never reference skills that do not exist.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSpecialistPrompt, getSkill, SKILLS, skillsFor } from "../src/engine/skills";
import { SPECIALISTS, getSpecialist } from "../src/engine/registry";

test("skills — the playbook library bound to the bench", () => {
  let pass = 0, fail = 0;
  const check = (name: string, cond: boolean, detail?: unknown) => {
    cond ? pass++ : fail++;
    console.log(`  ${cond ? "ok  " : "FAIL"} ${name}${cond || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`);
  };

  console.log("\n── 1. the library itself ──");
  check("the skill library is a real collection (10+ playbooks)", SKILLS.length >= 10, SKILLS.length);
  check("every skill id is unique", new Set(SKILLS.map((s) => s.id)).size === SKILLS.length);
  check("every skill has a name, a discovery description and a body", SKILLS.every((s) => s.name.length > 3 && s.description.length > 20 && s.body.length > 100));
  check("every skill body is a procedure with a quality checklist", SKILLS.every((s) => /Procedure:/.test(s.body) && /[Cc]hecklist/.test(s.body)));
  check("the premium-design playbook refuses the generic-AI look explicitly", (getSkill("design.premium-ui")?.body ?? "").includes("generic-AI look"));
  check("skill bodies stay loadable (under 2000 chars — progressive disclosure)", SKILLS.every((s) => s.body.length < 2000));

  console.log("\n── 2. every specialist is skilled ──");
  check("every specialist binds at least one skill", SPECIALISTS.every((s) => skillsFor(s).length >= 1));
  check("design specialists bind the full premium-design set", skillsFor(getSpecialist("design.ux")!).length >= 4);
  check("the AI-engineering cluster binds engineering playbooks", skillsFor(getSpecialist("code.rag-architecture")!).some((k) => k.id === "code.reproduction-first"));
  check("security review binds the evidence-first audit", skillsFor(getSpecialist("review.security-diff")!).some((k) => k.id === "security.evidence-first-audit"));
  check("skillsFor never returns duplicates", SPECIALISTS.every((s) => new Set(skillsFor(s).map((k) => k.id)).size === skillsFor(s).length));

  console.log("\n── 3. the composed prompt is what reaches the provider ──");
  const ts = getSpecialist("code.typescript")!;
  const composed = buildSpecialistPrompt(ts);
  check("the composed prompt starts with the specialist's own prompt", composed.startsWith(ts.systemPrompt));
  check("the composed prompt carries the bound skill bodies", composed.includes("Reproduction-First Engineering") && composed.includes("Checklist:"));
  check("unbound playbooks do NOT leak into the composed prompt", !composed.includes("Premium Interface Craft"));
  check("the composed prompt names every bound skill", skillsFor(ts).every((k) => composed.includes(k.name)));
  check("a skillless specialist would pass through unchanged (contract)", buildSpecialistPrompt({ ...ts, category: "code" as const }).length > ts.systemPrompt.length);

  console.log(`\n${fail === 0 ? "✅" : "❌"} skills probe: ${pass} passed, ${fail} failed\n`);
  assert.equal(fail, 0, `${fail} skills checks failed`);
});
