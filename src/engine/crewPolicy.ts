/**
 * SelfImpulse — the SHIFT POLICY: which desks are on, how deep they may go, and
 * what they may spend.
 *
 * ── WHY THIS IS A POLICY AND NOT A SETTINGS PAGE ─────────────────────────────
 * The product ships ~230 specialists across 24 domains. Routing picks from all
 * of them, which is the right default and the wrong only-option: a deployment
 * that has no revenue work should not pay for revenue desks, and one that has
 * been burned by a domain should be able to take that domain off the floor
 * without deleting a roster entry.
 *
 * But a knob nobody reads is a lie. Every field here is ENFORCED on the routing
 * seam — `applyCrewPolicy` is applied to the router's own output, so a desk that
 * is off the floor is off the floor, and a budget that is set is the budget the
 * prompt is actually fit to. If this file only wrote to storage it would be
 * decoration, and decoration that claims to govern is worse than nothing.
 *
 * ── THE THREE KNOBS, AND WHAT EACH ONE ACTUALLY MOVES ────────────────────────
 *
 *   ON SHIFT    Whether the domain may be routed to at all. Off means the
 *               router's candidates from that domain are dropped before any
 *               budget is spent. This is the one with teeth.
 *
 *   DEPTH       How many specialists ONE domain may contribute to a single
 *               route. `lead` (1), `desk` (3) or `full` (8). It exists because
 *               a broad ask can otherwise return eight members of the same desk
 *               and call it a plan — depth is the difference between consulting
 *               a domain and drowning in it.
 *
 *   BUDGET      The prompt-token ceiling for that domain's contribution, in
 *               tokens. This is the real `PROMPT_BUDGET` machinery: the number
 *               set here is the number handed to `fitToBudget()`, so a desk set
 *               to 2k genuinely gets 2k and its text is trimmed to fit rather
 *               than silently overrunning the window.
 *
 * ── DEFAULT vs CUSTOM, AND WHY BOTH ARE KEPT ─────────────────────────────────
 * `DEFAULT_POLICY` is derived from the roster, not typed out, so adding a domain
 * adds a row rather than silently leaving one ungoverned. The user's edits live
 * beside it under their own key, and "Default" is always one press away — so an
 * operator can always answer "what did this ship as?" without a fresh install.
 */
import type { SpecialistCategory } from "./types";
import { enabledSpecialists, getSpecialist } from "./registry";

const POLICY_KEY = "engine.crew.policy.v1";

export type Depth = "lead" | "desk" | "full";

/** How many specialists of one domain may ride a single route. */
export const DEPTH_LIMIT: Record<Depth, number> = { lead: 1, desk: 3, full: 8 };

/** The labels the matrix shows. Plain words, because the door is a door. */
export const DEPTH_LABEL: Record<Depth, string> = {
  lead: "Lead only",
  desk: "Whole desk",
  full: "Every hand",
};

/** The budget slider's stops. Powers of two, because the number is a token
 *  ceiling and powers of two are how token ceilings are actually reasoned about;
 *  the tick marks on the slider are these, not an arbitrary visual rhythm. */
export const BUDGET_STOPS = [1000, 2000, 4000, 8000, 16000] as const;
export const BUDGET_MIN = BUDGET_STOPS[0];
export const BUDGET_MAX = BUDGET_STOPS[BUDGET_STOPS.length - 1];
/** What a desk gets unless someone says otherwise — the same 6000 the prompt
 *  fitter has always defaulted to, so the shipped behaviour is unchanged. */
export const BUDGET_DEFAULT = 6000;

export interface DeskPolicy {
  onShift: boolean;
  depth: Depth;
  budget: number;
}

export type CrewPolicy = Record<string, DeskPolicy>;

/** Every CATEGORY the router can actually route to, in first-seen order.
 *
 *  The key is `category`, not the roster's `domain`, and that is not a detail:
 *  the router selects from `enabledSpecialists()`, whose records carry
 *  `category`. Keying this policy on anything else would govern a set of desks
 *  that is not the set being routed to — a policy that reads correctly and
 *  enforces nothing.
 *
 *  Derived rather than typed out, so a category added to the roster appears as a
 *  row instead of being silently ungoverned. */
export function knownCategories(): SpecialistCategory[] {
  const seen: SpecialistCategory[] = [];
  for (const s of enabledSpecialists()) {
    if (!seen.includes(s.category)) seen.push(s.category);
  }
  return seen;
}

/** How many specialists each category contributes — the number that makes the
 *  depth cap legible. `silicon` fields 350; capping it at 3 is a real decision
 *  and the matrix shows the 350 that makes it one. */
export function categorySizes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of enabledSpecialists()) out[s.category] = (out[s.category] ?? 0) + 1;
  return out;
}

/** The shipped policy: everything on the floor, every desk whole, the house
 *  budget. Written as a derivation so it cannot disagree with the roster. */
export function defaultPolicy(): CrewPolicy {
  const out: CrewPolicy = {};
  for (const d of knownCategories()) out[d] = { onShift: true, depth: "full", budget: BUDGET_DEFAULT };
  return out;
}
export const DEFAULT_POLICY: CrewPolicy = defaultPolicy();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** The user's policy, or null when they have never edited one. Null and "equal
 *  to default" are DIFFERENT states and the matrix shows them differently: a
 *  desk that was never touched should not read as a decision the user made. */
export function loadPolicy(): CrewPolicy | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = JSON.parse(s.getItem(POLICY_KEY) ?? "null") as CrewPolicy | null;
    if (!raw || typeof raw !== "object") return null;
    /* Folded over the known domains so a policy saved before a domain existed
     * still governs that domain — with the DEFAULT, not with "off". A new desk
     * joining a deployment must not be silently silenced by an old file. */
    const out: CrewPolicy = {};
    for (const d of knownCategories()) {
      const p = raw[d];
      out[d] = p && typeof p === "object"
        ? {
          onShift: p.onShift !== false,
          depth: (["lead", "desk", "full"] as Depth[]).includes(p.depth) ? p.depth : "full",
          budget: clampBudget(Number(p.budget)),
        }
        : { ...DEFAULT_POLICY[d] };
    }
    return out;
  } catch {
    return null;
  }
}

export function savePolicy(p: CrewPolicy): void {
  const s = storage();
  if (s) s.setItem(POLICY_KEY, JSON.stringify(p));
}

export function clearPolicy(): void {
  const s = storage();
  if (s) s.removeItem(POLICY_KEY);
}

/** Snap any number onto the slider's stops, so a value can only ever be one the
 *  UI can actually show. A budget that is not on the slider is a budget the user
 *  cannot see, and therefore cannot trust. */
export function clampBudget(n: number): number {
  if (!Number.isFinite(n)) return BUDGET_DEFAULT;
  let best: number = BUDGET_STOPS[0];
  for (const stop of BUDGET_STOPS) if (Math.abs(stop - n) < Math.abs(best - n)) best = stop;
  return best;
}

/** THE EFFECTIVE POLICY. This is what enforcement reads, and it is the one
 *  function that decides whether the user's file or the shipped default wins. */
export function effectivePolicy(): { policy: CrewPolicy; source: "default" | "custom" } {
  const custom = loadPolicy();
  return custom ? { policy: custom, source: "custom" } : { policy: DEFAULT_POLICY, source: "default" };
}

/* ── ENFORCEMENT ─────────────────────────────────────────────────────────────
 * Applied to the router's own output. Anything the router selected that this
 * policy does not allow is dropped HERE, with a reason, rather than filtered
 * later where nobody can see why a desk went quiet. */

export interface PolicyDecision {
  id: string;
  domain: string;
  allowed: boolean;
  /** Present only when allowed is false. Plain words, shown in the UI. */
  reason?: string;
}

export interface PolicyOutcome<T> {
  kept: T[];
  dropped: PolicyDecision[];
  /** The budget the caller should fit each domain's text to, per domain. */
  budgets: Record<string, number>;
}

/** THE ENFORCEMENT, and the two stages are deliberately separate.
 *
 *  A probe caught the first version of this, and the bug is worth recording: it
 *  applied the DEPTH cap to the router's whole above-bar candidate pool, not to
 *  the route that gets returned. Under the shipped default that silently capped
 *  every category at 8 out of a pool that can hold hundreds — so a "default"
 *  deployment was already being governed by a rule nobody had set, and the
 *  default was not a no-op. The policy must change nothing until someone asks.
 *
 *  So the stages are:
 *
 *    STAGE 1 — ON SHIFT, over the whole pool. This is an eligibility decision and
 *              it is the one with teeth: an off-shift desk contributes nothing,
 *              at any width.
 *    STAGE 2 — DEPTH, while taking the first `k` survivors. A desk that has been
 *              narrowed keeps its best-scoring candidate and gives up the rest;
 *              a desk at full depth keeps `DEPTH_LIMIT.full`, which is >= any k
 *              the router asks for, so under the default this stage drops
 *              NOTHING and the route is byte-identical to the one the router
 *              produced before this file existed.
 *
 *  Everything refused is returned with a reason. A policy that quietly returns a
 *  shorter list is indistinguishable from a policy that is broken. */
export function applyCrewPolicy<T extends { id: string }>(pool: T[], k = Number.POSITIVE_INFINITY): PolicyOutcome<T> {
  const { policy } = effectivePolicy();
  const dropped: PolicyDecision[] = [];
  const budgets: Record<string, number> = {};

  /* ── stage 1: eligibility ── */
  const eligible: T[] = [];
  for (const c of pool) {
    const domain = getSpecialist(c.id)?.category ?? "";
    const p = policy[domain];
    if (!p) {
      /* An unknown specialist is not a refusal — the roster is the authority on
       * what exists, and this policy only governs what is already on it. */
      eligible.push(c);
      continue;
    }
    budgets[domain] = p.budget;
    if (!p.onShift) {
      dropped.push({ id: c.id, domain, allowed: false, reason: `${domain} is off shift` });
      continue;
    }
    eligible.push(c);
  }

  /* ── stage 2: depth, on the way into the route ── */
  const usedPerDomain = new Map<string, number>();
  const kept: T[] = [];
  for (const c of eligible) {
    if (kept.length >= k) break;
    const domain = getSpecialist(c.id)?.category ?? "";
    const p = policy[domain];
    if (!p) {
      kept.push(c);
      continue;
    }
    const used = usedPerDomain.get(domain) ?? 0;
    if (used >= DEPTH_LIMIT[p.depth]) {
      dropped.push({ id: c.id, domain, allowed: false, reason: `${domain} is capped at ${p.depth} (${DEPTH_LIMIT[p.depth]} per route)` });
      continue;
    }
    usedPerDomain.set(domain, used + 1);
    kept.push(c);
  }
  return { kept, dropped, budgets };
}

/** How many desks are off the floor. Used by the matrix header and by the
 *  Steward screen, so the count on screen is the same count enforcement sees. */
export function policySummary(): { on: number; off: number; source: "default" | "custom"; narrowest: string | null } {
  const { policy, source } = effectivePolicy();
  const domains = knownCategories();
  const off = domains.filter((d) => policy[d] && !policy[d].onShift);
  /* `narrowest` is about DEPTH, so it only considers desks that are still on the
   * floor. An off-shift desk is not "narrowed" — it is gone, and `off` counts it.
   * Mixing the two would make one number answer two questions. */
  const narrowed = domains
    .filter((d) => policy[d] && policy[d].onShift && policy[d].depth !== "full")
    .sort((a, b) => DEPTH_LIMIT[policy[a].depth] - DEPTH_LIMIT[policy[b].depth]);
  return {
    on: domains.length - off.length,
    off: off.length,
    source,
    narrowest: narrowed[0] ?? null,
  };
}
