/**
 * SelfImpulse — Team-Evolve (18.1.0): the team itself learns.
 *
 * Two or more owners share a team. Every joint run is
 * recorded with its real outcome and the specialists that ran it. With enough
 * real history, VH proposes an EVOLVED team configuration — recommended
 * specialist composition with rationale and provenance — and the proposal
 * becomes the team's reusable config ONLY when EVERY member has explicitly
 * approved it. User 2's approval is structural: `approveTeamEvolution`
 * refuses partial, duplicated or outsider approvals; there is no code path
 * that adopts a config on one signature.
 *
 * Honesty rules, enforced here:
 *   • a proposal requires real verified runs — a team that has never
 *     succeeded cannot "evolve" into anything;
 *   • approvals are per-member and checked against the member list;
 *   • the evolved config is a digest-stamped artifact naming its source runs;
 *   • the routing boost it applies is LABELED ("team-evolved preference") so
 *     no decision ever hides why it leaned;
 *   • revocation is a one-call human act.
 */
import { uid } from "../app/id";
import { verifyApproval, type SignedApproval } from "./collabInvite";
import type { RouteCandidate } from "./types";

const RUNS_KEY = "engine.team.runs.v1";
const CONFIG_KEY = "engine.team.config.v1";
const PENDING_KEY = "engine.team.pending.v1";
export const RUN_CAP = 200;

/** What the team actually did together. Outcomes are the product's own vocabulary. */
export interface TeamRun {
  id: string;
  ts: string;
  teamId: string;
  members: string[];
  task: string;
  outcome: "verified" | "failed" | "refused";
  specialists: string[];
  /** Present only when a receipt was actually sealed (host runtime). */
  receiptDigest?: string;
  note?: string;
}

export interface TeamApproval {
  memberId: string;
  approved: boolean;
  at: string;
}

export interface EvolutionProposal {
  id: string;
  teamId: string;
  members: string[];
  createdAt: string;
  recommendedSpecialists: string[];
  rationale: string[];
  sourceRunIds: string[];
  digest: string;
}

export interface EvolvedTeamConfig {
  teamId: string;
  version: number;
  specialists: string[];
  sourceRunIds: string[];
  approvals: TeamApproval[];
  adoptedAt: string;
  digest: string;
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Order-independent team identity: {a,b} and {b,a} are the same team. */
export function teamIdFor(members: string[]): string {
  const clean = Array.from(new Set(members.map((m) => m.trim().toLowerCase()).filter(Boolean))).sort();
  return `team:${clean.join("+")}`;
}

/* ── the run ledger ───────────────────────────────────────────────────────── */

export function recordTeamRun(run: Omit<TeamRun, "id" | "ts"> & { id?: string; ts?: string }): TeamRun {
  const rec: TeamRun = { id: run.id ?? uid("trun"), ts: run.ts ?? new Date().toISOString(), ...run };
  const s = storage();
  if (s) {
    const all = JSON.parse(s.getItem(RUNS_KEY) ?? "[]") as TeamRun[];
    all.push(rec);
    s.setItem(RUNS_KEY, JSON.stringify(all.slice(-RUN_CAP * 4)));
  }
  return rec;
}

export function teamRuns(teamId: string): TeamRun[] {
  const s = storage();
  if (!s) return [];
  try {
    const all = JSON.parse(s.getItem(RUNS_KEY) ?? "[]") as TeamRun[];
    return all.filter((r) => r.teamId === teamId).slice(-RUN_CAP);
  } catch {
    return [];
  }
}

export interface TeamMemoryReport {
  runs: number;
  verified: number;
  failed: number;
  refused: number;
  successRate: number;
  topSpecialists: Array<{ id: string; verifiedRuns: number }>;
}

export function teamMemoryReport(teamId: string): TeamMemoryReport {
  const runs = teamRuns(teamId);
  const verified = runs.filter((r) => r.outcome === "verified");
  const perSpec = new Map<string, number>();
  for (const r of verified) for (const id of r.specialists) perSpec.set(id, (perSpec.get(id) ?? 0) + 1);
  return {
    runs: runs.length,
    verified: verified.length,
    failed: runs.filter((r) => r.outcome === "failed").length,
    refused: runs.filter((r) => r.outcome === "refused").length,
    successRate: runs.length === 0 ? 0 : verified.length / runs.length,
    topSpecialists: Array.from(perSpec.entries())
      .map(([id, verifiedRuns]) => ({ id, verifiedRuns }))
      .sort((a, b) => b.verifiedRuns - a.verifiedRuns || a.id.localeCompare(b.id)),
  };
}

/* ── the evolution proposal ───────────────────────────────────────────────── */

export type ProposeEvolutionResult =
  | { ok: true; proposal: EvolutionProposal }
  | { ok: false; error: string };

/**
 * Propose the team's next configuration FROM ITS REAL RECORD. Minimum bar:
 * 3 runs, at least one verified, at least two distinct specialists proven in
 * verified runs. Below the bar, the refusal says what is missing.
 */
export async function proposeTeamEvolution(teamId: string, members: string[], now: () => Date = () => new Date()): Promise<ProposeEvolutionResult> {
  const report = teamMemoryReport(teamId);
  if (report.runs < 3) {
    return { ok: false, error: `team has ${report.runs} recorded run(s) — at least 3 real runs are needed before an evolution proposal` };
  }
  if (report.verified < 1) {
    return { ok: false, error: "team has no verified runs — a team that has never succeeded has nothing to evolve from" };
  }
  const recommended = report.topSpecialists.slice(0, 3).map((e) => e.id);
  if (recommended.length < 2) {
    return { ok: false, error: "verified runs used fewer than 2 distinct specialists — not enough signal to recommend a composition" };
  }
  const verifiedRuns = teamRuns(teamId).filter((r) => r.outcome === "verified");
  const rationale = [
    `${report.verified}/${report.runs} joint runs verified (${Math.round(report.successRate * 100)}% success).`,
    ...recommended.map((id) => {
      const e = report.topSpecialists.find((x) => x.id === id)!;
      return `"${id}" proved out in ${e.verifiedRuns} verified run(s) — recommended for the evolved composition.`;
    }),
  ];
  const proposal: EvolutionProposal = {
    id: uid("evo"),
    teamId,
    members: Array.from(new Set(members)).sort(),
    createdAt: now().toISOString(),
    recommendedSpecialists: recommended,
    rationale,
    sourceRunIds: verifiedRuns.map((r) => r.id),
    digest: "",
  };
  proposal.digest = await sha256Hex(JSON.stringify(["engine-evolution/1", proposal.teamId, proposal.recommendedSpecialists, proposal.sourceRunIds, proposal.createdAt]));

  const s = storage();
  if (s) s.setItem(`${PENDING_KEY}:${teamId}`, JSON.stringify(proposal));
  return { ok: true, proposal };
}

export function pendingProposal(teamId: string): EvolutionProposal | null {
  const s = storage();
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(`${PENDING_KEY}:${teamId}`) ?? "null") as EvolutionProposal | null;
  } catch {
    return null;
  }
}

/* ── adoption: EVERY member approves, or it does not exist ────────────────── */

export type AdoptResult =
  | { ok: true; config: EvolvedTeamConfig }
  | { ok: false; error: string };

export async function approveTeamEvolution(
  teamId: string,
  proposalId: string,
  approvals: TeamApproval[],
  now: () => Date = () => new Date(),
  signedApprovals: SignedApproval[] = [],
): Promise<AdoptResult> {
  const proposal = pendingProposal(teamId);
  if (!proposal || proposal.id !== proposalId) return { ok: false, error: `no pending proposal ${proposalId} for this team` };

  // cryptographic consent: when signed approvals are presented, each must
  // verify against the approver's own key and match the member it claims.
  for (const sa of signedApprovals) {
    const member = approvals.find((a) => a.memberId === sa.approver);
    if (!member) return { ok: false, error: `signed approval from "${sa.approver}" has no matching team approval` };
    if (sa.inviteDigest !== proposal.digest) return { ok: false, error: `signed consent of "${sa.approver}" covers a DIFFERENT proposal — stale signatures refuse` };
    const v = await verifyApproval(sa, sa.approver);
    if (!v.ok) return { ok: false, error: v.error };
    if (sa.approved !== member.approved) return { ok: false, error: `signed consent of "${sa.approver}" contradicts the presented approval` };
  }

  const members = proposal.members;
  const seen = new Set<string>();
  for (const a of approvals) {
    if (!members.includes(a.memberId)) return { ok: false, error: `"${a.memberId}" is not a member of this team — outsider approvals are refused` };
    if (seen.has(a.memberId)) return { ok: false, error: `duplicate approval from "${a.memberId}" — one voice per member` };
    seen.add(a.memberId);
    if (!a.approved) return { ok: false, error: `"${a.memberId}" declined the evolution — a decline is not adopted` };
  }
  const missing = members.filter((m) => !seen.has(m));
  if (missing.length > 0) {
    return { ok: false, error: `missing explicit approval from: ${missing.join(", ")} — EVERY member must approve; there is no partial adoption` };
  }

  const prev = evolvedConfig(teamId);
  const config: EvolvedTeamConfig = {
    teamId,
    version: (prev?.version ?? 0) + 1,
    specialists: proposal.recommendedSpecialists,
    sourceRunIds: proposal.sourceRunIds,
    approvals: approvals.map((a) => ({ ...a, at: a.at || now().toISOString() })),
    adoptedAt: now().toISOString(),
    digest: await sha256Hex(JSON.stringify(["engine-evolved-team/1", teamId, proposal.recommendedSpecialists, proposal.sourceRunIds, members])),
  };
  const s = storage();
  if (s) {
    s.setItem(`${CONFIG_KEY}:${teamId}`, JSON.stringify(config));
    s.removeItem(`${PENDING_KEY}:${teamId}`);
  }
  return { ok: true, config };
}

export function evolvedConfig(teamId: string): EvolvedTeamConfig | null {
  const s = storage();
  if (!s) return null;
  try {
    return JSON.parse(s.getItem(`${CONFIG_KEY}:${teamId}`) ?? "null") as EvolvedTeamConfig | null;
  } catch {
    return null;
  }
}

/**
 * The team SELF-EVOLVES after connection: once the ledger clears the bar and
 * nothing is pending, this mints the proposal without anyone pressing a
 * button. Adoption still requires every member's explicit approval — auto
 * proposal, human adoption. That split is the whole safety argument.
 */
export async function autoProposeIfReady(teamId: string, members: string[], now: () => Date = () => new Date()): Promise<EvolutionProposal | null> {
  if (pendingProposal(teamId)) return null;
  const report = teamMemoryReport(teamId);
  const proven = new Set(report.topSpecialists.map((e) => e.id));
  if (report.runs < 3 || report.verified < 1 || proven.size < 2) return null;
  const r = await proposeTeamEvolution(teamId, members, now);
  return r.ok ? r.proposal : null;
}

/** The human override for the team: one call, no ceremony. */
export function revokeEvolvedConfig(teamId: string): void {
  const s = storage();
  if (s) s.removeItem(`${CONFIG_KEY}:${teamId}`);
}

/* ── the routing seam: the evolved config LEANS, visibly ──────────────────── */

/**
 * Apply the team's evolved preference to a routing decision: recommended
 * specialists get a visible +2 with a labeled reason. The deterministic
 * scores remain — this leans, it never fabricates a match out of nothing
 * (a specialist absent from the decision is not injected).
 */
export function applyTeamPreference(teamId: string, selected: RouteCandidate[]): RouteCandidate[] {
  const config = evolvedConfig(teamId);
  if (!config) return selected;
  return selected
    .map((c) =>
      config.specialists.includes(c.id)
        ? { ...c, score: c.score + 2, reasons: [...c.reasons, `team-evolved preference (config v${config.version})`] }
        : c,
    )
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
