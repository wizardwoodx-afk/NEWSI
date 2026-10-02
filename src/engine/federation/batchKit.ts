/**
 * FEDERATION · BATCH KIT — one implementation of "domains × stations → specialists".
 *
 * THREE REGISTERED BATCHES NOW USE THIS:
 *   · reach (19.5.6)      40 industry domains        → 200
 *   · federation (19.6.0) 42 practice domains        → 210
 *   · regulated (19.6.2)  46 regulated-field domains → 230
 *
 * Before this file existed, `federationSpec` carried its own copy of exactly
 * this loop. When a third batch arrived, copying it a third time would have
 * meant three places that decide what a specialist IS — three places to drift
 * apart on names, keywords, risk tiers or prompt shape. So the loop lives here
 * once, and each spec supplies only what is genuinely its own: a reviewed list
 * of domains.
 *
 * The station vocabulary itself is NOT here — it is imported from
 * `reach/batchSpec`, which remains the single source. Two fleets that describe
 * work differently are two fleets that cannot be routed together, and the whole
 * point of these benches is that they route together.
 *
 * Safety of this refactor: `federationSpec` now delegates to these functions,
 * and its generated snapshot (`federationBatch.ts`) is byte-identical before
 * and after — proved by `node tools/generate-batch.mjs federation --check`,
 * which fails on a single byte of drift.
 */
import type { RiskTier, Specialist, SpecialistCategory } from "../types";
import {
  REACH_BATCH_STATIONS, STATION_CAPABILITIES, STATION_KEYWORD, STATION_PROMPTS, STATION_RISK, STATION_TITLE,
  type ReachStation,
} from "../reach/batchSpec";

export type { ReachStation };

/** What a spec must say about each domain it adds. Nothing else is per-domain. */
export interface BatchDomain {
  slug: string;
  name: string;
  category: SpecialistCategory;
  /** One sentence of doctrine, woven into every station's system prompt. */
  mission: string;
  keywords: string[];
}

export interface BatchCensus {
  total: number;
  byRisk: Record<RiskTier, number>;
  byStation: Record<ReachStation, number>;
  byCategory: Partial<Record<SpecialistCategory, number>>;
  domains: number;
}

/** `<domain>.<station>` — the id shape every generated batch uses. */
export function batchEntryId(domain: BatchDomain, station: ReachStation): string {
  return `${domain.slug}.${station}`;
}

/** The stations, in the order a batch is compiled. */
export const BATCH_STATIONS = REACH_BATCH_STATIONS;

/**
 * Compile a reviewed domain list into specialists. Every field is derived from
 * the domain and the station: a spec cannot quietly give one entry a nicer
 * prompt or a lower risk tier than its station carries.
 */
export function buildBatch(domains: readonly BatchDomain[], provenance: string): Specialist[] {
  const out: Specialist[] = [];
  for (const domain of domains) {
    for (const station of REACH_BATCH_STATIONS) {
      out.push({
        id: batchEntryId(domain, station),
        name: `${domain.name} ${STATION_TITLE[station]}`,
        category: domain.category,
        capabilities: STATION_CAPABILITIES[station](domain.name),
        keywords: [...domain.keywords, STATION_KEYWORD[station]].sort(),
        riskTier: STATION_RISK[station],
        systemPrompt: STATION_PROMPTS[station](domain.name, domain.mission),
        provenance,
      });
    }
  }
  return out;
}

/** The census a generated snapshot's header quotes. Counted, never asserted. */
export function censusOf(entries: readonly Specialist[]): BatchCensus {
  const byRisk: Record<RiskTier, number> = { safe: 0, risky: 0, critical: 0 };
  const byStation = { assess: 0, design: 0, build: 0, verify: 0, sustain: 0 } as Record<ReachStation, number>;
  const byCategory: Partial<Record<SpecialistCategory, number>> = {};
  const domains = new Set<string>();
  for (const e of entries) {
    byRisk[e.riskTier] += 1;
    const suffix = e.id.split(".").pop() ?? "";
    if ((REACH_BATCH_STATIONS as readonly string[]).includes(suffix)) {
      byStation[suffix as ReachStation] += 1;
      domains.add(e.id.slice(0, e.id.length - suffix.length - 1));
    }
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  return { total: entries.length, byRisk, byStation, byCategory, domains: domains.size };
}
