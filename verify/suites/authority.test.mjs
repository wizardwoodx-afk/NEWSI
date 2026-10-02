import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/authority.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/engine/authority.ts
import { createHash, createHmac } from "node:crypto";
var sha256 = (t) => createHash("sha256").update(t).digest("hex");
var hmac = (secret, t) => createHmac("sha256", secret).update(t).digest("hex");
var mandateCanonical = (m) => JSON.stringify({
  v: "vh.mandate.v1",
  agentId: m.agentId,
  owner: m.owner,
  scope: [...m.scope].sort(),
  budgetCap: m.budgetCap,
  maxDepth: m.maxDepth,
  issuedAt: m.issuedAt,
  expiresAt: m.expiresAt
});
function signMandate(m, ownerSecret) {
  return { ...m, signature: hmac(ownerSecret, mandateCanonical(m)) };
}
function verifyMandate(m, ownerSecret, now2 = Date.now()) {
  if (!m) return { ok: false, reason: "missing", detail: "no mandate passport \u2014 the agent does not act" };
  if (!m.owner) return { ok: false, reason: "no-owner", detail: "a mandate without a named human owner is not authority" };
  if (now2 > m.expiresAt) return { ok: false, reason: "expired", detail: "mandate expired \u2014 re-issue it" };
  const want = hmac(ownerSecret, mandateCanonical(m));
  if (want !== m.signature) return { ok: false, reason: "bad-signature", detail: "mandate signature does not verify \u2014 treating as forged" };
  return { ok: true, mandate: m };
}
var remainingBudget = (b) => Math.max(0, b.mandate.budgetCap - b.spent);
var hopCanonical = (h) => JSON.stringify({
  v: "vh.authority-hop.v1",
  from: h.from,
  to: h.to,
  scope: [...h.grantedScope].sort(),
  budget: h.grantedBudget,
  depth: h.depth,
  parent: h.parentDigest
});
function delegateAuthority(parent, to, grantedScope, grantedBudget, parentDigest) {
  const { mandate } = parent;
  if (parent.depth + 1 > mandate.maxDepth) {
    return { ok: false, reason: "depth-exceeded", detail: `delegation depth ${parent.depth + 1} exceeds the mandate ceiling ${mandate.maxDepth}` };
  }
  const held = new Set(mandate.scope);
  const inflated = grantedScope.filter((s) => !held.has(s));
  if (inflated.length) {
    return { ok: false, reason: "scope-inflation", detail: `cannot grant scope not held: ${inflated.join(", ")} \u2014 authority only shrinks` };
  }
  if (grantedBudget > remainingBudget(parent)) {
    return { ok: false, reason: "budget-inflation", detail: `cannot grant ${grantedBudget} \u2014 only ${remainingBudget(parent)} authority remains` };
  }
  const base = {
    from: mandate.agentId,
    to,
    grantedScope,
    grantedBudget,
    depth: parent.depth + 1,
    parentDigest
  };
  return { ok: true, hop: { ...base, digest: sha256(hopCanonical(base)) } };
}
function verifyChain(hops) {
  for (let i = 0; i < hops.length; i++) {
    const h = hops[i];
    const { digest, ...unsigned } = h;
    if (sha256(hopCanonical(unsigned)) !== digest) {
      return { ok: false, brokenAt: i, reason: "hop digest mismatch \u2014 chain tampered" };
    }
    if (i > 0) {
      const prev = hops[i - 1];
      const prevScope = new Set(prev.grantedScope);
      if (h.grantedScope.some((s) => !prevScope.has(s))) {
        return { ok: false, brokenAt: i, reason: "scope inflation mid-chain" };
      }
      if (h.grantedBudget > prev.grantedBudget) {
        return { ok: false, brokenAt: i, reason: "budget inflation mid-chain" };
      }
      if (h.parentDigest !== prev.digest) {
        return { ok: false, brokenAt: i, reason: "broken parent link" };
      }
    }
  }
  return { ok: true, brokenAt: null, reason: "chain holds" };
}
function declareIntent(d) {
  return { ...d, declaredTools: [...new Set(d.declaredTools)] };
}
function gateIntent(d, decision, executedTools) {
  const declared = new Set(d.declaredTools);
  const divergence = executedTools.filter((t) => !declared.has(t));
  const receipt = {
    declaration: d,
    gateDecision: decision.approved ? "approved" : "refused",
    gateReason: decision.reason,
    executedTools,
    divergence,
    converged: divergence.length === 0 && decision.approved
  };
  return { ...receipt, digest: sha256(JSON.stringify(receipt)) };
}
function buildWarrantyPack(agentId, window, stats, secret) {
  const base = { agentId, window, ...stats };
  return { ...base, seal: hmac(secret, JSON.stringify(base)) };
}
function liabilityMap(root, hops) {
  const entries = [{ principal: `${root.owner} (owner)`, owedScope: root.scope, owedBudget: root.budgetCap, depth: 0 }];
  for (const h of hops) entries.push({ principal: h.to, owedScope: h.grantedScope, owedBudget: h.grantedBudget, depth: h.depth });
  return entries;
}
var bindAuthorityToReceipt = (receiptDigest, hopDigest, mandateOwner) => {
  const base = { receiptDigest, hopDigest, mandateOwner };
  return { ...base, digest: sha256(JSON.stringify(base)) };
};
var verifyAuthorityBinding = (binding, receiptDigest, hopDigest) => {
  const want = sha256(JSON.stringify({ receiptDigest, hopDigest, mandateOwner: binding.mandateOwner }));
  return want === binding.digest && binding.receiptDigest === receiptDigest;
};

// src/engine/authorityCore.ts
var mandateCanonical2 = (m) => JSON.stringify({
  v: "vh.mandate.v1",
  agentId: m.agentId,
  owner: m.owner,
  scope: [...m.scope].sort(),
  budgetCap: m.budgetCap,
  maxDepth: m.maxDepth,
  issuedAt: m.issuedAt,
  expiresAt: m.expiresAt
});
function bytesToB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}
function b64ToBytes(b64) {
  const s = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// src/engine/authorityWeb.ts
var EC = { name: "ECDSA", namedCurve: "P-256" };
async function generateOwnerKeysWeb() {
  const pair = await crypto.subtle.generateKey(EC, true, ["sign", "verify"]);
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  return { privateKey: pair.privateKey, publicKey: pair.publicKey, publicKeyPem: pem("PUBLIC KEY", spki) };
}
function pem(label, der) {
  const b64 = bytesToB64(new Uint8Array(der));
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN ${label}-----
${lines.join("\n")}
-----END ${label}-----
`;
}
async function importPublicKeyWeb(publicKeyPem) {
  const b64 = publicKeyPem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\s+/g, "");
  return crypto.subtle.importKey("spki", b64ToBytes(b64).buffer, EC, false, ["verify"]);
}
async function signMandateWeb(m, keys) {
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, new TextEncoder().encode(mandateCanonical2(m)).buffer);
  return { ...m, signature: `ecdsa-p256:${bytesToB64(new Uint8Array(sig))}` };
}
async function verifyMandateWeb(m, publicKeyPem, now2 = Date.now()) {
  if (!m) return { ok: false, reason: "missing", detail: "no mandate passport \u2014 the agent does not act" };
  if (!m.owner) return { ok: false, reason: "no-owner", detail: "a mandate without a named human owner is not authority" };
  if (now2 > m.expiresAt) return { ok: false, reason: "expired", detail: "mandate expired \u2014 re-issue it" };
  if (!m.signature?.startsWith("ecdsa-p256:")) {
    return { ok: false, reason: "bad-signature", detail: "not an asymmetric signature \u2014 refusing to treat symmetric HMAC as portable authority" };
  }
  try {
    const pub = await importPublicKeyWeb(publicKeyPem);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, b64ToBytes(m.signature.slice("ecdsa-p256:".length)), new TextEncoder().encode(mandateCanonical2(m)).buffer);
    if (!ok) return { ok: false, reason: "bad-signature", detail: "asymmetric signature does not verify \u2014 treating as forged" };
    return { ok: true, mandate: m };
  } catch {
    return { ok: false, reason: "bad-signature", detail: "public key or signature malformed \u2014 treating as forged" };
  }
}
var sha256HexWeb = async (t) => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
async function bindAuthorityToReceiptWeb(receiptDigest, hopDigest, mandateOwner, mandateDigest = null) {
  const base = mandateDigest == null ? { receiptDigest, hopDigest, mandateOwner } : { receiptDigest, mandateDigest, hopDigest, mandateOwner };
  return { receiptDigest, mandateDigest, hopDigest, mandateOwner, digest: await sha256HexWeb(JSON.stringify(base)) };
}
async function verifyAuthorityBindingWeb(binding, receiptDigest, hopDigest, expectedMandateDigest = null) {
  const legacy = binding.mandateDigest == null;
  const base = legacy ? { receiptDigest, hopDigest, mandateOwner: binding.mandateOwner } : { receiptDigest, mandateDigest: binding.mandateDigest, hopDigest, mandateOwner: binding.mandateOwner };
  const want = await sha256HexWeb(JSON.stringify(base));
  if (want !== binding.digest || binding.receiptDigest !== receiptDigest) return false;
  if (expectedMandateDigest !== null && !legacy && binding.mandateDigest !== expectedMandateDigest) return false;
  return true;
}

// src/engine/pureHash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
var utf8 = (text) => new TextEncoder().encode(text);
function sha256Bytes(data) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((data.length + 8 >> 6 << 6) + 64);
  padded.set(data);
  padded[data.length] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0);
  ov.setUint32(4, h1);
  ov.setUint32(8, h2);
  ov.setUint32(12, h3);
  ov.setUint32(16, h4);
  ov.setUint32(20, h5);
  ov.setUint32(24, h6);
  ov.setUint32(28, h7);
  return out;
}
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex(sha256Bytes(utf8(text)));
}
function pureHmacSha256(secret, text) {
  let key = utf8(secret);
  if (key.length > 64) key = sha256Bytes(key);
  const ipad = new Uint8Array(64).fill(54);
  const opad = new Uint8Array(64).fill(92);
  for (let i = 0; i < key.length; i++) {
    ipad[i] ^= key[i];
    opad[i] ^= key[i];
  }
  const inner = new Uint8Array(64 + utf8(text).length);
  inner.set(ipad);
  inner.set(utf8(text), 64);
  return toHex(sha256Bytes(new Uint8Array([...opad, ...sha256Bytes(inner)])));
}

// src/engine/selfimpulseMesh.ts
var sha2562 = pureSha256;
var hmac2 = pureHmacSha256;
function registerPeer(p, now2 = Date.now()) {
  if (!p.endpoint.startsWith("https://")) {
    return { refused: `peer ${p.peerId}: plain-http endpoint refused \u2014 SelfImpulseMesh is TLS-by-default` };
  }
  const identityDigest = sha2562(JSON.stringify({ v: "vh.mesh.identity.v1", peerId: p.peerId, instanceOf: p.instanceOf, endpoint: p.endpoint }));
  return { ...p, registeredAt: now2, identityDigest };
}
function attest(peerSecret, attester, subject, trustGrant, now2 = Date.now()) {
  const base = { attester, subject: subject.peerId, capabilities: subject.capabilities, trustGrant, issuedAt: now2 };
  const signature = hmac2(peerSecret, JSON.stringify(base));
  return { ...base, signature, digest: sha2562(JSON.stringify(base) + "." + signature) };
}
function openChannel(a, b) {
  if (a.attester === b.attester) return { refused: "a channel needs two different peers \u2014 self-attestation is not trust" };
  if (a.subject !== b.attester || b.subject !== a.attester) {
    return { refused: "attestations do not cross-reference \u2014 each peer must selfimpulse for the other" };
  }
  return { a: a.attester, b: b.attester, attestationAtoB: a, attestationBtoA: b, channelDigest: sha2562(a.digest + "|" + b.digest) };
}
var jointCanonical = (missionId, channelDigest, actions) => JSON.stringify({ v: "vh.mesh.joint.v1", missionId, channelDigest, actions });
function buildJointReceipt(missionId, channel, actions) {
  return { missionId, channelDigest: channel.channelDigest, participants: [channel.a, channel.b], actions, coSignatures: {}, digest: "" };
}
function coSign(receipt, peerId, peerSecret) {
  if (!receipt.participants.includes(peerId)) {
    throw new Error(`${peerId} is not a participant of mission ${receipt.missionId} \u2014 outsiders cannot co-sign`);
  }
  const body = jointCanonical(receipt.missionId, receipt.channelDigest, receipt.actions);
  const coSignatures = { ...receipt.coSignatures, [peerId]: hmac2(peerSecret, body) };
  const digest = sha2562(body + "|" + Object.entries(coSignatures).sort().map(([k, v]) => `${k}:${v}`).join(","));
  return { ...receipt, coSignatures, digest };
}
function isFullyCoSigned(receipt) {
  return receipt.participants.every((p) => Boolean(receipt.coSignatures[p]));
}
var pairKey = (a, b) => [a, b].sort().join("\u2194");
function recordJointOutcome(ledger, a, b, outcome) {
  const key = pairKey(a, b);
  const cur = ledger.get(key) ?? { pairKey: key, trust: 0, jointReceipts: 0, divergences: 0 };
  if (outcome === "clean") {
    cur.trust += 1;
    cur.jointReceipts += 1;
  }
  if (outcome === "divergence") {
    cur.trust = Math.max(0, cur.trust - 2);
    cur.divergences += 1;
  }
  if (outcome === "refused") {
    cur.trust = Math.max(0, cur.trust - 1);
  }
  ledger.set(key, cur);
  return cur;
}
function quarantinePeer(peerId, reason, now2 = Date.now()) {
  return { peerId, reason, at: now2, digest: sha2562(`vh.mesh.quarantine.v1:${peerId}:${reason}:${now2}`) };
}
var meshStanding = (t) => !t ? "unknown" : t.trust < 3 ? "probation" : t.trust < 10 ? "selfimpulseed" : "proven";

// probe/authority.test.ts
var now = 18e11;
var SECRET_OWNER = "owner-secret";
test("authority + selfimpulsemesh", async (t) => {
  const mandate = signMandate({
    agentId: "si-agent-1",
    owner: "sree",
    scope: ["fs.read", "net.fetch"],
    budgetCap: 100,
    maxDepth: 2,
    issuedAt: now,
    expiresAt: now + 36e5
  }, SECRET_OWNER);
  await t.test("a signed mandate verifies", () => {
    const r = verifyMandate(mandate, SECRET_OWNER, now + 1e3);
    assert.equal(r.ok, true);
  });
  await t.test("no mandate = refusal, not silence", () => {
    const r = verifyMandate(null, SECRET_OWNER, now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "missing");
  });
  await t.test("an expired mandate is refused", () => {
    const r = verifyMandate(mandate, SECRET_OWNER, now + 72e5);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "expired");
  });
  await t.test("a forged signature is refused", () => {
    const forged = { ...mandate, budgetCap: 99999 };
    const r = verifyMandate(forged, SECRET_OWNER, now + 1e3);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad-signature");
  });
  await t.test("a mandate without an owner is not authority", () => {
    const m = signMandate({ agentId: "x", owner: "", scope: [], budgetCap: 1, maxDepth: 1, issuedAt: now, expiresAt: now + 1e3 }, SECRET_OWNER);
    const r = verifyMandate(m, SECRET_OWNER, now);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "no-owner");
  });
  const root = { mandate, spent: 0, depth: 0 };
  await t.test("a contained delegation succeeds and links the chain", () => {
    const d = delegateAuthority(root, "si-agent-2", ["fs.read"], 40, null);
    assert.equal(d.ok, true);
    if (d.ok) {
      assert.equal(d.hop.depth, 1);
      assert.ok(d.hop.digest);
    }
  });
  await t.test("scope inflation is refused \u2014 authority only shrinks", () => {
    const d = delegateAuthority(root, "si-agent-2", ["fs.read", "fs.write"], 10, null);
    assert.equal(d.ok, false);
    if (!d.ok) assert.equal(d.reason, "scope-inflation");
  });
  await t.test("budget inflation is refused", () => {
    const d = delegateAuthority(root, "si-agent-2", ["fs.read"], 150, null);
    assert.equal(d.ok, false);
    if (!d.ok) assert.equal(d.reason, "budget-inflation");
  });
  await t.test("the depth ceiling comes from the mandate", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 10, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const child = { mandate, spent: 0, depth: 1 };
      const d2 = delegateAuthority(child, "c", ["fs.read"], 5, d1.hop.digest);
      assert.ok(d2.ok);
      if (d2.ok) {
        const grand = { mandate, spent: 0, depth: 2 };
        const d3 = delegateAuthority(grand, "d", ["fs.read"], 1, d2.hop.digest);
        assert.equal(d3.ok, false);
        if (!d3.ok) assert.equal(d3.reason, "depth-exceeded");
      }
    }
  });
  await t.test("budget decays with spend", () => {
    const b = { mandate, spent: 60, depth: 0 };
    assert.equal(remainingBudget(b), 40);
    const d = delegateAuthority(b, "x", ["fs.read"], 50, null);
    assert.equal(d.ok, false);
  });
  await t.test("a valid chain verifies end-to-end", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read", "net.fetch"], 80, null);
    assert.ok(d1.ok);
    const mid = { mandate, spent: 0, depth: 1 };
    const d2 = delegateAuthority(mid, "c", ["fs.read"], 30, d1.ok ? d1.hop.digest : null);
    assert.ok(d2.ok);
    if (d1.ok && d2.ok) {
      const v = verifyChain([d1.hop, d2.hop]);
      assert.equal(v.ok, true);
    }
  });
  await t.test("a tampered hop breaks the chain at the right place", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 40, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const tampered = { ...d1.hop, grantedBudget: 999 };
      const v = verifyChain([tampered]);
      assert.equal(v.ok, false);
      assert.equal(v.brokenAt, 0);
    }
  });
  await t.test("converged intent: did what it declared", () => {
    const d = declareIntent({ agentId: "a", taskId: "t1", declaredIntent: "read the log and summarize", declaredTools: ["fs.read"] });
    const r = gateIntent(d, { approved: true, reason: "safe read" }, ["fs.read"]);
    assert.equal(r.converged, true);
    assert.equal(r.divergence.length, 0);
  });
  await t.test("divergent intent is measured, not hidden", () => {
    const d = declareIntent({ agentId: "a", taskId: "t2", declaredIntent: "read the log", declaredTools: ["fs.read"] });
    const r = gateIntent(d, { approved: true, reason: "safe read" }, ["fs.read", "fs.write", "net.fetch"]);
    assert.equal(r.converged, false);
    assert.deepEqual(r.divergence.sort(), ["fs.write", "net.fetch"]);
  });
  await t.test("a refused intent stays refused even if tools ran", () => {
    const d = declareIntent({ agentId: "a", taskId: "t3", declaredIntent: "send data out", declaredTools: ["net.fetch"] });
    const r = gateIntent(d, { approved: false, reason: "egress declined at the gate" }, ["net.fetch"]);
    assert.equal(r.converged, false);
    assert.equal(r.gateDecision, "refused");
  });
  await t.test("the warranty pack seals deterministically", () => {
    const w1 = buildWarrantyPack("si-agent-1", { from: now, to: now + 864e5 }, { missionsCompleted: 12, gateApprovals: 40, gateRefusals: 3, intentConvergenceRate: 0.97, policyViolations: 0, chainDepthMax: 2 }, SECRET_OWNER);
    const w2 = buildWarrantyPack("si-agent-1", { from: now, to: now + 864e5 }, { missionsCompleted: 12, gateApprovals: 40, gateRefusals: 3, intentConvergenceRate: 0.97, policyViolations: 0, chainDepthMax: 2 }, SECRET_OWNER);
    assert.equal(w1.seal, w2.seal);
    const w3 = buildWarrantyPack("si-agent-1", { from: now, to: now + 864e5 }, { missionsCompleted: 13, gateApprovals: 40, gateRefusals: 3, intentConvergenceRate: 0.97, policyViolations: 0, chainDepthMax: 2 }, SECRET_OWNER);
    assert.notEqual(w1.seal, w3.seal);
  });
  await t.test("the liability map names the owner first, then every hop", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 40, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const m = liabilityMap(mandate, [d1.hop]);
      assert.equal(m.length, 2);
      assert.match(m[0].principal, /owner/);
      assert.equal(m[1].principal, "b");
    }
  });
  const peerA = registerPeer({ peerId: "bot-a", instanceOf: "org-alpha", capabilities: ["research", "writing"], endpoint: "https://a.example.com" }, now);
  const peerB = registerPeer({ peerId: "bot-b", instanceOf: "org-beta", capabilities: ["code", "testing"], endpoint: "https://b.example.com" }, now);
  const peerHttp = registerPeer({ peerId: "bot-c", instanceOf: "org-gamma", capabilities: [], endpoint: "http://c.example.com" }, now);
  await t.test("plain-http peers are refused at the door", () => {
    assert.ok("refused" in peerHttp);
  });
  await t.test("registered peers carry a tamper-evident identity", () => {
    assert.ok(!("refused" in peerA) && peerA.identityDigest.length === 64);
  });
  if (!("refused" in peerA) && !("refused" in peerB)) {
    const attA = attest("secret-a", "bot-a", peerB, 3, now);
    const attB = attest("secret-b", "bot-b", peerA, 3, now);
    await t.test("self-attestation is not trust", () => {
      const c = openChannel(attA, attest("secret-a", "bot-a", peerB, 3, now));
      assert.ok("refused" in c);
    });
    await t.test("a mutual handshake opens a channel with two signatures", () => {
      const c = openChannel(attA, attB);
      assert.ok(!("refused" in c) && c.channelDigest.length === 64);
    });
    await t.test("non-cross-referencing attestations are refused", () => {
      const attWrong = attest("secret-x", "bot-x", peerA, 1, now);
      const c = openChannel(attA, attWrong);
      assert.ok("refused" in c);
    });
    const channel = openChannel(attA, attB);
    if (!("refused" in channel)) {
      await t.test("a joint receipt is co-signed by BOTH participants", () => {
        let jr = buildJointReceipt("m-1", channel, [{ actor: "bot-a", action: "research", outcome: "executed", at: now }, { actor: "bot-b", action: "code", outcome: "executed", at: now + 1 }]);
        assert.equal(isFullyCoSigned(jr), false);
        jr = coSign(jr, "bot-a", "secret-a");
        assert.equal(isFullyCoSigned(jr), false);
        jr = coSign(jr, "bot-b", "secret-b");
        assert.equal(isFullyCoSigned(jr), true);
        assert.ok(jr.digest.length === 64);
      });
      await t.test("outsiders cannot co-sign a mission they are not part of", () => {
        const jr = buildJointReceipt("m-2", channel, []);
        assert.throws(() => coSign(jr, "bot-z", "secret-z"));
      });
    }
  }
  await t.test("trust compounds on clean work and decays on divergence", () => {
    const ledger = /* @__PURE__ */ new Map();
    recordJointOutcome(ledger, "bot-a", "bot-b", "clean");
    recordJointOutcome(ledger, "bot-a", "bot-b", "clean");
    const t2 = recordJointOutcome(ledger, "bot-a", "bot-b", "divergence");
    assert.equal(t2.trust, 0);
    assert.equal(t2.divergences, 1);
    assert.equal(meshStanding(void 0), "unknown");
    assert.equal(meshStanding(t2), "probation");
  });
  await t.test("pair keys are order-independent", () => {
    assert.equal(pairKey("a", "b"), pairKey("b", "a"));
  });
  await t.test("quarantine is receipted", () => {
    const q = quarantinePeer("bot-c", "injection flagged in reply", now);
    assert.ok(q.digest.length === 64);
    assert.equal(q.reason, "injection flagged in reply");
  });
  const keys = await generateOwnerKeysWeb();
  const asymMandate = await signMandateWeb({
    agentId: "si-agent-9",
    owner: "sree",
    scope: ["pc.exec", "pc.browser"],
    budgetCap: 50,
    maxDepth: 1,
    issuedAt: now,
    expiresAt: now + 36e5
  }, keys);
  await t.test("an asymmetric mandate verifies with the PUBLIC key alone", async () => {
    const r = await verifyMandateWeb(asymMandate, keys.publicKeyPem, now + 1e3);
    assert.equal(r.ok, true);
  });
  await t.test("the wrong public key refuses the mandate", async () => {
    const stranger = await generateOwnerKeysWeb();
    const r = await verifyMandateWeb(asymMandate, stranger.publicKeyPem, now + 1e3);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "bad-signature");
  });
  await t.test("a symmetric HMAC mandate is refused as portable authority", async () => {
    const r = await verifyMandateWeb(mandate, keys.publicKeyPem, now + 1e3);
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.detail, /asymmetric/);
  });
  await t.test("an expired asymmetric mandate is refused", async () => {
    const r = await verifyMandateWeb(asymMandate, keys.publicKeyPem, now + 72e5);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.reason, "expired");
  });
  await t.test("the portable binding round-trips offline (authorityWeb)", async () => {
    const receiptDigest = "c".repeat(64);
    const b = await bindAuthorityToReceiptWeb(receiptDigest, null, "sree");
    assert.equal(await verifyAuthorityBindingWeb(b, receiptDigest, null), true);
    assert.equal(await verifyAuthorityBindingWeb(b, "d".repeat(64), null), false);
  });
  await t.test("an authority binding attaches a hop to a receipt digest", () => {
    const d1 = delegateAuthority(root, "b", ["fs.read"], 40, null);
    assert.ok(d1.ok);
    if (d1.ok) {
      const receiptDigest = "a".repeat(64);
      const binding = bindAuthorityToReceipt(receiptDigest, d1.hop, "sree");
      assert.equal(verifyAuthorityBinding(binding, receiptDigest, d1.hop), true);
      assert.equal(verifyAuthorityBinding(binding, "b".repeat(64), d1.hop), false);
    }
  });
  await t.test("a root-mandate action binds with a null hop", () => {
    const binding = bindAuthorityToReceipt("c".repeat(64), null, "sree");
    assert.equal(verifyAuthorityBinding(binding, "c".repeat(64), null), true);
  });
});
