/**
 * Machine B side of the deciding experiment: grant authority TO machine A,
 * and observe whether that is what unlocks A's ability to act.
 */
import { VHClient } from "../src/client/si-sdk.js";

const URL = "http://localhost:3100";
const log = (...a) => console.log(...a);

const b = new VHClient(URL);
const me = await b.join("Friend-Laptop", "authz-test");
log(`[B] joined fp=${me.fp}`);

const seen = [];
b.on("selfimpulse:new", (link) => {
  let f = {}; try { f = JSON.parse(link.payloadStr ?? "{}"); } catch {}
  const kind = link.kind ?? f.kind;
  seen.push(f);
  if (kind === "authorization") log(`[B] saw authorization: from=${f.from?.n} subject=${f.subject?.n} (${f.subject?.fp}) action="${f.action}"`);
  if (kind === "capability")    log(`[B] saw capability from ${f.agent?.n}`);
  if (kind === "agent_action")  log(`[B] saw agent_action from ${f.agent?.n} "${f.action}"`);
});

const peer = await new Promise((r) => {
  const existing = [...b.peers.values()][0];
  if (existing) return r(existing);
  b.on("peer:joined", r);
  setTimeout(() => r(null), 30_000);
});
if (!peer) { log("[B] no peer"); process.exit(1); }
log(`[B] peer = ${peer.name} (${peer.fp})`);

/* wait for the peer to finish declaring, then GRANT the peer authority */
await new Promise((r) => { const t = setInterval(() => { if (seen.some((f) => f.kind === "capability")) { clearInterval(t); r(); } }, 250); setTimeout(() => { clearInterval(t); r(); }, 20_000); });

log("[B] DECLARING capability first (required before granting)…");
log(`[B] declare → ${JSON.stringify(await b.declareCapability(["code.review","test.run"], { reason: "so we may grant" }))}`);
log("[B] granting authority TO the other machine (cross-machine handshake)…");
const g = await b.authorize(peer.id, "code.review", { scope: "repo:shared", ttlMs: 1_800_000 });
log(`[B] grant → ${JSON.stringify(g)}`);

await new Promise((r) => setTimeout(r, 12_000));
log("[B] DONE");
process.exit(0);
