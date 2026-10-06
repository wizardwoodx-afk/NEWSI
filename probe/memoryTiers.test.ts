/**
 * §MEMORY TIERS probe — the layer that makes memory compound.
 *
 * Working → episodic → semantic, with promotion that is MECHANICAL (a fact
 * candidate travels with the episodes it was distilled from), recall that is
 * a named number (recency × frequency × weight), and forgetting that is a
 * visible policy (a TTL), never an ad-hoc deletion.
 */
import assert from "node:assert/strict";
import {
  promote, recallScore, sessionsPastTtl, tierOf, tierReport,
  type SemanticFact,
} from "../src/engine/memoryTiers";
import type { MgGraph, MgNode, MgSession } from "../src/engine/memoryGraph";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const NOW = Date.parse("2026-10-04T12:00:00Z");
const iso = (ms: number): string => new Date(ms).toISOString();
const session = (id: string, startedAt: string, endedAt = startedAt): MgSession =>
  ({ id, title: id, startedAt, endedAt, messageCount: 2, keywords: [], digest: id, messages: [] });
const node = (label: string, weight: number, sessionIds: string[], firstSeen: string, lastSeen = firstSeen): MgNode =>
  ({ id: label, label, weight, firstSeen, lastSeen, sessionIds });

const graph = (): MgGraph => ({
  version: 1,
  nodes: [
    node("migration", 0.9, ["s1", "s2", "s3"], iso(NOW - 2 * 60_000), iso(NOW - 60_000)), // hot + frequent
    node("postgres", 0.6, ["s1", "s2"], iso(NOW - 3 * 24 * 60 * 60_000)),                 // frequent, cooler
    node("oneoff", 0.8, ["s1"], iso(NOW - 60_000)),                                        // hot but single-episode
    node("ancient", 0.9, ["s1", "s2", "s3", "s4"], iso(NOW - 90 * 24 * 60 * 60_000)),     // frequent, cold
  ],
  edges: [],
  sessions: [],
  updatedAt: iso(NOW),
});

const sessions = (): MgSession[] => [
  session("s1", iso(NOW - 5 * 60_000)),                       // working
  session("s2", iso(NOW - 2 * 60_000)),                       // working
  session("s3", iso(NOW - 3 * 60 * 60_000)),                  // episodic
  session("s4", iso(NOW - 40 * 24 * 60 * 60_000)),            // episodic, old
];

ok("== 1. tiers: working is the session's own window", tierOf(sessions()[0], NOW) === "working");
ok("an hour-old session is episodic", tierOf(sessions()[2], NOW) === "episodic");
ok("an unparseable timestamp is episodic (never working)", tierOf(session("sx", "not-a-date"), NOW) === "episodic");

ok("== 2. recall is a named number", (() => {
  const hot = recallScore(node("hot", 0.9, ["a"], iso(NOW - 60_000)), NOW);
  /* a minute old is recency 0.999 after the honest round — not a flat 1 */
  return hot.recency >= 0.999 && hot.frequency === 1 && hot.weight === 0.9 && hot.score > 0.95;
})(), "recency 1 today, frequency 1 single-session");
{
  const freshFrequent = recallScore(node("ff", 0.8, ["a", "b", "c"], iso(NOW - 60_000)), NOW);
  const coldFrequent = recallScore(node("cf", 0.8, ["a", "b", "c"], iso(NOW - 30 * 24 * 60 * 60_000)), NOW);
  ok("frequency spreads decay the score", freshFrequent.frequency < 1 && freshFrequent.score < 1);
  ok("recency decay dominates: cold < fresh at equal frequency", coldFrequent.score < freshFrequent.score);
}

{
  const facts = promote(graph(), NOW, { minSessions: 2, threshold: 0.3, limit: 10 });
  ok("== 3. promotion is mechanical and gated", facts.length >= 1 && facts.length <= 10);
  ok("a single-episode keyword never promotes (minSessions=2)", !facts.some((f) => f.fact === "oneoff"));
  ok("the hot frequent keyword leads and carries its episodes",
    facts[0]?.fact === "migration" && facts[0].sessions.length === 3 && facts[0].sessions.includes("s3"));
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
  const facts: SemanticFact[] = promote(graph(), NOW, { minSessions: 2, threshold: 0.3, limit: 10 });
  const report = tierReport(sessions(), NOW, facts);
  ok("== 5. the census: 2 working, 2 episodic, semantic counted", report.working === 2 && report.episodic === 2 && report.semantic === facts.length);
  ok("the oldest episodic session is the 40-day one", report.oldestEpisodic === iso(NOW - 40 * 24 * 60 * 60_000));
}

console.log(`\nmemoryTiers: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
