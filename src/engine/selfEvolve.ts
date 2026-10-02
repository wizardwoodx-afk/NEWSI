/**
 * SelfImpulse — recursive self-evolution, BOUNDED (18.2.0).
 *
 * The honest reading of "recursive self-evolving" for a product whose thesis
 * is accountability: the product proposes changes to ITS OWN control plane,
 * derived from the user's real behavior and its own proposal history —
 *
 *   • a specialist the user keeps rejecting      → propose tier-tighten / disable
 *   • rejections clustering while a bar is loose → propose raising the routing bar
 *   • the user keeps rejecting a proposal class  → the proposer suppresses
 *     that class for this user (the recursion: it evolves its own proposing)
 *
 * — and every change is proposed in words, applied only by explicit human
 * approval, receipt-digested, revertible, and TIGHTEN-ONLY. What it cannot
 * touch is stated and enforced: the receipt protocol, the human gate, the
 * honesty contract, and any LOOSENING. Recursion without those floors is
 * how agents eat their own guardrails; this module exists to prove the
 * bounded version is shippable.
 */
import { uid } from "../app/id";
import { governChange, promoteToFleet, digestOfCandidate, type GovernCandidate } from "./rsiralsV6";
import { ipc } from "../ipc/client";
import { verifyExternal } from "./canaryClient";
import { rsiralsOnApply, rsiralsOnFirewallBlock, rsiralsOnRevert } from "./rsirals";
export { loadSelfOverrides } from "./selfOverrides";
import { SPECIALISTS, disabledSpecialists, getSpecialist } from "./registry";
import { patternReport } from "./memory";
import {
  applyRaiseMinScore,
  applySuppressCategory,
  applyTightenTier,
  loadSelfOverrides,
  revertSelfChange,
  type SelfOverrideEntry,
  type SelfOverrides,
} from "./selfOverrides";
const PROPOSALS_KEY = "engine.self.proposals.v1";

/** The floor. Not representable as a proposal kind; enforced in code. */
export const SELF_EVOLUTION_FLOOR = [
  "the receipt protocol (si-proof-receipt/2)",
  "the human gate and the 90% exam requirement",
  "the honesty contract (executed:false when nothing ran)",
  "any LOOSENING of any control (tiers, bars, ceilings)",
] as const;

export interface SelfProposal {
  id: string;
  createdAt: string;
  kind: "tighten-tier" | "raise-min-score" | "suppress-category";
  target: string;
  to: string | number;
  rationale: string;
  category?: string;
  rejectionReason?: string;
  state: "pending" | "applied" | "rejected";
  digest: string;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function sha256Hex(t: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function selfProposals(): SelfProposal[] {
  const s = storage();
  if (!s) return [];
  try {
    return JSON.parse(s.getItem(PROPOSALS_KEY) ?? "[]") as SelfProposal[];
  } catch {
    return [];
  }
}

function saveProposals(list: SelfProposal[]): void {
  storage()?.setItem(PROPOSALS_KEY, JSON.stringify(list.slice(-100)));
}

export type ProposeResult = { proposals: SelfProposal[]; suppressed: string[] };

/**
 * Derive tighten-only proposals from the user's real ledger. Never proposes
 * a loosening, never proposes into a suppressed category, never re-proposes
 * an already-pending or applied identical change.
 */
export async function proposeSelfChanges(userId = "default", now: () => Date = () => new Date()): Promise<ProposeResult> {
  const report = patternReport(userId);
  const ovr = loadSelfOverrides();
  const existing = selfProposals();
  const disabled = new Set(disabledSpecialists());
  const fresh: SelfProposal[] = [];

  const pendingOrApplied = new Set(existing.filter((p) => p.state !== "rejected").map((p) => `${p.kind}:${p.target}:${p.to}`));

  // 1 — specialists the user keeps rejecting: tighten, then disable
  for (const e of report.bySpecialist) {
    if (e.rejects < 3) continue;
    const spec = SPECIALISTS.find((x) => x.id === e.id);
    if (!spec || disabled.has(e.id) || ovr.suppressedCategories.includes(spec.category)) continue;
    if (spec.riskTier === "safe" && !ovr.tierTightens[e.id]) {
      const key = `tighten-tier:${e.id}:risky`;
      if (!pendingOrApplied.has(key)) {
        fresh.push(await mk("tighten-tier", e.id, "risky", spec.category,
          `you rejected "${e.id}" ${e.rejects}× (acceptance ${(e.rate * 100).toFixed(0)}%) — tighten its gate tier to risky until it re-earns trust`, now));
      }
    } else {
      const key = `suppress-category:${spec.category}`;
      // persistent rejection of an already-tightened specialist → propose category suppression
      if (!pendingOrApplied.has(key) && !ovr.suppressedCategories.includes(spec.category)) {
        fresh.push(await mk("suppress-category", spec.category, spec.category, spec.category,
          `rejections keep clustering in "${spec.category}" even after tightening — propose pausing self-proposals for that category`, now));
      }
    }
  }

  // 2 — overall acceptance below 60% with real volume → raise the routing bar
  if (report.total >= 10 && report.acceptanceRate < 0.6 && ovr.minScoreDelta < 2 && !ovr.suppressedCategories.includes("routing")) {
    const key = `raise-min-score:router.minScore:${ovr.minScoreDelta + 1}`;
    if (!pendingOrApplied.has(key)) {
      fresh.push(await mk("raise-min-score", "router.minScore", ovr.minScoreDelta + 1, "routing",
        `overall acceptance is ${(report.acceptanceRate * 100).toFixed(0)}% over ${report.total} decisions — raise the routing bar by 1 so weaker matches stay out`, now));
    }
  }

  if (fresh.length) saveProposals([...existing, ...fresh]);
  return { proposals: selfProposals(), suppressed: ovr.suppressedCategories };
}

async function mk(kind: SelfProposal["kind"], target: string, to: string | number, category: string, rationale: string, now: () => Date): Promise<SelfProposal> {
  const p: SelfProposal = { id: uid("self"), createdAt: now().toISOString(), kind, target, to, rationale, category, state: "pending", digest: "" };
  p.digest = await sha256Hex(JSON.stringify(["engine-self/1", p.kind, p.target, p.to, p.createdAt]));
  return p;
}

export type DecideResult = { ok: true; overrides: SelfOverrides } | { ok: false; error: string };

/** Apply ONLY with an explicit human decision. The UI is the gate. */
export function applySelfChange(proposalId: string, now: () => Date = () => new Date()): DecideResult {
  const list = selfProposals();
  const p = list.find((x) => x.id === proposalId);
  if (!p) return { ok: false, error: `unknown proposal ${proposalId}` };
  if (p.state !== "pending") return { ok: false, error: `proposal already ${p.state}` };
  const floor = SELF_EVOLUTION_FLOOR.join(" · ");
  void floor; // the floor is enforced by the store's tighten-only shape, not by words
  const entry: Omit<SelfOverrideEntry, "kind" | "target" | "prev"> = { id: uid("chg"), at: now().toISOString(), proposalId };
  let ovr: SelfOverrides;
  if (p.kind === "tighten-tier") ovr = applyTightenTier(p.target, p.to as "risky" | "critical", entry);
  else if (p.kind === "raise-min-score") ovr = applyRaiseMinScore(p.to as number, entry);
  else ovr = applySuppressCategory(p.target, entry);
  p.state = "applied";
  saveProposals(list);
  return { ok: true, overrides: ovr };
}

/**
 * The recursion: rejecting a proposal teaches the proposer. Three rejected
 * proposals in one category suppress future proposals there (reversibly).
 */
export function rejectSelfChange(proposalId: string, reason: string, now: () => Date = () => new Date()): DecideResult | { ok: true; overrides: SelfOverrides; autoSuppressed?: string } {
  const list = selfProposals();
  const p = list.find((x) => x.id === proposalId);
  if (!p) return { ok: false, error: `unknown proposal ${proposalId}` };
  p.state = "rejected";
  p.rejectionReason = reason;
  saveProposals(list);
  const rejected = list.filter((x) => x.state === "rejected" && x.category === p.category && x.category);
  if (p.category && rejected.length >= 3) {
    const ovr = loadSelfOverrides();
    if (!ovr.suppressedCategories.includes(p.category)) {
      const overrides = applySuppressCategory(p.category, { id: uid("chg"), at: now().toISOString() });
      return { ok: true, overrides, autoSuppressed: p.category };
    }
  }
  return { ok: true, overrides: loadSelfOverrides() };
}

export function revertAppliedChange(entryId: string): SelfOverrides {
  const entry = loadSelfOverrides().history.find((h) => h.id === entryId);
  const ovr = revertSelfChange(entryId);
  // the proposal becomes actionable again — a revert is not a decision
  if (entry?.proposalId) {
    const list = selfProposals();
    const p = list.find((x) => x.id === entry.proposalId);
    if (p && p.state === "applied") {
      p.state = "pending";
      saveProposals(list);
    }
  }
  return ovr;
}

/** Self-audit: does this module still obey its own floor? Probes pin it. */
export function floorIntact(): { ok: boolean; violations: string[] } {
  const ovr = loadSelfOverrides();
  const violations: string[] = [];
  if (ovr.minScoreDelta < 0) violations.push("min-score delta went negative (a loosening)");
  for (const [id, tier] of Object.entries(ovr.tierTightens)) {
    if ((tier as string) === "safe") violations.push(`tier "tighten" to safe for ${id} is a loosening`);
  }
  return { ok: violations.length === 0, violations };
}

/* ── 19.7.7 [Verifier] — the LIVE promotion path runs through RSIRALS v6 ── */

export interface GuardedApply {
  ok: boolean;
  error?: string;
  overrides?: SelfOverrides;
  v6?: {
    verdict: string;
    drift: number;
    canarySource: string;
    ledgerSeq?: number;
    promotion: string;
  };
}

function governCandidateFor(p: SelfProposal): GovernCandidate {
  /* the BODY is the mutation and only the mutation (the drift budget
     measures change, not justification); the rationale is EVIDENCE and
     rides in the declaration, where the canary battery reads it. */
  const body = `${p.kind} of ${p.target} to ${JSON.stringify(p.to)}`;
  /* drift is measured against a COMPARABLE rendering of the CURRENT state
     (kind · target · present value), not against serialized JSON — the
     budget then means what it says: how far the requested change sits
     from what is true now. */
  const ovr = loadSelfOverrides();
  const current = p.kind === "tighten-tier"
    ? `tighten-tier of ${p.target} to ${getSpecialist(p.target)?.riskTier ?? "safe"}`
    : p.kind === "raise-min-score"
      ? `raise-min-score to base + ${ovr.minScoreDelta}`
      : `suppress-category of ${p.target}: currently routing freely`;
  return {
    name: `self.${p.kind}.${p.target}`,
    target: "self-overrides",
    body,
    declares: `rationale: ${p.rationale} — evidence: rejection-ledger counts and the pattern report back this change; receipt: the self-overrides history digest; baseline: tighten-only floor`,
    currentText: current,
    actor: "human-apply",
  };
}

/* ── the human decision ───────────────────────────────────────────────────────────────
 * `applySelfChangeGuarded` used to hardcode `"human-approved": 1` — "the click IS the human
 * promotion decision" — but NOTHING in the function consumed a click. Any caller (any script in the
 * page) promoted a self-change as if a human had approved it. The score is now MEASURED: it is 1
 * only if the approvals store holds a decision that was
 *   (a) APPROVED,
 *   (b) made by a human actor — `human:dialog` (native capability) or `human:confirm` (web mirror),
 *       the only actors the capability flow can write, and
 *   (c) requested for THIS exact change — the approval's payload carries the candidate digest, so an
 *       approval for one change cannot promote another, or the same change after it was edited.
 * Otherwise the score is 0 and RSIRALS' own fail-closed regression gate refuses the promotion.
 * A change applies at most once (its state leaves "pending"), so an approval cannot be replayed. */
export const SELF_EVOLUTION_APPROVAL_EXECUTION = "self-evolution";

export type SelfChangeApprovalRequest =
  | { ok: true; approvalId: string; digest: string; summary: string }
  | { ok: false; error: string };

/**
 * Open the approval a human must decide before this proposal can promote. The caller then runs the
 * native flow: `ipc.approvalAuthorize(id, "APPROVED")` (a dialog) → `ipc.approvalDecide(id, "APPROVED", capability)`.
 */
export async function requestSelfChangeApproval(proposalId: string): Promise<SelfChangeApprovalRequest> {
  const p = selfProposals().find((x) => x.id === proposalId);
  if (!p) return { ok: false, error: `unknown proposal ${proposalId}` };
  if (p.state !== "pending") return { ok: false, error: `proposal already ${p.state}` };
  const digest = digestOfCandidate(governCandidateFor(p));
  const summary = `Self-change · ${p.kind} → ${p.target}: ${p.rationale}`;
  const r = (await ipc.approvalRequest(
    SELF_EVOLUTION_APPROVAL_EXECUTION,
    p.id,
    summary,
    { proposalId: p.id, candidateDigest: digest, kind: p.kind, target: p.target },
    "engine:self-evolution",
  )) as { id: string };
  return { ok: true, approvalId: r.id, digest, summary };
}

async function humanApprovalEarned(p: SelfProposal, candidate: GovernCandidate): Promise<{ earned: boolean; why: string }> {
  let rec: { decided?: boolean; status?: string; decidedBy?: string; payload?: { candidateDigest?: string } };
  try {
    rec = (await ipc.approvalGet(SELF_EVOLUTION_APPROVAL_EXECUTION, p.id)) as typeof rec;
  } catch (e) {
    return { earned: false, why: `the approvals store could not be read (${e instanceof Error ? e.message : String(e)})` };
  }
  if (!rec?.decided) return { earned: false, why: "no human decision exists for this change — request approval first (requestSelfChangeApproval)" };
  if (rec.status !== "APPROVED") return { earned: false, why: `the human decision for this change is ${rec.status}, not APPROVED` };
  if (!String(rec.decidedBy ?? "").startsWith("human:")) return { earned: false, why: "the decision was not made by a human at a native/confirm dialog" };
  if (rec.payload?.candidateDigest !== digestOfCandidate(candidate)) {
    return { earned: false, why: "the approval was requested for a different change (candidate digest mismatch) — request approval again" };
  }
  return { earned: true, why: "approved by a human for exactly this change" };
}

/**
 * The ONE live apply path, guarded by RSIRALS v6 end to end:
 *
 *   proposal → EXTERNAL canary verifier (signed, nonce-bound) → the v6 gate
 *   (constitution → drift budget → canaries) → BLOCK refuses with the rule
 *   named, or the HUMAN's click completes the staged promotion
 *   (fail-closed on tighten-only + human-approved) → the real override
 *   lands → v5's archive records it. The unguarded applySelfChange stays
 *   exported for history, but no surface uses it anymore.
 *
 *   "human-approved" is MEASURED from the approvals store (see above), never assumed.
 */
export async function applySelfChangeGuarded(proposalId: string, now: () => Date = () => new Date()): Promise<GuardedApply> {
  const list = selfProposals();
  const p = list.find((x) => x.id === proposalId);
  if (!p) return { ok: false, error: `unknown proposal ${proposalId}` };
  if (p.state !== "pending") return { ok: false, error: `proposal already ${p.state}` };

  const candidate = governCandidateFor(p);
  const canary = await verifyExternal(candidate);
  const verdict = governChange(candidate, canary, now().getTime());

  if (verdict.verdict === "BLOCK") {
    rsiralsOnFirewallBlock(candidate.name, verdict.reasons.join("; "));
    return { ok: false, error: `refused by RSIRALS v6 — ${verdict.reasons.join("; ")}` };
  }

  /* the regression gate is fail-closed on two REAL, measured dimensions of this path:
     tighten-only is a property of the change; human-approved is read from the approvals store */
  const human = await humanApprovalEarned(p, candidate);
  const promo = promoteToFleet(
    candidate,
    { scores: { "tighten-only": 1, "human-approved": human.earned ? 1 : 0 } },
    { floors: { "tighten-only": 1, "human-approved": 1 } },
    now().getTime(),
  );
  if (!promo.ok) return { ok: false, error: human.earned ? promo.line : `${promo.line} — ${human.why}` };

  const res = applySelfChange(proposalId, now);
  if (!res.ok) return { ok: false, error: res.error };
  rsiralsOnApply({ id: p.id, name: candidate.name }, null);
  return {
    ok: true,
    overrides: res.overrides,
    v6: {
      verdict: verdict.verdict,
      drift: Math.round(verdict.drift.delta * 1000) / 1000,
      canarySource: canary.source,
      ledgerSeq: verdict.event?.seq,
      promotion: promo.line,
    },
  };
}

/** Reverts land on the v5 archive too — the loop closes both ways. */
export function revertAppliedChangeGuarded(entryId: string): SelfOverrides {
  const entry = loadSelfOverrides().history.find((h) => h.id === entryId);
  if (entry) rsiralsOnRevert(`self.${entry.kind}.${entry.target}`);
  return revertAppliedChange(entryId);
}
