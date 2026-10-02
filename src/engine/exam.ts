/**
 * SelfImpulse — the 90% autonomy exam.
 *
 * How an agent earns the right to run without a per-action pause:
 *
 *   1. SelfImpulse believes it has learned enough → it proposes an exam BUILT FROM
 *      the user's REAL recorded scenarios (never invented ones — an exam
 *      without provenance proves nothing).
 *   2. For each scenario the agent states what it would do AND explains why.
 *   3. The user grades each answer Correct / Wrong; a Wrong carries a
 *      correction in the user's words.
 *   4. Score ≥ 90% → autonomy is granted, with monitor + override permanently
 *      on (never fully hands-off — that is the product's floor, not a setting).
 *      Score < 90% → no autonomy; wrong answers and corrections flow back
 *      into the learning memory and the loop restarts.
 *
 * The exam cannot be gamed by the agent: it does not choose the grading, it
 * cannot grade itself, and an empty memory yields a refusal in words, not a
 * generated-from-nothing questionnaire.
 */
import { uid } from "../app/id";
import { loadMemory, recordDecision } from "./memory";
import type { AutonomyGrant, DecisionRecord, ExamGrade, ExamSession, SpecialistCategory } from "./types";

export const PASS_THRESHOLD = 0.9;
export const AUTONOMY_KEY = "engine.autonomy.v1";
const SESSION_KEY = "engine.exam.sessions.v1";
export const MAX_SESSIONS = 20;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export type ProposeResult =
  | { ok: true; session: ExamSession }
  | { ok: false; error: string };

/**
 * Build an exam from the user's real history. Diversity first (different
 * specialists/scenarios), rejection scenarios prioritized — those are where
 * the agent's model of the user is most likely wrong.
 */
export function proposeExam(userId = "default", questionCount = 10, now: () => Date = () => new Date(), category?: SpecialistCategory): ProposeResult {
  const mem = loadMemory(userId);
  const scoped = category ? mem.filter((r) => r.category === category) : mem;
  const usable = scoped.filter((r) => r.kind === "accept" || r.kind === "reject");
  if (usable.length < Math.min(5, questionCount)) {
    return {
      ok: false,
      error: `the exam is generated from your real accept/reject history${category ? ` in the "${category}" category` : ""} — ${usable.length} usable records found, at least ${Math.min(5, questionCount)} needed; keep working with SelfImpulse and grading its work`,
    };
  }

  const rejects = usable.filter((r) => r.kind === "reject");
  const accepts = usable.filter((r) => r.kind === "accept");
  const seen = new Set<string>();
  const picked: DecisionRecord[] = [];
  const take = (pool: DecisionRecord[]) => {
    for (const r of [...pool].reverse()) {
      const sig = r.specialistId ?? r.scenario.slice(0, 40);
      if (seen.has(sig) && picked.length < questionCount) continue;
      seen.add(sig);
      picked.push(r);
      if (picked.length >= questionCount) return;
    }
  };
  take(rejects);
  take(accepts);
  // top-up without the diversity filter if still short
  for (const r of [...usable].reverse()) {
    if (picked.length >= questionCount) break;
    if (!picked.includes(r)) picked.push(r);
  }

  const session: ExamSession = {
    id: uid("exam"),
    createdAt: now().toISOString(),
    userId,
    category: category ?? null,
    state: "proposed",
    score: null,
    passed: null,
    grades: [],
    questions: picked.slice(0, questionCount).map((r) => ({
      id: uid("q"),
      sourceRecordId: r.id,
      scenario: r.scenario,
      proposedAction: proposeActionFor(r, mem),
      explanation: explainFor(r, mem),
    })),
  };

  const s = storage();
  if (s) {
    const sessions = JSON.parse(s.getItem(SESSION_KEY) ?? "[]") as ExamSession[];
    sessions.push(session);
    s.setItem(SESSION_KEY, JSON.stringify(sessions.slice(-MAX_SESSIONS)));
  }
  return { ok: true, session };
}

/** What the agent proposes it would do in this scenario, given everything it has seen. */
function proposeActionFor(r: DecisionRecord, mem: DecisionRecord[]): string {
  if (r.kind === "reject") {
    const correction = mem.find((m) => m.kind === "correction" && m.scenario === r.scenario);
    return correction
      ? `Follow the user's correction instead of the rejected action: ${correction.action}`
      : `Pause and ask before acting — this scenario was rejected before${r.reason ? ` ("${r.reason.slice(0, 100)}")` : ""}`;
  }
  return `Proceed as before: ${r.action}`;
}

function explainFor(r: DecisionRecord, mem: DecisionRecord[]): string {
  if (r.kind === "reject") {
    return `You rejected this before${r.reason ? ` because: ${r.reason.slice(0, 140)}` : ""}. ${
      mem.some((m) => m.kind === "correction" && m.scenario === r.scenario)
        ? "A correction for this scenario exists, so I will follow it rather than repeat the rejected action."
        : "Without a correction on file, the safe move is to pause and ask rather than guess."
    }`;
  }
  const sameSpecialist = mem.filter((m) => m.specialistId && m.specialistId === r.specialistId);
  const acc = sameSpecialist.filter((m) => m.kind === "accept").length;
  const rej = sameSpecialist.filter((m) => m.kind === "reject").length;
  return `You accepted this action before${acc + rej > 1 ? `, and this specialist's record with you is ${acc} accepted / ${rej} rejected` : ""}. Repeating accepted behavior is the learned preference.`;
}

export type GradeResult =
  | { ok: true; score: number; passed: boolean; feedbackLearned: number }
  | { ok: false; error: string };

/**
 * Grade a proposed exam. Every question must carry a verdict; wrong verdicts
 * SHOULD carry a correction (accepted without one, but noted). Wrong answers
 * become correction records in memory — the failure IS the learning payload.
 */
export function gradeExam(sessionId: string, grades: ExamGrade[], now: () => Date = () => new Date()): GradeResult {
  const s = storage();
  if (!s) return { ok: false, error: "no exam store available in this runtime" };
  const sessions = JSON.parse(s.getItem(SESSION_KEY) ?? "[]") as ExamSession[];
  const session = sessions.find((x) => x.id === sessionId);
  if (!session) return { ok: false, error: `unknown exam session ${sessionId}` };
  if (session.state === "graded") return { ok: false, error: "this exam was already graded — an exam is graded exactly once" };
  if (session.questions.length === 0) return { ok: false, error: "this exam has no questions" };

  const byQ = new Map(grades.map((g) => [g.questionId, g]));
  for (const q of session.questions) {
    if (!byQ.has(q.id)) return { ok: false, error: `question ${q.id} has no verdict — every question must be graded` };
  }
  const unknown = grades.filter((g) => !session.questions.some((q) => q.id === g.questionId));
  if (unknown.length > 0) return { ok: false, error: `${unknown.length} verdict(s) reference questions outside this exam` };

  const correct = session.questions.filter((q) => byQ.get(q.id)!.verdict === "correct").length;
  const score = correct / session.questions.length;
  const passed = score >= PASS_THRESHOLD;

  session.grades = grades;
  session.score = score;
  session.passed = passed;
  session.state = "graded";
  s.setItem(SESSION_KEY, JSON.stringify(sessions));

  // failures flow back into memory as corrections — the restart of the loop
  let feedbackLearned = 0;
  for (const q of session.questions) {
    const g = byQ.get(q.id)!;
    if (g.verdict === "wrong") {
      recordDecision({
        userId: session.userId,
        scenario: q.scenario,
        action: q.proposedAction,
        kind: "correction",
        reason: g.correction ?? "marked wrong on the autonomy exam; no correction text given",
        ts: now().toISOString(),
      });
      feedbackLearned += 1;
    }
  }

  saveGrant(loadGrant(session.userId, session.category ?? undefined).attempts + 1, passed ? score : null, passed, session.userId, now, session.category ?? undefined);
  return { ok: true, score, passed, feedbackLearned };
}

/* ── the grant itself ─────────────────────────────────────────────────────── */

function grantKey(userId: string, category?: SpecialistCategory): string {
  return category ? `${AUTONOMY_KEY}:cat:${userId}:${category}` : `${AUTONOMY_KEY}:${userId}`;
}

export function loadGrant(userId = "default", category?: SpecialistCategory): AutonomyGrant {
  const s = storage();
  const fallback: AutonomyGrant = { granted: false, score: null, grantedAt: null, monitorOverrideAlwaysOn: true, attempts: 0 };
  if (!s) return fallback;
  try {
    const raw = JSON.parse(s.getItem(grantKey(userId, category)) ?? "null") as AutonomyGrant | null;
    if (!raw) return fallback;
    // the override floor is structural — a stored record cannot switch it off
    return { ...raw, monitorOverrideAlwaysOn: true };
  } catch {
    return fallback;
  }
}

function saveGrant(attempts: number, score: number | null, passed: boolean, userId: string, now: () => Date, category?: SpecialistCategory): void {
  const s = storage();
  if (!s) return;
  const prev = loadGrant(userId, category);
  // A failed re-exam does not silently strip a prior grant — revocation is an
  // explicit human act (revokeAutonomy); failing simply does not extend it.
  const grant: AutonomyGrant = {
    granted: passed ? true : prev.granted,
    score: score ?? prev.score,
    grantedAt: passed ? now().toISOString() : prev.grantedAt,
    monitorOverrideAlwaysOn: true,
    attempts,
  };
  s.setItem(grantKey(userId, category), JSON.stringify(grant));
}

export function autonomyStatus(userId = "default", category?: SpecialistCategory): AutonomyGrant {
  return loadGrant(userId, category);
}

/**
 * The gate's question, answered honestly: may risky-tier work in THIS
 * category run gate-free? A category grant covers its category only; the
 * overall grant covers everything. Safe-tier work never needs either.
 */
export function autonomyCovers(userId: string, category?: SpecialistCategory): boolean {
  if (loadGrant(userId).granted) return true;
  return category ? loadGrant(userId, category).granted : false;
}

/** The human override — always available, one call, no exam required. */
export function revokeAutonomy(userId = "default", category?: SpecialistCategory): AutonomyGrant {
  const s = storage();
  const next: AutonomyGrant = { granted: false, score: null, grantedAt: null, monitorOverrideAlwaysOn: true, attempts: loadGrant(userId, category).attempts };
  if (s) s.setItem(grantKey(userId, category), JSON.stringify(next));
  return next;
}

/** Reset exam state for a user (tests and the "start learning over" path). */
export function resetExams(userId = "default"): void {
  const s = storage();
  if (!s) return;
  const sessions = (JSON.parse(s.getItem(SESSION_KEY) ?? "[]") as ExamSession[]).filter((x) => x.userId !== userId);
  s.setItem(SESSION_KEY, JSON.stringify(sessions));
  s.removeItem(grantKey(userId));
  for (const cat of new Set(sessions.concat([]).map((x) => x.category).filter(Boolean) as SpecialistCategory[])) s.removeItem(grantKey(userId, cat));
}
