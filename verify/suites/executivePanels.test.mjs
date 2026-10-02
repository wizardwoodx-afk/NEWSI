import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/executivePanels.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
var root = ".";
var read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
var assurance = read("src/mission/assuranceScore.ts");
var finOps = read("src/mission/finOps.ts");
var evidencePack = read("src/mission/evidencePack.ts");
var vault = read("src/mission/receiptVault.ts");
var surfaces = read("src/mission/evidenceSurfaces.ts");
var passed = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) passed++;
  else failures.push(detail ? `${label} \u2014 ${detail}` : label);
  console.log(`  ${cond ? "ok " : "FAIL"} ${label}${cond ? "" : ` \u2014 ${detail}`}`);
};
var section = (t) => console.log(`
== ${t} ==
`);
test("executivePanels \u2014 the engines behind the retired panels are pinned", () => {
  section("1. the engines exist and are the real ones");
  ok("the assurance engine exists (scoreAssurance)", /export function scoreAssurance\(/.test(assurance));
  ok("the chargeback engine exists (rowFor)", /export function rowFor\(/.test(finOps));
  ok("the control crosswalk exists (EVIDENCE_CONTROL_MAPPINGS)", /EVIDENCE_CONTROL_MAPPINGS/.test(evidencePack));
  ok("the LIVE receipt vault exists (globalReceiptVault)", /export const globalReceiptVault = new ReceiptVault\(\)/.test(vault));
  ok("the surfaces module composes assurance + chargeback from LOOP STATE, not from a view", /assuranceFromLoopState/.test(surfaces) && /chargebackFromLoopState/.test(surfaces));
  section("2. the honesty contract lives in the engines, not in a panel");
  ok("the unmeasured honesty string survives in the assurance engine", /unevaluated|unmeasured/.test(assurance));
  ok("the evidence pack names the zero-install verifier", /tools\/verify-receipt\.mjs/.test(evidencePack + read("src/mission/securityReview.ts")));
  section("3. the retired composition is GONE \u2014 no demo panel ships as a product surface");
  for (const f of ["src/panels/ExecutivePanels.tsx", "src/pages/ProofPage.tsx", "src/pages/AuditPage.tsx"]) {
    ok(`${f} is not in the tree`, !fs.existsSync(path.join(root, f)));
  }
  ok("no 'labeled demo' badge survives anywhere under src/ui", !fs.readdirSync(path.join(root, "src/ui"), { recursive: true }).some((f) => {
    const abs = path.join(root, "src/ui", String(f));
    return fs.statSync(abs).isFile() && /labeled demo/.test(fs.readFileSync(abs, "utf8"));
  }));
  console.log(`
${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
  }
  assert.equal(failures.length, 0, failures.join("; "));
});
