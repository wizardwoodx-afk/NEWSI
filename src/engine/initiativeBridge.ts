/**
 * THE INITIATIVE→ENGINE BRIDGE (19.7.3 [Agent] — the reviewer's integration fix).
 *
 * 19.7.2.2 had the right architecture with one production bug: the console's
 * heartbeat called askSelfImpulse19() WITHOUT the normal execution deps, so the engine
 * always saw "no provider" and only ever planned. This module fixes it by
 * making the seam impossible to half-wire:
 *
 *   • `engineExecutor()` is THE production ActExecutor. The console builds it
 *     with the SAME dep set the normal chat send uses (provider, human gate,
 *     handoff recorder, evidence fetch, userId) — one factory, no copy-paste.
 *   • The integration probe builds it with a scripted provider and drives the
 *     REAL askSelfImpulse19 → routing → Agentic MoE → member agent loop → receipts
 *     path — the exact code the product runs, not a mock of it.
 *
 * The verdict mapping lives here too, so "what the engine's outcome means to
 * the initiative loop" is defined once and pinned by probe:
 *   error / refused → failed (feeds the circuit breaker)
 *   gated-out       → blocked (surfaced for the human, never forced)
 *   executed        → done, or partial when the reply itself hedges
 *   planned-only    → partial (no provider ⇒ nothing executed — said plainly)
 */
import { askSelfImpulse19 } from "./generalist";
import type { GeneralistDeps, GeneralistResponse } from "./types";
import type { ActExecutor, ActExecutorResult, InitiativeAct } from "./initiative";

/** The prompt the engine receives for each act kind — safe-tier work, verdict-first. */
export function actPrompt(act: InitiativeAct): string {
  const prompts: Record<InitiativeAct["kind"], string> = {
    verify: `Verify (self-initiated, safe tier): ${act.subject}. Run the check now and report a verdict — done / partial / blocked — with the evidence you actually have.`,
    check: `Check (self-initiated, safe tier): ${act.subject}. Do the check and report the verdict with evidence.`,
    resume: `Resume (self-initiated, safe tier): ${act.subject}. Continue the next pending step; gated steps still stop at the human gate.`,
    brief: `Brief me (self-initiated): ${act.subject}. One short paragraph on what changed and what deserves attention.`,
    proposal: "",
  };
  return prompts[act.kind];
}

/** The one definition of "what the engine's outcome means to the loop". */
export function mapReplyToVerdict(reply: GeneralistResponse): ActExecutorResult {
  const note = (reply.note ?? "").slice(0, 160);
  if (reply.outcome === "error" || reply.outcome === "refused") {
    return { verdict: "failed", detail: `${reply.outcome}: ${note || "engine refused"}` };
  }
  if (reply.outcome === "gated-out") {
    return { verdict: "blocked", detail: note || "stopped at the human gate" };
  }
  if (reply.executed === true) {
    const hedged = /partial|incomplete/i.test(reply.reply);
    return {
      verdict: hedged ? "partial" : "done",
      detail: `executed via the real engine — ${note || `reply ${reply.reply.length} chars, receipted`}`,
    };
  }
  return { verdict: "partial", detail: `planned only — no provider connected, nothing executed${note ? ` · ${note}` : ""}` };
}

export interface EngineExecutorOptions {
  /** The console's user id, carried into the engine like a normal send. */
  userId?: string;
  /** Fresh deps per act — provider/gate state can change between heartbeats. */
  depsFactory: () => GeneralistDeps;
  /** Injectable seam for probes; the default IS the production engine. */
  ask?: typeof askSelfImpulse19;
}

/** THE production ActExecutor: heartbeat acts ride the real engine with the
 * full dependency set — the same path a typed chat message takes. */
export function engineExecutor(opts: EngineExecutorOptions): ActExecutor {
  const ask = opts.ask ?? askSelfImpulse19;
  return async (act) => {
    const reply = await ask({ text: actPrompt(act), userId: opts.userId }, opts.depsFactory());
    return mapReplyToVerdict(reply);
  };
}
