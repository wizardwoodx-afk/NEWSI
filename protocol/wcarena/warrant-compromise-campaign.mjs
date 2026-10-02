#!/usr/bin/env node
/**
 * WARRANT COMPROMISE CAMPAIGN — the attacker-grade pass after 17.10.4.
 *
 * Reviewer's brief for this harness, in his words: attack
 *
 *     designated-authority compromise → key rotation → delegation
 *     → revocation race → replay → cross-selfimpulse propagation
 *
 * because 17.10.4 closed the obvious self-attestation paths. So this is NOT a
 * second copy of adversarial-campaign.mjs (that one starts from narrow granted
 * authority and tries to widen it). This one assumes the attacker is already
 * *somebody*: a joined member, a key thief, a peer who has captured traffic, an
 * identity with real authority in ANOTHER harbour. Each front below asks one
 * question:
 *
 *   ROTATION      can a rotation be used to ACQUIRE identity or authority?
 *   DELEGATION    how far does a chain travel, and can it re-root itself?
 *   REVOCATION    does withdrawing authority kill grants minted before it?
 *   REPLAY        can captured, stale or edited traffic be re-used?
 *   CROSS-SELFIMPULSE  does authority, or designation, travel between harbours?
 *
 * v0.10.7 (RULE 6) closes the two bounds this harness MEASURED when it first
 * shipped — rotation could squat an offline fingerprint, and any member could
 * revoke a designated identity's capability (stickily) — so those two blocks are
 * now scored attacks (FRONT · ROTATION SQUATTING, FRONT · REVOCATION AUTHORITY)
 * and the INFO rows that remain are POSTURE notes: deliberate choices, not gaps.
 *
 * Two kinds of row:
 *   ✅/❌  SCORED — the attack must be refused (or the legitimate path must land)
 *   ℹ️    INFO   — a deliberate posture choice, stated so a reader can argue with it
 *
 * Exit 0 only when every scored attack is refused AND the control still lands.
 *
 * Run it — one command, no setup:
 *   node protocol/wcarena/warrant-compromise-campaign.mjs
 */
import * as VH   from "../src/core/si-crypto.js";
import { VHClient } from "../src/client/si-sdk.js";
import { startSelfImpulse, give, peerOf, show, sleep } from "./_selfimpulse.mjs";

const line = "═".repeat(74);
const rows = [];

function row(name, pass, detail, { info = false } = {}) {
  rows.push({ name, pass: info ? true : pass, info, detail });
  const tag = info ? "ℹ️  INFO" : pass ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${tag}  ${name}`);
  if (detail) console.log(`           ${detail}`);
}

/** Give a peer STANDING (an endorsement says "somebody we know", never "may do X"). */
async function stand(client, frag, reason = "standing given") {
  const p = await peerOf(client, frag);
  if (!p) return null;
  await client.endorse(p.id, 4, reason);
  await sleep(400);
  return p;
}

async function join(url, name, group, identity) {
  const c = new VHClient(url);
  const res = await c.join(name, group, { identity });
  await sleep(800);
  return { c, res };
}

/* ══════════════════════════════════════════════════════════════════════════
   HARBOUR A — the main arena. Operator designated at BOOT; everything the
   honest actors receive is a real grant issued by it.
   ══════════════════════════════════════════════════════════════════════════ */
const DECLARED = ["write:orders", "delegate:ops", "write:payroll"];
const A = await startSelfImpulse({ label: "compromise", declare: DECLARED });
const opFp = A.operatorFp;

const idHolder     = await VH.generateIdentity();
const idSub        = await VH.generateIdentity();
const idGrand      = await VH.generateIdentity();
const idDeepHolder = await VH.generateIdentity();
const idDeepTarget = await VH.generateIdentity();
const idStranger   = await VH.generateIdentity();
const idGhost      = await VH.generateIdentity();
const idMule       = await VH.generateIdentity();
const idVictim     = await VH.generateIdentity();

const holder     = (await join(A.url, "compromise_holder",      "staff", idHolder)).c;
const sub        = (await join(A.url, "compromise_sub",         "staff", idSub)).c;
const grand      = (await join(A.url, "compromise_grand",       "staff", idGrand)).c;
const deepHolder = (await join(A.url, "compromise_deepholder",  "staff", idDeepHolder)).c;
const deepTarget = (await join(A.url, "compromise_deeptarget",  "staff", idDeepTarget)).c;
const stranger   = (await join(A.url, "compromise_stranger",    "guest", idStranger)).c;
const ghost      = (await join(A.url, "compromise_ghost",       "guest", idGhost)).c;
const mule       = (await join(A.url, "compromise_mule",        "guest", idMule)).c;
const victim     = (await join(A.url, "compromise_victim",      "staff", idVictim)).c;

console.log(`\n${line}\n HARBOUR A  ${A.url}  (operator designated at boot: ${opFp.slice(0, 12)}…)\n${line}`);

/* ══════════════════════════════════════════════════════════════════════════
   CONTROL — the legitimate path. Everything below is measured against this.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── CONTROL · the legitimate path still lands ─────────────────\n");
const holderGrant = await give(A.operator, "compromise_holder", "write:orders", { scope: "ops" });
await sleep(700);
const subPeerForHolder = await peerOf(holder, "compromise_sub");
const subGrant = await holder.authorize(subPeerForHolder.id, "write:orders",
  { scope: "ops", ttlMs: 3_600_000, authority: { root: opFp, depth: 1 } });
await sleep(700);
await stand(A.operator, "compromise_sub", "standing for the second hop");
const subAction = await sub.selfimpulseAction({ action: "write:orders", tool: "place_order", purpose: "control: commit under a two-hop chain", result: "success" });
row("CONTROL · operator → holder → sub, and sub commits under that chain",
  holderGrant?.ok === true && subGrant?.ok === true && subAction?.ok === true,
  `grant=${show(holderGrant)} · subGrant=${show(subGrant)} · action=${show(subAction)}`);

/* ══════════════════════════════════════════════════════════════════════════
   FRONT 1 · DELEGATION — how far does a chain travel, and can it re-root?
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · DELEGATION ───────────────────────────────────────\n");

/* depth 2 — the granter must itself hold a grant FROM the root it names. */
const deepGrant = await give(A.operator, "compromise_deepholder", "write:orders", { scope: "ops" });
await sleep(700);
const dtPeer = await peerOf(deepHolder, "compromise_deeptarget");
const depthTwo = await deepHolder.authorize(dtPeer.id, "write:orders",
  { scope: "ops", ttlMs: 3_600_000, authority: { root: opFp, depth: 2 } });
await sleep(700);
const depthTwoAction = await deepTarget.selfimpulseAction({ action: "write:orders", tool: "place_order", purpose: "commit under a depth-2 grant", result: "success" });
row("DELEGATION 1 · depth 2 (within the cap) is granted and usable",
  deepGrant?.ok === true && depthTwo?.ok === true && depthTwoAction?.ok === true,
  `depth2=${show(depthTwo)} · action=${show(depthTwoAction)}`);

/* depth 3 — over the cap (HANDLE_MAX_DELEGATION_DEPTH, default 2). */
const dt2Peer = await peerOf(deepHolder, "compromise_grand");
const depthThree = await deepHolder.authorize(dt2Peer.id, "write:orders",
  { scope: "ops", ttlMs: 3_600_000, authority: { root: opFp, depth: 3 } });
await sleep(700);
row("DELEGATION 2 · depth 3 is over the cap and refused",
  depthThree?.ok === false, show(depthThree));

/* re-rooting — sub holds a grant from HOLDER, not from the root it names. */
const grandPeerForSub = await peerOf(sub, "compromise_grand");
const rerooted = await sub.authorize(grandPeerForSub.id, "write:orders",
  { scope: "ops", ttlMs: 3_600_000, authority: { root: opFp, depth: 1 } });
await sleep(700);
row("DELEGATION 3 · a chain cannot name a root it holds nothing from",
  rerooted?.ok === false, show(rerooted));

/* designated ≠ blanket — the operator may hand out only what it declared. */
const mulePeerForOp = await peerOf(A.operator, "compromise_mule");
const undeclared = await A.operator.authorize(mulePeerForOp.id, "write:ledger", { ttlMs: 3_600_000 });
await sleep(700);
row("DELEGATION 4 · designation is a role, not a blanket: the operator hands out only what it declared",
  undeclared?.ok === false, `write:ledger (never declared) ⇒ ${show(undeclared)}`);

/* ══════════════════════════════════════════════════════════════════════════
   FRONT 2 · ROTATION — can a rotation ACQUIRE identity or authority?
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · ROTATION ─────────────────────────────────────────\n");

/* (1) a self-rotation is legitimate key hygiene — and changes nothing else. */
const strangerRotated = await stranger.rotate();
await sleep(800);
const strangerDecl = await stranger.declareCapability(["write:payroll"], { reason: "claim made AFTER rotating my key" });
await sleep(600);
const mulePeerForStranger = await peerOf(stranger, "compromise_mule");
const strangerGrant = await stranger.authorize(mulePeerForStranger.id, "write:payroll", { ttlMs: 3_600_000 });
await sleep(700);
row("ROTATION 1 · rotating your own key does not MANUFACTURE designation",
  strangerRotated?.ok === true && strangerGrant?.ok === false,
  `rotate=${show(strangerRotated)} · declare=${show(strangerDecl)} · delegate=${show(strangerGrant)}`);

/* (3) grants are keyed to the exact key — a rotated identity inherits none. */
const victimGrant = await give(A.operator, "compromise_victim", "write:orders", { scope: "ops" });
await sleep(700);
const victimOldFp = victim.me.fp;
const victimRotated = await victim.rotate();
await sleep(800);
await stand(A.operator, "compromise_victim", "standing for the successor key; no grant given");
const mulePeerForVictim = await peerOf(victim, "compromise_mule");
const inherited = await victim.authorize(mulePeerForVictim.id, "write:orders",
  { scope: "ops", ttlMs: 3_600_000, authority: { root: opFp, depth: 1 } });
await sleep(700);
row("ROTATION 2 · grants are keyed to the exact key: a rotation does NOT inherit them",
  victimGrant?.ok === true && victimRotated?.ok === true && victimOldFp !== victim.me.fp && inherited?.ok === false,
  `oldFp→newFp changed=${victimOldFp !== victim.me.fp} · delegating the predecessor's GRANT=${show(inherited)}`);

/* ══════════════════════════════════════════════════════════════════════════
   FRONT 3 · REVOCATION RACE — does withdrawing authority kill grants that were
   minted BEFORE it? (sub's own grant is untouched and still unexpired.)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · REVOCATION RACE ──────────────────────────────────\n");
const holderFp = holder.me.fp;
const withdrawn = await A.operator.revoke({ fp: holderFp, action: "write:orders" }, "authority withdrawn mid-flight");
await sleep(900);
const subAfterRevoke = await sub.selfimpulseAction({ action: "write:orders", tool: "place_order", purpose: "commit after the ISSUER's authority was withdrawn", result: "success" });
await sleep(600);
const subRedelegate = await sub.authorize(grandPeerForSub.id, "write:orders",
  { scope: "ops", ttlMs: 3_600_000, authority: { root: opFp, depth: 1 } });
await sleep(700);
row("REVOCATION RACE · withdrawing the issuer's grant kills sub-grants minted before it",
  withdrawn?.ok === true && subAfterRevoke?.ok === false && subRedelegate?.ok === false,
  `revoke=${show(withdrawn)} · sub's live grant ⇒ action=${show(subAfterRevoke)} · re-delegate=${show(subRedelegate)}`);

/* ══════════════════════════════════════════════════════════════════════════
   FRONT 4 · REPLAY — captured, stale, edited traffic.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · REPLAY ───────────────────────────────────────────\n");

/* (1) byte-identical replay of a real sealed envelope, captured on the wire. */
const origEmit = A.operator._emit.bind(A.operator);
let captured = null;
A.operator._emit = async (ev, payload) => {
  const r = await origEmit(ev, payload);
  if (ev === "selfimpulse:submit" && payload?.n) captured = payload;
  return r;
};
const payrollGrant = await A.operator.authorize(mulePeerForOp.id, "write:payroll", { ttlMs: 3_600_000 });
A.operator._emit = origEmit;
await sleep(700);
const replayed = captured ? await A.operator._emit("selfimpulse:submit", captured) : null;
await sleep(600);
row("REPLAY 1 · a captured envelope cannot be replayed verbatim",
  payrollGrant?.ok === true && captured !== null && replayed?.ok === false,
  `original=${show(payrollGrant)} · verbatim replay=${show(replayed)}`);

/* (2) a genuine envelope, minted outside the freshness window. */
const staleFacts = {
  v: 2, kind: "authorization",
  from: { n: "compromise_operator", fp: opFp },
  subject: { n: "compromise_mule", fp: idMule.fp },
  action: "write:orders", scope: "ops", policy: "default",
  expiresAt: Date.now() + 3_600_000, ts: Date.now(),
};
const staleTs = Date.now() - 10 * 60_000;
const staleNonce = VH.randomHex(16);
const staleEnv = {
  p: JSON.stringify(staleFacts), n: staleNonce, ts: staleTs,
  sig: await VH.sign(A.identity.sign.privateKey, `${JSON.stringify(staleFacts)}|${staleNonce}|${staleTs}`),
};
const staleRes = await A.operator._emit("selfimpulse:submit", staleEnv);
await sleep(600);
row("REPLAY 2 · a stale envelope (outside the freshness window) is refused",
  staleRes?.ok === false, show(staleRes));

/* (3) a fresh envelope whose payload was edited in flight. */
const goodFacts = { ...staleFacts, ts: Date.now(), scope: "ops" };
const goodEnv = await VH.sealSecure(goodFacts, A.identity.sign.privateKey);
const editedEnv = { ...goodEnv, p: goodEnv.p.replace('"write:orders"', '"write:payroll"') };
const editedRes = await A.operator._emit("selfimpulse:submit", editedEnv);
await sleep(600);
row("REPLAY 3 · an edited payload fails signature verification",
  editedRes?.ok === false && editedEnv.p !== goodEnv.p, show(editedRes));

/* ══════════════════════════════════════════════════════════════════════════
   HARBOUR B — a SECOND, independent harbour. Everything above is authority in
   A; the question now is what any of it is worth here.
   ══════════════════════════════════════════════════════════════════════════ */
const B = await startSelfImpulse({ label: "crossselfimpulse", declare: ["write:orders"] });
console.log(`\n${line}\n HARBOUR B  ${B.url}  (operator designated at boot: ${B.operatorFp.slice(0, 12)}…)\n${line}`);

console.log("\n── FRONT · CROSS-SELFIMPULSE PROPAGATION ─────────────────────────\n");
const idBMule = await VH.generateIdentity();
const bMule = (await join(B.url, "b_mule", "locals", idBMule)).c;

/* (1) a real authority holder from A is a stranger in B. */
const deepTargetInB = (await join(B.url, "a_deeptarget_visiting", "visitors", idDeepTarget)).c;
const declInB = await deepTargetInB.declareCapability(["write:orders"], { reason: "the scope I legitimately hold in harbour A" });
await sleep(600);
const bMulePeerForVisitor = await peerOf(deepTargetInB, "b_mule");
const delegateInB = await deepTargetInB.authorize(bMulePeerForVisitor.id, "write:orders", { ttlMs: 3_600_000 });
await sleep(700);
row("CROSS-SELFIMPULSE 1 · real authority in A is a CLAIM in B (delegation refused)",
  delegateInB?.ok === false, `declare in B=${show(declInB)} · delegate in B=${show(delegateInB)}`);

/* (2) designation does not travel either — A's operator is an ordinary visitor. */
const idBOp2 = await VH.generateIdentity();
void idBOp2;
const bMulePeerForOpA = await peerOf(bMule, "a_operator_visiting");
const opAInB = (await join(B.url, "a_operator_visiting", "visitors", A.identity)).c;
const bMulePeerForOpAV = await peerOf(opAInB, "b_mule");
const opADeclInB = await opAInB.declareCapability(["write:orders"], { reason: "A's operator scope, claimed in B" });
await sleep(600);
const opADelegInB = await opAInB.authorize(bMulePeerForOpAV?.id ?? bMulePeerForOpA?.id, "write:orders", { ttlMs: 3_600_000 });
await sleep(700);
row("CROSS-SELFIMPULSE 2 · designation does not travel: A's operator is an ordinary member in B",
  opADelegInB?.ok === false, `declare=${show(opADeclInB)} · delegate=${show(opADelegInB)}`);

/* (3) another harbour's signed statement is not accepted here. */
const foreignEnv = await VH.sealSecure({ ...goodFacts, ts: Date.now() }, A.identity.sign.privateKey);
const foreignRes = await bMule._emit("selfimpulse:submit", foreignEnv);
await sleep(600);
row("CROSS-SELFIMPULSE 3 · a statement sealed in A is not accepted by B",
  foreignRes?.ok === false, show(foreignRes));

/* ══════════════════════════════════════════════════════════════════════════
   FRONT · ROTATION INSIDE B — designation follows the identity across a proven
   rotation (by design), while the successor's own claims do NOT come along.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · ROTATION (positive case, harvest harbour) ────────\n");
const bOpRotated = await B.operator.rotate();
await sleep(900);
const bMulePeerForBOp = await peerOf(B.operator, "b_mule");
const beforeRedeclare = await B.operator.authorize(bMulePeerForBOp.id, "write:orders", { ttlMs: 3_600_000 });
await sleep(700);
const redeclared = await B.operator.declareCapability(["write:orders"], { reason: "successor re-asserts the operator's scope after rotation" });
await sleep(700);
const afterRedeclare = await B.operator.authorize(bMulePeerForBOp.id, "write:orders", { ttlMs: 3_600_000 });
await sleep(700);
row("ROTATION 3 · designation follows a proven rotation (by design)",
  bOpRotated?.ok === true && redeclared?.ok === true && afterRedeclare?.ok === true,
  `rotate=${show(bOpRotated)} · delegate before re-declaring=${show(beforeRedeclare)} · after=${show(afterRedeclare)}`);
row("ROTATION 4 · but the successor holds NOTHING until it re-declares its own scope",
  beforeRedeclare?.ok === false,
  `delegate immediately after rotating=${show(beforeRedeclare)}`);

/* ══════════════════════════════════════════════════════════════════════════
   FRONT · ROTATION SQUATTING (v0.10.7 RULE 6 — was a measured FINDING, now a
   closed attack). A joined member tries to name an OFFLINE identity's public
   bundle as its successor. It holds the continuity key but not the incoming
   private key, so it can produce only the two broken proofs. The real keyholder
   must still be able to join afterwards.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · ROTATION SQUATTING ───────────────────────────────\n");
const victimOffline = await VH.generateIdentity();
const victimBundle   = await VH.publicBundle(victimOffline);
const squatTs        = Date.now();

const squatterId = await VH.generateIdentity();
const squatter   = (await join(A.url, "squatter_a", "guest", squatterId)).c;
const squatNoPop = await squatter._emit("key:rotate", {
  newBundle: victimBundle, ts: squatTs,
  sig: await VH.sign(squatterId.sign.privateKey, `${VH.PROTOCOL.rotatePrefix}|${JSON.stringify(victimBundle)}|${squatTs}`),
});
await sleep(600);
row("ROTATION 5 · offline-fingerprint squatting is REFUSED (no possession proof)",
  squatNoPop?.ok === false && squatNoPop.reason === "invalid-rotation-proof", show(squatNoPop));

/* second socket: the harbour rate-limits rotation to 1/60s per socket */
const squatter2Id = await VH.generateIdentity();
const squatter2   = (await join(A.url, "squatter_b", "guest", squatter2Id)).c;
const squatBadPop = await squatter2._emit("key:rotate", {
  newBundle: victimBundle, ts: squatTs,
  sig: await VH.sign(squatter2Id.sign.privateKey, `${VH.PROTOCOL.rotatePrefix}|${JSON.stringify(victimBundle)}|${squatTs}`),
  pop: await VH.sign(squatter2Id.sign.privateKey, `${VH.PROTOCOL.rotatePopPrefix}|${squatter2Id.fp}|${victimBundle.fp}|${squatTs}`),
});
await sleep(600);
row("ROTATION 6 · …nor with a possession proof signed by the WRONG key",
  squatBadPop?.ok === false && squatBadPop.reason === "invalid-rotation-proof", show(squatBadPop));

const idVictimOwner = victimOffline;
void idVictimOwner;
const victimClient = new VHClient(A.url);
let victimJoin = null;
try { victimJoin = await victimClient.join("squat_victim", "staff", { identity: victimOffline }); }
catch (e) { victimJoin = { reason: String(e?.message ?? e) }; }
await sleep(600);
row("ROTATION 7 · the squatted fingerprint is still FREE for its real keyholder",
  victimJoin?.fp === victimBundle.fp, `join as the real keyholder ⇒ fp=${victimJoin?.fp ?? victimJoin?.reason}`);
victimClient.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   FRONT · REVOCATION AUTHORITY (v0.10.7 RULE 6 — the second measured finding,
   now closed). A member tries to switch the designated operator OFF. Then the
   legitimate case: an authorised principal withdrawing its own declared scope.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── FRONT · REVOCATION AUTHORITY ─────────────────────────────\n");
const mulePeerForOp2 = await peerOf(A.operator, "compromise_mule");
const dosAttempt = await stranger.revoke({ fp: A.operatorFp, action: "*" }, "governance denial-of-service: switch the operator off");
await sleep(800);
row("REVOCATION 1 · a member's revocation of a DESIGNATED identity is REFUSED",
  dosAttempt?.ok === false && dosAttempt.reason === "policy:revocation-requires-authority", show(dosAttempt));
const payrollStillDelegable = await A.operator.authorize(mulePeerForOp2.id, "write:payroll", { ttlMs: 3_600_000 });
await sleep(700);
row("REVOCATION 2 · …and the operator still hands its declared scope out afterwards",
  payrollStillDelegable?.ok === true, show(payrollStillDelegable));

/* the legitimate half: a designated principal MAY withdraw its own scope. */
const authorisedWithdrawal = await A.operator.revoke({ fp: A.operatorFp, action: "write:payroll" }, "the operator withdraws its own payroll scope");
await sleep(900);
const payrollAfterWithdrawal = await A.operator.authorize(mulePeerForOp2.id, "write:payroll", { ttlMs: 3_600_000 });
await sleep(700);
row("REVOCATION 3 · an AUTHORISED withdrawal IS honoured (the operator withdraws its own scope)",
  authorisedWithdrawal?.ok === true && payrollAfterWithdrawal?.ok === false,
  `withdraw=${show(authorisedWithdrawal)} ⇒ delegating it again=${show(payrollAfterWithdrawal)}`);

/* ══════════════════════════════════════════════════════════════════════════
   POSTURE — choices that remain in force by design, stated so a reader can
   argue with them (they are decisions, not oversights).
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── POSTURE (by design, not scored) ──────────────────────────\n");
row("POSTURE 1 · a designated principal may withdraw ANOTHER designated principal's scope",
  true,
  "authority-managing is a class, not a single key: the harbour root and every fingerprint in HANDLE_AUTHORITIES share it. " +
  "Narrowing that to per-target management is the next refinement if an org needs it.",
  { info: true });
row("POSTURE 2 · an authorised withdrawal is sticky",
  true,
  "withdrawal means what it says: re-declaring the same scope does not resurrect it. Only a config change (HANDLE_AUTHORITIES) " +
  "or a fresh identity restores reach — deliberately, so the record cannot be talked around.",
  { info: true });
row("POSTURE 3 · chains only deepen from the root",
  true,
  "a delegation naming authority.root requires the granter to hold a live grant FROM that root, so hops cannot re-root " +
  "themselves (DELEGATION 3, refusal no-parent-grant). Conservative: one revocation kills a whole subtree.",
  { info: true });
row("POSTURE 4 · designation still follows a proven rotation",
  true,
  "the successor may delegate only after RE-DECLARING its own scope (ROTATION 3/4) — rotation carries a role, never operating scope.",
  { info: true });

/* ── verdict ─────────────────────────────────────────────────────────────── */
const attacks = rows.filter((r) => !r.info);
const infos = rows.filter((r) => r.info);
const failed = attacks.filter((r) => !r.pass);
const control = rows[0];
console.log(`\n${line}`);
console.log(` FRONT RESULTS · attacks refused: ${attacks.length - failed.length}/${attacks.length}`);
if (failed.length) console.log(`          ❌ ${failed.map((f) => f.name).join("\n          ❌ ")}`);
console.log(`  legitimate path still works : ${control.pass ? "YES ✅" : "NO ❌"}`);
console.log(`  posture notes recorded: ${infos.length} (see POSTURE above)`);
console.log(`  evidence · A: ${A.dataDir}/ledger.jsonl`);
console.log(`  evidence · B: ${B.dataDir}/ledger.jsonl`);
console.log(line);

for (const c of [holder, sub, grand, deepHolder, deepTarget, stranger, ghost, mule, victim, bMule, deepTargetInB, opAInB]) {
  try { c.disconnect(); } catch { /* already gone */ }
}
await A.stop();
await B.stop();
process.exit(failed.length === 0 && control.pass ? 0 : 1);
