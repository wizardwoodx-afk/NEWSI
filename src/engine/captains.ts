/**
 * SelfImpulse — the CONSUL layer (19.0.0 as AgentLead; renamed Captain in
 * 19.1.0 "Shipyard"; renamed Consul in the company restructure). The company
 * chain is strict and never skips a rung (the law lives in ./chain):
 *
 *   USER ⇄ CAPTAIN (CEO — the only human-facing seat)
 *           ⇄ CONSUL (this file — one per domain; reports UP to the CEO,
 *                     never addresses the user, never commands the crew)
 *                     ⇄ ADEPT (desk lead) ⇄ SUB-AGENTS (the crew)
 *
 * Specialists within a domain are not a flat crowd: every domain has exactly
 * one Consul — a named oversight role that (a) plans domain work across its
 * members, (b) aggregates what actually happened, and (c) reports UP to the
 * Captain in a structured, honest report. The Consul never fabricates member
 * outcomes: its report is computed from the real pipeline results, and it is
 * part of the provenance-digested response. A Consul is an orchestrator over
 * states — like the goal engine, it calls no provider and invents nothing.
 *
 * Coverage is an invariant, not a hope: every specialist category — including
 * finance and silicon, whose desks field hundreds of sub-agents — has a Consul,
 * and every desk's category resolves to one (probe/workspace pins both). A
 * domain with no Consul would let the Captain brief an Adept directly.
 *
 * Ids keep the historical `captain.<domain>` prefix: stored receipts, synthesis
 * records and probes reference them, so the TITLE changed and the key did not.
 */
import type { CaptainReport, SpecialistCategory } from "./types";
import { getSpecialist, specialistsForCategory } from "./registry";
import { TITLES } from "./chain";

/** A Consul seat. The type keeps its historical name so stored records still parse. */
export interface Captain {
  id: string;
  name: string;
  domain: SpecialistCategory;
  /** What this Consul is accountable for, in one sentence. */
  mandate: string;
  /** The Consul's own playbook, composed into oversight prompts. */
  systemPrompt: string;
}

const captain = (domain: SpecialistCategory, label: string, mandate: string, focus: string): Captain => {
  const name = `${TITLES.consul} of ${label}`;
  return {
    id: `captain.${domain}`,
    name,
    domain,
    mandate,
    systemPrompt: `You are the ${name} in the SelfImpulse company. You report to the ${TITLES.captain} (the CEO) and to no one else: you never address the user, and you never command a ${TITLES.crew.toLowerCase()} directly — your ${TITLES.adept}s lead the crews, and their results reach you through their desks. ${focus} Report only what actually happened: name the members involved, their real outcomes, and the single next step. Never claim work that did not run. Layer discipline is absolute — no message skips a rung.`,
  };
};

export const CAPTAINS: Captain[] = [
  captain("code", "Code", "Owns implementation quality end to end.", "Sequence work so foundations land before dependents; pair every implementation step with its test and review path."),
  captain("security", "Security", "Owns the trust boundary of every plan.", "Nothing ships without its threat reviewed; escalate anything touching credentials, egress or autonomy immediately."),
  captain("testing", "Testing", "Owns the evidence that work is correct.", "Every claimed fix needs a failing-then-passing test; quarantine flake with an owner, never with a retry."),
  captain("review", "Review", "Owns the quality gate before merge.", "Weight review effort by blast radius; no approval without the residual risks named."),
  captain("data", "Data", "Owns data trust: lineage, quality, privacy.", "Every number names its source and freshness; destructive data steps are reversible or flagged."),
  captain("devops", "DevOps", "Owns delivery and operability.", "Every change states its blast radius and rollback before it runs; recovery is rehearsed, not hoped for."),
  captain("research", "Research", "Owns evidence quality behind decisions.", "Load-bearing claims need two independent sources or an honest single-sourced label."),
  captain("writing", "Writing", "Owns clarity of everything shipped to readers.", "Lead with the answer; every command in docs runs as written or is flagged."),
  captain("analysis", "Analysis", "Owns the honesty of numbers in decisions.", "Assumptions are visible before results; ranges over false point estimates."),
  captain("design", "Design", "Owns the product's visible quality bar.", "Refuse the generic look; hierarchy works in greyscale first; every state is designed, including the worst one."),
  captain("product", "Product", "Owns the problem definition behind every build.", "The problem statement ships before the solution; every order names the user outcome it serves."),
  captain("business", "Business", "Owns the honesty of plans and numbers.", "Every projection lists its assumptions and its error range; a plan without a kill criterion is decoration."),
  captain("legal", "Legal", "Owns obligations, consent and liability clarity.", "Obligations map to controls with evidence; never assure what the product cannot verify."),
  captain("comms", "Comms", "Owns what we say, when, and to whom.", "Known, unknown, next — on a clock; corrections are appended, never erased."),
  captain("finance", "Finance", "Owns the integrity of every figure that touches money.", "Every number names its ledger, period and currency; anything regulated is flagged for a licensed human, never improvised; reconcile before you report."),
  captain("silicon", "Silicon", "Owns correctness from RTL to sign-off evidence.", "Nothing is called verified without its testbench, coverage and corner named; every timing, power or area claim cites the tool run that produced it; a waived check names its owner."),
];

export function getCaptain(id: string): Captain | null {
  return CAPTAINS.find((l) => l.id === id) ?? null;
}

export function captainForDomain(domain: SpecialistCategory): Captain | null {
  return CAPTAINS.find((l) => l.domain === domain) ?? null;
}

/** The Consul accountable for a routed set: the domain with the most members routed (ties → first routed). */
export function captainForRoute(specialistIds: string[]): Captain | null {
  const counts = new Map<SpecialistCategory, number>();
  let firstCat: SpecialistCategory | null = null;
  for (const id of specialistIds) {
    const s = getSpecialist(id);
    if (!s) continue;
    if (firstCat === null) firstCat = s.category;
    counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
  }
  if (firstCat === null) return null;
  let best = firstCat;
  let bestN = -1;
  for (const [cat, n] of counts) if (n > bestN) { best = cat; bestN = n; }
  return captainForDomain(best);
}

/**
 * The lead's work plan for a task: the domain members whose routing
 * vocabulary best matches the task text, capped at 3 — a plan, not a
 * wishlist. Pure keyword scoring; the router remains the authority for
 * actual routing.
 */
export function planDomainWork(captainId: string, task: string, cap = 3): { specialistId: string; name: string; score: number }[] {
  const l = getCaptain(captainId);
  if (!l) return [];
  const tokens = new Set(task.toLowerCase().split(/[^a-z0-9+#.]+/).filter((t) => t.length > 2));
  return specialistsForCategory(l.domain)
    .map((s) => ({
      specialistId: s.id,
      name: s.name,
      score: s.keywords.reduce((n, k) => n + (tokens.has(k.toLowerCase()) ? 1 : 0), 0),
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.specialistId.localeCompare(b.specialistId))
    .slice(0, cap);
}

/**
 * The Consul's report to the Generalist — computed from REAL member results,
 * never asserted. Status logic mirrors the goal truthfulness contract:
 * "completed" requires every involved member actually executed.
 */
export function buildCaptainReport(
  captainId: string,
  results: { specialistId: string; outcome: string; note?: string; memberDigest?: string }[],
): CaptainReport | null {
  const l = getCaptain(captainId);
  if (!l || results.length === 0) return null;
  const done = results.filter((r) => r.outcome === "answered" || r.outcome === "peer-delegated").length;
  const status: CaptainReport["status"] =
    done === results.length ? "completed"
    : done > 0 ? "partial"
    : results.some((r) => r.outcome === "refused" || r.outcome === "gated-out") ? "blocked"
    : results.every((r) => r.outcome === "planned") ? "planned"
    : "blocked";
  const members = results.map((r) => ({
    specialistId: r.specialistId,
    name: getSpecialist(r.specialistId)?.name ?? r.specialistId,
    outcome: r.outcome,
    note: r.note,
    memberDigest: r.memberDigest,
  }));
  const failures = results.filter((r) => r.outcome !== "answered" && r.outcome !== "peer-delegated")
    .map((r) => `${getSpecialist(r.specialistId)?.name ?? r.specialistId}: ${r.outcome}${r.note ? ` — ${r.note.slice(0, 80)}` : ""}`);
  const summary =
    status === "completed" ? `All ${done} routed ${l.domain} member(s) executed; work is done end to end.`
    : status === "partial" ? `${done} of ${results.length} routed member(s) executed; the rest did not run — see failures.`
    : status === "planned" ? `No member executed (no provider); the ${l.domain} plan is ready to run when a key exists.`
    : `Nothing executed in the ${l.domain} domain; progress stopped at the gate or a refusal.`;
  const nextStep =
    status === "completed" ? "None — accept or reject the work in the log."
    : status === "planned" ? "Add a provider key and re-run the plan."
    : status === "partial" ? "Re-run only the failed members; the executed ones keep their receipts."
    : "Resolve the blocking decision at the gate, then resume.";
  return { captainId: l.id, captainName: l.name, domain: l.domain, status, summary, members, failures, nextStep };
}
