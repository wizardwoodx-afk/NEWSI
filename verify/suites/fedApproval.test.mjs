import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/fedApproval.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/engine/authorityCore.ts
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

// src/engine/reach/delegationGrant.ts
var DELEGATION_CAPABILITIES = [
  "repo.read",
  "data.aggregate",
  "test.run",
  "net.fetch",
  "egress.share",
  "repo.write",
  "shell.exec",
  "spend.commit",
  "deploy.release",
  "secrets.read"
];
var IRREVERSIBLE_CAPABILITIES = ["deploy.release", "secrets.read"];
var SUPERVISED_CAPABILITIES = ["repo.write", "shell.exec", "spend.commit"];
var HUMAN_FIRST_CAPABILITIES = [
  ...SUPERVISED_CAPABILITIES,
  ...IRREVERSIBLE_CAPABILITIES
];

// src/engine/federation/approval.ts
var APPROVAL_SCHEME = "ecdsa-p256";
var APPROVAL_FORMAT = "vh.fed.approval.v1";
var APPROVAL_PREFIX = `${APPROVAL_SCHEME}:`;
var APPROVAL_SIGNER = "owner-authority-key";
var APPROVAL_ATTESTATION = "the selfimpulse owner's authority key approved this crossing, naming the human who authorised it";
var APPROVAL_NOT_ATTESTED = "that the named human authenticated with a credential distinct from the owner key";
var HEX64 = /^[0-9a-f]{64}$/;
var MIN_NONCE_CHARS = 16;
function approvalCanonical(b) {
  return JSON.stringify({
    v: b.v,
    approvalId: b.approvalId,
    pair: b.pair,
    side: b.side,
    capability: b.capability,
    envelopeDigest: b.envelopeDigest,
    nonce: b.nonce,
    human: b.human,
    decidedAt: b.decidedAt,
    expiresAt: b.expiresAt
  });
}
async function issueFederationApproval(body2, keys) {
  if (body2.v !== APPROVAL_FORMAT) {
    return { ok: false, reason: "malformed", detail: `approval format ${String(body2.v)} is not ${APPROVAL_FORMAT}` };
  }
  if (body2.approvalId.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an approval without an id cannot be revoked, filed or replayed-checked" };
  }
  if (body2.human.trim().length === 0) {
    return { ok: false, reason: "no-human", detail: "a capability decision must name the person it is made on behalf of; without a name there is nothing to sign" };
  }
  if (!body2.pair.includes("\u2194")) {
    return { ok: false, reason: "malformed", detail: "the pair key must be the two-selfimpulse pair key, not a single selfimpulse name" };
  }
  if (body2.side !== "initiator" && body2.side !== "responder") {
    return { ok: false, reason: "malformed", detail: `side "${String(body2.side)}" is neither end of a crossing` };
  }
  if (!DELEGATION_CAPABILITIES.includes(body2.capability)) {
    return { ok: false, reason: "unknown-capability", detail: `"${body2.capability}" is not a delegation capability the selfimpulse has a policy for` };
  }
  if (!HEX64.test(body2.envelopeDigest)) {
    return { ok: false, reason: "not-a-crossing-binding", detail: "the envelope digest must be the 64-hex sha256 of the exact crossing this decision authorises" };
  }
  if (body2.nonce.trim().length < MIN_NONCE_CHARS) {
    return { ok: false, reason: "not-a-crossing-binding", detail: `the nonce must be at least ${MIN_NONCE_CHARS} characters of CSPRNG output \u2014 a short nonce can be aimed` };
  }
  if (!(body2.expiresAt > body2.decidedAt)) {
    return { ok: false, reason: "expired", detail: "an approval that expires before it is decided authorises nothing" };
  }
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(approvalCanonical(body2)).buffer
  );
  return { ok: true, approval: { ...body2, signature: `${APPROVAL_PREFIX}${bytesToB64(new Uint8Array(sig))}` } };
}
async function verifyFederationApproval(approval, expected, publicKeyPem, now) {
  if (!approval || typeof approval !== "object") {
    return { ok: false, reason: "malformed", detail: "no approval was presented \u2014 the crossing does not proceed on history alone" };
  }
  if (approval.v !== APPROVAL_FORMAT) {
    return { ok: false, reason: "malformed", detail: `approval format ${String(approval.v)} is not ${APPROVAL_FORMAT}` };
  }
  if (!approval.human || approval.human.trim().length === 0) {
    return { ok: false, reason: "no-human", detail: "the approval names no human, so there is nobody to hold accountable for it" };
  }
  if (approval.pair !== expected.pair) {
    return { ok: false, reason: "wrong-pair", detail: `this approval was decided for ${approval.pair}, and the crossing is ${expected.pair}` };
  }
  if (approval.side !== expected.side) {
    return { ok: false, reason: "wrong-side", detail: `this approval was decided on the ${approval.side} side; it is being presented on the ${expected.side} side` };
  }
  if (approval.capability !== expected.capability) {
    return { ok: false, reason: "wrong-capability", detail: `this approval authorises "${approval.capability}", not "${expected.capability}"` };
  }
  if (approval.envelopeDigest !== expected.envelopeDigest) {
    return { ok: false, reason: "wrong-envelope", detail: "this approval was decided for a different crossing envelope" };
  }
  if (approval.nonce !== expected.nonce) {
    return { ok: false, reason: "wrong-nonce", detail: "this approval was decided for a different nonce \u2014 it cannot be re-aimed at this crossing" };
  }
  if (now > approval.expiresAt) {
    return { ok: false, reason: "expired", detail: `the approval expired at ${new Date(approval.expiresAt).toISOString()}, before this crossing` };
  }
  if (!approval.signature.startsWith(APPROVAL_PREFIX)) {
    return { ok: false, reason: "bad-signature", detail: "not an asymmetric signature \u2014 a history row and an HMAC tag are not an owner-key approval" };
  }
  try {
    const pub = await importPublicKeyWeb(publicKeyPem);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64ToBytes(approval.signature.slice(APPROVAL_PREFIX.length)),
      new TextEncoder().encode(approvalCanonical(approval)).buffer
    );
    if (!valid) return { ok: false, reason: "bad-signature", detail: "the signature does not verify under the key it claims \u2014 treating it as forged" };
    return { ok: true, approval };
  } catch {
    return { ok: false, reason: "bad-signature", detail: "public key or signature malformed \u2014 treating it as forged" };
  }
}
function memoryApprovalLedger(cap = 500) {
  const seen = [];
  return {
    has: (id) => seen.includes(id),
    add: (id) => {
      seen.push(id);
      if (seen.length > cap) seen.splice(0, seen.length - cap);
    },
    get size() {
      return seen.length;
    }
  };
}
async function consumeApproval(approval, expected, publicKeyPem, now, ledger) {
  const verdict = await verifyFederationApproval(approval, expected, publicKeyPem, now);
  if (!verdict.ok) return { ok: false, reason: "replayed-approval", detail: `${verdict.reason}: ${verdict.detail}` };
  if (ledger.has(approval.approvalId)) {
    return { ok: false, reason: "replayed-approval", detail: `approval ${approval.approvalId} has already been spent on an earlier crossing` };
  }
  ledger.add(approval.approvalId);
  return { ok: true };
}
function approvalRecord(approval, signerKey) {
  return {
    approvalId: approval.approvalId,
    pair: approval.pair,
    side: approval.side,
    capability: approval.capability,
    envelopeDigest: approval.envelopeDigest,
    human: approval.human,
    signedBy: APPROVAL_SIGNER,
    ...signerKey ? { ownerKeyHandle: signerKey.handle } : {},
    attests: APPROVAL_ATTESTATION,
    notAttested: APPROVAL_NOT_ATTESTED,
    decidedAt: approval.decidedAt,
    expiresAt: approval.expiresAt,
    digest: approvalDigest(approval)
  };
}
function approvalDigest(approval) {
  return pureSha256(`vh.fed.approval.v1:${approvalCanonical(approval)}|${approval.signature}`);
}

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

// src/engine/avatarEngine.ts
var AVATAR_INKS = ["#2d3142", "#3a3f52", "#586a66", "#46554f", "#827278", "#695c5e"];
var AVATAR_FIELDS = ["#d8d5db", "#d5dfea", "#e2e6ed", "#c6cdd3"];

// src/engine/federation/sigil.ts
var PINNED_PALETTE = [
  ...AVATAR_INKS,
  ...AVATAR_FIELDS,
  "#7c4a55",
  // atelier wine
  "#b75346",
  // atelier brick
  "#c98a62",
  // atelier brass
  "#a5673b",
  // atelier clay
  "#dda97f",
  // atelier sand
  "#7a6b3a",
  // atelier olive
  "#9cafc7"
  // atelier steel
];
var SIGIL_TINCTURES = {
  iron: "#2d3142",
  slate: "#3a3f52",
  verdigris: "#586a66",
  moss: "#46554f",
  plum: "#827278",
  wine: "#7c4a55",
  brick: "#b75346",
  brass: "#c98a62",
  clay: "#a5673b",
  olive: "#7a6b3a",
  steel: "#9cafc7",
  sand: "#dda97f"
};
var SIGIL_GROUNDS = {
  paper: "#f7f5f1",
  mist: "#e2e6ed",
  ash: "#d8d5db",
  pale: "#d5dfea"
};
var TINCTURE_NAMES = Object.keys(SIGIL_TINCTURES);
var GROUND_NAMES = Object.keys(SIGIL_GROUNDS);
function fingerprintOf(seed) {
  const hex = pureSha256(`vh.fed.sigil.handle.v1:${seed}`).toUpperCase();
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join("-");
}

// src/engine/federation/identity.ts
var KEY_FACE_PREFIX = "vh.fed.face.key.v1:";
function canonicalKeyMaterial(publicKeyPem) {
  return publicKeyPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
}
function faceSeedForKey(publicKeyPem) {
  return `${KEY_FACE_PREFIX}${canonicalKeyMaterial(publicKeyPem)}`;
}
function keyHandle(publicKeyPem) {
  return fingerprintOf(faceSeedForKey(publicKeyPem));
}

// probe/fedApproval.test.ts
var PAIR = "selfimpulse-a\u2194selfimpulse-b";
var ENV = pureSha256("the-crossing-envelope-under-test");
var NOW = 176e10;
function body(over = {}) {
  return {
    v: APPROVAL_FORMAT,
    approvalId: "appr-0001",
    pair: PAIR,
    side: "responder",
    capability: "repo.write",
    envelopeDigest: ENV,
    nonce: "9f2c1d4e6a8b0c3d5e7f1021",
    human: "priya",
    decidedAt: NOW,
    expiresAt: NOW + 6e4,
    ...over
  };
}
var EXPECT = { pair: PAIR, side: "responder", capability: "repo.write", envelopeDigest: ENV, nonce: "9f2c1d4e6a8b0c3d5e7f1021" };
test("federated approval \u2014 the responder's decision is a signature, not a memory", async (t) => {
  const keys = await generateOwnerKeysWeb();
  const other = await generateOwnerKeysWeb();
  await t.test("it refuses to issue something it would have to distrust", async () => {
    const noHuman = await issueFederationApproval(body({ human: "  " }), keys);
    assert.equal(noHuman.ok, false);
    if (!noHuman.ok) assert.equal(noHuman.reason, "no-human");
    const unknownCap = await issueFederationApproval(body({ capability: "root.everything" }), keys);
    assert.equal(unknownCap.ok, false);
    if (!unknownCap.ok) assert.equal(unknownCap.reason, "unknown-capability");
    const shortNonce = await issueFederationApproval(body({ nonce: "short" }), keys);
    assert.equal(shortNonce.ok, false);
    if (!shortNonce.ok) assert.match(shortNonce.detail, new RegExp(`at least ${MIN_NONCE_CHARS}`));
    const noBinding = await issueFederationApproval(body({ envelopeDigest: "not-a-digest" }), keys);
    assert.equal(noBinding.ok, false);
    if (!noBinding.ok) assert.equal(noBinding.reason, "not-a-crossing-binding");
    const singleSelfImpulse = await issueFederationApproval(body({ pair: "selfimpulse-a" }), keys);
    assert.equal(singleSelfImpulse.ok, false);
    const backdated = await issueFederationApproval(body({ decidedAt: NOW, expiresAt: NOW - 1 }), keys);
    assert.equal(backdated.ok, false);
    if (!backdated.ok) assert.equal(backdated.reason, "expired");
    const ok = await issueFederationApproval(body(), keys);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.match(ok.approval.signature, /^ecdsa-p256:/);
  });
  await t.test("a genuine approval verifies, and its filed digest is real SHA-256", async () => {
    const issued = await issueFederationApproval(body(), keys);
    if (!issued.ok) throw new Error("issue failed");
    const verdict = await verifyFederationApproval(issued.approval, EXPECT, keys.publicKeyPem, NOW + 1e3);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    const filed = approvalRecord(issued.approval);
    assert.equal(filed.human, "priya");
    assert.equal(filed.digest, approvalDigest(issued.approval));
    assert.equal(
      filed.digest,
      pureSha256(`vh.fed.approval.v1:${approvalCanonical(issued.approval)}|${issued.approval.signature}`),
      "the decision's digest is the selfimpulse's own SHA-256 over the signed bytes"
    );
    assert.equal(filed.digest.length, 64);
    assert.equal(JSON.stringify(filed).includes("9f2c1d4e6a8b0c3d5e7f1021"), false, "the filed form carries the binding, not the nonce");
  });
  await t.test("every way of re-aiming a decision is refused by name", async () => {
    const issued = await issueFederationApproval(body(), keys);
    if (!issued.ok) throw new Error("issue failed");
    const a = issued.approval;
    const cases = [
      ["wrong-pair", { ...EXPECT, pair: "selfimpulse-a\u2194selfimpulse-c" }],
      ["wrong-side", { ...EXPECT, side: "initiator" }],
      ["wrong-capability", { ...EXPECT, capability: "shell.exec" }],
      ["wrong-envelope", { ...EXPECT, envelopeDigest: pureSha256("another-crossing") }],
      ["wrong-nonce", { ...EXPECT, nonce: "0000000000000000000000" }]
    ];
    for (const [reason, expected] of cases) {
      const verdict = await verifyFederationApproval(a, expected, keys.publicKeyPem, NOW + 1e3);
      assert.equal(verdict.ok, false, `${reason} was not refused`);
      if (!verdict.ok) assert.equal(verdict.reason, reason);
    }
    const late = await verifyFederationApproval(a, EXPECT, keys.publicKeyPem, NOW + 60001);
    assert.equal(late.ok, false);
    if (!late.ok) assert.equal(late.reason, "expired");
    const forged = { ...a, human: "someone-else" };
    const forgedVerdict = await verifyFederationApproval(forged, EXPECT, keys.publicKeyPem, NOW + 1e3);
    assert.equal(forgedVerdict.ok, false);
    if (!forgedVerdict.ok) assert.equal(forgedVerdict.reason, "bad-signature", "editing the human must break the signature");
    const alien = await verifyFederationApproval(a, EXPECT, other.publicKeyPem, NOW + 1e3);
    assert.equal(alien.ok, false, "another selfimpulse's key must not verify this decision");
    if (!alien.ok) assert.equal(alien.reason, "bad-signature");
    const absent = await verifyFederationApproval(null, EXPECT, keys.publicKeyPem, NOW + 1e3);
    assert.equal(absent.ok, false);
    if (!absent.ok) assert.match(absent.detail, /not proceed on history alone/);
  });
  await t.test("a decision is spent once \u2014 a replay is refused by id", async () => {
    const issued = await issueFederationApproval(body(), keys);
    if (!issued.ok) throw new Error("issue failed");
    const ledger = memoryApprovalLedger(8);
    const first = await consumeApproval(issued.approval, EXPECT, keys.publicKeyPem, NOW + 1e3, ledger);
    assert.equal(first.ok, true);
    assert.equal(ledger.size, 1);
    const second = await consumeApproval(issued.approval, EXPECT, keys.publicKeyPem, NOW + 1e3, ledger);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.reason, "replayed-approval");
      assert.match(second.detail, /appr-0001/);
      assert.match(second.detail, /already been spent/);
    }
    const unspent = await issueFederationApproval(body({ approvalId: "appr-0002" }), keys);
    if (!unspent.ok) throw new Error("issue failed");
    const rejected = await consumeApproval(unspent.approval, { ...EXPECT, capability: "shell.exec" }, keys.publicKeyPem, NOW + 1e3, ledger);
    assert.equal(rejected.ok, false);
    assert.equal(ledger.has("appr-0002"), false, "a decision that failed verification is NOT burned \u2014 the human keeps it");
  });
  await t.test("the ledger is bounded, so a long-lived selfimpulse cannot grow without limit", () => {
    const ledger = memoryApprovalLedger(4);
    for (let i = 0; i < 50; i++) ledger.add(`appr-${i}`);
    assert.equal(ledger.size, 4);
    assert.equal(ledger.has("appr-0"), false, "oldest evicted");
    assert.equal(ledger.has("appr-49"), true, "recent remembered");
  });
  await t.test("WHAT THE SIGNATURE PROVES \u2014 an owner-key approval on behalf of a named human", async () => {
    const keys2 = await generateOwnerKeysWeb();
    assert.equal(APPROVAL_SIGNER, "owner-authority-key");
    assert.match(APPROVAL_ATTESTATION, /authority key approved/);
    assert.match(APPROVAL_ATTESTATION, /naming the human who authorised it/);
    assert.match(APPROVAL_NOT_ATTESTED, /distinct from the owner key/);
    assert.equal(
      /human (signed|authenticated)/.test(APPROVAL_ATTESTATION),
      false,
      "the attestation never says a human signed it"
    );
    const one = await issueFederationApproval(body({ approvalId: "same-key-1", human: "priya" }), keys2);
    const two = await issueFederationApproval(body({ approvalId: "same-key-2", human: "ana" }), keys2);
    if (!one.ok || !two.ok) throw new Error("issue failed");
    assert.equal((await verifyFederationApproval(one.approval, EXPECT, keys2.publicKeyPem, NOW)).ok, true);
    assert.equal((await verifyFederationApproval(two.approval, EXPECT, keys2.publicKeyPem, NOW)).ok, true);
    const handle = keyHandle(keys2.publicKeyPem);
    const r1 = approvalRecord(one.approval, { publicKeyPem: keys2.publicKeyPem, handle });
    const r2 = approvalRecord(two.approval, { publicKeyPem: keys2.publicKeyPem, handle });
    assert.equal(r1.human, "priya");
    assert.equal(r2.human, "ana");
    assert.equal(r1.ownerKeyHandle, r2.ownerKeyHandle, "one key signed both");
    assert.equal(r1.signedBy, APPROVAL_SIGNER, "and the record says what signed");
    assert.equal(r1.attests, APPROVAL_ATTESTATION, "the claim travels with the record");
    assert.equal(r1.notAttested, APPROVAL_NOT_ATTESTED, "\u2026and so does its limit");
    assert.equal(r2.notAttested, APPROVAL_NOT_ATTESTED);
    const bare = approvalRecord(one.approval);
    assert.equal(bare.attests, APPROVAL_ATTESTATION);
    assert.equal(bare.notAttested, APPROVAL_NOT_ATTESTED);
    assert.equal(bare.ownerKeyHandle, void 0, "no key given, no handle claimed");
    const other2 = await generateOwnerKeysWeb();
    const alien = await issueFederationApproval(body({ approvalId: "other-key-1", human: "priya" }), other2);
    if (!alien.ok) throw new Error("issue failed");
    const alienRecord = approvalRecord(alien.approval, { publicKeyPem: other2.publicKeyPem, handle: keyHandle(other2.publicKeyPem) });
    assert.equal(alienRecord.human, r1.human, "the same name\u2026");
    assert.notEqual(alienRecord.ownerKeyHandle, r1.ownerKeyHandle, "\u2026from a different key is a different approver");
    assert.equal(
      (await verifyFederationApproval(alien.approval, EXPECT, keys2.publicKeyPem, NOW)).ok,
      false,
      "and it does not verify against the selfimpulse's own key"
    );
    assert.equal(alienRecord.digest !== r1.digest, true, "the two records are not interchangeable");
  });
});
