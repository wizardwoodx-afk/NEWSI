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

// src/engine/vault.ts
var vault_exports = {};
__export(vault_exports, {
  VAULT_FORMAT: () => VAULT_FORMAT,
  calibratedIterations: () => calibratedIterations,
  destroyVault: () => destroyVault,
  lockVault: () => lockVault,
  purgePlain: () => purgePlain,
  setVaultPassphrase: () => setVaultPassphrase,
  upgradeVaultCost: () => upgradeVaultCost,
  vaultDecrypt: () => vaultDecrypt,
  vaultHasPassphrase: () => vaultHasPassphrase,
  vaultKdfParams: () => vaultKdfParams,
  vaultOpen: () => vaultOpen,
  vaultOpenAsync: () => vaultOpenAsync,
  vaultRemove: () => vaultRemove,
  vaultSeal: () => vaultSeal,
  vaultStatus: () => vaultStatus
});
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function subtle() {
  const c = globalThis.crypto;
  return c && typeof c.subtle?.deriveKey === "function" ? c.subtle : null;
}
function randomBytes(n) {
  const u8 = new Uint8Array(n);
  globalThis.crypto.getRandomValues(u8);
  return u8;
}
async function deriveKey(passphrase, salt, iterations = PBKDF_ITERATIONS) {
  const s = subtle();
  if (!s) throw new Error("WebCrypto SubtleCrypto is unavailable in this runtime \u2014 the vault refuses rather than pretend to encrypt");
  const base = await s.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return s.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
function readMeta() {
  const s = storage();
  if (!s) return null;
  try {
    const raw = JSON.parse(s.getItem(VAULT_META_KEY) ?? "null");
    return raw && raw.v === "si-vault-meta/1" ? raw : null;
  } catch {
    return null;
  }
}
async function setVaultPassphrase(passphrase, now = () => /* @__PURE__ */ new Date()) {
  if (typeof passphrase !== "string" || passphrase.length < 8) {
    return { ok: false, error: "a vault passphrase needs at least 8 characters \u2014 there is no recovery, so length is the only strength that cannot be taken from you" };
  }
  const existing = readMeta();
  try {
    if (!existing) {
      const salt = randomBytes(16);
      const iv = randomBytes(12);
      const iterations = await calibratedIterations();
      const key = await deriveKey(passphrase, salt, iterations);
      const check = await subtle().encrypt({ name: "AES-GCM", iv }, key, enc.encode("si-vault-check/1"));
      const meta = { v: "si-vault-meta/1", saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(check), kdf: "PBKDF2-SHA-256", iterations, createdAt: now().toISOString() };
      const s = storage();
      if (!s) return { ok: false, error: "no storage in this runtime \u2014 the vault can exist for this session only; persistence needs a store" };
      s.setItem(VAULT_META_KEY, JSON.stringify(meta));
      sessionKey = key;
      sessionParams = { salt, meta };
      return { ok: true, created: true };
    }
    try {
      const salt = fromB64(existing.saltB64);
      const key = await deriveKey(passphrase, salt, existing.iterations);
      const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(existing.ivB64) }, key, fromB64(existing.cipherB64));
      if (dec.decode(plain) !== "si-vault-check/1") return { ok: false, error: "that passphrase did not open the vault \u2014 nothing was changed" };
      sessionKey = key;
      sessionParams = { salt, meta: existing };
      return { ok: true, created: false };
    } catch {
      return { ok: false, error: "that passphrase did not open the vault \u2014 nothing was changed" };
    }
  } catch (e) {
    return { ok: false, error: `the vault refused the passphrase: ${e instanceof Error ? e.message : String(e)}` };
  }
}
function lockVault() {
  sessionKey = null;
  sessionParams = null;
}
function vaultHasPassphrase() {
  return sessionKey !== null;
}
function vaultKdfParams() {
  const meta = readMeta();
  return meta ? { saltB64: meta.saltB64, iterations: meta.iterations } : null;
}
async function calibratedIterations(targetMs = 250) {
  const s = subtle();
  if (!s) return PBKDF_ITERATIONS;
  try {
    const base = await s.importKey("raw", enc.encode("si-vault-calibration"), "PBKDF2", false, ["deriveBits"]);
    const probeSalt = new Uint8Array(16);
    const t0 = Date.now();
    await s.deriveBits({ name: "PBKDF2", salt: probeSalt, iterations: 2e4, hash: "SHA-256" }, base, 256);
    const per20k = Math.max(1, Date.now() - t0);
    const scaled = Math.round(2e4 * targetMs / per20k / 1e3) * 1e3;
    return Math.min(2e6, Math.max(PBKDF_ITERATIONS, scaled));
  } catch {
    return PBKDF_ITERATIONS;
  }
}
async function upgradeVaultCost(passphrase, targetIterations) {
  const meta = readMeta();
  if (!meta) return { changed: false, note: "no vault on this machine \u2014 nothing to upgrade" };
  if (!sessionKey) return { changed: false, note: "the vault is locked \u2014 unlock before upgrading its cost" };
  const target = targetIterations ?? await calibratedIterations();
  if (target <= meta.iterations) {
    return { changed: false, note: `the vault's cost (${meta.iterations}) already meets this machine's measured level (${target})` };
  }
  const s = storage();
  if (!s) return { changed: false, note: "no storage in this runtime \u2014 nothing to upgrade" };
  const sealed = [];
  for (let i = 0; i < s.length; i++) {
    const k = s.key(i);
    if (!k) continue;
    const raw = s.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.v === VAULT_FORMAT) sealed.push(k);
    } catch {
    }
  }
  const plain = [];
  for (const name of sealed) {
    const r = await vaultOpenAsync(name);
    if (!r.found || r.locked || r.text === void 0) {
      return { changed: false, note: `a sealed record (${name}) did not open \u2014 the cost was not changed` };
    }
    plain.push({ name, text: r.text });
  }
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const newKey = await deriveKey(passphrase, salt, target);
  const check = await subtle().encrypt({ name: "AES-GCM", iv }, newKey, enc.encode("si-vault-check/1"));
  const newMeta = { ...meta, saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(check), iterations: target };
  sessionKey = newKey;
  sessionParams = { salt, meta: newMeta };
  s.setItem(VAULT_META_KEY, JSON.stringify(newMeta));
  let resealed2 = 0;
  for (const p of plain) {
    const r = await vaultSeal(p.name, p.text);
    if (!r.ok) return { changed: true, iterations: target, note: `upgraded to ${target} iterations, but ${p.name} failed to re-seal \u2014 seal it again from its source` };
    resealed2 += 1;
  }
  return { changed: true, iterations: target, note: `cost upgraded to ${target} iterations; ${resealed2} sealed record(s) re-sealed` };
}
function vaultStatus() {
  const meta = readMeta();
  if (!meta) return { status: "no-passphrase", created: false, kdf: null, iterations: null };
  if (sessionKey) return { status: "unlocked", created: true, kdf: meta.kdf, iterations: meta.iterations };
  return { status: "sealed-locked", created: true, kdf: meta.kdf, iterations: meta.iterations };
}
async function vaultSeal(name, text, now = () => /* @__PURE__ */ new Date()) {
  if (!sessionKey) return { ok: false, error: "the vault is locked \u2014 set or enter the passphrase before anything is sealed" };
  const meta = sessionParams?.meta;
  const salt = sessionParams?.salt;
  if (!meta || !salt) return { ok: false, error: "vault session state is missing \u2014 lock and unlock again" };
  try {
    const iv = randomBytes(12);
    const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, sessionKey, enc.encode(text));
    const record = { v: VAULT_FORMAT, saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(cipher), kdf: "PBKDF2-SHA-256", iterations: meta.iterations, sealedAt: now().toISOString() };
    const s = storage();
    if (!s) return { ok: false, error: "no storage in this runtime \u2014 nothing was sealed" };
    s.setItem(name, JSON.stringify(record));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `sealing failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
function vaultOpen(name) {
  const s = storage();
  if (!s) return { found: false };
  const raw = s.getItem(name);
  if (!raw) return { found: false };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.v === VAULT_FORMAT) {
      const rec = parsed;
      if (!sessionKey) return { found: true, locked: true };
      void rec;
      return { found: true, locked: true };
    }
    return { found: true, locked: false, text: raw };
  } catch {
    return { found: true, locked: false, text: raw };
  }
}
async function vaultOpenAsync(name) {
  return vaultDecrypt(name);
}
async function vaultDecrypt(name) {
  const s = storage();
  if (!s) return { found: false };
  const raw = s.getItem(name);
  if (!raw) return { found: false };
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { found: true, locked: false, text: raw };
  }
  if (!parsed || typeof parsed !== "object" || parsed.v !== VAULT_FORMAT) {
    return { found: true, locked: false, text: raw };
  }
  const rec = parsed;
  if (!sessionKey) return { found: true, locked: true };
  try {
    const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(rec.ivB64) }, sessionKey, fromB64(rec.cipherB64));
    return { found: true, locked: false, text: dec.decode(plain) };
  } catch {
    return { found: true, locked: true };
  }
}
function vaultRemove(name) {
  const s = storage();
  if (s) s.removeItem(name);
}
function purgePlain(name) {
  const s = storage();
  if (!s) return { found: false, text: null };
  const raw = s.getItem(name);
  if (!raw) return { found: false, text: null };
  s.removeItem(name);
  return { found: true, text: raw };
}
function destroyVault() {
  const s = storage();
  if (s) s.removeItem(VAULT_META_KEY);
  lockVault();
}
var VAULT_FORMAT, VAULT_META_KEY, PBKDF_ITERATIONS, enc, dec, toB64, fromB64, sessionKey, sessionParams;
var init_vault = __esm({
  "src/engine/vault.ts"() {
    "use strict";
    VAULT_FORMAT = "si-vault/1";
    VAULT_META_KEY = "vh.vault.meta.v1";
    PBKDF_ITERATIONS = 31e4;
    enc = new TextEncoder();
    dec = new TextDecoder();
    toB64 = (buf) => {
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let s = "";
      for (let b = 0; b < u8.length; b++) s += String.fromCharCode(u8[b]);
      return btoa(s);
    };
    fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    sessionKey = null;
    sessionParams = null;
  }
});

// src/persist/quotaSafe.ts
function resolveStorage(store) {
  if (store !== void 0) return store;
  try {
    const ls = globalThis.localStorage;
    return ls && typeof ls.setItem === "function" ? ls : null;
  } catch {
    return null;
  }
}
function isQuotaError(e) {
  if (!e || typeof e !== "object") return false;
  const name = e.name;
  const code = e.code;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || code === 22 || code === 1014;
}
function persistNotices(store) {
  const s = resolveStorage(store);
  if (!s) return [];
  try {
    const raw = s.getItem?.(NOTICE_KEY) ?? null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function notePersist(key, kind, detail, store) {
  const s = resolveStorage(store);
  if (!s) return;
  try {
    const list = persistNotices(s);
    list.push({ at: (/* @__PURE__ */ new Date()).toISOString(), key, kind, detail });
    const trimmed = list.slice(-NOTICE_CAP);
    s.setItem?.(NOTICE_KEY, JSON.stringify(trimmed));
  } catch {
  }
}
function writeFirstThatFits(key, ladder, store) {
  const rungs = ladder.length;
  const s = resolveStorage(store);
  if (rungs === 0) {
    const refused2 = "no payload was offered (empty write ladder) \u2014 nothing was written.";
    notePersist(key, "refused", refused2, store);
    return { ok: false, rung: -1, rungs, dropped: "", refused: refused2 };
  }
  if (!s) {
    return { ok: false, rung: -1, rungs, dropped: "", refused: "no storage on this host \u2014 the caller's in-memory copy is the session's only record." };
  }
  for (let i = 0; i < rungs; i++) {
    const rung = ladder[i];
    try {
      s.setItem(key, rung.value);
      if (i > 0) {
        notePersist(key, "degraded", `rung ${i}/${rungs - 1}: ${rung.dropped}`, s);
      }
      return { ok: true, rung: i, rungs, dropped: i > 0 ? rung.dropped : "" };
    } catch (e) {
      if (!isQuotaError(e)) {
        const refused2 = `write to "${key}" failed for a non-quota reason (${String(e)}) \u2014 refused rather than shrinking the payload, which would not have helped.`;
        notePersist(key, "refused", refused2, s);
        return { ok: false, rung: -1, rungs, dropped: "", refused: refused2 };
      }
    }
  }
  const refused = `every rung of the ladder failed on quota \u2014 even the smallest payload does not fit this origin. Nothing was written; the caller keeps its in-memory copy.`;
  notePersist(key, "refused", refused, s);
  return { ok: false, rung: -1, rungs, dropped: "", refused };
}
var NOTICE_KEY, NOTICE_CAP;
var init_quotaSafe = __esm({
  "src/persist/quotaSafe.ts"() {
    "use strict";
    NOTICE_KEY = "vh.persist.notices";
    NOTICE_CAP = 40;
  }
});

// src/engine/memoryGraph.ts
var memoryGraph_exports = {};
__export(memoryGraph_exports, {
  REHYDRATION_MARK: () => REHYDRATION_MARK,
  aliasesOf: () => aliasesOf,
  clearGraph: () => clearGraph,
  deleteSession: () => deleteSession,
  extractKeywords: () => extractKeywords,
  flushGraphPersist: () => flushGraphPersist,
  getSession: () => getSession,
  graph: () => graph,
  graphSecurityStatus: () => graphSecurityStatus,
  graphStats: () => graphStats,
  graphView: () => graphView,
  hydrateGraph: () => hydrateGraph,
  ingestSession: () => ingestSession,
  listSessions: () => listSessions,
  memoryEnabled: () => memoryEnabled,
  parseDateWindow: () => parseDateWindow,
  recall: () => recall,
  rehydrate: () => rehydrate,
  setMemoryEnabled: () => setMemoryEnabled,
  stem: () => stem,
  titleFromMessages: () => titleFromMessages
});
function extractKeywords(text, max = 8) {
  const words = text.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const freq = /* @__PURE__ */ new Map();
  const caps = /* @__PURE__ */ new Set();
  for (const raw of text.split(/\s+/)) {
    const w = raw.toLowerCase().replace(/[^a-z0-9\s'-]/g, "");
    if (!w) caps.add("__noop__");
  }
  const capTokens = /* @__PURE__ */ new Set();
  for (const raw of text.split(/\s+/)) {
    const cleaned = raw.replace(/[^A-Za-z0-9'-]/g, "");
    if (cleaned.length > 2 && /^[A-Z]/.test(cleaned) && !STOP.has(cleaned.toLowerCase())) {
      capTokens.add(cleaned.toLowerCase());
    }
  }
  for (const w of words) {
    const t = w.replace(/^-+|-+$/g, "");
    if (t.length < 3 || STOP.has(t) || /^\d+$/.test(t)) continue;
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const scored = Array.from(freq.entries()).map(([word, f]) => {
    let score = f * (1 + Math.min(1, (word.length - 3) / 8));
    if (capTokens.has(word)) score *= 1.5;
    return { word, score };
  });
  scored.sort((a, b) => b.score - a.score || (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
  return scored.slice(0, Math.max(1, max)).map((s) => s.word);
}
function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let h2 = 2166136261 ^ 2654435769;
  for (let i = text.length - 1; i >= 0; i--) {
    h2 ^= text.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
function storage2() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function flushGraphPersist() {
  return persistInFlight;
}
function isSealedEnvelope(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.v === "si-vault/1";
  } catch {
    return false;
  }
}
function loadGraph() {
  const s = storage2();
  if (!s) {
    if (!memCache) memCache = { ...EMPTY, nodes: [], edges: [], sessions: [] };
    return memCache;
  }
  const raw = s.getItem(GRAPH_KEY);
  if (isSealedEnvelope(raw)) {
    if (!memCache) {
      lockedAtBoot = true;
      memCache = { ...EMPTY };
    }
    return memCache;
  }
  lockedAtBoot = false;
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges) || !Array.isArray(parsed.sessions)) {
      if (!memCache) memCache = { ...EMPTY };
      return memCache;
    }
    memCache = parsed;
    return parsed;
  } catch {
    if (!memCache) memCache = { ...EMPTY };
    return memCache;
  }
}
function saveGraph(g) {
  memCache = g;
  const s = storage2();
  if (!s) return;
  g.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const token = ++saveToken;
  if (vaultStatus().status === "unlocked") {
    s.removeItem(GRAPH_KEY);
    persistInFlight = (async () => {
      try {
        const r = await vaultSeal(GRAPH_KEY, JSON.stringify(g));
        if (!r.ok && token === saveToken) persistNote = r.error;
        else if (token === saveToken) persistNote = null;
      } catch (e) {
        if (token === saveToken) persistNote = `sealing failed: ${String(e)} \u2014 the graph stays in memory this session rather than downgrading to plaintext silently`;
      }
    })();
    return;
  }
  const trimmed = (turnCap, sessionCap) => {
    const cut = {
      ...g,
      sessions: g.sessions.slice(-sessionCap).map((x) => ({
        ...x,
        messages: turnCap === null ? [] : x.messages.slice(-turnCap)
      }))
    };
    return JSON.stringify(cut);
  };
  const ladder = [{ value: JSON.stringify(g), dropped: "" }];
  if (g.sessions.some((x) => x.messages.length > 40)) {
    ladder.push({ value: trimmed(40, g.sessions.length), dropped: "kept the last 40 turns of each conversation (older turns dropped to fit the storage budget)" });
  }
  if (g.sessions.some((x) => x.messages.length > 10)) {
    ladder.push({ value: trimmed(10, g.sessions.length), dropped: "kept the last 10 turns of each conversation (older turns dropped to fit the storage budget)" });
  }
  if (g.sessions.some((x) => x.messages.length > 0)) {
    ladder.push({ value: trimmed(null, g.sessions.length), dropped: "dropped the transcripts; every conversation still keeps its date, title and keywords, so recall still finds it" });
  }
  if (g.sessions.length > 50) {
    ladder.push({ value: trimmed(10, 50), dropped: `kept the newest 50 conversations of ${g.sessions.length} (older ones dropped to fit the storage budget)` });
  }
  const w = writeFirstThatFits(GRAPH_KEY, ladder, s);
  persistNote = w.ok ? w.rung > 0 ? `memory degraded to fit storage \u2014 ${w.dropped}` : null : w.refused ?? null;
}
async function hydrateGraph() {
  const s = storage2();
  const raw = s?.getItem(GRAPH_KEY) ?? null;
  if (!isSealedEnvelope(raw)) {
    lockedAtBoot = false;
    loadGraph();
    return { sealed: false, locked: false, loaded: true };
  }
  const r = await vaultDecrypt(GRAPH_KEY);
  if (!r.found) return { sealed: true, locked: false, loaded: false };
  if (r.locked) {
    lockedAtBoot = true;
    return { sealed: true, locked: true, loaded: false };
  }
  try {
    const parsed = JSON.parse(r.text);
    if (parsed && parsed.version === 1) {
      memCache = parsed;
      lockedAtBoot = false;
      return { sealed: true, locked: false, loaded: true };
    }
  } catch {
  }
  return { sealed: true, locked: false, loaded: false };
}
function graphSecurityStatus() {
  const vs = vaultStatus().status;
  const s = storage2();
  const sealedOnDisk = isSealedEnvelope(s?.getItem(GRAPH_KEY) ?? null);
  const mode = sealedOnDisk ? vs === "unlocked" ? "sealed" : "locked" : "plaintext";
  const bootNote = lockedAtBoot && mode !== "sealed" ? "this graph is sealed on disk and stays hidden until the vault is unlocked" : null;
  return { mode, enabled: memoryEnabled(), note: persistNote ?? bootNote };
}
function memoryEnabled() {
  const s = storage2();
  if (!s) return true;
  return s.getItem(ENABLED_KEY) !== "off";
}
function setMemoryEnabled(on) {
  const s = storage2();
  if (!s) return;
  s.setItem(ENABLED_KEY, on ? "on" : "off");
}
function graph() {
  return loadGraph();
}
function titleFromMessages(messages) {
  const first = messages.find((m) => m.role === "user")?.text ?? messages[0]?.text ?? "a conversation";
  const t = first.replace(/\s+/g, " ").trim();
  return t.length > 52 ? `${t.slice(0, 49)}\u2026` : t || "a conversation";
}
function ingestSession(messages, opts) {
  if (!memoryEnabled()) {
    return {
      id: opts.id,
      title: opts.title ?? "memory off",
      startedAt: opts.startedAt ?? "",
      endedAt: opts.endedAt ?? "",
      messageCount: messages.length,
      keywords: [],
      digest: "memory-off",
      messages: []
    };
  }
  const texts = messages.map((m) => m.text).join("\n");
  const keywords = extractKeywords(texts, 10);
  const session = {
    id: opts.id,
    title: opts.title ?? titleFromMessages(messages),
    startedAt: opts.startedAt ?? messages[0]?.at ?? (/* @__PURE__ */ new Date()).toISOString(),
    endedAt: opts.endedAt ?? messages[messages.length - 1]?.at ?? (/* @__PURE__ */ new Date()).toISOString(),
    messageCount: messages.length,
    keywords,
    digest: hash(texts),
    messages: messages.slice(-MSG_CAP_PER_SESSION)
  };
  const g = loadGraph();
  const prev = g.sessions.find((x) => x.id === session.id);
  g.sessions = g.sessions.filter((x) => x.id !== session.id);
  g.sessions.push(session);
  if (g.sessions.length > SESSION_CAP) g.sessions.splice(0, g.sessions.length - SESSION_CAP);
  const kw = session.keywords;
  for (const k of kw) {
    const n = g.nodes.find((x) => x.id === k);
    if (n) {
      n.weight += prev && n.sessionIds.includes(session.id) ? 0 : 1;
      n.lastSeen = session.endedAt;
      if (!n.sessionIds.includes(session.id)) n.sessionIds.push(session.id);
    } else {
      g.nodes.push({ id: k, label: k, weight: 1, firstSeen: session.endedAt, lastSeen: session.endedAt, sessionIds: [session.id] });
    }
  }
  for (let i = 0; i < kw.length; i++) {
    for (let j = i + 1; j < kw.length; j++) {
      const [a, b] = kw[i] < kw[j] ? [kw[i], kw[j]] : [kw[j], kw[i]];
      const e = g.edges.find((x) => x.a === a && x.b === b);
      if (e) {
        e.weight += prev && e.sessionIds.includes(session.id) ? 0 : 1;
        if (!e.sessionIds.includes(session.id)) e.sessionIds.push(session.id);
      } else {
        g.edges.push({ a, b, weight: 1, sessionIds: [session.id] });
      }
    }
  }
  const sessionsDropped = Math.max(0, g.sessions.length - SESSION_CAP);
  let nodesDropped = 0;
  let edgesDropped = 0;
  if (g.nodes.length > NODE_CAP) {
    nodesDropped = g.nodes.length - NODE_CAP;
    g.nodes = g.nodes.sort((x, y) => y.weight - x.weight || (y.lastSeen < x.lastSeen ? -1 : 1)).slice(0, NODE_CAP);
  }
  if (g.edges.length > EDGE_CAP) {
    edgesDropped = g.edges.length - EDGE_CAP;
    g.edges = g.edges.sort((x, y) => y.weight - x.weight || 0).slice(0, EDGE_CAP);
  }
  if (nodesDropped || edgesDropped || sessionsDropped) {
    g.evicted = {
      nodes: (g.evicted?.nodes ?? 0) + nodesDropped,
      edges: (g.evicted?.edges ?? 0) + edgesDropped,
      sessions: (g.evicted?.sessions ?? 0) + sessionsDropped,
      at: session.endedAt
    };
  }
  saveGraph(g);
  return session;
}
function listSessions() {
  return loadGraph().sessions.slice().sort((a, b) => a.endedAt < b.endedAt ? 1 : -1);
}
function getSession(id) {
  return loadGraph().sessions.find((s) => s.id === id) ?? null;
}
function deleteSession(id) {
  if (!memoryEnabled()) return;
  const g = loadGraph();
  g.sessions = g.sessions.filter((s) => s.id !== id);
  for (const n of g.nodes) n.sessionIds = n.sessionIds.filter((x) => x !== id);
  for (const e of g.edges) e.sessionIds = e.sessionIds.filter((x) => x !== id);
  saveGraph(g);
}
function clearGraph() {
  const s = storage2();
  if (s) {
    s.removeItem(GRAPH_KEY);
    s.removeItem(ENABLED_KEY);
  }
  memCache = null;
  lockedAtBoot = false;
  persistNote = null;
}
function stem(word) {
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}
function aliasesOf(word) {
  return ALIAS_OF.get(word) ?? [word];
}
function wordHit(lowerText, term) {
  if (!lowerText.includes(term)) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term)}([^a-z0-9]|$)`).test(lowerText);
}
function parseDateWindow(query, now = () => /* @__PURE__ */ new Date()) {
  const q = query.toLowerCase();
  const day = 24 * 3600 * 1e3;
  const startOfDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const n = now();
  const todayStart = startOfDay(n);
  const rel = /(\d+)\s*(day|days|week|weeks|month|months)\s+ago/.exec(q);
  if (rel) {
    const span = Number(rel[1]);
    const unit = rel[2].startsWith("week") ? 7 * day : rel[2].startsWith("month") ? 30 * day : day;
    const end = todayStart + day;
    return [todayStart - span * unit, end];
  }
  if (/\byesterday\b/.test(q)) return [todayStart - day, todayStart];
  if (/\btoday\b/.test(q)) return [todayStart, todayStart + day];
  if (/\blast\s+week\b/.test(q)) return [todayStart - 7 * day, todayStart + day];
  if (/\blast\s+month\b/.test(q)) return [todayStart - 30 * day, todayStart + day];
  const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(q);
  if (iso) {
    const t = Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return [t, t + day];
  }
  const dmy = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})[a-z]*(?:\s+(\d{4}))?/.exec(q);
  const myd = /([a-z]{3})[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/.exec(q);
  const m = dmy ?? myd;
  if (m) {
    const dayN = dmy ? Number(m[1]) : Number(m[2]);
    const monStr = dmy ? m[2] : m[1];
    const mon = MONTHS.indexOf(monStr.slice(0, 3));
    if (mon >= 0 && dayN >= 1 && dayN <= 31) {
      const year = Number(m[3] ?? n.getUTCFullYear());
      const t = Date.UTC(year, mon, dayN);
      return [t, t + day];
    }
  }
  return null;
}
function recall(query, limit = 5, now = () => /* @__PURE__ */ new Date()) {
  const g = loadGraph();
  if (g.sessions.length === 0) return [];
  const qk = extractKeywords(query, 10);
  const win = parseDateWindow(query, now);
  const weightOf = new Map(g.nodes.map((n) => [n.id, n.weight]));
  const probes = /* @__PURE__ */ new Map();
  const addProbe = (term, original) => {
    if (!probes.has(term)) probes.set(term, original);
  };
  for (const word of qk) {
    addProbe(word, word);
    addProbe(stem(word), word);
    for (const alias of aliasesOf(word)) {
      addProbe(alias, word);
      addProbe(stem(alias), word);
    }
  }
  const out = [];
  for (const s of g.sessions) {
    const sKeys = /* @__PURE__ */ new Set();
    for (const k of s.keywords) {
      sKeys.add(k);
      sKeys.add(stem(k));
    }
    const hay = s.messages.map((msg) => msg.text.toLowerCase());
    const seen = /* @__PURE__ */ new Set();
    const matched = [];
    for (const [term, original] of probes) {
      if (seen.has(original)) continue;
      if (sKeys.has(term) || hay.some((text) => wordHit(text, term))) {
        seen.add(original);
        matched.push(original);
      }
    }
    let score = matched.reduce((acc, k) => acc + 1 + Math.min(2, (weightOf.get(k) ?? weightOf.get(stem(k)) ?? 1) / 10), 0);
    const inWin = win ? Date.parse(s.startedAt) >= win[0] && Date.parse(s.startedAt) < win[1] : false;
    if (win) score += inWin ? 2.5 : -1.5;
    if (score <= 0) continue;
    out.push({ session: s, score, matchedKeywords: matched, dateMatch: inWin });
  }
  out.sort((a, b) => b.score - a.score || (a.session.endedAt < b.session.endedAt ? 1 : -1));
  return out.slice(0, limit);
}
function rehydrate(sessionId, maxTurns = 8, perMessageCap = 240) {
  const s = getSession(sessionId);
  if (!s) return null;
  const turns = s.messages.slice(-maxTurns);
  const lines = [];
  lines.push(`${REHYDRATION_MARK} "${s.title}") \u2500\u2500`);
  lines.push(`took place ${s.startedAt.slice(0, 10)} \u2192 ${s.endedAt.slice(0, 10)} \xB7 ${s.messageCount} message(s) \xB7 keywords: ${s.keywords.join(", ")}`);
  lines.push("prior exchange (most recent last, trimmed):");
  for (const m of turns) {
    const who = m.role === "user" ? "user" : "steward";
    const t = m.text.replace(/\s+/g, " ").trim();
    lines.push(`${who}: ${t.length > perMessageCap ? `${t.slice(0, perMessageCap - 1)}\u2026` : t}`);
  }
  lines.push("\u2500\u2500 end of rehydrated context \u2014 continue naturally from the user's new message below \u2500\u2500");
  return { preamble: lines.join("\n"), session: s };
}
function graphView(maxNodes = 24) {
  const g = loadGraph();
  const nodes = g.nodes.slice().sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, maxNodes);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = g.edges.filter((e) => ids.has(e.a) && ids.has(e.b)).slice(0, 80);
  return { nodes, edges };
}
function graphStats() {
  const g = loadGraph();
  return { sessions: g.sessions.length, nodes: g.nodes.length, edges: g.edges.length, evicted: g.evicted ?? null };
}
var GRAPH_KEY, ENABLED_KEY, NODE_CAP, EDGE_CAP, SESSION_CAP, MSG_CAP_PER_SESSION, STOP, EMPTY, memCache, lockedAtBoot, saveToken, persistNote, persistInFlight, ALIAS_GROUPS, ALIAS_OF, escapeRe, MONTHS, REHYDRATION_MARK;
var init_memoryGraph = __esm({
  "src/engine/memoryGraph.ts"() {
    "use strict";
    init_vault();
    init_quotaSafe();
    GRAPH_KEY = "engine.memgraph.v1";
    ENABLED_KEY = "engine.memgraph.enabled.v1";
    NODE_CAP = 4e3;
    EDGE_CAP = 9e3;
    SESSION_CAP = 300;
    MSG_CAP_PER_SESSION = 200;
    STOP = new Set(
      "a an the and or but if then else of to in on at for with from by as is are was were be been being do does did i you he she it we they me him her us them my your his its our their this that these those there here what which who whom when where why how not no yes so than too very can will just should now also into about over under again once only own same s t don ll re ve m y need want make made get got go went have has had please thanks thank okay ok hi hello hey uh um the thing things something anything nothing everything".split(" ")
    );
    EMPTY = { version: 1, nodes: [], edges: [], sessions: [], updatedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
    memCache = null;
    lockedAtBoot = false;
    saveToken = 0;
    persistNote = null;
    persistInFlight = Promise.resolve();
    ALIAS_GROUPS = [
      ["sandbox", "sandboxed", "isolation", "isolate", "jail", "confinement", "container"],
      ["database", "db", "sql", "postgres", "postgresql", "sqlite", "query", "storage"],
      ["receipt", "receipts", "proof", "attestation", "ledger", "audit", "tamper"],
      ["gate", "approval", "approve", "signoff", "oversight", "human"],
      ["error", "bug", "failure", "failed", "crash", "broke", "broken", "defect"],
      ["deploy", "deployment", "release", "ship", "shipped", "rollout", "publish"],
      ["key", "credential", "secret", "token", "password", "vault", "passphrase"],
      ["memory", "recall", "remember", "context", "history", "rehydrate"],
      ["test", "tests", "testing", "spec", "probe", "suite"],
      ["invoice", "bill", "payment", "billing", "charge", "refund", "subscription"],
      ["meeting", "call", "calendar", "schedule", "appointment", "booking", "reservation"],
      ["travel", "flight", "trip", "itinerary", "hotel", "airline"],
      ["permission", "scope", "authority", "envelope", "mandate", "capability"],
      ["cost", "price", "pricing", "budget", "spend", "token"],
      ["agent", "crew", "specialist", "teammate", "steward"]
    ];
    ALIAS_OF = /* @__PURE__ */ new Map();
    for (const group of ALIAS_GROUPS) {
      for (const term of group) {
        const set = ALIAS_OF.get(term) ?? [];
        for (const other of group) if (other !== term && !set.includes(other)) set.push(other);
        set.push(term);
        ALIAS_OF.set(term, set);
      }
    }
    escapeRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    REHYDRATION_MARK = "\u2500\u2500 rehydrated context (from an earlier conversation";
  }
});

// probe/vaultSecurity.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var MemStore = class {
  m = /* @__PURE__ */ new Map();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  key(i) {
    return Array.from(this.m.keys())[i] ?? null;
  }
  removeItem(k) {
    this.m.delete(k);
  }
  setItem(k, v) {
    this.m.set(k, v);
  }
};
globalThis.localStorage = new MemStore();
var vault = await Promise.resolve().then(() => (init_vault(), vault_exports));
var mg = await Promise.resolve().then(() => (init_memoryGraph(), memoryGraph_exports));
var PROVIDER_KEY = "vh.provider.remembered.v1";
console.log("== the vault: set, seal, open ==");
ok("a short passphrase is refused in words", !(await vault.setVaultPassphrase("short")).ok);
var created = await vault.setVaultPassphrase("correct horse battery staple");
ok("a real passphrase creates the vault", created.ok === true && created.created === true);
ok("the meta record stores NO passphrase material", !JSON.stringify(globalThis.localStorage?.getItem("vh.vault.meta.v1")).toLowerCase().includes("horse"));
await vault.vaultSeal("vh.test.secret", '{"apiKey":"sk-super-secret-value-123"}');
var sealedRaw = globalThis.localStorage?.getItem("vh.test.secret") ?? "";
ok("the sealed record is a vault envelope", sealedRaw.includes("si-vault/1"));
ok("the sealed record does NOT contain the plaintext", !sealedRaw.includes("sk-super-secret-value-123"));
var opened = await vault.vaultDecrypt("vh.test.secret");
ok("an unlocked vault reads the secret back", opened.found && !opened.locked && opened.text.includes("sk-super-secret-value-123"));
console.log("== wrong passphrases and locking fail closed ==");
vault.lockVault();
var lockedRead = await vault.vaultDecrypt("vh.test.secret");
ok("a locked vault says LOCKED, never guesses", lockedRead.found && lockedRead.locked === true);
var wrong = await vault.setVaultPassphrase("wrong passphrase entirely!!");
ok("a wrong passphrase does NOT open the vault", wrong.ok === false && wrong.error.toLowerCase().includes("did not open"));
var right = await vault.setVaultPassphrase("correct horse battery staple");
ok("the right passphrase reopens it (created:false)", right.ok === true && right.created === false);
var again = await vault.vaultDecrypt("vh.test.secret");
ok("the secret is readable again after re-unlock", again.found && !again.locked && again.text.includes("sk-super-secret-value-123"));
console.log("== the provider path: legacy plaintext is purged, never kept ==");
globalThis.localStorage?.setItem(PROVIDER_KEY, JSON.stringify({ kind: "openai-compatible", baseUrl: "https://api.openai.com/v1", apiKey: "sk-legacy-plaintext-key", model: "gpt-4.1" }));
var purged = vault.purgePlain(PROVIDER_KEY);
ok("the legacy plaintext record is found and REMOVED from storage", purged.found && globalThis.localStorage?.getItem(PROVIDER_KEY) === null);
ok("the purge returns the raw text so the caller can migrate it", purged.text?.includes("sk-legacy-plaintext-key") === true);
var resealed = await vault.vaultSeal(PROVIDER_KEY, purged.text ?? "");
ok("the migrated key re-seals into the vault", resealed.ok === true && !(globalThis.localStorage?.getItem(PROVIDER_KEY) ?? "").includes("sk-legacy-plaintext-key"));
console.log("== the memory graph: sealed at rest, honest when locked, pausable ==");
mg.clearGraph();
var at = (h) => new Date(Date.UTC(2026, 8, 19, 10 + h, 0, 0)).toISOString();
mg.ingestSession([
  { role: "user", text: "Plan the Zephyr migration for Friday and keep the ledger verified", at: at(0) },
  { role: "vh", text: "The Zephyr migration plan is staged with verification gates.", at: at(1) }
], { id: "chat-vault-1" });
await mg.flushGraphPersist();
ok("ingestion works while unlocked", mg.graphStats().sessions === 1);
var rawAfterSave = globalThis.localStorage?.getItem("engine.memgraph.v1") ?? "";
ok("with the vault unlocked, the graph at rest is a SEALED envelope", rawAfterSave.includes("si-vault/1"));
ok("the sealed graph does NOT contain conversation text", !rawAfterSave.includes("Zephyr migration"));
ok("graphSecurityStatus says sealed", mg.graphSecurityStatus().mode === "sealed");
vault.lockVault();
ok("locked: the status says so in words", mg.graphSecurityStatus().mode === "locked");
var hydLocked = await mg.hydrateGraph();
ok("hydration while locked reports locked and loads NOTHING", hydLocked.locked === true && hydLocked.loaded === false);
var right2 = await vault.setVaultPassphrase("correct horse battery staple");
ok("re-unlock works", right2.ok === true);
var hyd = await mg.hydrateGraph();
ok("hydration after unlock restores the graph", hyd.loaded === true && mg.graphStats().sessions === 1 && mg.listSessions()[0]?.keywords.includes("zephyr"));
console.log("== the memory ON/OFF switch ==");
mg.setMemoryEnabled(false);
ok("the switch reports off", mg.memoryEnabled() === false);
mg.ingestSession([{ role: "user", text: "this must not be stored anywhere at all", at: at(5) }], { id: "chat-vault-2" });
ok("memory OFF: ingestion stores nothing", mg.graphStats().sessions === 1 && mg.listSessions().every((s) => s.id !== "chat-vault-2"));
mg.setMemoryEnabled(true);
mg.ingestSession([{ role: "user", text: "resumed storage works again with fresh keywords quartz lantern", at: at(6) }], { id: "chat-vault-2" });
await mg.flushGraphPersist();
ok("memory ON resumes ingestion", mg.graphStats().sessions === 2);
console.log("== the plaintext mode is stated, never hidden ==");
vault.destroyVault();
mg.ingestSession([{ role: "user", text: "plain mode store frank pattern", at: at(7) }], { id: "chat-vault-3" });
await mg.flushGraphPersist();
var rawPlain = globalThis.localStorage?.getItem("engine.memgraph.v1") ?? "";
ok("without a vault, the graph persists as readable JSON (the honest fallback)", rawPlain.includes("frank") && !rawPlain.includes("si-vault/1"));
ok("graphSecurityStatus names the mode 'plaintext'", mg.graphSecurityStatus().mode === "plaintext");
mg.clearGraph();
ok("clearGraph wipes every form", mg.graphStats().sessions === 0 && globalThis.localStorage?.getItem("engine.memgraph.v1") === null);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
