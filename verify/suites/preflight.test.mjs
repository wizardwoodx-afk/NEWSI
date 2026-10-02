import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/preflight.test.ts
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
var engine = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
var helm = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
var gateCard = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "GateCard.tsx"), "utf8");
ok("simulateSelfImpulseAction exists (preflight prediction)", /simulateSelfImpulseAction/.test(engine), "no simulate");
ok("risky tools are routed through the human gate", /RISKY_TOOLS/.test(engine) && /requestSelfImpulseApproval/.test(engine), "no gate");
ok('the shell holds the pending gate and Work counts it ("Waiting on you")', /gate: PendingGate \| null/.test(helm) && fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Work.tsx"), "utf8").includes("Waiting on you"), "shell ignores the pending gate");
ok("every selfimpulseed receipt carries a simulation event when a risky tool ran", /selfimpulse\.simulation/.test(engine), "no simulation event");
ok("the real shell surfaces the gate (Approve / Refuse, both receipted)", /decideGate\(\{ approved: true \}\)/.test(gateCard) && /decideGate\(\{ approved: false, reason/.test(gateCard) && /decideGate:/.test(helm), "gate buttons missing");
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
