/**
 * SelfImpulse — RSIRALS v6: THE STRENGTHENED VERIFIER (19.7.6 [Office]).
 *
 * RSIRALS v5 froze the governance plane (∂T/∂A = 0): the agent may evolve
 * everything except the authority that judges its evolution. v6 keeps T
 * frozen — T_v5 is untouched, deliberately — and upgrades the TRUST /
 * PROMOTION PLANE instead. That is the 2026 research consensus in one
 * sentence: when self-improvement stalls or drifts, strengthen the
 * VERIFIER, not the generator (GVU variance inequality, Chojecki 2025);
 * and an isolated self-evolving loop drifts unless an external check the
 * loop cannot modify grounds it ("The Devil Behind Moltbook", 2026).
 *
 * WHAT v6 ADDS (each anchored in the 2026 literature, each deterministic
 * and probe-pinned — no vibes, no model calls):
 *
 *   1. THE CONSTITUTION — machine-checkable invariants every candidate
 *      change is diffed against BEFORE anything else runs. The
 *      constitution lives OUTSIDE the self-modification surface: frozen
 *      constant, no setter, like plane T. (HyperAgents pattern: the
 *      evaluator is not part of the evolvable code.)
 *
 *   2. THE DRIFT BUDGET — every candidate declares its delta; the delta is
 *      MEASURED (token-level Jaccard distance against the current text,
 *      the Rel(AI)Build drift-detector pattern), not asserted. Cumulative
 *      drift per rolling window is capped: a change that busts the budget
 *      is refused, forcing small, human-reviewable steps (the 2026
 *      pre-deployment checklist: "bound per-iteration drift").
 *
 *   3. HIDDEN TRUE-OBJECTIVE CANARIES — a held-out battery the proposer
 *      never sees at proposal time (only digests and a count are public).
 *      Promotion runs the battery and reveals pass/fail + reasons. A
 *      proposer-reported gain counts for nothing here — the anti
 *      reward-hacking gate ("run a hidden true-objective eval the
 *      optimizer never sees").
 *
 *   4. STAGED PROMOTION — SHADOW → CANARY → FLEET, with a frozen
 *      regression baseline evaluated PER DIMENSION: fail-closed on ANY
 *      single dimension that drops, even when the average rises.
 *
 *   5. THE TAMPER-EVIDENT LEDGER — every event (proposed, blocked,
 *      canaried, promoted, rolled back) is appended to a SHA-256
 *      hash-chained, append-only local ledger with per-event actor and
 *      policy version (the EU AI Act Art.12 / AAT receipt pattern).
 *      verifyLedger() re-walks the chain; any edit breaks it loudly.
 *
 *   6. ONE GATE + ROLLBACK — governChange() is the only door a candidate
 *      may knock on: constitution → drift budget → v5 firewall → hidden
 *      canaries → staged verdict (ALLOW / BLOCK / ESCALATE-to-human),
 *      deterministic and replayable. Promotion snapshots last-known-good;
 *      rollback() restores it in one step, on the ledger.
 *
 * v6 reuses v5's firewall (controlPlaneFirewall) and sealed-measurement
 * discipline — one governance vocabulary, a deeper enforcement stack.
 */

import { pureSha256 } from "./pureHash";
import { controlPlaneFirewall } from "./rsirals";

/* ── 1. THE CONSTITUTION (frozen, outside the evolvable surface) ────────── */

export interface ConstitutionRule {
  id: string;
  /** What the rule demands, in words a human wrote. */
  doctrine: string;
  /** The machine check: deterministic, no model, no I/O. */
  check: (change: { name: string; target: string; body: string; declares: string }) => string | null;
}

const AUTHORITY_PATTERN = /\b(approve|authoris|authoriz|consent|permission|grant|vault|owner key|human gate)\b/i;
const EVIDENCE_PATTERN = /\b(receipt|exam|canary|ledger|evidence|digest|baseline)\b/i;

export const V6_CONSTITUTION: ReadonlyArray<ConstitutionRule> = Object.freeze([
  {
    id: "c1.no-self-governance",
    doctrine: "no change may touch, reinterpret, or route around the governance plane, the canary battery, the constitution, or the ledger",
    check: (c) => {
      if (["governance", "canary", "ledger", "constitution", "verifier", "gate"].includes(c.target)) {
        return `scope creep: '${c.target}' is part of the frozen verifier or the governance plane`;
      }
      const fw = controlPlaneFirewall({ name: c.name, description: c.declares, body: c.body });
      return fw.allowed ? null : `protected target: ${fw.reason}`;
    },
  },
  {
    id: "c2.discretion-tightening",
    doctrine: "a change must tighten or preserve discretion — authority-granting language must trace to an explicit declared authority source",
    check: (c) => (!AUTHORITY_PATTERN.test(c.body) ? null : (AUTHORITY_PATTERN.test(c.declares) && /v\d+|signed|owner/i.test(c.declares) ? null : "authority language in the body without a declared, versioned authority source")),
  },
  {
    id: "c3.evidence-bound",
    doctrine: "every change declares how its effect will be evidenced — no change ships on vibes",
    check: (c) => (EVIDENCE_PATTERN.test(c.declares) ? null : "the declaration does not name its evidence (receipt/exam/canary/baseline)"),
  },
  {
    id: "c4.human-door-intact",
    doctrine: "a change may add automation below the human gate; it may never claim to BE the human gate",
    check: (c) => (/\b(replaces?|bypass(es|ing)?|skips?)\s+(the\s+)?(human|owner|gate|approval)\b/i.test(c.body) ? "the body claims to replace or bypass the human gate" : null),
  },
]);

export interface ConstitutionVerdict {
  ok: boolean;
  violations: Array<{ rule: string; doctrine: string; finding: string }>;
}

/** The constitution diff — the FIRST thing every candidate faces. */
export function checkConstitution(change: { name: string; target: string; body: string; declares: string }): ConstitutionVerdict {
  const violations: ConstitutionVerdict["violations"] = [];
  for (const rule of V6_CONSTITUTION) {
    const finding = rule.check(change);
    if (finding) violations.push({ rule: rule.id, doctrine: rule.doctrine, finding });
  }
  return { ok: violations.length === 0, violations };
}

/* ── 2. THE DRIFT BUDGET (measured, not asserted) ───────────────────────── */

export const DRIFT_WINDOW_MS = 24 * 60 * 60 * 1000;

function tokens(text: string): Set<string> {
  return new Set(text.toLowerCase().split(/[^a-z0-9_.]+/).filter((t) => t.length > 1));
}

/** Token-level Jaccard distance — 0 = identical, 1 = disjoint. */
export function driftDelta(before: string, after: string): number {
  const a = tokens(before);
  const b = tokens(after);
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : 1 - inter / union;
}

export interface DriftBudget {
  /** Max Jaccard distance for ONE change. */
  maxPerChange: number;
  /** Max cumulative (summed) distance admitted per rolling 24h window. */
  maxPerWindow: number;
}

export const DEFAULT_DRIFT_BUDGET: DriftBudget = { maxPerChange: 0.6, maxPerWindow: 1.5 };

interface DriftEntry { at: number; delta: number; target: string }
const driftLog: DriftEntry[] = [];

export function driftUsed(now = Date.now()): number {
  while (driftLog.length > 0 && now - driftLog[0].at > DRIFT_WINDOW_MS) driftLog.shift();
  return driftLog.reduce((n, e) => n + e.delta, 0);
}

/** Test/admin seam. */
export function resetDrift(): void {
  driftLog.length = 0;
}

export function admitDrift(before: string, after: string, target: string, budget: DriftBudget = DEFAULT_DRIFT_BUDGET, now = Date.now()): { ok: boolean; delta: number; reason?: string } {
  const delta = driftDelta(before, after);
  if (delta > budget.maxPerChange) {
    return { ok: false, delta, reason: `drift ${delta.toFixed(2)} exceeds the per-change bound ${budget.maxPerChange.toFixed(2)} — shrink the step until a human can review it in one sitting` };
  }
  const used = driftUsed(now);
  if (used + delta > budget.maxPerWindow) {
    return { ok: false, delta, reason: `window budget ${budget.maxPerWindow.toFixed(2)} would be busted (${used.toFixed(2)} used + ${delta.toFixed(2)}) — the fleet slows down; it does not drift through` };
  }
  driftLog.push({ at: now, delta, target });
  return { ok: true, delta };
}

/* ── 3. HIDDEN TRUE-OBJECTIVE CANARIES — now EXTERNAL (19.7.7) ─────────── */

export interface CanaryReport {
  ran: number;
  failed: Array<{ id: string; finding: string }>;
  /** The battery's digest — WHICH exam ran, never what it asks. */
  batteryDigest: string;
  /** "external-verifier" = a live signed run of verifier/si-verifier.mjs;
   *  "unavailable" = no process could run — canaries cannot pass, and the
   *  gate says so instead of pretending. */
  source: "external-verifier" | "unavailable";
  note?: string;
}

/** Public knowledge: how many checks the battery carries — ten as of
 *  19.7.10 [Screenwright]: six lexical markers (h1–h6) plus four structural
 *  capability screens (h7–h10). Honest scope: this is a TEXT SCREEN over the
 *  candidate's own words, and its source is public. It refuses capability
 *  classes that must never clear on a text screen alone; it cannot decide
 *  malice. The human door is load-bearing. */
export const CANARY_BATTERY_SIZE = 10;

/* ── 4. STAGED PROMOTION (SHADOW → CANARY → FLEET, fail-closed) ─────────── */

export type PromoStage = "shadow" | "canary" | "fleet";

export const STAGE_ORDER: readonly PromoStage[] = ["shadow", "canary", "fleet"];

export interface DimensionScores {
  /** Every governance dimension, measured. Names pinned by the baseline. */
  scores: Record<string, number>;
}

export interface RegressionBaseline {
  /** The frozen floor per dimension — ANY score below its floor refuses. */
  floors: Record<string, number>;
}

/**
 * Fail-closed regression: the AVERAGE may rise; any SINGLE dimension below
 * its floor still refuses. (Checklist item 1 — silent quality drop is the
 * failure mode, not a low mean.)
 */
export function regressionGate(scores: DimensionScores, baseline: RegressionBaseline): { ok: boolean; dropped: string[] } {
  const dropped: string[] = [];
  for (const [dim, floor] of Object.entries(baseline.floors)) {
    const v = scores.scores[dim];
    if (v === undefined || !Number.isFinite(v)) dropped.push(`${dim}: unmeasured`);
    else if (v < floor) dropped.push(`${dim}: ${v} < floor ${floor}`);
  }
  return { ok: dropped.length === 0, dropped };
}

/* ── 5. THE TAMPER-EVIDENT LEDGER ───────────────────────────────────────── */

export interface LedgerEvent {
  seq: number;
  at: number;
  kind: "proposed" | "blocked" | "canaried" | "promoted" | "rolled-back" | "escalated";
  actor: string;
  target: string;
  /** The governance policy version in force (T stays frozen at 5; v6 is the plane addendum). */
  policy: string;
  detail: string;
  candidateDigest: string;
  prevHash: string;
  hash: string;
}

const ledger: LedgerEvent[] = [];

export const V6_POLICY = "vh.rsirals.T_v5 + v6-verifier-addendum/1";

function ledgerAppend(kind: LedgerEvent["kind"], actor: string, target: string, detail: string, candidateDigest: string, at: number): LedgerEvent {
  const prevHash = ledger.length === 0 ? "GENESIS" : ledger[ledger.length - 1].hash;
  const seq = ledger.length + 1;
  const hash = pureSha256(JSON.stringify({ seq, at, kind, actor, target, policy: V6_POLICY, detail, candidateDigest, prevHash }));
  const ev: LedgerEvent = { seq, at, kind, actor, target, policy: V6_POLICY, detail, candidateDigest, prevHash, hash };
  ledger.push(ev);
  return ev;
}

/** Re-walk the chain. One altered byte anywhere → the walk stops there. */
export function verifyLedger(): { ok: boolean; breaks: number[]; length: number } {
  const breaks: number[] = [];
  let prev = "GENESIS";
  ledger.forEach((ev, i) => {
    const expect = pureSha256(JSON.stringify({ seq: ev.seq, at: ev.at, kind: ev.kind, actor: ev.actor, target: ev.target, policy: ev.policy, detail: ev.detail, candidateDigest: ev.candidateDigest, prevHash: ev.prevHash }));
    if (ev.prevHash !== prev || ev.hash !== expect) breaks.push(i + 1);
    prev = ev.hash;
  });
  return { ok: breaks.length === 0, breaks, length: ledger.length };
}

export function ledgerTail(n = 10): LedgerEvent[] {
  return ledger.slice(-n);
}

/** Test/admin seam. */
export function resetLedger(): void {
  ledger.length = 0;
}

/* ── 6. ONE GATE — governChange ─────────────────────────────────────────── */

export type V6Verdict = "ALLOW" | "BLOCK" | "ESCALATE";

export interface GovernCandidate {
  name: string;
  target: string;
  body: string;
  /** The proposer's declaration: what it claims, and on what evidence. */
  declares: string;
  /** The current text of the target, for the drift measurement. */
  currentText: string;
  actor: string;
}

export interface GovernResult {
  verdict: V6Verdict;
  stage: PromoStage;
  reasons: string[];
  constitution: ConstitutionVerdict;
  drift: { ok: boolean; delta: number; reason?: string };
  canaries: CanaryReport;
  event?: LedgerEvent;
}

const lastKnownGood = new Map<string, { body: string; digest: string; at: number }>();

/**
 * The one door. Deterministic order: constitution → drift budget → hidden
 * canaries → verdict. BLOCK carries every reason, named. ESCALATE means
 * the machine refuses to decide — a human does.
 */
export function governChange(c: GovernCandidate, canary: CanaryReport = { ran: 0, failed: [], batteryDigest: "", source: "unavailable" }, at = Date.now()): GovernResult {
  const candidateDigest = pureSha256(JSON.stringify({ name: c.name, target: c.target, body: c.body, declares: c.declares }));
  const reasons: string[] = [];

  const constitution = checkConstitution(c);
  ledgerAppend("proposed", c.actor, c.target, `candidate ${c.name} entered the gate`, candidateDigest, at);
  if (!constitution.ok) {
    for (const v of constitution.violations) reasons.push(`${v.rule}: ${v.finding}`);
    const event = ledgerAppend("blocked", c.actor, c.target, `constitution: ${reasons.join("; ")}`, candidateDigest, at);
    return { verdict: "BLOCK", stage: "shadow", reasons, constitution, drift: { ok: true, delta: 0 }, canaries: { ran: 0, failed: [], batteryDigest: "", source: "unavailable" }, event };
  }

  const drift = admitDrift(c.currentText ?? "", c.body, c.target, DEFAULT_DRIFT_BUDGET, at);
  if (!drift.ok) {
    reasons.push(drift.reason ?? "drift budget refused");
    const event = ledgerAppend("blocked", c.actor, c.target, `drift budget: ${drift.reason}`, candidateDigest, at);
    return { verdict: "BLOCK", stage: "shadow", reasons, constitution, drift, canaries: { ran: 0, failed: [], batteryDigest: "", source: "unavailable" }, event };
  }

  ledgerAppend("canaried", c.actor, c.target, `canary source ${canary.source}: ${canary.ran} ran — ${canary.failed.length} failed`, candidateDigest, at);
  if (canary.failed.length > 0) {
    for (const f of canary.failed) reasons.push(`${f.id}: ${f.finding}`);
    const event = ledgerAppend("blocked", c.actor, c.target, `canary battery: ${reasons.join("; ")}`, candidateDigest, at);
    return { verdict: "BLOCK", stage: "shadow", reasons, constitution, drift, canaries: { ...canary }, event };
  }
  if (canary.source === "unavailable") {
    reasons.push("external verifier unavailable in this runtime — machine canaries cannot pass, the human decides without them");
  }

  /* passed the machine gates: land on the CANARY stage, and either a human
     promotes to FLEET or the escalation stands. The gate never promotes to
     fleet by itself — the human door is load-bearing.

     19.7.10 [Screenwright]: the wording now carries the STRENGTH of the
     check. The battery is a text screen over the candidate's own words and
     its source is public, so "canaries passed" on its own overstated what
     was proven. The ledger records what actually happened. */
  reasons.push("machine gates passed — the canary battery is a lexical + structural TEXT SCREEN (source public, digest-pinned), not a semantic review; promotion to fleet is a human decision");
  const event = ledgerAppend("escalated", c.actor, c.target, `machine gates passed — the canary battery is a text screen, not a semantic review; human promotion decision required`, candidateDigest, at);
  return { verdict: "ESCALATE", stage: "canary", reasons, constitution, drift, canaries: { ...canary }, event };
}

/** The human door: promote a canary-stage candidate to FLEET, with scores. */
export function promoteToFleet(c: GovernCandidate, scores: DimensionScores, baseline: RegressionBaseline, at = Date.now()): { ok: boolean; line: string } {
  const candidateDigest = digestOfCandidate(c);
  const reg = regressionGate(scores, baseline);
  if (!reg.ok) {
    const event = ledgerAppend("blocked", "human", c.target, `regression fail-closed: ${reg.dropped.join("; ")}`, candidateDigest, at);
    return { ok: false, line: `refused — fail-closed on: ${reg.dropped.join("; ")} (ledger seq ${event.seq})` };
  }
  lastKnownGood.set(c.target, { body: c.currentText ?? "", digest: pureSha256(c.currentText ?? ""), at });
  const event = ledgerAppend("promoted", "human", c.target, `${c.name} promoted shadow→canary→fleet; last-known-good snapshot kept`, candidateDigest, at);
  return { ok: true, line: `promoted to FLEET (ledger seq ${event.seq}); rollback point kept for ${c.target}` };
}

/** The digest of exactly what a promotion would change — the same bytes the ledger records. A human approval binds to THIS. */
export function digestOfCandidate(c: { name: string; target: string; body: string; declares: string }): string {
  return pureSha256(JSON.stringify({ name: c.name, target: c.target, body: c.body, declares: c.declares }));
}

/** One-step restore from the last-known-good snapshot, on the ledger. */
export function rollback(target: string, at = Date.now()): { ok: boolean; body?: string; line: string } {
  const snap = lastKnownGood.get(target);
  if (!snap) return { ok: false, line: `no last-known-good snapshot for ${target} — nothing to roll back to` };
  const event = ledgerAppend("rolled-back", "human", target, `restored snapshot ${snap.digest.slice(0, 12)}…`, snap.digest, at);
  lastKnownGood.delete(target);
  return { ok: true, body: snap.body, line: `rolled back ${target} (ledger seq ${event.seq})` };
}

export function lastKnownGoodFor(target: string): { body: string; digest: string; at: number } | null {
  return lastKnownGood.get(target) ?? null;
}

/** Test/admin seam. */
export function resetV6(): void {
  ledger.length = 0;
  driftLog.length = 0;
  lastKnownGood.clear();
}

/* ── the one-line summary a surface may print ───────────────────────────── */

export function rsiralsV6Line(): string {
  return `RSIRALS v6 — the strengthened verifier: constitution ${V6_CONSTITUTION.length} rules · drift budget ${DEFAULT_DRIFT_BUDGET.maxPerChange}/change, ${DEFAULT_DRIFT_BUDGET.maxPerWindow}/24h · external canary battery ${CANARY_BATTERY_SIZE} (externally executed, digest-pinned, ECDSA-anchored) · staged shadow→canary→fleet, fail-closed per dimension · hash-chained ledger (${ledger.length} events, verify ${verifyLedger().ok ? "clean" : "BROKEN"}) · T stays frozen at v5`;
}
