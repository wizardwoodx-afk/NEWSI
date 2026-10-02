/**
 * BEW — BEHAVIOUR ENFORCEMENT WORKFLOW (19.7.2.1 [Agent])
 *
 * The framework that tells every sub-agent HOW to work: one six-phase
 * workflow every task rides, one error-handling ladder for every failure,
 * and one task ladder per kind of work. BEW is not documentation — it is
 * appended to every specialist's system prompt (see skills.ts →
 * buildSpecialistPrompt), so the composed prompt that reaches the provider
 * carries it verbatim. probe/bew pins the phases, the ladder and the
 * enforcement wiring.
 *
 * Design rules the module itself obeys:
 *   - The phases are data, so the run loop and the probes can hold the
 *     prompt to the same six names — the workflow cannot drift in prose.
 *   - The recovery ladder matches the run loop's actual behaviour (one
 *     situation-changing retry, honest refusals, human gate) — BEW never
 *     instructs an agent to do something the harness forbids.
 *   - Everything is plain words: the framework must survive the token
 *     pipeline's condenser (### headers, checklist lines, numbered rules).
 */

/** The six enforced phases, in order. Same names in the prompt, the loop, the probes. */
export const BEW_PHASES = ["intake", "plan", "act", "verify", "recover", "report"] as const;
export type BewPhase = (typeof BEW_PHASES)[number];

/** The four failure classes and the recovery each one earns. */
export const BEW_ERROR_CLASSES: ReadonlyArray<{ cls: string; recovery: string }> = [
  { cls: "transient", recovery: "one situation-changing retry — change the input, the tool or the wording — then report what happened" },
  { cls: "bad-input", recovery: "fix what you control, run with the part that works, name exactly what is missing for the rest" },
  { cls: "blocked", recovery: "report the blocker, its owner and the smallest action that unblocks it — then continue with everything else" },
  { cls: "gate", recovery: "prepare the ask — what, why, risk, options — and pause at the human gate; never impersonate an approval" },
] as const;

/** Task ladders: the closest ladder wins, the phase order never changes. */
export const BEW_TASK_LADDERS: ReadonlyArray<{ kind: string; ladder: string }> = [
  { kind: "research / answer", ladder: "gather at least two independent sources, cite both, and mark anything that is inference rather than retrieval" },
  { kind: "build / write", ladder: "smallest working artifact first, then harden it; end with a diff summary a reviewer can audit in one sitting" },
  { kind: "fix / debug", ladder: "reproduce → isolate → fix → re-run the original repro; no reproduction, no fix claim" },
  { kind: "analysis / data", ladder: "show the method and the numbers before the conclusion; a number without its derivation is a claim, not a finding" },
  { kind: "review / audit", ladder: "checklist against stated criteria; every item pass or fail WITH the evidence that decides it" },
  { kind: "operate / risky", ladder: "pre-flight list, dry-run, one change at a time, rollback named BEFORE the first change" },
] as const;

const phase = (n: number, name: string, body: string) => `${n}. ${name.toUpperCase()} — ${body}`;

/**
 * The full BEW block, formatted for the prompt (and for the condenser):
 * header · checklist line · the six phases · the recovery ladder · the task ladders · the enforcement line.
 */
export const BEW_BLOCK: string = [
  "### Skill: Behaviour Enforcement Workflow [BEW]",
  "Checklist: intake · plan · act · verify · recover · report",
  "You work inside BEW — one workflow for every task, no exceptions:",
  phase(1, "intake", "restate the objective in one line; split what is GIVEN from what you are ASSUMING; name the deliverable and the check that will prove it done before you start."),
  phase(2, "plan", "fewest steps that cover the objective; each step names its tool and the evidence it should produce; a step that cannot produce evidence is cut from the plan."),
  phase(3, "act", "execute one step at a time; every tool call lands a receipt; a step without evidence did not happen."),
  phase(4, "verify", "run the acceptance check from INTAKE against the actual evidence; numbers come from results you received, never from memory of similar tasks."),
  phase(5, "recover", "on failure, classify it and apply the matching rung — never repeat a failed action unchanged, never hide a failure in prose:"),
  ...BEW_ERROR_CLASSES.map((e) => `     · ${e.cls} → ${e.recovery}`),
  phase(6, "report", "verdict first (done / partial / blocked / INCOMPLETE), then the evidence receipts, then what remains — written so the next agent can resume without re-asking."),
  "Task ladders — pick the closest kind; the six-phase order never changes:",
  ...BEW_TASK_LADDERS.map((l) => `     · ${l.kind} → ${l.ladder}`),
  "Enforcement: BEW rides your system prompt; the run loop receipts your evidence per phase; anything you could not finish surfaces as INCOMPLETE — never as silence.",
].join("\n");

/** True when a composed prompt already carries BEW. */
export function hasBew(prompt: string): boolean {
  return prompt.includes("### Skill: Behaviour Enforcement Workflow [BEW]")
    && BEW_PHASES.every((p) => prompt.toLowerCase().includes(p));
}

/* ── RUNTIME ENFORCEMENT (the review fix) ────────────────────────────────
 *
 * The prompt block instructs; THIS machine enforces. Every member run in
 * agentLoop.ts carries a BewRun: the loop records each phase as it happens,
 * the machine validates the trail against the canonical order, and a run
 * may not report "done" unless VERIFY actually passed. Violations are never
 * thrown away — they ride the run receipt, so a workflow regression in the
 * loop itself shows up as evidence, not silence.
 *
 * What the machine can and cannot do (stated plainly):
 *   - it OWNERS the loop's phase trail (the loop is deterministic code, so
 *     the trail is real, not model-claimed);
 *   - it DOWNGRADES dishonest verdicts: truncated/failed verification forces
 *     the verdict to partial — a run that cannot prove VERIFY cannot claim done;
 *   - it does NOT read the model's mind: the prompt carries the workflow,
 *     the machine carries the proof, and the two are pinned to the same six
 *     phase names.
 */

export interface BewReceipt {
  /** The phase trail this run actually executed, in order. */
  phases: BewPhase[];
  /** verify outcome: pass (clean final answer), fail (truncated/failed), or na (toolless single call still passes on a clean answer — na is reserved for runs that never reached verify). */
  verify: "pass" | "fail" | "na";
  /** Number of RECOVER transitions (auto-repair rungs) this run used. */
  recoveries: number;
  /** Every order/validation violation the machine recorded. */
  violations: string[];
  /** Always true on receipts — a receipt without enforcement is not a BEW receipt. */
  enforced: true;
  /** The final verdict AFTER enforcement (done can be downgraded to partial). */
  verdict: "done" | "partial" | "blocked" | "failed";
}

const PHASE_RANK: Record<BewPhase, number> = { intake: 0, plan: 1, act: 2, verify: 3, recover: 4, report: 5 };

export class BewRun {
  private trail: BewPhase[] = [];
  private violations: string[] = [];
  private recoveries = 0;
  private verified = false;

  constructor(readonly specialistId: string) {
    this.trail.push("intake");
  }

  /** Records a phase transition. Out-of-order transitions are RECORDED, never silent. */
  to(phase: BewPhase): void {
    const last = this.trail[this.trail.length - 1];
    if (phase === "recover") {
      // recover is legal only after work exists (act or verify) and only ONCE per run —
      // a second recovery means the first changed nothing, which the ladder forbids.
      if (!this.trail.includes("act") && !this.trail.includes("verify")) {
        this.violations.push(`recover before any work (${last})`);
      }
      if (this.recoveries >= 1) {
        this.violations.push("second recovery in one run — the ladder allows one situation-changing retry");
      }
      this.recoveries += 1;
      this.trail.push(phase);
      return;
    }
    if (phase === "verify" && !this.trail.includes("act") && !this.trail.includes("plan")) {
      this.violations.push("verify before plan/act");
    }
    if (phase === "report" && !this.trail.includes("verify")) {
      this.violations.push("report without verify");
    }
    if (PHASE_RANK[phase] < PHASE_RANK[last] && phase !== "act") {
      this.violations.push(`phase regression ${last} → ${phase}`);
    }
    if (phase === "verify") this.verified = true;
    this.trail.push(phase);
  }

  /** Whether this run may claim "done". */
  canClaimDone(): boolean {
    return this.verified && this.violations.length === 0;
  }

  /** Finishes the run: verdict coerced when evidence is missing. */
  finish(verdict: "done" | "partial" | "blocked" | "failed"): BewReceipt {
    let final = verdict;
    if (verdict === "done" && !this.canClaimDone()) {
      final = "partial";
      this.violations.push(`verdict downgraded done → partial (${!this.verified ? "verify never passed" : "violations present"})`);
    }
    return {
      phases: this.trail,
      verify: this.verified ? "pass" : "na",
      recoveries: this.recoveries,
      violations: this.violations,
      enforced: true,
      verdict: final,
    };
  }

  /** The compact line that rides member sections and receipts. */
  line(receipt: BewReceipt): string {
    return `BEW ${receipt.phases.join("→")} · verify ${receipt.verify}${receipt.recoveries ? ` · recoveries ${receipt.recoveries}` : ""}${receipt.violations.length ? ` · violations: ${receipt.violations.join("; ")}` : ""} · verdict ${receipt.verdict}`;
  }
}
