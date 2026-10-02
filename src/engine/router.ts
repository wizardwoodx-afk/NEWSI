/**
 * SelfImpulse — the MoE-style router.
 *
 * The Generalist never asks the user which specialist to use. The router
 * scores the whole bench against the request and selects top-K:
 *
 *   deterministic core  — keyword + capability scoring, fully reproducible,
 *                         no network, no key. This is the spine; it is what
 *                         the probes pin.
 *   optional LLM re-rank — only when a provider key exists; if the model
 *                         answer is missing or unparseable, the router falls
 *                         back to the deterministic order and SAYS SO
 *                         (`fallbackReason`). A silent fallback would be a
 *                         lie by omission.
 *
 * `strategy: "none"` is a real answer: no specialist cleared the bar, and the
 * Generalist must then answer directly or refuse — never pretend a match.
 *
 * Specialists the user disabled in the management surface are not fielded:
 * routing reads the enabled bench, so a switched-off expert never appears in
 * a decision — and `considered` counts the enabled bench, not the catalog.
 */
import { enabledSpecialists } from "./registry";
import { loadSelfOverrides } from "./selfOverrides";
import type { ProviderConfig, RouteCandidate, RouteDecision, Specialist } from "./types";
import { applyCrewPolicy } from "./crewPolicy";

/** Below this score a specialist is not a match — honest no-match beats a forced one. */
export const MIN_SCORE = 3;
/** How many specialists the bench may field for one request. */
export const MAX_K = 3;
/** Top-1 must lead second place by this much to run solo. */
export const SINGLE_MARGIN = 4;

const TOKEN_RE = /[a-z0-9][a-z0-9+#.-]*/g;

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(TOKEN_RE) ?? []).filter((t) => t.length >= 3);
}

/**
 * Score one specialist against a request. Every point has a named reason, so
 * the routing decision is explainable to the user and auditable in the log.
 */
export function scoreSpecialist(s: Specialist, request: string, tokens: string[]): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  const lower = request.toLowerCase();
  const tokenSet = new Set(tokens);

  for (const kw of s.keywords) {
    if (tokenSet.has(kw)) {
      score += 3;
      reasons.push(`keyword "${kw}" matched exactly`);
    } else if (kw.length >= 4 && lower.includes(kw)) {
      score += 2;
      reasons.push(`keyword "${kw}" appears in the request`);
    }
  }
  for (const cap of s.capabilities) {
    const capTokens = tokenize(cap);
    let hits = 0;
    for (const ct of capTokens) if (tokenSet.has(ct)) hits += 1;
    // a capability is relevant when several of its own words show up — one
    // shared stopword-ish token proves nothing.
    if (hits >= 2) {
      score += 1;
      reasons.push(`capability overlap: "${cap}"`);
    }
  }
  return { score, reasons };
}

/**
 * The deterministic route. Pure function of (request, catalog) — same input,
 * same output, every time. This is the order the LLM re-rank may adjust but
 * never silently replace.
 */
export function routeDeterministic(request: string, k = MAX_K): RouteDecision {
  const tokens = tokenize(request);
  const bar = MIN_SCORE + loadSelfOverrides().minScoreDelta;
  const scored: RouteCandidate[] = [];
  for (const s of enabledSpecialists()) {
    const { score, reasons } = scoreSpecialist(s, request, tokens);
    if (score >= bar) scored.push({ id: s.id, score, reasons });
  }
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));

  /* THE SHIFT POLICY IS APPLIED HERE, on the router's own output, and not later.
   *
   * `applyCrewPolicy` reads the per-desk policy the Crew matrix writes: a desk
   * that is off shift contributes nothing, and a desk that has been narrowed
   * contributes at most its depth. Doing it here — rather than filtering a
   * caller's list — means every route in the product is governed the moment it
   * is produced, including the ones that never pass through a screen.
   *
   * The candidates it drops are RETURNED, not swallowed: `policyDropped` rides
   * the decision so the UI can say "the security desk is off shift" instead of
   * quietly returning a shorter plan and letting the user wonder. */
  const policed = applyCrewPolicy(scored, k);
  const selected = policed.kept;

  let strategy: RouteDecision["strategy"] = "none";
  if (selected.length === 1) strategy = "single";
  else if (selected.length > 1) {
    strategy = selected[0].score - selected[1].score >= SINGLE_MARGIN ? "single" : "multi";
    if (strategy === "single") selected.length = 1;
  }
  return {
    selected,
    considered: enabledSpecialists().length,
    strategy,
    routedBy: "deterministic",
    policyDropped: policed.dropped.length > 0 ? policed.dropped : undefined,
  };
}

/**
 * Optional LLM-assisted re-rank. The model is asked to ORDER the deterministic
 * candidates (never to invent new ones), and must answer with a JSON array of
 * ids. Anything else — no answer, bad JSON, unknown ids, missing ids — falls
 * back to the deterministic order with the reason recorded.
 */
export async function routeWithModel(
  request: string,
  provider: ProviderConfig,
  complete: (cfg: ProviderConfig, system: string, user: string) => Promise<{ ok: true; text: string } | { ok: false; error: string }>,
  k = MAX_K,
): Promise<RouteDecision> {
  const base = routeDeterministic(request, Math.max(k * 2, MAX_K));
  if (base.strategy === "none" || base.selected.length === 0) return base;

  const ids = base.selected.map((c) => c.id);
  const prompt =
    `Rank these specialist ids by fit for the request. Reply with ONLY a JSON array of ids, most-fit first, using exactly these ids: ${JSON.stringify(ids)}\n\nRequest: ${request}`;
  const res = await complete(provider, "You are a routing assistant. Output only JSON.", prompt);
  if (!res.ok) return { ...base, fallbackReason: `llm re-rank unavailable: ${res.error}` };

  let parsed: unknown;
  try {
    parsed = JSON.parse(res.text.trim().replace(/^[^{[]*/, "").replace(/[^}\]]*$/, ""));
  } catch {
    return { ...base, fallbackReason: "llm re-rank returned unparseable JSON" };
  }
  if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== "string" || !ids.includes(x)) || new Set(parsed as string[]).size !== (parsed as string[]).length) {
    return { ...base, fallbackReason: "llm re-rank returned ids outside the candidate set" };
  }
  const order = parsed as string[];
  const byId = new Map(base.selected.map((c) => [c.id, c]));
  const reranked = order.map((id) => byId.get(id)!).filter(Boolean).concat(base.selected.filter((c) => !order.includes(c.id)));
  const selected = reranked.slice(0, k);
  let strategy: RouteDecision["strategy"] = selected.length === 1 ? "single" : "multi";
  return { selected, considered: base.considered, strategy, routedBy: "llm-assisted" };
}
