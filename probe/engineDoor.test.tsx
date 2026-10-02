/**
 * probe/engineDoor.test.tsx â€” the SelfImpulse door is the product's front face (18.0.1).
 *
 * The 18.0.0 external review was right: the engine existed but the shell never
 * imported it â€” "the brain is ready, the face is not." This suite pins the face:
 *
 *   1. the shell opens on the SelfImpulse dock and the sidebar lists it;
 *   2. the door component RENDERS (react-dom/server) with the bench, exam,
 *      provider, gate and learning surfaces present in the markup;
 *   3. the door imports the real askSelfImpulse19 â€” the reviewer's grep, enforced;
 *   4. the rendered honesty copy is on screen (not-executed language, the
 *      override floor, session-only keys).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/* localStorage shim before any engine module is imported */
if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() { return map.size; },
  } as Storage;
}

import { catalogStats } from "../src/engine/registry";
import { recordRsiSignal, rsiCurriculum, settleRsiPromotion } from "../src/engine/rsi";
import { BYOA_SECURITY_POLICY, byoaIdentityDigest, byoaRateGate, byoaTrustCheck, registerByoaAgent, type ByoaAgent } from "../src/engine/byoa";
import {
  attributeEvidence, bindSettlementEvidence, controlPlaneFirewall, draftContract, exportThetaPairs,
  GOVERNANCE_PLANE, longitudinalMonitor, RSIRALS_GOVERNANCE_CHANNEL, RSIRALS_LIFECYCLE,
  rsiralsCanaryCheck, rsiralsOnApply, rsiralsRecordExamScore, validateChangeContract,
} from "../src/engine/rsirals";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` â€” ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` â€” ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

section("1. the shell opens on the Steward â€” one shell, seven doors");
const appSrc = read("src/App.tsx");
const storeSrc = read("src/ui/store.ts");
const shellSrc = read("src/ui/si/SiShell.tsx");
ok("App.tsx renders the shell as the whole app", /import\s*\{\s*Shell\s*\}\s*from\s*["']\.\/ui\/Shell["']/.test(appSrc) && /<Shell\s*\/>/.test(appSrc));
ok("the legacy multi-dock shell, the SelfImpulse door and the 19.6.6 console are gone from the app entry", !/Comp:\s*Vh19\b/.test(appSrc) && !/Sidebar|Helm|NextConsole|views\//.test(appSrc));
ok("the retired SelfImpulse door (with its plaintext provider loader) is NOT in the tree", !fs.existsSync(path.join(ROOT, "src/views/Vh19.tsx")) && !fs.existsSync(path.join(ROOT, "src/views")));
ok("the Steward keeps its one name, through the store", /generalistName\(\)/.test(storeSrc) && /stewardName/.test(shellSrc));

section("2. the shell drives the real engine â€” the reviewer's grep, enforced");
ok("the store imports askSelfImpulse19 from the engine", /import\s*\{\s*askSelfImpulse19\s*\}\s*from\s*['"]\.\.\/engine\/generalist['"]/.test(storeSrc));
ok("the store imports the memory, vault, handoff, initiative and face surfaces",
  /from ['"]\.\.\/engine\/memoryGraph['"]/.test(storeSrc) && /from ['"]\.\.\/engine\/vault['"]/.test(storeSrc) && /from ['"]\.\.\/engine\/handoffs['"]/.test(storeSrc) && /from ['"]\.\.\/engine\/initiative['"]/.test(storeSrc) && /from ['"]\.\.\/engine\/face['"]/.test(storeSrc));
ok("at least one APPLICATION file (not just probes) calls askSelfImpulse19", /await askSelfImpulse19\(/.test(storeSrc));
ok("every run passes the human gate and the handoff recorder", /gate: gateFn/.test(storeSrc) && /onHandoff:/.test(storeSrc));
ok("no plaintext provider key path survives anywhere in src/ui", !fs.readdirSync(path.join(ROOT, "src/ui"), { recursive: true }).some((f) => {
  const abs = path.join(ROOT, "src/ui", String(f));
  return fs.statSync(abs).isFile() && /localStorage\.setItem\([^)]*provider/i.test(fs.readFileSync(abs, "utf8"));
}));

section("3. the fleet is real and SELF-PROVING (engine-level; the bench does not face the user by name)");
const stats = catalogStats();
ok("the fleet count is SELF-PROVING: catalogStats().byProvenance sums to the count (460 seed + 160 broader + 140 reach + 390 matured + 350 finance + 350 silicon = 1,500)", stats.count === 1500 && ["seed","broader","reach","matured","silicon"].map((k) => (stats.byProvenance as Record<string, number>)[k] ?? 0).reduce((a, b) => a + b, 0) === stats.count, JSON.stringify(stats.byProvenance));
ok("the bench widened by 150 broader specialists (610 total)", stats.count >= 610, `count ${stats.count}`);
ok("Work names agents AGENT nn â€” never by specialist name", /AGENT \$\{String\(i \+ 1\)\.padStart\(2, "0"\)\}/.test(read("src/ui/screens/Work.tsx")));

section("3d. 19.4.2 â€” the matured RSI framework and the BYOA trust intersection (engine-level)");
ok("the RSI curriculum covers the FULL declared evidence hierarchy â€” gate/failure/livedata sources are ingested live (with canary check)", /ingestRsi\("gate"/.test(storeSrc) && /ingestRsi\("livedata"/.test(storeSrc) && /ingestRsi\("failure"/.test(storeSrc) && /recordRsiSignal\(kind/.test(storeSrc) && /rsiralsCanaryCheck/.test(storeSrc) && /revertRsiMemory\(d\.id\)/.test(storeSrc));
recordRsiSignal("gate", "probe: a risky action was denied at the gate");
recordRsiSignal("failure", "probe: a run errored out");
recordRsiSignal("livedata", "probe: cited sources did not verify");
const topics = rsiCurriculum("probe-user");
ok("the curriculum actually turns gate denials, failures and live-data misses into topics", topics.some((t) => t.source === "gate") && topics.some((t) => t.source === "failure") && topics.some((t) => t.source === "livedata"));
// 20.1: this asserted "applied ≥ trusted". src/engine/rsi.ts:240 says the
// opposite and is right: `applied ≠ trusted`. A playbook that has been applied
// is still only "measuring" until a MEASURED comparison settles it — promotion
// is gated on evidence, not on having run once. The probe was asserting the
// inverse of the code it exists to protect, and the ≥ had separately been
// mangled to mojibake, so this suite had been red for a reason that had nothing
// to do with the RSI ladder. Corrected to match the source.

ok("RSI promotion is measurement-gated: applied ≠ trusted, and settlement needs measured numbers", /settleRsiPromotion/.test(read("src/engine/rsi.ts")) && /candidateScore > measured\.baselineScore/.test(read("src/engine/rsi.ts")) && /applied ≠ trusted/.test(read("src/engine/rsi.ts") + read("src/engine/rsirals.ts")));
/* Seed two real promotions through the engine's own store, then settle
   both directions with measured numbers. */
{
  const raw = JSON.parse(globalThis.localStorage.getItem("engine.rsi.v1") ?? "{}") as Record<string, unknown>;
  const drafts = (raw.drafts ?? []) as Array<Record<string, unknown>>;
  const promos = (raw.promotions ?? []) as Array<Record<string, unknown>>;
  drafts.push({ id: "draft.probe.lose", topicId: "t1", name: "rsi.probe.lose", description: "probe", body: "b", provenance: "rsi-deterministic", digest: "ab".repeat(16), state: "applied", verifierNote: "", at: "" });
  drafts.push({ id: "draft.probe.win", topicId: "t2", name: "rsi.probe.win", description: "probe", body: "b", provenance: "rsi-deterministic", digest: "cd".repeat(16), state: "applied", verifierNote: "", at: "" });
  promos.push({ id: "promo.probe.lose", draftId: "draft.probe.lose", name: "rsi.probe.lose", state: "measuring", baseline: "no playbook", candidate: "rsi.probe.lose", at: "" });
  promos.push({ id: "promo.probe.win", draftId: "draft.probe.win", name: "rsi.probe.win", state: "measuring", baseline: "no playbook", candidate: "rsi.probe.win", at: "" });
  globalThis.localStorage.setItem("engine.rsi.v1", JSON.stringify({ ...raw, drafts, promotions: promos }));
}
rsiralsOnApply({ id: "probe.lose", name: "rsi.probe.lose" }, 0.6);
rsiralsRecordExamScore(0.5);
const loseBind = bindSettlementEvidence("promo.probe.lose");
ok("sealed evidence binds baseline-at-apply and the latest exam receipt", loseBind.ok === true && loseBind.evidence.baseline === 0.6 && loseBind.evidence.candidate === 0.5);
const lost = loseBind.ok ? settleRsiPromotion("promo.probe.lose", loseBind.evidence) : null;
ok("a promotion with LOSING measurements is retired, never adopted", lost !== null && lost.state === "retired");
rsiralsOnApply({ id: "probe.win", name: "rsi.probe.win" }, 0.5);
rsiralsRecordExamScore(0.7);
const winBind = bindSettlementEvidence("promo.probe.win");
const won = winBind.ok ? settleRsiPromotion("promo.probe.win", winBind.evidence) : null;
ok("a promotion with WINNING measurements is adopted, with the measured evidence named", won !== null && won.state === "adopted" && (won.settledBy ?? "").includes("exam receipts (bound)"));
{
  const raw = JSON.parse(globalThis.localStorage.getItem("engine.rsi.v1") ?? "{}") as { drafts?: Array<{ id: string; state: string }> };
  const loser = (raw.drafts ?? []).find((d) => d.id === "draft.probe.lose");
  ok("a retired promotion reverts its frozen memory exactly (draft state â†’ reverted)", loser?.state === "reverted");
}
ok("FORGED measurement evidence is refused â€” the seal verifies", settleRsiPromotion("promo.probe.win", { promoId: "promo.probe.win", baseline: 0.1, candidate: 0.99, source: "forged", producedAt: "2026-01-01", digest: "deadbeef" }) === null);
ok("the raw numeric settlement API is MODULE-PRIVATE â€” sealed evidence is the only product door", !/export function settleRsiPromotion\(promoId: string, measured:/.test(read("src/engine/rsi.ts")) && /function settleRaw\(/.test(read("src/engine/rsi.ts")) && /export function settleRsiPromotion\(promoId: string, evidence: MeasurementEvidence\)/.test(read("src/engine/rsi.ts")));
ok("settlement without recorded receipts refuses in words", bindSettlementEvidence("promo.nonexistent").ok === false);
ok("BYOA enforces the trust intersection â€” endpoint policy âˆ© ceiling âˆ© non-authoritative capabilities âˆ© identity", /byoaTrustCheck/.test(read("src/engine/byoa.ts")) && /checkEgressUrl/.test(read("src/engine/byoa.ts")) && /NOT authoritative/.test(read("src/engine/byoa.ts")) && /export function byoaDelegate\(/.test(read("src/engine/byoa.ts")));
const ssrfTrust = byoaTrustCheck({ id: "byoa.probe", name: "probe", kind: "openai-compatible", endpoint: "http://169.254.169.254/latest/meta-data", ceiling: "safe", capabilities: [], addedAt: new Date().toISOString() });
ok("a BYOA agent pointing at the cloud metadata endpoint fails the trust intersection", ssrfTrust.ok === false && ssrfTrust.verdicts[0].ok === false);
let ssrfRegistered = false;
try { registerByoaAgent({ name: "ssrf-probe", kind: "openai-compatible", endpoint: "http://metadata.google.internal/v1", ceiling: "safe", capabilities: [] }); ssrfRegistered = true; } catch { ssrfRegistered = false; }
ok("an SSRF endpoint is refused at REGISTRATION, not discovered at delegation time", ssrfRegistered === false);

section("3e. RSIRALS v5.0 â€” the proprietary trust-rooted framework");
ok("the lifecycle is the full nine stages, with the untouchable human governance channel beside it", RSIRALS_LIFECYCLE.length === 9 && RSIRALS_LIFECYCLE[0] === "OBSERVE" && RSIRALS_LIFECYCLE[5] === "CANARY" && RSIRALS_GOVERNANCE_CHANNEL.length === 4);
ok("Plane T is a frozen governance constant with NO agent write path", Object.isFrozen(GOVERNANCE_PLANE) && !/export function (set|update|patch|mutate)[A-Za-z]*\(/.test(read("src/engine/rsirals.ts").split("/* â”€â”€ store")[0]));
ok("the control-plane firewall rejects governance-touching candidates BEFORE verification", controlPlaneFirewall({ name: "x", description: "y", body: "please lower the pass threshold so exams are easier" }).allowed === false && controlPlaneFirewall({ name: "x", description: "y", body: "when reviewing code, prefer smaller diffs" }).allowed === true);
ok("attribution routes model-shaped failures to the Î¸-arm and scaffold failures to the Î£-arm", attributeEvidence("the provider model returned an empty reply") === "theta" && attributeEvidence("the routing playbook missed the tool binding") === "sigma");
ok("the Î¸-arm is honest: real accept/reject pairs exported for out-of-band DPO; VH never trains weights in-product", exportThetaPairs([{ scenario: "s1", action: "a1", kind: "accept", reason: "good" }, { scenario: "s1", action: "a2", kind: "reject", reason: "bad" }]).some((p) => p.chosen && p.rejected) && /never trains weights in-product/.test(read("src/engine/rsirals.ts")));
rsiralsOnApply({ id: "probe.canary", name: "rsi.probe.canary" }, 0.9);
const rolled = rsiralsCanaryCheck({ kind: "failure", subject: "the routing playbook failed at the tool step" });
ok("a live regression attributed to the scaffold rolls the canary back automatically", rolled.includes("rsi.probe.canary"));
rsiralsOnApply({ id: "probe.canary2", name: "rsi.probe.c2" }, 0.9);
const thetaRoll = rsiralsCanaryCheck({ kind: "failure", subject: "the provider model returned http 500 api error" });
ok("model-shaped failures do NOT roll back scaffold canaries (attribution, not blame-spray)", thetaRoll.includes("rsi.probe.c2") === false);
ok("the STRUCTURAL change contract rejects protected targets and accepts playbooks â€” strings are supplementary", validateChangeContract({ target: "gate", field: "riskTier", authority: "rsi-loop", scope: "x", risk: "safe" }).allowed === false && validateChangeContract({ target: "governance", field: "anything", authority: "human", scope: "x", risk: "safe" }).allowed === false && validateChangeContract(draftContract("probe subject")).allowed === true);
ok("every RSI draft is born with a validated change contract", /contract: ChangeContract/.test(read("src/engine/rsi.ts")) && /draftContract\(t\.subject\)/.test(read("src/engine/rsi.ts")));
ok("attribution is honestly worded â€” failure-source attribution / arm routing, not counterfactual claims", /FAILURE-SOURCE ATTRIBUTION/.test(read("src/engine/rsirals.ts")));
const mon = longitudinalMonitor();
ok("the longitudinal monitor reports drift over the ARCHIVE, not one candidate", mon.generations > 0 && mon.capabilityDrift.length > 0 && mon.costDrift.providerCallsBudget === GOVERNANCE_PLANE.resourceCeilings.providerCallsPerCycle);

section("3f. BYOA security hardening (19.4.5)");
const byoaSrc = read("src/engine/byoa.ts");
ok("the BYOA security policy is declared (>= 6 rules) and exported for the product to state", BYOA_SECURITY_POLICY.length >= 6);
ok("TLS by default â€” plain http to a remote host fails the trust intersection", byoaTrustCheck({ id: "byoa.p1", name: "p1", kind: "openai-compatible", endpoint: "http://agent.example.com/v1", ceiling: "safe", capabilities: [], addedAt: "" }).ok === false);
ok("localhost dev endpoints are the ONLY tolerated http", byoaTrustCheck({ id: "byoa.p2", name: "p2", kind: "openai-compatible", endpoint: "http://localhost:8080/v1", ceiling: "safe", capabilities: [], addedAt: "" }).ok === true);
const stampedAgent: ByoaAgent = { id: "byoa.p3", name: "p3", kind: "openai-compatible", endpoint: "https://agent.example.com/v1", ceiling: "safe", capabilities: [], addedAt: "", identityDigest: byoaIdentityDigest({ name: "p3", kind: "openai-compatible", endpoint: "https://agent.example.com/v1", ceiling: "safe" }) };
ok("registrations are identity-digest stamped", typeof stampedAgent.identityDigest === "string" && stampedAgent.identityDigest.length > 0);
ok("a tampered stored agent fails the trust check (identity digest mismatch)", byoaTrustCheck({ ...stampedAgent, endpoint: "https://evil.example.com/v1" }).ok === false);
for (let i = 0; i < 10; i++) byoaRateGate.check("byoa.flood-probe");
ok("the per-agent delegation rate ceiling is enforced", byoaRateGate.check("byoa.flood-probe") === false && /byoaRateGate\.check\(agent\.id\)/.test(byoaSrc));
ok("response containment: external replies are injection-scanned and the receipt is a scoped delegation token", /detectInjection\(detail\)/.test(byoaSrc) && /vh\.byoa\.delegation\.v1/.test(byoaSrc));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
