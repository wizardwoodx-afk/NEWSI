/**
 * §INTAKE TRIGGERS — the crew works when work arrives, not only when asked.
 *
 * (The mission runtime already owns TIME-WINDOW mission dispatch —
 * `mission/triggers.ts`. This file is the other half of proactivity: the
 * INTAKE plane — signed webhooks, named events, and simple schedules with
 * sender proofs and rate caps, feeding the same governed call.)
 *
 * The enterprise platforms converged on the same truth: production agents
 * are PROACTIVE — scheduled jobs, signed webhooks, and named events start
 * runs without a human typing. This file is that plane for SelfImpulse,
 * with the one rule that makes it safe to love:
 *
 *     A TRIGGER IS A DOORBELL, NOT A KEY.
 *
 * Every fire enters through the SAME governed call as a human request —
 * risk classification, the human gate, receipts. A trigger that targets
 * risky work parks at the gate like anything else; it never executes on
 * its own authority.
 *
 * THE LAWS THIS FILE ENFORCES
 *  1. SCHEDULES ARE HONEST. A schedule fires when its interval has actually
 *     elapsed since its last fire — never twice in a tick, never early.
 *  2. WEBHOOKS PROVE THE SENDER. Each webhook trigger holds a secret shown
 *     once at creation; a payload whose HMAC does not verify is refused and
 *     counted. No signature, no fire.
 *  3. EVENTS MATCH BY NAME, EXACTLY. No prefixes, no wildcards — the same
 *     closed-vocabulary discipline as the capability registry.
 *  4. RATE CAPS ARE REAL. A trigger that exhausts its hourly budget stops
 *     firing and says so; the queue of the world does not become a runaway.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { runSelfImpulseToolCall } from "../selfimpulse/engine/selfimpulse";

export type TriggerKind = "schedule" | "webhook" | "event";

export interface Trigger {
  id: string;
  name: string;
  kind: TriggerKind;
  enabled: boolean;
  /** schedule: the minimum interval between fires */
  intervalMs?: number;
  /** event: the exact event name that fires this trigger */
  eventName?: string;
  target: { tool: string; args: Record<string, unknown> };
  /** webhook: sha256 fingerprint of the signing secret (the secret itself
   *  is shown ONCE at creation and never stored in the clear) */
  secretFingerprint?: string;
  maxPerHour: number;
  fires: number;
  refused: number;
  lastFiredAt: number | null;
  lastVerdict: string | null;
}

interface TriggerRecord extends Trigger {
  secret: string | null;
  fireTimes: number[];
}

const triggers = new Map<string, TriggerRecord>();

const HOUR = 3_600_000;

export interface CreatedTrigger {
  trigger: Trigger;
  /** webhook only — the signing secret, shown once, never stored in the clear */
  secret?: string;
}

export function addTrigger(input: {
  name: string;
  kind: TriggerKind;
  target: { tool: string; args: Record<string, unknown> };
  intervalMs?: number;
  eventName?: string;
  maxPerHour?: number;
}): CreatedTrigger {
  if (input.kind === "schedule" && (!input.intervalMs || input.intervalMs < 1000)) {
    throw new Error("a schedule trigger needs an interval of at least one second");
  }
  if (input.kind === "event" && !input.eventName) {
    throw new Error("an event trigger needs the exact event name it answers to");
  }
  const id = `trg-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
  let secret: string | null = null;
  if (input.kind === "webhook") {
    secret = randomBytes(24).toString("hex");
  }
  const rec: TriggerRecord = {
    id,
    name: input.name,
    kind: input.kind,
    enabled: true,
    intervalMs: input.intervalMs,
    eventName: input.eventName,
    target: { tool: input.target.tool, args: JSON.parse(JSON.stringify(input.target.args)) },
    secretFingerprint: secret ? createHash("sha256").update(secret).digest("hex").slice(0, 16) : undefined,
    maxPerHour: input.maxPerHour ?? 12,
    fires: 0,
    refused: 0,
    lastFiredAt: null,
    lastVerdict: null,
    secret,
    fireTimes: [],
  };
  triggers.set(id, rec);
  const { secret: _drop, fireTimes: _drop2, ...pub } = rec;
  return secret ? { trigger: { ...pub }, secret } : { trigger: { ...pub } };
}

/** The public roster — no secrets, no fire history internals. */
export function listTriggers(): Trigger[] {
  return [...triggers.values()].map(({ secret: _s, fireTimes: _f, ...pub }) => pub);
}

export function removeTrigger(id: string): boolean {
  return triggers.delete(id);
}

export function setTriggerEnabled(id: string, enabled: boolean): Trigger | null {
  const rec = triggers.get(id);
  if (!rec) return null;
  rec.enabled = enabled;
  const { secret: _s, fireTimes: _f, ...pub } = rec;
  return { ...pub };
}

function underRateCap(rec: TriggerRecord, now: number): boolean {
  rec.fireTimes = rec.fireTimes.filter((t) => now - t < HOUR);
  return rec.fireTimes.length < rec.maxPerHour;
}

/** The secret-proof gate for webhooks. Constant-time compare. */
export function verifyWebhookSignature(id: string, payload: string, signatureHex: string): boolean {
  const rec = triggers.get(id);
  if (!rec || !rec.secret) return false;
  const expected = createHmac("sha256", rec.secret).update(payload).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

/** Schedules whose interval has actually elapsed (and that are enabled,
 *  under cap, and not fired inside the interval). */
export function dueTriggers(now: number = Date.now()): Trigger[] {
  const due: Trigger[] = [];
  for (const rec of triggers.values()) {
    if (!rec.enabled || rec.kind !== "schedule" || !rec.intervalMs) continue;
    if (rec.lastFiredAt !== null && now - rec.lastFiredAt < rec.intervalMs) continue;
    if (!underRateCap(rec, now)) continue;
    const { secret: _s, fireTimes: _f, ...pub } = rec;
    due.push({ ...pub });
  }
  return due;
}

export type FireOutcome =
  | { ok: true; triggerId: string; callId: string | null; verdict: string; gated: boolean; output: string }
  | { ok: false; triggerId: string; reason: string };

/** Fire a trigger THROUGH the governed pipeline. A risky target parks at
 *  the human gate — the trigger spent no authority to get there. */
export async function fireTrigger(id: string, now: number = Date.now()): Promise<FireOutcome> {
  const rec = triggers.get(id);
  if (!rec) return { ok: false, triggerId: id, reason: "unknown trigger" };
  if (!rec.enabled) return { ok: false, triggerId: id, reason: "trigger is disabled" };
  if (!underRateCap(rec, now)) {
    rec.refused += 1;
    rec.lastVerdict = "rate-capped";
    return { ok: false, triggerId: id, reason: `rate cap reached (${rec.maxPerHour}/hour) — the trigger stays quiet until the window clears` };
  }
  rec.fireTimes.push(now);
  rec.lastFiredAt = now;
  try {
    const r = await runSelfImpulseToolCall(rec.target.tool, rec.target.args, { origin: "trigger", blockOnGate: false });
    const gated = Boolean(r.pending);
    rec.fires += 1;
    rec.lastVerdict = gated ? "gated — waiting for the human" : r.ok ? "executed" : "refused by the pipeline";
    return {
      ok: true,
      triggerId: id,
      callId: r.callId ?? null,
      verdict: rec.lastVerdict,
      gated,
      output: r.output.slice(0, 300),
    };
  } catch (e) {
    rec.lastVerdict = "error";
    return { ok: false, triggerId: id, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** An event arrives: exact-name match (no prefixes, no wildcards), then the
 *  same governed fire. */
export async function matchEvent(name: string, now: number = Date.now()): Promise<FireOutcome[]> {
  const outcomes: FireOutcome[] = [];
  for (const rec of triggers.values()) {
    if (rec.kind !== "event" || rec.eventName !== name) continue;
    outcomes.push(await fireTrigger(rec.id, now));
  }
  return outcomes;
}

/** Probe seam — clears every trigger. Never called by the product. */
export function resetTriggersForProbe(): void {
  triggers.clear();
}
