/**
 * FEDERATION · BATCH SPEC — 42 domains × 5 stations, 210 specialists (19.6).
 *
 * This is the fourth bench and the second generated one. The 19.5.6-reach
 * batch covered forty *industry* domains; this batch covers forty-two
 * *engineering, practice and professional* domains — the work that shows up
 * when a fleet with hands is asked to build, harden, prove, publish and
 * govern rather than merely answer.
 *
 * It deliberately reuses the station vocabulary from `reach/batchSpec`
 * (assess / design / build / verify / sustain) instead of inventing a second
 * one: two fleets that describe work differently are two fleets that cannot be
 * routed together, and the whole point of this release is routing.
 *
 * Provenance for every entry: "si-19.6-federation". The batch is reported
 * through `federation/fleet.ts`, which is what makes the public count honest:
 *
 *     SPECIALISTS (established)      1,500
 *   + reach batch (registered)         200
 *   + federation batch (registered)    210
 *   = fleet                            2,140   — 1,500 established, 640 registered
 *
 * "Registered" is not a demotion dressed as a promotion: an established
 * specialist is wired into the router; a registered one is fully specified,
 * routable when the owner wires it, and counted truthfully either way.
 */
import type { Specialist, SpecialistCategory } from "../types";
import { REACH_BATCH_STATIONS } from "../reach/batchSpec";
import {
  buildBatch, censusOf, batchEntryId,
  type BatchCensus, type BatchDomain, type ReachStation,
} from "./batchKit";

export const FEDERATION_BATCH_PROVENANCE = "si-19.6-federation";

/* Re-exported so the generator can name the stations without a second
   entry point — one source for the station vocabulary, deliberately. */
export { REACH_BATCH_STATIONS };

/**
 * The published name for a domain in this batch. Structurally the shared
 * `BatchDomain` — kept as its own alias because probes and the generator import
 * this name, and renaming a published type to save one line is not a cleanup.
 */
export type FederationBatchDomain = BatchDomain;
export type { SpecialistCategory };

/* Three domains for each of the fourteen categories the fleet already uses —
   so this batch widens the bench without inventing a taxonomy. */
export const FEDERATION_BATCH_DOMAINS: FederationBatchDomain[] = [
  { slug: "quantum-software", name: "Quantum Software", category: "code",
    mission: "circuit design and error-aware programming against hardware that is not yet quiet",
    keywords: ["quantum", "circuit", "qubit", "error-correction"] },
  { slug: "kernel-systems", name: "Kernel & Systems", category: "code",
    mission: "syscalls, scheduling and memory behaviour where a wrong assumption is a crash at 3am",
    keywords: ["kernel", "syscall", "scheduler", "memory"] },
  { slug: "compiler-engineering", name: "Compiler Engineering", category: "code",
    mission: "parsing, lowering and optimising with a semantics that must not drift from the spec",
    keywords: ["compiler", "parser", "ir", "optimizer"] },

  { slug: "supply-chain-security", name: "Supply Chain Security", category: "security",
    mission: "dependency provenance, SBOM truth and build integrity across a supply chain you do not control",
    keywords: ["sbom", "dependency", "provenance", "build-integrity"] },
  { slug: "zero-trust", name: "Zero Trust Architecture", category: "security",
    mission: "identity-first segmentation where no network position confers trust",
    keywords: ["zero-trust", "segmentation", "identity", "least-privilege"] },
  { slug: "hardware-security", name: "Hardware Security", category: "security",
    mission: "secure elements, attestation and physical attack surface on silicon you ship",
    keywords: ["secure-element", "attestation", "tamper", "root-of-trust"] },

  { slug: "chaos-engineering", name: "Chaos Engineering", category: "testing",
    mission: "deliberate failure injection with a hypothesis, a blast radius and an exit",
    keywords: ["chaos", "fault-injection", "blast-radius", "hypothesis"] },
  { slug: "performance-testing", name: "Performance Testing", category: "testing",
    mission: "load, latency budgets and saturation behaviour measured against a stated envelope",
    keywords: ["load", "latency", "saturation", "throughput"] },
  { slug: "accessibility-testing", name: "Accessibility Testing", category: "testing",
    mission: "assistive-technology verification against WCAG, with the failures a person would hit",
    keywords: ["wcag", "screen-reader", "contrast", "keyboard"] },

  { slug: "architecture-review", name: "Architecture Review", category: "review",
    mission: "reading a system for the decisions that are expensive to reverse",
    keywords: ["architecture", "adr", "coupling", "reversibility"] },
  { slug: "model-review", name: "Model Review", category: "review",
    mission: "evaluating model output and evaluation design for claims that can actually fail",
    keywords: ["eval", "benchmark", "regression", "contamination"] },
  { slug: "contract-review", name: "Contract Review", category: "review",
    mission: "reading obligations, liabilities and termination before the ink is dry",
    keywords: ["contract", "clause", "liability", "termination"] },

  { slug: "data-engineering", name: "Data Engineering", category: "data",
    mission: "pipelines, lineage and schema evolution where a silent backfill is an incident",
    keywords: ["pipeline", "lineage", "backfill", "schema"] },
  { slug: "geospatial-data", name: "Geospatial Data", category: "data",
    mission: "coordinates, projections and spatial joins where the wrong datum moves a boundary",
    keywords: ["geospatial", "projection", "datum", "spatial-join"] },
  { slug: "time-series", name: "Time-Series Analytics", category: "data",
    mission: "retention, downsampling and anomaly detection over streams that never stop",
    keywords: ["timeseries", "downsample", "anomaly", "retention"] },

  { slug: "platform-engineering", name: "Platform Engineering", category: "devops",
    mission: "golden paths and self-service that make the compliant route the easy one",
    keywords: ["platform", "golden-path", "self-service", "idp"] },
  { slug: "observability", name: "Observability", category: "devops",
    mission: "traces, metrics and logs that answer a question rather than fill a disk",
    keywords: ["tracing", "metrics", "slo", "cardinality"] },
  { slug: "edge-computing", name: "Edge Computing", category: "devops",
    mission: "placement, sync and degraded operation for compute that is far from the datacentre",
    keywords: ["edge", "placement", "sync", "offline-first"] },

  { slug: "scientific-computing", name: "Scientific Computing", category: "research",
    mission: "numerical methods and reproducibility where a floating-point choice changes a conclusion",
    keywords: ["numerical", "floating-point", "reproducibility", "solver"] },
  { slug: "materials-research", name: "Materials Research", category: "research",
    mission: "structure-property evidence across samples that cannot be re-made",
    keywords: ["materials", "alloy", "characterisation", "property"] },
  { slug: "genomics", name: "Genomics", category: "research",
    mission: "variant calling and cohort analysis under consent that travels with the data",
    keywords: ["genomics", "variant", "cohort", "consent"] },

  { slug: "technical-writing", name: "Technical Writing", category: "writing",
    mission: "documentation that answers the question the reader has, in their order",
    keywords: ["documentation", "reference", "tutorial", "changelog"] },
  { slug: "curriculum-design", name: "Curriculum Design", category: "writing",
    mission: "learning sequences with stated outcomes and honest assessment",
    keywords: ["curriculum", "outcome", "assessment", "scaffold"] },
  { slug: "localization", name: "Localization", category: "writing",
    mission: "translation and cultural adaptation where the layout breaks before the meaning does",
    keywords: ["localization", "translation", "locale", "i18n"] },

  { slug: "financial-modelling", name: "Financial Modelling", category: "analysis",
    mission: "forecasts whose assumptions are visible enough to be argued with",
    keywords: ["model", "forecast", "assumption", "sensitivity"] },
  { slug: "risk-analysis", name: "Risk Analysis", category: "analysis",
    mission: "likelihood, impact and the tail nobody wants to fund",
    keywords: ["risk", "likelihood", "impact", "tail"] },
  { slug: "operations-research", name: "Operations Research", category: "analysis",
    mission: "scheduling, routing and allocation where an optimal answer must be explainable",
    keywords: ["optimization", "scheduling", "allocation", "heuristic"] },

  { slug: "service-design", name: "Service Design", category: "design",
    mission: "the whole journey, including the parts that happen on paper and on the phone",
    keywords: ["service", "journey", "touchpoint", "blueprint"] },
  { slug: "industrial-design", name: "Industrial Design", category: "design",
    mission: "form, tolerance and manufacturability decided together",
    keywords: ["industrial", "tolerance", "dfm", "enclosure"] },
  { slug: "motion-design", name: "Motion Design", category: "design",
    mission: "timing and easing that explain a change instead of decorating it",
    keywords: ["motion", "easing", "timing", "reduced-motion"] },

  { slug: "api-product", name: "API Product", category: "product",
    mission: "contracts, versioning and deprecation as a product surface with customers on it",
    keywords: ["api", "versioning", "deprecation", "sdk"] },
  { slug: "developer-experience", name: "Developer Experience", category: "product",
    mission: "time-to-first-success measured in minutes, and the friction that steals them",
    keywords: ["dx", "onboarding", "friction", "docs"] },
  { slug: "marketplace-product", name: "Marketplace Product", category: "product",
    mission: "two-sided incentives, cold start and the trust that makes matching worth doing",
    keywords: ["marketplace", "liquidity", "incentive", "trust"] },

  { slug: "revenue-operations", name: "Revenue Operations", category: "business",
    mission: "pipeline truth and forecast discipline where optimism is a defect",
    keywords: ["revenue", "pipeline", "forecast", "crm"] },
  { slug: "partnerships", name: "Partnerships", category: "business",
    mission: "alliances with explicit value exchange and an exit that is not a scandal",
    keywords: ["partnership", "alliance", "value-exchange", "exit"] },
  { slug: "procurement", name: "Procurement", category: "business",
    mission: "sourcing, vendor risk and terms that survive the second year",
    keywords: ["procurement", "vendor", "terms", "risk"] },

  { slug: "privacy-law", name: "Privacy Law", category: "legal",
    mission: "data minimisation, lawful basis and the transfer question nobody enjoys",
    keywords: ["privacy", "gdpr", "lawful-basis", "transfer"] },
  { slug: "intellectual-property", name: "Intellectual Property", category: "legal",
    mission: "ownership of code, marks and inventions before it becomes a dispute",
    keywords: ["ip", "patent", "trademark", "ownership"] },
  { slug: "export-control", name: "Export Control", category: "legal",
    mission: "jurisdiction, classification and the licence that decides who may receive what",
    keywords: ["export", "classification", "licence", "jurisdiction"] },

  { slug: "internal-comms", name: "Internal Communications", category: "comms",
    mission: "the message everyone actually reads, said once and said honestly",
    keywords: ["internal", "memo", "announcement", "clarity"] },
  { slug: "investor-relations", name: "Investor Relations", category: "comms",
    mission: "disclosure that is complete, timely and free of spin",
    keywords: ["investor", "disclosure", "guidance", "materiality"] },
  { slug: "developer-relations", name: "Developer Relations", category: "comms",
    mission: "advocacy that tells the truth about the product, including its edges",
    keywords: ["devrel", "advocacy", "community", "sample"] },
];

/** Deterministic slug — ids are `<domain>.<station>`, unique by construction. */
export function federationEntryId(domain: FederationBatchDomain, station: ReachStation): string {
  return batchEntryId(domain, station);
}

/** One implementation of the loop — see `batchKit.ts`. */
export function buildFederationBatch(): Specialist[] {
  return buildBatch(FEDERATION_BATCH_DOMAINS, FEDERATION_BATCH_PROVENANCE);
}

export type FederationBatchCensus = BatchCensus;

export function federationBatchCensus(entries: readonly Specialist[]): FederationBatchCensus {
  return censusOf(entries);
}
