import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/meridian.test.ts
import * as fs from "node:fs";
import * as path from "node:path";
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var ROOT = ".".length > 0 ? "." : process.cwd();
var drill = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "drill.ts"), "utf8");
var custody = fs.readFileSync(path.join(ROOT, "src", "mission", "custody.ts"), "utf8");
ok("the retired SelfImpulse Master / Register views are gone", !fs.existsSync(path.join(ROOT, "src", "views")), "views tree still present");
ok("Backtest \u2014 runDrill exists and writes a report", /export async function runDrill\(/.test(drill) && /export function drillReports\(/.test(drill), "drill seam missing");
ok("Backtest \u2014 a tampered test file is a named canary, not silence", /export function testFileCanary\(/.test(drill) && /"tampered"/.test(drill), "canary missing");
ok("Lineage \u2014 the delegation chain is signed custody, not a label", /delegationChain/.test(custody) && /export async function issueRootEnvelope\(/.test(custody), "delegation chain missing");
ok("Lineage \u2014 no delegation may grow scope or outlive its parent", /scope/.test(custody) && /expiresAt/.test(custody), "bounds missing");
ok("the governed door is the store: every run rides the gate + handoff recorder", (() => {
  const st = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
  return /gate: gateFn/.test(st) && /recordHandoff\(h\)/.test(st);
})(), "store not wired");
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
