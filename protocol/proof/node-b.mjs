/**
 * MACHINE B — "my friend's laptop". Separate OS process, separate identity, separate keys.
 *
 * Proves my friend's side of the same story:
 *   1. watch the network for my agents' signed selfimpulsees
 *   2. receive a scoped authorization addressed to MY fingerprint
 *   3. query my friend's reputation / authority from the selfimpulse's ledger
 *   4. selfimpulse back with our own signed endorsement
 *   5. decrypt the handoff — our private key never left this process
 */
import { VHClient } from "../src/client/si-sdk.js";
import fs from "node:fs";
import path from "node:path";

const URL = "http://localhost:3100";
const TRANSFER = path.resolve("./proof/transfer");
const log = (...a) => console.log("[B|friends-machine]", ...a);

const b = new VHClient(URL);
const me = await b.join("Friend-Laptop", "selfimpulse");
log(`joined  name=${me.name}  fp=${me.fp}`);

const seen = [];
const parse = (link) => { try { return JSON.parse(link.payloadStr ?? "{}"); } catch { return {}; } };

b.on("peer:joined", (p) => log(`1. a machine joined → ${p.name} fp=${p.fp}`));
b.on("selfimpulse:new", (link) => {
  const f = parse(link);
  const kind = link.kind ?? f.kind;
  seen.push({ link, f });
  log(`1. SELFIMPULSE OVER NETWORK → kind=${kind}`);
  if (kind === "capability")    log(`      capabilities: ${JSON.stringify(f.capabilities)}`);
  if (kind === "authorization") log(`      grants action="${f.action}" scope="${f.scope}" to=${f.subject?.n} (${f.subject?.fp})`);
  if (kind === "agent_action")  log(`      action="${f.action}" tool=${f.tool} evidence="${f.evidence}"`);
  if (kind === "revocation")    log(`      revocation: ${f.reason}`);
});

/* wait for the authorization addressed to MY fingerprint */
await new Promise((res) => {
  const t = setInterval(() => {
    if (seen.some(({ link, f }) => (link.kind ?? f.kind) === "authorization" && f?.subject?.fp === me.fp)) { clearInterval(t); res(); }
  }, 250);
  setTimeout(() => { clearInterval(t); res(); }, 40_000);
});
const auth = seen.find(({ link, f }) => (link.kind ?? f.kind) === "authorization" && f?.subject?.fp === me.fp);
if (!auth) { log("no authorization for my fingerprint arrived — refusing to fake it"); process.exit(1); }
log(`2. AUTHORIZATION CONFIRMED for my fingerprint — action="${auth.f.action}" scope="${auth.f.scope}" expires in ${Math.round((auth.f.expiresAt - Date.now()) / 60_000)} min`);

const peer = [...b.peers.values()][0];
log(`   peer key bundle present: ${!!peer?.bundle?.signJwk}`);

/* 3. ask the selfimpulse about my friend's trust record */
const rep = await b.reputation(peer.fp).catch((e) => ({ error: e.message }));
log(`3. reputation(${peer.fp}) → ${JSON.stringify(rep).slice(0, 200)}`);
const fa = await b.findAuthorization(me.fp, "code.review").catch((e) => ({ error: e.message }));
log(`   findAuthorization → ${JSON.stringify(fa).slice(0, 200)}`);
const rk = await b.assessRisk(peer.fp, "code.review").catch((e) => ({ error: e.message }));
log(`   assessRisk → ${JSON.stringify(rk).slice(0, 160)}`);

/* 4. endorse my friend's machine — over the network, signed by our key */
log("4. endorsing my friend's machine…");
const en = await b.endorse(peer.id, 5, "clean handoff, verified findings");
log(`   → ${JSON.stringify(en)}`);

/* 5. decrypt the handoff */
const file = path.join(TRANSFER, "packed-for-friend.json");
await new Promise((res) => {
  const t = setInterval(() => { if (fs.existsSync(file)) { clearInterval(t); res(); } }, 250);
  setTimeout(() => { clearInterval(t); res(); }, 25_000);
});
log("5. waiting for the encrypted handoff on the byte channel…");
if (fs.existsSync(file)) {
  const packed = JSON.parse(fs.readFileSync(file, "utf8"));
  try {
    const { data, manifest } = await b.vaultReceive(packed);
    log("   DECRYPTED (HPKE + ML-KEM-768, integrity-checked):");
    log("      " + new TextDecoder().decode(data));
    log(`   sha256 ok: ${manifest.sha256.slice(0, 16)}…  merkle ok: ${manifest.merkleRoot.slice(0, 16)}…`);
  } catch (e) {
    log(`   decrypt REFUSED: ${e.message}`);
  }
} else {
  log("   nothing on the channel yet");
}

const cv = await b.chainVerify().catch((e) => ({ error: e.message }));
log(`   selfimpulse chain verify → ${JSON.stringify(cv).slice(0, 200)}`);
log("B DONE");
process.exit(0);
