import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/fedCrossing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

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

// src/engine/selfimpulseMesh.ts
var pairKey = (a, b) => [a, b].sort().join("\u2194");
var meshStanding = (t) => !t ? "unknown" : t.trust < 3 ? "probation" : t.trust < 10 ? "selfimpulseed" : "proven";

// src/engine/meshRuntime.ts
var TRUST_KEY = "engine.mesh.trust.v1";
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
function pairTrustFor(a, b) {
  return loadTrust().get(pairKey(a, b));
}
function standingFor(a, b) {
  return meshStanding(pairTrustFor(a, b));
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
var CAPABILITIES_BY_STANDING = {
  unknown: [],
  probation: ["repo.read", "data.aggregate"],
  selfimpulseed: ["repo.read", "data.aggregate", "test.run", "net.fetch", "egress.share"],
  proven: [
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
  ]
};
var IRREVERSIBLE_CAPABILITIES = ["deploy.release", "secrets.read"];
var SUPERVISED_CAPABILITIES = ["repo.write", "shell.exec", "spend.commit"];
var HUMAN_FIRST_CAPABILITIES = [
  ...SUPERVISED_CAPABILITIES,
  ...IRREVERSIBLE_CAPABILITIES
];
var REQUIRE_HUMAN_FIRST_DEFAULT = true;
function grantCanonical(g) {
  const refusals = g.refused.map((r) => `${r.capability}:${r.rule}`).join(",");
  return [g.id, g.pair, g.tier, g.at, String(g.humanFirst), g.granted.join(","), refusals].join("");
}
function tiersFor(capability) {
  return ["probation", "selfimpulseed", "proven"].filter((t) => CAPABILITIES_BY_STANDING[t].includes(capability));
}
function narrowGrant(input) {
  const tier = input.standing ?? "unknown";
  const humanFirst = input.requireHumanFirst ?? REQUIRE_HUMAN_FIRST_DEFAULT;
  const atMs = Date.parse(input.at);
  const approvals = input.approvals ?? [];
  const granted = [];
  const refused = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of input.requested) {
    const capability = raw.trim();
    if (seen.has(capability)) continue;
    seen.add(capability);
    if (!DELEGATION_CAPABILITIES.includes(capability)) {
      refused.push({
        capability,
        rule: "not-a-capability",
        why: `"${capability}" is not in the delegation capability set, so it is not withheld \u2014 it is unknown`
      });
      continue;
    }
    const cap = capability;
    if (tier === "unknown") {
      refused.push({
        capability,
        rule: "quarantined",
        why: "this pair has no joint receipts, so no capability is lent; the first exchange is read-only by ruling, not by luck"
      });
      continue;
    }
    if (!CAPABILITIES_BY_STANDING[tier].includes(cap)) {
      const needed = tiersFor(cap);
      refused.push({
        capability,
        rule: "below-standing",
        why: `pair standing "${tier}" does not lend ${capability}; it is lent from ${needed.join(" or ")} standing`
      });
      continue;
    }
    const needsHuman = IRREVERSIBLE_CAPABILITIES.includes(cap) || humanFirst && SUPERVISED_CAPABILITIES.includes(cap);
    if (needsHuman) {
      const approval = approvals.find((a) => a.capability === cap);
      if (!approval) {
        refused.push({
          capability,
          rule: "human-first",
          why: `${capability} changes the state of this selfimpulse, so it needs a human decision naming it; none was attached`
        });
        continue;
      }
      if (approval.expiresAt !== void 0 && Date.parse(approval.expiresAt) < atMs) {
        refused.push({
          capability,
          rule: "approval-expired",
          why: `the approval for ${capability} expired at ${approval.expiresAt}, before this grant at ${input.at}`
        });
        continue;
      }
      if (approval.approvalId.trim().length === 0) {
        refused.push({
          capability,
          rule: "human-first",
          why: `${capability} was claimed as approved with no approval id, which cannot be checked and is therefore not an approval`
        });
        continue;
      }
    }
    granted.push(cap);
  }
  const staged = {
    id: `grant-${pureSha256(`${input.ownerA}|${input.ownerB}|${input.at}`).slice(0, 16)}`,
    pair: pairKey(input.ownerA, input.ownerB),
    tier,
    at: input.at,
    humanFirst,
    granted: [...granted].sort(),
    refused
  };
  return { ...staged, digest: pureSha256(`vh.reach.delegationGrant.v1:${grantCanonical(staged)}`) };
}
function grantAllows(grant, capability) {
  return grant.granted.includes(capability);
}
function grantForPair(input, deps = {}) {
  const read = deps.standing ?? ((a, b) => standingFor(a, b));
  return narrowGrant({ ...input, standing: read(input.ownerA, input.ownerB) });
}

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
async function issueFederationApproval(body, keys) {
  if (body.v !== APPROVAL_FORMAT) {
    return { ok: false, reason: "malformed", detail: `approval format ${String(body.v)} is not ${APPROVAL_FORMAT}` };
  }
  if (body.approvalId.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an approval without an id cannot be revoked, filed or replayed-checked" };
  }
  if (body.human.trim().length === 0) {
    return { ok: false, reason: "no-human", detail: "a capability decision must name the person it is made on behalf of; without a name there is nothing to sign" };
  }
  if (!body.pair.includes("\u2194")) {
    return { ok: false, reason: "malformed", detail: "the pair key must be the two-selfimpulse pair key, not a single selfimpulse name" };
  }
  if (body.side !== "initiator" && body.side !== "responder") {
    return { ok: false, reason: "malformed", detail: `side "${String(body.side)}" is neither end of a crossing` };
  }
  if (!DELEGATION_CAPABILITIES.includes(body.capability)) {
    return { ok: false, reason: "unknown-capability", detail: `"${body.capability}" is not a delegation capability the selfimpulse has a policy for` };
  }
  if (!HEX64.test(body.envelopeDigest)) {
    return { ok: false, reason: "not-a-crossing-binding", detail: "the envelope digest must be the 64-hex sha256 of the exact crossing this decision authorises" };
  }
  if (body.nonce.trim().length < MIN_NONCE_CHARS) {
    return { ok: false, reason: "not-a-crossing-binding", detail: `the nonce must be at least ${MIN_NONCE_CHARS} characters of CSPRNG output \u2014 a short nonce can be aimed` };
  }
  if (!(body.expiresAt > body.decidedAt)) {
    return { ok: false, reason: "expired", detail: "an approval that expires before it is decided authorises nothing" };
  }
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(approvalCanonical(body)).buffer
  );
  return { ok: true, approval: { ...body, signature: `${APPROVAL_PREFIX}${bytesToB64(new Uint8Array(sig))}` } };
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

// src/engine/federation/standing.ts
var STANDING_FORMAT = "vh.fed.standing.v1";
var STANDING_PREFIX = `ecdsa-p256:`;
var STANDING_SIGNER = APPROVAL_SIGNER;
var STANDING_ATTESTATION = "the selfimpulse owner's authority key authorised this crossing in advance, under a standing grant that names the human who set its scope and its bounds";
var STANDING_NOT_ATTESTED = "that a human reviewed this specific crossing \u2014 the grant was approved once, and its bounds (capabilities, budget, window, expiry) are what stand in for a per-crossing decision";
var OUT_OF_SCOPE_ESCALATE = "escalate";
function standingCanonical(b) {
  return JSON.stringify({
    v: b.v,
    grantId: b.grantId,
    pair: b.pair,
    capabilities: [...b.capabilities].sort(),
    initiatorHuman: b.initiatorHuman,
    responderHuman: b.responderHuman,
    maxCrossings: b.maxCrossings,
    windowMs: b.windowMs,
    windowMax: b.windowMax,
    issuedAt: b.issuedAt,
    expiresAt: b.expiresAt,
    onOutOfScope: b.onOutOfScope
  });
}
function judgeGrantBody(b) {
  if (b.v !== STANDING_FORMAT) {
    return { ok: false, reason: "malformed", detail: `grant format ${String(b.v)} is not ${STANDING_FORMAT}` };
  }
  if (!b.grantId || b.grantId.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "a grant without an id cannot be revoked, cited or audited" };
  }
  if (!b.pair.includes("\u2194")) {
    return { ok: false, reason: "malformed", detail: "the pair key must be the two-selfimpulse pair key, not a single selfimpulse name" };
  }
  if (!b.initiatorHuman?.trim() || !b.responderHuman?.trim()) {
    return { ok: false, reason: "no-human", detail: "a standing grant runs without a human in the loop, so BOTH humans must be named at the moment it is set \u2014 an unnamed side has nobody accountable for what it authorised" };
  }
  if (!Array.isArray(b.capabilities) || b.capabilities.length === 0) {
    return { ok: false, reason: "no-capabilities", detail: "a grant that names no capability authorises nothing and must not be issued" };
  }
  if (b.capabilities.some((c) => c === "*" || c === "all" || c === "any")) {
    return { ok: false, reason: "wildcard-capability", detail: "a grant naming every capability is not a grant, it is a blank cheque \u2014 enumerate what the pair may do" };
  }
  const unknown = b.capabilities.filter((c) => !DELEGATION_CAPABILITIES.includes(c));
  if (unknown.length > 0) {
    return { ok: false, reason: "unknown-capability", detail: `"${unknown.join('", "')}" is not a delegation capability this selfimpulse has a policy for` };
  }
  if (new Set(b.capabilities).size !== b.capabilities.length) {
    return { ok: false, reason: "malformed", detail: "the same capability is listed twice; a grant is a set, not a tally" };
  }
  const ints = [b.maxCrossings, b.windowMax];
  if (!ints.every((n) => Number.isInteger(n) && n >= 1)) {
    return { ok: false, reason: "unbounded", detail: "maxCrossings and windowMax must be whole numbers of at least 1 \u2014 an unbounded grant never comes back to a human" };
  }
  if (!Number.isFinite(b.windowMs) || b.windowMs <= 0) {
    return { ok: false, reason: "unbounded", detail: "windowMs must be a positive duration; a grant with no rate window can be drained in one burst" };
  }
  if (b.windowMax > b.maxCrossings) {
    return { ok: false, reason: "unbounded", detail: `windowMax (${b.windowMax}) exceeds the whole budget (maxCrossings ${b.maxCrossings}) \u2014 the rate bound would never bind` };
  }
  if (!(b.expiresAt > b.issuedAt)) {
    return { ok: false, reason: "unbounded", detail: "a grant must expire after it is issued; one that never lapses is one nobody re-reads" };
  }
  if (b.onOutOfScope !== OUT_OF_SCOPE_ESCALATE) {
    return { ok: false, reason: "malformed", detail: `onOutOfScope must be "${OUT_OF_SCOPE_ESCALATE}" \u2014 out-of-scope work returns to a human, and there is no setting that lets it proceed` };
  }
  return { ok: true };
}
async function issueStandingGrant(body, initiatorKeys, responderKeys) {
  const judged = judgeGrantBody(body);
  if (!judged.ok) return judged;
  const bytes = new TextEncoder().encode(standingCanonical(body)).buffer;
  const [si, sr] = await Promise.all([
    crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, initiatorKeys.privateKey, bytes),
    crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, responderKeys.privateKey, bytes)
  ]);
  return {
    ok: true,
    grant: {
      ...body,
      capabilities: [...body.capabilities].sort(),
      signatureInitiator: `${STANDING_PREFIX}${bytesToB64(new Uint8Array(si))}`,
      signatureResponder: `${STANDING_PREFIX}${bytesToB64(new Uint8Array(sr))}`
    }
  };
}
async function verifyStandingGrant(grant, initiatorPublicKeyPem, responderPublicKeyPem, now) {
  if (!grant || typeof grant !== "object") {
    return { ok: false, reason: "no-grant", detail: "no standing grant was presented \u2014 a crossing does not run autonomously on history alone" };
  }
  const judged = judgeGrantBody(grant);
  if (!judged.ok) return judged;
  if (now > grant.expiresAt) {
    return { ok: false, reason: "grant-expired", detail: `the standing grant lapsed at ${new Date(grant.expiresAt).toISOString()}; the pair must set a new one before crossing again` };
  }
  for (const [sig, pem2, side] of [
    [grant.signatureInitiator, initiatorPublicKeyPem, "initiator"],
    [grant.signatureResponder, responderPublicKeyPem, "responder"]
  ]) {
    if (typeof sig !== "string" || !sig.startsWith(STANDING_PREFIX)) {
      return { ok: false, reason: "bad-signature", detail: `the ${side} side's grant signature is not an asymmetric signature \u2014 a history row and an HMAC tag are not a standing authority` };
    }
    try {
      const pub = await importPublicKeyWeb(pem2);
      const valid = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        b64ToBytes(sig.slice(STANDING_PREFIX.length)),
        new TextEncoder().encode(standingCanonical(grant)).buffer
      );
      if (!valid) return { ok: false, reason: "bad-signature", detail: `the ${side} side's signature does not verify under the key it claims \u2014 treating it as forged` };
    } catch {
      return { ok: false, reason: "bad-signature", detail: `the ${side} side's public key or signature is malformed \u2014 treating it as forged` };
    }
  }
  return { ok: true };
}
function standingDigest(grant) {
  return pureSha256(`vh.fed.standing.v1:${standingCanonical(grant)}|${grant.signatureInitiator}|${grant.signatureResponder}`);
}
function freshGrantUsage(grant, at) {
  return { grantId: grant.grantId, crossings: 0, windowStart: at, windowCount: 0 };
}
function revokeStandingGrant(grant, by, human, at, reason) {
  return { grantId: grant.grantId, pair: grant.pair, by, human, at, reason };
}
function authoriseUnderGrant(grant, usage, expected, now, revocations = []) {
  if (!grant) {
    return { ok: false, reason: "no-grant", detail: "no standing grant covers this pair, so this crossing needs a per-crossing human decision" };
  }
  if (grant.pair !== expected.pair) {
    return { ok: false, reason: "wrong-pair", detail: `this grant covers ${grant.pair}, and the crossing is ${expected.pair}` };
  }
  const revoked = revocations.find((r) => r.grantId === grant.grantId);
  if (revoked) {
    return { ok: false, reason: "revoked", detail: `the ${revoked.by} side revoked this grant at ${new Date(revoked.at).toISOString()}: ${revoked.reason}` };
  }
  if (now > grant.expiresAt) {
    return { ok: false, reason: "grant-expired", detail: `the standing grant lapsed at ${new Date(grant.expiresAt).toISOString()}` };
  }
  if (!grant.capabilities.includes(expected.capability)) {
    return {
      ok: false,
      reason: "escalate",
      detail: `"${expected.capability}" is outside this grant (${grant.capabilities.join(", ")}) \u2014 the crossing returns to a per-crossing human decision rather than proceeding on standing authority`
    };
  }
  const used = usage && usage.grantId === grant.grantId ? usage : freshGrantUsage(grant, now);
  if (used.crossings >= grant.maxCrossings) {
    return { ok: false, reason: "grant-exhausted", detail: `the grant authorised ${grant.maxCrossings} crossings and all of them are spent \u2014 set a new grant, which means two humans looking again` };
  }
  const windowExpired = now - used.windowStart >= grant.windowMs;
  const windowCount = windowExpired ? 0 : used.windowCount;
  if (windowCount >= grant.windowMax) {
    return { ok: false, reason: "window-exceeded", detail: `the grant allows ${grant.windowMax} crossings per ${grant.windowMs}ms and this window is spent \u2014 wait for the window rather than raising the bound` };
  }
  const nextUsage = {
    grantId: grant.grantId,
    crossings: used.crossings + 1,
    windowStart: windowExpired ? now : used.windowStart,
    windowCount: windowCount + 1
  };
  return {
    ok: true,
    usage: nextUsage,
    authorisation: {
      grantId: grant.grantId,
      grantDigest: standingDigest(grant),
      pair: grant.pair,
      side: expected.side,
      capability: expected.capability,
      human: expected.side === "initiator" ? grant.initiatorHuman : grant.responderHuman,
      envelopeDigest: expected.envelopeDigest,
      nonce: expected.nonce,
      crossingsUsed: nextUsage.crossings,
      crossingsRemaining: grant.maxCrossings - nextUsage.crossings,
      at: now
    }
  };
}
function standingAcknowledgement(a, signerKey) {
  const body = {
    kind: "standing",
    grantId: a.grantId,
    grantDigest: a.grantDigest,
    pair: a.pair,
    side: a.side,
    capability: a.capability,
    human: a.human,
    signedBy: STANDING_SIGNER,
    ...signerKey ? { ownerKeyHandle: signerKey.handle } : {},
    crossingsUsed: a.crossingsUsed,
    crossingsRemaining: a.crossingsRemaining,
    envelopeDigest: a.envelopeDigest,
    nonce: a.nonce
  };
  return {
    ...body,
    attests: STANDING_ATTESTATION,
    notAttested: STANDING_NOT_ATTESTED,
    digest: pureSha256(`vh.fed.standing.ack.v1:${JSON.stringify(body)}`)
  };
}
function standingNotice(grant, usage) {
  return `standing authority: ${grant.capabilities.join(", ")} on ${grant.pair} \u2014 ${usage.crossings}/${grant.maxCrossings} crossings used, expiring ${new Date(grant.expiresAt).toISOString()}; out-of-scope work returns to a human`;
}

// src/engine/federation/ledger.ts
var LEDGER_FORMAT = "vh.fed.ledger.v1";
var LEDGER_ATTESTATION = "both sides hold the same set of records: each derived this root from its own store, and the two roots agree";
var LEDGER_NOT_ATTESTED = "that the recorded actions were wise or well authorised \u2014 agreement about what happened is not agreement about what should have happened";
var LEDGER_VIEW_NOTE = "one view, two stores: each side keeps its own records, and this is what both of them check \u2014 a row only one side holds is marked, not hidden";
function rowCanonical(e) {
  return [e.crossingId, e.envelopeDigest, e.capability, e.decision, e.outcomeDigest, e.initiatorReceipt, e.responderReceipt, e.at].join("|");
}
function sortEntries(entries) {
  return [...entries].sort((a, b) => a.crossingId.localeCompare(b.crossingId));
}
function ledgerRoot(entries) {
  const rows = sortEntries(entries).map(rowCanonical);
  return pureSha256(`${LEDGER_FORMAT}:${rows.join("\n")}`);
}
function compareRoots(pair, initiator, responder, at) {
  const initiatorRoot = ledgerRoot(initiator.entries);
  const responderRoot = ledgerRoot(responder.entries);
  const agreed = initiatorRoot === responderRoot;
  const record = {
    pair,
    initiatorRoot,
    responderRoot,
    agreed,
    at,
    attests: LEDGER_ATTESTATION,
    notAttested: LEDGER_NOT_ATTESTED
  };
  if (agreed) return record;
  const mine = new Map(sortEntries(initiator.entries).map((e) => [e.crossingId, rowCanonical(e)]));
  const theirs = new Map(sortEntries(responder.entries).map((e) => [e.crossingId, rowCanonical(e)]));
  const ids = [.../* @__PURE__ */ new Set([...mine.keys(), ...theirs.keys()])].sort();
  for (const id of ids) {
    const a = mine.get(id);
    const b = theirs.get(id);
    if (a === b) continue;
    record.firstDivergence = {
      crossingId: id,
      detail: a === void 0 ? `the initiator's store holds no record of crossing ${id}; the responder's does` : b === void 0 ? `the responder's store holds no record of crossing ${id}; the initiator's does` : `the two stores disagree about crossing ${id} \u2014 same crossing, different record`
    };
    break;
  }
  return record;
}
function pairLedgerView(initiator, responder) {
  const seen = /* @__PURE__ */ new Set();
  const rows = [];
  const push = (id, side, entry) => {
    let row = rows.find((r) => r.crossingId === id);
    if (!row) {
      row = { crossingId: id, at: entry.at, seenBy: side === "initiator" ? "initiator-only" : "responder-only", disagrees: false };
      rows.push(row);
    }
    if (side === "initiator") row.initiator = entry;
    else row.responder = entry;
    row.at = Math.min(row.at, entry.at);
    if (row.initiator && row.responder) {
      row.seenBy = "both";
      row.disagrees = rowCanonical(row.initiator) !== rowCanonical(row.responder);
    }
  };
  for (const e of sortEntries(initiator)) if (!seen.has(`i:${e.crossingId}`)) {
    seen.add(`i:${e.crossingId}`);
    push(e.crossingId, "initiator", e);
  }
  for (const e of sortEntries(responder)) if (!seen.has(`r:${e.crossingId}`)) {
    seen.add(`r:${e.crossingId}`);
    push(e.crossingId, "responder", e);
  }
  return rows.sort((a, b) => a.at === b.at ? a.crossingId.localeCompare(b.crossingId) : a.at - b.at);
}
function mirrorAttestation(record, heldBy, at) {
  return {
    pair: record.pair,
    root: record.initiatorRoot,
    agreed: record.agreed,
    heldBy,
    at,
    attests: record.agreed ? `${LEDGER_ATTESTATION}; this mirror holds the root so a later disagreement can be proved against it` : "that the two sides had already diverged when this mirror was written; it holds the initiator's root and the responder's differs",
    notAttested: LEDGER_NOT_ATTESTED
  };
}
function mirrorVerifies(mirror, record) {
  if (mirror.root === record.initiatorRoot && mirror.root === record.responderRoot) return { ok: true };
  return {
    ok: false,
    detail: `the mirror holds ${mirror.root.slice(0, 12)}\u2026 for ${mirror.pair}; the stores now derive ${record.initiatorRoot.slice(0, 12)}\u2026 and ${record.responderRoot.slice(0, 12)}\u2026 \u2014 the pair's records changed after the mirror was written`
  };
}
function ledgerRowSentence(row) {
  if (row.disagrees) return `crossing ${row.crossingId}: both sides hold a record, and the two records differ \u2014 shown unmerged`;
  if (row.seenBy === "both") return `crossing ${row.crossingId}: recorded by both sides, identically`;
  return `crossing ${row.crossingId}: held only by the ${row.seenBy.replace("-only", "")} \u2014 the other side has no record of it`;
}

// src/engine/federation/bridge.ts
var CROSSING_FORMAT = "vh.fed.crossing.v1";
var DEFAULT_ENVELOPE_TTL_MS = 10 * 60 * 1e3;
function envelopeCanonical(e) {
  return JSON.stringify({
    format: e.format,
    id: e.id,
    ownerA: e.ownerA,
    ownerB: e.ownerB,
    pair: e.pair,
    task: e.task,
    capability: e.capability,
    nonceInitiator: e.nonceInitiator,
    nonceResponder: e.nonceResponder,
    at: e.at,
    expiresAt: e.expiresAt
  });
}
function federationEntropy() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("federation: no CSPRNG in this runtime \u2014 refusing to mint guessable crossing ids");
}
async function openCrossing(input, deps = {}) {
  const entropy = deps.entropy ?? federationEntropy;
  const nowMs = deps.now ? deps.now() : Date.now();
  const ownerA = input.ownerA.trim();
  const ownerB = input.ownerB.trim();
  if (ownerA.length === 0 || ownerB.length === 0) {
    return { ok: false, reason: "no-owner", detail: "a crossing names two owners; one of them is missing" };
  }
  if (ownerA === ownerB) {
    return { ok: false, reason: "same-owner", detail: "both ends are the same owner \u2014 this is not a cross-owner crossing" };
  }
  const task = input.task.trim();
  if (task.length === 0) {
    return { ok: false, reason: "no-task", detail: "a crossing must state what is being asked for, or nobody can decide it" };
  }
  const id = input.id ?? entropy();
  if (id.trim().length === 0) return { ok: false, reason: "no-id", detail: "the crossing id came back empty from the id source" };
  const nonceInitiator = entropy();
  const nonceResponder = entropy();
  if (nonceInitiator === nonceResponder) {
    return { ok: false, reason: "entropy-collision", detail: "the two sides drew the same nonce \u2014 the id source is not behaving like a CSPRNG" };
  }
  const at = input.at ?? nowMs;
  const expiresAt = input.expiresAt ?? at + DEFAULT_ENVELOPE_TTL_MS;
  const body = {
    format: CROSSING_FORMAT,
    id,
    ownerA,
    ownerB,
    pair: pairKey(ownerA, ownerB),
    task,
    capability: input.capability,
    nonceInitiator,
    nonceResponder,
    at,
    expiresAt
  };
  const envelope2 = { ...body, digest: pureSha256(`vh.fed.crossing.v1:${envelopeCanonical(body)}`) };
  return { ok: true, envelope: envelope2 };
}
function verifyEnvelope(envelope2) {
  const { digest, ...body } = envelope2;
  if (body.format !== CROSSING_FORMAT) return { ok: false, reason: "malformed", detail: `envelope format ${String(body.format)} is not ${CROSSING_FORMAT}` };
  const want = pureSha256(`vh.fed.crossing.v1:${envelopeCanonical(body)}`);
  return digest === want ? { ok: true } : { ok: false, reason: "envelope-tampered", detail: "the envelope digest does not match its body \u2014 something moved after it was minted" };
}
async function crossFederation(parties, wiring = {}) {
  const { envelope: envelope2 } = parties;
  const now = wiring.now ? wiring.now() : Date.now();
  const ledger = wiring.ledger ?? memoryApprovalLedger();
  const localLedger = (a, b) => grantForPair({ ownerA: a, ownerB: b, requested: [], at: new Date(now).toISOString() }).tier;
  const readInitiator = wiring.standingInitiator ?? wiring.standing ?? localLedger;
  const readResponder = wiring.standingResponder ?? wiring.standing ?? localLedger;
  const sharedStore = readInitiator === readResponder;
  const standingSource = {
    initiator: wiring.stores?.initiator ?? (readInitiator === localLedger ? "this machine's SelfImpulseMesh ledger" : sharedStore ? "the shared local store" : "the initiator's local store"),
    responder: wiring.stores?.responder ?? (readResponder === localLedger ? "this machine's SelfImpulseMesh ledger" : sharedStore ? "the shared local store" : "the responder's local store"),
    shared: sharedStore
  };
  const atIso = new Date(envelope2.at).toISOString();
  const grantInitiator = grantForPair(
    {
      ownerA: parties.initiator,
      ownerB: parties.responder,
      requested: [envelope2.capability],
      at: atIso,
      approvals: parties.initiatorApproval ? [{ capability: envelope2.capability, approvalId: parties.initiatorApproval.approvalId, at: new Date(parties.initiatorApproval.decidedAt).toISOString() }] : []
    },
    { standing: readInitiator }
  );
  const grantResponder = grantForPair(
    {
      ownerA: parties.initiator,
      ownerB: parties.responder,
      requested: [envelope2.capability],
      at: atIso,
      approvals: parties.responderApproval ? [{ capability: envelope2.capability, approvalId: parties.responderApproval.approvalId, at: new Date(parties.responderApproval.decidedAt).toISOString() }] : []
    },
    { standing: readResponder }
  );
  const refusalDetail = (side, why) => {
    const store = side === "initiator" ? standingSource.initiator : standingSource.responder;
    const other = side === "initiator" ? standingSource.responder : standingSource.initiator;
    const base = `the ${side}'s own local trust store (${store}) lends this pair nothing: ${why}`;
    return sharedStore ? base : `${base} \u2014 read from the ${side}'s store (${store}), not the other side's (${other}); local trust state is per machine and the two are free to disagree`;
  };
  const finish = (status, reason, detail, approvals, extra) => {
    const body = {
      crossingId: envelope2.id,
      pair: envelope2.pair,
      capability: envelope2.capability,
      status,
      reason,
      detail,
      at: now,
      envelopeDigest: envelope2.digest,
      tierInitiator: grantInitiator.tier,
      tierResponder: grantResponder.tier,
      standingSource,
      grants: { initiator: grantInitiator, responder: grantResponder },
      approvals,
      attestation: extra?.standing ? { attests: extra.standing.attests, notAttested: extra.standing.notAttested } : { attests: APPROVAL_ATTESTATION, notAttested: APPROVAL_NOT_ATTESTED },
      ...extra?.standing ? { standing: extra.standing } : {}
    };
    const decisionDigest = pureSha256(`vh.fed.outcome.v1:${JSON.stringify(body)}`);
    let commonLedger;
    if (wiring.ledgers) {
      const entry = {
        crossingId: envelope2.id,
        envelopeDigest: envelope2.digest,
        capability: envelope2.capability,
        decision: status,
        outcomeDigest: decisionDigest,
        /* empty receipt = nothing was minted (a refusal); both stores write
           the same empty string, so an honest "nothing" still compares. */
        initiatorReceipt: extra?.receipts?.initiator ?? "",
        responderReceipt: extra?.receipts?.responder ?? "",
        at: now
      };
      commonLedger = {
        entry,
        record: compareRoots(
          envelope2.pair,
          { entries: [...wiring.ledgers.initiator, entry] },
          { entries: [...wiring.ledgers.responder, entry] },
          now
        ),
        viewNote: LEDGER_VIEW_NOTE
      };
    }
    const full = { ...body, ...commonLedger ? { commonLedger } : {} };
    return { ...full, digest: pureSha256(`vh.fed.outcome.v1:${JSON.stringify(full)}`) };
  };
  const envelopeCheck = verifyEnvelope(envelope2);
  if (!envelopeCheck.ok) return finish("refused", "envelope-tampered", envelopeCheck.detail, []);
  if (now > envelope2.expiresAt) {
    return finish("refused", "envelope-expired", `this crossing expired at ${new Date(envelope2.expiresAt).toISOString()} and nobody decided inside the window`, []);
  }
  if (grantInitiator.refused.some((r) => r.rule === "quarantined")) {
    return finish("refused", "initiator-below-standing", refusalDetail("initiator", grantInitiator.refused[0]?.why ?? ""), []);
  }
  if (grantResponder.refused.some((r) => r.rule === "quarantined")) {
    return finish("refused", "responder-below-standing", refusalDetail("responder", grantResponder.refused[0]?.why ?? ""), []);
  }
  if (grantInitiator.refused.some((r) => r.rule === "not-a-capability")) {
    return finish("refused", "initiator-unknown-capability", `${envelope2.capability} is not a capability either side has a policy for`, []);
  }
  if (grantResponder.refused.some((r) => r.rule === "not-a-capability")) {
    return finish("refused", "responder-unknown-capability", `${envelope2.capability} is not a capability either side has a policy for`, []);
  }
  if (grantInitiator.refused.some((r) => r.rule === "below-standing")) {
    return finish("refused", "initiator-below-standing", refusalDetail("initiator", grantInitiator.refused.find((r) => r.rule === "below-standing")?.why ?? ""), []);
  }
  if (grantResponder.refused.some((r) => r.rule === "below-standing")) {
    return finish("refused", "responder-below-standing", refusalDetail("responder", grantResponder.refused.find((r) => r.rule === "below-standing")?.why ?? ""), []);
  }
  if (wiring.standingGrant && !parties.initiatorApproval && !parties.responderApproval) {
    const g = wiring.standingGrant;
    const vI = authoriseUnderGrant(g, wiring.standingUsage?.initiator, {
      pair: envelope2.pair,
      side: "initiator",
      capability: envelope2.capability,
      envelopeDigest: envelope2.digest,
      nonce: envelope2.nonceInitiator
    }, now, wiring.standingRevocations);
    const vR = authoriseUnderGrant(g, wiring.standingUsage?.responder, {
      pair: envelope2.pair,
      side: "responder",
      capability: envelope2.capability,
      envelopeDigest: envelope2.digest,
      nonce: envelope2.nonceResponder
    }, now, wiring.standingRevocations);
    if (vI.ok && vR.ok) {
      const ackI = standingAcknowledgement(vI.authorisation);
      const ackR = standingAcknowledgement(vR.authorisation);
      const standing = {
        grantDigest: standingDigest(g),
        acknowledgements: [ackI, ackR],
        usageAfter: { initiator: vI.usage, responder: vR.usage },
        notice: standingNotice(g, vI.usage),
        attests: ackI.attests,
        notAttested: ackI.notAttested
      };
      if (!grantAllows(grantInitiator, envelope2.capability) || !grantAllows(grantResponder, envelope2.capability)) {
        return finish(
          "refused",
          "escalated-to-human",
          `standing grant ${g.grantId} is bounded to its enumerated capabilities and the pair's policy standing does not lend ${envelope2.capability} \u2014 escalated to a per-crossing human decision`,
          [],
          { standing, receipts: { initiator: ackI.digest, responder: ackR.digest } }
        );
      }
      return finish(
        "crossed",
        "crossed",
        `${envelope2.capability} crossed between ${envelope2.pair} under standing grant ${g.grantId}: both owners approved once and named their bounds; this crossing kept its own envelope, nonces and acknowledgements; ${standing.notice}`,
        [],
        { standing, receipts: { initiator: ackI.digest, responder: ackR.digest } }
      );
    }
    const esc = !vI.ok ? vI : vR;
    return finish(
      "refused",
      "escalated-to-human",
      `standing grant ${g.grantId} did not authorise this crossing (${esc.reason}: ${esc.detail}) \u2014 it returns to a per-crossing human decision; a spent, lapsed or revoked grant is a human's business now`,
      [],
      {}
    );
  }
  const filed = [];
  const initiatorVerdict = await verifyFederationApproval(
    parties.initiatorApproval,
    { pair: envelope2.pair, side: "initiator", capability: envelope2.capability, envelopeDigest: envelope2.digest, nonce: envelope2.nonceInitiator },
    parties.initiatorPublicKeyPem,
    now
  );
  if (!initiatorVerdict.ok) {
    const needsHuman = grantInitiator.refused.some((r) => r.rule === "human-first");
    const reason = initiatorVerdict.reason === "malformed" && needsHuman ? "initiator-human-first" : "initiator-approval-invalid";
    const detail = initiatorVerdict.reason === "malformed" && needsHuman ? `${envelope2.capability} changes the initiator's selfimpulse, so its owner must approve it by name: ${initiatorVerdict.detail}. A previous successful crossing is a record, not a decision.` : `the initiator's approval does not hold: ${initiatorVerdict.reason} \u2014 ${initiatorVerdict.detail}`;
    return finish("refused", reason, detail, filed);
  }
  const responderVerdict = await verifyFederationApproval(
    parties.responderApproval,
    { pair: envelope2.pair, side: "responder", capability: envelope2.capability, envelopeDigest: envelope2.digest, nonce: envelope2.nonceResponder },
    parties.responderPublicKeyPem,
    now
  );
  if (!responderVerdict.ok) {
    const needsHuman = grantResponder.refused.some((r) => r.rule === "human-first");
    const reason = responderVerdict.reason === "malformed" && needsHuman ? "responder-human-first" : "responder-approval-invalid";
    const detail = responderVerdict.reason === "malformed" && needsHuman ? `${envelope2.capability} changes the responder's selfimpulse, so its owner must approve it by name: ${responderVerdict.detail}. A previous successful crossing is a record, not a decision.` : `the responder's approval does not hold: ${responderVerdict.reason} \u2014 ${responderVerdict.detail}`;
    return finish("refused", reason, detail, filed);
  }
  if (!grantAllows(grantInitiator, envelope2.capability)) {
    return finish("refused", "initiator-below-standing", `${refusalDetail("initiator", `its policy does not lend ${envelope2.capability} at ${grantInitiator.tier}`)}`, []);
  }
  if (!grantAllows(grantResponder, envelope2.capability)) {
    return finish("refused", "responder-below-standing", `${refusalDetail("responder", `its policy does not lend ${envelope2.capability} at ${grantResponder.tier}`)}`, []);
  }
  const spendInitiator = await consumeApproval(initiatorVerdict.approval, { pair: envelope2.pair, side: "initiator", capability: envelope2.capability, envelopeDigest: envelope2.digest, nonce: envelope2.nonceInitiator }, parties.initiatorPublicKeyPem, now, ledger);
  if (!spendInitiator.ok) return finish("refused", "initiator-approval-invalid", spendInitiator.detail, filed);
  const spendResponder = await consumeApproval(responderVerdict.approval, { pair: envelope2.pair, side: "responder", capability: envelope2.capability, envelopeDigest: envelope2.digest, nonce: envelope2.nonceResponder }, parties.responderPublicKeyPem, now, ledger);
  if (!spendResponder.ok) return finish("refused", "responder-approval-invalid", spendResponder.detail, filed);
  filed.push(
    approvalRecord(initiatorVerdict.approval, { publicKeyPem: parties.initiatorPublicKeyPem, handle: keyHandle(parties.initiatorPublicKeyPem) }),
    approvalRecord(responderVerdict.approval, { publicKeyPem: parties.responderPublicKeyPem, handle: keyHandle(parties.responderPublicKeyPem) })
  );
  return finish(
    "crossed",
    "crossed",
    `${envelope2.capability} crossed between ${envelope2.pair}: the owner key of each selfimpulse approved it, naming who authorised it, both selfimpulses lend the capability at their own standing, and both approvals are now spent`,
    filed,
    { receipts: { initiator: filed[0]?.digest ?? "", responder: filed[1]?.digest ?? "" } }
  );
}
async function decideCrossing(envelope2, side, human, keys, opts = {}) {
  const entropy = opts.entropy ?? federationEntropy;
  const nowMs = opts.now ? opts.now() : Date.now();
  return issueFederationApproval(
    {
      v: "vh.fed.approval.v1",
      approvalId: opts.approvalId ?? entropy(),
      pair: envelope2.pair,
      side,
      capability: envelope2.capability,
      envelopeDigest: envelope2.digest,
      nonce: side === "initiator" ? envelope2.nonceInitiator : envelope2.nonceResponder,
      human: human.trim(),
      decidedAt: nowMs,
      expiresAt: envelope2.expiresAt + (opts.ttlMs ?? 0)
    },
    keys
  );
}

// probe/fedCrossing.test.ts
var AT = 176e10;
var A = "selfimpulse-alpha";
var B = "selfimpulse-beta";
var proven = () => "proven";
var seq = /* @__PURE__ */ (() => {
  let n = 0;
  return () => `id-${(n += 1).toString(36)}-9f2c1d4e6a8b0c3d`;
})();
async function envelope(capability, over = {}) {
  const res = await openCrossing({ ownerA: A, ownerB: B, task: "harden the authorization guard", capability, at: AT, ...over }, { entropy: seq, now: () => AT });
  if (!res.ok) throw new Error(`openCrossing refused: ${res.detail}`);
  return res.envelope;
}
test("federated crossing \u2014 both owner keys approve, or nothing crosses", async (t) => {
  const ka = await generateOwnerKeysWeb();
  const kb = await generateOwnerKeysWeb();
  await t.test("\xA71 the envelope binds both sides and re-derives its own digest", async () => {
    const env = await envelope("repo.read");
    assert.equal(env.format, CROSSING_FORMAT);
    assert.equal(env.pair, pairKey(A, B));
    assert.notEqual(env.nonceInitiator, env.nonceResponder, "each side gets its own nonce");
    assert.equal(verifyEnvelope(env).ok, true);
    const tampered = { ...env, capability: "secrets.read" };
    const verdict = verifyEnvelope(tampered);
    assert.equal(verdict.ok, false, "changing the capability changes the envelope");
    if (!verdict.ok) assert.equal(verdict.reason, "envelope-tampered");
    const sameOwner = await openCrossing({ ownerA: A, ownerB: A, task: "x", capability: "repo.read", at: AT }, { entropy: seq, now: () => AT });
    assert.equal(sameOwner.ok, false, "one owner is not a crossing");
  });
  await t.test("\xA72 HISTORY IS NOT PERMISSION \u2014 a prior success row does not stand in for an approval", async () => {
    const env = await envelope("repo.write");
    const initiator = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    if (!initiator.ok) throw new Error("initiator decision failed");
    const priorSuccess = [{ kind: "success", pair: pairKey(A, B), note: "a person at selfimpulse-beta walked this pair through once already" }];
    assert.equal(priorSuccess.length, 1, "the historical record is present and is ignored");
    const outcome = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: initiator.approval,
        responderApproval: null
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1e3 }
    );
    assert.equal(outcome.status, "refused");
    assert.equal(outcome.reason, "responder-human-first");
    assert.match(outcome.detail, /its owner must approve it by name/);
    assert.match(outcome.detail, /record, not a decision/);
    assert.deepEqual(outcome.approvals, [], "nothing is filed for a crossing that did not happen");
  });
  await t.test("\xA73 both decisions together, and only then, produce a crossing", async () => {
    const env = await envelope("repo.write");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const ledger = memoryApprovalLedger();
    const outcome = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { standing: proven, ledger, now: () => AT + 1e3 }
    );
    assert.equal(outcome.status, "crossed", `${outcome.reason}: ${outcome.detail}`);
    assert.equal(outcome.approvals.length, 2, "both decisions are filed with the run");
    assert.deepEqual(outcome.approvals.map((a) => a.human).sort(), ["ana", "priya"]);
    assert.equal(outcome.approvals.every((a) => a.digest.length === 64), true);
    assert.equal(outcome.digest.length, 64);
    assert.equal(outcome.envelopeDigest, env.digest);
    assert.equal(ledger.size, 2, "both decisions are spent");
    const replay = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { standing: proven, ledger, now: () => AT + 2e3 }
    );
    assert.equal(replay.status, "refused", "the same two decisions cannot authorise a second crossing");
    assert.equal(replay.reason, "initiator-approval-invalid");
  });
  await t.test("\xA74 one side's decision never covers the other side", async () => {
    const env = await envelope("shell.exec");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    if (!ia.ok) throw new Error("decision failed");
    const crossed = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: ia.approval
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1e3 }
    );
    assert.equal(crossed.status, "refused");
    assert.equal(crossed.reason, "responder-approval-invalid");
    assert.match(crossed.detail, /wrong-side/);
  });
  await t.test("\xA75 standing is read, never asserted \u2014 a stranger's approval changes nothing", async () => {
    const env = await envelope("repo.read");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const stranger = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { standing: () => "unknown", ledger: memoryApprovalLedger(), now: () => AT + 1e3 }
    );
    assert.equal(stranger.status, "refused");
    assert.equal(stranger.reason, "initiator-below-standing");
    assert.match(stranger.detail, /no joint receipts/);
  });
  await t.test("\xA76 the default standing reader is the live mesh ledger", async () => {
    const env = await envelope("repo.read");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const outcome = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { ledger: memoryApprovalLedger(), now: () => AT + 1e3 }
    );
    assert.equal(outcome.status, "refused");
    assert.equal(outcome.tierInitiator, "unknown");
    assert.equal(outcome.tierResponder, "unknown");
    assert.equal(outcome.reason, "initiator-below-standing");
  });
  await t.test("\xA77 an expired envelope decides nothing, however good the approvals", async () => {
    const env = await envelope("repo.read", { at: AT, expiresAt: AT + 5e3 });
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT, ttlMs: 6e4 });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT, ttlMs: 6e4 });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const late = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 5001 }
    );
    assert.equal(late.status, "refused");
    assert.equal(late.reason, "envelope-expired");
    const fresh = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1 }
    );
    assert.equal(fresh.status, "crossed", `${fresh.reason}: ${fresh.detail}`);
    assert.equal(DEFAULT_ENVELOPE_TTL_MS > 5e3, true, "the default window is wider than this test's");
  });
  await t.test("\xA78b WHAT THE APPROVALS PROVE \u2014 stated, not left to inference", async () => {
    const env = await envelope("repo.write");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const outcome = await crossFederation(
      {
        envelope: env,
        initiator: A,
        responder: B,
        initiatorPublicKeyPem: ka.publicKeyPem,
        responderPublicKeyPem: kb.publicKeyPem,
        initiatorApproval: ia.approval,
        responderApproval: rb.approval
      },
      { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1e3 }
    );
    assert.equal(outcome.status, "crossed", `${outcome.reason}: ${outcome.detail}`);
    assert.match(outcome.detail, /owner key of each selfimpulse approved it, naming who authorised it/);
    assert.equal(/both humans (decided|signed)/.test(outcome.detail), false, "no surface may say a human signed it");
    assert.equal(outcome.attestation.attests, APPROVAL_ATTESTATION);
    assert.equal(outcome.attestation.notAttested, APPROVAL_NOT_ATTESTED);
    assert.match(outcome.attestation.attests, /authority key approved/);
    assert.match(outcome.attestation.notAttested, /distinct from the owner key/);
    for (const rec of outcome.approvals) {
      assert.equal(rec.signedBy, "owner-authority-key", "the record names what actually signed");
      assert.equal(rec.attests, APPROVAL_ATTESTATION);
      assert.equal(rec.notAttested, APPROVAL_NOT_ATTESTED, "the limit travels with the claim");
      assert.match(rec.ownerKeyHandle ?? "", /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/, "the receipt names WHICH key signed");
      assert.ok(["priya", "ana"].includes(rec.human));
    }
    const handles = new Set(outcome.approvals.map((r) => r.ownerKeyHandle));
    assert.equal(handles.size, 2, "two different owner keys signed the two sides");
    assert.equal(
      handles.has(keyHandle(ka.publicKeyPem)) && handles.has(keyHandle(kb.publicKeyPem)),
      true,
      "\u2026and the handles are the handles of the keys in the envelope"
    );
    const body = { ...outcome };
    delete body.digest;
    assert.equal(outcome.digest, pureSha256(`vh.fed.outcome.v1:${JSON.stringify(body)}`));
  });
  await t.test("\xA79 TWO LOCAL STORES \u2014 distributed evidence, local trust, in the runtime", async () => {
    const env = await envelope("repo.write");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const parts = {
      envelope: env,
      initiator: A,
      responder: B,
      initiatorPublicKeyPem: ka.publicKeyPem,
      responderPublicKeyPem: kb.publicKeyPem,
      initiatorApproval: ia.approval,
      responderApproval: rb.approval
    };
    const calls = [];
    const initiatorStore = (a, b) => {
      calls.push(`initiator:${a}->${b}`);
      return "proven";
    };
    const responderStore = (a, b) => {
      calls.push(`responder:${a}->${b}`);
      return "proven";
    };
    const crossed = await crossFederation(parts, {
      standingInitiator: initiatorStore,
      standingResponder: responderStore,
      stores: { initiator: "reykjavik", responder: "lisbon" },
      ledger: memoryApprovalLedger(),
      now: () => AT + 1e3
    });
    assert.equal(crossed.status, "crossed", `${crossed.reason}: ${crossed.detail}`);
    assert.equal(crossed.standingSource.shared, false, "two stores were read");
    assert.equal(crossed.standingSource.initiator, "reykjavik");
    assert.equal(crossed.standingSource.responder, "lisbon");
    assert.deepEqual(
      [...new Set(calls.map((c) => c.split(":")[0]))].sort(),
      ["initiator", "responder"],
      "each side's own store was consulted"
    );
    assert.equal(
      calls.every((c) => c.includes(`${A}->${B}`) || c.includes(`${B}->${A}`)),
      true,
      "each store was asked about THIS pair"
    );
    const splitEnv = await envelope("repo.write", { at: AT + 1e5 });
    const ia2 = await decideCrossing(splitEnv, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb2 = await decideCrossing(splitEnv, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia2.ok || !rb2.ok) throw new Error("decisions failed");
    const splitParts = { ...parts, envelope: splitEnv, initiatorApproval: ia2.approval, responderApproval: rb2.approval };
    const responderSaysNo = await crossFederation(splitParts, {
      standingInitiator: () => "proven",
      standingResponder: () => "probation",
      stores: { initiator: "reykjavik", responder: "lisbon" },
      ledger: memoryApprovalLedger(),
      now: () => AT + 100001
    });
    assert.equal(responderSaysNo.status, "refused");
    assert.equal(responderSaysNo.reason, "responder-below-standing");
    assert.equal(responderSaysNo.tierInitiator, "proven", "the initiator's own store selfimpulseed for the pair");
    assert.equal(responderSaysNo.tierResponder, "probation", "\u2026and the responder's own store did not");
    assert.match(responderSaysNo.detail, /the responder's own local trust store \(lisbon\)/);
    assert.match(responderSaysNo.detail, /not the other side's \(reykjavik\)/);
    assert.match(responderSaysNo.detail, /free to disagree/);
    assert.equal(responderSaysNo.standingSource.shared, false);
    const initiatorSaysNo = await crossFederation(splitParts, {
      standingInitiator: () => "probation",
      standingResponder: () => "proven",
      stores: { initiator: "reykjavik", responder: "lisbon" },
      ledger: memoryApprovalLedger(),
      now: () => AT + 100002
    });
    assert.equal(initiatorSaysNo.status, "refused");
    assert.equal(initiatorSaysNo.reason, "initiator-below-standing");
    assert.match(initiatorSaysNo.detail, /the initiator's own local trust store \(reykjavik\)/);
    const oneStore = await crossFederation(splitParts, {
      standing: proven,
      stores: { initiator: "reykjavik", responder: "reykjavik (same machine)" },
      ledger: memoryApprovalLedger(),
      now: () => AT + 100003
    });
    assert.equal(oneStore.status, "crossed", `${oneStore.reason}: ${oneStore.detail}`);
    assert.equal(oneStore.standingSource.shared, true, "one reader means one local store, stated plainly");
    assert.equal(oneStore.tierInitiator, oneStore.tierResponder, "\u2026so both tiers come from the same observation");
  });
  await t.test("\xA78 the outcome digest commits to the whole decision", async () => {
    const env = await envelope("repo.read");
    const ia = await decideCrossing(env, "initiator", "priya", ka, { entropy: seq, now: () => AT });
    const rb = await decideCrossing(env, "responder", "ana", kb, { entropy: seq, now: () => AT });
    if (!ia.ok || !rb.ok) throw new Error("decisions failed");
    const parts = {
      envelope: env,
      initiator: A,
      responder: B,
      initiatorPublicKeyPem: ka.publicKeyPem,
      responderPublicKeyPem: kb.publicKeyPem,
      initiatorApproval: ia.approval,
      responderApproval: rb.approval
    };
    const one = await crossFederation(parts, { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1e3 });
    const two = await crossFederation(parts, { standing: proven, ledger: memoryApprovalLedger(), now: () => AT + 1e3 });
    assert.equal(one.digest, two.digest, "same decisions, same digest");
    assert.equal(one.digest.length, 64);
    assert.equal(one.digest, pureSha256(`vh.fed.outcome.v1:${JSON.stringify({
      crossingId: one.crossingId,
      pair: one.pair,
      capability: one.capability,
      status: one.status,
      reason: one.reason,
      detail: one.detail,
      at: one.at,
      envelopeDigest: one.envelopeDigest,
      tierInitiator: one.tierInitiator,
      tierResponder: one.tierResponder,
      standingSource: one.standingSource,
      grants: one.grants,
      approvals: one.approvals,
      attestation: one.attestation
    })}`));
    assert.equal(one.standingSource.shared, true, "this caller read ONE local store, and the receipt says so");
  });
  await t.test("\xA710 APPROVE ONCE, THEN AUTONOMOUS \u2014 the human leaves the loop, the evidence does not", async () => {
    const env = await envelope("repo.read");
    const body = {
      v: STANDING_FORMAT,
      grantId: "grant-5c1e7a934b2d4f60",
      pair: pairKey(A, B),
      capabilities: ["test.run", "repo.read"],
      initiatorHuman: "priya",
      responderHuman: "sam",
      maxCrossings: 3,
      windowMs: 6e4,
      windowMax: 2,
      issuedAt: AT,
      expiresAt: AT + 864e5,
      onOutOfScope: OUT_OF_SCOPE_ESCALATE
    };
    const issued = await issueStandingGrant(body, ka, kb);
    assert.equal(issued.ok, true, JSON.stringify(issued));
    if (!issued.ok) return;
    const grant = issued.grant;
    assert.deepEqual(grant.capabilities, ["repo.read", "test.run"], "capabilities are canonicalised so both owners sign identical bytes");
    const verified = await verifyStandingGrant(grant, ka.publicKeyPem, kb.publicKeyPem, AT + 1e3);
    assert.equal(verified.ok, true, JSON.stringify(verified));
    const expect = (nonce, capability = "repo.read") => ({
      pair: grant.pair,
      side: "initiator",
      capability,
      envelopeDigest: env.digest,
      nonce
    });
    const first = authoriseUnderGrant(grant, void 0, expect(env.nonceInitiator), AT + 1e3);
    assert.equal(first.ok, true, JSON.stringify(first));
    if (!first.ok) return;
    assert.equal(first.authorisation.crossingsUsed, 1);
    assert.equal(first.authorisation.crossingsRemaining, 2);
    const second = authoriseUnderGrant(grant, first.usage, expect("nonce-2-8f1c4b7d9e0a2c5f"), AT + 2e3);
    assert.equal(second.ok, true, JSON.stringify(second));
    if (!second.ok) return;
    const burst = authoriseUnderGrant(grant, second.usage, expect("nonce-3-burst"), AT + 3e3);
    assert.equal(burst.ok, false);
    if (!burst.ok) assert.equal(burst.reason, "window-exceeded");
    const third = authoriseUnderGrant(grant, second.usage, expect("nonce-4-window2"), AT + 61500);
    assert.equal(third.ok, true, JSON.stringify(third));
    if (!third.ok) return;
    assert.equal(third.authorisation.crossingsRemaining, 0);
    const spent = authoriseUnderGrant(grant, third.usage, expect("nonce-5-spent"), AT + 62e3);
    assert.equal(spent.ok, false);
    if (!spent.ok) {
      assert.equal(spent.reason, "grant-exhausted");
      assert.match(spent.detail, /set a new grant, which means two humans looking again/);
    }
    const outOfScope = authoriseUnderGrant(grant, second.usage, expect("nonce-6-escalate", "shell.exec"), AT + 4e3);
    assert.equal(outOfScope.ok, false);
    if (!outOfScope.ok) {
      assert.equal(outOfScope.reason, "escalate");
      assert.match(outOfScope.detail, /returns to a per-crossing human decision/);
    }
    const rev = revokeStandingGrant(grant, "responder", "sam", AT + 5e3, "the client withdrew consent for the shared repo");
    const afterRevoke = authoriseUnderGrant(grant, first.usage, expect("nonce-7-revoked"), AT + 6e3, [rev]);
    assert.equal(afterRevoke.ok, false);
    if (!afterRevoke.ok) {
      assert.equal(afterRevoke.reason, "revoked");
      assert.match(afterRevoke.detail, /client withdrew consent/);
    }
    const expired = await verifyStandingGrant(grant, ka.publicKeyPem, kb.publicKeyPem, AT + 86400001);
    assert.equal(expired.ok, false);
    if (!expired.ok) assert.equal(expired.reason, "grant-expired");
    const ack = standingAcknowledgement(first.authorisation, { publicKeyPem: ka.publicKeyPem, handle: keyHandle(ka.publicKeyPem) });
    assert.equal(ack.attests, STANDING_ATTESTATION);
    assert.equal(ack.notAttested, STANDING_NOT_ATTESTED);
    assert.match(ack.attests, /authorised this crossing in advance/);
    assert.match(ack.notAttested, /that a human reviewed this specific crossing/);
    assert.equal(ack.grantDigest, standingDigest(grant));
    assert.equal(ack.human, "priya");
    assert.equal(ack.ownerKeyHandle, keyHandle(ka.publicKeyPem));
    assert.match(ack.digest, /^[0-9a-f]{64}$/);
    const wildcard = await issueStandingGrant({ ...body, capabilities: ["*"] }, ka, kb);
    assert.equal(wildcard.ok, false);
    if (!wildcard.ok) assert.equal(wildcard.reason, "wildcard-capability");
    const unbounded = await issueStandingGrant({ ...body, windowMax: 99 }, ka, kb);
    assert.equal(unbounded.ok, false);
    if (!unbounded.ok) assert.equal(unbounded.reason, "unbounded");
    const noHuman = await issueStandingGrant({ ...body, responderHuman: "  " }, ka, kb);
    assert.equal(noHuman.ok, false);
    if (!noHuman.ok) assert.equal(noHuman.reason, "no-human");
    const forged = { ...grant, signatureResponder: grant.signatureInitiator };
    const forgedVerdict = await verifyStandingGrant(forged, ka.publicKeyPem, kb.publicKeyPem, AT + 1e3);
    assert.equal(forgedVerdict.ok, false);
    if (!forgedVerdict.ok) {
      assert.equal(forgedVerdict.reason, "bad-signature");
      assert.match(forgedVerdict.detail, /responder/);
    }
    assert.match(standingNotice(grant, second.usage), /2\/3 crossings used/);
  });
  await t.test("\xA711 ONE COMMON PLACE TO CHECK \u2014 two independent stores, derived roots", () => {
    const joint = (id, at, decision = "crossed") => ({
      crossingId: id,
      envelopeDigest: pureSha256(`env:${id}`),
      capability: "repo.read",
      decision,
      outcomeDigest: pureSha256(`outcome:${id}`),
      initiatorReceipt: pureSha256(`rec-a:${id}`),
      responderReceipt: pureSha256(`rec-b:${id}`),
      at
    });
    const storeA = [joint("x-1", AT + 1), joint("x-2", AT + 2)];
    const storeB = [joint("x-1", AT + 1), joint("x-2", AT + 2)];
    const same = compareRoots(pairKey(A, B), { entries: storeA }, { entries: storeB }, AT + 10);
    assert.equal(same.agreed, true);
    assert.equal(same.initiatorRoot, same.responderRoot);
    assert.equal(same.attests, LEDGER_ATTESTATION);
    assert.equal(ledgerRoot([...storeA].reverse()), ledgerRoot(storeA));
    const diverged = compareRoots(pairKey(A, B), { entries: storeA }, { entries: [joint("x-1", AT + 1), joint("x-2", AT + 2, "refused")] }, AT + 11);
    assert.equal(diverged.agreed, false);
    assert.equal(diverged.firstDivergence?.crossingId, "x-2");
    assert.match(diverged.firstDivergence.detail, /same crossing, different record/);
    const missing = compareRoots(pairKey(A, B), { entries: storeA }, { entries: [joint("x-1", AT + 1)] }, AT + 12);
    assert.equal(missing.agreed, false);
    assert.match(missing.firstDivergence.detail, /holds no record of crossing x-2/);
    const view = pairLedgerView(storeA, [joint("x-1", AT + 1), joint("x-2", AT + 2, "refused"), joint("x-3", AT + 3)]);
    assert.equal(view.length, 3);
    assert.equal(view.find((r) => r.crossingId === "x-1").seenBy, "both");
    assert.equal(view.find((r) => r.crossingId === "x-1").disagrees, false);
    assert.equal(view.find((r) => r.crossingId === "x-2").disagrees, true, "a disagreement is flagged, never merged");
    assert.equal(view.find((r) => r.crossingId === "x-3").seenBy, "responder-only");
    assert.match(ledgerRowSentence(view.find((r) => r.crossingId === "x-3")), /held only by the responder/);
    assert.match(ledgerRowSentence(view.find((r) => r.crossingId === "x-2")), /shown unmerged/);
    const mirror = mirrorAttestation(same, "auditor-node-1", AT + 20);
    assert.equal(mirror.agreed, true);
    assert.match(mirror.attests, /this mirror holds the root so a later disagreement can be proved against it/);
    assert.equal(mirrorVerifies(mirror, same).ok, true);
    const later = mirrorVerifies(mirror, diverged);
    assert.equal(later.ok, false);
    if (!later.ok) assert.match(later.detail, /records changed after the mirror was written/);
  });
});
