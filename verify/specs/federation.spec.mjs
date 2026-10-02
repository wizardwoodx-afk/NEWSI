import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/engine/reach/batchSpec.ts
var REACH_BATCH_STATIONS = ["assess", "design", "build", "verify", "sustain"];
var STATION_RISK = {
  assess: "safe",
  design: "safe",
  build: "risky",
  verify: "safe",
  sustain: "critical"
};
var STATION_TITLE = {
  assess: "Assessor",
  design: "Architect",
  build: "Builder",
  verify: "Verifier",
  sustain: "Steward"
};
var STATION_KEYWORD = {
  assess: "assessment",
  design: "design",
  build: "build",
  verify: "verification",
  sustain: "sustainment"
};
var STATION_CAPABILITIES = {
  assess: (d) => [
    `Sizes up ${d} before anything changes: current state, constraints and the questions the work depends on`,
    `Reports ${d} findings as measurements with their source, and names what could not be measured`
  ],
  design: (d) => [
    `Chooses the approach for ${d} work and states its trade-offs against the alternatives it rejected`,
    `Turns ${d} requirements into a plan with explicit assumptions and a stated failure mode`
  ],
  build: (d) => [
    `Implements ${d} changes one step at a time, checking the effect of each before starting the next`,
    `Keeps ${d} work inside the granted capability set and stops at the boundary rather than negotiating it`
  ],
  verify: (d) => [
    `Re-derives ${d} claims from artefacts rather than summaries, and states the check that could have failed`,
    `Reviews ${d} output independently of the seat that produced it, and refuses to grade its own work`
  ],
  sustain: (d) => [
    `Keeps ${d} running: watches for drift and degradation, and names the signal before it becomes an outage`,
    `Handles ${d} recovery with a written handover to a human at every irreversible step`
  ]
};
var STATION_PROMPTS = {
  assess: (d, m) => `You assess ${d}: ${m}. Measure before you move. Report state as found, cite the reading you actually took, and say plainly which questions you could not answer with the evidence available.`,
  design: (d, m) => `You design for ${d}: ${m}. Every design names its assumptions, its rejected alternative and the condition under which it should be abandoned. A design without a stated failure mode is not finished.`,
  build: (d, m) => `You build in ${d}: ${m}. Work in the smallest change that produces a checkable effect, verify that effect, then continue. You never exceed the capabilities you were granted, and you stop and ask rather than widen your own scope.`,
  verify: (d, m) => `You verify ${d}: ${m}. You did not write this work and you are not here to approve it; re-derive the claim from the artefact, state what would have made you fail it, and record your verdict with its evidence.`,
  sustain: (d, m) => `You sustain ${d}: ${m}. Production is the patient. Watch for drift, degrade honestly, and hand over to a human at every irreversible step with a status a person can act on without reading the logs.`
};

// src/engine/federation/batchKit.ts
function batchEntryId(domain, station) {
  return `${domain.slug}.${station}`;
}
function buildBatch(domains, provenance) {
  const out = [];
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
        provenance
      });
    }
  }
  return out;
}
function censusOf(entries) {
  const byRisk = { safe: 0, risky: 0, critical: 0 };
  const byStation = { assess: 0, design: 0, build: 0, verify: 0, sustain: 0 };
  const byCategory = {};
  const domains = /* @__PURE__ */ new Set();
  for (const e of entries) {
    byRisk[e.riskTier] += 1;
    const suffix = e.id.split(".").pop() ?? "";
    if (REACH_BATCH_STATIONS.includes(suffix)) {
      byStation[suffix] += 1;
      domains.add(e.id.slice(0, e.id.length - suffix.length - 1));
    }
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  return { total: entries.length, byRisk, byStation, byCategory, domains: domains.size };
}

// src/engine/federation/federationSpec.ts
var FEDERATION_BATCH_PROVENANCE = "si-19.6-federation";
var FEDERATION_BATCH_DOMAINS = [
  {
    slug: "quantum-software",
    name: "Quantum Software",
    category: "code",
    mission: "circuit design and error-aware programming against hardware that is not yet quiet",
    keywords: ["quantum", "circuit", "qubit", "error-correction"]
  },
  {
    slug: "kernel-systems",
    name: "Kernel & Systems",
    category: "code",
    mission: "syscalls, scheduling and memory behaviour where a wrong assumption is a crash at 3am",
    keywords: ["kernel", "syscall", "scheduler", "memory"]
  },
  {
    slug: "compiler-engineering",
    name: "Compiler Engineering",
    category: "code",
    mission: "parsing, lowering and optimising with a semantics that must not drift from the spec",
    keywords: ["compiler", "parser", "ir", "optimizer"]
  },
  {
    slug: "supply-chain-security",
    name: "Supply Chain Security",
    category: "security",
    mission: "dependency provenance, SBOM truth and build integrity across a supply chain you do not control",
    keywords: ["sbom", "dependency", "provenance", "build-integrity"]
  },
  {
    slug: "zero-trust",
    name: "Zero Trust Architecture",
    category: "security",
    mission: "identity-first segmentation where no network position confers trust",
    keywords: ["zero-trust", "segmentation", "identity", "least-privilege"]
  },
  {
    slug: "hardware-security",
    name: "Hardware Security",
    category: "security",
    mission: "secure elements, attestation and physical attack surface on silicon you ship",
    keywords: ["secure-element", "attestation", "tamper", "root-of-trust"]
  },
  {
    slug: "chaos-engineering",
    name: "Chaos Engineering",
    category: "testing",
    mission: "deliberate failure injection with a hypothesis, a blast radius and an exit",
    keywords: ["chaos", "fault-injection", "blast-radius", "hypothesis"]
  },
  {
    slug: "performance-testing",
    name: "Performance Testing",
    category: "testing",
    mission: "load, latency budgets and saturation behaviour measured against a stated envelope",
    keywords: ["load", "latency", "saturation", "throughput"]
  },
  {
    slug: "accessibility-testing",
    name: "Accessibility Testing",
    category: "testing",
    mission: "assistive-technology verification against WCAG, with the failures a person would hit",
    keywords: ["wcag", "screen-reader", "contrast", "keyboard"]
  },
  {
    slug: "architecture-review",
    name: "Architecture Review",
    category: "review",
    mission: "reading a system for the decisions that are expensive to reverse",
    keywords: ["architecture", "adr", "coupling", "reversibility"]
  },
  {
    slug: "model-review",
    name: "Model Review",
    category: "review",
    mission: "evaluating model output and evaluation design for claims that can actually fail",
    keywords: ["eval", "benchmark", "regression", "contamination"]
  },
  {
    slug: "contract-review",
    name: "Contract Review",
    category: "review",
    mission: "reading obligations, liabilities and termination before the ink is dry",
    keywords: ["contract", "clause", "liability", "termination"]
  },
  {
    slug: "data-engineering",
    name: "Data Engineering",
    category: "data",
    mission: "pipelines, lineage and schema evolution where a silent backfill is an incident",
    keywords: ["pipeline", "lineage", "backfill", "schema"]
  },
  {
    slug: "geospatial-data",
    name: "Geospatial Data",
    category: "data",
    mission: "coordinates, projections and spatial joins where the wrong datum moves a boundary",
    keywords: ["geospatial", "projection", "datum", "spatial-join"]
  },
  {
    slug: "time-series",
    name: "Time-Series Analytics",
    category: "data",
    mission: "retention, downsampling and anomaly detection over streams that never stop",
    keywords: ["timeseries", "downsample", "anomaly", "retention"]
  },
  {
    slug: "platform-engineering",
    name: "Platform Engineering",
    category: "devops",
    mission: "golden paths and self-service that make the compliant route the easy one",
    keywords: ["platform", "golden-path", "self-service", "idp"]
  },
  {
    slug: "observability",
    name: "Observability",
    category: "devops",
    mission: "traces, metrics and logs that answer a question rather than fill a disk",
    keywords: ["tracing", "metrics", "slo", "cardinality"]
  },
  {
    slug: "edge-computing",
    name: "Edge Computing",
    category: "devops",
    mission: "placement, sync and degraded operation for compute that is far from the datacentre",
    keywords: ["edge", "placement", "sync", "offline-first"]
  },
  {
    slug: "scientific-computing",
    name: "Scientific Computing",
    category: "research",
    mission: "numerical methods and reproducibility where a floating-point choice changes a conclusion",
    keywords: ["numerical", "floating-point", "reproducibility", "solver"]
  },
  {
    slug: "materials-research",
    name: "Materials Research",
    category: "research",
    mission: "structure-property evidence across samples that cannot be re-made",
    keywords: ["materials", "alloy", "characterisation", "property"]
  },
  {
    slug: "genomics",
    name: "Genomics",
    category: "research",
    mission: "variant calling and cohort analysis under consent that travels with the data",
    keywords: ["genomics", "variant", "cohort", "consent"]
  },
  {
    slug: "technical-writing",
    name: "Technical Writing",
    category: "writing",
    mission: "documentation that answers the question the reader has, in their order",
    keywords: ["documentation", "reference", "tutorial", "changelog"]
  },
  {
    slug: "curriculum-design",
    name: "Curriculum Design",
    category: "writing",
    mission: "learning sequences with stated outcomes and honest assessment",
    keywords: ["curriculum", "outcome", "assessment", "scaffold"]
  },
  {
    slug: "localization",
    name: "Localization",
    category: "writing",
    mission: "translation and cultural adaptation where the layout breaks before the meaning does",
    keywords: ["localization", "translation", "locale", "i18n"]
  },
  {
    slug: "financial-modelling",
    name: "Financial Modelling",
    category: "analysis",
    mission: "forecasts whose assumptions are visible enough to be argued with",
    keywords: ["model", "forecast", "assumption", "sensitivity"]
  },
  {
    slug: "risk-analysis",
    name: "Risk Analysis",
    category: "analysis",
    mission: "likelihood, impact and the tail nobody wants to fund",
    keywords: ["risk", "likelihood", "impact", "tail"]
  },
  {
    slug: "operations-research",
    name: "Operations Research",
    category: "analysis",
    mission: "scheduling, routing and allocation where an optimal answer must be explainable",
    keywords: ["optimization", "scheduling", "allocation", "heuristic"]
  },
  {
    slug: "service-design",
    name: "Service Design",
    category: "design",
    mission: "the whole journey, including the parts that happen on paper and on the phone",
    keywords: ["service", "journey", "touchpoint", "blueprint"]
  },
  {
    slug: "industrial-design",
    name: "Industrial Design",
    category: "design",
    mission: "form, tolerance and manufacturability decided together",
    keywords: ["industrial", "tolerance", "dfm", "enclosure"]
  },
  {
    slug: "motion-design",
    name: "Motion Design",
    category: "design",
    mission: "timing and easing that explain a change instead of decorating it",
    keywords: ["motion", "easing", "timing", "reduced-motion"]
  },
  {
    slug: "api-product",
    name: "API Product",
    category: "product",
    mission: "contracts, versioning and deprecation as a product surface with customers on it",
    keywords: ["api", "versioning", "deprecation", "sdk"]
  },
  {
    slug: "developer-experience",
    name: "Developer Experience",
    category: "product",
    mission: "time-to-first-success measured in minutes, and the friction that steals them",
    keywords: ["dx", "onboarding", "friction", "docs"]
  },
  {
    slug: "marketplace-product",
    name: "Marketplace Product",
    category: "product",
    mission: "two-sided incentives, cold start and the trust that makes matching worth doing",
    keywords: ["marketplace", "liquidity", "incentive", "trust"]
  },
  {
    slug: "revenue-operations",
    name: "Revenue Operations",
    category: "business",
    mission: "pipeline truth and forecast discipline where optimism is a defect",
    keywords: ["revenue", "pipeline", "forecast", "crm"]
  },
  {
    slug: "partnerships",
    name: "Partnerships",
    category: "business",
    mission: "alliances with explicit value exchange and an exit that is not a scandal",
    keywords: ["partnership", "alliance", "value-exchange", "exit"]
  },
  {
    slug: "procurement",
    name: "Procurement",
    category: "business",
    mission: "sourcing, vendor risk and terms that survive the second year",
    keywords: ["procurement", "vendor", "terms", "risk"]
  },
  {
    slug: "privacy-law",
    name: "Privacy Law",
    category: "legal",
    mission: "data minimisation, lawful basis and the transfer question nobody enjoys",
    keywords: ["privacy", "gdpr", "lawful-basis", "transfer"]
  },
  {
    slug: "intellectual-property",
    name: "Intellectual Property",
    category: "legal",
    mission: "ownership of code, marks and inventions before it becomes a dispute",
    keywords: ["ip", "patent", "trademark", "ownership"]
  },
  {
    slug: "export-control",
    name: "Export Control",
    category: "legal",
    mission: "jurisdiction, classification and the licence that decides who may receive what",
    keywords: ["export", "classification", "licence", "jurisdiction"]
  },
  {
    slug: "internal-comms",
    name: "Internal Communications",
    category: "comms",
    mission: "the message everyone actually reads, said once and said honestly",
    keywords: ["internal", "memo", "announcement", "clarity"]
  },
  {
    slug: "investor-relations",
    name: "Investor Relations",
    category: "comms",
    mission: "disclosure that is complete, timely and free of spin",
    keywords: ["investor", "disclosure", "guidance", "materiality"]
  },
  {
    slug: "developer-relations",
    name: "Developer Relations",
    category: "comms",
    mission: "advocacy that tells the truth about the product, including its edges",
    keywords: ["devrel", "advocacy", "community", "sample"]
  }
];
function federationEntryId(domain, station) {
  return batchEntryId(domain, station);
}
function buildFederationBatch() {
  return buildBatch(FEDERATION_BATCH_DOMAINS, FEDERATION_BATCH_PROVENANCE);
}
function federationBatchCensus(entries) {
  return censusOf(entries);
}
export {
  FEDERATION_BATCH_DOMAINS,
  FEDERATION_BATCH_PROVENANCE,
  REACH_BATCH_STATIONS,
  buildFederationBatch,
  federationBatchCensus,
  federationEntryId
};
