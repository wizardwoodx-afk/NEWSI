import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/fedIdentity.test.ts
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

// src/engine/ownerKeyStore.ts
var OWNER_KEY_REF = "engine.ownerKeys";
async function tauriOwnerStorage() {
  const w = globalThis;
  const invoke = w.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return null;
  let cached = null;
  try {
    const r = await invoke("secret_get", { secretRef: OWNER_KEY_REF });
    cached = r?.present && typeof r.value === "string" ? r.value : null;
  } catch {
    cached = null;
  }
  return {
    get: () => cached,
    set: (v) => {
      cached = v;
      void invoke("secret_set", { secretRef: OWNER_KEY_REF, value: v }).catch(() => {
      });
    }
  };
}
var PBKDF2_ITERATIONS = 31e4;
var PBKDF2_ITERATIONS_LEGACY = 15e4;
function bytesToB64Local(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return typeof btoa === "function" ? btoa(s) : Buffer.from(bytes).toString("base64");
}
function b64ToBytesLocal(b64) {
  const s = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
async function deriveKey(passphrase, salt, iterations = PBKDF2_ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt.buffer, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    iterations === PBKDF2_ITERATIONS ? ["encrypt", "decrypt"] : ["decrypt"]
  );
}
async function encryptedOwnerStorage(base, passphrase) {
  let memory = null;
  let sealed = false;
  const raw = base.get();
  if (raw) {
    try {
      const env = JSON.parse(raw);
      if (env.v !== 1 || !env.salt || !env.iv || !env.data) throw new Error("not an envelope");
      const salt = b64ToBytesLocal(env.salt);
      const ivBuf = b64ToBytesLocal(env.iv).buffer;
      const dataBuf = b64ToBytesLocal(env.data).buffer;
      let plain = null;
      for (const iters of [PBKDF2_ITERATIONS, PBKDF2_ITERATIONS_LEGACY]) {
        try {
          const key = await deriveKey(passphrase, salt, iters);
          plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuf }, key, dataBuf);
          break;
        } catch {
        }
      }
      if (!plain) throw new Error("decrypt failed at both iteration counts");
      memory = new TextDecoder().decode(plain);
    } catch {
      memory = null;
      sealed = true;
    }
  }
  return {
    sealed,
    get: () => memory,
    set: sealed ? () => {
    } : (v) => {
      memory = v;
      void (async () => {
        try {
          const salt = crypto.getRandomValues(new Uint8Array(16));
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const key = await deriveKey(passphrase, salt);
          const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv.buffer }, key, new TextEncoder().encode(v));
          base.set(JSON.stringify({ v: 1, salt: bytesToB64Local(salt), iv: bytesToB64Local(iv), data: bytesToB64Local(new Uint8Array(ct)) }));
        } catch {
        }
      })();
    }
  };
}

// src/engine/missionAuthority.ts
var AUTHORITY_OWNER_FALLBACK = "local-owner";
var AUTHORITY_SCHEME = "ecdsa-p256";
var browserRawStorage = (() => {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    return { get: () => ls.getItem("engine.ownerKeys.v1"), set: (v) => ls.setItem("engine.ownerKeys.v1", v) };
  } catch {
    return null;
  }
})();
function pemToDer(pem2) {
  const b64 = pem2.replace(/-----(BEGIN|END) [A-Z ]+-----/g, "").replace(/\s+/g, "");
  const bin = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
async function loadOrCreate(storage, identity, security) {
  const owner = identity.trim() || AUTHORITY_OWNER_FALLBACK;
  if (storage) {
    try {
      const raw = storage.get();
      if (raw) {
        const saved = JSON.parse(raw);
        const entry = saved.byOwner?.[owner];
        if (entry) {
          const privateKey = await crypto.subtle.importKey("jwk", entry.priv, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
          const publicKey = await crypto.subtle.importKey("spki", pemToDer(entry.pem), { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
          return { keys: { privateKey, publicKey, publicKeyPem: entry.pem }, owner, security, persisted: true };
        }
      }
    } catch {
    }
  }
  const keys = await generateOwnerKeysWeb();
  const ident = { keys, owner, security, persisted: Boolean(storage) };
  if (storage) {
    try {
      const priv = await crypto.subtle.exportKey("jwk", keys.privateKey);
      const raw = storage.get();
      let byOwner = {};
      if (raw) {
        try {
          byOwner = JSON.parse(raw).byOwner ?? {};
        } catch {
        }
      }
      byOwner[owner] = { priv, pem: keys.publicKeyPem };
      storage.set(JSON.stringify({ byOwner }));
    } catch {
    }
  }
  return ident;
}
var realmCache = /* @__PURE__ */ new WeakMap();
var ephemeralCache = null;
var defaultStorageCache = null;
async function resolveDefaultStorage(passphrase) {
  const native = await tauriOwnerStorage();
  if (native) return { storage: native, security: "native" };
  if (browserRawStorage && passphrase) {
    const enc = await encryptedOwnerStorage(browserRawStorage, passphrase);
    return { storage: enc, security: "encrypted" };
  }
  return { storage: null, security: "session" };
}
var activePassphrase = null;
async function authorityOwnerIdentity(opts) {
  const owner = opts?.identity?.trim() || AUTHORITY_OWNER_FALLBACK;
  const passphrase = opts?.passphrase ?? activePassphrase ?? void 0;
  if (opts?.storage) {
    if (opts.storage.sealed) {
      const ident3 = await loadOrCreate(null, owner, "session");
      ident3.unlockFailed = true;
      return ident3;
    }
    let m2 = realmCache.get(opts.storage);
    if (!m2) {
      m2 = /* @__PURE__ */ new Map();
      realmCache.set(opts.storage, m2);
    }
    const hit2 = m2.get(owner);
    if (hit2) return hit2;
    const ident2 = await loadOrCreate(opts.storage, owner, "encrypted");
    m2.set(owner, ident2);
    return ident2;
  }
  const key = passphrase ?? "";
  if (!defaultStorageCache || defaultStorageCache.key !== key) {
    defaultStorageCache = { key, promise: resolveDefaultStorage(passphrase) };
  }
  let { storage, security } = await defaultStorageCache.promise;
  let unlockFailed = false;
  if (storage && storage.sealed) {
    storage = null;
    security = "session";
    unlockFailed = true;
  }
  if (!storage) {
    if (!ephemeralCache) ephemeralCache = /* @__PURE__ */ new Map();
    const cacheKey = unlockFailed ? `${owner}::unlock-failed` : owner;
    const hit2 = ephemeralCache.get(cacheKey);
    if (hit2) return hit2;
    const ident2 = await loadOrCreate(null, owner, security);
    if (unlockFailed) ident2.unlockFailed = true;
    ephemeralCache.set(cacheKey, ident2);
    return ident2;
  }
  let m = realmCache.get(storage);
  if (!m) {
    m = /* @__PURE__ */ new Map();
    realmCache.set(storage, m);
  }
  const hit = m.get(owner);
  if (hit) return hit;
  const ident = await loadOrCreate(storage, owner, security);
  m.set(owner, ident);
  return ident;
}

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
var SIGIL_TILTS = [-5, 0, 5];
var FIELDS = ["heater", "lozenge", "rondel"];
var DIVISIONS = ["plain", "bend", "chevron", "pale"];
var SEMES = ["none", "dots", "barry", "lozengy"];
var CHIEFS = ["none", "label", "wall"];
var CHARGES = ["cross", "saltire", "roundel", "lozenge", "estoile", "pile", "mullet"];
var BORDURES = ["none", "engrailed", "double"];
var TINCTURE_NAMES = Object.keys(SIGIL_TINCTURES);
var GROUND_NAMES = Object.keys(SIGIL_GROUNDS);
function wash(hex, amount, base = "#f7f5f1") {
  const parse = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(base);
  const k = Math.min(1, Math.max(0, amount));
  const to = (a, b) => Math.round(a * k + b * (1 - k));
  const hex2 = (n) => n.toString(16).padStart(2, "0");
  return `#${hex2(to(r1 ?? 0, r2 ?? 0))}${hex2(to(g1 ?? 0, g2 ?? 0))}${hex2(to(b1 ?? 0, b2 ?? 0))}`;
}
function deriveBytes(seed) {
  const hex = pureSha256(`vh.fed.sigil.v1:${seed}`);
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
}
function sigilOf(seed) {
  const b = deriveBytes(seed);
  const at = (i) => b[i % b.length] ?? 0;
  return {
    seed,
    field: FIELDS[at(0) % FIELDS.length] ?? "heater",
    division: DIVISIONS[at(1) % DIVISIONS.length] ?? "plain",
    seme: SEMES[at(2) % SEMES.length] ?? "none",
    chief: CHIEFS[at(3) % CHIEFS.length] ?? "none",
    charge: CHARGES[at(4) % CHARGES.length] ?? "cross",
    chargeCount: at(5) % 3 + 1,
    tincture: TINCTURE_NAMES[at(6) % TINCTURE_NAMES.length] ?? "iron",
    ground: GROUND_NAMES[at(7) % GROUND_NAMES.length] ?? "paper",
    bordure: BORDURES[at(8) % BORDURES.length] ?? "none",
    tilt: SIGIL_TILTS[at(9) % SIGIL_TILTS.length] ?? 0,
    fingerprint: fingerprintOf(seed)
  };
}
function fingerprintOf(seed) {
  const hex = pureSha256(`vh.fed.sigil.handle.v1:${seed}`).toUpperCase();
  return [hex.slice(0, 4), hex.slice(4, 8), hex.slice(8, 12), hex.slice(12, 16)].join("-");
}
function sigilTraits(s) {
  return [
    `${s.field} field`,
    s.division === "plain" ? "undivided" : `${s.division} division`,
    s.seme === "none" ? "plain ground" : `sem\xE9 of ${s.seme}`,
    s.chief === "none" ? "no chief" : `chief of ${s.chief}`,
    `${s.charge}${s.chargeCount > 1 ? ` \xD7${s.chargeCount}` : ""}`,
    `${s.tincture} charge`,
    s.bordure === "none" ? "unbordered" : `${s.bordure} bordure`,
    `on ${s.ground}`,
    s.tilt === 0 ? "upright" : s.tilt < 0 ? "tilted left" : "tilted right"
  ];
}
function sigilSummary(s) {
  return sigilTraits(s).join(" \xB7 ");
}
var SIGIL_STATE_WORDS = {
  idle: "at rest",
  thinking: "working",
  acting: "acting",
  gate: "awaiting a human",
  sealed: "verified",
  refused: "refused",
  failed: "failed \u2014 the run broke"
};
var INK = "#26231d";
var FIELD_PATHS = {
  heater: "M 16 22 H 84 V 58 C 84 76 68 88 50 94 C 32 88 16 76 16 58 Z",
  lozenge: "M 50 16 L 86 56 L 50 94 L 14 56 Z",
  rondel: "M 16 24 H 84 V 50 A 34 34 0 0 1 50 92 A 34 34 0 0 1 16 50 Z"
};
function insetPath(field, inset) {
  const s = 100 - inset * 2;
  const cx = 50;
  const k = s / 100;
  const scale = (d) => d.replace(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_m, x, y) => `${(cx + (Number(x) - cx) * k).toFixed(1)} ${(cx + (Number(y) - cx) * k).toFixed(1)}`);
  return scale(FIELD_PATHS[field]);
}
function divisionPath(division) {
  switch (division) {
    case "plain":
      return null;
    case "bend":
      return "M -20 84 L -20 60 L 120 16 L 120 40 Z";
    case "chevron":
      return "M -10 74 L 50 40 L 110 74 L 110 54 L 50 20 L -10 54 Z";
    case "pale":
      return "M 41 0 H 59 V 100 H 41 Z";
  }
}
function semeMarkup(seme, tincture, chargeCount) {
  if (seme === "none" || chargeCount > 1) return "";
  const parts = [];
  if (seme === "dots") {
    for (let y = 14; y < 94; y += 15) {
      const offset = (y / 15 | 0) % 2 === 0 ? 0 : 7;
      for (let x = 12; x < 94; x += 15) {
        parts.push(`<circle cx="${(x + offset).toFixed(1)}" cy="${y}" r="1.5" fill="${tincture}" opacity="0.38"/>`);
      }
    }
  } else if (seme === "barry") {
    for (let y = 12; y < 96; y += 18) {
      parts.push(`<rect x="-10" y="${y}" width="120" height="3" fill="${tincture}" opacity="0.26"/>`);
    }
  } else {
    for (let y = 14; y < 94; y += 20) {
      const offset = (y / 20 | 0) % 2 === 0 ? 0 : 10;
      for (let x = 12; x < 94; x += 20) {
        const px = x + offset;
        parts.push(`<path d="M ${px} ${y - 4} L ${px + 4} ${y} L ${px} ${y + 4} L ${px - 4} ${y} Z" fill="${tincture}" opacity="0.3"/>`);
      }
    }
  }
  return parts.join("");
}
function bordureMarkup(bordure, field, tincture) {
  if (bordure === "none") return "";
  const path = insetPath(field, 5);
  if (bordure === "double") {
    return `<path d="${path}" fill="none" stroke="${tincture}" stroke-width="1.8" opacity="0.75"/>`;
  }
  return `<path d="${path}" fill="none" stroke="${tincture}" stroke-width="3" stroke-dasharray="1.6 4.4" stroke-linecap="round" opacity="0.85"/>`;
}
function chiefMarkup(chief, tincture) {
  if (chief === "none") return "";
  if (chief === "label") {
    const tabs = [34, 50, 66].map((x) => `<path d="M ${x - 5} 30 h 10 v 7 l -5 -3.5 l -5 3.5 Z" fill="${tincture}"/>`).join("");
    return `<rect x="14" y="24" width="72" height="7" fill="${tincture}"/>${tabs}`;
  }
  const castellations = [22, 38, 54, 70].map((x) => `<rect x="${x}" y="24" width="7" height="8" fill="#f7f5f1"/>`).join("");
  return `<rect x="14" y="24" width="72" height="8" fill="${tincture}"/>${castellations}`;
}
function chargeMarkup(charge, cx, cy, r, fill) {
  switch (charge) {
    case "cross": {
      const a = r * 0.3;
      return `<path d="M ${cx - a} ${cy - r} h ${a * 2} v ${r - a} h ${r - a} v ${a * 2} h ${-(r - a)} v ${r - a} h ${-(a * 2)} v ${-(r - a)} h ${-(r - a)} v ${-(a * 2)} h ${r - a} Z" fill="${fill}"/>`;
    }
    case "saltire":
      return `<path d="M ${cx - r} ${cy - r * 0.55} L ${cx - r * 0.72} ${cy - r} L ${cx + r} ${cy + r * 0.55} L ${cx + r * 0.72} ${cy + r} Z M ${cx + r} ${cy - r * 0.55} L ${cx + r * 0.72} ${cy - r} L ${cx - r} ${cy + r * 0.55} L ${cx - r * 0.72} ${cy + r} Z" fill="${fill}"/>`;
    case "roundel":
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
    case "lozenge":
      return `<path d="M ${cx} ${cy - r} L ${cx + r * 0.7} ${cy} L ${cx} ${cy + r} L ${cx - r * 0.7} ${cy} Z" fill="${fill}"/>`;
    case "estoile": {
      const pts = [];
      for (let i = 0; i < 12; i++) {
        const ang = i / 12 * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.44;
        pts.push(`${(cx + Math.cos(ang) * rr).toFixed(2)},${(cy + Math.sin(ang) * rr).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
    }
    case "pile":
      return `<path d="M ${cx - r} ${cy + r * 0.7} L ${cx} ${cy - r} L ${cx + r} ${cy + r * 0.7} Z" fill="${fill}"/>`;
    case "mullet": {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const ang = i / 10 * Math.PI * 2 - Math.PI / 2;
        const rr = i % 2 === 0 ? r : r * 0.46;
        pts.push(`${(cx + Math.cos(ang) * rr).toFixed(2)},${(cy + Math.sin(ang) * rr).toFixed(2)}`);
      }
      return `<polygon points="${pts.join(" ")}" fill="${fill}"/>`;
    }
  }
}
function chargesMarkup(s, fill) {
  if (s.chargeCount === 1) return chargeMarkup(s.charge, 50, 60, 16, fill);
  if (s.chargeCount === 2) {
    return chargeMarkup(s.charge, 50, 45, 11, fill) + chargeMarkup(s.charge, 50, 74, 11, fill);
  }
  return chargeMarkup(s.charge, 32, 78, 9.5, fill) + chargeMarkup(s.charge, 50, 60, 9.5, fill) + chargeMarkup(s.charge, 68, 42, 9.5, fill);
}
function crestMarkup(state, tincture) {
  switch (state) {
    case "idle":
      return "";
    case "thinking":
      return `<g fill="${tincture}" opacity="0.9"><circle cx="38" cy="8" r="3.1"/><circle cx="50" cy="8" r="3.1"/><circle cx="62" cy="8" r="3.1"/></g>`;
    case "acting":
      return `<path d="M 39 1.8 L 63 8 L 39 14.2 Z" fill="${tincture}"/>`;
    case "gate":
      return `<g opacity="0.92"><path d="M 44 7 V 4.8 a 6 6 0 0 1 12 0 V 7" fill="none" stroke="${tincture}" stroke-width="2.2" stroke-linecap="round"/><rect x="39" y="6.6" width="22" height="7.4" rx="1.7" fill="${tincture}"/></g>`;
    case "sealed":
      return "";
    case "refused":
      return "";
    case "failed":
      return `<g stroke="${tincture}" stroke-width="2.8" stroke-linecap="round" opacity="0.92"><path d="M 42 3 L 58 15"/><path d="M 58 3 L 42 15"/></g>`;
  }
}
function sigilSvg(s, opts = {}) {
  const size = opts.size ?? 96;
  const state = opts.state ?? "idle";
  const ground = opts.ground ?? SIGIL_GROUNDS[s.ground];
  const tincture = SIGIL_TINCTURES[s.tincture];
  const clipId = `sigil-${s.fingerprint.replace(/-/g, "")}`;
  const field = FIELD_PATHS[s.field];
  const division = divisionPath(s.division);
  const label = opts.title ?? `sigil ${s.fingerprint} \u2014 ${sigilSummary(s)} \u2014 ${SIGIL_STATE_WORDS[state]}`;
  const body = [
    `<defs><clipPath id="${clipId}"><path d="${field}"/></clipPath></defs>`,
    crestMarkup(state, tincture),
    `<g transform="rotate(${s.tilt} 50 56)">`,
    `<path d="${field}" fill="${wash(tincture, 0.2, ground)}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`,
    `<g clip-path="url(#${clipId})">`,
    division ? `<path d="${division}" fill="${tincture}" opacity="0.2"/>` : "",
    semeMarkup(s.seme, tincture, s.chargeCount),
    chiefMarkup(s.chief, tincture),
    chargesMarkup(s, tincture),
    bordureMarkup(s.bordure, s.field, tincture),
    state === "refused" ? `<path d="M 2 90 L 98 22" stroke="${tincture}" stroke-width="4.5" stroke-linecap="round" opacity="0.9"/>` : "",
    `</g>`,
    `<path d="${field}" fill="none" stroke="${INK}" stroke-width="${state === "sealed" ? 4 : 2.4}" stroke-linejoin="round"/>`,
    `</g>`,
    state === "sealed" ? `<g><circle cx="82" cy="88" r="9" fill="${ground}" stroke="${tincture}" stroke-width="2.2"/><path d="M 78 88 l 2.6 2.8 l 5 -6" stroke="${tincture}" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>` : ""
  ].join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" role="img" aria-label="${label}" class="si-sigil si-sigil--${state}">${body}</svg>`;
}

// src/engine/federation/identity.ts
var ANCHOR_FORMAT = "vh.fed.anchor.v1";
var KEY_FACE_PREFIX = "vh.fed.face.key.v1:";
function canonicalKeyMaterial(publicKeyPem) {
  return publicKeyPem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
}
function faceSeedForKey(publicKeyPem) {
  return `${KEY_FACE_PREFIX}${canonicalKeyMaterial(publicKeyPem)}`;
}
async function publicKeyPemFromJwk(jwk) {
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", key));
  const b64 = bytesToB64(spki);
  const lines = b64.match(/.{1,64}/g) ?? [b64];
  return `-----BEGIN PUBLIC KEY-----
${lines.join("\n")}
-----END PUBLIC KEY-----
`;
}
async function faceFromJwk(jwk) {
  return faceForKey(await publicKeyPemFromJwk(jwk));
}
async function keyHandleFromJwk(jwk) {
  return keyHandle(await publicKeyPemFromJwk(jwk));
}
function faceForKey(publicKeyPem) {
  return sigilOf(faceSeedForKey(publicKeyPem));
}
function keyHandle(publicKeyPem) {
  return fingerprintOf(faceSeedForKey(publicKeyPem));
}
async function federationIdentity(opts = {}) {
  const id = await authorityOwnerIdentity(opts);
  return {
    owner: id.owner,
    keys: id.keys,
    security: id.security,
    persisted: id.persisted,
    unlockFailed: id.unlockFailed,
    sigil: faceForKey(id.keys.publicKeyPem),
    sigilDerivedFrom: "public-key"
  };
}
function anchorCanonical(b) {
  return JSON.stringify({
    v: b.v,
    owner: b.owner,
    publicKeyPem: b.publicKeyPem,
    scheme: b.scheme,
    fingerprint: b.fingerprint,
    durable: b.durable,
    security: b.security,
    issuedAt: b.issuedAt
  });
}
async function issueAnchor(identity, opts = {}) {
  const body = {
    v: ANCHOR_FORMAT,
    owner: identity.owner,
    publicKeyPem: identity.keys.publicKeyPem,
    scheme: AUTHORITY_SCHEME,
    fingerprint: identity.sigil.fingerprint,
    durable: identity.persisted && identity.security !== "session",
    security: identity.security,
    issuedAt: opts.issuedAt ?? Date.now()
  };
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    identity.keys.privateKey,
    new TextEncoder().encode(anchorCanonical(body)).buffer
  );
  return { ...body, selfSignature: `${AUTHORITY_SCHEME}:${bytesToB64(new Uint8Array(sig))}` };
}
async function verifyAnchor(anchor, opts = {}) {
  if (!anchor || typeof anchor !== "object") {
    return { ok: false, reason: "malformed", detail: "no anchor was presented, so there is no identity to pin" };
  }
  if (anchor.v !== ANCHOR_FORMAT) {
    return { ok: false, reason: "malformed", detail: `anchor format ${String(anchor.v)} is not ${ANCHOR_FORMAT}` };
  }
  if (anchor.scheme !== AUTHORITY_SCHEME) {
    return { ok: false, reason: "wrong-scheme", detail: `anchor scheme "${String(anchor.scheme)}" is not ${AUTHORITY_SCHEME} \u2014 refusing to pin a non-portable identity` };
  }
  if (anchor.owner.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an anchor with no owner name cannot be held accountable" };
  }
  if (typeof anchor.publicKeyPem !== "string" || anchor.publicKeyPem.trim().length === 0) {
    return { ok: false, reason: "malformed", detail: "an anchor with no public key pins nothing" };
  }
  const expected = keyHandle(anchor.publicKeyPem);
  if (anchor.fingerprint !== expected) {
    return { ok: false, reason: "fingerprint-mismatch", detail: `this anchor carries face ${anchor.fingerprint}, and the public key inside it derives ${expected} \u2014 the mark and the key disagree, so the mark is not evidence about this key` };
  }
  if (!anchor.durable && (opts.requireDurable ?? false)) {
    return { ok: false, reason: "non-durable", detail: `this anchor's key is ${anchor.security}-scoped and will not survive a restart; a durable identity was required` };
  }
  if (!anchor.selfSignature.startsWith(`${AUTHORITY_SCHEME}:`)) {
    return { ok: false, reason: "bad-self-signature", detail: "the anchor carries no asymmetric proof of possession" };
  }
  try {
    const pub = await importPublicKeyWeb(anchor.publicKeyPem);
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64ToBytes(anchor.selfSignature.slice(`${AUTHORITY_SCHEME}:`.length)),
      new TextEncoder().encode(anchorCanonical(anchor)).buffer
    );
    if (!valid) return { ok: false, reason: "bad-self-signature", detail: "the anchor's proof of possession does not verify \u2014 treating the claim as unproven" };
    return { ok: true, anchor, owner: anchor.owner, fingerprint: anchor.fingerprint, durable: anchor.durable };
  } catch {
    return { ok: false, reason: "bad-self-signature", detail: "public key or proof malformed \u2014 treating the claim as unproven" };
  }
}
function anchorDigest(anchor) {
  return pureSha256(`vh.fed.anchor.v1:${anchorCanonical(anchor)}|${anchor.selfSignature}`);
}
function anchorSummary(identity) {
  return `${identity.owner} \u2014 ${sigilSummary(identity.sigil)} \u2014 ${identity.persisted ? `durable (${identity.security})` : "session-scoped, not durable"}`;
}
function anchorFace(identity, state = "idle", size = 72) {
  return sigilSvg(identity.sigil, { size, state });
}

// probe/fedIdentity.test.ts
function memStore() {
  let v = null;
  return { get: () => v, set: (x) => {
    v = x;
  } };
}
test("federation identity \u2014 the selfimpulse's own authority keys, with proof of possession", async (t) => {
  await t.test("\xA71 the identity IS the authority identity, not a second one", async () => {
    const storage = memStore();
    const fed = await federationIdentity({ storage, identity: "priya" });
    const auth = await authorityOwnerIdentity({ storage, identity: "priya" });
    assert.equal(fed.owner, auth.owner, "same owner name");
    assert.equal(fed.keys.publicKeyPem, auth.keys.publicKeyPem, "same public key \u2014 one identity system, not two");
    assert.equal(fed.security, auth.security);
    assert.equal(fed.persisted, true, "the memory seam persists, so the key is durable in this test");
    assert.equal(fed.sigilDerivedFrom, "public-key", "the mark says what it was derived from");
  });
  await t.test("\xA72 THE MARK IS KEY-DERIVED \u2014 the same owner with a new key gets a new mark", async () => {
    const oldKeys = await generateOwnerKeysWeb();
    const newKeys = await generateOwnerKeysWeb();
    const before = faceForKey(oldKeys.publicKeyPem);
    assert.deepEqual(before, faceForKey(oldKeys.publicKeyPem), "the same key always derives the same mark");
    const after = faceForKey(newKeys.publicKeyPem);
    assert.notEqual(before.fingerprint, after.fingerprint, "rotation produces a NEW mark \u2014 the old face does not survive a new key");
    assert.equal(before.seed, `${KEY_FACE_PREFIX}${canonicalKeyMaterial(oldKeys.publicKeyPem)}`);
    const fed = await federationIdentity({ storage: memStore(), identity: "priya" });
    const rotated = { ...await issueAnchor(fed, { issuedAt: 176e10 }) };
    const carriedOver = { ...rotated, publicKeyPem: newKeys.publicKeyPem, fingerprint: rotated.fingerprint };
    const verdict = await verifyAnchor(carriedOver);
    assert.equal(verdict.ok, false, "a mark from the old key cannot be re-pointed at a new key");
    if (!verdict.ok) assert.equal(verdict.reason, "fingerprint-mismatch");
  });
  await t.test("\xA73 the two kinds of mark are different strings, so neither can impersonate the other", async () => {
    const keys = await generateOwnerKeysWeb();
    const keyMark = keyHandle(keys.publicKeyPem);
    const subjectMark = fingerprintOf("selfimpulse:priya");
    assert.notEqual(keyMark, subjectMark, "a key handle and a subject handle are domain-separated");
    assert.match(keyMark, /^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/, "\u2026but they read the same way to a human");
    assert.notDeepEqual(faceForKey(keys.publicKeyPem), sigilOf("selfimpulse:priya"), "\u2026and they draw differently");
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
    void spki;
    const jwk = await crypto.subtle.exportKey("jwk", keys.publicKey);
    const fromJwk = await keyHandleFromJwk(jwk);
    assert.equal(fromJwk, keyMark, "JWK and PEM of one key produce one handle");
    assert.deepEqual(await faceFromJwk(jwk), faceForKey(keys.publicKeyPem), "\u2026and one face");
    const rewrapped = keys.publicKeyPem.replace(/\n/g, "\n\n");
    assert.equal(keyHandle(rewrapped), keyMark, "the same key material is the same mark, however it was wrapped");
    assert.notEqual(await publicKeyPemFromJwk(jwk), keys.publicKeyPem.replace(/\n/g, ""), "the re-encode is a real PEM");
  });
  await t.test("\xA74 an anchor proves possession, and the face cannot be re-pointed", async () => {
    const fed = await federationIdentity({ storage: memStore(), identity: "ana" });
    const anchor = await issueAnchor(fed, { issuedAt: 176e10 });
    assert.equal(anchor.v, ANCHOR_FORMAT);
    assert.equal(anchor.owner, "ana");
    assert.equal(anchor.scheme, "ecdsa-p256");
    assert.equal(anchor.fingerprint, fed.sigil.fingerprint);
    assert.equal(anchor.fingerprint, keyHandle(anchor.publicKeyPem), "the anchor's face is its key's face");
    assert.equal(anchor.durable, true);
    assert.match(anchor.selfSignature, /^ecdsa-p256:/);
    const verdict = await verifyAnchor(anchor);
    assert.equal(verdict.ok, true, JSON.stringify(verdict));
    if (verdict.ok) {
      assert.equal(verdict.owner, "ana");
      assert.equal(verdict.fingerprint, anchor.fingerprint);
    }
    const unproven = { ...anchor, selfSignature: "ecdsa-p256:AAAA" };
    const bad = await verifyAnchor(unproven);
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.reason, "bad-self-signature");
    const other = await generateOwnerKeysWeb();
    const refaced = { ...anchor, fingerprint: keyHandle(other.publicKeyPem) };
    const refused = await verifyAnchor(refaced);
    assert.equal(refused.ok, false);
    if (!refused.ok) assert.equal(refused.reason, "fingerprint-mismatch");
    const renamed = { ...anchor, owner: "ana-2" };
    const unowned = await verifyAnchor(renamed);
    assert.equal(unowned.ok, false);
    if (!unowned.ok) assert.equal(unowned.reason, "bad-self-signature");
    const keyless = { ...anchor, publicKeyPem: "" };
    const empty = await verifyAnchor(keyless);
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.equal(empty.reason, "malformed");
    const symmetric = { ...anchor, scheme: "hmac" };
    const notPortable = await verifyAnchor(symmetric);
    assert.equal(notPortable.ok, false);
    if (!notPortable.ok) assert.equal(notPortable.reason, "wrong-scheme");
    const absent = await verifyAnchor(null);
    assert.equal(absent.ok, false);
    if (!absent.ok) assert.equal(absent.reason, "malformed");
    assert.equal(anchorDigest(anchor).length, 64);
    assert.equal(anchorDigest(anchor), pureSha256(`vh.fed.anchor.v1:${anchorCanonical(anchor)}|${anchor.selfSignature}`));
    assert.match(anchorSummary(fed), /ana — /);
    assert.ok(anchorFace(fed, "sealed", 40).includes("si-sigil--sealed"));
  });
  await t.test("\xA75 a session-scoped anchor is refused when durability is required", async () => {
    const session = await federationIdentity({ identity: "session-only-owner" });
    assert.equal(session.security, "session");
    const anchor = await issueAnchor(session, { issuedAt: 176e10 });
    assert.equal(anchor.durable, false);
    assert.equal(anchor.security, "session");
    const accepted = await verifyAnchor(anchor);
    assert.equal(accepted.ok, true, "an honest session anchor still verifies");
    if (accepted.ok) assert.equal(accepted.durable, false, "\u2026and it reports that it is not durable");
    const strict = await verifyAnchor(anchor, { requireDurable: true });
    assert.equal(strict.ok, false);
    if (!strict.ok) {
      assert.equal(strict.reason, "non-durable");
      assert.match(strict.detail, /will not survive a restart/);
    }
    assert.match(anchorSummary(session), /session-scoped, not durable/);
  });
  await t.test("\xA76 the same key derives one mark, across identities and across calls", async () => {
    const storage = memStore();
    const fed = await federationIdentity({ storage, identity: "kenji" });
    assert.equal(fed.sigil.fingerprint, keyHandle(fed.keys.publicKeyPem));
    const again = await federationIdentity({ storage, identity: "kenji" });
    assert.deepEqual(fed.sigil, again.sigil, "one key, one mark, every time");
    const other = await federationIdentity({ storage: memStore(), identity: "kenji" });
    assert.notEqual(other.sigil.fingerprint, fed.sigil.fingerprint, "a different key is a different identity, whatever it is called");
  });
});
