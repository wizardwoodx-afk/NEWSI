/**
 * probe/reachBeacon.test.ts — the selfimpulse light (additive to 19.5.6 "Reach").
 *
 * Beacon is the one surface in the reach pack that is a *reading*, not a
 * record: it answers "what does the selfimpulse look like right now, and is
 * anything waiting on me" from a bounded window of pulses. This suite pins
 * the six properties that make it safe to put on a wall:
 *
 *   §1 an unattributed or unexplained pulse is refused, never stored
 *   §2 redaction happens on the way IN, and the digest covers the redacted text
 *   §3 the window is bounded; the light forgets the oldest, forever
 *   §4 state precedence — halted > human > waiting > flickering > steady > dark
 *   §5 liveness: a stale window reads dark instead of borrowing old confidence
 *   §6 the mark: an owned selfimpulse-lamp glyph whose beam changes with the state
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  BEACON_WINDOW, BEACON_LIVENESS_MS,
  emitBeacon, verifyPulse, beaconState, seenOf, awaitingHuman, redactCommand, beaconGlyph,
  type BeaconPulse, type BeaconState,
} from "../src/engine/reach/beacon";
import { pureSha256 } from "../src/engine/pureHash";

const T0 = Date.parse("2026-09-18T06:00:00.000Z");
const at = (msAgo: number) => new Date(T0 - msAgo).toISOString();

let pulseSeq = 0;
function emit(window: BeaconPulse[], source: string, state: BeaconState, msAgo = 0, extra: { reason?: string; command?: string } = {}) {
  pulseSeq += 1;
  const res = emitBeacon(window, {
    id: `p-${pulseSeq}-${source}`,
    source,
    state,
    reason: extra.reason ?? `${source} reported ${state}`,
    command: extra.command,
    at: at(msAgo),
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.ok ? res.window : window;
}

test("reach beacon — the selfimpulse light reads, it does not remember folklore", async (t) => {
  await t.test("§1 an unattributed or unexplained pulse is refused in words", () => {
    const empty = emitBeacon([], { id: "p0", source: "", state: "steady", reason: "something happened", at: at(0) });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.match(empty.reason, /no source/);

    const mute = emitBeacon([], { id: "p1", source: "seat-1", state: "steady", reason: "   ", at: at(0) });
    assert.equal(mute.ok, false);
    if (!mute.ok) assert.match(mute.reason, /no reason/);
  });

  await t.test("§2 a credential never reaches a pulse body, and the digest covers what is shown", () => {
    const raw = "curl -H 'Authorization: Bearer sk-live-9f8e7d6c5b4a3210' https://api.example.com/v1/run?token=abc";
    const redacted = redactCommand(raw);
    assert.equal(redacted.includes("sk-live-9f8e7d6c5b4a3210"), false, "key must not survive redaction");
    assert.ok(redacted.includes("[redacted-credential]"), redacted);
    assert.equal(redacted.includes("api.example.com"), true, "host stays readable — it is not the secret");

    const shapes = [
      "ghp_abcdefghijklmnopqrstuvwx",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      "ops@selfimpulse.example",
      "/home/priya/.ssh/id_ed25519",
      "--password=hunter2hunter2",
      "a".repeat(40) + "0123456789abcdef",
    ];
    for (const s of shapes) {
      const r = redactCommand(s);
      assert.equal(r.includes(s), false, `redaction missed: ${s}`);
    }
    assert.ok(redactCommand("/Users/ana/.aws/credentials").includes("[user]"));

    let w = emit([], "seat-1", "steady", 0, { command: raw });
    const pulse = w[w.length - 1];
    assert.ok(pulse.command && !pulse.command.includes("sk-live"));
    assert.equal(verifyPulse(pulse).ok, true, "the sealed pulse verifies");
    assert.equal(pulse.digest, pureSha256(`vh.beacon.pulse.v1:${[pulse.id, pulse.at, pulse.source, pulse.state, pulse.reason, pulse.command ?? ""].join("\u001f")}`));

    const tampered: BeaconPulse = { ...pulse, state: "halted" };
    const verdict = verifyPulse(tampered);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.match(verdict.reason, /digest does not match/);
  });

  await t.test("§3 the window is bounded — the beacon forgets the oldest, permanently", () => {
    let w: BeaconPulse[] = [];
    const ids: string[] = [];
    for (let i = 0; i < BEACON_WINDOW + 5; i++) {
      w = emit(w, `seat-${i % 3}`, "steady", i);
      ids.push(w[w.length - 1].id);
    }
    assert.equal(w.length, BEACON_WINDOW);
    assert.equal(w[0].id, ids[5], "the five oldest pulses are gone, not compressed");
    assert.equal(new Set(w.map((p) => p.id)).size, BEACON_WINDOW, "no pulse is silently rewritten");
    for (const dropped of ids.slice(0, 5)) {
      assert.equal(w.some((p) => p.id === dropped), false, `${dropped} should have aged out`);
    }

    const reused = emitBeacon(w, { id: w[0].id, source: "seat-9", state: "halted", reason: "trying to reuse an id", at: at(0) });
    assert.equal(reused.ok, false, "a re-used pulse id would make two facts indistinguishable");
    if (!reused.ok) assert.match(reused.reason, /already in the window/);
  });

  await t.test("§4 state precedence: a stopped thing outranks a working thing", () => {
    let w: BeaconPulse[] = [];
    assert.equal(beaconState(w, new Date(T0)), "dark", "an empty window is dark, never steady");

    w = emit(w, "seat-1", "steady", 1000);
    assert.equal(beaconState(w, new Date(T0)), "steady");

    w = emit(w, "seat-2", "waiting", 900);
    assert.equal(beaconState(w, new Date(T0)), "waiting", "waiting outranks steady");

    w = emit(w, "seat-3", "human", 800);
    assert.equal(beaconState(w, new Date(T0)), "human", "a human gate outranks waiting");

    w = emit(w, "seat-4", "halted", 700);
    assert.equal(beaconState(w, new Date(T0)), "halted", "halted outranks everything");
  });

  await t.test("§4b contention reads as flickering, and only inside its own window", () => {
    let w: BeaconPulse[] = [];
    w = emit(w, "a", "steady", 5_000);
    w = emit(w, "b", "steady", 4_000);
    assert.equal(beaconState(w, new Date(T0)), "steady", "two sources are not contention");
    w = emit(w, "c", "steady", 3_000);
    assert.equal(beaconState(w, new Date(T0)), "flickering", "three sources inside the contention window flicker");

    const longAgo = emit(emit(emit([], "a", "steady", 300_000), "b", "steady", 290_000), "c", "steady", 280_000);
    assert.equal(longAgo.length, 3, "three pulses, five minutes old, still inside the liveness window");
    assert.equal(beaconState(longAgo, new Date(T0)), "steady", "the same three sources, spread out, are just work");
  });

  await t.test("§5 liveness: a stale selfimpulse is dark, not confidently steady", () => {
    const stale = emit([], "seat-1", "steady", BEACON_LIVENESS_MS + 1_000);
    assert.equal(beaconState(stale, new Date(T0)), "dark");
    const fresh = emit([], "seat-1", "steady", BEACON_LIVENESS_MS - 1_000);
    assert.equal(beaconState(fresh, new Date(T0)), "steady");
  });

  await t.test("§5b what is lit is named from what was actually seen", () => {
    let w: BeaconPulse[] = [];
    w = emit(w, "seat-b", "steady", 1_000);
    w = emit(w, "seat-a", "steady", 2_000);
    w = emit(w, "seat-stale", "human", BEACON_LIVENESS_MS + 5_000);
    const seen = seenOf(w, new Date(T0));
    assert.equal(seen.count, 2, "the stale pulse is not counted as lit");
    assert.deepEqual(seen.sources, ["seat-a", "seat-b"]);
    assert.equal(seen.newest, w[0].at, "seat-b pulsed one second ago — it is the most recent, not the first inserted");
    assert.equal(seen.oldest, w[1].at);
    assert.ok(Date.parse(seen.newest) > Date.parse(seen.oldest), "newest is later than oldest, whatever the insertion order");

    const waiting = awaitingHuman(w);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].source, "seat-stale", "awaitingHuman reports the gate, not the liveness filter");
  });

  await t.test("§6 the mark is ours: a selfimpulse lamp, and the beam tells the state", () => {
    const states: BeaconState[] = ["dark", "steady", "flickering", "waiting", "human", "halted"];
    const marks = states.map((s) => beaconGlyph(s));
    for (const m of marks) {
      assert.equal(m.paths.length, 5);
      assert.deepEqual(m.paths.map((p) => p.role), ["post", "housing", "crown", "beam", "water"]);
      assert.ok(m.viewBox.length > 0);
      assert.ok(m.title.length > 0);
    }
    assert.notEqual(marks[0].paths[3].d, marks[1].paths[3].d, "a dark lamp throws no beam");
    assert.notEqual(marks[1].paths[3].d, marks[2].paths[3].d, "a flickering lamp throws a short beam");
    assert.equal(marks[0].title, "Beacon dark");
    assert.equal(beaconGlyph("human").title, "Beacon human");
  });
});
