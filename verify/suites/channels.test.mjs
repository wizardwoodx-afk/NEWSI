import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/channels.test.ts
import assert from "node:assert/strict";

// src/engine/channels.ts
import { createHash } from "node:crypto";
var CHANNELS = [
  {
    id: "impulse.heartbeat",
    kind: "impulse",
    name: "Impulse",
    purpose: "The Captain reviews open goals on a cadence and acts only inside the signed autonomy caps.",
    everyMs: 30 * 6e4,
    caps: { maxPerDay: 24, budgetPerRun: 0 }
  },
  {
    id: "intake.loopback",
    kind: "intake",
    name: "Local intake",
    purpose: "Events from this machine enter through the human gate; no port is opened by this channel.",
    bind: "loopback",
    caps: { maxPerDay: 200, budgetPerRun: 0 }
  },
  {
    id: "inbox.federation",
    kind: "inbox",
    name: "Delegation inbox",
    purpose: "Delegations from paired owners land here, capped and receipted, before any seat is seated.",
    caps: { maxPerDay: 50, budgetPerRun: 0 }
  }
];
function getChannel(id) {
  return CHANNELS.find((c) => c.id === id) ?? null;
}
var STATE_KEY = "engine.channels.v1";
function storage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}
var sessionStore = { states: {}, fires: {} };
function readAll() {
  const s = storage();
  if (!s) return sessionStore;
  try {
    const raw = JSON.parse(s.getItem(STATE_KEY) ?? "{}");
    return { states: raw.states ?? {}, fires: raw.fires ?? {} };
  } catch {
    return { states: {}, fires: {} };
  }
}
function writeAll(all) {
  const s = storage();
  if (!s) {
    sessionStore.states = all.states;
    sessionStore.fires = all.fires;
    return;
  }
  try {
    s.setItem(STATE_KEY, JSON.stringify(all));
  } catch {
  }
}
function channelState(id) {
  return readAll().states[id] ?? { enabled: false };
}
function setChannelEnabled(id, enabled) {
  if (!getChannel(id)) return CHANNELS.map((c) => channelState(c.id));
  const all = readAll();
  all.states[id] = enabled ? { enabled: true, at: (/* @__PURE__ */ new Date()).toISOString() } : { enabled: false };
  writeAll(all);
  return CHANNELS.map((c) => channelState(c.id));
}
var DAY_MS = 24 * 60 * 6e4;
function firesInLastDay(id, now) {
  return (readAll().fires[id] ?? []).filter((t) => now - t < DAY_MS).length;
}
function mayFire(id, now) {
  const def = getChannel(id);
  if (!def) return { ok: false, channelId: id, reason: "no such channel is declared" };
  if (!channelState(id).enabled) return { ok: false, channelId: id, reason: `channel "${def.name}" is disabled \u2014 nothing fires without the owner turning it on` };
  if (def.caps.maxPerDay <= 0) return { ok: false, channelId: id, reason: `channel "${def.name}" declares no daily budget; a channel without a cap does not fire` };
  const fires = firesInLastDay(id, now);
  if (fires >= def.caps.maxPerDay) {
    return { ok: false, channelId: id, reason: `daily cap reached for "${def.name}" (${fires}/${def.caps.maxPerDay} in the last 24 h)` };
  }
  return { ok: true, channelId: id };
}
function isDue(id, now) {
  const def = getChannel(id);
  if (!def || def.kind !== "impulse" || !def.everyMs) return false;
  if (!channelState(id).enabled) return false;
  const fires = readAll().fires[id] ?? [];
  if (fires.length === 0) return true;
  const last = Math.max(...fires);
  return now - last >= def.everyMs;
}
function dueChannels(now) {
  return CHANNELS.filter((c) => isDue(c.id, now));
}
function recordFire(id, now) {
  const allowed = mayFire(id, now);
  if (!allowed.ok) return allowed;
  const all = readAll();
  const fires = all.fires[id] ?? [];
  fires.push(now);
  all.fires[id] = fires;
  writeAll(all);
  return { ok: true, channelId: id };
}
function channelLedger(id) {
  return [...readAll().fires[id] ?? []].sort((a, b) => b - a);
}
function intakeDigest(payload) {
  return createHash("sha256").update(JSON.stringify(payload) ?? "").digest("hex");
}

// probe/channels.test.ts
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
function section(name) {
  console.log(`
== ${name}`);
}
var NOW = 18e11;
section("1. declared, and OFF until the owner says otherwise");
{
  ok("three planes are declared (impulse, intake, inbox)", CHANNELS.length === 3 && CHANNELS.some((c) => c.kind === "impulse") && CHANNELS.some((c) => c.kind === "intake") && CHANNELS.some((c) => c.kind === "inbox"));
  ok(
    "every declared channel carries a purpose and a POSITIVE daily cap (a cap-less channel cannot fire, so none is declared)",
    CHANNELS.every((c) => c.purpose.length > 20 && c.caps.maxPerDay > 0)
  );
  ok(
    "every channel reads DISABLED before any owner act",
    CHANNELS.every((c) => channelState(c.id).enabled === false)
  );
  const v = mayFire("impulse.heartbeat", NOW);
  ok("a disabled channel refuses to fire, in words", v.ok === false && (v.reason ?? "").includes("disabled"));
}
section("2. the registry answers by name \u2014 and unknown channels refuse");
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
    const r = recordFire("impulse.heartbeat", NOW + i * 1e3);
    assert.ok(r.ok, "fires under the cap succeed");
  }
  ok(`the channel fired exactly its cap (${cap})`, firesInLastDay("impulse.heartbeat", NOW + cap * 1e3) === cap);
  const over = mayFire("impulse.heartbeat", NOW + cap * 1e3 + 1);
  ok("fire cap+1 is refused, with the count in the reason", over.ok === false && (over.reason ?? "").includes("daily cap"));
  const rec = recordFire("impulse.heartbeat", NOW + cap * 1e3 + 2);
  ok("recordFire refuses past the cap too \u2014 the ledger is not bypassed", rec.ok === false);
  setChannelEnabled("impulse.heartbeat", false);
}
section("4. the cadence math is honest");
{
  const T = NOW + 2 * 24 * 60 * 6e4;
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
console.log(`
channels: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
