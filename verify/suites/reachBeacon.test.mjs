import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/reachBeacon.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

// src/engine/pureHash.ts
var K = [
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
];
var rotr = (x, n) => (x >>> n | x << 32 - n) >>> 0;
var utf8 = (text) => new TextEncoder().encode(text);
function sha256Bytes(data) {
  const bitLen = data.length * 8;
  const padded = new Uint8Array((data.length + 8 >> 6 << 6) + 64);
  padded.set(data);
  padded[data.length] = 128;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 4, bitLen >>> 0);
  dv.setUint32(padded.length - 8, Math.floor(bitLen / 4294967296));
  let h0 = 1779033703, h1 = 3144134277, h2 = 1013904242, h3 = 2773480762;
  let h4 = 1359893119, h5 = 2600822924, h6 = 528734635, h7 = 1541459225;
  const w = new Uint32Array(64);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ w[i - 15] >>> 3;
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ w[i - 2] >>> 10;
      w[i] = w[i - 16] + s0 + w[i - 7] + s1 >>> 0;
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = e & f ^ ~e & g;
      const t1 = h + S1 + ch + K[i] + w[i] >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = a & b ^ a & c ^ b & c;
      const t2 = S0 + maj >>> 0;
      h = g;
      g = f;
      f = e;
      e = d + t1 >>> 0;
      d = c;
      c = b;
      b = a;
      a = t1 + t2 >>> 0;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
    h5 = h5 + f >>> 0;
    h6 = h6 + g >>> 0;
    h7 = h7 + h >>> 0;
  }
  const out = new Uint8Array(32);
  const ov = new DataView(out.buffer);
  ov.setUint32(0, h0);
  ov.setUint32(4, h1);
  ov.setUint32(8, h2);
  ov.setUint32(12, h3);
  ov.setUint32(16, h4);
  ov.setUint32(20, h5);
  ov.setUint32(24, h6);
  ov.setUint32(28, h7);
  return out;
}
var toHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
function pureSha256(text) {
  return toHex(sha256Bytes(utf8(text)));
}

// src/engine/reach/beacon.ts
var BEACON_WINDOW = 200;
var BEACON_LIVENESS_MS = 15 * 60 * 1e3;
var BEACON_CONTENTION_MS = 60 * 1e3;
var BEACON_CONTENTION_SOURCES = 3;
function pulseCanonical(p) {
  return [p.id, p.at, p.source, p.state, p.reason, p.command ?? ""].join("");
}
function redactCommand(command) {
  let out = command;
  out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 [redacted-credential]");
  out = out.replace(/\b(sk|pk|ghp|gho|glpat|xox[baprs])[-_][A-Za-z0-9_-]{8,}/gi, "[redacted-key]");
  out = out.replace(/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[redacted-jwt]");
  out = out.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted-email]");
  out = out.replace(/\/home\/[A-Za-z0-9._-]+/g, "/home/[user]");
  out = out.replace(/\/Users\/[A-Za-z0-9._-]+/g, "/Users/[user]");
  out = out.replace(/(--(?:token|password|secret|api-key|apikey)=)\S+/gi, "$1[redacted]");
  out = out.replace(/\b[A-Fa-f0-9]{40,}\b/g, "[redacted-hex]");
  return out;
}
function emitBeacon(window, input) {
  const reason = input.reason.trim();
  if (input.source.trim().length === 0) return { ok: false, reason: "beacon: no source \u2014 an unattributed pulse is not an observation" };
  if (reason.length === 0) return { ok: false, reason: "beacon: no reason \u2014 a pulse must say why it is lit" };
  if (window.some((p) => p.id === input.id)) {
    return { ok: false, reason: `beacon: pulse id ${input.id} is already in the window \u2014 a re-used id makes two facts indistinguishable` };
  }
  const staged = {
    id: input.id,
    at: input.at,
    source: input.source,
    state: input.state,
    reason: reason.slice(0, 200)
  };
  if (typeof input.command === "string" && input.command.length > 0) {
    staged.command = redactCommand(input.command).slice(0, 200);
  }
  const pulse = { ...staged, digest: pureSha256(`vh.beacon.pulse.v1:${pulseCanonical(staged)}`) };
  const next = [...window, pulse];
  return { ok: true, window: next.length > BEACON_WINDOW ? next.slice(next.length - BEACON_WINDOW) : next, pulse };
}
function verifyPulse(p) {
  const { digest, ...body } = p;
  const want = pureSha256(`vh.beacon.pulse.v1:${pulseCanonical(body)}`);
  return digest === want ? { ok: true } : { ok: false, reason: "beacon: pulse digest does not match its body" };
}
function beaconState(window, now, options = {}) {
  const liveness = options.livenessMs ?? BEACON_LIVENESS_MS;
  const contentionMs = options.contentionMs ?? BEACON_CONTENTION_MS;
  const contentionSources = options.contentionSources ?? BEACON_CONTENTION_SOURCES;
  const nowMs = now.getTime();
  const live = window.filter((p) => nowMs - Date.parse(p.at) <= liveness);
  if (live.length === 0) return "dark";
  const any = (s) => live.some((p) => p.state === s);
  if (any("halted")) return "halted";
  if (any("human")) return "human";
  if (any("waiting")) return "waiting";
  const recent = live.filter((p) => nowMs - Date.parse(p.at) <= contentionMs);
  const sources = new Set(recent.map((p) => p.source));
  if (sources.size >= contentionSources) return "flickering";
  if (any("steady")) return "steady";
  return "dark";
}
function seenOf(window, now, options = {}) {
  const liveness = options.livenessMs ?? BEACON_LIVENESS_MS;
  const nowMs = now.getTime();
  const live = window.filter((p) => nowMs - Date.parse(p.at) <= liveness);
  const times = live.map((p) => p.at).sort();
  return {
    count: live.length,
    sources: [...new Set(live.map((p) => p.source))].sort(),
    oldest: times[0] ?? null,
    newest: times[times.length - 1] ?? null
  };
}
function awaitingHuman(window) {
  return window.filter((p) => p.state === "human").slice(-BEACON_WINDOW);
}
function beaconGlyph(state) {
  const lit = state !== "dark";
  const beam = state === "flickering" ? "M14 9 L26 5 L26 13 Z" : lit ? "M14 9 L27 3 L27 15 Z" : "M14 9 L20 9 L20 9 Z";
  return {
    viewBox: "0 0 28 28",
    title: state === "dark" ? "Beacon dark" : `Beacon ${state}`,
    paths: [
      { role: "post", d: "M12.5 16 h3 v9 h-3 Z" },
      { role: "housing", d: "M10.5 9.5 a3.5 3.5 0 0 1 7 0 v6.5 h-7 Z" },
      { role: "crown", d: "M11 6.5 h6 l-1 -2.5 h-4 Z" },
      { role: "beam", d: beam },
      { role: "water", d: "M6 25.5 q2 -1.2 4 0 t4 0 t4 0 t4 0" }
    ]
  };
}

// probe/reachBeacon.test.ts
var T0 = Date.parse("2026-09-18T06:00:00.000Z");
var at = (msAgo) => new Date(T0 - msAgo).toISOString();
var pulseSeq = 0;
function emit(window, source, state, msAgo = 0, extra = {}) {
  pulseSeq += 1;
  const res = emitBeacon(window, {
    id: `p-${pulseSeq}-${source}`,
    source,
    state,
    reason: extra.reason ?? `${source} reported ${state}`,
    command: extra.command,
    at: at(msAgo)
  });
  assert.equal(res.ok, true, JSON.stringify(res));
  return res.ok ? res.window : window;
}
test("reach beacon \u2014 the selfimpulse light reads, it does not remember folklore", async (t) => {
  await t.test("\xA71 an unattributed or unexplained pulse is refused in words", () => {
    const empty = emitBeacon([], { id: "p0", source: "", state: "steady", reason: "something happened", at: at(0) });
    assert.equal(empty.ok, false);
    if (!empty.ok) assert.match(empty.reason, /no source/);
    const mute = emitBeacon([], { id: "p1", source: "seat-1", state: "steady", reason: "   ", at: at(0) });
    assert.equal(mute.ok, false);
    if (!mute.ok) assert.match(mute.reason, /no reason/);
  });
  await t.test("\xA72 a credential never reaches a pulse body, and the digest covers what is shown", () => {
    const raw = "curl -H 'Authorization: Bearer sk-live-9f8e7d6c5b4a3210' https://api.example.com/v1/run?token=abc";
    const redacted = redactCommand(raw);
    assert.equal(redacted.includes("sk-live-9f8e7d6c5b4a3210"), false, "key must not survive redaction");
    assert.ok(redacted.includes("[redacted-credential]"), redacted);
    assert.equal(redacted.includes("api.example.com"), true, "host stays readable \u2014 it is not the secret");
    const shapes = [
      "ghp_abcdefghijklmnopqrstuvwx",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      "ops@selfimpulse.example",
      "/home/priya/.ssh/id_ed25519",
      "--password=hunter2hunter2",
      "a".repeat(40) + "0123456789abcdef"
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
    assert.equal(pulse.digest, pureSha256(`vh.beacon.pulse.v1:${[pulse.id, pulse.at, pulse.source, pulse.state, pulse.reason, pulse.command ?? ""].join("")}`));
    const tampered = { ...pulse, state: "halted" };
    const verdict = verifyPulse(tampered);
    assert.equal(verdict.ok, false);
    if (!verdict.ok) assert.match(verdict.reason, /digest does not match/);
  });
  await t.test("\xA73 the window is bounded \u2014 the beacon forgets the oldest, permanently", () => {
    let w = [];
    const ids = [];
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
  await t.test("\xA74 state precedence: a stopped thing outranks a working thing", () => {
    let w = [];
    assert.equal(beaconState(w, new Date(T0)), "dark", "an empty window is dark, never steady");
    w = emit(w, "seat-1", "steady", 1e3);
    assert.equal(beaconState(w, new Date(T0)), "steady");
    w = emit(w, "seat-2", "waiting", 900);
    assert.equal(beaconState(w, new Date(T0)), "waiting", "waiting outranks steady");
    w = emit(w, "seat-3", "human", 800);
    assert.equal(beaconState(w, new Date(T0)), "human", "a human gate outranks waiting");
    w = emit(w, "seat-4", "halted", 700);
    assert.equal(beaconState(w, new Date(T0)), "halted", "halted outranks everything");
  });
  await t.test("\xA74b contention reads as flickering, and only inside its own window", () => {
    let w = [];
    w = emit(w, "a", "steady", 5e3);
    w = emit(w, "b", "steady", 4e3);
    assert.equal(beaconState(w, new Date(T0)), "steady", "two sources are not contention");
    w = emit(w, "c", "steady", 3e3);
    assert.equal(beaconState(w, new Date(T0)), "flickering", "three sources inside the contention window flicker");
    const longAgo = emit(emit(emit([], "a", "steady", 3e5), "b", "steady", 29e4), "c", "steady", 28e4);
    assert.equal(longAgo.length, 3, "three pulses, five minutes old, still inside the liveness window");
    assert.equal(beaconState(longAgo, new Date(T0)), "steady", "the same three sources, spread out, are just work");
  });
  await t.test("\xA75 liveness: a stale selfimpulse is dark, not confidently steady", () => {
    const stale = emit([], "seat-1", "steady", BEACON_LIVENESS_MS + 1e3);
    assert.equal(beaconState(stale, new Date(T0)), "dark");
    const fresh = emit([], "seat-1", "steady", BEACON_LIVENESS_MS - 1e3);
    assert.equal(beaconState(fresh, new Date(T0)), "steady");
  });
  await t.test("\xA75b what is lit is named from what was actually seen", () => {
    let w = [];
    w = emit(w, "seat-b", "steady", 1e3);
    w = emit(w, "seat-a", "steady", 2e3);
    w = emit(w, "seat-stale", "human", BEACON_LIVENESS_MS + 5e3);
    const seen = seenOf(w, new Date(T0));
    assert.equal(seen.count, 2, "the stale pulse is not counted as lit");
    assert.deepEqual(seen.sources, ["seat-a", "seat-b"]);
    assert.equal(seen.newest, w[0].at, "seat-b pulsed one second ago \u2014 it is the most recent, not the first inserted");
    assert.equal(seen.oldest, w[1].at);
    assert.ok(Date.parse(seen.newest) > Date.parse(seen.oldest), "newest is later than oldest, whatever the insertion order");
    const waiting = awaitingHuman(w);
    assert.equal(waiting.length, 1);
    assert.equal(waiting[0].source, "seat-stale", "awaitingHuman reports the gate, not the liveness filter");
  });
  await t.test("\xA76 the mark is ours: a selfimpulse lamp, and the beam tells the state", () => {
    const states = ["dark", "steady", "flickering", "waiting", "human", "halted"];
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
