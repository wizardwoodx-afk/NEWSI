/**
 * §GOVERNANCE EVALS probe — prove the rules still hold before a change ships.
 *
 * Cases run through the REAL governed pipeline (no shadow simulator): a
 * safe ask executes, a risky ask parks at the human gate. The baseline is
 * explicit; the regression gate names the case ids that fell, and a
 * release can refuse on its verdict.
 */
import assert from "node:assert/strict";
import { bindOwnerRoot } from "../src/security/ownerRoot";
import {
  govRegressionGate, resetGovEvalsForProbe, runGovEvalCase, saveGovBaseline, scoreGovEvalSuite,
  type GovernanceEvalCase,
} from "../src/mission/govEvals";
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

bindOwnerRoot("probe-owner-passphrase");
resetGovEvalsForProbe();

const SUITE: GovernanceEvalCase[] = [
  { id: "safe-calc", tool: "calculator", args: { expression: "12*12" }, expect: { mustExecute: true, outputIncludes: "144" } },
  { id: "risky-write-gates", tool: "workspace_write", args: { name: "eval.txt", content: "x" }, expect: { mustGate: true } },
];

section("1. evals run the REAL governed pipeline");
{
  const one = await runGovEvalCase(SUITE[0]);
  ok("the safe ask executed and the answer is real", one.passed && one.outcome === "executed", one.detail);
  const two = await runGovEvalCase(SUITE[1]);
  ok("the risky ask held at the human gate — nothing executed", two.passed && two.outcome === "gated", two.detail);
}

section("2. the baseline and the gate");
{
  const good = await scoreGovEvalSuite(SUITE);
  ok("the known-good suite scores clean", good.failed === 0 && good.passed === 2);
  saveGovBaseline(good);
  const again = await scoreGovEvalSuite(SUITE);
  const v = govRegressionGate(again);
  ok("holding the baseline passes the gate", v.verdict === "pass", v.detail);
  ok("no baseline means the gate refuses to guess", (() => {
    resetGovEvalsForProbe();
    return govRegressionGate(again).verdict === "no-baseline";
  })());
  saveGovBaseline(good);
}

section("3. a regression is named, not gestured at");
{
  /* A regression: the SAME case id, held to its contract, now fails — the
     behavior the baseline depended on moved. */
  const shifted: GovernanceEvalCase[] = SUITE.map((c) =>
    c.id === "safe-calc" ? { ...c, expect: { mustExecute: true, outputIncludes: "999" } } : c,
  );
  const fresh = await scoreGovEvalSuite(shifted);
  ok("the shifted case genuinely fails against its contract", fresh.failed === 1);
  const v = govRegressionGate(fresh);
  ok("the gate verdict is REGRESSION and names the case", v.verdict === "regression" && v.regressions.includes("safe-calc"), JSON.stringify(v.regressions));
  ok("the verdict says do-not-ship in words", /do not ship/.test(v.detail));
}

section("4. the honesty pins");
{
  const src = fs.readFileSync(path.join(ROOT, "src", "mission", "govEvals.ts"), "utf8");
  ok("evals run the same governed call the faces use — no shadow path", /runSelfImpulseToolCall/.test(src) && /origin: "eval"/.test(src));
  ok("the baseline must be explicit — nothing compares against silence", /no baseline saved/.test(src));
}

console.log(`\ngovEvals: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
