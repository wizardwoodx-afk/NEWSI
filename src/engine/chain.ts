/**
 * SelfImpulse — THE COMPANY CHAIN. One place, no duplicates.
 *
 * The product is organised like a company: five rungs and one law.
 *
 *   USER  ⇄  CAPTAIN  ⇄  CONSUL   ⇄  ADEPT      ⇄  CREW
 *   owner    the CEO     domain       desk's        the sub-agents
 *                        manager      team lead     that do the work
 *
 * THE LAW — no rung is ever skipped. A message moves exactly one rung up (a
 * report) or one rung down (a brief). So a Consul can never address the user
 * or a sub-agent, the Captain can never brief an Adept, and the user can never
 * reach the crew. Peers on one rung coordinate through the rung above them,
 * never sideways.
 *
 * This module is a LEAF (it imports nothing), so org / captains / workspace /
 * generalist and the UI all derive their wording AND their rule from it:
 *
 *   • TITLES is the single source of the layer names. Renaming a rung is a
 *     one-line change here; no surface hard-codes a title.
 *   • mayAddress / assertMayAddress / legalPath ARE the law — pure, testable.
 *   • workspace.ts refuses to seat a desk whose Consul is missing: an Adept
 *     with no Consul above it would make the Captain brief an Adept directly,
 *     which is a skipped rung. That refusal is a LayerSkipError, not a log line.
 *
 * What this module does NOT claim: it does not say an LLM message crossed each
 * rung on every run. It is the reporting structure the run is seated in, and
 * the rule any hop in that structure must obey.
 */

export const RUNGS = ["user", "captain", "consul", "adept", "crew"] as const;
export type Rung = (typeof RUNGS)[number];

/** The names of the four seats the product staffs (the user is the owner, not a seat). */
export const TITLES = {
  captain: "Captain",
  consul: "Consul",
  adept: "Adept",
  crew: "Sub-agent",
} as const;

/** What each rung may do, in one line — the doctrine the prompts and the docs share. */
export const ROLES: Record<Rung, string> = {
  user: "the owner — speaks only with the Captain",
  captain: "the CEO — the only seat that speaks with the user; briefs and hears only its Consuls",
  consul: "owns one domain — reports up to the Captain, briefs down to its Adepts; never the user, never the crew",
  adept: "the desk's team lead — leads the sub-agent crew and reports to its Consul",
  crew: "the sub-agents that do the work — answer to their Adept alone",
};

export function rungLabel(r: Rung): string {
  return r === "user" ? "user" : TITLES[r];
}

export function rungIndex(r: Rung): number {
  return RUNGS.indexOf(r);
}

/** Every rung a message must pass between two seats, endpoints included, in travel order. */
export function legalPath(from: Rung, to: Rung): Rung[] {
  const a = rungIndex(from);
  const b = rungIndex(to);
  const step = a <= b ? 1 : -1;
  const out: Rung[] = [];
  for (let i = a; i !== b; i += step) out.push(RUNGS[i]);
  out.push(RUNGS[b]);
  return out;
}

/** THE LAW: exactly one rung, either direction. Same-rung and skipped-rung are both refused. */
export function mayAddress(from: Rung, to: Rung): boolean {
  return Math.abs(rungIndex(from) - rungIndex(to)) === 1;
}

export class LayerSkipError extends Error {
  readonly from: Rung;
  readonly to: Rung;
  constructor(from: Rung, to: Rung, detail?: string) {
    super(LayerSkipError.explain(from, to, detail));
    this.name = "LayerSkipError";
    this.from = from;
    this.to = to;
  }
  static explain(from: Rung, to: Rung, detail?: string): string {
    const head = from === to
      ? `peers on the ${rungLabel(from)} rung coordinate through the rung above them, never sideways`
      : `the ${rungLabel(from)} cannot address the ${rungLabel(to)} directly — the message must travel ${legalPath(from, to).map(rungLabel).join(" → ")}`;
    return detail ? `${head} (${detail})` : head;
  }
}

/** Throws LayerSkipError unless the hop is exactly one rung. */
export function assertMayAddress(from: Rung, to: Rung): void {
  if (!mayAddress(from, to)) throw new LayerSkipError(from, to);
}

/** A whole reporting line (e.g. captain → consul → adept → crew): every consecutive hop must obey the law. */
export function assertChain(line: readonly Rung[]): void {
  for (let i = 1; i < line.length; i++) assertMayAddress(line[i - 1], line[i]);
}
