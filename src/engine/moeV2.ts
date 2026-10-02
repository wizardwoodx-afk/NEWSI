/**
 * AGENTIC MoE v2 — DOMAIN POOLS AND THE CREW GATE (19.7.4 [Crew]).
 *
 * MoE v1 (moe.ts) answers "which ≤3 experts cover this request". The crew
 * law answers a bigger question: given ANY task, find the DOMAINS it lives
 * in, build the POOL of specialists from exactly those domains, and field
 * the best crew from that pool — up to 25 working in parallel.
 *
 *   1. DOMAIN SCAN — the request's own text (verbs, nouns, deliverables)
 *      is scored against every routed specialist. The set of categories
 *      that clear the bar IS the domain footprint; the pool is every
 *      routed specialist in those categories. Pool size is DYNAMIC by
 *      design: "build an app" may pool several hundred across frontend,
 *      backend, database, security, devops, design; "rotate the production secret"
 *      pools a much smaller finance/tax/legal set. The number follows the
 *      task — never the other way round.
 *
 *   2. CREW GATE — one more tier above v1's point/standard/complex:
 *      requests that are compound AND span three or more domains open the
 *      crew tier, k up to CREW_MAX (25). The k is still the FEWEST that
 *      fully covers the task: the sparse-activation law did not get
 *      looser, the ceiling got taller.
 *
 *   3. SPARSE SELECTION + RESERVES — selection is still greedy on marginal
 *      coverage (no redundant experts, every admit carries a why). What is
 *      new is the RESERVE BENCH: for every selected member the pool's
 *      next-best same-domain specialist is precomputed at selection time,
 *      so a failed member is replaced by the next expert in its domain in
 *      one step — the failover path never re-scores the world mid-run.
 *
 *   4. RESERVES CONSENT — the registered bench (catalogued, not yet
 *      routed) joins pools ONLY when the owner switches reserves on. The
 *      honest-fleet rule from the federation work is untouched: no surface
 *      routes into a bench the owner has not wired.
 *
 * probe/moeV2 pins all four.
 */

import type { RouteCandidate, Specialist } from "./types";
import { scoreSpecialist, tokenize } from "./router";
import { getSpecialist } from "./registry";
import { ESTABLISHED_SPECIALISTS, FLEET_SPECIALISTS } from "./federation/fleet";

/** The hard ceiling on a crew, whatever the task. The fleet's own law. */
export const CREW_MAX = 25;

/** A category must score at least this to count as part of the domain footprint. */
export const POOL_CATEGORY_MIN = 3;

export interface DomainPool {
  /** Categories that cleared the bar, ranked by their best score. */
  domains: Array<{ category: string; best: number }>;
  /** The routed specialists from those categories, ranked by score. */
  pool: RouteCandidate[];
  /** Specialists from the registered bench (consent-gated), same ranking. */
  reserves: RouteCandidate[];
  considered: number;
}

let reservesEnabled = false;

/** Owner consent for the registered bench. Default OFF — the honest-fleet rule. */
export function setReservesEnabled(on: boolean): void {
  reservesEnabled = on;
}

export function reservesEnabledState(): boolean {
  return reservesEnabled;
}

function candidate(s: Specialist, request: string, tokens: string[]): RouteCandidate {
  const { score, reasons } = scoreSpecialist(s, request, tokens);
  return { id: s.id, score, reasons };
}

/**
 * Gate 1 — the domain scan. Returns the dynamic pool for this request.
 * Routed fleet = the established bench (what every surface may route).
 * Reserves = registered bench members from the same domains, only when the
 * owner enabled them; they never outrank a routed specialist.
 */
export function scanDomains(request: string): DomainPool {
  const tokens = tokenize(request);
  const scored = ESTABLISHED_SPECIALISTS.map((s) => candidate(s, request, tokens));
  const bestByCategory = new Map<string, number>();
  for (const c of scored) {
    const cat = getSpecialist(c.id)?.category ?? "?";
    const cur = bestByCategory.get(cat) ?? -1;
    if (c.score > cur) bestByCategory.set(cat, c.score);
  }
  const domains = [...bestByCategory.entries()]
    .filter(([, best]) => best >= POOL_CATEGORY_MIN)
    .map(([category, best]) => ({ category, best }))
    .sort((a, b) => b.best - a.best);
  const domainSet = new Set(domains.map((d) => d.category));

  const pool = scored
    .filter((c) => domainSet.has(getSpecialist(c.id)?.category ?? "?"))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  const reserves: RouteCandidate[] = reservesEnabled
    ? FLEET_SPECIALISTS.filter((s) => {
        const est = ESTABLISHED_SPECIALISTS.some((e) => e.id === s.id);
        return !est && domainSet.has(s.category);
      })
      .map((s) => candidate(s, request, tokens))
      .filter((c) => c.score >= POOL_CATEGORY_MIN)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    : [];

  return { domains, pool, reserves, considered: ESTABLISHED_SPECIALISTS.length };
}

export type CrewTier = "point" | "standard" | "complex" | "crew";

export interface CrewGateDecision {
  tier: CrewTier;
  /** The crew budget this tier admits. Never above CREW_MAX. */
  k: number;
  why: string;
  poolSize: number;
  domainCount: number;
}

const CREW_MARKERS =
  /\b(build|implement|migrate|launch|audit .*(and|plus)|end.to.end|full|complete|comprehensive|greenfield|from scratch|ship)\b/i;
const CONJUNCTION = /\b(and then|plus|also|as well as|across|both|together with)\b/i;

/**
 * Gate 2 — the crew budget. v1's tiers keep their exact meaning and their
 * exact k (1/2/3); the crew tier opens above them for compound requests
 * whose domain footprint spans three or more domains. k is scaled by the
 * pool and the footprint, then clamped to CREW_MAX — and it is still a
 * ceiling, not a quota: selection below never fills k redundantly.
 */
export function crewGate(request: string, pool: DomainPool): CrewGateDecision {
  const text = request.toLowerCase();
  const domainCount = pool.domains.length;
  const compound = CREW_MARKERS.test(text) || CONJUNCTION.test(text);

  if (domainCount >= 3 && compound) {
    const scale = Math.min(pool.pool.length, CREW_MAX);
    const k = Math.max(4, Math.min(CREW_MAX, Math.round(Math.min(scale, 4 + domainCount * 2.5))));
    return {
      tier: "crew",
      k,
      why: `compound request across ${domainCount} domains — crew tier, up to ${CREW_MAX} in parallel, still the fewest that cover it`,
      poolSize: pool.pool.length,
      domainCount,
    };
  }
  if (domainCount >= 3 || (compound && domainCount === 2)) {
    return { tier: "complex", k: 3, why: `compound request across ${domainCount} domain(s) — three experts maximum`, poolSize: pool.pool.length, domainCount };
  }
  if (domainCount === 2) {
    return { tier: "standard", k: 2, why: "one or two domains, no compounding — two experts maximum", poolSize: pool.pool.length, domainCount };
  }
  return { tier: "point", k: 1, why: "single-fact request, one domain — one expert is the whole job", poolSize: pool.pool.length, domainCount };
}

export interface CrewSelection {
  /** The admitted crew, ranked. First member is the lead. */
  crew: RouteCandidate[];
  /** Per-member reserve: the next-best SAME-DOMAIN specialist not already selected. */
  bench: Map<string, RouteCandidate[]>;
  pruned: Array<{ id: string; reason: string }>;
  gate: CrewGateDecision;
}

function categoryOf(id: string): string {
  return getSpecialist(id)?.category ?? "?";
}

function capabilitiesOf(id: string): string[] {
  return (getSpecialist(id)?.capabilities ?? []).map((c) => c.toLowerCase());
}

function marginalCoverage(candidateId: string, crew: RouteCandidate[]): boolean {
  const crewCaps = new Set<string>();
  for (const c of crew) for (const cap of capabilitiesOf(c.id)) crewCaps.add(cap);
  const caps = capabilitiesOf(candidateId);
  const newCategory = !crew.some((c) => categoryOf(c.id) === categoryOf(candidateId));
  const newCapabilities = caps.filter((cap) => !crewCaps.has(cap));
  return newCategory || newCapabilities.length > 0;
}

/**
 * Gate 3 — sparse selection with reserves. Greedy on marginal coverage over
 * the pool (routed first, reserves appended behind them — a reserve is only
 * admitted when the routed pool cannot fill k), then the bench: for every
 * admitted member, the next same-domain candidates in rank order, not
 * already selected, capped per member so the bench stays a bench.
 */
export function selectCrewV2(request: string, pool: DomainPool): CrewSelection {
  const gate = crewGate(request, pool);
  const ranked = [...pool.pool, ...(gate.tier === "crew" ? pool.reserves : [])];
  const crew: RouteCandidate[] = [];
  const pruned: Array<{ id: string; reason: string }> = [];
  for (const cand of ranked) {
    if (crew.length >= gate.k) {
      pruned.push({ id: cand.id, reason: `crew budget k=${gate.k} reached (tier=${gate.tier})` });
      continue;
    }
    if (crew.length > 0 && !marginalCoverage(cand.id, crew)) {
      pruned.push({ id: cand.id, reason: "no marginal coverage — capabilities already carried by the selected crew" });
      continue;
    }
    crew.push(cand);
  }

  const BENCH_PER_MEMBER = 3;
  const bench = new Map<string, RouteCandidate[]>();
  const chosen = new Set(crew.map((c) => c.id));
  for (const member of crew) {
    const cat = categoryOf(member.id);
    const sameDomain = ranked.filter(
      (c) => c.id !== member.id && !chosen.has(c.id) && categoryOf(c.id) === cat,
    );
    bench.set(member.id, sameDomain.slice(0, BENCH_PER_MEMBER));
  }

  return { crew, bench, pruned, gate };
}

/** The one-line accounting surfaces may print. Same discipline as moeLine. */
export function moeV2Line(sel: CrewSelection): string {
  const domains = sel.gate.domainCount;
  const bench = [...sel.bench.values()].reduce((n, b) => n + b.length, 0);
  return `Agentic MoE v2: tier=${sel.gate.tier}, crew ${sel.crew.length}/${sel.gate.k} from a ${sel.gate.poolSize}-specialist pool across ${domains} domain(s) · ${bench} bench reserve(s) staged for failover${sel.pruned.length ? ` · ${sel.pruned.length} pruned with reasons` : ""}.`;
}
