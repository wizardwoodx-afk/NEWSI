/**
 * v0.10.4 · GRANT-AUTHORITY MATRIX — the canonical verification harness.
 *
 * Proves BOTH directions of scope-bounded delegation:
 *   · legitimate delegation still works end-to-end, and
 *   · every amplification route is refused.
 *
 * v0.10.6 (RULE 5) re-based it on GIVEN authority: the harness starts its own
 * harbour, plays the operator (designated at boot), and hands the approver its
 * tokens as real grants — a self-declared capability is no longer a licence, so a
 * matrix whose "legitimate" side is a claim would now (correctly) refuse.
 *
 * Run it — one command, no setup:
 *   node protocol/wcarena/v104-authority-matrix.mjs
 */
import { VHClient } from "../src/client/si-sdk.js";
import { startSelfImpulse, give, peerOf, show, sleep } from "./_selfimpulse.mjs";

const { url: URL, stop, operator, operatorFp } = await startSelfImpulse({
  label: "matrix",
  declare: ["write:purchase_orders", "delegate:procurement", "approve:purchase_orders", "read:public"],
});
const results = [];
const line = "═".repeat(74);

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? "✅ PASS" : "❌ FAIL"}  ${name}`);
  if (detail) console.log(`           ${detail}`);
}

console.log(line);
console.log(" GRANT-AUTHORITY MATRIX (re-based on given authority, v0.10.6)");
console.log(" scope-bounded delegation — legitimate paths AND amplification routes");
console.log(` operator ${operatorFp} is designated at boot; every legitimate token below is GIVEN`);
console.log(line + "\n");

/* ── actors ──────────────────────────────────────────────────────────────── */
const approver = new VHClient(URL);   const A = await approver.join("finance_approver", "finance");
await sleep(900);
const buyer    = new VHClient(URL);   const B = await buyer.join("procurement_buyer", "procurement");
await sleep(1400);

const approverPeer = [...buyer.peers.values()].find((p) => p.name === "finance_approver");
const buyerPeer    = [...approver.peers.values()].find((p) => p.name === "procurement_buyer");
if (!approverPeer || !buyerPeer) { console.log("✗ peer discovery failed"); process.exit(1); }
console.log(`approver ${A.fp}   buyer ${B.fp}\n`);

/* The approver's authority is GIVEN by the designated operator (RULE 5): real
   grants, not a self-declaration. Its own declaration below is what declarations
   are for now — standing, reputation and audit — and it is signed and recorded. */
const gApprover1 = await give(operator, "finance_approver", "write:purchase_orders", { scope: "procurement" });
await sleep(500);
const gApprover2 = await give(operator, "finance_approver", "delegate:procurement", { scope: "procurement" });
await sleep(500);
const gApprover3 = await give(operator, "finance_approver", "approve:purchase_orders", { scope: "procurement" });
await sleep(500);
await approver.declareCapability(
  ["write:purchase_orders", "delegate:procurement", "approve:purchase_orders"],
  { reason: "finance approver — capability report (standing, not authority)" },
);
await sleep(600);
record("A0 operator GIVES the approver its tokens ⇒ accepted",
  gApprover1.ok === true && gApprover2.ok === true && gApprover3.ok === true,
  `write=${show(gApprover1)} delegate=${show(gApprover2)} approve=${show(gApprover3)}`);

console.log("── A · LEGITIMATE PATHS (must be ACCEPTED) ────────────────────\n");

/* A1 — exact action held */
let g = await approver.authorize(buyerPeer.id, "write:purchase_orders", {
  scope: "resource://forgeworks_procurement/governed", ttlMs: 3_600_000,
});
record("A1 exact action held ⇒ grant accepted", g.ok === true, `reason=${g.reason ?? "—"}`);
await sleep(900);
if (g.ok) {
  const act = await buyer.selfimpulseAction({
    action: "write:purchase_orders", tool: "record_purchase_order",
    purpose: "legitimate PO under a genuinely-held delegation",
    evidence: "AP-1001", result: "success",
  });
  record("A2 buyer commits under it ⇒ accepted", act.ok === true,
    `seq=${act.seq ?? "—"} reason=${act.reason ?? "—"}`);
}

/* A3 — scope token covers an action it does not itself name */
g = await approver.authorize(buyerPeer.id, "submit_offer", {
  scope: "procurement", ttlMs: 3_600_000,
});
record("A3 scope token 'delegate:procurement' covers submit_offer ⇒ accepted",
  g.ok === true, `reason=${g.reason ?? "—"}`);

console.log("\n── B · AMPLIFICATION ROUTES (must be REFUSED) ─────────────────\n");

/* B1 — an unrelated identity with a read-only scope */
const feed = new VHClient(URL); const F = await feed.join("market_feed", "eavesdropper");
await sleep(900);
const approverPeerForFeed = [...feed.peers.values()].find((p) => p.name === "finance_approver");
/* held for real, so the refusal below is about SCOPE and not about having nothing */
const gFeed = await give(operator, "market_feed", "read:public", { scope: "public" });
await sleep(500);
await feed.declareCapability(["read:public"], { reason: "read-only feed — capability report" });
await sleep(500);
g = await feed.authorize(approverPeerForFeed?.id, "write:purchase_orders", { ttlMs: 3_600_000 });
record("B1 read:public ⇒ write:purchase_orders refused",
  !g.ok && g.reason === "policy:grantor-out-of-scope", `reason=${g.reason}`);

/* B2 — wildcard from a narrow holder */
g = await feed.authorize(approverPeerForFeed?.id, "*", { ttlMs: 3_600_000 });
record("B2 read:public ⇒ '*' refused",
  !g.ok && g.reason === "policy:wildcard-grant-requires-wildcard-authority", `reason=${g.reason}`);

/* B3 — scope containment: delegate:procurement must not reach payroll */
g = await approver.authorize(buyerPeer.id, "write:payroll", {
  scope: "payroll", ttlMs: 3_600_000,
});
record("B3 delegate:procurement ⇒ payroll scope refused",
  !g.ok && g.reason === "policy:grantor-out-of-scope", `reason=${g.reason}`);

/* B4 — holds the action but not wildcard: may not grant '*' */
g = await approver.authorize(buyerPeer.id, "*", { ttlMs: 3_600_000 });
record("B4 named actions ⇒ '*' refused",
  !g.ok && g.reason === "policy:wildcard-grant-requires-wildcard-authority", `reason=${g.reason}`);

/* B5 — an un-attested stranger cannot even reach the coverage rule */
const ghost = new VHClient(URL); await ghost.join("ghost", "unknown");
await sleep(1000);
const approverPeerForGhost = [...ghost.peers.values()].find((p) => p.name === "finance_approver");
g = await ghost.authorize(approverPeerForGhost?.id, "write:purchase_orders", { ttlMs: 3_600_000 });
record("B5 unattested stranger refused at RULE 1",
  !g.ok && g.reason === "policy:grantor-unattested", `reason=${g.reason}`);

/* B6 — a refused grant leaves no usable authority behind */
await sleep(700);
const leftover = await buyer.selfimpulseAction({
  action: "write:payroll", tool: "pay_payroll", purpose: "attempt after B3 was refused",
  evidence: "attacker-supplied mandate", result: "success",
});
record("B6 no authority leaks from a refused grant",
  leftover.ok === false && leftover.reason === "policy:no-authorization",
  `reason=${leftover.reason ?? "—"}`);

/* ── verdict ─────────────────────────────────────────────────────────────── */
await stop();
const passed = results.filter((r) => r.pass).length;
console.log("\n" + line);
console.log(` RESULT   ${passed}/${results.length} passed`);
console.log(line);
const neg = results.filter((r) => r.name.startsWith("B")).every((r) => r.pass);
const pos = results.filter((r) => r.name.startsWith("A")).every((r) => r.pass);
console.log(`  legitimate delegation intact : ${pos ? "YES ✅" : "NO ❌"}`);
console.log(`  amplification closed         : ${neg ? "YES ✅" : "NO ❌"}`);
console.log(line);
process.exit(passed === results.length ? 0 : 1);
