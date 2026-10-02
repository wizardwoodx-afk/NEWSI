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
function readMeta() {
  const s2 = storage();
  if (!s2) return null;
  try {
    const raw = JSON.parse(s2.getItem(VAULT_META_KEY) ?? "null");
    return raw && raw.v === "si-vault-meta/1" ? raw : null;
  } catch {
    return null;
  }
}
function vaultStatus() {
  const meta = readMeta();
  if (!meta) return { status: "no-passphrase", created: false, kdf: null, iterations: null };
  if (sessionKey) return { status: "unlocked", created: true, kdf: meta.kdf, iterations: meta.iterations };
  return { status: "sealed-locked", created: true, kdf: meta.kdf, iterations: meta.iterations };
}
async function vaultSeal(name, text2, now = () => /* @__PURE__ */ new Date()) {
  if (!sessionKey) return { ok: false, error: "the vault is locked \u2014 set or enter the passphrase before anything is sealed" };
  const meta = sessionParams?.meta;
  const salt = sessionParams?.salt;
  if (!meta || !salt) return { ok: false, error: "vault session state is missing \u2014 lock and unlock again" };
  try {
    const iv = randomBytes(12);
    const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, sessionKey, enc.encode(text2));
    const record = { v: VAULT_FORMAT, saltB64: toB64(salt), ivB64: toB64(iv), cipherB64: toB64(cipher), kdf: "PBKDF2-SHA-256", iterations: meta.iterations, sealedAt: now().toISOString() };
    const s2 = storage();
    if (!s2) return { ok: false, error: "no storage in this runtime \u2014 nothing was sealed" };
    s2.setItem(name, JSON.stringify(record));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `sealing failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
async function vaultDecrypt(name) {
  const s2 = storage();
  if (!s2) return { found: false };
  const raw = s2.getItem(name);
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
var VAULT_FORMAT, VAULT_META_KEY, enc, dec, toB64, fromB64, sessionKey, sessionParams;
var init_vault = __esm({
  "src/engine/vault.ts"() {
    "use strict";
    VAULT_FORMAT = "si-vault/1";
    VAULT_META_KEY = "vh.vault.meta.v1";
    enc = new TextEncoder();
    dec = new TextDecoder();
    toB64 = (buf) => {
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
      let s2 = "";
      for (let b = 0; b < u8.length; b++) s2 += String.fromCharCode(u8[b]);
      return btoa(s2);
    };
    fromB64 = (s2) => Uint8Array.from(atob(s2), (c) => c.charCodeAt(0));
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
  const s2 = resolveStorage(store);
  if (!s2) return [];
  try {
    const raw = s2.getItem?.(NOTICE_KEY) ?? null;
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function notePersist(key, kind, detail, store) {
  const s2 = resolveStorage(store);
  if (!s2) return;
  try {
    const list = persistNotices(s2);
    list.push({ at: (/* @__PURE__ */ new Date()).toISOString(), key, kind, detail });
    const trimmed = list.slice(-NOTICE_CAP);
    s2.setItem?.(NOTICE_KEY, JSON.stringify(trimmed));
  } catch {
  }
}
function writeFirstThatFits(key, ladder, store) {
  const rungs = ladder.length;
  const s2 = resolveStorage(store);
  if (rungs === 0) {
    const refused2 = "no payload was offered (empty write ladder) \u2014 nothing was written.";
    notePersist(key, "refused", refused2, store);
    return { ok: false, rung: -1, rungs, dropped: "", refused: refused2 };
  }
  if (!s2) {
    return { ok: false, rung: -1, rungs, dropped: "", refused: "no storage on this host \u2014 the caller's in-memory copy is the session's only record." };
  }
  for (let i = 0; i < rungs; i++) {
    const rung = ladder[i];
    try {
      s2.setItem(key, rung.value);
      if (i > 0) {
        notePersist(key, "degraded", `rung ${i}/${rungs - 1}: ${rung.dropped}`, s2);
      }
      return { ok: true, rung: i, rungs, dropped: i > 0 ? rung.dropped : "" };
    } catch (e) {
      if (!isQuotaError(e)) {
        const refused2 = `write to "${key}" failed for a non-quota reason (${String(e)}) \u2014 refused rather than shrinking the payload, which would not have helped.`;
        notePersist(key, "refused", refused2, s2);
        return { ok: false, rung: -1, rungs, dropped: "", refused: refused2 };
      }
    }
  }
  const refused = `every rung of the ladder failed on quota \u2014 even the smallest payload does not fit this origin. Nothing was written; the caller keeps its in-memory copy.`;
  notePersist(key, "refused", refused, s2);
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
function extractKeywords(text2, max = 8) {
  const words = text2.toLowerCase().replace(/[^a-z0-9\s'-]/g, " ").split(/\s+/).filter(Boolean);
  const freq = /* @__PURE__ */ new Map();
  const caps = /* @__PURE__ */ new Set();
  for (const raw of text2.split(/\s+/)) {
    const w = raw.toLowerCase().replace(/[^a-z0-9\s'-]/g, "");
    if (!w) caps.add("__noop__");
  }
  const capTokens = /* @__PURE__ */ new Set();
  for (const raw of text2.split(/\s+/)) {
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
  return scored.slice(0, Math.max(1, max)).map((s2) => s2.word);
}
function hash(text2) {
  let h = 2166136261;
  for (let i = 0; i < text2.length; i++) {
    h ^= text2.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let h2 = 2166136261 ^ 2654435769;
  for (let i = text2.length - 1; i >= 0; i--) {
    h2 ^= text2.charCodeAt(i);
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
  const s2 = storage2();
  if (!s2) {
    if (!memCache) memCache = { ...EMPTY, nodes: [], edges: [], sessions: [] };
    return memCache;
  }
  const raw = s2.getItem(GRAPH_KEY);
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
function saveGraph(g2) {
  memCache = g2;
  const s2 = storage2();
  if (!s2) return;
  g2.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const token = ++saveToken;
  if (vaultStatus().status === "unlocked") {
    s2.removeItem(GRAPH_KEY);
    persistInFlight = (async () => {
      try {
        const r2 = await vaultSeal(GRAPH_KEY, JSON.stringify(g2));
        if (!r2.ok && token === saveToken) persistNote = r2.error;
        else if (token === saveToken) persistNote = null;
      } catch (e) {
        if (token === saveToken) persistNote = `sealing failed: ${String(e)} \u2014 the graph stays in memory this session rather than downgrading to plaintext silently`;
      }
    })();
    return;
  }
  const trimmed = (turnCap, sessionCap) => {
    const cut = {
      ...g2,
      sessions: g2.sessions.slice(-sessionCap).map((x) => ({
        ...x,
        messages: turnCap === null ? [] : x.messages.slice(-turnCap)
      }))
    };
    return JSON.stringify(cut);
  };
  const ladder = [{ value: JSON.stringify(g2), dropped: "" }];
  if (g2.sessions.some((x) => x.messages.length > 40)) {
    ladder.push({ value: trimmed(40, g2.sessions.length), dropped: "kept the last 40 turns of each conversation (older turns dropped to fit the storage budget)" });
  }
  if (g2.sessions.some((x) => x.messages.length > 10)) {
    ladder.push({ value: trimmed(10, g2.sessions.length), dropped: "kept the last 10 turns of each conversation (older turns dropped to fit the storage budget)" });
  }
  if (g2.sessions.some((x) => x.messages.length > 0)) {
    ladder.push({ value: trimmed(null, g2.sessions.length), dropped: "dropped the transcripts; every conversation still keeps its date, title and keywords, so recall still finds it" });
  }
  if (g2.sessions.length > 50) {
    ladder.push({ value: trimmed(10, 50), dropped: `kept the newest 50 conversations of ${g2.sessions.length} (older ones dropped to fit the storage budget)` });
  }
  const w = writeFirstThatFits(GRAPH_KEY, ladder, s2);
  persistNote = w.ok ? w.rung > 0 ? `memory degraded to fit storage \u2014 ${w.dropped}` : null : w.refused ?? null;
}
async function hydrateGraph() {
  const s2 = storage2();
  const raw = s2?.getItem(GRAPH_KEY) ?? null;
  if (!isSealedEnvelope(raw)) {
    lockedAtBoot = false;
    loadGraph();
    return { sealed: false, locked: false, loaded: true };
  }
  const r2 = await vaultDecrypt(GRAPH_KEY);
  if (!r2.found) return { sealed: true, locked: false, loaded: false };
  if (r2.locked) {
    lockedAtBoot = true;
    return { sealed: true, locked: true, loaded: false };
  }
  try {
    const parsed = JSON.parse(r2.text);
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
  const s2 = storage2();
  const sealedOnDisk = isSealedEnvelope(s2?.getItem(GRAPH_KEY) ?? null);
  const mode = sealedOnDisk ? vs === "unlocked" ? "sealed" : "locked" : "plaintext";
  const bootNote = lockedAtBoot && mode !== "sealed" ? "this graph is sealed on disk and stays hidden until the vault is unlocked" : null;
  return { mode, enabled: memoryEnabled(), note: persistNote ?? bootNote };
}
function memoryEnabled() {
  const s2 = storage2();
  if (!s2) return true;
  return s2.getItem(ENABLED_KEY) !== "off";
}
function setMemoryEnabled(on) {
  const s2 = storage2();
  if (!s2) return;
  s2.setItem(ENABLED_KEY, on ? "on" : "off");
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
  const g2 = loadGraph();
  const prev = g2.sessions.find((x) => x.id === session.id);
  g2.sessions = g2.sessions.filter((x) => x.id !== session.id);
  g2.sessions.push(session);
  if (g2.sessions.length > SESSION_CAP) g2.sessions.splice(0, g2.sessions.length - SESSION_CAP);
  const kw = session.keywords;
  for (const k of kw) {
    const n = g2.nodes.find((x) => x.id === k);
    if (n) {
      n.weight += prev && n.sessionIds.includes(session.id) ? 0 : 1;
      n.lastSeen = session.endedAt;
      if (!n.sessionIds.includes(session.id)) n.sessionIds.push(session.id);
    } else {
      g2.nodes.push({ id: k, label: k, weight: 1, firstSeen: session.endedAt, lastSeen: session.endedAt, sessionIds: [session.id] });
    }
  }
  for (let i = 0; i < kw.length; i++) {
    for (let j = i + 1; j < kw.length; j++) {
      const [a, b] = kw[i] < kw[j] ? [kw[i], kw[j]] : [kw[j], kw[i]];
      const e = g2.edges.find((x) => x.a === a && x.b === b);
      if (e) {
        e.weight += prev && e.sessionIds.includes(session.id) ? 0 : 1;
        if (!e.sessionIds.includes(session.id)) e.sessionIds.push(session.id);
      } else {
        g2.edges.push({ a, b, weight: 1, sessionIds: [session.id] });
      }
    }
  }
  const sessionsDropped = Math.max(0, g2.sessions.length - SESSION_CAP);
  let nodesDropped = 0;
  let edgesDropped = 0;
  if (g2.nodes.length > NODE_CAP) {
    nodesDropped = g2.nodes.length - NODE_CAP;
    g2.nodes = g2.nodes.sort((x, y) => y.weight - x.weight || (y.lastSeen < x.lastSeen ? -1 : 1)).slice(0, NODE_CAP);
  }
  if (g2.edges.length > EDGE_CAP) {
    edgesDropped = g2.edges.length - EDGE_CAP;
    g2.edges = g2.edges.sort((x, y) => y.weight - x.weight || 0).slice(0, EDGE_CAP);
  }
  if (nodesDropped || edgesDropped || sessionsDropped) {
    g2.evicted = {
      nodes: (g2.evicted?.nodes ?? 0) + nodesDropped,
      edges: (g2.evicted?.edges ?? 0) + edgesDropped,
      sessions: (g2.evicted?.sessions ?? 0) + sessionsDropped,
      at: session.endedAt
    };
  }
  saveGraph(g2);
  return session;
}
function listSessions() {
  return loadGraph().sessions.slice().sort((a, b) => a.endedAt < b.endedAt ? 1 : -1);
}
function getSession(id) {
  return loadGraph().sessions.find((s2) => s2.id === id) ?? null;
}
function deleteSession(id) {
  if (!memoryEnabled()) return;
  const g2 = loadGraph();
  g2.sessions = g2.sessions.filter((s2) => s2.id !== id);
  for (const n of g2.nodes) n.sessionIds = n.sessionIds.filter((x) => x !== id);
  for (const e of g2.edges) e.sessionIds = e.sessionIds.filter((x) => x !== id);
  saveGraph(g2);
}
function clearGraph() {
  const s2 = storage2();
  if (s2) {
    s2.removeItem(GRAPH_KEY);
    s2.removeItem(ENABLED_KEY);
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
  const g2 = loadGraph();
  if (g2.sessions.length === 0) return [];
  const qk = extractKeywords(query, 10);
  const win = parseDateWindow(query, now);
  const weightOf = new Map(g2.nodes.map((n) => [n.id, n.weight]));
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
  for (const s2 of g2.sessions) {
    const sKeys = /* @__PURE__ */ new Set();
    for (const k of s2.keywords) {
      sKeys.add(k);
      sKeys.add(stem(k));
    }
    const hay = s2.messages.map((msg) => msg.text.toLowerCase());
    const seen = /* @__PURE__ */ new Set();
    const matched = [];
    for (const [term, original] of probes) {
      if (seen.has(original)) continue;
      if (sKeys.has(term) || hay.some((text2) => wordHit(text2, term))) {
        seen.add(original);
        matched.push(original);
      }
    }
    let score = matched.reduce((acc, k) => acc + 1 + Math.min(2, (weightOf.get(k) ?? weightOf.get(stem(k)) ?? 1) / 10), 0);
    const inWin = win ? Date.parse(s2.startedAt) >= win[0] && Date.parse(s2.startedAt) < win[1] : false;
    if (win) score += inWin ? 2.5 : -1.5;
    if (score <= 0) continue;
    out.push({ session: s2, score, matchedKeywords: matched, dateMatch: inWin });
  }
  out.sort((a, b) => b.score - a.score || (a.session.endedAt < b.session.endedAt ? 1 : -1));
  return out.slice(0, limit);
}
function rehydrate(sessionId, maxTurns = 8, perMessageCap = 240) {
  const s2 = getSession(sessionId);
  if (!s2) return null;
  const turns = s2.messages.slice(-maxTurns);
  const lines = [];
  lines.push(`${REHYDRATION_MARK} "${s2.title}") \u2500\u2500`);
  lines.push(`took place ${s2.startedAt.slice(0, 10)} \u2192 ${s2.endedAt.slice(0, 10)} \xB7 ${s2.messageCount} message(s) \xB7 keywords: ${s2.keywords.join(", ")}`);
  lines.push("prior exchange (most recent last, trimmed):");
  for (const m of turns) {
    const who = m.role === "user" ? "user" : "steward";
    const t = m.text.replace(/\s+/g, " ").trim();
    lines.push(`${who}: ${t.length > perMessageCap ? `${t.slice(0, perMessageCap - 1)}\u2026` : t}`);
  }
  lines.push("\u2500\u2500 end of rehydrated context \u2014 continue naturally from the user's new message below \u2500\u2500");
  return { preamble: lines.join("\n"), session: s2 };
}
function graphView(maxNodes = 24) {
  const g2 = loadGraph();
  const nodes = g2.nodes.slice().sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, maxNodes);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = g2.edges.filter((e) => ids.has(e.a) && ids.has(e.b)).slice(0, 80);
  return { nodes, edges };
}
function graphStats() {
  const g2 = loadGraph();
  return { sessions: g2.sessions.length, nodes: g2.nodes.length, edges: g2.edges.length, evicted: g2.evicted ?? null };
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

// probe/memoryGraph.test.ts
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
var mg = await Promise.resolve().then(() => (init_memoryGraph(), memoryGraph_exports));
console.log("== keyword extraction is deterministic and honest ==");
var text = "SelfImpulse signs every mission receipt with OpenSSL and the SelfImpulse ledger; the receipt chain is verified nightly.";
var k1 = mg.extractKeywords(text);
var k2 = mg.extractKeywords(text);
ok("same text in, same keywords out", JSON.stringify(k1) === JSON.stringify(k2) && k1.length > 0);
ok("stopwords never become nodes", !k1.includes("the") && !k1.includes("with") && !k1.includes("every"));
ok("proper nouns rank up (selfimpulse present)", k1.includes("selfimpulse"));
ok("cap at the requested max", mg.extractKeywords(text, 3).length === 3);
console.log("== ingest: a conversation becomes a graph session ==");
mg.clearGraph();
var at = (h) => new Date(Date.UTC(2026, 8, 12, 10 + h, 0, 0)).toISOString();
var convo = [
  { role: "user", text: "Deploy the SelfImpulse federation bridge on Tuesday and verify the ledger", at: at(0) },
  { role: "vh", text: "The federation bridge deployment plan: sign the grant, run the crossing, compare ledger roots.", at: at(1) },
  { role: "user", text: "Also remember the Zephyr database migration for the SelfImpulse dashboard", at: at(2) },
  { role: "vh", text: "Noted: the Zephyr migration for the SelfImpulse dashboard joins the mission ledger.", at: at(3) }
];
var s = mg.ingestSession(convo, { id: "chat-test-1" });
ok("the session carries the dated transcript", s.messageCount === 4 && s.messages.length === 4);
ok("the session title comes from the first user message", s.title.startsWith("Deploy the SelfImpulse federation bridge"));
ok("keywords were drawn from the whole conversation", s.keywords.includes("federation") || s.keywords.includes("selfimpulse") || s.keywords.includes("zephyr"));
var g = mg.graph();
ok("graph nodes exist for the session keywords", g.nodes.length >= 3);
ok("co-occurrence edges exist", g.edges.length >= 3);
ok("every node records the session id", g.nodes.every((n) => n.sessionIds.includes("chat-test-1")));
console.log("== upsert is idempotent per session ==");
var before = mg.graph().nodes.length;
mg.ingestSession(convo, { id: "chat-test-1" });
ok("re-ingesting the same session does not fork nodes", mg.graph().nodes.find((n) => n.id === "federation")?.weight === 1 && mg.graph().sessions.filter((x) => x.id === "chat-test-1").length === 1);
ok("node count stable across upsert", mg.graph().nodes.length >= before);
console.log("== recall by keywords ==");
var byKw = mg.recall("what happened with the zephyr database migration?");
ok("a keyword query finds the session", byKw.length >= 1 && byKw[0].session.id === "chat-test-1");
ok("the matched keywords are named, not vibes", byKw[0].matchedKeywords.includes("zephyr") || byKw[0].matchedKeywords.includes("database") || byKw[0].matchedKeywords.includes("migration"));
console.log("== recall by date ('that day') ==");
var byDate = mg.recall("on 12 september what did we do about the federation bridge?", 5, () => new Date(Date.UTC(2026, 8, 19)));
ok("a dated query recalls the session", byDate.length >= 1 && byDate[0].session.id === "chat-test-1");
ok("the date window matched", byDate[0].dateMatch === true);
ok("an unrelated query recalls nothing \u2014 honestly", mg.recall("quantum flibbertigibbet engines").length === 0);
console.log("== rehydration is marked and trimmed ==");
var r = mg.rehydrate("chat-test-1");
ok("rehydrate returns the session", r !== null && r.session.id === "chat-test-1");
if (r) {
  ok("the preamble carries the REHYDRATION MARK", r.preamble.includes(mg.REHYDRATION_MARK));
  ok("the preamble names the keywords", r.preamble.includes("keywords:"));
  ok("the preamble carries prior turns labelled", r.preamble.includes("user:") && r.preamble.includes("steward:"));
}
ok("rehydrating an unknown session is an honest null", mg.rehydrate("nope") === null);
console.log("== the view and the stats ==");
var gv = mg.graphView(24);
ok("graphView returns renderable nodes+edges", gv.nodes.length >= 3 && gv.edges.length >= 3);
var st = mg.graphStats();
ok("graphStats counts sessions, nodes, edges", st.sessions >= 1 && st.nodes >= 3 && st.edges >= 3);
console.log("== deletion ==");
mg.deleteSession("chat-test-1");
ok("the session is gone after delete", mg.listSessions().every((x) => x.id !== "chat-test-1"));
mg.clearGraph();
ok("clearGraph empties everything", mg.graphStats().sessions === 0 && mg.graphStats().nodes === 0);
console.log(`
${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nfailures:");
  for (const f of failures) console.log(`  - ${f}`);
}
process.exit(failed > 0 ? 1 : 0);
