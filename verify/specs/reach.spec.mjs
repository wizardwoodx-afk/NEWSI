import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/engine/reach/batchSpec.ts
var REACH_BATCH_PROVENANCE = "si-19.5.6-reach-batch";
var REACH_BATCH_DOMAINS = [
  {
    slug: "energy-systems",
    name: "Energy Systems",
    category: "devops",
    mission: "generation, transmission and load balancing across a grid that is never allowed to stop",
    keywords: ["energy", "grid", "load", "generation", "transmission", "outage"]
  },
  {
    slug: "water-utilities",
    name: "Water Utilities",
    category: "devops",
    mission: "treatment, distribution and quality monitoring where a failure is a public-health event",
    keywords: ["water", "treatment", "distribution", "quality", "reservoir", "leak"]
  },
  {
    slug: "manufacturing",
    name: "Manufacturing",
    category: "devops",
    mission: "production lines, changeovers and yield where downtime is measured in currency",
    keywords: ["manufacturing", "production", "line", "yield", "changeover", "downtime"]
  },
  {
    slug: "telecom",
    name: "Telecom Networks",
    category: "devops",
    mission: "radio, transport and core networks carrying traffic nobody may drop silently",
    keywords: ["telecom", "network", "radio", "latency", "carrier", "subscriber"]
  },
  {
    slug: "robotics",
    name: "Robotics",
    category: "code",
    mission: "motion planning, control loops and safety envelopes around machines that move mass",
    keywords: ["robotics", "motion", "control", "actuator", "safety", "kinematics"]
  },
  {
    slug: "embedded-devices",
    name: "Embedded Devices",
    category: "code",
    mission: "firmware on constrained hardware where a bad flash is a truck roll",
    keywords: ["embedded", "firmware", "mcu", "flash", "udp", "constrained"]
  },
  {
    slug: "simulation-engines",
    name: "Simulation Engines",
    category: "code",
    mission: "time-stepped simulation whose numbers are used to make real commitments",
    keywords: ["simulation", "solver", "timestep", "numerical", "model", "determinism"]
  },
  {
    slug: "logistics",
    name: "Logistics",
    category: "data",
    mission: "routing, dispatch and promised windows where a late answer is a broken promise",
    keywords: ["logistics", "routing", "dispatch", "eta", "fleet", "window"]
  },
  {
    slug: "supply-chain",
    name: "Supply Chain",
    category: "data",
    mission: "forecast, inventory and supplier risk with lead times measured in weeks",
    keywords: ["supply", "chain", "inventory", "forecast", "supplier", "lead-time"]
  },
  {
    slug: "retail-demand",
    name: "Retail Demand",
    category: "data",
    mission: "demand signals, assortment and pricing where a wrong number is stock rotting on a shelf",
    keywords: ["retail", "demand", "assortment", "pricing", "stock", "basket"]
  },
  {
    slug: "agriculture",
    name: "Agriculture",
    category: "research",
    mission: "yield, soil, irrigation and season timing under weather that does not negotiate",
    keywords: ["agriculture", "yield", "soil", "irrigation", "season", "crop"]
  },
  {
    slug: "climate-carbon",
    name: "Climate & Carbon",
    category: "research",
    mission: "emissions accounting and climate exposure where the method must survive an audit",
    keywords: ["climate", "carbon", "emissions", "scope", "esg", "exposure"]
  },
  {
    slug: "ocean-fisheries",
    name: "Ocean & Fisheries",
    category: "research",
    mission: "catch limits, quotas and marine monitoring against a stock that cannot be recounted",
    keywords: ["ocean", "fisheries", "quota", "catch", "marine", "stock"]
  },
  {
    slug: "insurance",
    name: "Insurance",
    category: "analysis",
    mission: "underwriting, claims and reserving where the tail decides whether the book survives",
    keywords: ["insurance", "underwriting", "claims", "reserving", "actuarial", "tail"]
  },
  {
    slug: "banking",
    name: "Banking",
    category: "analysis",
    mission: "credit, liquidity and capital where the regulator reads the same numbers you do",
    keywords: ["banking", "credit", "liquidity", "capital", "ledger", "reconciliation"]
  },
  {
    slug: "disaster-modelling",
    name: "Disaster Modelling",
    category: "analysis",
    mission: "hazard, exposure and evacuation modelling whose output moves real people",
    keywords: ["disaster", "hazard", "evacuation", "exposure", "scenario", "resilience"]
  },
  {
    slug: "payments",
    name: "Payments",
    category: "business",
    mission: "authorisation, settlement and dispute flows where a duplicated cent is an incident",
    keywords: ["payments", "settlement", "authorisation", "chargeback", "rail", "idempotency"]
  },
  {
    slug: "hospitality",
    name: "Hospitality",
    category: "business",
    mission: "occupancy, service and guest recovery where reputation is the balance sheet",
    keywords: ["hospitality", "occupancy", "booking", "service", "guest", "recovery"]
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    category: "business",
    mission: "valuation, tenancy and portfolio exposure against illiquid assets",
    keywords: ["realestate", "valuation", "tenancy", "portfolio", "lease", "yield"]
  },
  {
    slug: "clinical-trials",
    name: "Clinical Trials",
    category: "legal",
    mission: "protocols, endpoints and consent where the documentation IS the product",
    keywords: ["clinical", "trial", "protocol", "endpoint", "consent", "gcp"]
  },
  {
    slug: "taxation",
    name: "Taxation",
    category: "legal",
    mission: "filings, positions and transfer pricing that a revenue authority will read line by line",
    keywords: ["tax", "filing", "position", "transfer-pricing", "jurisdiction", "audit"]
  },
  {
    slug: "public-sector",
    name: "Public Sector",
    category: "legal",
    mission: "procurement, eligibility and statutory process with a right of appeal attached",
    keywords: ["public", "procurement", "eligibility", "statutory", "tender", "appeal"]
  },
  {
    slug: "financial-crime",
    name: "Financial Crime",
    category: "security",
    mission: "sanctions, AML typologies and alert triage where a false negative is a fine",
    keywords: ["aml", "sanctions", "typology", "alert", "screening", "sar"]
  },
  {
    slug: "critical-infrastructure",
    name: "Critical Infrastructure",
    category: "security",
    mission: "OT and IT boundary control where downtime is a physical consequence",
    keywords: ["ot", "scada", "ics", "boundary", "segmentation", "critical"]
  },
  {
    slug: "identity-access",
    name: "Identity & Access",
    category: "security",
    mission: "authentication, entitlement and privileged access with an evidence trail per grant",
    keywords: ["identity", "entitlement", "privileged", "sso", "grant", "revocation"]
  },
  {
    slug: "automotive-safety",
    name: "Automotive Safety",
    category: "testing",
    mission: "functional safety arguments where every claim needs a test that could have failed",
    keywords: ["automotive", "iso26262", "safety", "hil", "asil", "fault"]
  },
  {
    slug: "rail-signalling",
    name: "Rail Signalling",
    category: "testing",
    mission: "interlocking and train-control verification where failures are not recoverable",
    keywords: ["rail", "signalling", "interlocking", "balise", "etc", "sil4"]
  },
  {
    slug: "medical-devices",
    name: "Medical Devices",
    category: "testing",
    mission: "device verification and post-market surveillance under a notified-body lens",
    keywords: ["medical", "device", "iec62304", "verification", "surveillance", "notified-body"]
  },
  {
    slug: "aerospace-assurance",
    name: "Aerospace Assurance",
    category: "review",
    mission: "airworthiness evidence and configuration control across a decades-long lifecycle",
    keywords: ["aerospace", "airworthiness", "do178", "configuration", "traceability", "review"]
  },
  {
    slug: "pharma-quality",
    name: "Pharmaceutical Quality",
    category: "review",
    mission: "GMP documentation, deviation handling and batch release that a regulator inspects",
    keywords: ["pharma", "gmp", "deviation", "batch", "release", "inspection"]
  },
  {
    slug: "aviation-maintenance",
    name: "Aviation Maintenance",
    category: "review",
    mission: "maintenance programmes, deferred defects and release-to-service authority",
    keywords: ["aviation", "maintenance", "defect", "mel", "release", "airworthiness"]
  },
  {
    slug: "streaming-products",
    name: "Streaming Products",
    category: "product",
    mission: "catalogue, recommendations and playback quality across a global edge",
    keywords: ["streaming", "catalogue", "playback", "recommendation", "cdn", "churn"]
  },
  {
    slug: "game-production",
    name: "Game Production",
    category: "product",
    mission: "live-ops, economy and build pipelines where a bad patch is public within the hour",
    keywords: ["game", "liveops", "economy", "patch", "player", "telemetry"]
  },
  {
    slug: "gaming",
    name: "Real-time Gaming",
    category: "design",
    mission: "netcode, matchmaking and fairness under latency nobody controls",
    keywords: ["netcode", "matchmaking", "latency", "tickrate", "fairness", "replay"]
  },
  {
    slug: "media-production",
    name: "Media Production",
    category: "design",
    mission: "shooting, edit and delivery pipelines against broadcast deliverables",
    keywords: ["media", "edit", "deliverable", "broadcast", "codec", "render"]
  },
  {
    slug: "journalism",
    name: "Journalism",
    category: "writing",
    mission: "sourcing, verification and publication where a retraction costs more than a scoop",
    keywords: ["journalism", "sourcing", "verification", "publication", "editorial", "retraction"]
  },
  {
    slug: "publishing",
    name: "Publishing",
    category: "writing",
    mission: "editorial pipeline, rights and metadata that decide discoverability",
    keywords: ["publishing", "editorial", "rights", "metadata", "isbn", "catalogue"]
  },
  {
    slug: "advertising",
    name: "Advertising",
    category: "comms",
    mission: "campaign claims, media plans and measurement that must survive substantiation",
    keywords: ["advertising", "campaign", "claim", "media-plan", "substantiation", "attribution"]
  },
  {
    slug: "public-relations",
    name: "Public Relations",
    category: "comms",
    mission: "statements, crisis response and stakeholder messaging on a clock",
    keywords: ["pr", "statement", "crisis", "stakeholder", "messaging", "spokesperson"]
  },
  {
    slug: "nonprofit-comms",
    name: "Nonprofit Communications",
    category: "comms",
    mission: "donor reporting and programme messaging where trust is the entire asset",
    keywords: ["nonprofit", "donor", "programme", "report", "grant", "stewardship"]
  }
];
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
function batchEntryId(domain, station) {
  return `${domain.slug}.${station}`;
}
function buildReachBatch() {
  const out = [];
  for (const domain of REACH_BATCH_DOMAINS) {
    for (const station of REACH_BATCH_STATIONS) {
      out.push({
        id: batchEntryId(domain, station),
        name: `${domain.name} ${STATION_TITLE[station]}`,
        category: domain.category,
        capabilities: STATION_CAPABILITIES[station](domain.name),
        keywords: [...domain.keywords, STATION_KEYWORD[station]].sort(),
        riskTier: STATION_RISK[station],
        systemPrompt: STATION_PROMPTS[station](domain.name, domain.mission),
        provenance: REACH_BATCH_PROVENANCE
      });
    }
  }
  return out;
}
function reachBatchCensus(entries) {
  const byRisk = { safe: 0, risky: 0, critical: 0 };
  const byStation = { assess: 0, design: 0, build: 0, verify: 0, sustain: 0 };
  const byCategory = {};
  const domains = /* @__PURE__ */ new Set();
  for (const e of entries) {
    byRisk[e.riskTier] += 1;
    const suffix = e.id.split(".").pop() ?? "";
    if (REACH_BATCH_STATIONS.includes(suffix)) {
      const station = suffix;
      byStation[station] += 1;
      domains.add(e.id.slice(0, e.id.length - suffix.length - 1));
    }
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  return { total: entries.length, byRisk, byStation, byCategory, domains: domains.size };
}
export {
  REACH_BATCH_DOMAINS,
  REACH_BATCH_PROVENANCE,
  REACH_BATCH_STATIONS,
  STATION_CAPABILITIES,
  STATION_KEYWORD,
  STATION_PROMPTS,
  STATION_RISK,
  STATION_TITLE,
  batchEntryId,
  buildReachBatch,
  reachBatchCensus
};
