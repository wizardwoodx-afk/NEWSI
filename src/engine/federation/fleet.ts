/**
 * FEDERATION · FLEET — one honest count (19.6.2).
 *
 * THE CLAIM THIS FILE EXISTS TO MAKE FALSIFIABLE.
 *
 *   "2,140 specialists" is a marketing sentence until someone can say which
 *   ones are wired and which ones are catalogued. So the fleet is reported in
 *   two numbers that are always both printed:
 *
 *       established   1,500   routed by the Generalist today (the 19.7.2.1 bench)
 *       registered      640   specified, catalogued, counted — not yet routed
 *       ────────────────────
 *       fleet         2,140
 *
 *   Registered, in turn, is four benches a reader can check separately:
 *
 *       reach batch (19.5.6)        200   40 industry domains × 5 stations
 *       federation batch (19.6.0)   210   42 practice domains × 5 stations
 *       regulated batch (19.6.2)    230   46 regulated-field domains × 5 stations
 *
 * `established` is not "better" and `registered` is not a euphemism for
 * "missing": every registered specialist carries capabilities, routing
 * vocabulary, an honest risk tier and a real system prompt, and
 * `probe/fedFleet.test.ts` asserts that entry by entry. What it does NOT carry
 * is a claim of runtime execution depth — and this module never makes one.
 *
 * Wiring is the owner's decision, and it is ONE spread:
 *
 *     // src/engine/registry.ts
 *     import { FLEET_SPECIALISTS } from "./federation/fleet";
 *     export const SPECIALISTS: Specialist[] = [...existing, ...FLEET_SPECIALISTS];
 *
 * until then `routedFleet()` returns the established bench, so no surface can
 * accidentally route into a bench the owner has not switched on.
 */
import type { Specialist } from "../types";
import { SPECIALISTS } from "../registry";
import { REACH_BATCH_SPECIALISTS } from "../reach/reachBatch";
import { FEDERATION_BATCH_SPECIALISTS } from "./federationBatch";
import { REGULATED_BATCH_SPECIALISTS } from "./regulatedBatch";

/** The five benches, named, so a reader can see where each number comes from. */
export const ESTABLISHED_SPECIALISTS: Specialist[] = SPECIALISTS;
export const REACH_REGISTERED: Specialist[] = REACH_BATCH_SPECIALISTS;
export const FEDERATION_REGISTERED: Specialist[] = FEDERATION_BATCH_SPECIALISTS;
export const REGULATED_REGISTERED: Specialist[] = REGULATED_BATCH_SPECIALISTS;

/** Everything the fleet holds, wired or not. */
export const FLEET_SPECIALISTS: Specialist[] = [
  ...ESTABLISHED_SPECIALISTS,
  ...REACH_REGISTERED,
  ...FEDERATION_REGISTERED,
  ...REGULATED_REGISTERED,
];

export const ESTABLISHED_SIZE = ESTABLISHED_SPECIALISTS.length;
export const REACH_REGISTERED_SIZE = REACH_REGISTERED.length;
export const FEDERATION_REGISTERED_SIZE = FEDERATION_REGISTERED.length;
export const REGULATED_REGISTERED_SIZE = REGULATED_REGISTERED.length;
export const REGISTERED_SIZE = REACH_REGISTERED_SIZE + FEDERATION_REGISTERED_SIZE + REGULATED_REGISTERED_SIZE;
export const FLEET_SIZE = FLEET_SPECIALISTS.length;

export interface FleetClaim {
  established: number;
  registered: number;
  fleet: number;
  /** How many are actually fielded today. */
  routed: number;
  /**
   * The sentence a surface may print. It LEADS with the routed number, adds the
   * registered bench, and only then gives the total — because "2,140 active
   * specialists" is the reading this product must never invite. Ordering is
   * part of the claim, not decoration.
   */
  sentence: string;
}

/**
 * The only shape in which the fleet count may be stated. There is deliberately
 * no function that returns a bare total: a caller that wants "2,140" gets the
 * breakdown with it, because the breakdown is the honest part.
 */
export function fleetClaim(): FleetClaim {
  return {
    established: ESTABLISHED_SIZE,
    registered: REGISTERED_SIZE,
    fleet: FLEET_SIZE,
    routed: ESTABLISHED_SIZE,
    sentence: `${ESTABLISHED_SIZE.toLocaleString("en-US")} established specialists + ${REGISTERED_SIZE.toLocaleString("en-US")} registered specialists — ${FLEET_SIZE.toLocaleString("en-US")} catalogued, ${ESTABLISHED_SIZE.toLocaleString("en-US")} routed today`,
  };
}

/** What the router may actually route to, until the owner wires the registered benches in. */
export function routedFleet(): Specialist[] {
  const wired = new Set(SPECIALISTS.map((s) => s.id));
  return FLEET_SPECIALISTS.filter((s) => wired.has(s.id));
}

/** Ids that exist in the catalog but are not routed — the gap, named not hidden. */
export function unroutedIds(): string[] {
  const wired = new Set(SPECIALISTS.map((s) => s.id));
  return FLEET_SPECIALISTS.filter((s) => !wired.has(s.id)).map((s) => s.id);
}

export interface FleetBreakdown {
  byProvenance: Record<string, number>;
  byCategory: Record<string, number>;
  byRisk: Record<string, number>;
  duplicates: string[];
}

/** Composition of the whole fleet, with duplicate ids REPORTED rather than de-duplicated away. */
export function fleetBreakdown(): FleetBreakdown {
  const byProvenance: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byRisk: Record<string, number> = {};
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const s of FLEET_SPECIALISTS) {
    byProvenance[s.provenance] = (byProvenance[s.provenance] ?? 0) + 1;
    byCategory[s.category] = (byCategory[s.category] ?? 0) + 1;
    byRisk[s.riskTier] = (byRisk[s.riskTier] ?? 0) + 1;
    if (seen.has(s.id)) duplicates.push(s.id);
    seen.add(s.id);
  }
  return { byProvenance, byCategory, byRisk, duplicates };
}
