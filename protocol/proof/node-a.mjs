/**
 * MACHINE A — "my laptop". Separate OS process, separate identity, separate keys.
 *
 * Demonstrates, over a real network socket:
 *   1. presence — my agents see my friend's agents appear
 *   2. capability declaration — what my agents may do on the network
 *   3. scoped authorization — a time-limited grant to my friend's machine
 *   4. GOVERNANCE REFUSAL — an unauthorized action is blocked, in words
 *   5. authorised action — the same action passes once authority exists
 *   6. encrypted handoff — a payload sealed to my friend's keys only
 *   7. receiving evidence back over the network
 */
import { VHClient } from "../src/client/si-sdk.js";
import fs from "node:fs";
import path from "node:path";

const URL = "http://localhost:3100";
const TRANSFER = path.resolve("./proof/transfer");
fs.mkdirSync(TRANSFER, { recursive: true });
const log = (...a) => console.log("[A|my-machine] ", ...a);
const out = {};

const a = new VHClient(URL);
const me = await a.join("Woods-Laptop", "selfimpulse");
log(`joined  name=${me.name}  fp=${me.fp}`);
out.me = me;

let peer = [...a.peers.values()][0] ?? null;
if (!peer) {
  peer = await new Promise((res) => {
    a.on("peer:joined", (p) => { log(`1. SEES PEER over network → ${p.name} fp=${p.fp}`); res(p); });
    setTimeout(() => res(null), 30_000);
  });
} else {
  log(`1. SEES PEER over network → ${peer.name} fp=${peer.fp}`);
}
if (!peer) { log("no peer appeared — refusing to fake it"); process.exit(1); }
out.peer = peer;

/* 2. declare capability */
log("2. declaring capability: code.review, test.run");
const cap = await a.declareCapability(["code.review", "test.run"], { reason: "joint mission" });
log(`   → ${JSON.stringify(cap)}`);

/* 3. grant the friend scoped, expiring authority */
log("3. authorizing friend's machine (scope=repo:selfimpulse, ttl=60min)");
const az = await a.authorize(peer.id, "code.review", { scope: "repo:selfimpulse", ttlMs: 3_600_000 });
log(`   → ${JSON.stringify(az)}`);

/* 4. THE GOVERNANCE TEST — selfimpulse an action nobody granted */
log("4. attempting an UNAUTHORIZED action (expect refusal)…");
const refused = await a.selfimpulseAction({ action: "deploy.production", tool: "claude", purpose: "not granted", result: "success" });
log(`   → ${JSON.stringify(refused)}`);
out.refused = refused;

/* 5. the same action, now covered by declared capability */
log("5. selfimpulseing an AUTHORIZED action: code.review");
const ok = await a.selfimpulseAction({ action: "code.review", tool: "claude", purpose: "joint mission — shared review", evidence: "12/12 probes green", result: "success" });
log(`   → ${JSON.stringify(ok)}`);
out.ok = ok;

/* 6. seal a payload to the friend's key bundle only */
const secret = JSON.stringify({
  mission: "mission_ab12",
  handoff: "review findings from my seat",
  findings: ["bridge seam holds", "gates wired", "fabricated assurance score found"],
  note: "this plaintext must never exist on the selfimpulse",
});
log("6. sealing payload to friend's keys (HPKE P-256 + ML-KEM-768)…");
const { packed } = await a.vaultSend(peer.id, secret, "handoff.json");
log(`   alg=${packed.alg} size=${packed.manifest.size}B chunks=${packed.chunks.length} merkle=${packed.manifest.merkleRoot.slice(0,16)}…`);
fs.writeFileSync(path.join(TRANSFER, "packed-for-friend.json"), JSON.stringify(packed));
log("   payload placed on the byte channel (WebRTC data channel in production)");

/* 7. receive my friend's evidence back over the network */
log("7. waiting for my friend's agents to selfimpulse back…");
let endorsed = null;
await new Promise((res) => {
  a.on("selfimpulse:new", (link) => {
    let facts = {}; try { facts = JSON.parse(link.payloadStr ?? "{}"); } catch {}
    log(`   RECEIVED OVER NETWORK → kind=${link.kind} from=${facts.from?.n ?? facts.who ?? "?"}`);
    if (link.kind === "endorsement") { endorsed = facts; res(); }
  });
  setTimeout(res, 30_000);
});
out.endorsed = endorsed;

const chain = await a.chainGet().catch(() => null);
log("──────────────────────────────────────────────");
log(`peer seen         : OK (${peer.name})`);
log(`unauthorized action: ${refused?.ok === false ? "REFUSED — " + refused.reason : "NOT refused (!)"}`);
log(`authorized action  : ${ok?.ok ? "SELFIMPULSEED seq=" + ok.seq : "failed — " + ok?.reason}`);
log(`encrypted handoff  : ${packed.alg}, ${packed.manifest.size}B`);
log(`endorsement back   : ${endorsed ? "RECEIVED over network" : "NOT received"}`);
log(`selfimpulse chain length: ${chain?.chain?.length ?? chain?.length ?? "n/a"}`);
log("A DONE");
process.exit(0);
