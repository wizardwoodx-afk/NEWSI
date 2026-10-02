/**
 * REACH · BEACON — the selfimpulse light (additive to 19.5.6 "Reach").
 *
 * WHY THIS EXISTS NEXT TO THE FLEET BOARD. `src/mission/fleet.ts` answers
 * "what did each seat DO" from measured events. It is a record of the past.
 * Beacon answers the question a human asks when they walk back to the desk:
 * *what does the selfimpulse look like right now, and is anything waiting on me?*
 *
 * Five facts, one state. Beacon derives a single state from a bounded window
 * of pulses — never from a flag someone set:
 *
 *   halted    something is stopped and needs a decision before it moves again
 *   human     work is parked at a human gate; the selfimpulse is waiting on YOU
 *   waiting   a seat is blocked on a peer, a lock or an upstream run
 *   flickering  contention: several sources are pulsing at once in a short window
 *   steady    work is progressing normally
 *   dark      nothing has pulsed inside the liveness window
 *
 * HONESTY RULES (the same ones the rest of VH runs on):
 *   • Beacon reads pulses. It never invents one, and it never upgrades a
 *     `dark` selfimpulse into a `steady` one because a UI would prefer that.
 *   • A command reaches the beacon only through `redactCommand`, so a pulse
 *     can be displayed in a room without leaking a token into the room.
 *   • `seenOf` names the sources it actually saw, so "who is lit" is auditable
 *     rather than a vibe.
 *
 * Module only: no network, no transports, no storage of its own. The window
 * is passed in and returned; time is always a parameter.
 */
import { pureSha256 } from "../pureHash";

export type BeaconState = "dark" | "steady" | "flickering" | "waiting" | "human" | "halted";

/** A pulse is one observed fact about one source. */
export interface BeaconPulse {
  id: string;
  /** ISO instant the observation was made. */
  at: string;
  /** Who pulsed — a seat id, a peer selfimpulse, or a named surface. */
  source: string;
  state: BeaconState;
  /** Why, in words. Empty reasons are refused at emit time. */
  reason: string;
  /** Optional command, already redacted. */
  command?: string;
  /** Digest over the pulse body — tamper-evident, cheap to re-verify. */
  digest: string;
}

/** The window is bounded on purpose: a beacon that grows forever stops being readable. */
export const BEACON_WINDOW = 200;
/** Nothing pulsed inside this window means the selfimpulse is dark. */
export const BEACON_LIVENESS_MS = 15 * 60 * 1000;
/** This many distinct sources inside the contention window reads as flickering. */
export const BEACON_CONTENTION_MS = 60 * 1000;
export const BEACON_CONTENTION_SOURCES = 3;

export interface BeaconOptions {
  livenessMs?: number;
  contentionMs?: number;
  contentionSources?: number;
}

/** Canonical body for the pulse digest — key order fixed, no whitespace games. */
export function pulseCanonical(p: Omit<BeaconPulse, "digest">): string {
  return [p.id, p.at, p.source, p.state, p.reason, p.command ?? ""].join("\u001f");
}

/**
 * Strip anything that must not be read aloud in a room: bearer tokens, API
 * keys, JWTs, emails, absolute home paths and long hex/secret-looking runs.
 * Redaction is described by what it did, so the reader knows a hole exists.
 */
export function redactCommand(command: string): string {
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

/**
 * Emit a pulse into a window. Returns the NEXT window (append-only, bounded
 * to the newest BEACON_WINDOW pulses) or a refusal in words — a pulse with no
 * reason is not an observation, it is noise, and noise is refused here rather
 * than filtered later.
 */
export function emitBeacon(
  window: readonly BeaconPulse[],
  input: { id: string; source: string; state: BeaconState; reason: string; command?: string; at: string },
): { ok: true; window: BeaconPulse[]; pulse: BeaconPulse } | { ok: false; reason: string } {
  const reason = input.reason.trim();
  if (input.source.trim().length === 0) return { ok: false, reason: "beacon: no source — an unattributed pulse is not an observation" };
  if (reason.length === 0) return { ok: false, reason: "beacon: no reason — a pulse must say why it is lit" };
  if (window.some((p) => p.id === input.id)) {
    return { ok: false, reason: `beacon: pulse id ${input.id} is already in the window — a re-used id makes two facts indistinguishable` };
  }
  const staged: Omit<BeaconPulse, "digest"> = {
    id: input.id,
    at: input.at,
    source: input.source,
    state: input.state,
    reason: reason.slice(0, 200),
  };
  if (typeof input.command === "string" && input.command.length > 0) {
    staged.command = redactCommand(input.command).slice(0, 200);
  }
  const pulse: BeaconPulse = { ...staged, digest: pureSha256(`vh.beacon.pulse.v1:${pulseCanonical(staged)}`) };
  const next = [...window, pulse];
  return { ok: true, window: next.length > BEACON_WINDOW ? next.slice(next.length - BEACON_WINDOW) : next, pulse };
}

/** Pulse digest is re-derivable from the body — a tampered pulse is named, not shown. */
export function verifyPulse(p: BeaconPulse): { ok: true } | { ok: false; reason: string } {
  const { digest, ...body } = p;
  const want = pureSha256(`vh.beacon.pulse.v1:${pulseCanonical(body)}`);
  return digest === want ? { ok: true } : { ok: false, reason: "beacon: pulse digest does not match its body" };
}

/**
 * Derive the selfimpulse's state from the window. Precedence is deliberate and is
 * the whole safety story: a stopped thing outranks a working thing, and a gate
 * waiting on a human outranks ordinary progress. Order:
 * halted > human > waiting > flickering > steady > dark.
 */
export function beaconState(window: readonly BeaconPulse[], now: Date, options: BeaconOptions = {}): BeaconState {
  const liveness = options.livenessMs ?? BEACON_LIVENESS_MS;
  const contentionMs = options.contentionMs ?? BEACON_CONTENTION_MS;
  const contentionSources = options.contentionSources ?? BEACON_CONTENTION_SOURCES;
  const nowMs = now.getTime();
  const live = window.filter((p) => nowMs - Date.parse(p.at) <= liveness);
  if (live.length === 0) return "dark";
  const any = (s: BeaconState) => live.some((p) => p.state === s);
  if (any("halted")) return "halted";
  if (any("human")) return "human";
  if (any("waiting")) return "waiting";
  const recent = live.filter((p) => nowMs - Date.parse(p.at) <= contentionMs);
  const sources = new Set(recent.map((p) => p.source));
  if (sources.size >= contentionSources) return "flickering";
  if (any("steady")) return "steady";
  return "dark";
}

/** Who is lit, named. The answer is the sources actually seen — never a roster. */
export function seenOf(window: readonly BeaconPulse[], now: Date, options: BeaconOptions = {}): {
  count: number;
  sources: string[];
  oldest: string | null;
  newest: string | null;
} {
  const liveness = options.livenessMs ?? BEACON_LIVENESS_MS;
  const nowMs = now.getTime();
  const live = window.filter((p) => nowMs - Date.parse(p.at) <= liveness);
  const times = live.map((p) => p.at).sort();
  return {
    count: live.length,
    sources: [...new Set(live.map((p) => p.source))].sort(),
    oldest: times[0] ?? null,
    newest: times[times.length - 1] ?? null,
  };
}

/** What is waiting on a human, in words — the one list a person must read. */
export function awaitingHuman(window: readonly BeaconPulse[]): BeaconPulse[] {
  return window.filter((p) => p.state === "human").slice(-BEACON_WINDOW);
}

export interface BeaconGlyph {
  viewBox: string;
  /** A selfimpulse lamp: post, housing, crown, and a beam to one side — not an eye. */
  paths: { d: string; role: "post" | "housing" | "crown" | "beam" | "water" }[];
  title: string;
}

/**
 * Beacon's own mark — a lit selfimpulse lamp with a thrown beam. Drawn as geometry
 * owned by this module so no third-party icon set is shipped or imitated.
 */
export function beaconGlyph(state: BeaconState): BeaconGlyph {
  const lit = state !== "dark";
  const beam = state === "flickering"
    ? "M14 9 L26 5 L26 13 Z"
    : lit
      ? "M14 9 L27 3 L27 15 Z"
      : "M14 9 L20 9 L20 9 Z";
  return {
    viewBox: "0 0 28 28",
    title: state === "dark" ? "Beacon dark" : `Beacon ${state}`,
    paths: [
      { role: "post", d: "M12.5 16 h3 v9 h-3 Z" },
      { role: "housing", d: "M10.5 9.5 a3.5 3.5 0 0 1 7 0 v6.5 h-7 Z" },
      { role: "crown", d: "M11 6.5 h6 l-1 -2.5 h-4 Z" },
      { role: "beam", d: beam },
      { role: "water", d: "M6 25.5 q2 -1.2 4 0 t4 0 t4 0 t4 0" },
    ],
  };
}
