#!/usr/bin/env node
/* ============================================================================
 * bridge-selftest — zero-install gate for the selfimpulse-receipt bridge.
 *   node protocol/bridge/bridge-selftest.mjs
 * Uses node builtins + protocol core files only (no npm install), in the
 * culture of tools/verify-receipt.mjs.
 * ========================================================================== */
import crypto from "node:crypto";
import {
  generateBridgeIdentity, verifyReceiptChain, issuerFingerprint,
  anchorReceipt, verifyAnchor, openFact, sealFact,
} from "./selfimpulse-receipt-bridge.mjs";
/* Protocol gate checks (PolicyEngine + BindingValidator) are imported
   dynamically: they pull si-crypto → @hpke/core. Without `npm install` in
   protocol/ those three checks are honestly marked SKIP (counted separately,
   never as passes) — same posture as verify/run.mjs. With deps installed,
   they run for real. */
let PolicyEngine = null, assertSignerBinding = null, haveProtocol = false;
try {
  ({ PolicyEngine } = await import("../src/core/si-policy.js"));
  ({ assertSignerBinding } = await import("../src/core/si-binding.js"));
  haveProtocol = true;
} catch { haveProtocol = false; }
let skipped = 0;
const skip = (name) => { skipped++; console.log("  ⏭  " + name + "  (SKIP — run npm install in protocol/ to enable)"); };

let pass = 0, fail = 0;
const check = (name, cond) => {
  cond ? pass++ : fail++;
  console.log((cond ? "  ✅ " : "  ❌ ") + name);
};

/* ── build a synthetic, CORRECT si-proof-receipt/2 receipt ─────────────── */
const sortDeep = (v) => Array.isArray(v) ? v.map(sortDeep)
  : (v && typeof v === "object") ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])])) : v;
const canon = (o) => JSON.stringify(sortDeep(o));
const sha = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (s) => crypto.createHmac("sha256", "si-commercial-v1-offline").update(s, "utf8").digest("hex");

const issuer = crypto.generateKeyPairSync("ed25519");
const issuerPubHex = issuer.publicKey.export({ format: "jwk" }).x
  ? Buffer.from(issuer.publicKey.export({ format: "jwk" }).x, "base64url").toString("hex")
  : null;

function buildReceipt(events, { sign = true, tamperSeq } = {}) {
  let prev = "0".repeat(64);
  const built = events.map((body, i) => {
    const e = { seq: i, prev, ts: 1_750_000_000_000 + i, ...body };
    e.hash = sha(canon(e));
    prev = e.hash;
    return e;
  });
  const rc = { format: "si-proof-receipt/2", header: { mission: "bridge-selftest" }, events: built, seal: hmac(prev) };
  if (sign) {
    rc.issuer = { alg: "ed25519", publicKeyHex: issuerPubHex };
    rc.signature = crypto.sign(null, Buffer.from(prev, "hex"), issuer.privateKey).toString("hex");
  }
  if (tamperSeq !== undefined) rc.events[tamperSeq].note = "evil";
  return rc;
}

const baseEvents = [
  { type: "mission.start", objective: "harden-release" },
  { type: "tool.call", tool: "shell_exec", governed: true },
  { type: "mission.done", verified: true },
];

console.log("\n── receipt chain verification (mirror of tools/verify-receipt.mjs) ──");
const good = buildReceipt(baseEvents);
const v = verifyReceiptChain(good);
check("valid signed receipt verifies", v.ok === true);
check("chain head is 64-hex", /^[0-9a-f]{64}$/.test(v.head ?? ""));
check("issuer fingerprint is 16-hex", /^[0-9a-f]{16}$/.test(issuerFingerprint(issuerPubHex)));

const tampered = buildReceipt(baseEvents, { tamperSeq: 1 });
const vt = verifyReceiptChain(tampered);
check("tampered event detected", !vt.ok && /hash mismatch|chain broken/.test(vt.reason));

const badSeal = { ...buildReceipt(baseEvents), seal: "0".repeat(64) };
const vs = verifyReceiptChain(badSeal);
check("bad seal detected", !vs.ok && vs.reason === "seal mismatch");

const badSig = { ...buildReceipt(baseEvents) };
badSig.signature = crypto.sign(null, Buffer.from("f".repeat(64), "hex"), issuer.privateKey).toString("hex");
const vg = verifyReceiptChain(badSig);
check("bad issuer signature detected", !vg.ok && /issuer signature/.test(vg.reason));

const sealOnly = buildReceipt(baseEvents, { sign: false });
/* C-4 (review of archive 3): this used to assert the OPPOSITE — that a
   current-format receipt without a signature verifies. The canonical verifier
   (src/mission/receipts.ts) refuses exactly that; the bridge now does too. */
const vsa = verifyReceiptChain(sealOnly);
check("unsigned si-proof-receipt/2 refused (canonical parity)", !vsa.ok && /issuer signature/.test(vsa.reason ?? ""));

const legacyUnsigned = { ...buildReceipt(baseEvents, { sign: false }), format: "mj-proof-receipt/1" };
legacyUnsigned.seal = crypto.createHmac("sha256", "mj-commercial-v1-offline")
  .update(legacyUnsigned.events[legacyUnsigned.events.length - 1].hash, "utf8").digest("hex");
check("legacy mj-proof-receipt/1 still verifies unsigned", verifyReceiptChain(legacyUnsigned).ok === true);

console.log("\n── anchoring into the selfimpulse chain ──");
const anchor = generateBridgeIdentity("patina-agent");
const anchored = anchorReceipt(anchor, good);
check("anchorReceipt succeeds on verified receipt", anchored.ok === true);
check("evidence binds the chain head", (anchored.evidence ?? "").includes(anchored.verdict.head));

const refused = anchorReceipt(anchor, tampered);
check("anchorReceipt refuses tampered receipt in words", refused.ok === false && typeof refused.reason === "string");

console.log("\n── envelope wire-compat + protocol gates ──");
const opened = verifyAnchor(anchored.env, anchor.publicJwk);
check("verifyAnchor round-trips", opened.ok === true && opened.facts.kind === "agent_action");

const forged = { ...anchored.env, p: anchored.env.p.replace("success", "success\", \"extra\": 1") };
check("tampered envelope rejected", !verifyAnchor(forged, anchor.publicJwk).ok);

const wrongKey = generateBridgeIdentity("impostor");
check("wrong signer rejected", !verifyAnchor(anchored.env, wrongKey.publicJwk).ok);

if (haveProtocol) {
  const policy = new PolicyEngine();
  check("anchor fact passes protocol policy", policy.selfimpulse(anchored.facts).ok === true);
  check("binding: signer == actor accepted", assertSignerBinding(anchored.facts, anchor.fp).ok === true);
  const claim = { ...anchored.facts, agent: { n: "other", fp: wrongKey.fp } };
  check("binding: signer != actor rejected", !assertSignerBinding(claim, anchor.fp).ok);
} else {
  skip("anchor fact passes protocol policy");
  skip("binding: signer == actor accepted");
  skip("binding: signer != actor rejected");
}

/* cross-compat: bridge envelope opens with the same payload string the
   protocol's openSecure verifies — `${p}|${n}|${ts}` ECDSA P-256 ieee-p1363 */
const roundtrip = openFact(sealFact({ kind: "agent_action", probe: true }, anchor.privateKey), anchor.publicJwk);
check("sealFact/openFact round-trip", roundtrip.verified === true);

console.log("\n" + "═".repeat(52));
console.log(fail === 0 ? `🏆 ALL ${pass} BRIDGE CHECKS PASSED${skipped ? ` (${skipped} skipped — no deps)` : ""}` : `⚠️  ${fail} FAILED / ${pass} passed`);
console.log("═".repeat(52));
process.exit(fail === 0 ? 0 : 1);
