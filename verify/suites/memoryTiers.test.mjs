import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/memoryTiers.test.ts
import assert from "node:assert/strict";

// src/engine/memoryTiers.ts
var WORKING_TTL_MS = 60 * 6e4;
var r3 = (n) => Math.round(n * 1e3) / 1e3;
function tierOf(s, now = Date.now()) {
  const t = Date.parse(s.startedAt);
  return Number.isFinite(t) && now - t < WORKING_TTL_MS ? "working" : "episodic";
}
function recallScore(n, now = Date.now()) {
  const t = Date.parse(n.lastSeen);
  const ageDays = Number.isFinite(t) ? Math.max(0, (now - t) / 864e5) : 1e9;
  const recency = r3(1 / (1 + ageDays));
  const frequency = r3(1 / (1 + Math.max(0, n.sessionIds.length - 1)));
  const weight = r3(Math.min(1, Math.max(0, n.weight)));
  return { recency, frequency, weight, score: r3(0.5 * recency + 0.3 * frequency + 0.2 * weight) };
}
function promote(graph2, now = Date.now(), opts = {}) {
  const minSessions = opts.minSessions ?? 2;
  const threshold = opts.threshold ?? 0.35;
  const limit = opts.limit ?? 12;
  const cands = graph2.nodes.map((n) => ({ n, r: recallScore(n, now) })).filter(({ n, r }) => n.sessionIds.length >= minSessions && r.score >= threshold);
  cands.sort((a, b) => b.r.score - a.r.score || a.n.label.localeCompare(b.n.label));
  return cands.slice(0, limit).map(({ n, r }) => ({
    fact: n.label,
    sessions: [...n.sessionIds],
    score: r.score,
    promotedAt: now
  }));
}
function sessionsPastTtl(sessions2, now, ttlDays) {
  const cutoff = now - ttlDays * 864e5;
  return sessions2.filter((s) => {
    const t = Date.parse(s.startedAt);
    return Number.isFinite(t) && t < cutoff;
  });
}
function tierReport(sessions2, now, facts) {
  let working = 0;
  let episodic = 0;
  let oldest = null;
  for (const s of sessions2) {
    if (tierOf(s, now) === "working") {
      working += 1;
      continue;
    }
    episodic += 1;
    if (oldest === null || s.startedAt < oldest) oldest = s.startedAt;
  }
  return { working, episodic, semantic: facts.length, oldestEpisodic: oldest };
}

// probe/memoryTiers.test.ts
var pass = 0;
var fail = 0;
function ok(label, cond, detail = "") {
  if (cond) {
    pass += 1;
    console.log(`  ok   ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
var NOW = Date.parse("2026-10-04T12:00:00Z");
var iso = (ms) => new Date(ms).toISOString();
var session = (id, startedAt, endedAt = startedAt) => ({ id, title: id, startedAt, endedAt, messageCount: 2, keywords: [], digest: id, messages: [] });
var node = (label, weight, sessionIds, firstSeen, lastSeen = firstSeen) => ({ id: label, label, weight, firstSeen, lastSeen, sessionIds });
var graph = () => ({
  version: 1,
  nodes: [
    node("migration", 0.9, ["s1", "s2", "s3"], iso(NOW - 2 * 6e4), iso(NOW - 6e4)),
    // hot + frequent
    node("postgres", 0.6, ["s1", "s2"], iso(NOW - 3 * 24 * 60 * 6e4)),
    // frequent, cooler
    node("oneoff", 0.8, ["s1"], iso(NOW - 6e4)),
    // hot but single-episode
    node("ancient", 0.9, ["s1", "s2", "s3", "s4"], iso(NOW - 90 * 24 * 60 * 6e4))
    // frequent, cold
  ],
  edges: [],
  sessions: [],
  updatedAt: iso(NOW)
});
var sessions = () => [
  session("s1", iso(NOW - 5 * 6e4)),
  // working
  session("s2", iso(NOW - 2 * 6e4)),
  // working
  session("s3", iso(NOW - 3 * 60 * 6e4)),
  // episodic
  session("s4", iso(NOW - 40 * 24 * 60 * 6e4))
  // episodic, old
];
ok("== 1. tiers: working is the session's own window", tierOf(sessions()[0], NOW) === "working");
ok("an hour-old session is episodic", tierOf(sessions()[2], NOW) === "episodic");
ok("an unparseable timestamp is episodic (never working)", tierOf(session("sx", "not-a-date"), NOW) === "episodic");
ok("== 2. recall is a named number", (() => {
  const hot = recallScore(node("hot", 0.9, ["a"], iso(NOW - 6e4)), NOW);
  return hot.recency >= 0.999 && hot.frequency === 1 && hot.weight === 0.9 && hot.score > 0.95;
})(), "recency 1 today, frequency 1 single-session");
{
  const freshFrequent = recallScore(node("ff", 0.8, ["a", "b", "c"], iso(NOW - 6e4)), NOW);
  const coldFrequent = recallScore(node("cf", 0.8, ["a", "b", "c"], iso(NOW - 30 * 24 * 60 * 6e4)), NOW);
  ok("frequency spreads decay the score", freshFrequent.frequency < 1 && freshFrequent.score < 1);
  ok("recency decay dominates: cold < fresh at equal frequency", coldFrequent.score < freshFrequent.score);
}
{
  const facts = promote(graph(), NOW, { minSessions: 2, threshold: 0.3, limit: 10 });
  ok("== 3. promotion is mechanical and gated", facts.length >= 1 && facts.length <= 10);
  ok("a single-episode keyword never promotes (minSessions=2)", !facts.some((f) => f.fact === "oneoff"));
  ok(
    "the hot frequent keyword leads and carries its episodes",
    facts[0]?.fact === "migration" && facts[0].sessions.length === 3 && facts[0].sessions.includes("s3")
  );
  ok("every fact walks back to real episodes", facts.every((f) => f.sessions.every((s) => sessions().some((x) => x.id === s))));
  const hot = facts.find((f) => f.fact === "migration");
  assert.ok(hot);
  ok("recency decay can push even a frequent keyword below the bar", !facts.some((f) => f.fact === "ancient"));
}
{
  const past = sessionsPastTtl(sessions(), NOW, 30);
  ok("== 4. the forget policy names exactly the TTL-past sessions", past.length === 1 && past[0].id === "s4");
  ok("a 90-day TTL names none of these", sessionsPastTtl(sessions(), NOW, 90).length === 0);
}
{
  const facts = promote(graph(), NOW, { minSessions: 2, threshold: 0.3, limit: 10 });
  const report = tierReport(sessions(), NOW, facts);
  ok("== 5. the census: 2 working, 2 episodic, semantic counted", report.working === 2 && report.episodic === 2 && report.semantic === facts.length);
  ok("the oldest episodic session is the 40-day one", report.oldestEpisodic === iso(NOW - 40 * 24 * 60 * 6e4));
}
console.log(`
memoryTiers: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
