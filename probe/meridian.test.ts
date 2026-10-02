/**
 * Patina (17.1) — governance-meridian probe.
 *
 * Replaces the legacy Inspector-on-selection probe (Canvas-era). In Patina,
 * the "meridian" invariant is that SelfImpulse Master tabs govern the ship and
 * the four unique differentiator surfaces (Sweep / Backtest / Lineage /
 * Hindsight) all mount real actions through the selfimpulse bridge.
 */
import * as fs from "node:fs";
import * as path from "node:path";

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
/* 19.7.12 (UI): SelfImpulse Master / Register were unmounted dead code since the
   19.6.6 console and are now deleted. The meridian invariant survives at the
   engine seams the tabs wrapped: the drill (Backtest) engine and the
   delegation chain (Lineage) are real functions with reports, not UI props. */
const drill = fs.readFileSync(path.join(ROOT, "src", "selfimpulse", "engine", "drill.ts"), "utf8");
const custody = fs.readFileSync(path.join(ROOT, "src", "mission", "custody.ts"), "utf8");

ok("the retired SelfImpulse Master / Register views are gone", !fs.existsSync(path.join(ROOT, "src", "views")), "views tree still present");
ok("Backtest — runDrill exists and writes a report", /export async function runDrill\(/.test(drill) && /export function drillReports\(/.test(drill), "drill seam missing");
ok("Backtest — a tampered test file is a named canary, not silence", /export function testFileCanary\(/.test(drill) && /"tampered"/.test(drill), "canary missing");
ok("Lineage — the delegation chain is signed custody, not a label", /delegationChain/.test(custody) && /export async function issueRootEnvelope\(/.test(custody), "delegation chain missing");
ok("Lineage — no delegation may grow scope or outlive its parent", /scope/.test(custody) && /expiresAt/.test(custody), "bounds missing");
ok("the governed door is the store: every run rides the gate + handoff recorder", (() => { const st = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8"); return /gate: gateFn/.test(st) && /recordHandoff\(h\)/.test(st); })(), "store not wired");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
