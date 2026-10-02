import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/selfimpulse/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  isNativeHost: () => isNativeHost
});
function isNativeHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
var invoke, ipc;
var init_client = __esm({
  "src/selfimpulse/ipc/client.ts"() {
    "use strict";
    invoke = (cmd, args) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals) throw new Error("not in the native host \u2014 no __TAURI_INTERNALS__");
      return internals.invoke(cmd, args);
    };
    ipc = {
      async secretGet(secretRef) {
        return await invoke("secret_get", { secretRef });
      },
      async secretSet(secretRef, value) {
        return await invoke("secret_set", { secretRef, value });
      },
      async notifyApproval(title, body) {
        await invoke("notify_approval", { title, body });
      },
      async appInfo() {
        return await invoke("app_info");
      }
    };
  }
});

// probe/crossSelfImpulse.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";

// src/selfimpulse/engine/signing.ts
var STORAGE_KEY = "selfimpulse.issuerkey.v1";
var KEYCHAIN_REF = "selfimpulse.issuerkey.v1";
async function keychainBridge() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { ipc: ipc2 } = await Promise.resolve().then(() => (init_client(), client_exports));
    return {
      get: async () => {
        try {
          const r = await ipc2.secretGet(KEYCHAIN_REF);
          return r.present && r.value ? r.value : null;
        } catch {
          return null;
        }
      },
      set: async (json) => {
        try {
          const r = await ipc2.secretSet(KEYCHAIN_REF, json);
          return Boolean(r.stored);
        } catch {
          return false;
        }
      }
    };
  } catch {
    return null;
  }
}
var cached = null;
function toHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(hex) {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function ed25519Available() {
  try {
    return typeof crypto !== "undefined" && Boolean(crypto.subtle) && typeof crypto.subtle.generateKey === "function";
  } catch {
    return false;
  }
}
async function ensureIssuerIdentity() {
  if (cached) return cached;
  if (!ed25519Available()) return null;
  const bridge = await keychainBridge();
  try {
    const raw = bridge ? await bridge.get() : globalThis.localStorage?.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      if (stored?.publicKeyHex && stored?.privateJwk) {
        const privateKey = await crypto.subtle.importKey("jwk", stored.privateJwk, { name: "Ed25519" }, true, ["sign"]);
        const identity = {
          keyId: `selfimpulse-issuer-${stored.publicKeyHex.slice(0, 12)}`,
          publicKeyHex: stored.publicKeyHex,
          createdAt: stored.createdAt ?? (/* @__PURE__ */ new Date(0)).toISOString()
        };
        cached = { identity, privateKey };
        return cached;
      }
    }
  } catch {
  }
  try {
    const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
    const rawPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
    const publicKeyHex = toHex(rawPub);
    const identity = {
      keyId: `selfimpulse-issuer-${publicKeyHex.slice(0, 12)}`,
      publicKeyHex,
      createdAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
    const persisted = JSON.stringify({ publicKeyHex, privateJwk, createdAt: identity.createdAt });
    try {
      if (bridge) await bridge.set(persisted);
    } catch {
    }
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, persisted);
    } catch {
    }
    cached = { identity, privateKey: pair.privateKey };
    return cached;
  } catch {
    return null;
  }
}
async function signHexDigest(hexDigest) {
  const holder = await ensureIssuerIdentity();
  if (!holder) return null;
  try {
    const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, holder.privateKey, fromHex(hexDigest)));
    return { alg: "EdDSA", keyId: holder.identity.keyId, publicKeyHex: holder.identity.publicKeyHex, sigHex: toHex(sig) };
  } catch {
    return null;
  }
}
async function signChainHash(chainHashHex) {
  return signHexDigest(chainHashHex);
}
async function verifyIssuerSignature(chainHashHex, sigHex, publicKeyHex) {
  if (!ed25519Available()) return false;
  try {
    const publicKey = await crypto.subtle.importKey("raw", fromHex(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, publicKey, fromHex(sigHex), fromHex(chainHashHex));
  } catch {
    return false;
  }
}

// src/selfimpulse/engine/proof.ts
var VERIFY_SECRET = "si-commercial-v1-offline";
var LEGACY_SEAL_SECRET = "mj-commercial-v1-offline";
var SEAL_SECRET_BY_FORMAT = {
  "si-proof-receipt/2": VERIFY_SECRET,
  "mj-proof-receipt/2": LEGACY_SEAL_SECRET,
  "mj-proof-receipt/1": LEGACY_SEAL_SECRET
};
var enc = new TextEncoder();
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
var canon = (o) => JSON.stringify(sortDeep(o));
async function sha256hex(s) {
  const d = await crypto.subtle.digest("SHA-256", enc.encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hmacHex(s, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(s));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function buildChainedReceipt(args) {
  const header = {
    mission: args.mission,
    teamId: args.teamId,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    version: args.version,
    edition: args.edition,
    autonomyArms: []
  };
  const events = [];
  let prev = "0".repeat(64);
  let seq = 0;
  const chain = [
    { kind: "receipt.header", seatId: null, data: { ...header } },
    ...args.events
  ];
  for (const r of chain) {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    const body = { seq, ts, kind: r.kind, seatId: r.seatId, data: r.data, prev };
    const hash = await sha256hex(canon(body));
    events.push({ ...body, hash });
    prev = hash;
    seq += 1;
  }
  const seal = await hmacHex(prev, VERIFY_SECRET);
  const sig = await signChainHash(prev);
  if (sig) {
    return {
      format: "si-proof-receipt/2",
      header,
      events,
      seal,
      issuer: { keyId: sig.keyId, publicKeyHex: sig.publicKeyHex },
      signature: sig.sigHex
    };
  }
  return {
    format: "si-proof-receipt/2",
    header,
    events,
    seal,
    issuer: null,
    signature: null,
    signatureNote: "This runtime has no Ed25519 (WebCrypto refused or is absent). The receipt is tamper-evident via its HMAC seal but NOT issuer-signed."
  };
}
async function verifyProofReceipt(rc) {
  const sealSecret = SEAL_SECRET_BY_FORMAT[rc.format];
  if (!sealSecret) return { ok: false, reason: `unknown format ${rc.format}` };
  const bound = rc.events[0]?.kind === "receipt.header";
  const isCurrent = rc.format === "si-proof-receipt/2";
  if (isCurrent && !bound) {
    return {
      ok: false,
      reason: "receipt header is not bound to the signed chain \u2014 mission, teamId, edition and autonomyArms could be edited freely. A current-format receipt must begin with a receipt.header event."
    };
  }
  if (bound) {
    const h = rc.events[0].data;
    if (!h || h.mission !== rc.header?.mission || h.teamId !== rc.header?.teamId || h.edition !== rc.header?.edition) {
      return { ok: false, reason: "receipt header does not match the bound header event \u2014 the header was edited after signing" };
    }
  }
  let prev = "0".repeat(64);
  for (const e of rc.events) {
    if (e.prev !== prev) return { ok: false, reason: `chain broken at seq ${e.seq}` };
    const { hash, ...body } = e;
    const expect = await sha256hex(canon(body));
    if (expect !== hash) return { ok: false, reason: `hash mismatch at seq ${e.seq}` };
    prev = hash;
  }
  const seal = await hmacHex(prev, sealSecret);
  if (seal !== rc.seal) return { ok: false, reason: "seal mismatch" };
  if (rc.signature) {
    if (!rc.issuer?.publicKeyHex) return { ok: false, reason: "receipt is signed but carries no issuer public key" };
    const ok = await verifyIssuerSignature(prev, rc.signature, rc.issuer.publicKeyHex);
    if (!ok) return { ok: false, reason: `issuer signature verification FAILED for chain head ${prev}` };
  } else if (rc.format !== "mj-proof-receipt/1" && !rc.signatureNote) {
    return { ok: false, reason: "receipt is neither signed nor carries a signatureNote explaining why not" };
  }
  return { ok: true, events: rc.events.length, binding: bound ? "header-bound" : "legacy-unbound", signed: Boolean(rc.signature) };
}
function receiptToJsonl(rc) {
  const head = { receipt: rc.header, format: rc.format, seal: rc.seal };
  if (rc.issuer !== void 0) head.issuer = rc.issuer;
  if (rc.signature !== void 0) head.signature = rc.signature;
  if (rc.signatureNote !== void 0) head.signatureNote = rc.signatureNote;
  const lines = [JSON.stringify(head), ...rc.events.map((e) => JSON.stringify(e))];
  return `${lines.join("\n")}
`;
}
function receiptFromJsonl(text) {
  try {
    const lines = text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
    if (lines.length < 1) return null;
    const head = lines[0];
    if (!head.receipt || !head.seal) return null;
    const out = {
      format: head.format ?? "mj-proof-receipt/1",
      header: head.receipt,
      events: lines.slice(1),
      seal: head.seal
    };
    if (head.issuer !== void 0) out.issuer = head.issuer;
    if (head.signature !== void 0) out.signature = head.signature;
    if (head.signatureNote !== void 0) out.signatureNote = head.signatureNote;
    return out;
  } catch {
    return null;
  }
}

// src/version.ts
var ENGINE_VERSION = "19.7.15";
var ENGINE_SHORT = "19.7";
var ENGINE_CODENAME = "SelfImpulse";
var PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;

// src/selfimpulse/engine/crossSelfImpulse.ts
var subtle = globalThis.crypto?.subtle;
var ECDSA = { name: "ECDSA", namedCurve: "P-256" };
var ECDSA_SIGN = { name: "ECDSA", hash: "SHA-256" };
var IDENTITY_KEY = "selfimpulse.crossselfimpulse.identity.v1";
var ANCHOR_WINDOW_MS = 5 * 6e4;
var enc2 = new TextEncoder();
function b64e(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}
function b64d(s) {
  const bin = typeof Buffer !== "undefined" ? String.fromCharCode(...new Uint8Array(Buffer.from(s, "base64"))) : atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function fingerprintFromJwk(jwk) {
  if (!subtle) throw new Error("cross-selfimpulse identity requires WebCrypto");
  const stable = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y });
  const h = Array.from(new Uint8Array(await subtle.digest("SHA-256", enc2.encode(stable)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 16).toUpperCase().match(/.{4}/g).join("-");
}
async function selfTest(privateKey, publicJwk) {
  if (!subtle) return false;
  try {
    const msg = enc2.encode("SI-CROSS-SELFIMPULSE-SELFTEST-v1");
    const sig = await subtle.sign(ECDSA_SIGN, privateKey, msg);
    const pub = await subtle.importKey("jwk", publicJwk, ECDSA, false, ["verify"]);
    return await subtle.verify(ECDSA_SIGN, pub, sig, msg);
  } catch {
    return false;
  }
}
async function loadOrCreateCrossSelfImpulseIdentity(store, name = "patina-agent") {
  if (!subtle) return { ok: false, reason: "runtime has no WebCrypto \u2014 cannot hold a cross-selfimpulse identity" };
  let raw = null;
  try {
    raw = store.get(IDENTITY_KEY);
  } catch (e) {
    return { ok: false, reason: `identity store refused the read: ${e.message}` };
  }
  if (raw) {
    try {
      const rec = JSON.parse(raw);
      const privateKey = await subtle.importKey("jwk", rec.privateJwk, ECDSA, true, ["sign"]);
      if (!await selfTest(privateKey, rec.publicJwk))
        return { ok: false, reason: "cross-selfimpulse identity keypair mismatch: stored public key does not match private key" };
      return { ok: true, value: { fp: await fingerprintFromJwk(rec.publicJwk), name, publicKey: await subtle.importKey("jwk", rec.publicJwk, ECDSA, false, ["verify"]), privateKey, publicJwk: rec.publicJwk } };
    } catch (e) {
      return { ok: false, reason: `cross-selfimpulse identity unreadable: ${e.message}` };
    }
  }
  const kp = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  const publicJwk = await subtle.exportKey("jwk", kp.publicKey);
  const privateJwk = await subtle.exportKey("jwk", kp.privateKey);
  if (!await selfTest(kp.privateKey, publicJwk))
    return { ok: false, reason: "freshly generated cross-selfimpulse identity failed self-test" };
  try {
    store.set(IDENTITY_KEY, JSON.stringify({ v: 1, publicJwk, privateJwk, createdAt: (/* @__PURE__ */ new Date()).toISOString() }));
  } catch (e) {
    return { ok: false, reason: `identity store refused the write: ${e.message}` };
  }
  return { ok: true, value: { fp: await fingerprintFromJwk(publicJwk), name, publicKey: kp.publicKey, privateKey: kp.privateKey, publicJwk } };
}
async function sha256HexLatin1(publicKeyHex) {
  const raw = publicKeyHex.match(/../g).map((h2) => parseInt(h2, 16));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw[i];
  const h = Array.from(new Uint8Array(await subtle.digest("SHA-256", bytes))).map((b) => b.toString(16).padStart(2, "0")).join("");
  return h.slice(0, 16);
}
function anchorEvidence(rc, head, issuerFp) {
  const issuer = rc.signature && issuerFp ? `issuer:${issuerFp}` : "issuer:unsigned";
  return `receipt:${rc.format}:head:${head}:events:${rc.events.length}:seal:ok:${issuer}`;
}
async function anchorReceipt(rc, identity, purpose = "cross-org-proof-anchoring") {
  if (!subtle) return { ok: false, reason: "runtime has no WebCrypto \u2014 cannot anchor" };
  const verdict = await verifyProofReceipt(rc);
  if (!verdict.ok) return { ok: false, reason: `receipt:${verdict.reason}` };
  if (rc.events.length === 0) return { ok: false, reason: "receipt:empty chain" };
  const head = rc.events[rc.events.length - 1].hash;
  const issuerFp = rc.signature && rc.issuer?.publicKeyHex ? await sha256HexLatin1(rc.issuer.publicKeyHex) : null;
  const evidence = anchorEvidence(rc, head, issuerFp);
  const fact = {
    v: 2,
    kind: "agent_action",
    agent: { n: identity.name.slice(0, 60), fp: identity.fp },
    action: "anchor_receipt",
    tool: "si-cross-selfimpulse",
    purpose: purpose.slice(0, 200),
    policy: null,
    evidence: evidence.slice(0, 2e3),
    result: "success",
    ts: Date.now()
  };
  const p = JSON.stringify(fact);
  if (!globalThis.crypto?.getRandomValues) return { ok: false, reason: "runtime has no CSPRNG" };
  const n = Array.from(new Uint8Array(globalThis.crypto.getRandomValues(new Uint8Array(16)))).map((b) => b.toString(16).padStart(2, "0")).join("");
  const ts = Date.now();
  const sig = b64e(await subtle.sign(ECDSA_SIGN, identity.privateKey, enc2.encode(`${p}|${n}|${ts}`)));
  return { ok: true, value: { env: { p, n, ts, sig }, fact, head, events: rc.events.length, evidence, protocolVersion: ENGINE_VERSION } };
}
async function anchorReceiptJsonl(jsonl, identity, purpose) {
  const rc = receiptFromJsonl(jsonl);
  if (!rc) return { ok: false, reason: "receipt:unparseable JSONL" };
  return anchorReceipt(rc, identity, purpose);
}
function memoryReplayLedger(limit = 4096) {
  const seen = /* @__PURE__ */ new Set();
  const order = [];
  return {
    has: (n) => seen.has(n),
    add: (n) => {
      if (seen.has(n)) return;
      seen.add(n);
      order.push(n);
      while (order.length > limit) seen.delete(order.shift());
    }
  };
}
async function verifyAnchorEnvelope(env, signerPublicJwk, opts = {}) {
  const now = opts.now ?? Date.now();
  if (!subtle) return { ok: false, reason: "runtime has no WebCrypto" };
  if (!env || typeof env.p !== "string" || typeof env.n !== "string" || typeof env.ts !== "number")
    return { ok: false, reason: "malformed-envelope" };
  if (env.n.length < 16 || env.n.length > 64) return { ok: false, reason: "invalid-nonce-length" };
  if (Math.abs(now - env.ts) > ANCHOR_WINDOW_MS) return { ok: false, reason: "stale-envelope" };
  if (opts.replay?.has(env.n)) return { ok: false, reason: "replayed-envelope" };
  let verified = false;
  try {
    const key = await subtle.importKey("jwk", signerPublicJwk, ECDSA, false, ["verify"]);
    verified = await subtle.verify(ECDSA_SIGN, key, b64d(env.sig), enc2.encode(`${env.p}|${env.n}|${env.ts}`));
  } catch {
    verified = false;
  }
  if (!verified) return { ok: false, reason: "bad-signature" };
  let fact;
  try {
    fact = JSON.parse(env.p);
  } catch {
    return { ok: false, reason: "unparseable-payload" };
  }
  if (fact.kind !== "agent_action" || fact.action !== "anchor_receipt")
    return { ok: false, reason: "not-an-anchor-fact" };
  opts.replay?.add(env.n);
  return { ok: true, fact };
}

// probe/crossSelfImpulse.test.ts
function memStore() {
  const map = /* @__PURE__ */ new Map();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => {
    map.set(k, v);
  } };
}
async function sampleReceipt(tamper = false) {
  const rc = await buildChainedReceipt({
    mission: "cross-selfimpulse-probe",
    teamId: "probe-team",
    startedAt: (/* @__PURE__ */ new Date()).toISOString(),
    finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
    version: "17.6.2",
    edition: "probe",
    events: [
      { kind: "mission.start", seatId: null, data: { objective: "anchor me" } },
      { kind: "tool.call", seatId: "seat-1", data: { tool: "shell_exec", governed: true } },
      { kind: "mission.done", seatId: null, data: { verified: true } }
    ]
  });
  if (tamper && rc.events.length > 1) {
    rc.events[1].data = { tool: "evil" };
  }
  return rc;
}
describe("crossSelfImpulse \u2014 the Patina \u21C4 Protocol runtime join (17.6.2)", () => {
  it("identity seam: create \u2192 persist \u2192 reload, self-tested, fp grouped", async () => {
    const store = memStore();
    const first = await loadOrCreateCrossSelfImpulseIdentity(store, "probe-agent");
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.match(first.value.fp, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    assert.ok(store.map.has(IDENTITY_KEY), "identity persisted through the injected seam");
    const again = await loadOrCreateCrossSelfImpulseIdentity(store, "probe-agent");
    assert.equal(again.ok, true);
    if (again.ok) assert.equal(again.value.fp, first.value.fp, "reload returns the same identity");
  });
  it("identity seam: a corrupted store refuses IN WORDS", async () => {
    const store = memStore();
    await loadOrCreateCrossSelfImpulseIdentity(store);
    const rec = JSON.parse(store.map.get(IDENTITY_KEY));
    rec.publicJwk = { ...rec.publicJwk, x: "AAAA" + rec.publicJwk.x.slice(4) };
    store.map.set(IDENTITY_KEY, JSON.stringify(rec));
    const res = await loadOrCreateCrossSelfImpulseIdentity(store);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.reason, /keypair mismatch/);
  });
  it("a REAL sealed receipt anchors into a signer-bound envelope", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store, "probe-agent");
    assert.equal(id.ok, true);
    if (!id.ok) return;
    const rc = await sampleReceipt();
    const anchored = await anchorReceipt(rc, id.value);
    assert.equal(anchored.ok, true, JSON.stringify(anchored));
    if (!anchored.ok) return;
    const { env, fact, head, evidence } = anchored.value;
    assert.match(head, /^[0-9a-f]{64}$/);
    assert.ok(evidence.includes(`head:${head}`), "evidence binds the verified chain head");
    assert.ok(/^receipt:si-proof-receipt\/2:head:[0-9a-f]{64}:events:4:seal:ok:issuer:([0-9a-f]{16}|unsigned)$/.test(evidence), `evidence was: ${evidence}`);
    assert.equal(fact.action, "anchor_receipt");
    assert.equal(fact.agent.fp, id.value.fp, "signer == actor");
    const opened = await verifyAnchorEnvelope(env, id.value.publicJwk);
    assert.equal(opened.ok, true, JSON.stringify(opened));
  });
  it("JSONL round-trip: the Register export format anchors unchanged", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const rc = await sampleReceipt();
    const anchored = await anchorReceiptJsonl(receiptToJsonl(rc), id.value);
    assert.equal(anchored.ok, true, JSON.stringify(anchored));
  });
  it("tampered receipts are refused in words \u2014 never anchored", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const rc = await sampleReceipt(true);
    const res = await anchorReceipt(rc, id.value);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.reason, /^receipt:/);
  });
  it("tampered envelopes and wrong signers are rejected", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const other = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "impostor");
    if (!other.ok) throw new Error("impostor identity");
    const rc = await sampleReceipt();
    const anchored = await anchorReceipt(rc, id.value);
    if (!anchored.ok) throw new Error("anchor");
    const forged = { ...anchored.value.env, p: anchored.value.env.p.replace("success", "failure") };
    const bad = await verifyAnchorEnvelope(forged, id.value.publicJwk);
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, "bad-signature");
    const wrongKey = await verifyAnchorEnvelope(anchored.value.env, other.value.publicJwk);
    assert.equal(wrongKey.ok, false, "a different signer must not verify the envelope");
  });
  it("17.6.2: an envelope is ONE-TIME evidence \u2014 replays are refused", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const rc = await sampleReceipt();
    const anchored = await anchorReceipt(rc, id.value);
    if (!anchored.ok) throw new Error("anchor");
    const ledger = memoryReplayLedger();
    const first = await verifyAnchorEnvelope(anchored.value.env, id.value.publicJwk, { replay: ledger });
    assert.equal(first.ok, true, "first presentation verifies");
    const second = await verifyAnchorEnvelope(anchored.value.env, id.value.publicJwk, { replay: ledger });
    assert.equal(second.ok, false);
    assert.equal(second.reason, "replayed-envelope");
  });
  it("17.6.2: the replay ledger is bounded \u2014 it cannot grow without limit", () => {
    const ledger = memoryReplayLedger(8);
    for (let i = 0; i < 100; i++) ledger.add(`nonce-${i}`);
    assert.equal(ledger.has("nonce-0"), false, "bounded: oldest nonce evicted");
    assert.equal(ledger.has("nonce-99"), true, "recent nonce still remembered");
  });
  it("fingerprints are deterministic for a given public key", async () => {
    const store = memStore();
    const id = await loadOrCreateCrossSelfImpulseIdentity(store);
    if (!id.ok) throw new Error("identity");
    const fp2 = await fingerprintFromJwk(id.value.publicJwk);
    assert.equal(fp2, id.value.fp);
  });
});
