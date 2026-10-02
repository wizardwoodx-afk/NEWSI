/**
 * THE DECIDING EXPERIMENT — who must grant authority before an agent may act?
 *
 * The first run proved the network, the crypto and the presence all work, but
 * EVERY agent_action was refused `policy:no-authorization` even though the
 * agent had declared its own capability. This script determines the exact rule:
 *   (a) can an agent authorize ITSELF?
 *   (b) does a grant from the OTHER machine unlock the action?
 */
import { VHClient } from "../src/client/si-sdk.js";

const URL = "http://localhost:3100";
const log = (...a) => console.log(...a);

const a = new VHClient(URL);
const me = await a.join("Woods-Laptop", "authz-test");
log(`[A] joined fp=${me.fp}`);

let peer = [...a.peers.values()][0];
if (!peer) peer = await new Promise((r) => { a.on("peer:joined", r); setTimeout(() => r(null), 25_000); });
if (!peer) { log("[A] no peer"); process.exit(1); }
log(`[A] peer = ${peer.name} (${peer.fp})`);

await a.declareCapability(["code.review"], { reason: "test" });
log("[A] capability declared: code.review");

/* (a) SELF-authorization — is it allowed? */
const selfAuthz = await a.selfimpulseShare({
  v: 2, kind: "authorization",
  from: { n: me.name, fp: me.fp },
  subject: { n: me.name, fp: me.fp },
  action: "code.review", scope: "*", policy: "default",
  expiresAt: Date.now() + 3_600_000, ts: Date.now(),
});
log(`[A] (a) SELF-authorization → ${JSON.stringify(selfAuthz)}`);

const afterSelf = await a.selfimpulseAction({ action: "code.review", tool: "claude", purpose: "after self-grant", result: "success" });
log(`[A] (a) action after SELF-grant → ${JSON.stringify(afterSelf)}`);

/* (b) wait for the OTHER machine to grant A authority */
log("[A] (b) waiting for PEER to grant me authority…");
let peerGrant = null;
a.on("selfimpulse:new", (link) => {
  let f = {}; try { f = JSON.parse(link.payloadStr ?? "{}"); } catch {}
  if ((link.kind ?? f.kind) === "authorization" && f?.subject?.fp === me.fp) {
    log(`[A]     received grant from ${f.from?.n} for action="${f.action}" scope="${f.scope}"`);
    peerGrant = f;
  }
});
await new Promise((r) => { const t = setInterval(() => { if (peerGrant) { clearInterval(t); r(); } }, 250); setTimeout(() => { clearInterval(t); r(); }, 35_000); });

if (peerGrant) {
  const afterPeer = await a.selfimpulseAction({ action: "code.review", tool: "claude", purpose: "after peer grant", result: "success" });
  log(`[A] (b) action after PEER grant → ${JSON.stringify(afterPeer)}`);
} else {
  log("[A] (b) peer never granted — inconclusive");
}

const rep = await a.reputation(me.fp).catch((e) => ({ error: e.message }));
log(`[A] my reputation → ${JSON.stringify(rep).slice(0, 300)}`);
process.exit(0);
