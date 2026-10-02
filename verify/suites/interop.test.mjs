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

// probe/interop.test.ts
import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

// probe/interop.test.ts
var root = ".".length > 0 ? path.resolve(".") : path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
var cli = path.join(root, "tools", "si-interop.mjs");
function memStore() {
  const map = /* @__PURE__ */ new Map();
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => {
    map.set(k, v);
  } };
}
function runCli(args) {
  try {
    const stdout = execFileSync(process.execPath, [cli, ...args], {
      encoding: "utf8",
      timeout: 6e4,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { code: 0, stdout, stderr: "" };
  } catch (e) {
    const err = e;
    return {
      code: err.status ?? -1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? ""
    };
  }
}
describe("interop \u2014 two machines, one trust chain (17.6.2)", () => {
  it("machine A (TS runtime) \u2192 transport files \u2192 machine B (JS CLI): the whole chain verifies", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "machine-a");
    assert.equal(idA.ok, true);
    if (!idA.ok) return;
    const rc = await buildChainedReceipt({
      mission: "interop-mission",
      teamId: "two-machine",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "17.6.2",
      edition: "interop",
      events: [
        { kind: "mission.start", seatId: null, data: { objective: "cross the machine boundary" } },
        { kind: "tool.call", seatId: "seat-1", data: { tool: "shell_exec", governed: true } },
        { kind: "mission.done", seatId: null, data: { verified: true } }
      ]
    });
    const anchored = await anchorReceipt(rc, idA.value, "two-machine-interop");
    assert.equal(anchored.ok, true, JSON.stringify(anchored));
    if (!anchored.ok) return;
    fs.writeFileSync(path.join(transport, "receipt.jsonl"), receiptToJsonl(rc));
    fs.writeFileSync(path.join(transport, "anchor-envelope.json"), JSON.stringify(anchored.value.env, null, 2));
    fs.writeFileSync(path.join(transport, "signer-public.json"), JSON.stringify(idA.value.publicJwk, null, 2));
    const vr = runCli(["verify-receipt", path.join(transport, "receipt.jsonl")]);
    assert.equal(vr.code, 0, `verify-receipt failed: ${vr.stderr}`);
    assert.equal(JSON.parse(vr.stdout).head, anchored.value.head, "machine B sees the SAME chain head");
    const seen = path.join(transport, "seen.json");
    const ve = runCli([
      "verify-envelope",
      path.join(transport, "anchor-envelope.json"),
      "--signer-jwk",
      path.join(transport, "signer-public.json"),
      "--seen",
      seen
    ]);
    assert.equal(ve.code, 0, `verify-envelope failed: ${ve.stderr}`);
    const opened = JSON.parse(ve.stdout);
    assert.equal(opened.agent.fp, idA.value.fp, "machine B attributes the proof to machine A's signer");
  });
  it("replay at machine B: the same envelope is ONE-TIME evidence", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "machine-a");
    if (!idA.ok) throw new Error("identity");
    const rc = await buildChainedReceipt({
      mission: "replay-mission",
      teamId: "t",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "17.6.2",
      edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "mission.done", seatId: null, data: { verified: true } }]
    });
    const anchored = await anchorReceipt(rc, idA.value);
    if (!anchored.ok) throw new Error("anchor");
    fs.writeFileSync(path.join(transport, "env.json"), JSON.stringify(anchored.value.env));
    fs.writeFileSync(path.join(transport, "pub.json"), JSON.stringify(idA.value.publicJwk));
    const seen = path.join(transport, "seen.json");
    const first = runCli(["verify-envelope", path.join(transport, "env.json"), "--signer-jwk", path.join(transport, "pub.json"), "--seen", seen]);
    assert.equal(first.code, 0, first.stderr);
    const second = runCli(["verify-envelope", path.join(transport, "env.json"), "--signer-jwk", path.join(transport, "pub.json"), "--seen", seen]);
    assert.equal(second.code, 1, "second presentation must be refused");
    assert.match(second.stderr, /replayed-envelope/);
  });
  it("transport tampering is refused IN WORDS at machine B", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "machine-a");
    if (!idA.ok) throw new Error("identity");
    const rc = await buildChainedReceipt({
      mission: "tamper-mission",
      teamId: "t",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "17.6.2",
      edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "mission.done", seatId: null, data: { verified: true } }]
    });
    const anchored = await anchorReceipt(rc, idA.value);
    if (!anchored.ok) throw new Error("anchor");
    const env = { ...anchored.value.env, p: anchored.value.env.p.replace('"result":"success"', '"result":"forged"') };
    fs.writeFileSync(path.join(transport, "env.json"), JSON.stringify(env));
    fs.writeFileSync(path.join(transport, "pub.json"), JSON.stringify(idA.value.publicJwk));
    const res = runCli(["verify-envelope", path.join(transport, "env.json"), "--signer-jwk", path.join(transport, "pub.json")]);
    assert.equal(res.code, 1, "tampered envelope must be refused");
    assert.match(res.stderr, /bad-signature/);
  });
  it("a tampered receipt in transit is refused by machine B's rulebook", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const rc = await buildChainedReceipt({
      mission: "receipt-tamper",
      teamId: "t",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "17.6.2",
      edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "tool.call", seatId: "s", data: { tool: "shell_exec" } }, { kind: "mission.done", seatId: null, data: { verified: true } }]
    });
    const jsonl = receiptToJsonl(rc);
    const lines = jsonl.split("\n");
    const ev = JSON.parse(lines[2]);
    ev.data = { tool: "evil_tool" };
    lines[2] = JSON.stringify(ev);
    fs.writeFileSync(path.join(transport, "receipt.jsonl"), lines.join("\n"));
    const res = runCli(["verify-receipt", path.join(transport, "receipt.jsonl")]);
    assert.equal(res.code, 1, "tampered receipt must be refused");
    assert.match(res.stderr, /REFUSED/);
  });
  it("the transport-pack command ships the machine boundary as files", async () => {
    const transport = fs.mkdtempSync(path.join(os.tmpdir(), "si-interop-"));
    const idA = await loadOrCreateCrossSelfImpulseIdentity(memStore(), "packer");
    if (!idA.ok) throw new Error("identity");
    const rc = await buildChainedReceipt({
      mission: "pack-mission",
      teamId: "t",
      startedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      version: "17.6.2",
      edition: "interop",
      events: [{ kind: "mission.start", seatId: null, data: {} }, { kind: "mission.done", seatId: null, data: { verified: true } }]
    });
    const anchored = await anchorReceipt(rc, idA.value);
    if (!anchored.ok) throw new Error("anchor");
    const r = path.join(transport, "r.jsonl");
    const e = path.join(transport, "e.json");
    const k = path.join(transport, "k.json");
    fs.writeFileSync(r, receiptToJsonl(rc));
    fs.writeFileSync(e, JSON.stringify(anchored.value.env));
    fs.writeFileSync(k, JSON.stringify(idA.value.publicJwk));
    const out = path.join(transport, "pack");
    const res = runCli(["transport-pack", "--receipt", r, "--env", e, "--signer-jwk", k, "--out", out]);
    assert.equal(res.code, 0, res.stderr);
    for (const f of ["receipt.jsonl", "anchor-envelope.json", "signer-public.json", "MANIFEST.txt"]) {
      assert.ok(fs.existsSync(path.join(out, f)), `pack carries ${f}`);
    }
    const ve = runCli(["verify-envelope", path.join(out, "anchor-envelope.json"), "--signer-jwk", path.join(out, "signer-public.json")]);
    assert.equal(ve.code, 0, ve.stderr);
  });
});
