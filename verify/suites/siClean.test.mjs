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

// node_modules/@tauri-apps/api/external/tslib/tslib.es6.js
function __classPrivateFieldGet(receiver, state, kind, f) {
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}
function __classPrivateFieldSet(receiver, state, value, kind, f) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
}
var init_tslib_es6 = __esm({
  "node_modules/@tauri-apps/api/external/tslib/tslib.es6.js"() {
  }
});

// node_modules/@tauri-apps/api/core.js
function transformCallback(callback, once = false) {
  return window.__TAURI_INTERNALS__.transformCallback(callback, once);
}
async function addPluginListener(plugin, event, cb) {
  const handler = new Channel(cb);
  try {
    await invoke(`plugin:${plugin}|register_listener`, {
      event,
      handler
    });
    return new PluginListener(plugin, event, handler.id);
  } catch {
    await invoke(`plugin:${plugin}|registerListener`, { event, handler });
    return new PluginListener(plugin, event, handler.id);
  }
}
async function invoke(cmd, args = {}, options) {
  return window.__TAURI_INTERNALS__.invoke(cmd, args, options);
}
var _Channel_onmessage, _Channel_nextMessageIndex, _Channel_pendingMessages, _Channel_messageEndIndex, _Resource_rid, SERIALIZE_TO_IPC_FN, Channel, PluginListener;
var init_core = __esm({
  "node_modules/@tauri-apps/api/core.js"() {
    init_tslib_es6();
    SERIALIZE_TO_IPC_FN = "__TAURI_TO_IPC_KEY__";
    Channel = class {
      constructor(onmessage) {
        _Channel_onmessage.set(this, void 0);
        _Channel_nextMessageIndex.set(this, 0);
        _Channel_pendingMessages.set(this, []);
        _Channel_messageEndIndex.set(this, void 0);
        __classPrivateFieldSet(this, _Channel_onmessage, onmessage || (() => {
        }), "f");
        this.id = transformCallback((rawMessage) => {
          const index = rawMessage.index;
          if ("end" in rawMessage) {
            if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
              this.cleanupCallback();
            } else {
              __classPrivateFieldSet(this, _Channel_messageEndIndex, index, "f");
            }
            return;
          }
          const message = rawMessage.message;
          if (index == __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")) {
            __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message);
            __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            while (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") in __classPrivateFieldGet(this, _Channel_pendingMessages, "f")) {
              const message2 = __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldGet(this, _Channel_onmessage, "f").call(this, message2);
              delete __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f")];
              __classPrivateFieldSet(this, _Channel_nextMessageIndex, __classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") + 1, "f");
            }
            if (__classPrivateFieldGet(this, _Channel_nextMessageIndex, "f") === __classPrivateFieldGet(this, _Channel_messageEndIndex, "f")) {
              this.cleanupCallback();
            }
          } else {
            __classPrivateFieldGet(this, _Channel_pendingMessages, "f")[index] = message;
          }
        });
      }
      cleanupCallback() {
        window.__TAURI_INTERNALS__.unregisterCallback(this.id);
      }
      set onmessage(handler) {
        __classPrivateFieldSet(this, _Channel_onmessage, handler, "f");
      }
      get onmessage() {
        return __classPrivateFieldGet(this, _Channel_onmessage, "f");
      }
      [(_Channel_onmessage = /* @__PURE__ */ new WeakMap(), _Channel_nextMessageIndex = /* @__PURE__ */ new WeakMap(), _Channel_pendingMessages = /* @__PURE__ */ new WeakMap(), _Channel_messageEndIndex = /* @__PURE__ */ new WeakMap(), SERIALIZE_TO_IPC_FN)]() {
        return `__CHANNEL__:${this.id}`;
      }
      toJSON() {
        return this[SERIALIZE_TO_IPC_FN]();
      }
    };
    PluginListener = class {
      constructor(plugin, event, channelId) {
        this.plugin = plugin;
        this.event = event;
        this.channelId = channelId;
      }
      async unregister() {
        return invoke(`plugin:${this.plugin}|remove_listener`, {
          event: this.event,
          channelId: this.channelId
        });
      }
    };
    _Resource_rid = /* @__PURE__ */ new WeakMap();
  }
});

// node_modules/@tauri-apps/plugin-notification/dist-js/index.js
var dist_js_exports = {};
__export(dist_js_exports, {
  Importance: () => Importance,
  Schedule: () => Schedule,
  ScheduleEvery: () => ScheduleEvery,
  Visibility: () => Visibility,
  active: () => active,
  cancel: () => cancel,
  cancelAll: () => cancelAll,
  channels: () => channels,
  createChannel: () => createChannel,
  isPermissionGranted: () => isPermissionGranted,
  onAction: () => onAction,
  onNotificationReceived: () => onNotificationReceived,
  pending: () => pending,
  registerActionTypes: () => registerActionTypes,
  removeActive: () => removeActive,
  removeAllActive: () => removeAllActive,
  removeChannel: () => removeChannel,
  requestPermission: () => requestPermission,
  sendNotification: () => sendNotification
});
async function isPermissionGranted() {
  if (window.Notification.permission !== "default") {
    return await Promise.resolve(window.Notification.permission === "granted");
  }
  return await invoke("plugin:notification|is_permission_granted");
}
async function requestPermission() {
  return await window.Notification.requestPermission();
}
function sendNotification(options) {
  if (typeof options === "string") {
    new window.Notification(options);
  } else {
    new window.Notification(options.title, options);
  }
}
async function registerActionTypes(types) {
  await invoke("plugin:notification|register_action_types", { types });
}
async function pending() {
  return await invoke("plugin:notification|get_pending");
}
async function cancel(notifications) {
  await invoke("plugin:notification|cancel", { notifications });
}
async function cancelAll() {
  await invoke("plugin:notification|cancel");
}
async function active() {
  return await invoke("plugin:notification|get_active");
}
async function removeActive(notifications) {
  await invoke("plugin:notification|remove_active", { notifications });
}
async function removeAllActive() {
  await invoke("plugin:notification|remove_active");
}
async function createChannel(channel) {
  await invoke("plugin:notification|create_channel", { ...channel });
}
async function removeChannel(id) {
  await invoke("plugin:notification|delete_channel", { id });
}
async function channels() {
  return await invoke("plugin:notification|listChannels");
}
async function onNotificationReceived(cb) {
  return await addPluginListener("notification", "notification", cb);
}
async function onAction(cb) {
  return await addPluginListener("notification", "actionPerformed", cb);
}
var ScheduleEvery, Schedule, Importance, Visibility;
var init_dist_js = __esm({
  "node_modules/@tauri-apps/plugin-notification/dist-js/index.js"() {
    init_core();
    (function(ScheduleEvery2) {
      ScheduleEvery2["Year"] = "year";
      ScheduleEvery2["Month"] = "month";
      ScheduleEvery2["TwoWeeks"] = "twoWeeks";
      ScheduleEvery2["Week"] = "week";
      ScheduleEvery2["Day"] = "day";
      ScheduleEvery2["Hour"] = "hour";
      ScheduleEvery2["Minute"] = "minute";
      ScheduleEvery2["Second"] = "second";
    })(ScheduleEvery || (ScheduleEvery = {}));
    Schedule = class {
      static at(date, repeating = false, allowWhileIdle = false) {
        return {
          at: { date, repeating, allowWhileIdle },
          interval: void 0,
          every: void 0
        };
      }
      static interval(interval, allowWhileIdle = false) {
        return {
          at: void 0,
          interval: { interval, allowWhileIdle },
          every: void 0
        };
      }
      static every(kind, count, allowWhileIdle = false) {
        return {
          at: void 0,
          interval: void 0,
          every: { interval: kind, count, allowWhileIdle }
        };
      }
    };
    (function(Importance2) {
      Importance2[Importance2["None"] = 0] = "None";
      Importance2[Importance2["Min"] = 1] = "Min";
      Importance2[Importance2["Low"] = 2] = "Low";
      Importance2[Importance2["Default"] = 3] = "Default";
      Importance2[Importance2["High"] = 4] = "High";
    })(Importance || (Importance = {}));
    (function(Visibility2) {
      Visibility2[Visibility2["Secret"] = -1] = "Secret";
      Visibility2[Visibility2["Private"] = 0] = "Private";
      Visibility2[Visibility2["Public"] = 1] = "Public";
    })(Visibility || (Visibility = {}));
  }
});

// src/selfimpulse/ipc/client.ts
var client_exports = {};
__export(client_exports, {
  ipc: () => ipc,
  isNativeHost: () => isNativeHost
});
function isNativeHost() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}
var invoke2, ipc;
var init_client = __esm({
  "src/selfimpulse/ipc/client.ts"() {
    "use strict";
    invoke2 = (cmd, args) => {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals) throw new Error("not in the native host \u2014 no __TAURI_INTERNALS__");
      return internals.invoke(cmd, args);
    };
    ipc = {
      async secretGet(secretRef) {
        return await invoke2("secret_get", { secretRef });
      },
      async secretSet(secretRef, value) {
        return await invoke2("secret_set", { secretRef, value });
      },
      async notifyApproval(title, body) {
        const { isPermissionGranted: isPermissionGranted2, requestPermission: requestPermission2, sendNotification: sendNotification2 } = await Promise.resolve().then(() => (init_dist_js(), dist_js_exports));
        let granted = await isPermissionGranted2();
        if (!granted) granted = await requestPermission2() === "granted";
        if (granted) sendNotification2({ title, body });
      },
      async appInfo() {
        return await invoke2("app_info");
      }
    };
  }
});

// src/selfimpulse/engine/signing.ts
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
var STORAGE_KEY, KEYCHAIN_REF, cached;
var init_signing = __esm({
  "src/selfimpulse/engine/signing.ts"() {
    "use strict";
    STORAGE_KEY = "selfimpulse.issuerkey.v1";
    KEYCHAIN_REF = "selfimpulse.issuerkey.v1";
    cached = null;
  }
});

// src/selfimpulse/engine/proof.ts
var proof_exports = {};
__export(proof_exports, {
  LEGACY_SEAL_SECRET: () => LEGACY_SEAL_SECRET,
  VERIFY_SECRET: () => VERIFY_SECRET,
  buildChainedReceipt: () => buildChainedReceipt,
  receiptFromJsonl: () => receiptFromJsonl,
  receiptToJsonl: () => receiptToJsonl,
  verifyProofReceipt: () => verifyProofReceipt
});
function sortDeep(v) {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortDeep(v[k]);
    return out;
  }
  return v;
}
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
var VERIFY_SECRET, LEGACY_SEAL_SECRET, SEAL_SECRET_BY_FORMAT, enc, canon;
var init_proof = __esm({
  "src/selfimpulse/engine/proof.ts"() {
    "use strict";
    init_signing();
    VERIFY_SECRET = "si-commercial-v1-offline";
    LEGACY_SEAL_SECRET = "mj-commercial-v1-offline";
    SEAL_SECRET_BY_FORMAT = {
      "si-proof-receipt/2": VERIFY_SECRET,
      "mj-proof-receipt/2": LEGACY_SEAL_SECRET,
      "mj-proof-receipt/1": LEGACY_SEAL_SECRET
    };
    enc = new TextEncoder();
    canon = (o) => JSON.stringify(sortDeep(o));
  }
});

// probe/siClean.test.ts
import assert from "node:assert";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { test } from "node:test";

// src/version.ts
var PRODUCT_VERSION = "1.9.2";
var ENGINE_VERSION = "19.7.16";
var ENGINE_SHORT = "19.7";
var ENGINE_CODENAME = "SelfImpulse";
var PRODUCT_TITLE = `SelfImpulse (engine MJ ${ENGINE_SHORT} "${ENGINE_CODENAME}")`;

// probe/siClean.test.ts
var SI_ROOT = process.env.SI_ROOT ?? process.cwd();
var ROOT = typeof __SELFIMPULSE_ROOT__ !== "undefined" && __SELFIMPULSE_ROOT__ || process.env.SELFIMPULSE_ROOT || SI_ROOT;
var ROUTED_SURFACE = [
  "src/App.tsx",
  "src/main.tsx",
  "src/selfimpulse/pages/SelfImpulsePage.tsx",
  // the routed pages are the doors of src/ui (Docs joined in 19.7.13, Munshi after it).
  "src/ui/Shell.tsx",
  "src/ui/store.ts",
  "src/ui/screens/Steward.tsx",
  "src/ui/screens/Work.tsx",
  "src/ui/screens/Specialists.tsx",
  "src/ui/screens/Receipts.tsx",
  "src/ui/screens/Memory.tsx",
  "src/ui/screens/Settings.tsx",
  "src/ui/screens/Chat.tsx",
  "index.html",
  "package.json",
  "src-tauri/tauri.conf.json"
];
var SELFIMPULSEE_TREE = "src/selfimpulse";
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(e.name)) yield p;
  }
}
function stripWireTokens(src) {
  return src.replace(/mj-proof-receipt/gi, "").replace(/mj-commercial-v1-offline/g, "").replace(/mj_evolution/g, "").replace(/legacy-mj-receipt/g, "").replace(/mj-mission-record/g, "").replace(/mj\.desktop/g, "").replace(/mj\./g, "");
}
var RETIRED_PRODUCT_RE = new RegExp(
  ["Vel", "vet Hand|selfimpulse", "hand|Vo", "uch SelfImpulse|vo", "uchselfimpulse|RO", "GUE|\\bro", "gue\\b"].join(""),
  "i"
);
function hasRetiredProductName(src) {
  return RETIRED_PRODUCT_RE.test(src);
}
test("the routed product surface carries no retired predecessor (or ROGUE) name", () => {
  for (const rel of ROUTED_SURFACE) {
    const src = stripWireTokens(read(rel));
    assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
  }
});
test("the whole control-plane module (src/selfimpulse/**) carries no retired product name except the wire contract", () => {
  let scanned = 0;
  for (const abs of walk(path.join(ROOT, SELFIMPULSEE_TREE))) {
    scanned++;
    const rel = path.relative(ROOT, abs);
    const src = stripWireTokens(fs.readFileSync(abs, "utf8"));
    assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
  }
  assert.ok(scanned >= 6, `expected at least 6 modules under ${SELFIMPULSEE_TREE}, scanned ${scanned}`);
});
var UI_LAYER = ["src/app", "src/ui", "src/panels", "src/canvas", "src/ipc", "src/browser", "src/domain"];
test("the visible product surface carries no retired product name (whole surface, not just the selfimpulse tree)", () => {
  let scanned = 0;
  for (const dir of UI_LAYER) {
    for (const abs of walk(path.join(ROOT, dir))) {
      scanned++;
      const rel = path.relative(ROOT, abs);
      const src = stripWireTokens(fs.readFileSync(abs, "utf8"));
      assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
    }
  }
  assert.ok(scanned >= 30, `expected a real UI surface under the audited dirs, scanned ${scanned}`);
});
test("the web entry, IPC bridge, and styles carry no retired product name", () => {
  for (const rel of ["src/main.tsx", "src/ipc/client.ts", "src/ipc/localDb.ts", "src/ui/vh.css", "index.html"]) {
    const src = stripWireTokens(read(rel));
    assert.equal(hasRetiredProductName(src), false, `${rel} still references a retired product name`);
  }
});
test("identity strings are SelfImpulse (product) on the MJ engine", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.name, "selfimpulse");
  const brandSrc = read("src/brand.ts");
  const tagline = brandSrc.match(/PRODUCT_TAGLINE\s*=\s*"([^"]+)"/)?.[1] ?? "";
  assert.ok(tagline.length > 0, "src/brand.ts declares PRODUCT_TAGLINE");
  assert.ok(
    (pkg.description ?? "").toLowerCase().includes(tagline.toLowerCase()),
    `package description carries the tagline (${tagline}): ${pkg.description}`
  );
  assert.ok(!hasRetiredProductName(pkg.description ?? ""), `package description: ${pkg.description}`);
  const html = read("index.html");
  assert.ok(/<title>\s*SelfImpulse/.test(html), "index.html title");
  const tauri = read("src-tauri/tauri.conf.json");
  const conf = JSON.parse(tauri);
  assert.equal(conf.identifier, "com.selfimpulse.app", "the bundle identifier names the product");
  const migrateRs = read("src-tauri/src/migrate.rs");
  assert.ok(migrateRs.includes('LEGACY_IDENTIFIER: &str = "com.elevenhandle.app"') && /fn migrate_legacy_data/.test(migrateRs), "the identifier rename carries a data migration, so an existing install keeps its database");
  assert.ok(/migrate::migrate_legacy_data\(&data/.test(read("src-tauri/src/lib.rs")), "the migration runs at startup, before the data directory is created");
  assert.ok(!/elevenhandle/i.test(read("src-tauri/capabilities/desktop.json")) && !/\bVH 4\b/.test(read("src-tauri/capabilities/desktop.json")), "the capability description is the product's");
  assert.ok(!/VH — agent workstation/.test(read("src-tauri/src/lib.rs")), "the tray tooltip names the product");
  assert.equal(conf.productName, "SelfImpulse");
  assert.ok(conf.bundle.longDescription.startsWith("SelfImpulse") && conf.bundle.longDescription.includes("MJ engine"), "native description");
  const brand = read("src/brand.ts");
  assert.ok(/PRODUCT_NAME = "SelfImpulse"/.test(brand) && /ENGINE_NAME = "MJ"/.test(brand), "brand.ts is the one source of both names");
  assert.ok(/\{PRODUCT_NAME\}/.test(read("src/ui/Shell.tsx")), "the sidebar brand reads from brand.ts");
  const ver = read("src/version.ts");
  assert.ok(new RegExp(`export const ENGINE_VERSION = "${ENGINE_VERSION.replace(/\\./g, "\\\\.")}"`).test(ver), `engine version constant in src/version.ts matches ${ENGINE_VERSION}`);
  assert.ok(new RegExp(`export const PRODUCT_VERSION = "${PRODUCT_VERSION.replace(/\\./g, "\\\\.")}"`).test(ver), `product version constant in src/version.ts matches ${PRODUCT_VERSION}`);
});
test("every control-plane persistence key is selfimpulse.*", () => {
  const keys = /* @__PURE__ */ new Set();
  for (const abs of walk(path.join(ROOT, SELFIMPULSEE_TREE))) {
    const src = fs.readFileSync(abs, "utf8");
    const re = /["']((?:selfimpulse|mj|rogue)\.[a-z0-9.]+)["']/gi;
    let m;
    while (m = re.exec(src)) keys.add(m[1]);
  }
  assert.ok(keys.size >= 5, `expected selfimpulse.* keys to be found, got ${keys.size}`);
  for (const k of keys) {
    assert.ok(k.startsWith("selfimpulse."), `legacy persistence key still present: ${k}`);
  }
});
test("the current wire format is si-proof-receipt/2 and the legacy fixture still verifies", async () => {
  const { buildChainedReceipt: buildChainedReceipt2, verifyProofReceipt: verifyProofReceipt2, receiptFromJsonl: receiptFromJsonl2 } = await Promise.resolve().then(() => (init_proof(), proof_exports));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const r = await buildChainedReceipt2({
    mission: "clean-identity-check",
    teamId: "selfimpulse",
    startedAt: now,
    finishedAt: now,
    version: ENGINE_VERSION,
    edition: "offline",
    events: [{ kind: "selfimpulse.session", seatId: "selfimpulse-core", data: { hello: "clean" } }]
  });
  assert.equal(r.format, "si-proof-receipt/2", "new receipts emit the current wire format");
  const fresh = await verifyProofReceipt2(r);
  assert.equal(fresh.ok, true, `a fresh vh/2 receipt verifies in-process${fresh.ok ? "" : " \u2014 " + fresh.reason}`);
  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const legacy = receiptFromJsonl2(legacyText);
  assert.ok(legacy, "the signed legacy fixture parses");
  assert.equal(legacy.format, "mj-proof-receipt/2", "the fixture is a signed legacy-v2 receipt");
  const v = await verifyProofReceipt2(legacy);
  assert.equal(v.ok, true, "back-compat: the legacy fixture still verifies through the same verifier");
});
test("the offline CLI accepts both wires and rejects tampering", async () => {
  const { buildChainedReceipt: buildChainedReceipt2, receiptToJsonl: receiptToJsonl2 } = await Promise.resolve().then(() => (init_proof(), proof_exports));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const fresh = await buildChainedReceipt2({ mission: "cli-fresh-check", teamId: "selfimpulse", startedAt: now, finishedAt: now, version: ENGINE_VERSION, edition: "offline", events: [{ kind: "selfimpulse.session", seatId: "selfimpulse-core", data: { x: 1 } }] });
  const freshPath = path.join(ROOT, "probe/.vhClean-fresh.jsonl");
  fs.writeFileSync(freshPath, receiptToJsonl2(fresh));
  let freshCode = 0;
  try {
    execFileSync(process.execPath, [path.join(ROOT, "tools/verify-receipt.mjs"), freshPath], { encoding: "utf8" });
  } catch (e) {
    freshCode = e.status ?? 1;
  }
  fs.rmSync(freshPath, { force: true });
  assert.ok(freshCode === 0 || freshCode === 3, `fresh vh/2 receipt should verify via CLI, got exit ${freshCode}`);
  const tool = path.join(ROOT, "tools/verify-receipt.mjs");
  const src = read("tools/verify-receipt.mjs");
  for (const fmt of ["si-proof-receipt/2", "mj-proof-receipt/2", "mj-proof-receipt/1"]) {
    assert.ok(src.includes(fmt), `verifier accepts ${fmt}`);
  }
  let code = 0;
  try {
    execFileSync(process.execPath, [tool, path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl")], { encoding: "utf8" });
  } catch (e) {
    code = e.status ?? 1;
  }
  assert.ok(code === 0 || code === 3, `legacy fixture should verify via CLI, got exit ${code}`);
  const tamperedPath = path.join(ROOT, "probe/.vhClean-tampered.jsonl");
  const legacyText = fs.readFileSync(path.join(ROOT, "probe/fixtures/legacy-mj-receipt.jsonl"), "utf8");
  const lines = legacyText.split("\n").filter(Boolean);
  const last = JSON.parse(lines[lines.length - 1]);
  last.hash = (last.hash.startsWith("0") ? "1" : "0") + last.hash.slice(1);
  lines[lines.length - 1] = JSON.stringify(last);
  fs.writeFileSync(tamperedPath, lines.join("\n") + "\n");
  try {
    execFileSync(process.execPath, [tool, tamperedPath], { encoding: "utf8" });
    assert.fail("tampered receipt must not verify");
  } catch (e) {
    const ec = e.status ?? 0;
    assert.equal(ec, 1, `tampered legacy receipt must exit 1, got ${ec}`);
  } finally {
    fs.rmSync(tamperedPath, { force: true });
  }
});
console.log("vhClean probe complete");
