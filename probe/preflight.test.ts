/**
 * Patina (17.1) — preflight probe.
 *
 * In Patina the Helm performs the preflight role: risky actions are
 * SIMULATED before execution and PAUSED at the human gate. This probe
 * asserts that the simulate + gate pipeline is wired (the new preflight)
 * instead of asserting the legacy PreflightPanel UI.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { bindOwnerRoot } from "../src/security/ownerRoot";
bindOwnerRoot("probe-owner-passphrase");

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

const engine = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
// 19.7.12 (UI): the Helm was unmounted dead code since 19.6.6; the human gate now lives in the store + GateCard.
const helm = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
const gateCard = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "GateCard.tsx"), "utf8");

ok("simulateSelfImpulseAction exists (preflight prediction)", /simulateSelfImpulseAction/.test(engine), "no simulate");
ok("risky tools are routed through the human gate", /RISKY_TOOLS/.test(engine) && /requestSelfImpulseApproval/.test(engine), "no gate");
ok("the shell holds the pending gate and Work counts it (\"Waiting on you\")", /gate: PendingGate \| null/.test(helm) && fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Work.tsx"), "utf8").includes("Waiting on you"), "shell ignores the pending gate");
ok("every selfimpulseed receipt carries a simulation event when a risky tool ran", /selfimpulse\.simulation/.test(engine), "no simulation event");
ok("the real shell surfaces the gate (Approve / Refuse, both receipted)", /decideGate\(\{ approved: true \}\)/.test(gateCard) && /decideGate\(\{ approved: false, reason/.test(gateCard) && /decideGate:/.test(helm), "gate buttons missing");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
