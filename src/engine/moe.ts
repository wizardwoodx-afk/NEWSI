/**
 * AGENTIC MoE — AGENTIC MIXTURE OF EXPERTISE (19.7.2.1 [Agent])
 *
 * The routing law the fleet now runs under: a task gets the FEWEST experts
 * that fully cover it — no more, ever — selected autonomously, without the
 * user asking, before any member loop starts.
 *
 * Three moving parts (the MoE machinery, rendered honest):
 *
 *   1. GATE — the request is classified by complexity (point / standard /
 *      complex) from its own text: verbs, domain breadth, conjunctive
 *      deliverables. The gate sets k, the crew budget.
 *   2. SPARSE SELECTION — experts are ranked by the existing deterministic
 *      scorer, then admitted greedily: the top expert always enters; each
 *      next expert enters ONLY if it adds marginal coverage — a category
 *      not yet covered, or capabilities the selected crew does not already
 *      carry. Redundant experts are pruned. This is the sparse-activation
 *      law of MoE (route to k ≪ N), applied at agent level.
 *   3. ACCOUNTING — the decision explains itself: tier, k, who was pruned
 *      and why, and the coverage map. Nothing is hidden behind a score.
 *
 * probe/moe pins all three.
 */
import type { RouteDecision, RouteCandidate } from "./types";
import { getSpecialist } from "./registry";

export type MoETier = "point" | "standard" | "complex";

/** Signals that widen the crew budget: multi-domain verbs and conjunctions. */
const POINT_MARKERS = /\b(what is|who is|define|when did|how many|single)\b/i;
const COMPLEX_MARKERS =
  /\b(and then|plus|also|as well as|end.to.end|full|complete|comprehensive|multi|across|both|plan .*(and|plus)|audit .*(and|plus))\b/i;
const DOMAIN_SPAN = /\b(finance|tax|gst|silicon|rtl|verification|legal|security|design|data|research|devops|writing|business|product|analysis|review|comms|health|healthcare|clinical|patient|frontend|backend)\b/gi;

/** Gate 1 — classify the request. Deterministic, explainable, cheap. */
export function moeGate(request: string): { tier: MoETier; k: number; why: string } {
  const text = request.toLowerCase();
  const domains = new Set((text.match(DOMAIN_SPAN) ?? []).map((d) => d.toLowerCase()));
  const conjunctive = COMPLEX_MARKERS.test(text);
  const pointed = POINT_MARKERS.test(text);
  if (pointed && domains.size <= 1) {
    return { tier: "point", k: 1, why: "single-fact request, one domain — one expert is the whole job" };
  }
  if (conjunctive || domains.size >= 3) {
    return { tier: "complex", k: 3, why: `compound request across ${domains.size} domain(s) with conjunctions — three experts maximum` };
  }
  return { tier: "standard", k: 2, why: "one or two domains, no compounding — two experts maximum" };
}

/** Marginal coverage: what does this candidate add over the selected crew? */
function marginalCoverage(
  candidateId: string,
  crew: RouteCandidate[],
): { adds: boolean; newCategory: boolean; newCapabilities: string[] } {
  const cand = getSpecialist(candidateId);
  if (!cand) return { adds: false, newCategory: false, newCapabilities: [] };
  const crewCaps = new Set<string>();
  for (const c of crew) {
    const s = getSpecialist(c.id);
    for (const cap of s?.capabilities ?? []) crewCaps.add(cap.toLowerCase());
  }
  const newCategory = !crew.some((c) => getSpecialist(c.id)?.category === cand.category);
  const newCapabilities = cand.capabilities.filter((cap) => !crewCaps.has(cap.toLowerCase()));
  return { adds: newCategory || newCapabilities.length > 0, newCategory, newCapabilities };
}

export interface MoEReport {
  tier: MoETier;
  k: number;
  why: string;
  admitted: string[];
  pruned: Array<{ id: string; reason: string }>;
  coverageNote: string;
}

/**
 * Gates 2+3 — sparse selection over an existing (ranked) decision.
 * Never invents candidates; only prunes. Returns a new decision whose
 * `selected` is the minimal crew, with the full MoE accounting attached.
 */
export function selectCrew(decision: RouteDecision, request: string): { decision: RouteDecision; report: MoEReport } {
  const { tier, k, why } = moeGate(request);
  const ranked = [...decision.selected].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const crew: RouteCandidate[] = ranked.length > 0 ? [ranked[0]] : [];
  const pruned: Array<{ id: string; reason: string }> = [];
  for (const cand of ranked.slice(1)) {
    if (crew.length >= k) {
      pruned.push({ id: cand.id, reason: `crew budget k=${k} reached (tier=${tier})` });
      continue;
    }
    const cov = marginalCoverage(cand.id, crew);
    if (cov.adds) {
      crew.push(cand);
    } else {
      pruned.push({ id: cand.id, reason: "no marginal coverage — capabilities already carried by the selected crew" });
    }
  }
  const cats = new Set(crew.map((c) => getSpecialist(c.id)?.category ?? "?"));
  const decision2: RouteDecision = {
    ...decision,
    selected: crew,
    strategy: crew.length === 1 ? "single" : "multi",
  };
  const report: MoEReport = {
    tier,
    k,
    why,
    admitted: crew.map((c) => c.id),
    pruned,
    coverageNote: crew.length > 0 ? `${crew.length} expert(s) across ${cats.size} category(ies)` : "no experts matched",
  };
  return { decision: decision2, report };
}

/** The one-line explanation surfaces may print next to the routing line. */
export function moeLine(report: MoEReport): string {
  const prunedNote = report.pruned.length > 0
    ? `, ${report.pruned.length} pruned for no marginal coverage/budget`
    : "";
  return `Agentic MoE (sparse specialist routing over the whole fleet): tier=${report.tier}, k=${report.admitted.length}/${report.k}${prunedNote} — ${report.coverageNote}.`;
}
