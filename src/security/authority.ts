export const NO_EVIDENCE: Evidence = { completedRuns: 0, trippedRuns: 0, independentlyVerifiedRuns: 0 };

export interface Earned {
  capabilities: Capability[];
  budgetCents: number;
  /** Why each capability was earned, so the grant is explainable to a human. */
  reasons: Record<string, string>;
}

/**
 * The earning rule. Deliberately strict, and deliberately short of the ceiling:
 *
 *  - A capability is earned only after N clean, INDEPENDENTLY VERIFIED runs
 *    **in the current clean streak** — not over a lifetime total. See
 *    `cleanStreakOf`: a trip resets the record, and evidence that cannot show
 *    where the trip happened earns nothing.
 *  - "independent" means verified by a runtime that is not the one that did the
 *    work. An agent grading its own work earns nothing — that is the property
 *    the whole cross-vendor gate exists to provide, and this is where it pays.
 *  - The earned grant is ALWAYS a strict subset of the ceiling. Even an agent
 *    with a perfect record cannot earn everything, because the last step to the
 *    ceiling is a human decision, not a measurement.
 */
export function earnAuthority(evidence: Evidence, ceiling: Grant, opts?: { threshold?: number }): Earned {
  const need = opts?.threshold ?? 3;
  // The streak, not the lifetime net.
  const streak = cleanStreakOf(evidence);
  const clean = streak.clean;
  const verified = streak.verified;
  const qualifies = streak.sound && clean >= need && verified >= need;

  const reasons: Record<string, string> = {};
  const earned: Capability[] = [];
  // `spend` is never earned. It is granted or it is not.
  const earnable: Capability[] = ["read", "write", "shell", "network", "delegate"];

  if (qualifies) {
    for (const c of earnable) {
      if (!hasCapability(ceiling, c)) continue;
      earned.push(c);
      reasons[c] = `earned: ${verified} independently verified runs in the current clean streak (${clean} clean) - ${streak.reason}`;
    }
  } else {
    for (const c of earnable) {
      if (!hasCapability(ceiling, c)) continue;
      reasons[c] = streak.sound
        ? `not yet: ${verified}/${need} independently verified runs in the current clean streak (${clean} clean)`
        : `not earned: ${streak.reason}`;
    }
  }

  const budgetCents = qualifies
    ? Math.floor(ceiling.budgetCents / 2) // deliberately half; the rest is the human's
    : 0;
  if (budgetCents > 0) reasons.spend = `earned: ${verified} independently verified runs in the current clean streak`;
  if (!hasCapability(ceiling, "spend")) reasons.spend = "not in the ceiling";

  return { capabilities: earned, budgetCents, reasons };
}

/** Earned authority can never exceed the ceiling. Checked, not assumed. */
export function grantFromEarned(e: Earned, ceiling: Grant): Grant {
  const g: Grant = {
    capabilities: e.capabilities.filter((c) => hasCapability(ceiling, c)),
    budgetCents: Math.min(e.budgetCents, ceiling.budgetCents),
  };
  return narrowTo(g, ceiling);
}

/**
 * §EARNED AUTHORITY UNDER A FIXED CEILING + THE AGENTIC PRINCIPAL CHAIN
 *
 * This module closes the authorization gap that a RECURSIVELY SELF-IMPROVING
 * agent creates and that no other layer in the codebase could see.
 *
 * THE PROBLEM
 * "Runtime Governance for AI Agents: Policies on Paths" (arXiv, 2026) formalises
 * it for the general case: an agent's behaviour is path-dependent, so it cannot
 * be fully governed at design time. Our existing continuous authorization
 * (src/security/actionGraph.ts) handles that — but only for authority that is
 * already fixed. It has no answer to a different question.
 *
 * "Are You Still the Agent I Authorized?" (Zhang & Zhang, 2026) asks exactly
 * that question, about exactly our architecture. RSIRALS is a recursive
 * self-improvement framework: the agent acquires skills, acquires tools,
 * revises its own workflow, and delegates to others. Every one of those is a
 * change to the principal. A grant evaluated at minute zero describes a subject
 * that no longer exists at minute forty — "the authorization gap". The paper's
 * answer is the one adopted here: EARNED AUTHORITY BOUNDED BY A FIXED CEILING.
 *
 *   - A human grants a CEILING: the most this principal may ever hold.
 *   - The agent may EARN authority below that ceiling, from measured evidence.
 *   - Earning can never reach the ceiling by itself. The ceiling is set by a
 *     person, once, and nothing the agent does can raise it.
 *
 * THE SECOND GAP: INTENT TRANSITIVITY
 * "When Agents Handle Secrets" (arXiv 2605.03213) names the structural problem
 * in agent systems: multi-agent delegation has no intent transitivity. A
 * microservice hop is authorized by a cryptographically scoped credential. An
 * agent hop is authorized by natural language in a context window, which every
 * intermediate agent can silently modify. "No standard mechanism currently
 * proves that the final action executed by the tool server remained within the
 * scope the user originally authorized."
 *
 * That is precisely our A2A federation, so this is not a hypothetical here.
 * The Agentic Principal Chain (Muruaga, 2026) is the proposed fix: track
 * delegated authority across every hop, so static per-request permissions cannot
 * be combined into a prohibited outcome or delegated without bound. A chain may
 * only narrow. A downstream principal can never hold more than the root.
 *
 * THE THIRD GAP: THE CONFUSED DEPUTY
 * NIST SP 800-162 / OWASP NHI guidance: effective authority is the INTERSECTION
 * of the agent's grant and the user's grant — never the union. An agent that
 * holds a wide grant acting on behalf of a narrowly-granted user must not be
 * able to exceed the user. Union is how a proxy becomes a confused deputy.
 *
 * THE HONESTY RULES
 *  - The ceiling is immutable from inside. There is no call in this module that
 *    raises it; `grant()` takes a human-supplied ceiling and that is the only
 *    path. An agent-supplied ceiling is a bug and is refused by construction.
 *  - Earning requires evidence the runtime can actually measure. A self-report
 *    of success is not evidence.
 *  - A chain that cannot be verified is refused, not assumed sound.
 *  - Nothing here grants authority. It only ever narrows, and reports.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   1 · THE CEILING
   ═══════════════════════════════════════════════════════════════════════════ */

export type Capability =
  | "read" | "write" | "shell" | "network" | "delegate" | "spend";

export const ALL_CAPABILITIES: readonly Capability[] = [
  "read", "write", "shell", "network", "delegate", "spend",
];

/** A set of capabilities, plus a spend ceiling in whole cents. */
export interface Grant {
  capabilities: Capability[];
  /** Cents. 0 means no spend authority at all. */
  budgetCents: number;
}

export const NO_GRANT: Grant = { capabilities: [], budgetCents: 0 };

export function hasCapability(g: Grant, c: Capability): boolean {
  return g.capabilities.includes(c);
}

export function grantsEqual(a: Grant, b: Grant): boolean {
  return a.capabilities.length === b.capabilities.length
    && a.budgetCents === b.budgetCents
    && a.capabilities.every((c) => b.capabilities.includes(c));
}

/**
 * The ONLY lawful operation on grants. Used for the confused-deputy rule and
 * for every chain hop. Note what it is NOT: there is deliberately no `union`,
 * no `widen`, no `escalate`. Omitting those operations is the enforcement — a
 * caller cannot compose authority into something larger, because the function
 * that would do it does not exist.
 */
export function narrowTo(a: Grant, b: Grant): Grant {
  return {
    capabilities: a.capabilities.filter((c) => b.capabilities.includes(c)),
    budgetCents: Math.min(a.budgetCents, b.budgetCents),
  };
}

export function isNarrower(child: Grant, parent: Grant): boolean {
  const extra = child.capabilities.filter((c) => !parent.capabilities.includes(c));
  return extra.length === 0 && child.budgetCents <= parent.budgetCents;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2 · EARNED AUTHORITY
   ═══════════════════════════════════════════════════════════════════════════ */

/** What the runtime can actually MEASURE. A self-report is not evidence: the
 *  scorer only accepts counters the executor owns. */
export interface Evidence {
  /** Completed runs, as counted by the executor. */
  completedRuns: number;
  /** Runs that ended in a guard refusal, escalation or failure. */
  trippedRuns: number;
  /** Runs that a DIFFERENT runtime verified. Self-verification does not count. */
  independentlyVerifiedRuns: number;
  /** The run number at which the most recent trip happened; 0 when never. */
  lastTripAtRun?: number;
  /** Runs completed SINCE that trip. This, not the lifetime total, is the record. */
  cleanStreakRuns?: number;
  /** Independently verified runs that fall inside the current clean streak. */
  cleanStreakVerified?: number;
}

/**
 * The CLEAN STREAK — the record a trip actually resets.
 *
 * This function exists because the arithmetic that used to stand in its place
 * was wrong in a way that only shows up over time. `completed - tripped` is a
 * lifetime net, not a reset: ten clean runs, one trip, ten more clean runs
 * leaves 19 "clean" runs and a seat that has already been forgiven. The
 * documentation said a trip resets the counter; the code subtracted from it.
 * A seat that trips should have to rebuild its record, because the whole value
 * of earned authority is that a bad run costs something.
 *
 * So the streak is measured, not inferred, and it is measured honestly:
 *
 *   • no trip ever recorded → the entire history is one clean streak. Sound,
 *     and no invention: nothing had to be excluded.
 *   • a trip recorded, with its position → only the runs after it count.
 *   • a trip recorded, with NO position → UNSOUND, and nothing is earned. This
 *     is the case that matters: "20 runs, 1 of them bad" does not tell you
 *     whether the bad run was the first or the last, and a one-line difference
 *     decides whether a seat is trusted. When the runtime cannot distinguish a
 *     recovered seat from a failing one, it does not guess in the seat's
 *     favour.
 */
export interface CleanStreak {
  clean: number;
  verified: number;
  sound: boolean;
  reason: string;
}

export function cleanStreakOf(evidence: Evidence): CleanStreak {
  const { lastTripAtRun, cleanStreakRuns, cleanStreakVerified } = evidence;

  // A streak longer than the run count is a lie, not a record. Checking it costs
  // one comparison and closes the obvious way to forge a clean history without
  // touching the executor.
  if (typeof cleanStreakRuns === "number" && cleanStreakRuns > evidence.completedRuns) {
    return {
      clean: 0, verified: 0, sound: false,
      reason: `the reported clean streak (${cleanStreakRuns} runs) is longer than the ${evidence.completedRuns} runs that exist, so the record cannot be trusted`,
    };
  }

  // An explicit measurement always beats a derived one. If the executor told us
  // where it is in the streak, that is the record — including when the answer is
  // zero. Silently replacing a stated zero with a lifetime total is how a seat
  // that just tripped gets forgiven by a field nobody read.
  if (typeof cleanStreakRuns === "number") {
    const clean = Math.max(0, cleanStreakRuns);
    return {
      clean,
      // No verified count means no verified runs. It does not mean "assume the
      // whole streak was checked by someone else".
      verified: Math.max(0, cleanStreakVerified ?? 0),
      sound: true,
      reason:
        (typeof lastTripAtRun === "number" && lastTripAtRun > 0)
          ? `run ${lastTripAtRun} tripped; only the ${clean} run(s) after it count`
          : "no trip has ever been recorded, and the executor reports the streak it has measured",
    };
  }

  // Legacy shape: lifetime counters only.
  if (evidence.trippedRuns <= 0) {
    return {
      clean: Math.max(0, evidence.completedRuns),
      verified: Math.max(0, evidence.independentlyVerifiedRuns),
      sound: true,
      reason: "no trip has ever been recorded, so the whole history is one clean streak",
    };
  }
  return {
    clean: 0,
    verified: 0,
    sound: false,
    reason: `${evidence.trippedRuns} trip(s) are recorded with no position, so a clean streak cannot be shown — a lifetime total is not a reset`,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3 · THE AGENTIC PRINCIPAL CHAIN
   ═══════════════════════════════════════════════════════════════════════════ */

export interface Principal {
  id: string;
  /** A human principal carries the authority the PERSON was granted. An agent
   *  principal never widens its human's grant — see narrowTo. */
  human: boolean;
  grant: Grant;
  /** Set only on the root of a chain. */
  ceiling: Grant;
}

export interface ChainHop {
  principalId: string;
  grant: Grant;
  /** The action the downstream principal is being asked to take. */
  capability: Capability;
  budgetCents: number;
}

export type ChainVerdict =
  | { ok: true; effective: Grant }
  | { ok: false; reason: string; widenedAt?: string };

/**
 * Walk a delegation chain and compute the EFFECTIVE authority, which is the
 * intersection of every hop with the root's ceiling.
 *
 * This is the mechanism that gives agent delegation the intent transitivity
 * microservices have. If A holds a grant, delegates to B, B delegates to C, and
 * C asks for something A never had, the walk finds it and refuses — regardless
 * of what B and C each believe they were given.
 */
export function evaluateChain(root: Principal, hops: ChainHop[]): ChainVerdict {
  if (root.ceiling.capabilities.length === 0 && root.ceiling.budgetCents === 0 && !root.human) {
    return { ok: false, reason: "the root principal has no ceiling; an authority-free root cannot delegate" };
  }

  let effective: Grant = { ...root.ceiling };

  for (let i = 0; i < hops.length; i += 1) {
    const hop = hops[i];
    // A hop may only narrow. This is the invariant the whole paper turns on.
    if (!isNarrower(hop.grant, effective)) {
      return {
        ok: false,
        reason: `hop ${i} (${hop.principalId}) holds authority the chain did not grant it — `
          + `a delegation may only narrow, never widen`,
        widenedAt: hop.principalId,
      };
    }
    effective = narrowTo(hop.grant, effective);

    if (hop.capability && !hasCapability(effective, hop.capability)) {
      return {
        ok: false,
        reason: `"${hop.capability}" was dropped somewhere in the chain before ${hop.principalId}; `
          + `the principal that held it is not the one asking`,
        widenedAt: hop.principalId,
      };
    }
    if (hop.budgetCents > effective.budgetCents) {
      return {
        ok: false,
        reason: `${hop.principalId} asks for ${hop.budgetCents}c but the chain grants ${effective.budgetCents}c`,
        widenedAt: hop.principalId,
      };
    }
  }

  return { ok: true, effective };
}

/**
 * THE CONFUSED-DEPUTY CHECK.
 *
 * An agent's own grant and the human's grant are two different things. The
 * effective authority is their INTERSECTION. Taking the union would let a
 * narrowly-granted user borrow the agent's wider authority — the deputy acting
 * with powers the principal never had.
 */
export function effectiveAuthority(agentGrant: Grant, userGrant: Grant): Grant {
  return narrowTo(agentGrant, userGrant);
}

/* ═══════════════════════════════════════════════════════════════════════════
   4 · THE FIXED CEILING OVER TIME
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CeilingRecord {
  principalId: string;
  /** Set once, by a human. Immutable from inside — see issueCeiling. */
  ceiling: Grant;
  /** When it was set and by whom, so "a human fixed this" is an auditable fact. */
  fixedBy: string;
  fixedAt: number;
}

export type CeilingResult =
  | { ok: true; record: CeilingRecord }
  | { ok: false; reason: string };

/**
 * Fix a ceiling. This is the ONLY function in the module that produces
 * authority, and it takes a `fixedBy` human identity.
 *
 * The ceiling may be fixed, and it may be NARROWED later by a human. It can
 * never be raised by the agent, and there is no API to do so — `raiseCeiling`
 * does not exist, which is the point.
 */
export function issueCeiling(principalId: string, ceiling: Grant, fixedBy: string, now: number): CeilingResult {
  if (!principalId) return { ok: false, reason: "a ceiling needs a principal" };
  if (!fixedBy) return { ok: false, reason: "a ceiling must be fixed by a named human; an agent cannot self-issue one" };
  return { ok: true, record: { principalId, ceiling, fixedBy, fixedAt: now } };
}

/** Narrow an existing ceiling. Human-only, monotonic. */
export function narrowCeiling(rec: CeilingRecord, smaller: Grant, by: string): CeilingResult {
  if (!by) return { ok: false, reason: "narrowing a ceiling must be done by a named human" };
  const next = narrowTo(rec.ceiling, smaller);
  return { ok: true, record: { ...rec, ceiling: next, fixedBy: by } };
}

/**
 * The evolving-agent check, run before any grant is applied to a principal that
 * has been improving. Answers "are you still the agent I authorized?"
 *
 * Returns what is permitted NOW: the narrowest of the original ceiling, the
 * current human grant, and what the evidence has earned.
 */
export function currentAuthority(args: {
  ceiling: CeilingRecord;
  humanGrant: Grant;
  evidence: Evidence;
  threshold?: number;
}): { effective: Grant; earned: Earned; explanation: string } {
  const earned = earnAuthority(args.evidence, args.ceiling.ceiling, { threshold: args.threshold });
  const fromEarned = grantFromEarned(earned, args.ceiling.ceiling);
  // The order matters and is the whole point: the human's current grant, the
  // ceiling fixed at authorization time, and the earned amount — intersected.
  const effective = narrowTo(narrowTo(args.humanGrant, args.ceiling.ceiling), fromEarned);
  const explanation = Object.entries(earned.reasons).map(([k, v]) => `${k}: ${v}`).join("; ")
    || "nothing earned yet";
  return { effective, earned, explanation };
}
