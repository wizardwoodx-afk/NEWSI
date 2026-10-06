/**
 * §CHANNELS probe — declared communication planes, default-off, capped.
 *
 * The core powers the strong open-agent frameworks ship — a cadence, an
 * intake point, a peer inbox — arrive here as internal planes. This suite
 * pins the laws that make them safe to ship at all:
 *
 *   §1  every channel ships DISABLED, and a disabled channel fires nothing;
 *   §2  a channel without a daily cap never fires;
 *   §3  the cap is law: the fire after the cap is refused in words;
 *   §4  the cadence math is honest — due when never fired or past the
 *       cadence, never due while disabled, and only IMPULSE channels are
 *       ever due;
 *   §5  every recorded fire lands in the ledger, newest first;
 *   §6  the intake plane declares LOOPBACK and opens no port by itself.
 */
import assert from "node:assert/strict";
import {
  CHANNELS, channelLedger, channelState, dueChannels, firesInLastDay,
  getChannel, intakeDigest, isDue, mayFire, recordFire, setChannelEnabled,
} from "../src/engine/channels";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

const NOW = 1_800_000_000_000; // a fixed clock; the math below is pure

section("1. declared, and OFF until the owner says otherwise");
{
  ok("three planes are declared (impulse, intake, inbox)", CHANNELS.length === 3
    && CHANNELS.some((c) => c.kind === "impulse") && CHANNELS.some((c) => c.kind === "intake") && CHANNELS.some((c) => c.kind === "inbox"));
  ok("every declared channel carries a purpose and a POSITIVE daily cap (a cap-less channel cannot fire, so none is declared)",
    CHANNELS.every((c) => c.purpose.length > 20 && c.caps.maxPerDay > 0));
  ok("every channel reads DISABLED before any owner act",
    CHANNELS.every((c) => channelState(c.id).enabled === false));
  const v = mayFire("impulse.heartbeat", NOW);
  ok("a disabled channel refuses to fire, in words", v.ok === false && (v.reason ?? "").includes("disabled"));
}

section("2. the registry answers by name — and unknown channels refuse");
{
  setChannelEnabled("inbox.federation", true);
  const v = mayFire("inbox.federation", NOW);
  ok("the declared inbox (cap 50) fires when enabled", v.ok === true);
  const ghost = mayFire("channel.does-not-exist", NOW);
  ok("an undeclared channel refuses by name", ghost.ok === false && (ghost.reason ?? "").includes("no such channel"));
  setChannelEnabled("inbox.federation", false);
}

section("3. the cap is law");
{
  setChannelEnabled("impulse.heartbeat", true);
  const cap = getChannel("impulse.heartbeat")?.caps.maxPerDay ?? 0;
  for (let i = 0; i < cap; i++) {
    const r = recordFire("impulse.heartbeat", NOW + i * 1000);
    assert.ok(r.ok, "fires under the cap succeed");
  }
  ok(`the channel fired exactly its cap (${cap})`, firesInLastDay("impulse.heartbeat", NOW + cap * 1000) === cap);
  const over = mayFire("impulse.heartbeat", NOW + cap * 1000 + 1);
  ok("fire cap+1 is refused, with the count in the reason", over.ok === false && (over.reason ?? "").includes("daily cap"));
  const rec = recordFire("impulse.heartbeat", NOW + cap * 1000 + 2);
  ok("recordFire refuses past the cap too — the ledger is not bypassed", rec.ok === false);
  setChannelEnabled("impulse.heartbeat", false);
}

section("4. the cadence math is honest");
{
  /* A clean clock two days out: §3 filled the impulse channel's day, and the
     cadence math must be tested against the channel's OWN last fire, not a
     shared one. */
  const T = NOW + 2 * 24 * 60 * 60_000;
  ok("while disabled it is not due, however old its last fire", isDue("impulse.heartbeat", T) === false);
  setChannelEnabled("impulse.heartbeat", true);
  ok("enabled and past its cadence, it is due", isDue("impulse.heartbeat", T) === true);
  recordFire("impulse.heartbeat", T);
  ok("one millisecond after a fire it is NOT due", isDue("impulse.heartbeat", T + 1) === false);
  const every = getChannel("impulse.heartbeat")?.everyMs ?? 0;
  ok("past the cadence it is due again", isDue("impulse.heartbeat", T + every) === true);
  ok("dueChannels only ever returns IMPULSE channels", dueChannels(T + every).every((c) => c.kind === "impulse"));
  ok("a disabled channel is never due", (setChannelEnabled("impulse.heartbeat", false), isDue("impulse.heartbeat", T + every) === false));
}

section("5. fires land in the ledger, newest first");
{
  setChannelEnabled("inbox.federation", true);
  assert.ok(mayFire("inbox.federation", NOW).ok, "the channel is enabled for this section");
  recordFire("inbox.federation", NOW);
  recordFire("inbox.federation", NOW + 500);
  recordFire("inbox.federation", NOW + 250);
  const ledger = channelLedger("inbox.federation");
  ok("three fires, three records", ledger.length === 3);
  ok("the ledger is newest-first", ledger[0] === NOW + 500 && ledger[1] === NOW + 250 && ledger[2] === NOW);
  setChannelEnabled("inbox.federation", false);
}

section("6. the intake plane is loopback-declared and port-free");
{
  const intake = getChannel("intake.loopback");
  assert.ok(intake);
  ok("the intake channel binds loopback, and only loopback", intake.bind === "loopback");
  ok("the intake purpose opens no port", /no port/i.test(intake.purpose));
  ok("intake digests are stable and content-bound", intakeDigest({ a: 1 }) === intakeDigest({ a: 1 }) && intakeDigest({ a: 1 }) !== intakeDigest({ a: 2 }));
}

console.log(`\nchannels: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
