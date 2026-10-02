import { Aes256Gcm, CipherSuite, DhkemP256HkdfSha256, HkdfSha256 } from "@hpke/core";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import { VHCryptoError } from "./si-errors.js";

/* ============================================================================
 * SELFIMPULSE SELFIMPULSE — UNIVERSAL SECURITY CORE v0.10.2 "unified-sentinel-hybrid" (Fix1)
 * ----------------------------------------------------------------------------
 * v0.10.2 FIXES
 *   FIX-2 / FIX-3: HPKE sender.enc and sender.seal() return ArrayBuffer in
 *   @hpke/core 1.9.0 — both now wrapped in Uint8Array before b64e(). In
 *   v0.10.1 hybridSealFor threw on EVERY call; the hybrid path is now live.
 *   HKDF info labels aligned to selfimpulse/0.10.3/*.
 * v0.10.1 BASE (retained): TRUE HYBRID key combiner — content key derives
 *   from TWO independent secrets (HPKE-protected S_C + ML-KEM-protected S_PQ)
 *   via HKDF; VH-HYBRID-PQ3 / VH-VAULT-v3 identifiers.
 * ----------------------------------------------------------------------------
 * POST-QUANTUM SCOPE (accurate)
 *   Content encryption  → hybrid post-quantum (HPKE RFC 9180 + ML-KEM-768)
 *   Identity / signing  → classical ECDSA P-256 (NOT post-quantum resistant)
 *   Future signing path → ML-DSA (FIPS 204) — planned for a future major ver
 * ========================================================================== */

const subtle = globalThis.crypto?.subtle;
if (!subtle) throw new VHCryptoError("Web Crypto API unavailable.");

const ECDSA      = { name: "ECDSA", namedCurve: "P-256" };
const ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" };
const HPKE = new CipherSuite({
  kem:  new DhkemP256HkdfSha256(),
  kdf:  new HkdfSha256(),
  aead: new Aes256Gcm(),
});

export const PROTOCOL = Object.freeze({
  version:         "0.10.7",
  majorVersion:    0,
  minorVersion:    10,
  patchVersion:    3,
  codename:        "unified-sentinel-hybrid",
  hybridAlg:       "VH-HYBRID-PQ3",
  vaultAlg:        "VH-VAULT-v3",
  rotatePrefix:    "VH-ROTATE-v2",
  /* v0.10.7 RULE 6: a rotation must prove possession of the NEW key too, not
     only continuity from the old one (see protocol/THREAT-MODEL.md). */
  rotatePopPrefix: "VH-ROTATE-POP-v1",
  challengePrefix: "VH-CHALLENGE-v1",
  signingLayer: Object.freeze({
    current:    "ECDSA-P256",
    pqStatus:   "classical",
    futureWork: "ML-DSA (FIPS 204)",
    note:       "Identity and challenge-response signing are NOT post-quantum hardened in this version.",
  }),
  encryptionScope: "hybrid-pq-content-only",
  hybridCombiner: "independent-secrets-hkdf-v1",
});

/**
 * Machine-readable cryptographic boundary.  These labels describe the
 * security model without pretending every primitive is simply "quantum-safe".
 */
export const CRYPTO_BOUNDARY = Object.freeze({
  identity:          { primitive: "ECDSA-P256", quantumStatus: "classical", fips: null },
  signing:           { primitive: "ECDSA-P256 / SHA-256", quantumStatus: "classical", fips: null },
  contentEncryption: { primitive: "HPKE-RFC9180 + ML-KEM-768 + HKDF combiner", quantumStatus: "hybrid", fips: "203" },
  symmetricAead:     { primitive: "AES-256-GCM", quantumStatus: "quantum-reduced-margin", fips: "197" },
  hashing:           { primitive: "SHA-256", quantumStatus: "quantum-reduced-margin", fips: "180-4" },
  kdf:               { primitive: "HKDF-SHA256", quantumStatus: "quantum-reduced-margin", fips: null },
});

export function assertCryptoBoundary(expectations) {
  for (const [key, expect] of Object.entries(expectations)) {
    const actual = CRYPTO_BOUNDARY[key];
    if (!actual) throw new VHCryptoError(`VH: unknown crypto boundary key "${key}"`);
    for (const [field, val] of Object.entries(expect)) {
      if (actual[field] !== val) {
        throw new VHCryptoError(`VH: crypto boundary mismatch at ${key}.${field}: expected ${val}, got ${actual[field]}`);
      }
    }
  }
  return true;
}

/* ═══════════════════════════ ENCODING ══════════════════════════════════════ */

const HAS_BUF = typeof Buffer !== "undefined";
const enc = new TextEncoder();

export function b64e(u8) {
  if (!(u8 instanceof Uint8Array)) throw new VHCryptoError("b64e: not Uint8Array");
  if (HAS_BUF) return Buffer.from(u8).toString("base64");
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000)
    s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64d(s) {
  if (typeof s !== "string") throw new VHCryptoError("b64d: expected string");
  if (HAS_BUF) return new Uint8Array(Buffer.from(s, "base64"));
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Plain hex encoding — NOT constant-time. Use ctEq() for secret comparisons. */
export function bytesToHex(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new VHCryptoError("bytesToHex: not Uint8Array");
  const hex = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) hex[i] = bytes[i].toString(16).padStart(2, "0");
  return hex.join("");
}

export function groupHex(hex) {
  if (typeof hex !== "string") throw new VHCryptoError("groupHex: not string");
  return (hex.match(/.{4}/g) || []).join("-");
}

export function hexToBytes(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0)
    throw new VHCryptoError("hexToBytes: invalid hex string");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++)
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/* ═══════════════════════════ RANDOMNESS ════════════════════════════════════ */

export function randomBytes(n) {
  if (!Number.isInteger(n) || n <= 0 || n > 65536)
    throw new VHCryptoError(`randomBytes: invalid length ${n}`);
  if (!globalThis.crypto?.getRandomValues)
    throw new VHCryptoError("randomBytes: CSPRNG unavailable");
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

export function randomHex(bytes = 12) { return bytesToHex(randomBytes(bytes)); }

/**
 * Zero-fill a Uint8Array in place.
 * Best-effort: JS runtimes may retain internal copies.
 * No deterministic erasure guaranteed by the language spec.
 */
export function zeroize(u8) { if (u8 instanceof Uint8Array) u8.fill(0); }

/* ═══════════════════════════ HASHING ═══════════════════════════════════════ */

export async function sha256(input) {
  const data = typeof input === "string" ? enc.encode(input) : input;
  if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer))
    throw new VHCryptoError("sha256: invalid input type");
  return new Uint8Array(await subtle.digest("SHA-256", data));
}

export async function sha256Hex(input) { return bytesToHex(await sha256(input)); }

export async function hkdfSha256(ikm, salt, info, len = 32) {
  if (!(ikm instanceof Uint8Array)) throw new VHCryptoError("hkdfSha256: ikm must be Uint8Array");
  if (len < 1 || len > 8160)       throw new VHCryptoError("hkdfSha256: invalid len");
  const key  = await subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256",
      salt: typeof salt === "string" ? enc.encode(salt) : salt,
      info: enc.encode(info) },
    key, len * 8,
  );
  return new Uint8Array(bits);
}

/* ═══════════════════════════ L1 · DEVICE IDENTITY ══════════════════════════ */

export async function generateIdentity() {
  const signKp  = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const signJwk = await subtle.exportKey("jwk", signKp.publicKey);
  const hpkeKp  = await HPKE.kem.generateKeyPair();
  const pqKp    = ml_kem768.keygen();
  return {
    sign: { publicKey: signKp.publicKey, privateKey: signKp.privateKey, publicJwk: signJwk },
    hpke: { publicKey: hpkeKp.publicKey, privateKey: hpkeKp.privateKey },
    pq:   { publicKey: pqKp.publicKey,   secretKey:  pqKp.secretKey   },
    fp:   await fingerprint(signJwk),
  };
}

export async function publicBundle(id) {
  _requireIdentity(id);
  return {
    v: 2, fp: id.fp,
    signJwk: id.sign.publicJwk,
    hpkePub: b64e(new Uint8Array(await HPKE.kem.serializePublicKey(id.hpke.publicKey))),
    pqPub:   b64e(id.pq.publicKey),
  };
}

export async function privateFromBundle(priv) {
  if (!priv?.hpkePub || !priv?.hpkePriv || !priv?.pqPub || !priv?.pqPriv)
    throw new VHCryptoError("privateFromBundle: incomplete bundle");
  return {
    hpke: {
      publicKey:  await HPKE.kem.deserializePublicKey(b64d(priv.hpkePub)),
      privateKey: await HPKE.kem.deserializePrivateKey(b64d(priv.hpkePriv)),
    },
    pq: { publicKey: b64d(priv.pqPub), secretKey: b64d(priv.pqPriv) },
  };
}

export async function serializePrivate(id) {
  _requireIdentity(id);
  return {
    v: 2, fp: id.fp,
    signJwk:  id.sign.publicJwk,
    hpkePub:  b64e(new Uint8Array(await HPKE.kem.serializePublicKey(id.hpke.publicKey))),
    hpkePriv: b64e(new Uint8Array(await HPKE.kem.serializePrivateKey(id.hpke.privateKey))),
    pqPub:    b64e(id.pq.publicKey),
    pqPriv:   b64e(id.pq.secretKey),
  };
}

export async function fingerprint(jwk) {
  if (!jwk?.crv || !jwk?.x || !jwk?.y) throw new VHCryptoError("fingerprint: invalid JWK");
  const stable = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  return groupHex((await sha256Hex(enc.encode(stable))).slice(0, 16).toUpperCase());
}

export async function importVerifyKey(jwk) {
  if (!jwk?.crv || !jwk?.x || !jwk?.y) throw new VHCryptoError("importVerifyKey: invalid JWK");
  return subtle.importKey("jwk", jwk, ECDSA, false, ["verify"]);
}

function _requireIdentity(id) {
  if (!id?.sign?.privateKey || !id?.hpke || !id?.pq)
    throw new VHCryptoError("Operation requires a full identity object");
}

/* ═══════════════════════════ L4 · LINK FINGERPRINT ═════════════════════════ */

export async function linkFingerprint(fpA, fpB) {
  if (typeof fpA !== "string" || typeof fpB !== "string")
    throw new VHCryptoError("linkFingerprint: fps must be strings");
  const h = await sha256Hex(enc.encode([fpA, fpB].sort().join("|")));
  return groupHex(h.slice(0, 16).toUpperCase());
}

/* ═══════════════════════════ L2 · SIGNING ══════════════════════════════════ */

export async function sign(privateKey, str) {
  if (typeof str !== "string") throw new VHCryptoError("sign: payload must be string");
  const sig = await subtle.sign(ECDSA_SIGN, privateKey, enc.encode(str));
  return b64e(new Uint8Array(sig));
}

export async function verify(publicJwk, str, sigB64) {
  try {
    const key = await importVerifyKey(publicJwk);
    return await subtle.verify(ECDSA_SIGN, key, b64d(sigB64), enc.encode(str));
  } catch { return false; }
}

export async function signChallenge(privateKey, challenge, fp) {
  if (typeof challenge !== "string") throw new VHCryptoError("signChallenge: challenge must be string");
  return sign(privateKey, `${PROTOCOL.challengePrefix}|${challenge}|${fp}`);
}

export async function verifyChallenge(signJwk, challenge, claimedFp, sig) {
  try { return verify(signJwk, `${PROTOCOL.challengePrefix}|${challenge}|${claimedFp}`, sig); }
  catch { return false; }
}

export async function sealSecure(obj, privateKey) {
  if (obj === null || typeof obj !== "object") throw new VHCryptoError("sealSecure: payload must be object");
  const p   = JSON.stringify(obj);
  const n   = randomHex(16);
  const ts  = Date.now();
  const sig = await sign(privateKey, `${p}|${n}|${ts}`);
  return { p, n, ts, sig };
}

export function createReplayGuard({ windowMs = 5 * 60_000, maxSize = 20_000 } = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0)
    throw new VHCryptoError("createReplayGuard: invalid windowMs");
  const seen = new Map();
  function evict() {
    const target = Math.floor(maxSize * 0.1);
    let removed  = 0;
    for (const k of seen.keys()) { if (removed >= target) break; seen.delete(k); removed++; }
  }
  return {
    windowMs,
    check(env) {
      if (!env || typeof env.p !== "string" || typeof env.n !== "string" || typeof env.ts !== "number")
        return { ok: false, reason: "malformed-envelope" };
      if (env.n.length < 16 || env.n.length > 64)
        return { ok: false, reason: "invalid-nonce-length" };
      if (Math.abs(Date.now() - env.ts) > windowMs)
        return { ok: false, reason: "stale-envelope" };
      if (seen.has(env.n))
        return { ok: false, reason: "replayed-envelope" };
      return { ok: true };
    },
    remember(env) { if (seen.size >= maxSize) evict(); seen.set(env.n, env.ts); },
    purgeExpired() { const c = Date.now() - windowMs; for (const [k, ts] of seen) if (ts < c) seen.delete(k); },
    get size() { return seen.size; },
  };
}

export async function openSecure(env, senderJwk, guard = null) {
  if (guard) {
    const pre = guard.check(env);
    if (!pre.ok) return { payload: null, verified: false, reason: pre.reason };
  }
  const verified = await verify(senderJwk, `${env.p}|${env.n}|${env.ts}`, env.sig);
  if (!verified) return { payload: null, verified: false, reason: "bad-signature" };
  if (guard) guard.remember(env);
  let payload = null;
  try { payload = JSON.parse(env.p); }
  catch { return { payload: null, verified: false, reason: "unparseable-payload" }; }
  return { payload, verified: true };
}

/* ═══════════════════════════ L3 · SELFIMPULSEING + HASH CHAIN ════════════════════ */

export const GENESIS = "0".repeat(64);

export async function buildSelfImpulse(facts, privateKey)  { return sealSecure(facts, privateKey); }
export async function verifySelfImpulse(env, signerJwk)    { return verify(signerJwk, `${env.p}|${env.n}|${env.ts}`, env.sig); }

export async function chainHash(prevHash, payloadStr) {
  if (typeof prevHash !== "string" || typeof payloadStr !== "string")
    throw new VHCryptoError("chainHash: invalid inputs");
  return sha256Hex(enc.encode(`${prevHash}|${payloadStr}`));
}

export async function verifyChain(links) {
  if (!Array.isArray(links)) throw new VHCryptoError("verifyChain: links must be array");
  const signed    = links.filter((l) => l.sig && l.pubJwk);
  let sigValid    = 0;
  for (const l of signed)
    if (await verify(l.pubJwk, `${l.p}|${l.n}|${l.ts}`, l.sig)) sigValid++;
  const linkTotal = Math.max(0, links.length - 1);
  let linkIntact  = 0;
  for (let i = 1; i < links.length; i++) {
    const l          = links[i];
    const prevOk     = l.prev === links[i - 1].hash;
    const recomputed = await chainHash(l.prev, l.payloadStr);
    if (prevOk && recomputed === l.hash) linkIntact++;
  }
  return {
    ok: sigValid === signed.length && linkIntact === linkTotal,
    signatures: { valid: sigValid,    total: signed.length },
    links:      { intact: linkIntact, total: linkTotal },
  };
}

/* ═══════════════════════════ L9 · KEY ROTATION ═════════════════════════════ */

export async function rotateIdentity(oldIdentity) {
  _requireIdentity(oldIdentity);
  const next       = await generateIdentity();
  const nextBundle = await publicBundle(next);
  const ts         = Date.now();
  const oldFp      = await fingerprint(oldIdentity.sign.publicJwk);
  /* RULE 6 (v0.10.7): continuity is not enough. The proof carries TWO
     signatures — the outgoing key says "this successor is mine", and the
     INCOMING key says "and I am here, holding my own private key". Without the
     second, a member could name an OFFLINE identity's public bundle as its
     successor and squat that fingerprint (see THREAT-MODEL, RULE 6). */
  const pop = await sign(next.sign.privateKey, `${PROTOCOL.rotatePopPrefix}|${oldFp}|${nextBundle.fp}|${ts}`);
  return { next, proof: { newBundle: nextBundle, ts, sig: await sign(oldIdentity.sign.privateKey, `${PROTOCOL.rotatePrefix}|${JSON.stringify(nextBundle)}|${ts}`), pop } };
}

export async function verifyRotationProof(proof, oldSignJwk, { oldFp = null } = {}) {
  if (!proof?.newBundle || !proof?.sig || typeof proof.ts !== "number") return false;
  if (Math.abs(Date.now() - proof.ts) > 10 * 60_000) return false;
  /* (1) continuity: the OUTGOING key authorises this successor. */
  const continuity = await verify(oldSignJwk, `${PROTOCOL.rotatePrefix}|${JSON.stringify(proof.newBundle)}|${proof.ts}`, proof.sig);
  if (!continuity) return false;
  /* (2) RULE 6 possession: the INCOMING key must actually be here. `oldFp` is
     the caller's authenticated fingerprint; binding it into the signed string
     stops a possession proof being lifted onto another rotation. A proof with
     no `pop`, a wrong key, or a mismatched oldFp fails closed. */
  if (typeof oldFp !== "string" || !oldFp) return false;
  if (typeof proof.pop !== "string" || !proof.pop) return false;
  return verify(proof.newBundle.signJwk, `${PROTOCOL.rotatePopPrefix}|${oldFp}|${proof.newBundle.fp}|${proof.ts}`, proof.pop);
}

/* ═══════════════════════════ L6 · HYBRID CONTENT ENCRYPTION ════════════════ */

async function _aesGcmSeal(keyBytes, plaintext, aad) {
  const key = await subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv  = randomBytes(12);
  const ct  = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, plaintext);
  return { iv, ct: new Uint8Array(ct) };
}

async function _aesGcmOpen(keyBytes, iv, ct, aad) {
  const key = await subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
  const pt  = await subtle.decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, key, ct);
  return new Uint8Array(pt);
}

/** Constant-time byte-array equality. Use for secret-material comparisons. */
function ctEq(a, b) {
  if (!(a instanceof Uint8Array) || !(b instanceof Uint8Array)) return false;
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

/**
 * Derive a deterministic binding tag from the recipient's encryption keys.
 * The signing identity key remains outside this content-encryption combiner.
 */
async function _bindingTag(hpkePubBytes, pqPubBytes) {
  const combined = new Uint8Array(hpkePubBytes.length + pqPubBytes.length);
  combined.set(hpkePubBytes, 0);
  combined.set(pqPubBytes, hpkePubBytes.length);
  return `VH-BIND:${bytesToHex(await sha256(combined))}`;
}

/**
 * V0.10.1 TRUE HYBRID KEY COMBINER
 * ---------------------------------------------------------------------------
 * The old v0.10 schedule encrypted the SAME seed through both paths. That
 * meant compromise of either path was sufficient to recover the content key.
 *
 * The corrected schedule uses TWO independent 32-byte secrets:
 *   S_C   — randomly generated and protected by HPKE.
 *   S_PQ  — randomly generated and protected by an ML-KEM-derived wrap key.
 *
 * The final content key is derived from BOTH secrets:
 *   CK = HKDF-SHA256(S_C || S_PQ, salt, context)
 *
 * Therefore compromise of either single KEM path alone does not reveal CK;
 * an attacker must obtain BOTH independent secrets (or compromise the endpoint
 * or symmetric cryptography). This matches the intended hybrid-resilience
 * property that a hybrid derived key remains secure when at least one component
 * remains secure.
 */
export async function hybridSealFor(recipientBundle, plaintext) {
  if (!recipientBundle?.hpkePub || !recipientBundle?.pqPub)
    throw new VHCryptoError("hybridSealFor: incomplete recipient bundle");
  const data = typeof plaintext === "string" ? enc.encode(plaintext) : plaintext;
  if (!(data instanceof Uint8Array)) throw new VHCryptoError("hybridSealFor: plaintext must be string or Uint8Array");

  const hpkePubBytes = b64d(recipientBundle.hpkePub);
  const pqPubBytes   = b64d(recipientBundle.pqPub);
  const bindTag      = await _bindingTag(hpkePubBytes, pqPubBytes);

  // Two independent secrets: compromise of either one key-establishment path
  // alone must not disclose the final content key.
  let S_C = null;
  let S_PQ = null;
  let sharedSecret = null;
  let wrapKey = null;
  let CK = null;

  try {
    S_C  = randomBytes(32);
    S_PQ = randomBytes(32);

    // Classical path: protect the classical-side independent secret with HPKE.
    const recipientHpke = await HPKE.kem.deserializePublicKey(hpkePubBytes);
    const sender        = await HPKE.createSenderContext({ recipientPublicKey: recipientHpke });
    const cSeedC        = await sender.seal(S_C);

    // PQ path: protect the PQ-side independent secret with an ML-KEM-derived key.
    const kem = ml_kem768.encapsulate(pqPubBytes);
    sharedSecret = kem.sharedSecret;
    wrapKey = await hkdfSha256(
      new Uint8Array(sharedSecret),
      "VH-PQ-WRAP-v3",
      `selfimpulse/0.10.3/wrap|${bindTag}`,
      32,
    );
    const pqSealed = await _aesGcmSeal(wrapKey, S_PQ, `VH-PQ-WRAP-v3|${bindTag}`);

    // FINAL KEY: both independent secrets are mandatory inputs.
    const combined = new Uint8Array(S_C.length + S_PQ.length);
    combined.set(S_C, 0);
    combined.set(S_PQ, S_C.length);
    try {
      CK = await hkdfSha256(
        combined,
        "VH-HYBRID-COMBINE-v3",
        `selfimpulse/0.10.3/content|${bindTag}`,
        32,
      );
    } finally {
      zeroize(combined);
    }

    const contentSealed = await _aesGcmSeal(CK, data, `${PROTOCOL.hybridAlg}|${bindTag}`);

    return {
      v: 3,
      alg: PROTOCOL.hybridAlg,
      hybridMode: "independent-secret-combiner-v1",
      enc: b64e(new Uint8Array(sender.enc)), /* FIX-2: sender.enc is an ArrayBuffer in @hpke/core 1.9.0 */
      cSeedC: b64e(new Uint8Array(cSeedC)), /* FIX-3: sender.seal() returns an ArrayBuffer */
      kemCt: b64e(kem.cipherText),
      cSeedPq: b64e(pqSealed.ct),
      ivPq: b64e(pqSealed.iv),
      iv: b64e(contentSealed.iv),
      ct: b64e(contentSealed.ct),
      bindTag,
    };
  } finally {
    zeroize(S_C);
    zeroize(S_PQ);
    zeroize(sharedSecret);
    zeroize(wrapKey);
    zeroize(CK);
  }
}

export async function hybridOpenBy(identity, sealed) {
  _requireIdentity(identity);
  if (!sealed || sealed.alg !== PROTOCOL.hybridAlg)
    throw new VHCryptoError("VH: unknown hybrid algorithm: " + sealed?.alg);
  if (sealed.hybridMode !== "independent-secret-combiner-v1")
    throw new VHCryptoError("VH: unsupported hybrid mode: " + sealed?.hybridMode);
  if (!sealed.bindTag || typeof sealed.bindTag !== "string")
    throw new VHCryptoError("VH: missing binding tag");

  const bindTag = sealed.bindTag;
  let S_C = null;
  let S_PQ = null;
  let ssPq = null;
  let wrapKey = null;
  let CK = null;

  try {
    // Recover the classical-side secret.
    const recip = await HPKE.createRecipientContext({
      recipientKey: identity.hpke.privateKey,
      enc: b64d(sealed.enc),
    });
    S_C = new Uint8Array(await recip.open(b64d(sealed.cSeedC)));

    // Recover the PQ-side secret.
    ssPq = ml_kem768.decapsulate(b64d(sealed.kemCt), identity.pq.secretKey);
    wrapKey = await hkdfSha256(
      new Uint8Array(ssPq),
      "VH-PQ-WRAP-v3",
      `selfimpulse/0.10.3/wrap|${bindTag}`,
      32,
    );
    S_PQ = await _aesGcmOpen(
      wrapKey,
      b64d(sealed.ivPq),
      b64d(sealed.cSeedPq),
      `VH-PQ-WRAP-v3|${bindTag}`,
    );

    // Both independent secrets are mandatory inputs to the final content key.
    const combined = new Uint8Array(S_C.length + S_PQ.length);
    combined.set(S_C, 0);
    combined.set(S_PQ, S_C.length);
    try {
      CK = await hkdfSha256(
        combined,
        "VH-HYBRID-COMBINE-v3",
        `selfimpulse/0.10.3/content|${bindTag}`,
        32,
      );
    } finally {
      zeroize(combined);
    }

    return await _aesGcmOpen(
      CK,
      b64d(sealed.iv),
      b64d(sealed.ct),
      `${PROTOCOL.hybridAlg}|${bindTag}`,
    );
  } finally {
    zeroize(S_C);
    zeroize(S_PQ);
    zeroize(ssPq);
    zeroize(wrapKey);
    zeroize(CK);
  }
}

/* ═══════════════════════════ L7 · RFC 6962 MERKLE TREE ═════════════════════ */

const LEAF_PREFIX = new Uint8Array([0x00]);
const NODE_PREFIX = new Uint8Array([0x01]);

async function _leafHash(chunk) {
  const d = new Uint8Array(1 + chunk.length);
  d.set(LEAF_PREFIX, 0); d.set(chunk, 1);
  return sha256(d);
}

async function _nodeHash(left, right) {
  const d = new Uint8Array(1 + left.length + right.length);
  d.set(NODE_PREFIX, 0); d.set(left, 1); d.set(right, 1 + left.length);
  return sha256(d);
}

function _splitPoint(n) { let k = 1; while (k < n) k <<= 1; return k >> 1; }

async function _mth(leaves) {
  if (leaves.length === 0) return sha256(new Uint8Array(0));
  if (leaves.length === 1) return _leafHash(leaves[0]);
  const k = _splitPoint(leaves.length);
  return _nodeHash(await _mth(leaves.slice(0, k)), await _mth(leaves.slice(k)));
}

export async function merkleRoot(chunks) {
  if (!Array.isArray(chunks)) throw new VHCryptoError("merkleRoot: expected array");
  return bytesToHex(await _mth(chunks));
}

export async function merkleProof(chunks, index) {
  if (!Array.isArray(chunks) || chunks.length === 0) throw new VHCryptoError("merkleProof: empty chunks");
  if (!Number.isInteger(index) || index < 0 || index >= chunks.length)
    throw new VHCryptoError("merkleProof: index out of range");
  const path = [];
  async function auditPath(leaves, m) {
    if (leaves.length === 1) return;
    const k = _splitPoint(leaves.length);
    if (m < k) { await auditPath(leaves.slice(0, k), m); path.push({ hash: bytesToHex(await _mth(leaves.slice(k))), side: "right" }); }
    else        { await auditPath(leaves.slice(k), m - k); path.push({ hash: bytesToHex(await _mth(leaves.slice(0, k))), side: "left" }); }
  }
  await auditPath(chunks, index);
  return { index, path };
}

export async function verifyMerkleProof(rootHex, chunk, proof) {
  if (typeof rootHex !== "string" || rootHex.length !== 64)
    throw new VHCryptoError("verifyMerkleProof: invalid rootHex");
  if (!proof?.path) throw new VHCryptoError("verifyMerkleProof: invalid proof");
  let cur = await _leafHash(chunk);
  for (const step of proof.path) {
    if (typeof step.hash !== "string" || step.hash.length !== 64) return false;
    const s = hexToBytes(step.hash);
    cur = step.side === "right" ? await _nodeHash(cur, s) : await _nodeHash(s, cur);
  }
  return bytesToHex(cur) === rootHex;
}

/* ═══════════════════════════ VH-VAULT TRANSFER ═════════════════════════════ */

export async function vaultPack(recipientBundle, data, { chunkSize = 256 * 1024 } = {}) {
  if (!recipientBundle?.hpkePub) throw new VHCryptoError("vaultPack: invalid recipient bundle");
  if (chunkSize < 1024 || chunkSize > 64 * 1024 * 1024)
    throw new VHCryptoError("vaultPack: chunkSize out of range");
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  if (!(bytes instanceof Uint8Array)) throw new VHCryptoError("vaultPack: data must be string or Uint8Array");

  const CK     = randomBytes(32);
  const header = await hybridSealFor(recipientBundle, CK);
  const chunksPlain = [];
  const chunks      = [];
  for (let off = 0; off < bytes.length || off === 0; off += chunkSize) {
    const piece = bytes.subarray(off, Math.min(off + chunkSize, bytes.length));
    chunksPlain.push(piece);
    const s = await _aesGcmSeal(CK, piece, `${PROTOCOL.vaultAlg}|chunk:${chunks.length}`);
    chunks.push({ iv: b64e(s.iv), ct: b64e(s.ct) });
    if (bytes.length === 0) break;
  }
  zeroize(CK);
  return {
    alg: PROTOCOL.vaultAlg, header,
    manifest: { v: 2, size: bytes.length, chunkSize, leaves: chunksPlain.length,
                sha256: await sha256Hex(bytes), merkleRoot: await merkleRoot(chunksPlain), alg: PROTOCOL.vaultAlg },
    chunks,
  };
}

export async function vaultUnpack(identity, packed) {
  _requireIdentity(identity);
  if (!packed || packed.alg !== PROTOCOL.vaultAlg)
    throw new VHCryptoError("VH: unknown vault algorithm: " + packed?.alg);
  const CK    = await hybridOpenBy(identity, packed.header);
  const parts = [];
  for (let i = 0; i < packed.chunks.length; i++) {
    const c = packed.chunks[i];
    parts.push(await _aesGcmOpen(CK, b64d(c.iv), b64d(c.ct), `${PROTOCOL.vaultAlg}|chunk:${i}`));
  }
  zeroize(CK);
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out   = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  if (await sha256Hex(out) !== packed.manifest.sha256)
    throw new VHCryptoError("VH: vault content hash mismatch");
  if (await merkleRoot(parts) !== packed.manifest.merkleRoot)
    throw new VHCryptoError("VH: vault merkle root mismatch");
  return { data: out, manifest: packed.manifest };
}
