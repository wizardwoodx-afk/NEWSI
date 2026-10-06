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

// probe/enforcement.test.ts
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

// probe/enforcement.test.ts
var ROOT = ".".length > 0 ? "." : process.cwd();
var read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
var now = (/* @__PURE__ */ new Date()).toISOString();
describe("F16 \u2014 issuer signatures are verified on every wire format", () => {
  it("the module mints the current format", async () => {
    const rc = await buildChainedReceipt({
      mission: "enforcement-f16",
      teamId: "probe",
      startedAt: now,
      finishedAt: now,
      version: "probe",
      edition: "personal",
      events: [{ kind: "probe.event", seatId: "s1", data: { hello: "f16" } }]
    });
    assert.equal(rc.format, "si-proof-receipt/2");
  });
  it("a forged signature on si-proof-receipt/2 is REJECTED", async () => {
    const rc = await buildChainedReceipt({
      mission: "enforcement-f16",
      teamId: "probe",
      startedAt: now,
      finishedAt: now,
      version: "probe",
      edition: "personal",
      events: [{ kind: "probe.event", seatId: "s1", data: { hello: "f16" } }]
    });
    const forged = {
      ...rc,
      signature: "ab".repeat(64),
      issuer: { keyId: "forged-key", publicKeyHex: "cd".repeat(32) }
    };
    const v = await verifyProofReceipt(forged);
    assert.equal(v.ok, false, "a forged signature must not verify on the current wire format");
  });
  it("a signed receipt with no issuer key is rejected", async () => {
    const rc = await buildChainedReceipt({
      mission: "enforcement-f16b",
      teamId: "probe",
      startedAt: now,
      finishedAt: now,
      version: "probe",
      edition: "personal",
      events: [{ kind: "probe.event", seatId: "s1", data: {} }]
    });
    const { issuer: _omit, ...noIssuer } = rc;
    const v = await verifyProofReceipt({ ...noIssuer, signature: "ab".repeat(64) });
    assert.equal(v.ok, false);
  });
});
describe("F17 \u2014 one outcome classifier, denials never read as success", () => {
  const store = read("src/ui/store.ts");
  it("receiptStateFor exists and is the only classifier", () => {
    assert.match(store, /export function receiptStateFor/, "no shared classifier");
    assert.ok(!/\/refus\|denied\|blocked\//.test(store), "the old ad-hoc regex is still in store.ts");
    assert.ok(!/outcome === "refused" \? "refused" : "ok"/.test(store), "an inline outcome comparison is still present");
  });
  it("all three ledger rows route through it", () => {
    assert.equal(
      (store.match(/receiptStateFor\(/g) ?? []).length >= 3,
      true,
      "run, tool and handoff rows must share one classifier"
    );
  });
  it("gated-out and error are named states, not successes", () => {
    assert.match(store, /"gated-out"/, "gated-out is not handled");
    assert.match(store, /ReceiptState = "ok" \| "pending" \| "refused" \| "error"/, "the error state is missing");
  });
  it("gate decisions are recorded on both branches", () => {
    assert.match(store, /gateLog/, "gate decisions are still discarded");
    assert.match(store, /decision: d\.approved \? "approved" : "refused"/, "the decision is not persisted");
  });
  it("the KPI no longer claims verification it does not perform", () => {
    const receipts = read("src/ui/screens/Receipts.tsx");
    assert.ok(
      !/<span>Verified<\/span>/.test(receipts),
      'a count of state==="ok" rows is being presented as "Verified"'
    );
  });
});
describe("F5a \u2014 egress policy guards every outbound URL", () => {
  it("wiki.search checks the URL it actually fetches", () => {
    const src = read("src/engine/tools.ts");
    const fn = src.slice(src.indexOf("async function execWikiSearch"));
    const guard = fn.indexOf("checkEgressUrl(");
    const fetch = fn.indexOf("await doFetch(");
    assert.ok(guard > -1, "execWikiSearch has no egress guard");
    assert.ok(fetch > -1);
    assert.ok(guard < fetch, "the egress guard runs after the fetch \u2014 that is not a guard");
  });
  it("net.fetch is still guarded", () => {
    assert.match(read("src/engine/tools.ts"), /const egress = checkEgressUrl\(url\)/);
  });
});
describe("F5b \u2014 an autonomy grant cannot open the gate for other domains", () => {
  it("the grant must cover every routed specialist", () => {
    const src = read("src/engine/generalist.ts");
    assert.ok(
      !/autonomyCovers\(userId, primaryCategory\)/.test(src),
      "autonomy is still decided from a single specialist"
    );
    assert.match(src, /specialists\.every\(\(s\) => autonomyCovers\(userId, s\.category\)\)/);
  });
  it("worstTier still spans the whole routing", () => {
    assert.match(read("src/engine/generalist.ts"), /const worstTier = specialists\.some\(\(s\) => s\.riskTier === "critical"\)/);
  });
});
describe("F18 \u2014 the theme resolves before the first paint", () => {
  it("index.html sets data-theme before the app script runs", () => {
    const html = read("index.html");
    const store = read("src/ui/store.ts");
    const def = store.match(/DEFAULT_THEME(?:\s*:\s*[^=]+)?\s*=\s*"([a-z0-9-]+)"/)?.[1] ?? "";
    assert.ok(def.length > 0, "store.ts declares DEFAULT_THEME");
    assert.ok(new RegExp(`<html lang="en" data-theme="${def}">`).test(html), `no server-side default theme (${def})`);
    const boot = html.indexOf("dataset.theme");
    const app = html.indexOf('src="/src/main.tsx"');
    assert.ok(boot > -1 && boot < app, "the theme is resolved after the app boots");
  });
  it("colour tokens are only defined under [data-theme=...]", () => {
    const css = read("src/ui/vh.css");
    const rootBlock = css.slice(css.indexOf(":root{"), css.indexOf("}", css.indexOf(":root{")));
    assert.ok(
      !/--fg:/.test(rootBlock),
      ":root now carries colour tokens \u2014 revisit whether the boot guard is still required"
    );
  });
});
