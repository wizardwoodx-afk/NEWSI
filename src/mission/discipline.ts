/**
 * VH 16.10.0 — FEATURE 4: THE NEVER-GIVE-UP LOOP.
 *
 * Three mechanical rules, so "done" means PROVEN done:
 *   1. CONSTRAINT RE-CHECK — the mission's live constraint list is re-read
 *      after every step; a step that violates one is refused, in words.
 *   2. ASK, DON'T GUESS — "ask the human" is a REAL action with a real
 *      answer object, not a failure; guessing past a named unknown refuses.
 *   3. PROOF BEFORE DONE — a mission cannot claim completion without
 *      verification evidence (the checkRunner/arena verdicts), ever.
 */
export interface Constraint { id: string; text: string; hard: boolean }

export class ConstraintLedger {
  private readonly list: Constraint[] = [];
  constructor(initial: string[] = [], private readonly store: Storage | Map<string, string> = globalThis.localStorage ?? new Map<string, string>(), private readonly storeKey = "vh.constraints") {
    for (const text of initial) this.list.push({ id: `c${this.list.length + 1}`, text, hard: true });
    try {
      const raw = (store as Map<string, string>).get(storeKey);
      if (raw && this.list.length === 0) for (const c of JSON.parse(raw) as Constraint[]) this.list.push(c);
    } catch { /* fresh */ }
  }
  add(text: string, hard = true): Constraint {
    const c: Constraint = { id: `c${this.list.length + 1}`, text, hard };
    this.list.push(c);
    try { (this.store as Map<string, string>).set(this.storeKey, JSON.stringify(this.list)); } catch { /* session-only */ }
    return c;
  }
  all(): Constraint[] { return [...this.list]; }
  /** Re-read after EVERY step (rule 1). Returns violations in words. */
  checkStep(stepSummary: string): { ok: boolean; violations: string[] } {
    const lower = stepSummary.toLowerCase();
    const violations = this.list.filter((c) => {
      const words = c.text.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
      return words.length > 0 && words.every((w) => lower.includes(w));
    }).filter((c) => c.hard)
      .map((c) => `constraint violated: "${c.text}" (${c.id}) — the step is refused, not warned.`);
    return { ok: violations.length === 0, violations };
  }
}

/** Rule 2: asking is an action with an answer — never a guess in disguise. */
export interface AskAction { kind: "ask_human"; question: string; unknowns: string[]; answered: boolean; answer?: string }
export function askHuman(question: string, unknowns: string[]): AskAction {
  if (!question.trim()) throw new Error("an ask with no question is a guess in disguise — refused");
  return { kind: "ask_human", question, unknowns, answered: false };
}
export function answerAsk(a: AskAction, answer: string): AskAction {
  if (!answer.trim()) return { ...a, answered: false }; // silence is not an answer
  return { ...a, answered: true, answer };
}

export type DoneVerdict =
  | { done: true; proof: string }
  | { done: false; reason: string };

/** Rule 3: completion is CLAIMED only over evidence. */
export function proofBeforeDone(input: { verificationRan: boolean; verificationPassed: boolean; evidence?: string; constraints: ConstraintLedger; finalSummary: string }): DoneVerdict {
  if (!input.verificationRan) return { done: false, reason: "refused to finish: nothing was verified — a run without its own test is a claim, not a result." };
  if (!input.verificationPassed) return { done: false, reason: "refused to finish: verification FAILED — report the failure honestly, never a fake pass." };
  const c = input.constraints.checkStep(input.finalSummary);
  if (!c.ok) return { done: false, reason: `refused to finish: ${c.violations.join(" ")}` };
  return { done: true, proof: input.evidence ?? "verified (exit-code-first)" };
}
