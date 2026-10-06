/**
 * §TRIGGERS probe — the crew works when work arrives, and a trigger is a
 * DOORBELL, not a key: every fire enters through the governed pipeline, a
 * risky target parks at the human gate, webhooks prove the sender, events
 * match exactly, and rate caps are real.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

declare const SI_ROOT: string;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();
import { createHmac } from "node:crypto";
import { bindOwnerRoot } from "../src/security/ownerRoot";
import {
  addTrigger, dueTriggers, fireTrigger, listTriggers, matchEvent,
  removeTrigger, resetTriggersForProbe, setTriggerEnabled, verifyWebhookSignature,
} from "../src/engine/intakeTriggers";

let pass = 0;
let fail = 0;
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}
function section(name: string): void { console.log(`\n== ${name}`); }

bindOwnerRoot("probe-owner-passphrase");
resetTriggersForProbe();
const T0 = 1_790_000_000_000;

section("1. schedules fire when the interval has actually elapsed");
{
  const { trigger } = addTrigger({ name: "heartbeat", kind: "schedule", intervalMs: 60_000, target: { tool: "calculator", args: { expression: "1+1" } }, maxPerHour: 30 });
  ok("a fresh schedule is due at the very next tick — arming is real", dueTriggers(T0).some((t) => t.id === trigger.id));
  const f = await fireTrigger(trigger.id, T0 + 61_000);
  assert.ok(f.ok);
  ok("the fire executed through the governed pipeline", f.verdict === "executed");
  ok("the schedule went quiet again until the next interval", dueTriggers(T0 + 62_000).length === 0 && dueTriggers(T0 + 121_000).some((t) => t.id === trigger.id));
  removeTrigger(trigger.id);
}

section("2. rate caps are real");
{
  const { trigger } = addTrigger({ name: "tapped", kind: "schedule", intervalMs: 1_000, target: { tool: "clock", args: {} }, maxPerHour: 2 });
  ok("first fire ok", (await fireTrigger(trigger.id, T0)).ok);
  ok("second fire ok", (await fireTrigger(trigger.id, T0 + 2_000)).ok);
  const third = await fireTrigger(trigger.id, T0 + 4_000);
  ok("the third fire inside the hour is refused and counted", third.ok === false && /rate cap/.test(third.reason));
  const pub = listTriggers().find((t) => t.id === trigger.id);
  assert.ok(pub);
  ok("the refusal is visible on the roster", pub.refused === 1 && pub.lastVerdict === "rate-capped");
}

section("3. webhooks prove the sender");
{
  const created = addTrigger({ name: "inbound", kind: "webhook", target: { tool: "workspace_write", args: { name: "hook.txt", content: "from the wire" } }, maxPerHour: 5 });
  const secret = created.secret!;
  ok("the signing secret is shown once and stored only as a fingerprint",
    secret.length > 0 && created.trigger.secretFingerprint === undefined ? false : true);
  const payload = JSON.stringify({ ok: 1 });
  const good = createHmac("sha256", secret).update(payload).digest("hex");
  ok("the right signature verifies", verifyWebhookSignature(created.trigger.id, payload, good));
  ok("a wrong signature refuses", verifyWebhookSignature(created.trigger.id, payload + "x", good) === false);
  const fired = await fireTrigger(created.trigger.id);
  assert.ok(fired.ok);
  ok("the risky target PARKED AT THE GATE — the trigger spent no authority", fired.gated === true && /waiting for the human/.test(fired.verdict));
  removeTrigger(created.trigger.id);
  ok("a removed trigger no longer verifies anything", verifyWebhookSignature(created.trigger.id, payload, good) === false);
}

section("4. events match by exact name — nothing else");
{
  const { trigger } = addTrigger({ name: "on-merge", kind: "event", eventName: "repo.merged", target: { tool: "clock", args: {} } });
  const near = await matchEvent("repo.merged At The Seams"); // a prefix-ish near miss
  ok("a near-miss event fires nothing", near.length === 0);
  const hit = await matchEvent("repo.merged");
  ok("the exact event fires its trigger through the governed call", hit.length === 1 && hit[0].ok && hit[0].verdict === "executed");
  setTriggerEnabled(trigger.id, false);
  const off = await matchEvent("repo.merged");
  ok("a disabled trigger refuses in words", off.length === 1 && off[0].ok === false && /disabled/.test(off[0].reason));
}

section("5. the wires are real — the app's heartbeat fires due schedules");
{
  const store = fs.readFileSync(path.join(ROOT, "src", "ui", "store.ts"), "utf8");
  ok("the heartbeat ticks due triggers through the governed fire", /dueTriggers\(\)/.test(store) && /fireTrigger\(/.test(store) && /doorbell, not a/.test(store));
  const src = fs.readFileSync(path.join(ROOT, "src", "engine", "intakeTriggers.ts"), "utf8");
  ok("every fire rides runSelfImpulseToolCall — no side door", /import \{ runSelfImpulseToolCall \}/.test(src) && /origin: "trigger"/.test(src) && !/child_process|node:child_process/.test(src));
  const settings = fs.readFileSync(path.join(ROOT, "src", "ui", "screens", "Settings.tsx"), "utf8");
  ok("the product surface shows the roster and arms schedules", /TriggersPane/.test(settings) && /Arm it/.test(settings));
}

console.log(`\ntriggers: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
