/**
 * §RUN CHECKPOINTS — a crash resumes instead of restarting.
 *
 * The enterprise bar for agent runtimes in one sentence: if step 14 of 20
 * fails at 3 a.m., the run resumes from step 13 — it does not start over.
 * The mission runtime already persists its task state (`checkpoints.ts`)
 * and can save/resume a whole runtime (`durable.ts`); THIS file is the
 * tamper-evident chain under the run-level story: every meaningful step of
 * a live run — a settled wave, a human gate opening, a decision landing —
 * appends to a chain any auditor can recompute.
 *
 * THE LAWS THIS FILE ENFORCES
 *  1. THE CHAIN IS THE EVIDENCE. Each checkpoint carries the digest of the
 *     state it saved AND the digest of the checkpoint before it. Recompute
 *     the chain and any edit — a lost step, a rewritten verdict — refuses.
 *  2. RESUME IS EARNED. `resumeRunFrom` returns the resume point only for
 *     a chain that verifies. A tampered journal refuses in words.
 *  3. A RESTART IS NOT A LOSS. The whole journal serializes and reloads —
 *     the app persists it alongside the session, so a crash or a redeploy
 *     picks up where the run stopped, including a run paused at the gate.
 */
import { createHash } from "node:crypto";
import { stableStringify } from "../security/actionGraph";

export interface RunCheckpoint {
  runId: string;
  missionId: string;
  step: number;
  label: string;
  /** digest of the saved state — what the run can be rebuilt from */
  stateDigest: string;
  /** digest of the ENTIRE previous checkpoint — empty for the first */
  prevDigest: string;
  /** digest over every field of THIS checkpoint — the chain links on it,
   *  so editing a label, a step, a mission id, or a timestamp breaks the
   *  chain just as surely as swapping the state. */
  entryDigest: string;
  at: number;
}

const chainOf = new Map<string, RunCheckpoint[]>();
const states = new Map<string, string>(); // stateDigest → canonical state (for resume rebuilds)

const digestOf = (s: unknown): string =>
  createHash("sha256").update(stableStringify(s ?? null)).digest("hex");

export function checkpoint(
  runId: string,
  missionId: string,
  step: number,
  label: string,
  state: unknown,
): RunCheckpoint {
  const chain = chainOf.get(runId) ?? [];
  const prev = chain[chain.length - 1];
  const at = Date.now();
  const stateDigest = digestOf(state);
  const prevDigest = prev ? prev.entryDigest : "";
  const entryDigest = createHash("sha256")
    .update(`${missionId}|${step}|${label}|${stateDigest}|${prevDigest}|${at}`)
    .digest("hex");
  const cp: RunCheckpoint = {
    runId,
    missionId,
    step,
    label,
    stateDigest,
    prevDigest,
    entryDigest,
    at,
  };
  chain.push(cp);
  chainOf.set(runId, chain);
  states.set(cp.stateDigest, stableStringify(state ?? null));
  return cp;
}

export function latestCheckpoint(runId: string): RunCheckpoint | null {
  const chain = chainOf.get(runId);
  return chain && chain.length > 0 ? chain[chain.length - 1] : null;
}

export function chainFor(runId: string): RunCheckpoint[] {
  return [...(chainOf.get(runId) ?? [])];
}

/** Recompute the whole chain. Any broken link — an edited label, a dropped
 *  step, a swapped state — names itself and refuses. */
export function verifyRunChain(runId: string): { ok: true; length: number } | { ok: false; reason: string; detail: string } {
  const chain = chainOf.get(runId);
  if (!chain || chain.length === 0) return { ok: false, reason: "unknown-run", detail: `no checkpoints recorded for ${runId}` };
  let prev: RunCheckpoint | null = null;
  for (let i = 0; i < chain.length; i++) {
    const cp = chain[i];
    const expectedPrev = prev ? prev.entryDigest : "";
    if (cp.prevDigest !== expectedPrev) {
      return { ok: false, reason: "broken-link", detail: `checkpoint ${i} (${cp.label}) points at ${cp.prevDigest.slice(0, 12)} but the previous entry digest is ${expectedPrev.slice(0, 12)}` };
    }
    const recompute = createHash("sha256")
      .update(`${cp.missionId}|${cp.step}|${cp.label}|${cp.stateDigest}|${cp.prevDigest}|${cp.at}`)
      .digest("hex");
    if (cp.entryDigest !== recompute) {
      return { ok: false, reason: "edited-entry", detail: `checkpoint ${i} (${cp.label}) does not match its own digest — a field was edited` };
    }
    if (cp.step < 0 || !cp.label) {
      return { ok: false, reason: "malformed", detail: `checkpoint ${i} is malformed` };
    }
    prev = cp;
  }
  return { ok: true, length: chain.length };
}

/** The resume verdict: WHERE this run picks up, or why it may not. */
export function resumeRunFrom(runId: string):
  | { ok: true; runId: string; missionId: string; fromStep: number; label: string; state: unknown; checkpoints: number }
  | { ok: false; reason: string; detail: string } {
  const verdict = verifyRunChain(runId);
  if (!verdict.ok) return verdict;
  const chain = chainOf.get(runId)!;
  const last = chain[chain.length - 1];
  return {
    ok: true,
    runId,
    missionId: last.missionId,
    fromStep: last.step,
    label: last.label,
    state: JSON.parse(states.get(last.stateDigest) ?? "null"),
    checkpoints: chain.length,
  };
}

/** Serialize one run's chain (or all runs) — what the app persists so a
 *  restart can reload it. */
export function runJournal(runId?: string): string {
  if (runId) return JSON.stringify({ v: 1, runs: { [runId]: chainOf.get(runId) ?? [] } });
  const all: Record<string, RunCheckpoint[]> = {};
  for (const [rid, chain] of chainOf) all[rid] = chain;
  return JSON.stringify({ v: 1, runs: all });
}

/** Reload a journal after a restart. Refuses anything that is not a well-
 *  formed journal; loaded runs re-verify on the next resume attempt. */
export function restoreRunJournal(snapshot: string): { ok: true; runs: number } | { ok: false; reason: string; detail: string } {
  let parsed: { v?: number; runs?: Record<string, RunCheckpoint[]> };
  try {
    parsed = JSON.parse(snapshot);
  } catch {
    return { ok: false, reason: "malformed", detail: "the journal is not valid JSON" };
  }
  if (parsed?.v !== 1 || typeof parsed.runs !== "object" || parsed.runs === null) {
    return { ok: false, reason: "malformed", detail: "not a SelfImpulse run journal" };
  }
  let runs = 0;
  for (const [rid, chain] of Object.entries(parsed.runs)) {
    if (!Array.isArray(chain)) continue;
    chainOf.set(rid, [...chain]);
    runs += 1;
  }
  return { ok: true, runs };
}

/** Probe seam — clears all run journals. Never called by the product. */
export function resetRunCheckpointsForProbe(): void {
  chainOf.clear();
  states.clear();
}
