#!/usr/bin/env node
/**
 * ADVERSARIAL CAMPAIGN — trying to break Warrant.
 *
 * v0.10.6 rewrote this harness, because RULE 5 changed what "legitimate" MEANS.
 * Before, every actor in this file merely DECLARED its authority and the harbour
 * believed it; now authority is GIVEN. So the campaign's honest actors receive
 * real grants from an operator-authorised identity, and the attacks start from
 * narrow, legitimately-granted authority and try to widen, forge, substitute or
 * outlive it. A refusal therefore proves the bound, not the absence of a setup.
 *
 * Nothing is simulated: the harness starts a REAL harbour (real ECDSA envelopes,
 * real policy engine, real ledger, real revocation records) in a temp data dir
 * with an operator-designated identity, and plays the operator itself.
 *
 * Run it — one command, no setup:
 *   node protocol/wcarena/adversarial-campaign.mjs
 *
 * This harness owns its harbour on purpose. WHO may hand out authority is a
 * boot-time decision (HANDLE_AUTHORITIES), so a campaign that attaches to somebody
 * else's harbour cannot play the operator, and without an operator the
 * legitimate control would be unprovable — which would make every refusal below
 * meaningless. It starts a real harbour in a temp data dir, designates its own
 * operator identity, runs the campaign, and stops the harbour.
 *
 * Exit 0 only when every attack is refused AND the legitimate control still lands.
 */
import { spawn }     from "node:child_process";
import net           from "node:net";
import fs            from "node:fs";
import os            from "node:os";
import path          from "node:path";
import { fileURLToPath } from "node:url";
import * as VH       from "../src/core/si-crypto.js";
import { VHClient }  from "../src/client/si-sdk.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const line = "═".repeat(74);
const rows = [];

function row(name, pass, detail, { info = false } = {}) {
  rows.push({ name, pass: info ? true : pass, info, detail });
  const tag = info ? "ℹ️  INFO" : pass ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${tag}  ${name}`);
  if (detail) console.log(`           ${detail}`);
}

async function peerOf(client, frag, tries = 24) {
  for (let i = 0; i < tries; i++) {
    const p = [...client.peers.values()].find((x) => x.name.includes(frag));
    if (p) return p;
    await sleep(150);
  }
  return null;
}
const show = (o) => `ok=${o?.ok} reason=${o?.reason ?? "—"}`;

async function freePort() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.on("error", rej);
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => res(p)); });
  });
}

async function waitForPort(port, ms = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const ok = await new Promise((res) => {
      const s = net.connect({ port, host: "127.0.0.1" });
      s.once("connect", () => { s.destroy(); res(true); });
      s.once("error", () => { s.destroy(); res(false); });
    });
    if (ok) return true;
    await sleep(120);
  }
  return false;
}

/* ══════════════════════════════════════════════════════════════════════════
   BOOT — a real harbour, and the operator who decides who may hand out what.
   The operator identity is generated HERE and named to the harbour at boot
   (HANDLE_AUTHORITIES), which is exactly how RULE 5 expects designation to happen.
   ══════════════════════════════════════════════════════════════════════════ */
console.log(line);
console.log(" ADVERSARIAL CAMPAIGN — can we still get around Warrant?");
console.log(" protocol v0.10.7 · RULES 3–6 · live harbour · real envelopes, real ledger");
console.log(line + "\n");

let url = null, selfimpulseProc = null, dataDir = null;
const operatorIdentity = await VH.generateIdentity();
{
  const port = await freePort();
  dataDir    = fs.mkdtempSync(path.join(os.tmpdir(), "si-campaign-"));
  selfimpulseProc = spawn(process.execPath, [path.join(ROOT, "protocol/src/server/selfimpulse.js")], {
    env: {
      ...process.env,
      PORT: String(port),
      HANDLE_DATA_DIR: dataDir,
      HANDLE_AUTHORITIES: operatorIdentity.fp,
      HANDLE_MAX_SOCKETS_PER_IP: "64",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  selfimpulseProc.stderr.on("data", (b) => process.stderr.write(`[selfimpulse] ${b}`));
  url = `http://127.0.0.1:${port}`;
  if (!(await waitForPort(port))) {
    console.error("campaign: harbour did not come up");
    selfimpulseProc.kill("SIGTERM");
    process.exit(2);
  }
  console.log(`  harbour      ${url}`);
  console.log(`  data dir     ${dataDir}`);
  console.log(`  operator fp  ${operatorIdentity.fp}   (designated at boot via HANDLE_AUTHORITIES)\n`);
}

const operator = new VHClient(url);
await operator.join("campaign_operator", "operators", { identity: operatorIdentity });
await sleep(900);

/* The operator's own inventory: what this principal speaks for. Under RULE 5 a
   DESIGNATED identity's declaration IS delegable authority — so the operator
   declares the scopes it will hand out, and deliberately nothing else. Note what
   is absent: payroll, finance, ledger. The operator cannot hand those out either,
   which is why the attacks below target exactly them. */
await operator.declareCapability(
    ["write:purchase_orders", "delegate:procurement", "write:offers", "write:notes", "write:orders"],
    { reason: "campaign operator: the scopes this principal speaks for" });
await sleep(700);

/* give() — REAL authority: the operator authors an authorization naming the
   recipient as subject. Under RULE 5 this is the only way a participant comes
   to hold delegable authority. */
async function give(recipient, token, { scope, ttlMs = 3_600_000, via = operator, endorse = true } = {}) {
  const p = await peerOf(via, recipient);
  const grant = await via.authorize(p?.id, token, { scope, ttlMs });
  /* RULE 1 standing, given rather than self-declared: an endorsement says "this
     is somebody we know", and says NOTHING about what they may do. The targets
     of the attacks below are never endorsed — they are strangers. */
  if (endorse && p?.id) { await sleep(300); await via.endorse(p.id, 4, "authority holder, standing given"); }
  return grant;
}

/* ══════════════════════════════════════════════════════════════════════════
   CONTROL — the legitimate path must still work, or every refusal below is
   meaningless (a harbour that refuses everything proves nothing).
   Note the three separate questions the protocol now asks in order:
     RULE 1 — do we know who this is? (a capability claim or an endorsement:
              the approver declares one; standing is not authority)
     RULE 5 — may it hand out what it holds? (its tokens are a GRANT from the
              designated operator, not a self-declaration)
     RULE 3 — does it hold what it hands out? (it does, exactly)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("── CONTROL · legitimate authority path ────────────────────────\n");
const buyer = new VHClient(url);
await buyer.join("campaign_buyer", "procurement");
await sleep(1100);
const approver = new VHClient(url);
await approver.join("campaign_approver", "finance");
await sleep(1200);

const operatorGives = await give("campaign_approver", "write:purchase_orders", { scope: "procurement" });
await sleep(500);
await give("campaign_approver", "delegate:procurement", { scope: "procurement" });
await sleep(600);
/* the approver's OWN declaration — descriptive (standing / reputation / audit) */
await approver.declareCapability(["write:purchase_orders", "delegate:procurement"], { reason: "finance approver" });
await sleep(600);
const controlGrant = await give("campaign_buyer", "write:purchase_orders", { scope: "resource://campaign/governed", via: approver });
await sleep(900);
const controlCommit = await buyer.selfimpulseAction({ action: "write:purchase_orders", tool: "record_purchase_order", purpose: "control", result: "success" });
/* the approver is now attested (endorsed) AND holds its tokens as a grant, so its
   own grant to the buyer passes RULE 1 (standing) + RULE 3 (it holds exactly
   write:purchase_orders) + RULE 5 (the grant is real authority). */
row("CONTROL · operator → approver → buyer → commit (authority GIVEN, not claimed)",
  operatorGives?.ok === true && controlGrant?.ok === true && controlCommit?.ok === true,
  `operator→approver=${show(operatorGives)} approver→buyer=${show(controlGrant)} commit=${show(controlCommit)}`);

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 1 — SELF-DECLARED WILDCARD
   A stranger claims "*" for itself and mints a "*" grant to a pawn. If that
   lands, any participant reaches unbounded authority in two messages.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 1 · self-declared wildcard authority ────────────────\n");
const sybil = new VHClient(url);
await sybil.join("stranger_claims_star", "unknown");
await sleep(1100);
const decl = await sybil.declareCapability(["*"], { reason: "self-signed claim of unbounded authority" });
await sleep(500);
const pawn = new VHClient(url);
await pawn.join("pawn_recipient", "unknown");
await sleep(1200);
const pForS = await peerOf(sybil, "pawn_recipient");
const wildcardGrant = await sybil.authorize(pForS?.id, "*", { scope: "*", ttlMs: 3_600_000 });
await sleep(900);
const pawnCommit = await pawn.selfimpulseAction({ action: "write:purchase_orders", tool: "record_purchase_order", purpose: "commit under a self-declared '*' grant", result: "success" });
row("ATTACK 1 · self-declared '*' ⇒ may not mint '*' authority",
  !(wildcardGrant?.ok !== false && pawnCommit?.ok === true),
  `declaration=${show(decl)} grant=${show(wildcardGrant)} commit=${show(pawnCommit)}`);
sybil.disconnect(); pawn.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 2 — SELF-DECLARED DELEGATE:* (unbounded by another name)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 2 · self-declared delegate:* (unbounded by another name) ──\n");
const sybil2 = new VHClient(url);
await sybil2.join("stranger_claims_staradmin", "unknown");
await sleep(1100);
await sybil2.declareCapability(["delegate:*"], { reason: "self-signed unbounded delegation token" });
await sleep(500);
const pawn2 = new VHClient(url);
await pawn2.join("pawn_recipient_2", "unknown");
await sleep(1200);
const p2ForS2 = await peerOf(sybil2, "pawn_recipient_2");
const adminGrant = await sybil2.authorize(p2ForS2?.id, "write:payroll", { scope: "payroll", ttlMs: 3_600_000 });
await sleep(700);
row("ATTACK 2 · self-declared 'delegate:*' ⇒ may not confer payroll authority", adminGrant?.ok === false, show(adminGrant));
sybil2.disconnect(); pawn2.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 3 — NAMED SELF-DECLARED CAPABILITY (the RULE 5 finding, v0.10.6)
   The residue RULES 3+4 left: no "*" involved, nothing forged. A participant
   simply declares ["write:payroll"] and mints a REAL payroll grant. Before
   0.10.6 this was accepted as "attested-granter:holds-action".
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 3 · self-declared named capability (write:payroll) ───\n");
const claimer = new VHClient(url);
await claimer.join("stranger_claims_payroll", "unknown");
await sleep(1100);
const payrollClaim = await claimer.declareCapability(["write:payroll"], { reason: "self-signed named claim" });
await sleep(500);
const payrollPawn = new VHClient(url);
await payrollPawn.join("payroll_pawn", "unknown");
await sleep(1200);
const ppForC = await peerOf(claimer, "payroll_pawn");
const payrollGrant = await claimer.authorize(ppForC?.id, "write:payroll", { scope: "payroll", ttlMs: 3_600_000 });
await sleep(800);
const payrollCommit = await payrollPawn.selfimpulseAction({ action: "write:payroll", tool: "pay_salaries", purpose: "commit under a self-declared payroll claim", result: "success" });
row("ATTACK 3 · self-declared 'write:payroll' ⇒ may not mint payroll authority",
  payrollGrant?.ok === false && payrollGrant?.reason === "policy:capability-claim-is-not-authority" &&
  !(payrollCommit?.ok === true),
  `claim=${show(payrollClaim)} grant=${show(payrollGrant)} commit=${show(payrollCommit)}`);
claimer.disconnect(); payrollPawn.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 4 — NAMED SELF-DECLARED ADMIN SCOPE (second named case)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 4 · self-declared named capability (admin:finance) ──\n");
const finAdmin = new VHClient(url);
await finAdmin.join("stranger_claims_finance", "unknown");
await sleep(1100);
await finAdmin.declareCapability(["admin:finance"], { reason: "self-signed admin scope" });
await sleep(500);
const ledgerPawn = new VHClient(url);
await ledgerPawn.join("ledger_pawn", "unknown");
await sleep(1200);
const lpForF = await peerOf(finAdmin, "ledger_pawn");
const ledgerGrant = await finAdmin.authorize(lpForF?.id, "write:ledger", { scope: "finance", ttlMs: 3_600_000 });
await sleep(700);
row("ATTACK 4 · self-declared 'admin:finance' ⇒ may not confer finance authority",
  ledgerGrant?.ok === false && ledgerGrant?.reason === "policy:capability-claim-is-not-authority", show(ledgerGrant));
finAdmin.disconnect(); ledgerPawn.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 5 — A CLAIM CANNOT WIDEN A REAL HOLDER
   The broker legitimately HOLDS write:offers (given by the operator). It then
   declares write:payroll for itself and tries to hand payroll on. Holding real
   authority must not turn a self-declaration into a licence.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 5 · a claim cannot widen a real holder ──────────────\n");
const broker = new VHClient(url);
await broker.join("campaign_broker", "ops");
await sleep(1100);
const granted = new VHClient(url);
await granted.join("campaign_granted", "ops");
await sleep(1200);
const brokerGiven = await give("campaign_broker", "write:offers", { scope: "offers" });
await sleep(700);
await broker.declareCapability(["write:offers", "write:payroll"], { reason: "real holder + a hopeful claim" });
await sleep(600);
const gForB = await peerOf(broker, "campaign_granted");
const widened = await broker.authorize(gForB?.id, "write:payroll", { scope: "payroll", ttlMs: 3_600_000 });
await sleep(700);
row("ATTACK 5 · real holder declares an extra token ⇒ still no authority for it",
  brokerGiven?.ok === true && widened?.ok === false,
  `given=${show(brokerGiven)} widened=${show(widened)}`);

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 6 — REVOCATION RACE
   The broker holds write:offers, grants it onward, then the operator revokes
   the broker's token. The grant record still exists and has not expired. Does
   consumption re-check the issuer's authority (RULE 3 defence in depth)?
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 6 · revocation race (grant survives its issuer's authority) ──\n");
const raceGrant = await broker.authorize(gForB?.id, "write:offers", { scope: "offers", ttlMs: 3_600_000 });
await sleep(700);
const revocation = await operator.revoke({ fp: (await peerOf(operator, "campaign_broker"))?.fp, action: "write:offers" }, "authority withdrawn");
await sleep(900);
const afterRevoke = await granted.selfimpulseAction({ action: "write:offers", tool: "publish_offer", purpose: "commit after issuer revocation", result: "success" });
row("ATTACK 6 · grant whose issuer's authority was revoked ⇒ refused at consumption",
  !(raceGrant?.ok === true && afterRevoke?.ok === true),
  `issuer grant=${show(raceGrant)} revocation=${show(revocation)} commit=${show(afterRevoke)}`);
broker.disconnect(); granted.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 7 — EXPIRY EDGE
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 7 · expired authority ───────────────────────────────\n");
const expiredUser = new VHClient(url);
await expiredUser.join("campaign_expired_user", "ops");
await sleep(1200);
const shortGrant = await give("campaign_expired_user", "write:notes", { scope: "notes", ttlMs: 1200 });
await sleep(2600);
const afterExpiry = await expiredUser.selfimpulseAction({ action: "write:notes", tool: "write_note", purpose: "commit after expiry", result: "success" });
row("ATTACK 7 · expired grant ⇒ refused", !(shortGrant?.ok === true && afterExpiry?.ok === true),
  `grant=${show(shortGrant)} commit=${show(afterExpiry)}`);
expiredUser.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 8 — ACTION-NAME SMUGGLING
   Holds write:offers (given). Tries to hand out a DIFFERENT action that merely
   looks like it: a prefix variant, a case variant, and a name with a space.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 8 · action-name smuggling ───────────────────────────\n");
const holder = new VHClient(url);
await holder.join("campaign_offer_holder", "sales");
await sleep(1100);
const victim = new VHClient(url);
await victim.join("campaign_victim", "sales");
await sleep(1200);
const holderGiven = await give("campaign_offer_holder", "write:offers", { scope: "offers" });
await sleep(700);
const vForH = await peerOf(holder, "campaign_victim");
const prefix = await holder.authorize(vForH?.id, "write:offers_v2", { scope: "offers", ttlMs: 3_600_000 });
const caseIt = await holder.authorize(vForH?.id, "WRITE:OFFERS", { scope: "offers", ttlMs: 3_600_000 });
const spaced = await holder.authorize(vForH?.id, "write:offers ", { scope: "offers", ttlMs: 3_600_000 });
await sleep(700);
row("ATTACK 8a · holds write:offers ⇒ cannot grant write:offers_v2 (prefix)", holderGiven?.ok === true && prefix?.ok === false, show(prefix));
row("ATTACK 8b · holds write:offers ⇒ cannot grant WRITE:OFFERS (case)", caseIt?.ok === false, show(caseIt));
row("ATTACK 8c · action names with whitespace are rejected outright", spaced?.ok === false, show(spaced));
holder.disconnect(); victim.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 9 — SCOPE SMUGGLING
   Holds delegate:procurement (given). Tries to stretch it to a neighbour.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 9 · scope smuggling ─────────────────────────────────\n");
const scoped = new VHClient(url);
await scoped.join("campaign_scoped_holder", "procurement");
await sleep(1100);
const scopedVictim = new VHClient(url);
await scopedVictim.join("campaign_scoped_victim", "procurement");
await sleep(1200);
const scopedGiven = await give("campaign_scoped_holder", "delegate:procurement", { scope: "procurement" });
await sleep(700);
const svForS = await peerOf(scoped, "campaign_scoped_victim");
const stretched = await scoped.authorize(svForS?.id, "write:orders", { scope: "procurement-evil", ttlMs: 3_600_000 });
const coloned   = await scoped.authorize(svForS?.id, "write:orders", { scope: "procurement:evil", ttlMs: 3_600_000 });
await sleep(700);
row("ATTACK 9a · delegate:procurement ⇒ cannot reach 'procurement-evil'", scopedGiven?.ok === true && stretched?.ok === false, show(stretched));
row("ATTACK 9b · delegate:procurement ⇒ cannot reach 'procurement:evil'", coloned?.ok === false, show(coloned));
scoped.disconnect(); scopedVictim.disconnect();

/* ══════════════════════════════════════════════════════════════════════════
   ATTACK 10 — ACTION SUBSTITUTION UNDER A REAL GRANT
   The buyer holds a genuine grant for write:purchase_orders. It attempts a
   different action (write:payroll) hoping the grant is not action-bound.
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── ATTACK 10 · action substitution under a real grant ─────────\n");
const substituted = await buyer.selfimpulseAction({ action: "write:payroll", tool: "pay_payroll", purpose: "substitute action under a purchase-order grant", result: "success" });
row("ATTACK 10 · grant for write:purchase_orders ⇒ no payroll authority", substituted?.ok === false, show(substituted));

/* ══════════════════════════════════════════════════════════════════════════
   POSTURE NOTE — reuse of one grant inside its window (session semantics,
   reported rather than scored: it is a design choice, not a bypass)
   ══════════════════════════════════════════════════════════════════════════ */
console.log("\n── POSTURE · grant reuse within its validity window ───────────\n");
const second = await buyer.selfimpulseAction({ action: "write:purchase_orders", tool: "record_purchase_order", purpose: "second commit under the same grant", result: "success" });
row("POSTURE · one live grant backs more than one commit (session semantics, by design)", second?.ok === true, show(second), { info: true });
buyer.disconnect(); approver.disconnect(); operator.disconnect();

/* ── verdict ─────────────────────────────────────────────────────────────── */
const attacks = rows.filter((r) => !r.info);
const failed = attacks.filter((r) => !r.pass);
const control = rows[0];
console.log("\n" + line);
console.log(` RESULT   attacks refused: ${attacks.length - failed.length}/${attacks.length}`);
if (failed.length) console.log(`          ❌ ${failed.map((f) => f.name).join("\n          ❌ ")}`);
console.log(`  legitimate path still works : ${control.pass ? "YES ✅" : "NO ❌"}`);
if (dataDir) console.log(`  evidence: ${dataDir}/ledger.jsonl`);
console.log(line);

if (selfimpulseProc) {
  selfimpulseProc.kill("SIGTERM");
  await sleep(600);
  if (!selfimpulseProc.killed) selfimpulseProc.kill("SIGKILL");
}
process.exit(failed.length === 0 && control.pass ? 0 : 1);
