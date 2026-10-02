import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/dreaming.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/app/id.ts
var degradedSeq = 0;
function cryptoToken() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  degradedSeq += 1;
  return `nocrypto-fallback-${degradedSeq.toString(36)}`;
}
function uid(prefix) {
  return `${prefix}-${cryptoToken()}`;
}
function nowIso() {
  return (/* @__PURE__ */ new Date()).toISOString();
}

// src/engine/dreaming.ts
var WATERMARK_KEY = "engine.dream.v1";
var DURABLE_KEY = "engine.dream.mem.v1";
var MIN_EVIDENCE = 3;
var MIN_SESSIONS = 2;
var MIN_CONFIDENCE = 0.6;
var RETIRE_BELOW = 0.25;
var STRENGTH_GAIN = 0.34;
var STRENGTH_DECAY = 0.15;
var DECAY_GRACE_DAYS = 2;
var DURABLE_CAP = 120;
function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
var PENDING_CAP = 80;
function loadWatermark() {
  const s = storage();
  const empty = { seen: [], lastPass: null, passes: 0, pending: [] };
  if (!s) return empty;
  try {
    const raw = JSON.parse(s.getItem(WATERMARK_KEY) ?? "null");
    if (!raw || !Array.isArray(raw.seen)) return empty;
    return {
      seen: raw.seen,
      lastPass: raw.lastPass ?? null,
      passes: raw.passes ?? 0,
      pending: Array.isArray(raw.pending) ? raw.pending : []
    };
  } catch {
    return empty;
  }
}
function saveWatermark(w) {
  const s = storage();
  if (s) s.setItem(WATERMARK_KEY, JSON.stringify({ ...w, seen: w.seen.slice(-2e3) }));
}
function loadDurable(userId) {
  const s = storage();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(DURABLE_KEY) ?? "[]");
    const ok = Array.isArray(raw) ? raw.filter((m) => m && typeof m.statement === "string") : [];
    return userId ? ok.filter((m) => (m.userId ?? "default") === userId) : ok;
  } catch {
    return [];
  }
}
function saveDurable(all) {
  const s = storage();
  if (!s) return;
  const byUser = /* @__PURE__ */ new Map();
  for (const m of all) {
    const u = m.userId ?? "default";
    const list = byUser.get(u);
    if (list) list.push(m);
    else byUser.set(u, [m]);
  }
  const kept = [];
  for (const list of byUser.values()) {
    kept.push(
      ...list.slice().sort((a, b) => Number(a.retired) - Number(b.retired) || b.strength - a.strength || (a.ts < b.ts ? 1 : -1)).slice(0, DURABLE_CAP)
    );
  }
  s.setItem(DURABLE_KEY, JSON.stringify(kept));
}
var STOP = /* @__PURE__ */ new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "than",
  "that",
  "this",
  "these",
  "those",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "with",
  "it",
  "its",
  "as",
  "by",
  "from",
  "not",
  "no",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "i",
  "we",
  "you",
  "they",
  "he",
  "she",
  "my",
  "our",
  "your",
  "their"
]);
function profileOrder(lists) {
  const df = /* @__PURE__ */ new Map();
  for (const list of lists) for (const w of new Set(list)) df.set(w, (df.get(w) ?? 0) + 1);
  return Array.from(df.keys()).sort((a, b) => df.get(b) - df.get(a) || (a < b ? -1 : 1));
}
function loadPending() {
  return loadWatermark().pending;
}
function mergePending(pending, c, userId, at) {
  const words = c.words.slice();
  const mine = pending.filter((p) => p.userId === (userId || "default"));
  const home = mine.find((p) => p.kind === c.kind && (p.key === c.key || similarity(new Set(p.words), new Set(words)) >= SAME_PATTERN));
  if (!home) {
    pending.push({
      userId: userId || "default",
      kind: c.kind,
      key: c.key,
      words,
      subject: c.subject.slice(),
      detail: c.detail,
      evidence: c.evidence.slice(),
      sightings: c.sightings,
      dayKeys: Array.from(new Set(c.dayKeys)),
      firstSeen: at,
      lastSeen: at
    });
    return;
  }
  home.words = profileOrder([home.words, words]);
  home.subject = profileOrder([home.subject ?? [], c.subject]);
  if (c.detail.length > (home.detail ?? "").length) home.detail = c.detail;
  home.evidence = Array.from(/* @__PURE__ */ new Set([...home.evidence, ...c.evidence]));
  home.sightings += c.sightings;
  home.dayKeys = Array.from(/* @__PURE__ */ new Set([...home.dayKeys, ...c.dayKeys]));
  home.lastSeen = at;
}
function replayPending(p) {
  const sightings = p.sightings;
  const days = p.dayKeys.length;
  const confidence = confidenceOf(sightings, days);
  const base = {
    kind: p.kind,
    key: p.key,
    statement: renderStatement(p.kind, p.subject && p.subject.length > 0 ? p.subject : p.words, p.detail ?? ""),
    evidence: p.evidence,
    sightings,
    days,
    confidence,
    words: p.words.slice(),
    subject: (p.subject ?? []).slice(),
    detail: p.detail ?? "",
    dayKeys: p.dayKeys.slice(),
    blockedBy: null
  };
  if (sightings < MIN_EVIDENCE) return { ...base, blockedBy: `evidence: ${sightings}/${MIN_EVIDENCE} sightings` };
  if (days < MIN_SESSIONS) return { ...base, blockedBy: `independence: ${days}/${MIN_SESSIONS} days` };
  if (confidence < MIN_CONFIDENCE) return { ...base, blockedBy: `confidence: ${confidence}/${MIN_CONFIDENCE}` };
  return base;
}
function capPending(pending) {
  const byUser = /* @__PURE__ */ new Map();
  for (const p of pending) {
    const u = p.userId || "default";
    const list = byUser.get(u);
    if (list) list.push(p);
    else byUser.set(u, [p]);
  }
  const out = [];
  for (const list of byUser.values()) {
    out.push(
      ...list.slice().sort((a, b) => b.sightings - a.sightings || (a.lastSeen < b.lastSeen ? 1 : -1)).slice(0, PENDING_CAP)
    );
  }
  return out;
}
function keywords(text) {
  const words = (text || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  return Array.from(new Set(words)).sort();
}
function similarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return shared / (a.size + b.size - shared);
}
var SAME_PATTERN = 0.34;
function groupKey(members) {
  const freq = /* @__PURE__ */ new Map();
  for (const words of members) for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return Array.from(freq.entries()).sort((a, b) => b[1] - a[1] || (a[0].length === b[0].length ? a[0].localeCompare(b[0]) : b[0].length - a[0].length)).slice(0, 2).map(([w]) => w).join("+") || "unspecified";
}
function dayOf(ts) {
  return (ts || "").slice(0, 10);
}
function daysBetween(from, to) {
  const a = Date.parse(`${dayOf(from)}T00:00:00.000Z`);
  const b = Date.parse(`${dayOf(to)}T00:00:00.000Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 864e5));
}
function bucketsFrom(records) {
  const out = [];
  for (const r of records) {
    const scenario = r.scenario ?? "";
    let kind;
    let text;
    if (r.kind === "reject") {
      kind = "preference";
      text = r.reason || scenario;
    } else if (r.kind === "correction") {
      kind = "correction";
      text = scenario || r.reason || "";
    } else if (r.kind === "accept") {
      kind = "rhythm";
      text = scenario;
    } else {
      continue;
    }
    const words = keywords(text);
    if (words.length === 0) continue;
    const subj = keywords(scenario);
    const set = new Set(words);
    const home = out.find((b) => b.kind === kind && similarity(b.profile, set) >= SAME_PATTERN);
    if (home) {
      home.records.push(r);
      home.words.push(words);
      home.subjects.push(subj);
      for (const w of words) home.profile.add(w);
    } else {
      out.push({ kind, key: "", records: [r], words: [words], subjects: [subj], profile: new Set(words) });
    }
  }
  for (const b of out) b.key = groupKey(b.words);
  return out;
}
function themeOf(subjects, words) {
  const subj = profileOrder(subjects);
  return subj.length > 0 ? subj : profileOrder(words);
}
function renderStatement(kind, themeWords, detail) {
  const theme = themeWords.slice(0, 2).join(" ") || "this kind of work";
  switch (kind) {
    case "preference":
      return detail ? `This user tends to refuse work about ${theme} \u2014 most often because: ${detail.slice(0, 140)}.` : `This user tends to refuse work about ${theme}.`;
    case "caution":
      return `Work about ${theme} has been set aside more than once \u2014 check it before spending steps on it.`;
    case "correction":
      return `This user corrects ${theme} \u2014 expect to revise it rather than to get it right first time.`;
    case "rhythm":
      return `Asks about ${theme} recur for this user \u2014 treat them as standing work, not one-offs.`;
  }
}
function statementFor(b) {
  const reasons = b.records.map((r) => (r.reason ?? "").trim()).filter(Boolean);
  const topReason = reasons.sort((a, x) => x.length - a.length)[0] ?? "";
  return renderStatement(b.kind, themeOf(b.subjects, b.words), topReason);
}
function longestReason(records) {
  return records.map((r) => (r.reason ?? "").trim()).filter(Boolean).sort((a, x) => x.length - a.length)[0] ?? "";
}
function confidenceOf(sightings, days) {
  const e = Math.min(1, sightings / (MIN_EVIDENCE * 2));
  const d = Math.min(1, days / (MIN_SESSIONS * 2));
  const raw = e * 0.55 + d * 0.45;
  const scaled = MIN_CONFIDENCE + (raw - 0.5) * (2 * (1 - MIN_CONFIDENCE));
  return Number(Math.min(1, Math.max(0, scaled)).toFixed(3));
}
function gate(b) {
  const sightings = b.records.length;
  const days = new Set(b.records.map((r) => dayOf(r.ts))).size;
  const confidence = confidenceOf(sightings, days);
  const statement = statementFor(b);
  const base = {
    kind: b.kind,
    key: b.key,
    statement,
    evidence: b.records.map((r) => r.id),
    sightings,
    days,
    confidence,
    words: profileOrder([...b.words, ...b.subjects]),
    subject: themeOf(b.subjects, b.words),
    detail: longestReason(b.records),
    dayKeys: Array.from(new Set(b.records.map((r) => dayOf(r.ts)))),
    blockedBy: null
  };
  if (sightings < MIN_EVIDENCE) return { ...base, blockedBy: `evidence: ${sightings}/${MIN_EVIDENCE} sightings` };
  if (days < MIN_SESSIONS) return { ...base, blockedBy: `independence: ${days}/${MIN_SESSIONS} days` };
  if (confidence < MIN_CONFIDENCE) return { ...base, blockedBy: `confidence: ${confidence}/${MIN_CONFIDENCE}` };
  return base;
}
function promote(byKey, c, userId, at) {
  const id = `${c.kind}|${c.key}`;
  const prior = byKey.get(id) ?? Array.from(byKey.values()).find(
    (m) => !m.retired && m.kind === c.kind && similarity(new Set(m.words ?? []), new Set(c.words)) >= SAME_PATTERN
  );
  if (prior) {
    prior.sightings += c.sightings;
    prior.days += c.days;
    prior.strength = Math.min(1, prior.strength + STRENGTH_GAIN);
    prior.lastSeen = at;
    prior.statement = c.statement;
    prior.words = profileOrder([prior.words ?? [], c.words]);
    prior.evidence = Array.from(/* @__PURE__ */ new Set([...prior.evidence, ...c.evidence])).slice(-24);
    prior.retired = false;
    return;
  }
  byKey.set(id, {
    id: uid("mem"),
    key: c.key,
    userId,
    ts: at,
    kind: c.kind,
    statement: c.statement,
    words: c.words.slice(),
    evidence: c.evidence.slice(-24),
    sightings: c.sightings,
    days: c.days,
    strength: 0.5 + (c.confidence - MIN_CONFIDENCE) * 0.5,
    lastSeen: at,
    retired: false
  });
}
function dreamPass(userId = "default", at = nowIso()) {
  const who = userId || "default";
  const wm = loadWatermark();
  const seen = new Set(wm.seen);
  const all = loadMemory(who);
  const staged = all.filter((r) => !seen.has(r.id));
  const durable = loadDurable(who);
  const byKey = new Map(durable.map((m) => [`${m.kind}|${m.key}`, m]));
  const pending = loadPending();
  let promoted = 0;
  const held = [];
  const promotedKeys = /* @__PURE__ */ new Set();
  for (const b of bucketsFrom(staged)) mergePending(pending, gate(b), who, at);
  const stillPending = [];
  for (const p of pending) {
    if ((p.userId || "default") !== who) {
      stillPending.push(p);
      continue;
    }
    const c = replayPending(p);
    if (c.blockedBy) {
      held.push(c);
      stillPending.push(p);
      continue;
    }
    promote(byKey, c, who, at);
    promotedKeys.add(`${c.kind}|${c.key}`);
    promoted += 1;
  }
  let retired = 0;
  for (const m of byKey.values()) {
    if (promotedKeys.has(`${m.kind}|${m.key}`)) continue;
    if (daysBetween(m.lastSeen, at) <= DECAY_GRACE_DAYS) continue;
    const charged = daysBetween(m.decayedAt ?? m.lastSeen, at);
    if (charged <= 0) continue;
    m.strength = Number((m.strength - STRENGTH_DECAY * Math.min(charged, 30)).toFixed(3));
    m.decayedAt = at;
    if (m.strength < RETIRE_BELOW && !m.retired) {
      m.retired = true;
      retired += 1;
    }
  }
  const mine = new Set(durable.map((m) => m.id));
  saveDurable([...loadDurable().filter((m) => !mine.has(m.id)), ...byKey.values()]);
  saveWatermark({
    seen: Array.from(/* @__PURE__ */ new Set([...wm.seen, ...all.map((r) => r.id)])),
    lastPass: at,
    passes: wm.passes + 1,
    pending: capPending(stillPending)
  });
  return { staged: staged.length, consolidated: staged.length, promoted, held, retired, at };
}
function topMemories(k = 3, userId = "default") {
  return loadDurable(userId).filter((m) => !m.retired && m.strength >= RETIRE_BELOW).sort((a, b) => b.strength - a.strength).slice(0, k).map((m) => ({ statement: m.statement, kind: m.kind, strength: m.strength, score: Number(m.strength.toFixed(4)) }));
}
function recall(query, k = 3, userId = "default") {
  const q = new Set(keywords(query));
  if (q.size === 0) return [];
  const out = [];
  for (const m of loadDurable(userId).filter((x) => !x.retired && x.strength >= RETIRE_BELOW)) {
    const mk = m.words && m.words.length > 0 ? m.words : keywords(m.statement);
    if (mk.length === 0) continue;
    const hits = mk.filter((w) => q.has(w)).length;
    const overlap = hits / Math.max(4, Math.min(mk.length, 16));
    const score = overlap * m.strength;
    if (score <= 0) continue;
    out.push({ statement: m.statement, kind: m.kind, strength: m.strength, score: Number(score.toFixed(4)) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, k);
}
function recallBriefing(query, k = 3, userId = "default") {
  const r = keywords(query).length === 0 ? topMemories(k, userId) : recall(query, k, userId);
  if (r.length === 0) return [];
  const head = [
    "What this deployment has LEARNED about this user (consolidated over repeat sightings, not single events):"
  ];
  return head.concat(r.map((x) => `\u2022 [${x.kind}] ${x.statement}`));
}
function dreamStatus(userId = "default") {
  const who = userId || "default";
  const wm = loadWatermark();
  const mem = loadDurable(who);
  const live = mem.filter((m) => !m.retired);
  return {
    passes: wm.passes,
    lastPass: wm.lastPass,
    durable: mem.length,
    live: live.length,
    retired: mem.length - live.length,
    strongest: live.slice().sort((a, b) => b.strength - a.strength)[0] ?? null,
    consolidated: wm.seen.length,
    /** Repeated enough to be watched, not yet believed. */
    held: wm.pending.filter((p) => (p.userId || "default") === who).length
  };
}
function forgetMemory(id, userId) {
  const all = userId ? loadDurable(userId) : loadDurable();
  const next = all.filter((m) => m.id !== id);
  if (userId) {
    const keep = loadDurable().filter((m) => m.userId !== userId);
    saveDurable([...keep, ...next]);
    return next.length !== all.length;
  }
  if (next.length === all.length) return false;
  saveDurable(next);
  return true;
}
function forgetAllDurable(userId) {
  const who = userId || "";
  const wm = loadWatermark();
  const n = who ? loadDurable(who).length : loadDurable().length;
  if (who) {
    saveDurable(loadDurable().filter((m) => m.userId !== who));
    saveWatermark({ ...wm, pending: wm.pending.filter((p) => (p.userId || "default") !== who) });
    return n;
  }
  saveDurable([]);
  saveWatermark({ seen: [], lastPass: null, passes: 0, pending: [] });
  return n;
}

// src/engine/memory.ts
var KEY = "engine.memory.v1";
var MEMORY_CAP = 500;
function storage2() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
function loadMemory(userId = "default") {
  const s = storage2();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && r.userId === userId) : [];
  } catch {
    return [];
  }
}
function saveAll(records) {
  const s = storage2();
  if (!s) return;
  const capped = records.length > MEMORY_CAP ? records.slice(records.length - MEMORY_CAP) : records;
  s.setItem(KEY, JSON.stringify(capped));
}
function recordDecision(input) {
  const rec = { id: uid("dec"), ts: input.ts ?? nowIso(), ...input };
  const s = storage2();
  const all = s ? JSON.parse(s.getItem(KEY) ?? "[]") : [];
  all.push(rec);
  saveAll(all);
  return rec;
}
function clearMemory(userId = "default") {
  const s = storage2();
  if (!s) return;
  const all = JSON.parse(s.getItem(KEY) ?? "[]");
  saveAll(all.filter((r) => r.userId !== userId));
}
function patternReport(userId = "default") {
  const mem = loadMemory(userId);
  const accepts = mem.filter((r) => r.kind === "accept").length;
  const rejects = mem.filter((r) => r.kind === "reject").length;
  const corrections = mem.filter((r) => r.kind === "correction").length;
  const perSpecialist = /* @__PURE__ */ new Map();
  for (const r of mem) {
    if (!r.specialistId) continue;
    const e = perSpecialist.get(r.specialistId) ?? { accepts: 0, rejects: 0 };
    if (r.kind === "accept") e.accepts += 1;
    if (r.kind === "reject") e.rejects += 1;
    perSpecialist.set(r.specialistId, e);
  }
  const bySpecialist = Array.from(perSpecialist.entries()).map(([id, e]) => ({ id, ...e, rate: e.accepts + e.rejects === 0 ? 0 : e.accepts / (e.accepts + e.rejects) })).sort((a, b) => b.accepts + b.rejects - (a.accepts + a.rejects));
  return {
    total: mem.length,
    accepts,
    rejects,
    corrections,
    acceptanceRate: accepts + rejects === 0 ? 0 : accepts / (accepts + rejects),
    bySpecialist,
    recentRejections: mem.filter((r) => r.kind === "reject").slice(-5)
  };
}
function memoryBriefing(userId = "default", maxLines = 4, query = "") {
  const p = patternReport(userId);
  const lines = [];
  if (p.total === 0) return ["No decision history yet for this user \u2014 do not assume preferences."];
  lines.push(`User decision history: ${p.accepts} accepted, ${p.rejects} rejected, ${p.corrections} corrections (acceptance ${(p.acceptanceRate * 100).toFixed(0)}%).`);
  const learned = recallBriefing(query, maxLines, userId);
  if (learned.length > 0) {
    lines.push(...learned);
  } else {
    for (const r of p.recentRejections.slice(-maxLines)) {
      lines.push(`Rejected once (not yet a pattern): "${r.scenario.slice(0, 80)}" \u2014 ${r.reason ? `reason: ${r.reason.slice(0, 120)}` : "no reason stated"}.`);
    }
  }
  return lines;
}

// probe/dreaming.test.ts
if (typeof globalThis.localStorage === "undefined") {
  const map = /* @__PURE__ */ new Map();
  globalThis.localStorage = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    }
  };
}
var U = "dream-user";
function reset() {
  clearMemory(U);
  forgetAllDurable();
}
function reject(day, reason, scenario = "draft a release note") {
  return recordDecision({
    userId: U,
    scenario,
    action: "drafted a release note",
    kind: "reject",
    reason,
    specialistId: "docs.changelog",
    category: "writing",
    ts: `${day}T10:00:00.000Z`
  });
}
test("grouping: two PHRASINGS of one complaint group; an unrelated one does not", () => {
  const set = (t) => new Set(keywords(t));
  const a = set("The tone was far too marketing-heavy for a changelog");
  const b = set("too marketing heavy, reads like an ad");
  const c = set("the colours were wrong in the header");
  assert.ok(similarity(a, b) >= SAME_PATTERN, `rephrasings must group: ${similarity(a, b)}`);
  assert.ok(similarity(a, c) < SAME_PATTERN, `unrelated complaints must not group: ${similarity(a, c)}`);
  assert.ok(keywords("The tone was far too marketing-heavy").includes("marketing"));
  assert.ok(!keywords("the tone was far too marketing-heavy").includes("the"), "stopwords are dropped");
  const k1 = groupKey([keywords("too marketing heavy for a changelog"), keywords("marketing heavy, reads like an ad")]);
  const k2 = groupKey([keywords("marketing heavy, reads like an ad"), keywords("too marketing heavy for a changelog")]);
  assert.equal(k1, k2, "the key is order-independent");
  assert.match(k1, /marketing/, `the shared word must lead the key: ${k1}`);
});
test("1. a SINGLE rejection is held, and the gate that held it is named", () => {
  reset();
  reject("2026-03-01", "too marketing-heavy");
  const report = dreamPass(U, "2026-03-01T12:00:00.000Z");
  assert.equal(report.promoted, 0, "one sighting is not a pattern");
  assert.equal(loadDurable(U).length, 0);
  assert.equal(report.held.length, 1, "it must be REPORTED as held, not swallowed");
  assert.match(report.held[0].blockedBy ?? "", /evidence: 1\/3/);
});
test("2. INDEPENDENCE: three identical rejections in ONE day still do not promote", () => {
  reset();
  reject("2026-03-02", "too marketing-heavy");
  reject("2026-03-02", "too marketing-heavy");
  reject("2026-03-02", "too marketing-heavy");
  const report = dreamPass(U, "2026-03-02T12:00:00.000Z");
  assert.equal(report.promoted, 0, "one frustrated session is ONE event, not a pattern");
  assert.match(report.held[0].blockedBy ?? "", /independence: 1\/2 days/);
  assert.equal(report.held[0].sightings, 3, "\u2026and it did clear the evidence gate, so the reason is the honest one");
});
test("3. the same three complaints ACROSS three days promote, with the evidence attached", () => {
  reset();
  reject("2026-03-03", "too marketing-heavy");
  reject("2026-03-04", "too marketing-heavy");
  reject("2026-03-05", "too marketing-heavy");
  const report = dreamPass(U, "2026-03-05T12:00:00.000Z");
  assert.equal(report.promoted, 1, `expected one promotion, held: ${JSON.stringify(report.held)}`);
  const mem = loadDurable(U);
  assert.equal(mem.length, 1);
  assert.equal(mem[0].sightings, 3);
  assert.equal(mem[0].days, 3);
  assert.equal(mem[0].evidence.length, 3, "a belief carries the records behind it so it can be checked");
  assert.equal(mem[0].userId, U, "a belief is scoped to the user it is about");
  assert.match(mem[0].statement, /marketing/, "the statement must be readable, not a fingerprint");
});
test("4. watermark: a second pass over the SAME evidence promotes nothing new", () => {
  reset();
  reject("2026-03-06", "too marketing-heavy");
  reject("2026-03-07", "too marketing-heavy");
  reject("2026-03-08", "too marketing-heavy");
  const first = dreamPass(U, "2026-03-08T12:00:00.000Z");
  assert.equal(first.promoted, 1);
  const second = dreamPass(U, "2026-03-08T13:00:00.000Z");
  assert.equal(second.staged, 0, "the staged window is the NEW records, not the whole ledger");
  assert.equal(second.promoted, 0, "re-reading old evidence must not double-count it");
  assert.equal(loadDurable(U).length, 1, "\u2026and must not create a duplicate belief beside the first");
});
test("5. RECONFIRMATION raises strength and adds evidence; it does not duplicate", () => {
  reset();
  reject("2026-03-09", "too marketing-heavy");
  reject("2026-03-10", "too marketing-heavy");
  reject("2026-03-11", "too marketing-heavy");
  dreamPass(U, "2026-03-11T12:00:00.000Z");
  const before = loadDurable(U)[0];
  reject("2026-03-12", "too marketing-heavy");
  reject("2026-03-13", "too marketing-heavy");
  reject("2026-03-14", "too marketing-heavy");
  dreamPass(U, "2026-03-14T12:00:00.000Z");
  const after = loadDurable(U);
  assert.equal(after.length, 1, "the same belief, not a second one");
  assert.ok(after[0].strength > before.strength, `strength should rise: ${before.strength} -> ${after[0].strength}`);
  assert.equal(after[0].sightings, 6);
  assert.equal(after[0].evidence.length, 6);
});
test("6. DECAY AND RETIRE: a belief nothing reconfirms dies, and says so", () => {
  reset();
  reject("2026-04-01", "too marketing-heavy");
  reject("2026-04-02", "too marketing-heavy");
  reject("2026-04-03", "too marketing-heavy");
  dreamPass(U, "2026-04-03T12:00:00.000Z");
  assert.equal(dreamStatus(U).live, 1);
  for (let i = 0; i < 7; i++) dreamPass(U, `2026-04-1${i}T12:00:00.000Z`);
  const st = dreamStatus(U);
  assert.equal(st.live, 0, `a stale belief must retire; strength=${loadDurable(U)[0]?.strength}`);
  assert.equal(st.retired, 1, "retired, not deleted \u2014 a reversal stays visible in the record");
  assert.equal(loadDurable(U)[0].retired, true);
});
test("7. a retired memory is not recalled, and never reaches the briefing", () => {
  reset();
  reject("2026-05-01", "too marketing-heavy");
  reject("2026-05-02", "too marketing-heavy");
  reject("2026-05-03", "too marketing-heavy");
  dreamPass(U, "2026-05-03T12:00:00.000Z");
  assert.ok(recall("write me a release note", 3, U).length > 0, "\u2026while it is alive it is recalled");
  for (let i = 0; i < 7; i++) dreamPass(U, `2026-05-1${i}T12:00:00.000Z`);
  assert.equal(recall("write me a release note", 3, U).length, 0);
  assert.equal(recallBriefing("write me a release note", 3, U).length, 0);
});
test("8. RECALL ranks by overlap x strength \u2014 relevance first, evidence as the tie-break", () => {
  reset();
  for (const [day, reason, scenario] of [
    ["2026-06-01", "too marketing-heavy", "draft a release note"],
    ["2026-06-02", "too marketing-heavy", "draft a release note"],
    ["2026-06-03", "too marketing-heavy", "draft a release note"]
  ]) reject(day, reason, scenario);
  for (const [day, reason, scenario] of [
    ["2026-06-01", "the row heights were wrong in the ledger table", "build a finance table"],
    ["2026-06-02", "the row heights were wrong in the ledger table", "build a finance table"],
    ["2026-06-03", "the row heights were wrong in the ledger table", "build a finance table"]
  ])
    recordDecision({ userId: U, scenario, action: "built a table", kind: "reject", reason, specialistId: "data.table", category: "data", ts: `${day}T09:00:00.000Z` });
  dreamPass(U, "2026-06-03T12:00:00.000Z");
  assert.equal(loadDurable(U).length, 2, "two distinct patterns, two beliefs");
  const aboutWriting = recall("please draft a release note for this changelog", 3, U);
  assert.ok(aboutWriting.length >= 1);
  assert.match(aboutWriting[0].statement, /marketing/, `wrong memory ranked first: ${aboutWriting[0].statement}`);
  const aboutTables = recall("the ledger table row heights look off", 3, U);
  assert.match(aboutTables[0].statement, /table|heights|row/, `wrong memory ranked first: ${aboutTables[0].statement}`);
  assert.equal(recall("what is the weather in Chennai", 3, U).length, 0, "an unrelated ask recalls NOTHING rather than padding");
});
test("9. confidence is computed from evidence AND spread, so one day cannot fake it", () => {
  assert.ok(confidenceOf(3, 1) < confidenceOf(3, 3), "same count, wider spread, more confidence");
  assert.ok(confidenceOf(2, 2) < confidenceOf(10, 10), "more of both is more");
  assert.ok(confidenceOf(10, 10) <= 1, "and it is capped at 1 \u2014 confidence is not a counter");
  assert.ok(confidenceOf(3, 2) >= MIN_CONFIDENCE, "three across two days is the intended minimum");
  assert.ok(confidenceOf(1, 1) < MIN_CONFIDENCE);
});
test("10. the briefing carries LEARNED memory, and labels a lone event as a lone event", () => {
  reset();
  reject("2026-07-01", "too marketing-heavy");
  const thin = memoryBriefing(U, 4, "draft a release note");
  assert.ok(thin.some((l) => /decision history/i.test(l)), "the ledger fact stays \u2014 it is cheap and it is true");
  assert.ok(thin.some((l) => /not yet a pattern/i.test(l)), `a single rejection must not read as a preference: ${JSON.stringify(thin)}`);
  reject("2026-07-02", "too marketing-heavy");
  reject("2026-07-03", "too marketing-heavy");
  dreamPass(U, "2026-07-03T12:00:00.000Z");
  const fat = memoryBriefing(U, 4, "draft a release note");
  assert.ok(fat.some((l) => /LEARNED/.test(l)), `consolidated memory must reach the specialist: ${JSON.stringify(fat)}`);
  assert.ok(fat.some((l) => /marketing/.test(l)));
  assert.ok(!fat.some((l) => /not yet a pattern/i.test(l)), "once it is a pattern, do not also show it as a one-off");
});
test("11. forgetting is real, and it does not rewrite history", () => {
  reset();
  reject("2026-08-01", "too marketing-heavy");
  reject("2026-08-02", "too marketing-heavy");
  reject("2026-08-03", "too marketing-heavy");
  dreamPass(U, "2026-08-03T12:00:00.000Z");
  const id = loadDurable(U)[0].id;
  assert.equal(forgetMemory("mem-does-not-exist"), false, "forgetting an unknown memory reports false");
  assert.equal(forgetMemory(id), true);
  assert.equal(loadDurable(U).length, 0);
  reject("2026-08-04", "too marketing-heavy");
  reject("2026-08-05", "too marketing-heavy");
  reject("2026-08-06", "too marketing-heavy");
  dreamPass(U, "2026-08-06T12:00:00.000Z");
  assert.equal(loadDurable(U).length, 1);
  const removed = forgetAllDurable();
  assert.equal(removed, 1);
  assert.equal(loadDurable(U).length, 0);
  assert.equal(dreamStatus(U).passes, 0, "the watermark resets with the beliefs, so the next pass re-consolidates from the ledger");
});
test("12. the cap protects the store, and the WEAKEST give way \u2014 not the oldest", () => {
  reset();
  const topics = [
    "the indentation used tabs instead of spaces",
    "the invoice currency was displayed in dollars not rupees",
    "the error message leaked an internal hostname",
    "the chart legend overlapped the axis labels"
  ];
  for (const reason of topics) {
    for (const day of ["01", "02", "03"]) {
      recordDecision({ userId: U, scenario: reason, action: "did a thing", kind: "reject", reason, specialistId: "code.typescript", category: "code", ts: `2026-09-${day}T08:00:00.000Z` });
    }
  }
  dreamPass(U, "2026-09-03T12:00:00.000Z");
  const n = loadDurable(U).length;
  assert.ok(n > 1, `expected several beliefs, got ${n}`);
  assert.ok(n <= DURABLE_CAP);
  assert.ok(loadDurable(U).every((m) => m.strength > 0));
});
test("13. the pipeline refuses to invent memory out of nothing", () => {
  reset();
  const report = dreamPass(U, "2026-10-01T12:00:00.000Z");
  assert.equal(report.staged, 0);
  assert.equal(report.promoted, 0);
  assert.equal(loadDurable(U).length, 0);
  assert.equal(recall("anything at all", 3, U).length, 0);
  assert.equal(memoryBriefing(U, 4, "").length, 1, "with no history at all the briefing says exactly that, and nothing more");
  assert.match(memoryBriefing(U, 4, "")[0], /No decision history/);
});
test("14. HELD EVIDENCE ACCUMULATES ACROSS CYCLES \u2014 one a day promotes on the third day", () => {
  reset();
  reject("2026-07-01", "too marketing-heavy");
  const d1 = dreamPass(U, "2026-07-01T12:00:00.000Z");
  assert.equal(d1.promoted, 0, "one sighting is not a pattern");
  assert.match(d1.held[0].blockedBy ?? "", /evidence: 1\/3/, `day 1 must hold on evidence: ${d1.held[0]?.blockedBy}`);
  reject("2026-07-02", "too marketing-heavy");
  const d2 = dreamPass(U, "2026-07-02T12:00:00.000Z");
  assert.equal(d2.promoted, 0, "two sightings are still not a pattern");
  assert.match(d2.held[0].blockedBy ?? "", /evidence: 2\/3/, `day 2 must show 2/3: ${d2.held[0]?.blockedBy}`);
  assert.equal(d2.held[0].days, 2, "\u2026and two separate days, which is the other gate");
  reject("2026-07-03", "too marketing-heavy");
  const d3 = dreamPass(U, "2026-07-03T12:00:00.000Z");
  assert.equal(d3.promoted, 1, "the third day's sighting completes the evidence: 1 + 1 + 1 must reach 3");
  assert.equal(d3.held.length, 0, "nothing is left held");
  assert.equal(loadDurable(U).length, 1, "and it is ONE belief, not three");
  assert.equal(loadDurable(U)[0].sightings, 3);
  assert.equal(loadDurable(U)[0].days, 3);
  assert.equal(loadDurable(U)[0].evidence.length, 3, "all three sightings are still behind it");
});
test("15. held evidence does NOT decay while it waits, and is not lost to a quiet cycle", () => {
  reset();
  reject("2026-08-01", "the tone was too promotional");
  dreamPass(U, "2026-08-01T12:00:00.000Z");
  for (let i = 2; i <= 16; i++) dreamPass(U, `2026-08-${String(i).padStart(2, "0")}T12:00:00.000Z`);
  assert.ok(dreamStatus(U).held >= 1, "the held candidate is still held after a quiet fortnight");
  reject("2026-08-17", "the tone was too promotional");
  const r = dreamPass(U, "2026-08-17T12:00:00.000Z");
  assert.equal(r.held[0].sightings, 2, "the old sighting was still counted: two, not one");
});
test("16. USER ISOLATION: two people with the same habit get two beliefs, and neither pass touches the other", () => {
  reset();
  const A = "user-a";
  const B = "user-b";
  const rejectAs = (u, day) => recordDecision({ userId: u, scenario: "draft a release note", action: "drafted a release note", kind: "reject", reason: "too marketing-heavy", specialistId: "docs.changelog", category: "writing", ts: `${day}T10:00:00.000Z` });
  for (const day of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
    rejectAs(A, day);
    rejectAs(B, day);
  }
  dreamPass(A, "2026-09-03T12:00:00.000Z");
  assert.equal(loadDurable(A).length, 1, "A has a belief");
  assert.equal(loadDurable(B).length, 0, "\u2026and B does not: A's pass is not B's pass");
  dreamPass(B, "2026-09-03T12:00:00.000Z");
  assert.equal(loadDurable(B).length, 1, "B consolidates their own");
  assert.equal(loadDurable().length, 2, "two people, two beliefs \u2014 the same habit is not the same memory");
  assert.notEqual(loadDurable(A)[0].id, loadDurable(B)[0].id, "\u2026and they are different entries, not a shared one");
  for (const m of loadDurable()) assert.ok(m.userId === A || m.userId === B, `every belief names its owner: ${m.userId}`);
  assert.equal(recall("draft a release note", 3, A).length, 1);
  assert.equal(recall("draft a release note", 3, B).length, 1);
  assert.equal(forgetAllDurable(A), 1);
  assert.equal(loadDurable(A).length, 0, "A's belief is gone");
  assert.equal(loadDurable(B).length, 1, "B's belief survived somebody else asking to be forgotten");
});
test("17. a belief reconfirmed for one user never decays another user's", () => {
  reset();
  const A = "user-a";
  const B = "user-b";
  const rec = (u, day, reason) => recordDecision({ userId: u, scenario: "draft a release note", action: "drafted a release note", kind: "reject", reason, specialistId: "docs.changelog", category: "writing", ts: `${day}T10:00:00.000Z` });
  for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) rec(B, day, "the numbers were wrong twice");
  dreamPass(B, "2026-10-03T12:00:00.000Z");
  const bStrength = loadDurable(B)[0].strength;
  for (let m = 1; m <= 3; m++) {
    const mm = String(m).padStart(2, "0");
    for (const day of ["01", "02", "03"]) {
      rec(A, `2026-${mm}-${day}`, "too marketing-heavy");
      dreamPass(A, `2026-${mm}-${day}T12:00:00.000Z`);
    }
  }
  const bAfter = loadDurable(B)[0];
  assert.equal(bAfter.strength, bStrength, "another user's pass must not charge this user's belief for silence");
  assert.equal(loadDurable(A).length, 1, "A's own belief still formed");
});
test("18. decay is charged per SILENT DAY, not per pass \u2014 a schedule must not decide what is true", () => {
  reset();
  reject("2026-12-01", "too marketing-heavy");
  reject("2026-12-02", "too marketing-heavy");
  reject("2026-12-03", "too marketing-heavy");
  dreamPass(U, "2026-12-03T12:00:00.000Z");
  const s0 = loadDurable(U)[0].strength;
  for (let i = 0; i < 30; i++) dreamPass(U, "2026-12-03T23:00:00.000Z");
  assert.equal(loadDurable(U)[0].strength, s0, "a second pass on the same day costs a belief nothing");
  for (let i = 14; i < 20; i++) dreamPass(U, "2026-12-20T12:00:00.000Z");
  const s1 = loadDurable(U)[0].strength;
  assert.ok(s1 < s0, `silence must cost, and cost once: ${s0} -> ${s1}`);
  for (let i = 0; i < 5; i++) dreamPass(U, "2026-12-20T13:00:00.000Z");
  assert.equal(loadDurable(U)[0].strength, s1, "\u2026and the same silence is never charged twice");
});
test("19. SESSION START: with no query the STRONGEST beliefs stand in, and the fallback does not fire", () => {
  reset();
  reject("2027-01-01", "too marketing-heavy");
  reject("2027-01-02", "too marketing-heavy");
  reject("2027-01-03", "too marketing-heavy");
  dreamPass(U, "2027-01-03T12:00:00.000Z");
  assert.equal(loadDurable(U).length, 1);
  const brief = memoryBriefing(U, 4);
  const learned = brief.filter((l) => /LEARNED/.test(l));
  assert.equal(learned.length, 1, `consolidated memory must reach the model: ${JSON.stringify(brief)}`);
  assert.ok(brief.some((l) => /marketing/.test(l)), "and it must be the learned statement, not the raw ledger line");
  assert.ok(!brief.some((l) => /Rejected once/.test(l)), "the un-consolidated fallback must NOT fire when a belief exists");
  assert.equal(recallBriefing("", 3, U).length, 2, "a header and one belief");
  assert.equal(recallBriefing("something about kubernetes operators", 3, U).length, 0);
});
