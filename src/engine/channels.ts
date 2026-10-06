/**
 * SelfImpulse — CHANNELS: the declared communication planes.
 *
 * The standing-agent frameworks this generation converged on all share the
 * same three CORE powers: the agent runs on a cadence without being asked
 * (a heartbeat), it can be triggered from outside (an intake point), and
 * work can arrive from peers (an inbox). SelfImpulse ships those powers the
 * SelfImpulse way — as DECLARED, capped, receipted internal planes, never
 * as an always-on daemon or an open port:
 *
 *   IMPULSE  (heartbeat) — the Captain acts on a cadence the owner set,
 *              inside the autonomy level and caps the owner signed. A
 *              missed cadence fires nothing; a cadence is a request, and
 *              every fire still passes the same governed mission path as a
 *              typed message.
 *   INTAKE   (loopback)  — a declared local intake point for events from
 *              THIS machine. It opens no port: the only listener the
 *              product ever mounts is the supervised A2A host, behind its
 *              own pairing. Intake entries enter through the same gate.
 *   INBOX    (federation)— delegations from paired owners, surfaced as a
 *              channel so the owner can see and cap the flow. The runtime
 *              behind it is the receipted A2A bridge.
 *
 * The laws, in code: every channel ships DISABLED; every channel carries a
 * one-sentence purpose and numeric caps; a fire that would exceed its cap
 * is refused in words; and every fire produces a receipt-shaped record —
 * the channel asks for the work, the governed path decides whether it
 * happens. Nothing here is a second authority.
 */
import { createHash } from "node:crypto";

export type ChannelKind = "impulse" | "intake" | "inbox";

export interface ChannelCaps {
  /** Maximum fires in any trailing 24 hours. 0 = no fires, ever. */
  maxPerDay: number;
  /** The budget ceiling each fire's mission runs under (authority units). */
  budgetPerRun: number;
}

export interface ChannelDef {
  id: string;
  kind: ChannelKind;
  name: string;
  /** One sentence a reviewer can hold the channel to. */
  purpose: string;
  /** For IMPULSE channels: the requested cadence, in ms. */
  everyMs?: number;
  /** For INTAKE channels: the bind scope. Only loopback is ever offered. */
  bind?: "loopback";
  caps: ChannelCaps;
}

/** The declared channels. Default state is governed by the registry below:
 *  everything ships DISABLED, whatever this table implies. */
export const CHANNELS: ChannelDef[] = [
  {
    id: "impulse.heartbeat", kind: "impulse", name: "Impulse",
    purpose: "The Captain reviews open goals on a cadence and acts only inside the signed autonomy caps.",
    everyMs: 30 * 60_000,
    caps: { maxPerDay: 24, budgetPerRun: 0 },
  },
  {
    id: "intake.loopback", kind: "intake", name: "Local intake",
    purpose: "Events from this machine enter through the human gate; no port is opened by this channel.",
    bind: "loopback",
    caps: { maxPerDay: 200, budgetPerRun: 0 },
  },
  {
    id: "inbox.federation", kind: "inbox", name: "Delegation inbox",
    purpose: "Delegations from paired owners land here, capped and receipted, before any seat is seated.",
    caps: { maxPerDay: 50, budgetPerRun: 0 },
  },
];

export function getChannel(id: string): ChannelDef | null {
  return CHANNELS.find((c) => c.id === id) ?? null;
}

/* ── state: opt-in persistence, same discipline as the connectors ───────── */

export interface ChannelState {
  enabled: boolean;
  at?: string;
}

const STATE_KEY = "engine.channels.v1";

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

interface StoredAll { states: Record<string, ChannelState>; fires: Record<string, number[]> }

const sessionStore: StoredAll = { states: {}, fires: {} };

function readAll(): StoredAll {
  const s = storage();
  if (!s) return sessionStore;
  try {
    const raw = JSON.parse(s.getItem(STATE_KEY) ?? "{}") as Partial<StoredAll>;
    return { states: raw.states ?? {}, fires: raw.fires ?? {} };
  } catch {
    return { states: {}, fires: {} };
  }
}

function writeAll(all: StoredAll): void {
  const s = storage();
  if (!s) {
    sessionStore.states = all.states;
    sessionStore.fires = all.fires;
    return;
  }
  try {
    s.setItem(STATE_KEY, JSON.stringify(all));
  } catch {
    /* in-memory surfaces simply don't persist; the state still lives for the session */
  }
}

export function channelState(id: string): ChannelState {
  return readAll().states[id] ?? { enabled: false };
}

export function setChannelEnabled(id: string, enabled: boolean): ChannelState[] {
  if (!getChannel(id)) return CHANNELS.map((c) => channelState(c.id));
  const all = readAll();
  all.states[id] = enabled ? { enabled: true, at: new Date().toISOString() } : { enabled: false };
  writeAll(all);
  return CHANNELS.map((c) => channelState(c.id));
}

/* ── firing: caps are law, fires are receipted ──────────────────────────── */

export type FireVerdict =
  | { ok: true; channelId: string }
  | { ok: false; channelId: string; reason: string };

const DAY_MS = 24 * 60 * 60_000;

/** Fires recorded in the trailing 24 h for a channel. */
export function firesInLastDay(id: string, now: number): number {
  return (readAll().fires[id] ?? []).filter((t) => now - t < DAY_MS).length;
}

/** May this channel fire right now? THE cap check — a fire that would
 *  exceed its declared daily cap is refused in words, never truncated. */
export function mayFire(id: string, now: number): FireVerdict {
  const def = getChannel(id);
  if (!def) return { ok: false, channelId: id, reason: "no such channel is declared" };
  if (!channelState(id).enabled) return { ok: false, channelId: id, reason: `channel \"${def.name}\" is disabled — nothing fires without the owner turning it on` };
  if (def.caps.maxPerDay <= 0) return { ok: false, channelId: id, reason: `channel \"${def.name}\" declares no daily budget; a channel without a cap does not fire` };
  const fires = firesInLastDay(id, now);
  if (fires >= def.caps.maxPerDay) {
    return { ok: false, channelId: id, reason: `daily cap reached for \"${def.name}\" (${fires}/${def.caps.maxPerDay} in the last 24 h)` };
  }
  return { ok: true, channelId: id };
}

/** Is a cadence channel DUE as of `now`? Pure over (channel, lastFire, now):
 *  a channel fires only when enabled, on cadence, and never two steps at
 *  once — a missed cadence waits for the next one rather than bursting. */
export function isDue(id: string, now: number): boolean {
  const def = getChannel(id);
  if (!def || def.kind !== "impulse" || !def.everyMs) return false;
  if (!channelState(id).enabled) return false;
  const fires = readAll().fires[id] ?? [];
  if (fires.length === 0) return true; // never fired; the owner enabled it — the first impulse is due
  const last = Math.max(...fires);
  return now - last >= def.everyMs;
}

/** Enabled channels whose cadence is due. */
export function dueChannels(now: number): ChannelDef[] {
  return CHANNELS.filter((c) => isDue(c.id, now));
}

/** Record a fire — the channel-side receipt. The MISSION it triggers carries
 *  its own receipts; this record says only that the channel asked, when,
 *  and in what order. */
export function recordFire(id: string, now: number): FireVerdict {
  const allowed = mayFire(id, now);
  if (!allowed.ok) return allowed;
  const all = readAll();
  const fires = all.fires[id] ?? [];
  fires.push(now);
  all.fires[id] = fires;
  writeAll(all);
  return { ok: true, channelId: id };
}

/** The fire ledger of a channel, newest first. */
export function channelLedger(id: string): number[] {
  return [...(readAll().fires[id] ?? [])].sort((a, b) => b - a);
}

/** A stable content digest for an intake entry — what the gate will see. */
export function intakeDigest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload) ?? "").digest("hex");
}
