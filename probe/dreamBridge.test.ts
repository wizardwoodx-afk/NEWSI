/**
 * probe/dreamBridge.test.ts — the heartbeat seam.
 *
 * What this file is defending:
 *
 *   1. Consolidation runs from the TICK, not only from a button. The shipped
 *      1.0.0-dreaming build had a working pass and one call site: a click on the
 *      Memory door. Everything below exists so that "Dreaming" means dreaming.
 *   2. THE RECORD EXISTS BEFORE THE WORK DOES. A tick writes its journal row as
 *      `running` BEFORE the pass and completes it after, so an interrupted pass
 *      leaves evidence of itself instead of vanishing. Tested by recording the
 *      ORDER of storage writes during a tick, which is the only honest way to
 *      assert an ordering without a crash harness.
 *   3. The throttle is a schedule guard, and the manual control bypasses it.
 *   4. Nothing here reads or writes another user's memory.
 *
 * Harness: an in-memory localStorage, installed before the engine is imported —
 * the same shape probe/dreaming.test.ts uses, because both run in bare Node.
 */
import assert from "node:assert/strict";
import test from "node:test";

const map = new Map<string, string>();
/** Every setItem key, in order — used to prove the journal row is written first. */
let writes: string[] = [];

(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => map.get(k) ?? null,
  setItem: (k: string, v: string) => {
    writes.push(k);
    map.set(k, String(v));
  },
  removeItem: (k: string) => void map.delete(k),
  clear: () => map.clear(),
  key: (i: number) => Array.from(map.keys())[i] ?? null,
  get length() {
    return map.size;
  },
} as Storage;

import { recordDecision, clearMemory } from "../src/engine/memory";
import { loadDurable, forgetAllDurable } from "../src/engine/dreaming";
import { dreamTick, dreamJournal, dreamCursor, dreamLine, interruptedPasses, DREAM_MIN_GAP_MS, JOURNAL_CAP } from "../src/engine/dreamBridge";

const U = "bridge-user";
const JOURNAL_KEY = "engine.dream.journal.v1";

function reset(): void {
  clearMemory(U);
  forgetAllDurable();
  /* The journal is its own store and outlives a memory reset — which is the
   * point of it. The harness clears it explicitly so tests never read each
   * other's ticks. */
  map.delete(JOURNAL_KEY);
  writes = [];
}

function reject(day: string, reason = "too marketing-heavy", scenario = "draft a release note", userId = U) {
  return recordDecision({
    userId,
    scenario,
    action: "drafted a release note",
    kind: "reject",
    reason,
    specialistId: "docs.changelog",
    category: "writing",
    ts: `${day}T10:00:00.000Z`,
  });
}

test("1. THE HEARTBEAT TICK CONSOLIDATES — no button, no screen, no user present", () => {
  reset();
  reject("2026-03-01");
  reject("2026-03-02");
  reject("2026-03-03");
  const r = dreamTick(U, "2026-03-03T12:00:00.000Z", { force: true });
  assert.equal(r.ran, true, "the tick ran the pass");
  assert.equal(r.report?.promoted, 1, "three sightings over three days is a belief");
  assert.equal(loadDurable(U).length, 1, "…and it is in the store, whether or not anybody opened the Memory door");
});

test("2. THE RECORD EXISTS BEFORE THE WORK: the journal row is written first, and completed after", () => {
  reset();
  reject("2026-04-01");
  reject("2026-04-02");
  reject("2026-04-03");
  writes = [];
  dreamTick(U, "2026-04-03T12:00:00.000Z", { force: true });

  assert.equal(writes[0], JOURNAL_KEY, `the journal must be written before anything else: ${JSON.stringify(writes.slice(0, 3))}`);
  const durableAt = writes.findIndex((k) => k === "engine.dream.mem.v1");
  assert.ok(durableAt > 0, "the durable store is written during the pass, after the record");
  assert.equal(writes[writes.length - 1], JOURNAL_KEY, "and the row is completed last");

  /* The row that was written first said `running`. That is the state a crash
   * leaves behind, and it is readable. */
  const rows = JSON.parse(map.get(JOURNAL_KEY) ?? "[]") as { state: string; promoted: number }[];
  assert.equal(rows.length, 1, "one tick, one row — the running row is completed, not duplicated beside itself");
  assert.equal(rows[0].state, "done");
  assert.equal(rows[0].promoted, 1, "and it carries what the pass actually did");
});

test("3. an interrupted pass is REPORTED, not quietly repeated", () => {
  reset();
  /* The state a crash leaves: a row written and never completed. */
  map.set(
    JOURNAL_KEY,
    JSON.stringify([
      { id: "dream-crashed", userId: U, at: "2026-05-01T03:00:00.000Z", state: "running", staged: 4, promoted: 0, held: 0, retired: 0, passes: 7 },
      { id: "dream-ok", userId: U, at: "2026-04-30T03:00:00.000Z", state: "done", staged: 2, promoted: 1, held: 0, retired: 0, passes: 7 },
    ]),
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
  /* Five seconds later, unforced: the heartbeat has come round again and
   * nothing has happened since, so the tick declines — and says why. */
  const second = dreamTick(U, "2026-06-01T12:00:05.000Z");
  assert.equal(second.ran, false, "a tick inside the gap does not run");
  assert.match(second.whyNot ?? "", /consolidated 5s ago/, `and it says why: ${second.whyNot}`);
  assert.equal(dreamJournal(U).length, 1, "a skipped tick writes no row");

  /* Past the gap, unforced: the schedule says it is time. */
  const third = dreamTick(U, `2026-06-01T12:${String(DREAM_MIN_GAP_MS / 60000 + 1).padStart(2, "0")}:00.000Z`);
  assert.equal(third.ran, true, "past the gap the tick runs without being forced");
  assert.equal(dreamJournal(U).length, 2, "and it is journaled like any other pass");

  /* The gap is expressed in the same units the tick is handed: a caller whose
   * timestamps cannot be read is not blocked by them. */
  const unreadable = dreamTick(U, "not-a-date");
  assert.equal(unreadable.ran, true, "an unreadable stamp must not wedge the schedule shut");
});

test("5. force is the manual control — a person asking for it now gets it now", () => {
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
  map.delete(JOURNAL_KEY);
  const rows: unknown[] = [];
  for (let i = 0; i < JOURNAL_CAP + 25; i++) {
    rows.push({ id: `j${i}`, userId: i % 2 === 0 ? "a" : "b", at: `2026-01-01T00:${String(i % 60).padStart(2, "0")}:00.000Z`, state: "done", staged: 0, promoted: 0, held: 0, retired: 0, passes: i });
  }
  map.set(JOURNAL_KEY, JSON.stringify(rows));
  const a = dreamJournal("a");
  const b = dreamJournal("b");
  assert.ok(a.length <= JOURNAL_CAP && b.length <= JOURNAL_CAP, "each user is capped");
  assert.ok(a.every((r) => r.userId === "a") && b.every((r) => r.userId === "b"), "the journal never mixes people");

  /* And a tick for one user does not touch the other's rows. */
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
  assert.ok(DREAM_MIN_GAP_MS >= 60_000, `a guard below a minute would re-consolidate on every wake: ${DREAM_MIN_GAP_MS}`);
  assert.ok(DREAM_MIN_GAP_MS < 60 * 60 * 1000, `and above an hour it would miss a day's work: ${DREAM_MIN_GAP_MS}`);
});
