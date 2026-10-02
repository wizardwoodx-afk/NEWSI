import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/meshRuntime.test.ts
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, createHmac } from "node:crypto";

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
var sha256 = pureSha256;
var hmac = pureHmacSha256;
function registerPeer(p, now = Date.now()) {
  if (!p.endpoint.startsWith("https://")) {
    return { refused: `peer ${p.peerId}: plain-http endpoint refused \u2014 SelfImpulseMesh is TLS-by-default` };
  }
  const identityDigest = sha256(JSON.stringify({ v: "vh.mesh.identity.v1", peerId: p.peerId, instanceOf: p.instanceOf, endpoint: p.endpoint }));
  return { ...p, registeredAt: now, identityDigest };
}
function attest(peerSecret, attester, subject, trustGrant, now = Date.now()) {
  const base = { attester, subject: subject.peerId, capabilities: subject.capabilities, trustGrant, issuedAt: now };
  const signature = hmac(peerSecret, JSON.stringify(base));
  return { ...base, signature, digest: sha256(JSON.stringify(base) + "." + signature) };
}
function openChannel(a, b) {
  if (a.attester === b.attester) return { refused: "a channel needs two different peers \u2014 self-attestation is not trust" };
  if (a.subject !== b.attester || b.subject !== a.attester) {
    return { refused: "attestations do not cross-reference \u2014 each peer must selfimpulse for the other" };
  }
  return { a: a.attester, b: b.attester, attestationAtoB: a, attestationBtoA: b, channelDigest: sha256(a.digest + "|" + b.digest) };
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
  const coSignatures = { ...receipt.coSignatures, [peerId]: hmac(peerSecret, body) };
  const digest = sha256(body + "|" + Object.entries(coSignatures).sort().map(([k, v]) => `${k}:${v}`).join(","));
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
var meshStanding = (t) => !t ? "unknown" : t.trust < 3 ? "probation" : t.trust < 10 ? "selfimpulseed" : "proven";

// src/engine/meshRuntime.ts
var TRUST_KEY = "engine.mesh.trust.v1";
var SELFIMPULSE_PEER_ID = "vh.selfimpulse";
var selfimpulsePeer = () => {
  const p = registerPeer({
    peerId: SELFIMPULSE_PEER_ID,
    instanceOf: "selfimpulse",
    capabilities: ["routing", "attestation", "receipts", "gating"],
    endpoint: "https://selfimpulse.local"
  });
  if ("refused" in p) throw new Error(`selfimpulse peer registration refused: ${p.refused}`);
  return p;
};
var anchorEndpointFor = (peerName) => {
  const slug = peerName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "peer";
  return `https://${slug}.si-mesh.local`;
};
var registerRemotePeer = (peerName) => registerPeer({
  peerId: peerName,
  instanceOf: peerName,
  capabilities: ["a2a", "handoff"],
  endpoint: anchorEndpointFor(peerName)
});
var secrets = /* @__PURE__ */ new Map();
function secretFor(peerId) {
  let s = secrets.get(peerId);
  if (!s) {
    const bytes = new Uint8Array(32);
    globalThis.crypto?.getRandomValues(bytes);
    s = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    secrets.set(peerId, s);
  }
  return s;
}
function loadTrust() {
  try {
    const raw = globalThis.localStorage?.getItem(TRUST_KEY);
    if (!raw) return /* @__PURE__ */ new Map();
    const rows = JSON.parse(raw);
    return new Map(rows.map((r) => [r.pairKey, r]));
  } catch {
    return /* @__PURE__ */ new Map();
  }
}
function saveTrust(ledger) {
  try {
    globalThis.localStorage?.setItem(TRUST_KEY, JSON.stringify([...ledger.values()]));
  } catch {
  }
}
function pairTrustFor(a, b) {
  return loadTrust().get(pairKey(a, b));
}
function standingFor(a, b) {
  return meshStanding(pairTrustFor(a, b));
}
function meshForHandoff(input) {
  const ledger = loadTrust();
  if (input.outcome === "refused") {
    recordJointOutcome(ledger, SELFIMPULSE_PEER_ID, input.peer, "refused");
    saveTrust(ledger);
    return {
      meshJointDigest: null,
      meshStanding: meshStanding(ledger.get(pairKey(SELFIMPULSE_PEER_ID, input.peer))),
      meshDetail: "no joint receipt minted \u2014 the handoff was refused before any joint execution; pair trust adjusted"
    };
  }
  const remote = registerRemotePeer(input.peer);
  if ("refused" in remote) {
    return { meshJointDigest: null, meshStanding: "unknown", meshDetail: remote.refused };
  }
  const selfimpulse = selfimpulsePeer();
  const aToB = attest(secretFor(selfimpulse.peerId), selfimpulse.peerId, remote, 1);
  const bToA = attest(secretFor(remote.peerId), remote.peerId, selfimpulse, 1);
  const channel = openChannel(aToB, bToA);
  if ("refused" in channel) {
    return { meshJointDigest: null, meshStanding: "unknown", meshDetail: `channel refused: ${channel.refused}` };
  }
  const now = Date.now();
  let receipt = buildJointReceipt(`handoff:${input.handoffId}`, channel, [
    { actor: selfimpulse.peerId, action: "delegate", outcome: "executed", at: now },
    { actor: remote.peerId, action: input.taskDigest || "accept", outcome: "executed", at: now }
  ]);
  receipt = coSign(receipt, selfimpulse.peerId, secretFor(selfimpulse.peerId));
  receipt = coSign(receipt, remote.peerId, secretFor(remote.peerId));
  if (!isFullyCoSigned(receipt)) {
    return { meshJointDigest: null, meshStanding: "unknown", meshDetail: "joint receipt left partially signed \u2014 refused, not shipped" };
  }
  recordJointOutcome(ledger, selfimpulse.peerId, remote.peerId, "clean");
  saveTrust(ledger);
  return {
    meshJointDigest: receipt.digest,
    meshStanding: meshStanding(ledger.get(pairKey(selfimpulse.peerId, remote.peerId))),
    meshDetail: `co-signed joint receipt ${receipt.digest.slice(0, 12)}\u2026 across channel ${channel.channelDigest.slice(0, 12)}\u2026`
  };
}
function clearMeshTrust() {
  try {
    globalThis.localStorage?.removeItem(TRUST_KEY);
  } catch {
  }
  secrets.clear();
}
var recomputeCoSelfImpulse = (peerSecret, canonicalBody) => pureHmacSha256(peerSecret, canonicalBody);

// src/app/id.ts
var degradedSeq = 0;
function cryptoToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  degradedSeq += 1;
  return `nocrypto-fallback-${degradedSeq.toString(36)}`;
}
function uid(prefix) {
  return `${prefix}-${cryptoToken()}`;
}

// src/engine/handoffs.ts
var HANDOFFS_KEY = "engine.handoffs.v1";
var HANDOFF_CAP = 100;
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function listHandoffs() {
  const raw = storage()?.getItem(HANDOFFS_KEY) ?? null;
  if (!raw) return [];
  try {
    const h = JSON.parse(raw);
    return Array.isArray(h) ? h : [];
  } catch {
    return [];
  }
}
function recordHandoff(input, now = () => /* @__PURE__ */ new Date()) {
  const rec = {
    id: uid("ho"),
    peer: input.peer,
    taskDigest: input.task.slice(0, 120),
    outcome: input.outcome,
    detail: input.detail.slice(0, 200),
    receiptDigest: input.receiptDigest,
    at: now().toISOString()
  };
  const mesh = meshForHandoff({ handoffId: rec.id, peer: rec.peer, outcome: rec.outcome, taskDigest: rec.taskDigest });
  rec.meshJointDigest = mesh.meshJointDigest;
  rec.meshStanding = mesh.meshStanding;
  rec.meshDetail = mesh.meshDetail;
  storage()?.setItem(HANDOFFS_KEY, JSON.stringify([...listHandoffs(), rec].slice(-HANDOFF_CAP)));
  return rec;
}
function clearHandoffs() {
  storage()?.removeItem(HANDOFFS_KEY);
}

// src/security/guardrail.ts
var RateGate = class {
  constructor(limit, windowMs, now = () => Date.now()) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }
  hits = /* @__PURE__ */ new Map();
  /** Returns true when the action is within budget (and records it). */
  check(key) {
    const t = this.now();
    const arr = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return false;
    }
    arr.push(t);
    this.hits.set(key, arr);
    return true;
  }
};
var callRateGate = new RateGate(120, 6e4);

// src/engine/missionAuthority.ts
var browserRawStorage = (() => {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return { get: () => ls.getItem("engine.ownerKeys.v1"), set: (v) => ls.setItem("engine.ownerKeys.v1", v) };
  } catch {
    return null;
  }
})();

// src/engine/reachMcp.ts
var REACH_MCP_NAME = "Agent Reach MCP";
var REACH_MCP_VERSION = "19.7.15";
var REACH_MCP_DEFAULT_POLICY = {
  allowlist: ["ls", "cat", "echo", "grep"],
  maxRuntimeMs: 5e3,
  maxOutputBytes: 64 * 1024
};

// probe/meshRuntime.test.ts
var ROOT = ".".length > 0 ? "." : process.cwd();
if (typeof globalThis.localStorage === "undefined") {
  const store = /* @__PURE__ */ new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => void store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    }
  };
}
beforeEach(() => {
  globalThis.localStorage.clear();
  clearMeshTrust();
  clearHandoffs();
});
describe("pureHash \u2014 byte identity with node:crypto", () => {
  it("matches SHA-256 on the FIPS vector 'abc'", () => {
    assert.equal(pureSha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
  it("matches node:crypto SHA-256 across edge shapes (empty, block boundaries, unicode)", () => {
    const cases = ["", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(65), "a".repeat(200), "unicode \u2713 \xE9 \u65E5\u672C"];
    for (const c of cases) {
      assert.equal(pureSha256(c), createHash("sha256").update(c).digest("hex"), `sha256 drift at len ${c.length}`);
    }
  });
  it("matches node:crypto HMAC-SHA256 for short, block-length and oversized keys", () => {
    for (const secret of ["k", "secret-0123456789", "s".repeat(64), "s".repeat(70)]) {
      for (const msg of ["", "the quick brown fox", "x".repeat(129)]) {
        assert.equal(pureHmacSha256(secret, msg), createHmac("sha256", secret).update(msg).digest("hex"), `hmac drift key=${secret.length} msg=${msg.length}`);
      }
    }
  });
});
describe("mesh primitives refuse what they must", () => {
  it("refuses a plain-http peer endpoint \u2014 TLS-by-default", () => {
    const p = registerPeer({ peerId: "bad", instanceOf: "bad", capabilities: [], endpoint: "http://insecure.example" });
    assert.ok("refused" in p && p.refused.includes("TLS-by-default"));
  });
  it("refuses self-attestation \u2014 one signature is half a handshake", () => {
    const a = attest("s1", "peer-a", { peerId: "peer-b", instanceOf: "b", capabilities: ["x"], endpoint: "https://b.local", registeredAt: 1, identityDigest: "d" }, 1);
    const self = attest("s1", "peer-a", { peerId: "peer-b", instanceOf: "b", capabilities: ["x"], endpoint: "https://b.local", registeredAt: 1, identityDigest: "d" }, 1);
    const ch = openChannel(a, self);
    assert.ok("refused" in ch);
  });
  it("refuses an outsider co-signature", () => {
    const pa = registerPeer({ peerId: "a", instanceOf: "ia", capabilities: ["x"], endpoint: "https://a.local" });
    const pb = registerPeer({ peerId: "b", instanceOf: "ib", capabilities: ["x"], endpoint: "https://b.local" });
    assert.ok(!("refused" in pa) && !("refused" in pb));
    const ch = openChannel(attest("sa", "a", pb, 1), attest("sb", "b", pa, 1));
    assert.ok(!("refused" in ch));
    const rec = buildJointReceipt("m1", ch, [{ actor: "a", action: "go", outcome: "executed", at: 1 }]);
    assert.throws(() => coSign(rec, "mallory", "sm"));
  });
});
describe("the production handoff seam is meshed", () => {
  it("a delegated handoff carries a fully co-signed joint receipt digest", () => {
    const rec = recordHandoff({ peer: "peer-atlas", task: "summarize the ledger", outcome: "delegated", detail: "routed deterministically", receiptDigest: "rd-1" });
    assert.ok(rec.meshJointDigest && /^[0-9a-f]{64}$/.test(rec.meshJointDigest), `joint digest: ${rec.meshJointDigest}`);
    assert.ok(rec.meshStanding && rec.meshDetail, "standing + decision in words ride the record");
    assert.ok(rec.meshDetail.includes("co-signed joint receipt"));
  });
  it("a refused handoff mints NO joint receipt but still moves pair trust", () => {
    recordHandoff({ peer: "peer-atlas", task: "summarize the ledger", outcome: "delegated", detail: "clean", receiptDigest: "rd-1" });
    const before = pairTrustFor("vh.selfimpulse", "peer-atlas");
    const rec = recordHandoff({ peer: "peer-atlas", task: "another task", outcome: "refused", detail: "peer offline" });
    assert.equal(rec.meshJointDigest, null);
    assert.ok(rec.meshDetail.includes("refused"));
    const after = pairTrustFor("vh.selfimpulse", "peer-atlas");
    assert.ok(before && after && after.trust < before.trust, `trust ${before?.trust} -> ${after?.trust}`);
  });
  it("pair trust compounds across clean handoffs and persists", () => {
    recordHandoff({ peer: "peer-borealis", task: "t1", outcome: "delegated", detail: "ok" });
    recordHandoff({ peer: "peer-borealis", task: "t2", outcome: "delegated", detail: "ok" });
    recordHandoff({ peer: "peer-borealis", task: "t3", outcome: "delegated", detail: "ok" });
    const t = pairTrustFor("vh.selfimpulse", "peer-borealis");
    assert.ok(t && t.trust === 3 && t.jointReceipts === 3, JSON.stringify(t));
    assert.equal(standingFor("vh.selfimpulse", "peer-borealis"), "selfimpulseed");
    const again = JSON.parse(globalThis.localStorage.getItem("engine.mesh.trust.v1") ?? "[]");
    assert.ok(again.some((r) => r.trust === 3));
  });
  it("the joint receipt verifies offline by recomputation (verifier path)", () => {
    const pa = registerPeer({ peerId: "peer-a", instanceOf: "selfimpulse-node", capabilities: ["routing"], endpoint: "https://peer-a.selfimpulse.test" });
    const pb = registerPeer({ peerId: "peer-verity", instanceOf: "peer-verity", capabilities: ["a2a", "handoff"], endpoint: "https://peer-verity.si-mesh.local" });
    assert.ok(!("refused" in pa) && !("refused" in pb));
    const ch = openChannel(attest("sec-selfimpulse", "peer-a", pb, 1), attest("sec-verity", "peer-verity", pa, 1));
    assert.ok(!("refused" in ch));
    const actions = [
      { actor: "peer-a", action: "delegate", outcome: "executed", at: 7 },
      { actor: "peer-verity", action: "accept", outcome: "executed", at: 7 }
    ];
    let rec = buildJointReceipt("handoff:ho-verify", ch, actions);
    rec = coSign(rec, "peer-a", "sec-selfimpulse");
    rec = coSign(rec, "peer-verity", "sec-verity");
    const body = jointCanonical(rec.missionId, rec.channelDigest, rec.actions);
    assert.equal(recomputeCoSelfImpulse("sec-selfimpulse", body), rec.coSignatures["peer-a"]);
    assert.equal(recomputeCoSelfImpulse("sec-verity", body), rec.coSignatures["peer-verity"]);
    assert.notEqual(recomputeCoSelfImpulse("wrong-secret", body), rec.coSignatures["peer-a"]);
  });
});
describe("uid is CSPRNG-born and Reach MCP is current", () => {
  it("uid() never repeats across 2,000 draws and carries the prefix", () => {
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < 2e3; i++) seen.add(uid("m"));
    assert.equal(seen.size, 2e3);
    assert.ok([...seen].every((s) => s.startsWith("m-")));
  });
  it("id.ts uses crypto.randomUUID/getRandomValues and contains no Math.random", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "app", "id.ts"), "utf8");
    assert.ok(src.includes("randomUUID"));
    assert.ok(src.includes("getRandomValues"));
    assert.ok(!src.includes("Math.random"), "uid must not fall back to Math.random");
  });
  it("Reach MCP reports the current release and documents exactly its six exposed tools", () => {
    assert.ok(/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(REACH_MCP_VERSION));
    assert.equal(REACH_MCP_NAME, "Agent Reach MCP");
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "reachMcp.ts"), "utf8");
    assert.ok(!src.includes("authority.bind"), "no ghost tool in Reach MCP docs");
    for (const tool of ["pc.exec", "pc.browser.open", "pc.browser.screenshot", "authority.issue", "authority.verify", "authority.lookup"]) {
      assert.ok(src.includes(tool), `documented tool ${tool}`);
    }
    const headerList = src.slice(0, src.indexOf("export const REACH_MCP_NAME"));
    assert.ok(headerList.includes("authority.lookup"), "the header documents authority.lookup too");
  });
  it("the canonical scope line is stated everywhere SelfImpulseMesh is pitched", () => {
    const flat = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^\s*\*+\s?/gm, "").replace(/\s+/g, " ");
    const needle1 = "LOCAL collaboration trust fabric";
    const needle2 = "ECDSA provides portable authority across instances";
    for (const p of ["src/engine/selfimpulseMesh.ts", "src/engine/meshRuntime.ts", "docs/VERIFICATION.md"]) {
      const src = flat(p);
      assert.ok(src.includes(needle1), `${p} names the mesh a local trust fabric`);
      assert.ok(src.includes(needle2), `${p} keeps portable authority on ECDSA`);
    }
  });
});
describe("the wiring is structural, not incidental", () => {
  it("handoffs.ts (the live seam) imports the mesh runtime", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "handoffs.ts"), "utf8");
    assert.ok(src.includes('from "./meshRuntime"'));
    assert.ok(src.includes("meshForHandoff"));
  });
  it("the mesh is reachable from the production door (store \u2192 handoffs \u2192 meshRuntime \u2192 selfimpulseMesh)", () => {
    const door = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
    assert.ok(door.includes("../engine/handoffs") && door.includes("recordHandoff(h)"), "the store consumes the handoff seam on every run");
    const mesh = fs.readFileSync(path.join(ROOT, "src", "engine", "meshRuntime.ts"), "utf8");
    assert.ok(mesh.includes('from "./selfimpulseMesh"'));
  });
  it("selfimpulseMesh is isomorphic \u2014 no Node-only builtin import", () => {
    const src = fs.readFileSync(path.join(ROOT, "src", "engine", "selfimpulseMesh.ts"), "utf8");
    assert.ok(!src.includes('from "node:crypto"'), "selfimpulseMesh must run in the WebView");
    assert.ok(src.includes('from "./pureHash"'));
  });
});
