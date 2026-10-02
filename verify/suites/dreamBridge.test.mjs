import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/dreamBridge.test.ts
import assert from "node:assert/strict";
import test from "node:test";

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

// src/engine/dreamBridge.ts
var JOURNAL_KEY = "engine.dream.journal.v1";
var DREAM_MIN_GAP_MS = 10 * 60 * 1e3;
var JOURNAL_CAP = 200;
function storage3() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
function loadJournal() {
  const s = storage3();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(JOURNAL_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.at === "string") : [];
  } catch {
    return [];
  }
}
function saveJournal(rows) {
  const s = storage3();
  if (!s) return;
  const byUser = /* @__PURE__ */ new Map();
  for (const r of rows) {
    const u = r.userId || "default";
    const list = byUser.get(u);
    if (list) list.push(r);
    else byUser.set(u, [r]);
  }
  const kept = [];
  for (const list of byUser.values()) kept.push(...list.slice(-JOURNAL_CAP));
  s.setItem(JOURNAL_KEY, JSON.stringify(kept));
}
function dreamJournal(userId) {
  const rows = loadJournal();
  const mine = userId ? rows.filter((r) => (r.userId || "default") === userId) : rows;
  return mine.slice().reverse();
}
function dreamCursor(userId = "default") {
  return dreamJournal(userId)[0] ?? null;
}
function interruptedPasses(userId = "default") {
  return dreamJournal(userId).filter((r) => r.state === "running");
}
function dreamTick(userId = "default", at = nowIso(), opts = {}) {
  const who = userId || "default";
  const last = dreamCursor(who);
  if (!opts.force && last?.state === "done") {
    const since = Date.parse(at) - Date.parse(last.at);
    if (Number.isFinite(since) && since >= 0 && since < DREAM_MIN_GAP_MS) {
      return { ran: false, whyNot: `consolidated ${Math.round(since / 1e3)}s ago`, at, userId: who, row: last };
    }
  }
  const row = {
    id: uid("dream"),
    userId: who,
    at,
    state: "running",
    staged: 0,
    promoted: 0,
    held: 0,
    retired: 0,
    passes: 0
  };
  const before = loadJournal();
  saveJournal([...before, row]);
  const report = dreamPass(who, at);
  const done = {
    ...row,
    state: "done",
    staged: report.staged,
    promoted: report.promoted,
    held: report.held.length,
    retired: report.retired,
    passes: (last?.passes ?? 0) + 1
  };
  saveJournal([...loadJournal().filter((r) => r.id !== row.id), done]);
  return { ran: true, at, userId: who, row: done, report };
}
function dreamLine(r) {
  const row = r.row;
  if (!r.ran || !row) return `Dreaming \u2014 skipped: ${r.whyNot ?? "nothing to do"}.`;
  if (row.staged === 0) return "Dreaming \u2014 nothing new since the last pass.";
  const bits = [`${row.staged} new record${row.staged === 1 ? "" : "s"} reviewed`];
  if (row.promoted > 0) bits.push(`${row.promoted} belief${row.promoted === 1 ? "" : "s"} added`);
  if (row.held > 0) bits.push(`${row.held} held at the gates`);
  if (row.retired > 0) bits.push(`${row.retired} retired`);
  return `Dreaming \u2014 ${bits.join(", ")}.`;
}

// probe/dreamBridge.test.ts
var map = /* @__PURE__ */ new Map();
var writes = [];
globalThis.localStorage = {
  getItem: (k) => map.get(k) ?? null,
  setItem: (k, v) => {
    writes.push(k);
    map.set(k, String(v));
  },
  removeItem: (k) => void map.delete(k),
  clear: () => map.clear(),
  key: (i) => Array.from(map.keys())[i] ?? null,
  get length() {
    return map.size;
  }
};
var U = "bridge-user";
var JOURNAL_KEY2 = "engine.dream.journal.v1";
function reset() {
  clearMemory(U);
  forgetAllDurable();
  map.delete(JOURNAL_KEY2);
  writes = [];
}
function reject(day, reason = "too marketing-heavy", scenario = "draft a release note", userId = U) {
  return recordDecision({
    userId,
    scenario,
    action: "drafted a release note",
    kind: "reject",
    reason,
    specialistId: "docs.changelog",
    category: "writing",
    ts: `${day}T10:00:00.000Z`
  });
}
test("1. THE HEARTBEAT TICK CONSOLIDATES \u2014 no button, no screen, no user present", () => {
  reset();
  reject("2026-03-01");
  reject("2026-03-02");
  reject("2026-03-03");
  const r = dreamTick(U, "2026-03-03T12:00:00.000Z", { force: true });
  assert.equal(r.ran, true, "the tick ran the pass");
  assert.equal(r.report?.promoted, 1, "three sightings over three days is a belief");
  assert.equal(loadDurable(U).length, 1, "\u2026and it is in the store, whether or not anybody opened the Memory door");
});
test("2. THE RECORD EXISTS BEFORE THE WORK: the journal row is written first, and completed after", () => {
  reset();
  reject("2026-04-01");
  reject("2026-04-02");
  reject("2026-04-03");
  writes = [];
  dreamTick(U, "2026-04-03T12:00:00.000Z", { force: true });
  assert.equal(writes[0], JOURNAL_KEY2, `the journal must be written before anything else: ${JSON.stringify(writes.slice(0, 3))}`);
  const durableAt = writes.findIndex((k) => k === "engine.dream.mem.v1");
  assert.ok(durableAt > 0, "the durable store is written during the pass, after the record");
  assert.equal(writes[writes.length - 1], JOURNAL_KEY2, "and the row is completed last");
  const rows = JSON.parse(map.get(JOURNAL_KEY2) ?? "[]");
  assert.equal(rows.length, 1, "one tick, one row \u2014 the running row is completed, not duplicated beside itself");
  assert.equal(rows[0].state, "done");
  assert.equal(rows[0].promoted, 1, "and it carries what the pass actually did");
});
test("3. an interrupted pass is REPORTED, not quietly repeated", () => {
  reset();
  map.set(
    JOURNAL_KEY2,
    JSON.stringify([
      { id: "dream-crashed", userId: U, at: "2026-05-01T03:00:00.000Z", state: "running", staged: 4, promoted: 0, held: 0, retired: 0, passes: 7 },
      { id: "dream-ok", userId: U, at: "2026-04-30T03:00:00.000Z", state: "done", staged: 2, promoted: 1, held: 0, retired: 0, passes: 7 }
    ])
  );
  const stuck = interruptedPasses(U);
  assert.equal(stuck.length, 1, "the unfinished pass is visible");
  assert.equal(stuck[0].at, "2026-05-01T03:00:00.000Z");
  assert.equal(interruptedPasses("somebody-else").length, 0, "and it belongs to the user whose pass it was");
});
test("4. the throttle is a SCHEDULE guard: a second tick says why it did nothing", () => {
  reset();
  reject("2026-06-01");
  const first = dreamTick(U, "2026-06-01T12:00:00.000Z", { force: true });
  assert.equal(first.ran, true);
  const second = dreamTick(U, "2026-06-01T12:00:05.000Z");
  assert.equal(second.ran, false, "a tick inside the gap does not run");
  assert.match(second.whyNot ?? "", /consolidated 5s ago/, `and it says why: ${second.whyNot}`);
  assert.equal(dreamJournal(U).length, 1, "a skipped tick writes no row");
  const third = dreamTick(U, `2026-06-01T12:${String(DREAM_MIN_GAP_MS / 6e4 + 1).padStart(2, "0")}:00.000Z`);
  assert.equal(third.ran, true, "past the gap the tick runs without being forced");
  assert.equal(dreamJournal(U).length, 2, "and it is journaled like any other pass");
  const unreadable = dreamTick(U, "not-a-date");
  assert.equal(unreadable.ran, true, "an unreadable stamp must not wedge the schedule shut");
});
test("5. force is the manual control \u2014 a person asking for it now gets it now", () => {
  reset();
  reject("2026-07-01");
  dreamTick(U, "2026-07-01T12:00:00.000Z", { force: true });
  reject("2026-07-02");
  const forced = dreamTick(U, "2026-07-02T12:00:00.000Z", { force: true });
  assert.equal(forced.ran, true, "the button is not throttled");
  assert.equal(dreamJournal(U).length, 2, "two passes, two rows");
  assert.equal(dreamCursor(U)?.passes, 2, "the cursor counts them");
});
test("6. the journal is per user, and it is a journal rather than an archive", () => {
  reset();
  forgetAllDurable();
  map.delete(JOURNAL_KEY2);
  const rows = [];
  for (let i = 0; i < JOURNAL_CAP + 25; i++) {
    rows.push({ id: `j${i}`, userId: i % 2 === 0 ? "a" : "b", at: `2026-01-01T00:${String(i % 60).padStart(2, "0")}:00.000Z`, state: "done", staged: 0, promoted: 0, held: 0, retired: 0, passes: i });
  }
  map.set(JOURNAL_KEY2, JSON.stringify(rows));
  const a = dreamJournal("a");
  const b = dreamJournal("b");
  assert.ok(a.length <= JOURNAL_CAP && b.length <= JOURNAL_CAP, "each user is capped");
  assert.ok(a.every((r) => r.userId === "a") && b.every((r) => r.userId === "b"), "the journal never mixes people");
  const before = dreamJournal("b").length;
  dreamTick("a", "2026-08-01T12:00:00.000Z", { force: true });
  assert.equal(dreamJournal("b").length, before, "A's tick left B's journal alone");
});
test("7. one readable line per tick, and silence when there is nothing to say", () => {
  reset();
  const quiet = dreamTick(U, "2026-09-01T12:00:00.000Z", { force: true });
  assert.match(dreamLine(quiet), /nothing new since the last pass/, `a quiet tick says so plainly: ${dreamLine(quiet)}`);
  reject("2026-09-02");
  reject("2026-09-03");
  reject("2026-09-04");
  const loud = dreamTick(U, "2026-09-04T12:00:00.000Z", { force: true });
  const line = dreamLine(loud);
  assert.match(line, /^Dreaming — /, `the line names what happened: ${line}`);
  assert.match(line, /3 new records reviewed/, `the count of what was reviewed: ${line}`);
  assert.match(line, /1 belief added/, `and what came of it: ${line}`);
  assert.ok(!/undefined|NaN/.test(line), "no placeholders leak into a sentence a person reads");
});
test("8. the throttle gap is long enough to be a gap", () => {
  assert.ok(DREAM_MIN_GAP_MS >= 6e4, `a guard below a minute would re-consolidate on every wake: ${DREAM_MIN_GAP_MS}`);
  assert.ok(DREAM_MIN_GAP_MS < 60 * 60 * 1e3, `and above an hour it would miss a day's work: ${DREAM_MIN_GAP_MS}`);
});
