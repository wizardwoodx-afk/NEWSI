/**
 * SelfImpulse — RSIRALS v5.0: Trust-Rooted Recursive Self-Improvement.
 * Governance plane FROZEN at 19.4.4 (receipt-bound, no behavioral drift);
 * header synced to the 19.5.1 train.
 * PROPRIETARY SELFIMPULSE IMPLEMENTATION.
 *
 * RSIRALS = Recursive Self-Improvement + Reinforcement + Agentic Learning
 * System. Core lifecycle:
 *
 *   OBSERVE → ATTRIBUTE → IMPROVE → VERIFY → PROMOTE → CANARY →
 *   REMEMBER → MONITOR → REPEAT
 *
 * with a parallel slow channel the loop can NEVER touch:
 *
 *   HUMAN GOVERN → VERSION → SIGN → DEPLOY TRUST POLICY
 *
 * Governing principle: the agent may recursively evolve everything about
 * itself. It may never recursively evolve the authority that judges
 * whether its evolution is allowed. Formally: ∂T/∂A = 0 — the governance
 * plane T has no write-dependency on anything the agent produces.
 *
 * THE THREE PLANES
 *   T — GOVERNANCE PLANE  (this file's frozen GOVERNANCE_PLANE constant):
 *       objective contract, promotion rules, safety policies, evaluation
 *       standards, resource ceilings, rollback authority. Declared as a
 *       frozen, digest-stamped constant with NO mutation API — T only
 *       changes through the human-governed lifecycle (proposal → review →
 *       signed release), which in VH is the existing human-gated
 *       self-evolution flow. Never through the loop.
 *   TRUST / PROMOTION PLANE (controlPlaneFirewall, verifyCandidate,
 *       canary watch, rollback, longitudinal monitor): enforces T,
 *       never redefines T.
 *   SELF-IMPROVING AGENT PLANE: the existing SelfImpulse RSI engine
 *       (src/engine/rsi.ts) — curriculum, actor, drafts, promotion.
 *
 * DUAL CLOCKS (honest boundary):
 *   Σ-arm (FAST) — scaffold improvements in-product: playbooks, routing,
 *       prompts, memory. This is the rsi.ts loop.
 *   θ-arm (SLOW) — weight updates. VH does NOT train weights in-product;
 *       that would be a lie on a local-first assurance runtime. Instead
 *       the θ-arm is served honestly: logged accept/reject pairs are
 *       EXPORTED (exportThetaPairs) for out-of-band DPO training under
 *       human governance — exactly RSIRALS Phase 1 of the roadmap.
 *
 * RESEARCH ANCHORS: Schmidhuber's Gödel Machine / success-story
 * algorithm; Gödel Agent (ACL 2025); POLARIS (ACL Findings 2026); ADAS;
 * "Self-Improvements in Modern Agentic Systems: A Survey"; "LLMs Gaming
 * Verifiers: RLVR can Lead to Reward Hacking" — plus the two papers in
 * the founding reading list (RSI survey; RSIAgent).
 */
import { hashString } from "../domain/artifact";

/* ── PLANE T — GOVERNANCE. Frozen. Digest-stamped. No write path. ───────── */

export interface GovernancePolicy {
  id: "vh.rsirals.T";
  version: number; // T_vN — incremented only by the human-governed lifecycle
  objectiveContract: string;
  promotionRules: string[];
  safetyPolicies: string[];
  evaluationStandards: string[];
  resourceCeilings: { providerCallsPerCycle: number; topicsPerCycle: number; maxDraftBytes: number };
  rollbackAuthority: "human-only";
}

/**
 * T. A frozen constant: there is deliberately NO setter, updater or
 * patcher for this object anywhere in the product. The door probe pins
 * that invariant. Changes to T follow the signed human lifecycle —
 * a new version ships as code + docs, reviewed and released.
 */
export const GOVERNANCE_PLANE: Readonly<GovernancePolicy> = Object.freeze({
  id: "vh.rsirals.T",
  version: 5,
  objectiveContract:
    "Improvements must tighten discretion, trace to real ledger evidence, and never trade user authority for agent convenience.",
  promotionRules: [
    "apply is always a human decision",
    "trust requires a measured comparison: candidate beats baseline",
    "measurements must be receipt-bound (exam/receipts) or explicitly marked externally supplied",
    "losing measurements retire the change and revert its frozen memory exactly",
  ],
  safetyPolicies: [
    "the human gate and its risk tiers",
    "the autonomy exam and its pass threshold",
    "the probe and verification suites and their pins",
    "the self-evolution floor (SELF_EVOLUTION_FLOOR)",
    "the RSI floor (RSI_FLOOR)",
    "this governance plane — the loop cannot loosen the loop",
  ],
  evaluationStandards: [
    "independent verifier held out of the generation path (the autonomy exam)",
    "deterministic evidence: ledger ids, digests, receipt stamps",
    "intrinsic self-assessment is never a verifier",
  ],
  resourceCeilings: { providerCallsPerCycle: 8, topicsPerCycle: 10, maxDraftBytes: 2400 },
  rollbackAuthority: "human-only",
});

export async function governanceDigest(): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(GOVERNANCE_PLANE)),
  );
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* ── TRUST PLANE — control-plane firewall ────────────────────────────────── */

/**
 * Any candidate touching the Governance Plane is rejected BEFORE
 * verification runs. No score can override this — that is the firewall.
 */
const FIREWALL_TRIGGERS = [
  "risk tier", "risk-tier", "gate threshold", "pass threshold", "exam threshold",
  "disable the gate", "bypass the gate", "lower the bar", "self-evolution floor",
  "rsi_floor", "verification suite", "probe pin", "governance plane",
  "grant myself", "approve myself", "autonomy without exam",
];

export function controlPlaneFirewall(candidate: { name: string; description: string; body: string }): { allowed: boolean; reason: string } {
  const text = `${candidate.name}\n${candidate.description}\n${candidate.body}`.toLowerCase();
  for (const t of FIREWALL_TRIGGERS) {
    if (text.includes(t)) return { allowed: false, reason: `control-plane firewall: candidate touches the governance plane ("${t}") — rejected before verification` };
  }
  if (candidate.body.length > GOVERNANCE_PLANE.resourceCeilings.maxDraftBytes * 4) {
    return { allowed: false, reason: "control-plane firewall: candidate exceeds governed size ceilings" };
  }
  return { allowed: true, reason: "no governance-plane contact" };
}

/* ── TRUST PLANE — the evidence stack ────────────────────────────────────── */

export interface EvidenceVerdict { id: string; ok: boolean; detail: string }

export const EVIDENCE_STACK = [
  { id: "V_replay", name: "held-out replay", how: "trial records carry inputs + receipt digests, frozen at run time" },
  { id: "V_independent", name: "independent verifier", how: "the autonomy exam is held out of the generation path — the judge that scores is never the drafter" },
  { id: "V_regression", name: "regression testing", how: "the probe fleet pins behavior; any change that breaks a pin cannot ship" },
  { id: "V_safety", name: "safety / policy testing", how: "control-plane firewall + the GuardRail (SSRF egress, injection scan, rate gates)" },
  { id: "V_anti_hack", name: "anti-reward-hacking", how: "promotion settles only on receipt-bound measurements, or is explicitly marked externally supplied" },
  { id: "V_anti_collapse", name: "anti-collapse", how: "diversity check over applied playbooks — the loop may not converge on one repeated category" },
  { id: "V_cost", name: "cost / resource budget", how: "T's resource ceilings bound provider calls, topics and draft size per cycle" },
] as const;

/* ── TRUST PLANE — structured change contracts (primary enforcement) ─────── */

/**
 * 19.4.4 (release review): strings alone cannot prove a candidate safe.
 * The PRIMARY governance check is structural: every change carries a
 * contract — target, field, old/new value, authority, scope, risk — and
 * mutations targeting protected fields are rejected by the contract
 * itself, before any text analysis runs. The string firewall stays as
 * defense-in-depth, supplementary rather than primary.
 */
export const PROTECTED_TARGETS = ["governance", "gate", "exam", "verification", "risk-tier", "floor"] as const;

export interface ChangeContract {
  target: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  authority: "human" | "rsi-loop";
  scope: string;
  risk: "safe" | "risky";
}

export function validateChangeContract(c: ChangeContract): { allowed: boolean; reason: string } {
  if ((PROTECTED_TARGETS as readonly string[]).includes(c.target)) {
    return { allowed: false, reason: `structural firewall: target "${c.target}" is protected — the loop may never write it, by any authority` };
  }
  if (!c.field.trim()) return { allowed: false, reason: "structural firewall: contract has no field" };
  if (!c.scope.trim()) return { allowed: false, reason: "structural firewall: contract has no scope" };
  if (c.authority !== "human" && c.authority !== "rsi-loop") return { allowed: false, reason: "structural firewall: authority must be human or rsi-loop" };
  if (c.risk !== "safe" && c.risk !== "risky") return { allowed: false, reason: "structural firewall: unknown risk tier" };
  return { allowed: true, reason: "contract valid — target is writable" };
}

/** The contract every RSI playbook draft is born with. */
export function draftContract(topicSubject: string): ChangeContract {
  return {
    target: "playbook",
    field: "specialist playbook (prompt composition)",
    authority: "human",
    scope: topicSubject.slice(0, 120),
    risk: "safe",
  };
}

/* ── AGENT PLANE — attribution and the dual clocks ───────────────────────── */

export type ArmRoute = "sigma" | "theta" | "joint";

/**
 * FAILURE-SOURCE ATTRIBUTION / ARM ROUTING (wording kept honest per
 * release review): this is heuristic attribution by failure shape, NOT a
 * full causal counterfactual experiment — true controlled A/B
 * counterfactuals live in the mission-level measured loop
 * (src/mission/selfImprove.ts). Scaffold-shaped evidence (playbooks,
 * routing, tools, prompts, egress) routes to the Σ-arm (fast,
 * in-product). Provider/model-shaped evidence routes to the θ-arm (slow
 * — out-of-band; VH never trains weights in-product). Ambiguous failures
 * are tagged joint.
 */
export function attributeEvidence(subject: string): ArmRoute {
  const s = subject.toLowerCase();
  const theta = /(model|provider|completion|empty reply|token|llm|api error|http 5|rate limit)/.test(s);
  const sigma = /(playbook|routing|tool|prompt|skill|egress|workspace|gate|retrieval|synthesis|captain)/.test(s);
  if (theta && sigma) return "joint";
  if (theta) return "theta";
  return "sigma";
}

/* ── store ────────────────────────────────────────────────────────────────── */

interface CanaryItem { name: string; draftId: string; category?: string; since: string }
export interface ArchiveEntry {
  id: string;
  event: "drafted" | "firewall-blocked" | "applied" | "adopted" | "retired" | "reverted" | "canary-rollback";
  name: string;
  detail: string;
  at: string;
}
interface RsiralsState {
  archive: ArchiveEntry[];
  canary: CanaryItem[];
  baselines: Record<string, number>; // promoId → exam score at apply
  examScores: Array<{ score: number; at: string }>;
  providerCalls: number;
}

const KEY = "engine.rsirals.v1";
function storage(): Storage | null {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
}
const session: RsiralsState = { archive: [], canary: [], baselines: {}, examScores: [], providerCalls: 0 };

function load(): RsiralsState {
  const s = storage();
  if (!s) return session;
  try {
    const p = JSON.parse(s.getItem(KEY) ?? "") as Partial<RsiralsState>;
    return { archive: p.archive ?? [], canary: p.canary ?? [], baselines: p.baselines ?? {}, examScores: p.examScores ?? [], providerCalls: p.providerCalls ?? 0 };
  } catch { return session; }
}
function save(st: RsiralsState): void {
  const s = storage();
  if (s) { try { s.setItem(KEY, JSON.stringify(st)); return; } catch { /* session-only */ } }
  Object.assign(session, st);
}

export function rsiArchive(): ArchiveEntry[] { return load().archive; }
export function canaryWatchlist(): CanaryItem[] { return load().canary; }

function appendArchive(st: RsiralsState, event: ArchiveEntry["event"], name: string, detail: string): void {
  st.archive = [...st.archive, { id: `arc.${st.archive.length + 1}`, event, name, detail: detail.slice(0, 200), at: new Date().toISOString() }].slice(-80);
}

/* ── lifecycle hooks (called by the door alongside rsi.ts) ───────────────── */

/** REMEMBER + CANARY arm: an applied playbook enters the canary watch.
    The baseline exam score is stored under the PROMOTION id
    (`promo.${draft.id}`) so bindSettlementEvidence finds it. */
export function rsiralsOnApply(draft: { id: string; name: string; category?: string }, currentExamScore: number | null): void {
  const st = load();
  st.canary = [...st.canary, { name: draft.name, draftId: draft.id, category: draft.category, since: new Date().toISOString() }].slice(-12);
  if (currentExamScore !== null) st.baselines[`promo.${draft.id}`] = currentExamScore;
  appendArchive(st, "applied", draft.name, `canary armed${currentExamScore !== null ? ` · baseline exam ${Math.round(currentExamScore * 100)}%` : " · no exam baseline recorded yet"}`);
  save(st);
}

export function rsiralsOnFirewallBlock(name: string, reason: string): void {
  const st = load();
  appendArchive(st, "firewall-blocked", name, reason);
  save(st);
}

export function rsiralsOnSettle(name: string, state: "adopted" | "retired", settledBy: string): void {
  const st = load();
  st.canary = st.canary.filter((c) => c.name !== name);
  appendArchive(st, state, name, settledBy);
  save(st);
}

export function rsiralsOnRevert(name: string): void {
  const st = load();
  st.canary = st.canary.filter((c) => c.name !== name);
  appendArchive(st, "reverted", name, "human revert — exact");
  save(st);
}

/** Record a real exam score — the receipt-bound measurement source. */
export function rsiralsRecordExamScore(score: number): void {
  const st = load();
  st.examScores = [...st.examScores, { score, at: new Date().toISOString() }].slice(-20);
  save(st);
}
export function rsiralsExamScores(): Array<{ score: number; at: string }> { return load().examScores; }

/**
 * CANARY check + automatic rollback. Called on every RSI signal: if a
 * failure-shaped signal arrives while a canary playbook is live and the
 * signal attributes to the same category (or the playbook is
 * category-bound to everything), the canary memory is reverted —
 * auto-rollback on live regression, receipted in the archive.
 * Returns the names rolled back (the door performs the actual revert).
 */
export function rsiralsCanaryCheck(signal: { kind: string; subject: string; category?: string }): string[] {
  if (signal.kind !== "failure" && signal.kind !== "livedata" && signal.kind !== "gate") return [];
  const st = load();
  const route = attributeEvidence(signal.subject);
  if (route === "theta") return []; // model-shaped failures are not the scaffold's fault
  const hit = st.canary.filter((c) => !signal.category || !c.category || c.category === signal.category);
  if (hit.length === 0) return [];
  st.canary = st.canary.filter((c) => !hit.includes(c));
  for (const h of hit) appendArchive(st, "canary-rollback", h.name, `live regression attributed (${signal.kind}): ${signal.subject.slice(0, 120)}`);
  save(st);
  return hit.map((h) => h.name);
}

/* ── PROMOTE — sealed, receipt-bound settlement (the ONLY product door) ──── */

export interface MeasurementEvidence {
  promoId: string;
  baseline: number;
  candidate: number;
  source: string;
  producedAt: string;
  /** Structural seal over the fields above — recomputed and verified by
      rsi.settleRsiPromotion; forged or tampered evidence is refused. */
  digest: string;
}

const SEAL_SALT = "vh.rsirals.measurement.v1";

export function sealMeasurement(e: Omit<MeasurementEvidence, "digest">): string {
  return hashString(`${SEAL_SALT}|${e.promoId}|${e.baseline}|${e.candidate}|${e.source}|${e.producedAt}`);
}

export type BindResult = { ok: true; evidence: MeasurementEvidence } | { ok: false; error: string };

/**
 * End-to-end evidentiary settlement (19.4.4): the numbers are NOT
 * supplied — they are read from the product's own exam receipts
 * (baseline recorded at apply, candidate = latest exam) and returned as
 * SEALED evidence. rsi.settleRsiPromotion accepts only sealed evidence;
 * the raw numeric settlement function is module-private. Without real
 * exam receipts this refuses in words.
 */
export function bindSettlementEvidence(promoId: string): BindResult {
  const st = load();
  const baseline = st.baselines[promoId];
  const latest = st.examScores[st.examScores.length - 1];
  if (typeof baseline !== "number") return { ok: false, error: "no exam baseline was recorded when this playbook was applied — settlement refused (measurements must be receipt-bound)" };
  if (!latest) return { ok: false, error: "no exam run since apply — settlement refused (there is no candidate measurement yet)" };
  const source = `exam receipts (bound) · baseline at apply ${Math.round(baseline * 100)}% · latest exam ${Math.round(latest.score * 100)}%`;
  const producedAt = new Date().toISOString();
  const partial = { promoId, baseline, candidate: latest.score, source, producedAt };
  return { ok: true, evidence: { ...partial, digest: sealMeasurement(partial) } };
}

/* ── θ-ARM (slow clock) — honest boundary + DPO export ───────────────────── */

/**
 * VH never trains weights in-product — that is the honest θ-arm
 * boundary. What the θ-arm gets instead: the real logged accept/reject
 * pairs, exported for OUT-OF-BAND DPO under human governance (RSIRALS
 * Phase 1). Pairs are drawn from the actual decision ledger.
 */
export function exportThetaPairs(decisions: Array<{ scenario?: string; action?: string; kind: string; reason?: string }>): Array<{ prompt: string; chosen?: string; rejected?: string }> {
  const pairs: Array<{ prompt: string; chosen?: string; rejected?: string }> = [];
  const byScenario = new Map<string, { accepted?: string; rejected?: string }>();
  for (const d of decisions) {
    const key = (d.scenario ?? "").slice(0, 120);
    if (!key) continue;
    const slot = byScenario.get(key) ?? {};
    if (d.kind === "accept") slot.accepted = `${d.action ?? ""}${d.reason ? ` — ${d.reason}` : ""}`.slice(0, 300);
    if (d.kind === "reject") slot.rejected = `${d.action ?? ""}${d.reason ? ` — ${d.reason}` : ""}`.slice(0, 300);
    byScenario.set(key, slot);
  }
  for (const [prompt, v] of byScenario) {
    if (v.accepted || v.rejected) pairs.push({ prompt, chosen: v.accepted, rejected: v.rejected });
  }
  return pairs.slice(-100);
}

/* ── MONITOR — longitudinal drift over the ARCHIVE, not one candidate ────── */

export interface LongitudinalReport {
  generations: number;
  capabilityDrift: number[];      // exam scores over time
  verifierDrift: { applied: number; rejectedOrRetired: number };
  diversityDrift: number;         // distinct playbook families touched
  costDrift: { providerCallsBudget: number };
  rollbacks: number;
}

export function longitudinalMonitor(): LongitudinalReport {
  const st = load();
  const applied = st.archive.filter((a) => a.event === "applied" || a.event === "adopted").length;
  const gone = st.archive.filter((a) => a.event === "retired" || a.event === "reverted" || a.event === "canary-rollback").length;
  const families = new Set(st.archive.filter((a) => a.event === "applied").map((a) => a.name.split(".").slice(0, 2).join(".")));
  return {
    generations: st.archive.length,
    capabilityDrift: st.examScores.map((e) => Math.round(e.score * 100) / 100),
    verifierDrift: { applied, rejectedOrRetired: gone },
    diversityDrift: families.size,
    costDrift: { providerCallsBudget: GOVERNANCE_PLANE.resourceCeilings.providerCallsPerCycle },
    rollbacks: st.archive.filter((a) => a.event === "canary-rollback" || a.event === "reverted").length,
  };
}

/** The lifecycle, stated once, for the UI and the probes. */
export const RSIRALS_LIFECYCLE = [
  "OBSERVE", "ATTRIBUTE", "IMPROVE", "VERIFY", "PROMOTE", "CANARY", "REMEMBER", "MONITOR", "REPEAT",
] as const;
export const RSIRALS_GOVERNANCE_CHANNEL = ["HUMAN GOVERN", "VERSION", "SIGN", "DEPLOY TRUST POLICY"] as const;
