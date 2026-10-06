/**
 * §GOVERNANCE EVALS — prove the rules still hold before a change ships.
 *
 * (The mission layer already owns LLM-judged answer evals — `evals.ts`.
 * This file is the other eval the enterprise bar demands: a REGRESSION
 * GATE over the governed behaviors themselves — risky asks gate, denials
 * execute nothing, safe asks run — held against an explicit baseline.)
 *
 * THE HONESTY RULES THIS FILE ENFORCES
 *  1. EVALS RUN THE REAL PATH. Cases execute through the same governed
 *     call the faces use — no shadow simulator, no shortcuts.
 *  2. A REGRESSION IS NAMED. The gate lists exactly which case ids fell
 *     from pass to fail — never a vague "score dropped".
 *  3. THE BASELINE IS EXPLICIT. Nothing compares against silence: a
 *     baseline must be saved on purpose.
 */
import { runSelfImpulseToolCall } from "../selfimpulse/engine/selfimpulse";

export interface GovernanceEvalCase {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  expect: {
    /** the call must end pending at the human gate (risky behavior held) */
    mustGate?: boolean;
    /** the call must execute and return ok */
    mustExecute?: boolean;
    /** the output must contain this text (case-sensitive) */
    outputIncludes?: string;
  };
}

export interface EvalResult {
  id: string;
  passed: boolean;
  outcome: "executed" | "gated" | "denied" | "error";
  detail: string;
}

export interface EvalScorecard {
  passed: number;
  failed: number;
  results: EvalResult[];
}

const outcomeOf = (r: { ok: boolean; approved: boolean; output: string; pending?: boolean | null }): EvalResult["outcome"] => {
  if (r.pending) return "gated";
  if (!r.ok && !r.approved) return "denied";
  if (r.ok) return "executed";
  return "error";
};

/** Run one case through the REAL governed pipeline (non-blocking: a gated
 *  call returns pending instead of waiting on the human). */
export async function runGovEvalCase(tc: GovernanceEvalCase): Promise<EvalResult> {
  try {
    const r = await runSelfImpulseToolCall(tc.tool, tc.args, { origin: "eval", blockOnGate: false });
    const outcome = outcomeOf(r);
    const checks: string[] = [];
    if (tc.expect.mustGate && outcome !== "gated") checks.push(`expected the human gate to hold it, got ${outcome}`);
    if (tc.expect.mustExecute && outcome !== "executed") checks.push(`expected execution, got ${outcome}`);
    if (tc.expect.outputIncludes && !r.output.includes(tc.expect.outputIncludes)) {
      checks.push(`expected output to include "${tc.expect.outputIncludes}"`);
    }
    return {
      id: tc.id,
      passed: checks.length === 0,
      outcome,
      detail: checks.length > 0 ? checks.join("; ") : "holds",
    };
  } catch (e) {
    return { id: tc.id, passed: false, outcome: "error", detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function scoreGovEvalSuite(cases: GovernanceEvalCase[]): Promise<EvalScorecard> {
  const results: EvalResult[] = [];
  for (const tc of cases) results.push(await runGovEvalCase(tc));
  return {
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

/* ── the baseline & the gate ─────────────────────────────────────────────── */

let baseline: { scorecard: EvalScorecard; savedAt: number } | null = null;

/** Save the current scorecard as THE baseline a future run compares to. */
export function saveGovBaseline(scorecard: EvalScorecard): void {
  baseline = { scorecard: JSON.parse(JSON.stringify(scorecard)), savedAt: Date.now() };
}

export function govBaselineSaved(): boolean {
  return baseline !== null;
}

export interface RegressionVerdict {
  verdict: "pass" | "regression" | "no-baseline";
  regressions: string[];
  improvements: string[];
  detail: string;
}

/** Compare a fresh scorecard against the saved baseline. Any case that
 *  passed before and fails now is a REGRESSION, named by id. */
export function govRegressionGate(fresh: EvalScorecard): RegressionVerdict {
  if (!baseline) {
    return { verdict: "no-baseline", regressions: [], improvements: [], detail: "no baseline saved — save one on a known-good run first" };
  }
  const before = new Map(baseline.scorecard.results.map((r) => [r.id, r.passed]));
  const now = new Map(fresh.results.map((r) => [r.id, r.passed]));
  const regressions: string[] = [];
  const improvements: string[] = [];
  for (const [id, wasPass] of before) {
    const isPass = now.get(id);
    if (wasPass && isPass === false) regressions.push(id);
    if (!wasPass && isPass === true) improvements.push(id);
  }
  return {
    verdict: regressions.length > 0 ? "regression" : "pass",
    regressions,
    improvements,
    detail: regressions.length > 0
      ? `regressed: ${regressions.join(", ")} — held the baseline, do not ship`
      : `holds the baseline (${before.size} cases)`,
  };
}

/** Probe seam — clears the baseline. Never called by the product. */
export function resetGovEvalsForProbe(): void {
  baseline = null;
}
