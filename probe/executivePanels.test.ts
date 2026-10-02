/**
 * probe/executivePanels.test.ts — the three unifying planes (16.9.1).
 *
 * The 16.9.0 external review found the gap: the underlying engines
 * (assuranceScore, finOps, evidencePack, receiptVault) are each probe-pinned,
 * but the COMPOSITION layer — the executive panels that render them — was not.
 * This probe pins the composition contract:
 *
 *   TrustCenterPanel         (Proof door)   — unifies vault + issuer + crosswalk + assurance;
 *                                             exports a Trust Pack naming the crosswalk and the
 *                                             zero-install verifier.
 *   AssuranceScorecardPanel  (Audit door)   — the 0–100 measured-only score, honestly badged.
 *   CostPerOutcomePanel      (Audit door)   — measured chargeback; `unmeasured` stays unmeasured.
 *
 * Ethos pins: real engines (not reinvented math), the labeled-demo disclosure,
 * token-only styling (no hardcoded palette hex outside the theme system), and
 * both doors actually render the panels.
 */
import { test, } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

declare const SI_ROOT: string;
const root = SI_ROOT ?? process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

/* 19.7.12 (UI): the ExecutivePanels composition (Trust Center · Assurance
 * Scorecard · Cost per Outcome) and the Proof/Audit doors that rendered it were
 * RETIRED with the old shell — they were a web-edition "labeled demo" layer
 * over engines that remain live. What this suite pins now is the honest
 * remainder: the engines exist, they are the ONLY source of those numbers, the
 * honesty strings survive in the engines themselves, and no retired panel
 * source is still in the tree pretending to be a product surface. */
const assurance = read("src/mission/assuranceScore.ts");
const finOps = read("src/mission/finOps.ts");
const evidencePack = read("src/mission/evidencePack.ts");
const vault = read("src/mission/receiptVault.ts");
const surfaces = read("src/mission/evidenceSurfaces.ts");

let passed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) passed++;
  else failures.push(detail ? `${label} — ${detail}` : label);
  console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` — ${detail}`}`);
};

const section = (t: string): void => console.log(`\n== ${t} ==\n`);

test("executivePanels — the engines behind the retired panels are pinned", () => {
  section("1. the engines exist and are the real ones");
  ok("the assurance engine exists (scoreAssurance)", /export function scoreAssurance\(/.test(assurance));
  ok("the chargeback engine exists (rowFor)", /export function rowFor\(/.test(finOps));
  ok("the control crosswalk exists (EVIDENCE_CONTROL_MAPPINGS)", /EVIDENCE_CONTROL_MAPPINGS/.test(evidencePack));
  ok("the LIVE receipt vault exists (globalReceiptVault)", /export const globalReceiptVault = new ReceiptVault\(\)/.test(vault));
  ok("the surfaces module composes assurance + chargeback from LOOP STATE, not from a view", /assuranceFromLoopState/.test(surfaces) && /chargebackFromLoopState/.test(surfaces));

  section("2. the honesty contract lives in the engines, not in a panel");
  ok("the unmeasured honesty string survives in the assurance engine", /unevaluated|unmeasured/.test(assurance));
  ok("the evidence pack names the zero-install verifier", /tools\/verify-receipt\.mjs/.test(evidencePack + read("src/mission/securityReview.ts")));

  section("3. the retired composition is GONE — no demo panel ships as a product surface");
  for (const f of ["src/panels/ExecutivePanels.tsx", "src/pages/ProofPage.tsx", "src/pages/AuditPage.tsx"]) {
    ok(`${f} is not in the tree`, !fs.existsSync(path.join(root, f)));
  }
  ok("no 'labeled demo' badge survives anywhere under src/ui", !fs.readdirSync(path.join(root, "src/ui"), { recursive: true }).some((f) => {
    const abs = path.join(root, "src/ui", String(f));
    return fs.statSync(abs).isFile() && /labeled demo/.test(fs.readFileSync(abs, "utf8"));
  }));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  assert.equal(failures.length, 0, failures.join("; "));
});
