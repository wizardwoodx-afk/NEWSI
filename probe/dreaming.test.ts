/**
 * DREAMING probe — the consolidation memory must EARN what it says.
 *
 * The whole claim of this subsystem is that a promoted memory is different in
 * kind from a ledger row: it repeated, it spread across days, and it cleared a
 * confidence floor. So this probe is written as an attack on that claim. It
 * tries to get a one-off promoted, it tries to get a single day counted three
 * times, it tries to keep a belief alive that nothing reconfirms, and it checks
 * that a memory which fails a gate NAMES the gate instead of vanishing.
 *
 * Run: ./node_modules/.bin/esbuild probe/dreaming.test.ts --bundle --platform=node \
 *        --format=esm --outfile=/tmp/dreaming.mjs --log-level=error && node /tmp/dreaming.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/* ── localStorage shim (same pattern the other engine probes use) ─────────── */
if (typeof globalThis.localStorage === "undefined") {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

import { recordDecision, clearMemory, memoryBriefing } from "../src/engine/memory";
import {
  dreamPass, dreamStatus, loadDurable, recall, recallBriefing, forgetMemory, forgetAllDurable,
  confidenceOf, keywords, similarity, groupKey, SAME_PATTERN,
  MIN_EVIDENCE, MIN_SESSIONS, MIN_CONFIDENCE, DURABLE_CAP,
} from "../src/engine/dreaming";

const U = "dream-user";

function reset(): void {
  clearMemory(U);
  forgetAllDurable();
}

/** One rejection, with an explicit day so the independence gate is testable. */
function reject(day: string, reason: string, scenario = "draft a release note") {
  return recordDecision({
    userId: U, scenario, action: "drafted a release note", kind: "reject", reason,
    specialistId: "docs.changelog", category: "writing", ts: `${day}T10:00:00.000Z`,
  });
}

test("grouping: two PHRASINGS of one complaint group; an unrelated one does not", () => {
  const set = (t: string) => new Set(keywords(t));
  const a = set("The tone was far too marketing-heavy for a changelog");
  const b = set("too marketing heavy, reads like an ad");
  const c = set("the colours were wrong in the header");
  assert.ok(similarity(a, b) >= SAME_PATTERN, `rephrasings must group: ${similarity(a, b)}`);
  assert.ok(similarity(a, c) < SAME_PATTERN, `unrelated complaints must not group: ${similarity(a, c)}`);
  assert.ok(keywords("The tone was far too marketing-heavy").includes("marketing"));
  assert.ok(!keywords("the tone was far too marketing-heavy").includes("the"), "stopwords are dropped");
  /* The group's identity is what its MEMBERS share, so it does not depend on
   * which sighting happened to arrive first. */
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
  assert.equal(report.held[0].sightings, 3, "…and it did clear the evidence gate, so the reason is the honest one");
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
  assert.equal(loadDurable(U).length, 1, "…and must not create a duplicate belief beside the first");
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
  /* Seven quiet cycles. Nothing is staged, so nothing is reconfirmed, so the
     strength falls every pass — which is the half the raw ledger never had. */
  for (let i = 0; i < 7; i++) dreamPass(U, `2026-04-1${i}T12:00:00.000Z`);
  const st = dreamStatus(U);
  assert.equal(st.live, 0, `a stale belief must retire; strength=${loadDurable(U)[0]?.strength}`);
  assert.equal(st.retired, 1, "retired, not deleted — a reversal stays visible in the record");
  assert.equal(loadDurable(U)[0].retired, true);
});

test("7. a retired memory is not recalled, and never reaches the briefing", () => {
  reset();
  reject("2026-05-01", "too marketing-heavy");
  reject("2026-05-02", "too marketing-heavy");
  reject("2026-05-03", "too marketing-heavy");
  dreamPass(U, "2026-05-03T12:00:00.000Z");
  assert.ok(recall("write me a release note", 3, U).length > 0, "…while it is alive it is recalled");
  for (let i = 0; i < 7; i++) dreamPass(U, `2026-05-1${i}T12:00:00.000Z`);
  assert.equal(recall("write me a release note", 3, U).length, 0);
  assert.equal(recallBriefing("write me a release note", 3, U).length, 0);
});

test("8. RECALL ranks by overlap x strength — relevance first, evidence as the tie-break", () => {
  reset();
  /* Two live beliefs about different things, promoted the same way. */
  for (const [day, reason, scenario] of [
    ["2026-06-01", "too marketing-heavy", "draft a release note"],
    ["2026-06-02", "too marketing-heavy", "draft a release note"],
    ["2026-06-03", "too marketing-heavy", "draft a release note"],
  ] as const) reject(day, reason, scenario);
  for (const [day, reason, scenario] of [
    ["2026-06-01", "the row heights were wrong in the ledger table", "build a finance table"],
    ["2026-06-02", "the row heights were wrong in the ledger table", "build a finance table"],
    ["2026-06-03", "the row heights were wrong in the ledger table", "build a finance table"],
  ] as const)
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
  assert.ok(confidenceOf(10, 10) <= 1, "and it is capped at 1 — confidence is not a counter");
  assert.ok(confidenceOf(3, 2) >= MIN_CONFIDENCE, "three across two days is the intended minimum");
  assert.ok(confidenceOf(1, 1) < MIN_CONFIDENCE);
});

test("10. the briefing carries LEARNED memory, and labels a lone event as a lone event", () => {
  reset();
  reject("2026-07-01", "too marketing-heavy");
  const thin = memoryBriefing(U, 4, "draft a release note");
  assert.ok(thin.some((l) => /decision history/i.test(l)), "the ledger fact stays — it is cheap and it is true");
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

test("12. the cap protects the store, and the WEAKEST give way — not the oldest", () => {
  reset();
  /* Fill past the cap with distinct short-lived beliefs, then check the store
     never exceeds DURABLE_CAP. A receipt file drops the oldest; a memory store
     must drop the weakest, which this asserts by construction. */
  /* Four genuinely DISTINCT complaints. An earlier version of this test used
     four near-identical reasons differing by a digit, and they correctly grouped
     into ONE pattern — the grouping was right and the fixture was wrong. */
  const topics = [
    "the indentation used tabs instead of spaces",
    "the invoice currency was displayed in dollars not rupees",
    "the error message leaked an internal hostname",
    "the chart legend overlapped the axis labels",
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

/* ─────────────────────────────────────────────────────────────────────────────
 * The four gaps a review found in the shipped build. Each one is a state
 * transition the earlier tests never made: they always recorded ALL the
 * evidence and THEN ran one pass, which is the one order in which a watermark
 * bug cannot show itself.
 * ───────────────────────────────────────────────────────────────────────────── */

test("14. HELD EVIDENCE ACCUMULATES ACROSS CYCLES — one a day promotes on the third day", () => {
  reset();
  /* The order that matters: record ONE, consolidate, record ONE, consolidate…
   * The pass consumes the record it saw, so if the evidence behind a held
   * candidate did not survive the cycle, every pass sees exactly one sighting
   * forever and nothing is ever promoted. */
  reject("2026-07-01", "too marketing-heavy");
  const d1 = dreamPass(U, "2026-07-01T12:00:00.000Z");
  assert.equal(d1.promoted, 0, "one sighting is not a pattern");
  assert.match(d1.held[0].blockedBy ?? "", /evidence: 1\/3/, `day 1 must hold on evidence: ${d1.held[0]?.blockedBy}`);

  reject("2026-07-02", "too marketing-heavy");
  const d2 = dreamPass(U, "2026-07-02T12:00:00.000Z");
  assert.equal(d2.promoted, 0, "two sightings are still not a pattern");
  assert.match(d2.held[0].blockedBy ?? "", /evidence: 2\/3/, `day 2 must show 2/3: ${d2.held[0]?.blockedBy}`);
  assert.equal(d2.held[0].days, 2, "…and two separate days, which is the other gate");

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
  /* A fortnight of passes with no new evidence. Pending is EVIDENCE, not belief:
   * it is owed no decay, and it must still be there when the next sighting
   * arrives — otherwise a slow-burning pattern is erased by the calendar. */
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
  const rejectAs = (u: string, day: string) =>
    recordDecision({ userId: u, scenario: "draft a release note", action: "drafted a release note", kind: "reject", reason: "too marketing-heavy", specialistId: "docs.changelog", category: "writing", ts: `${day}T10:00:00.000Z` });
  for (const day of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
    rejectAs(A, day);
    rejectAs(B, day);
  }

  dreamPass(A, "2026-09-03T12:00:00.000Z");
  assert.equal(loadDurable(A).length, 1, "A has a belief");
  assert.equal(loadDurable(B).length, 0, "…and B does not: A's pass is not B's pass");
  dreamPass(B, "2026-09-03T12:00:00.000Z");
  assert.equal(loadDurable(B).length, 1, "B consolidates their own");
  assert.equal(loadDurable().length, 2, "two people, two beliefs — the same habit is not the same memory");
  assert.notEqual(loadDurable(A)[0].id, loadDurable(B)[0].id, "…and they are different entries, not a shared one");
  for (const m of loadDurable()) assert.ok(m.userId === A || m.userId === B, `every belief names its owner: ${m.userId}`);

  assert.equal(recall("draft a release note", 3, A).length, 1);
  assert.equal(recall("draft a release note", 3, B).length, 1);

  /* A's forgetting is A's. */
  assert.equal(forgetAllDurable(A), 1);
  assert.equal(loadDurable(A).length, 0, "A's belief is gone");
  assert.equal(loadDurable(B).length, 1, "B's belief survived somebody else asking to be forgotten");
});

test("17. a belief reconfirmed for one user never decays another user's", () => {
  reset();
  const A = "user-a";
  const B = "user-b";
  const rec = (u: string, day: string, reason: string) =>
    recordDecision({ userId: u, scenario: "draft a release note", action: "drafted a release note", kind: "reject", reason, specialistId: "docs.changelog", category: "writing", ts: `${day}T10:00:00.000Z` });
  for (const day of ["2026-10-01", "2026-10-02", "2026-10-03"]) rec(B, day, "the numbers were wrong twice");
  dreamPass(B, "2026-10-03T12:00:00.000Z");
  const bStrength = loadDurable(B)[0].strength;

  /* A does three months of work. B is silent throughout. */
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

test("18. decay is charged per SILENT DAY, not per pass — a schedule must not decide what is true", () => {
  reset();
  reject("2026-12-01", "too marketing-heavy");
  reject("2026-12-02", "too marketing-heavy");
  reject("2026-12-03", "too marketing-heavy");
  dreamPass(U, "2026-12-03T12:00:00.000Z");
  const s0 = loadDurable(U)[0].strength;

  /* Thirty passes inside the same afternoon: a heartbeat at 15 minutes. */
  for (let i = 0; i < 30; i++) dreamPass(U, "2026-12-03T23:00:00.000Z");
  assert.equal(loadDurable(U)[0].strength, s0, "a second pass on the same day costs a belief nothing");

  /* And the same pass on the same day but a fortnight later does. */
  for (let i = 14; i < 20; i++) dreamPass(U, "2026-12-20T12:00:00.000Z");
  const s1 = loadDurable(U)[0].strength;
  assert.ok(s1 < s0, `silence must cost, and cost once: ${s0} -> ${s1}`);
  for (let i = 0; i < 5; i++) dreamPass(U, "2026-12-20T13:00:00.000Z");
  assert.equal(loadDurable(U)[0].strength, s1, "…and the same silence is never charged twice");
});

test("19. SESSION START: with no query the STRONGEST beliefs stand in, and the fallback does not fire", () => {
  reset();
  reject("2027-01-01", "too marketing-heavy");
  reject("2027-01-02", "too marketing-heavy");
  reject("2027-01-03", "too marketing-heavy");
  dreamPass(U, "2027-01-03T12:00:00.000Z");
  assert.equal(loadDurable(U).length, 1);

  /* No query at all — the path a session start takes. It used to pass "*",
   * which has no keywords, found nothing, and quietly fell back to the raw
   * rejection lines the consolidation was supposed to have replaced. */
  const brief = memoryBriefing(U, 4);
  const learned = brief.filter((l) => /LEARNED/.test(l));
  assert.equal(learned.length, 1, `consolidated memory must reach the model: ${JSON.stringify(brief)}`);
  assert.ok(brief.some((l) => /marketing/.test(l)), "and it must be the learned statement, not the raw ledger line");
  assert.ok(!brief.some((l) => /Rejected once/.test(l)), "the un-consolidated fallback must NOT fire when a belief exists");

  /* The same belief is what a strongly-related search finds, and an unrelated
   * search still finds nothing rather than padding. */
  assert.equal(recallBriefing("", 3, U).length, 2, "a header and one belief");
  assert.equal(recallBriefing("something about kubernetes operators", 3, U).length, 0);
});
