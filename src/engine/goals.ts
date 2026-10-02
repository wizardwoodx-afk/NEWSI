/**
 * SelfImpulse — Assignments: goal mode with checkpoints (18.5.0).
 *
 * "Hand it a goal and come back later" — rebuilt on VH's floor: a goal is
 * decomposed into specialist steps by the SAME
 * router that fields every message (no second brain), steps settle ONLY
 * through outcomes the door reports from the real pipeline (executed /
 * planned / gated / refused — never "completed" by fiat), progress is
 * checkpointed in the local store so a closed app resumes where it stopped,
 * and risky steps still pause at the human gate (session Auto-Review rules
 * may answer it; critical never).
 *
 * The module is an orchestrator over states: it never calls a provider and
 * never invents an outcome. The door supplies the executor; probes supply a
 * measured one.
 */
import { routeDeterministic } from "./router";
import { getSpecialist } from "./registry";

const GOALS_KEY = "engine.goals.v1";
const GOAL_CAP = 50;
const MAX_STEPS = 5;

export type StepStatus = "pending" | "done" | "planned" | "gated" | "refused";

export interface GoalStep {
  id: string;
  specialistId: string | null;
  title: string;
  status: StepStatus;
  note?: string;
  receiptDigest?: string;
}

export interface Goal {
  id: string;
  user: string;
  text: string;
  steps: GoalStep[];
  state: "active" | "done" | "settled" | "paused";
  createdAt: string;
  updatedAt: string;
}

export type StepOutcome =
  | { status: "done"; receiptDigest?: string; note?: string }
  | { status: "planned"; note?: string }
  | { status: "gated" }
  | { status: "refused"; note?: string };

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadGoals(): Goal[] {
  const raw = storage()?.getItem(GOALS_KEY) ?? null;
  if (!raw) return [];
  try {
    const g = JSON.parse(raw) as Goal[];
    return Array.isArray(g) ? g : [];
  } catch {
    return [];
  }
}

function save(goals: Goal[]): void {
  storage()?.setItem(GOALS_KEY, JSON.stringify(goals.slice(-GOAL_CAP)));
}

export function getGoal(id: string): Goal | null {
  return loadGoals().find((g) => g.id === id) ?? null;
}

/** Decompose a goal into specialist steps with the product's own router. */
export function createGoal(user: string, text: string, now: () => Date = () => new Date()): Goal {
  const route = routeDeterministic(text);
  const picked = route.selected.slice(0, MAX_STEPS);
  const steps: GoalStep[] =
    picked.length > 0
      ? picked.map((c, i) => {
          const s = getSpecialist(c.id);
          return {
            id: `st-${i}`,
            specialistId: c.id,
            title: `${s?.name ?? c.id}: ${(s?.capabilities[0] ?? "apply this specialty").toLowerCase()}`,
            status: "pending" as StepStatus,
          };
        })
      : [{ id: "st-0", specialistId: null, title: "generalist pass: plan the whole goal in words", status: "pending" as StepStatus }];
  const goal: Goal = {
    id: `goal-${now().getTime().toString(36)}`,
    user,
    text,
    steps,
    state: "active",
    createdAt: now().toISOString(),
    updatedAt: now().toISOString(),
  };
  save([...loadGoals(), goal]);
  return goal;
}

export function nextPendingStep(goal: Goal): GoalStep | null {
  return goal.steps.find((s) => s.status === "pending" || s.status === "gated") ?? null;
}

/**
 * Settle ONE step with an outcome reported by the real pipeline. Refuses to
 * settle a settled step, refuses unknown goals. Returns the updated goal.
 */
export function settleStep(goalId: string, stepId: string, outcome: StepOutcome, now: () => Date = () => new Date()): Goal | null {
  const goals = loadGoals();
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return null;
  const step = goal.steps.find((s) => s.id === stepId);
  if (!step) return null;
  if (step.status === "done" || step.status === "refused") return goal; // settled is settled
  step.status = outcome.status;
  step.note = "note" in outcome ? outcome.note : undefined;
  step.receiptDigest = "receiptDigest" in outcome ? outcome.receiptDigest : undefined;
  if (step.status === "gated") goal.state = "paused";
  if (goal.steps.every((s) => s.status === "done")) {
    goal.state = "done"; // done means EXECUTED — never planned, never refused
  } else if (goal.steps.every((s) => s.status !== "pending" && s.status !== "gated")) {
    goal.state = "settled"; // terminal, but honest: not every step ran
  } else if (step.status !== "gated") {
    goal.state = "active";
  }
  goal.updatedAt = now().toISOString();
  save(goals);
  return goal;
}

/** A paused (gated) goal resumes when the human decides — explicitly. */
export function resumeGoal(goalId: string, now: () => Date = () => new Date()): Goal | null {
  const goals = loadGoals();
  const goal = goals.find((g) => g.id === goalId);
  if (!goal) return null;
  for (const s of goal.steps) if (s.status === "gated") s.status = "pending";
  goal.state = "active";
  goal.updatedAt = now().toISOString();
  save(goals);
  return goal;
}

/** How much of the goal has been decided either way — settled, not executed. */
export function goalProgress(goal: Goal): number {
  if (goal.steps.length === 0) return 0;
  const settled = goal.steps.filter((s) => s.status !== "pending" && s.status !== "gated").length;
  return Math.round((settled / goal.steps.length) * 100);
}

/** How much of the goal actually RAN. The number that means something. */
export function executedProgress(goal: Goal): number {
  if (goal.steps.length === 0) return 0;
  const done = goal.steps.filter((s) => s.status === "done").length;
  return Math.round((done / goal.steps.length) * 100);
}

/**
 * The honest verdict on a goal (18.6.0 review fix): a goal of five planned
 * steps is PLANNED, not DONE. DONE requires every step executed.
 */
export type GoalStatus = "DONE" | "PARTIAL" | "PLANNED" | "BLOCKED" | "IN-PROGRESS";

export function goalStatus(goal: Goal): GoalStatus {
  if (goal.steps.length === 0) return "IN-PROGRESS";
  const open = goal.steps.some((s) => s.status === "pending" || s.status === "gated");
  if (open) return "IN-PROGRESS";
  const done = goal.steps.filter((s) => s.status === "done").length;
  if (done === goal.steps.length) return "DONE";
  if (done > 0) return "PARTIAL";
  if (goal.steps.some((s) => s.status === "refused")) return "BLOCKED";
  return "PLANNED";
}

export function clearGoals(): void {
  storage()?.removeItem(GOALS_KEY);
}
