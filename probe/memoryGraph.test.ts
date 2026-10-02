/**
 * probe/memoryGraph.test.ts — the conversation memory graph (19.7.0).
 *
 * Pins the user-facing promise: every chat becomes a keyword graph; a
 * "that day when X happened" query recalls the session; rehydration emits a
 * MARKED, trimmed context block — never a silent injection, never a fake.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const mg = await import("../src/engine/memoryGraph");

console.log("== keyword extraction is deterministic and honest ==");
const text = "SelfImpulse signs every mission receipt with OpenSSL and the SelfImpulse ledger; the receipt chain is verified nightly.";
const k1 = mg.extractKeywords(text);
const k2 = mg.extractKeywords(text);
ok("same text in, same keywords out", JSON.stringify(k1) === JSON.stringify(k2) && k1.length > 0);
ok("stopwords never become nodes", !k1.includes("the") && !k1.includes("with") && !k1.includes("every"));
ok("proper nouns rank up (selfimpulse present)", k1.includes("selfimpulse"));
ok("cap at the requested max", mg.extractKeywords(text, 3).length === 3);

console.log("== ingest: a conversation becomes a graph session ==");
mg.clearGraph();
const at = (h: number) => new Date(Date.UTC(2026, 8, 12, 10 + h, 0, 0)).toISOString();
const convo = [
  { role: "user" as const, text: "Deploy the SelfImpulse federation bridge on Tuesday and verify the ledger", at: at(0) },
  { role: "vh" as const, text: "The federation bridge deployment plan: sign the grant, run the crossing, compare ledger roots.", at: at(1) },
  { role: "user" as const, text: "Also remember the Zephyr database migration for the SelfImpulse dashboard", at: at(2) },
  { role: "vh" as const, text: "Noted: the Zephyr migration for the SelfImpulse dashboard joins the mission ledger.", at: at(3) },
];
const s = mg.ingestSession(convo, { id: "chat-test-1" });
ok("the session carries the dated transcript", s.messageCount === 4 && s.messages.length === 4);
ok("the session title comes from the first user message", s.title.startsWith("Deploy the SelfImpulse federation bridge"));
ok("keywords were drawn from the whole conversation", s.keywords.includes("federation") || s.keywords.includes("selfimpulse") || s.keywords.includes("zephyr"));
const g = mg.graph();
ok("graph nodes exist for the session keywords", g.nodes.length >= 3);
ok("co-occurrence edges exist", g.edges.length >= 3);
ok("every node records the session id", g.nodes.every((n) => n.sessionIds.includes("chat-test-1")));

console.log("== upsert is idempotent per session ==");
const before = mg.graph().nodes.length;
mg.ingestSession(convo, { id: "chat-test-1" });
ok("re-ingesting the same session does not fork nodes", mg.graph().nodes.find((n) => n.id === "federation")?.weight === 1 && mg.graph().sessions.filter((x) => x.id === "chat-test-1").length === 1);
ok("node count stable across upsert", mg.graph().nodes.length >= before);

console.log("== recall by keywords ==");
const byKw = mg.recall("what happened with the zephyr database migration?");
ok("a keyword query finds the session", byKw.length >= 1 && byKw[0].session.id === "chat-test-1");
ok("the matched keywords are named, not vibes", byKw[0].matchedKeywords.includes("zephyr") || byKw[0].matchedKeywords.includes("database") || byKw[0].matchedKeywords.includes("migration"));

console.log("== recall by date ('that day') ==");
const byDate = mg.recall("on 12 september what did we do about the federation bridge?", 5, () => new Date(Date.UTC(2026, 8, 19)));
ok("a dated query recalls the session", byDate.length >= 1 && byDate[0].session.id === "chat-test-1");
ok("the date window matched", byDate[0].dateMatch === true);
ok("an unrelated query recalls nothing — honestly", mg.recall("quantum flibbertigibbet engines").length === 0);

console.log("== rehydration is marked and trimmed ==");
const r = mg.rehydrate("chat-test-1");
ok("rehydrate returns the session", r !== null && r.session.id === "chat-test-1");
if (r) {
  ok("the preamble carries the REHYDRATION MARK", r.preamble.includes(mg.REHYDRATION_MARK));
  ok("the preamble names the keywords", r.preamble.includes("keywords:"));
  ok("the preamble carries prior turns labelled", r.preamble.includes("user:") && r.preamble.includes("steward:"));
}
ok("rehydrating an unknown session is an honest null", mg.rehydrate("nope") === null);

console.log("== the view and the stats ==");
const gv = mg.graphView(24);
ok("graphView returns renderable nodes+edges", gv.nodes.length >= 3 && gv.edges.length >= 3);
const st = mg.graphStats();
ok("graphStats counts sessions, nodes, edges", st.sessions >= 1 && st.nodes >= 3 && st.edges >= 3);

console.log("== deletion ==");
mg.deleteSession("chat-test-1");
ok("the session is gone after delete", mg.listSessions().every((x) => x.id !== "chat-test-1"));
mg.clearGraph();
ok("clearGraph empties everything", mg.graphStats().sessions === 0 && mg.graphStats().nodes === 0);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
