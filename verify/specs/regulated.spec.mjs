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

// src/engine/federation/regulatedSpec.ts
var REGULATED_BATCH_PROVENANCE = "si-19.6.2-regulated";
var REGULATED_BATCH_DOMAINS = [
  /* ── code (3): software the law treats as a safety artefact ─────────────── */
  { slug: "avionics-software", name: "Avionics Software", category: "code", mission: "avionics software is certified, not merely tested: the evidence obligations of DO-178C shape every artefact this work produces", keywords: ["do-178c", "certification evidence", "dali", "requirements traceability"] },
  { slug: "medical-software", name: "Medical Software", category: "code", mission: "software that informs or delivers care is a regulated device: risk classification, clinical evaluation and post-market surveillance are part of the work", keywords: ["iec-62304", "clinical evaluation", "post-market surveillance", "hipaa"] },
  { slug: "industrial-control-software", name: "Industrial Control Software", category: "code", mission: "control software acts on physical plant, so an error is a hazard: functional-safety integrity levels and the safety lifecycle govern exactly what may change", keywords: ["iec-61508", "sil", "ot segmentation", "safety lifecycle"] },
  /* ── security (4): safety and security of people, plant and premises ───── */
  { slug: "occupational-safety", name: "Occupational Safety", category: "security", mission: "workplace injury is prevented by controls that must be documented, trained and audited, not by good intentions", keywords: ["osha", "hierarchy of controls", "incident rate", "risk assessment"] },
  { slug: "process-safety", name: "Process Safety", category: "security", mission: "major-accident hazards are managed as a discipline of their own, separate from personal safety and with far longer consequence horizons", keywords: ["hazop", "layers of protection", "major accident", "lopa"] },
  { slug: "fire-safety", name: "Fire Safety", category: "security", mission: "life-safety systems are designed, commissioned and maintained against a code, and a deviation is recorded as a deviation rather than absorbed quietly", keywords: ["life safety", "nfpa", "egress", "sprinkler design"] },
  { slug: "physical-security-services", name: "Physical Security Services", category: "security", mission: "guarding, access control and protective design are licensed activities whose procedures must survive an audit and a real incident at once", keywords: ["access control", "guarding licence", "cctv governance", "protective design"] },
  /* ── testing (3): the tests that produce a certificate or a number ─────── */
  { slug: "certification-testing", name: "Certification Testing", category: "testing", mission: "conformity assessment produces a decision another party relies on, so method, sample and uncertainty are all part of the result", keywords: ["conformity assessment", "test report", "accreditation", "iso-17025"] },
  { slug: "environmental-testing", name: "Environmental Testing", category: "testing", mission: "environmental measurements are evidence only when sampling, chain of custody and detection limits are stated with the result", keywords: ["sampling plan", "chain of custody", "detection limit", "emissions"] },
  { slug: "calibration-metrology", name: "Calibration & Metrology", category: "testing", mission: "a number is worth what its traceability is worth: this work keeps measurements tied to a stated reference and reports uncertainty honestly", keywords: ["traceability", "measurement uncertainty", "calibration interval", "reference standard"] },
  /* ── review (3): inspections with legal force ──────────────────────────── */
  { slug: "structural-inspection", name: "Structural Inspection", category: "review", mission: "inspection decides whether a structure may carry its load: observations are recorded against a code, and anything unsafe is escalated in writing the same day", keywords: ["load path", "defect classification", "condition survey", "building code"] },
  { slug: "electrical-inspection", name: "Electrical Inspection", category: "review", mission: "electrical inspection certifies a protective arrangement, so the test results, not the impression, decide the outcome", keywords: ["protective device", "insulation testing", "wiring regulations", "certificate of compliance"] },
  { slug: "food-safety-inspection", name: "Food Safety Inspection", category: "review", mission: "food safety is judged against a hazard-control system the premises must be able to prove it follows, sample by sample and shift by shift", keywords: ["haccp", "critical control point", "traceability", "recall readiness"] },
  /* ── data (3): the record the public is entitled to ───────────────────── */
  { slug: "official-statistics", name: "Official Statistics", category: "data", mission: "official statistics are produced to a published code of practice: revisions are explained, methods are documented, and independence is stated", keywords: ["code of practice", "revision policy", "seasonal adjustment", "dissemination control"] },
  { slug: "census-demography", name: "Census & Demography", category: "data", mission: "population data underpins representation and funding, so disclosure control and coverage adjustment are part of the result rather than afterthoughts", keywords: ["disclosure control", "coverage adjustment", "imputation", "population estimates"] },
  { slug: "public-records", name: "Public Records", category: "data", mission: "records are held on behalf of the public: retention schedules, disclosure duties and redaction law govern what may be kept, released or destroyed", keywords: ["retention schedule", "freedom of information", "redaction", "archival appraisal"] },
  /* ── devops (3): operating plant under a regulatory regime ─────────────── */
  { slug: "grid-operations", name: "Grid Operations", category: "devops", mission: "the grid balances second by second under a reliability standard, and every switching action is taken with a stated contingency", keywords: ["n-1 contingency", "frequency response", "switching order", "reliability standard"] },
  { slug: "refinery-operations", name: "Refinery Operations", category: "devops", mission: "process plant runs inside an envelope: operating limits are written down, excursions are investigated, and a shutdown is never negotiated in the moment", keywords: ["operating envelope", "integrity management", "management of change", "turnaround"] },
  { slug: "hospital-operations", name: "Hospital Operations", category: "devops", mission: "clinical operations are governed by patient safety: capacity, staffing and escalation decisions are made against a documented standard, in that order", keywords: ["patient safety", "escalation protocol", "clinical governance", "capacity planning"] },
  /* ── research (4): the science the care layer rests on ────────────────── */
  { slug: "public-health", name: "Public Health", category: "research", mission: "population health work acts on groups, so it states its evidence grade, its equity impact and its uncertainty before it recommends anything", keywords: ["population health", "equity impact", "evidence grading", "screening programme"] },
  { slug: "epidemiology", name: "Epidemiology", category: "research", mission: "measures of disease are produced with their case definition, denominator and biases named, because a rate without a definition is a rumour", keywords: ["case definition", "surveillance", "confounding", "outbreak analysis"] },
  { slug: "biosecurity", name: "Biosecurity", category: "research", mission: "biological risk is managed under containment rules and dual-use obligations, and material movement is documented before it happens", keywords: ["containment level", "dual-use review", "transfer documentation", "biocontainment"] },
  { slug: "veterinary-medicine", name: "Veterinary Medicine", category: "research", mission: "animal health work carries zoonotic and welfare duties alongside the clinical decision, and both are recorded", keywords: ["animal welfare", "zoonosis", "cascade prescribing", "notifiable disease"] },
  /* ── writing (3): documents the law reads ─────────────────────────────── */
  { slug: "regulatory-writing", name: "Regulatory Writing", category: "writing", mission: "regulatory submissions are argued against a published requirement set, with each claim traceable to the evidence that carries it", keywords: ["submission dossier", "common technical document", "regulatory pathway", "gap analysis"] },
  { slug: "standards-writing", name: "Standards Writing", category: "writing", mission: "standards are normative text: every requirement is testable, and the difference between shall, should and may is the whole document", keywords: ["normative text", "consensus process", "conformance clause", "technical committee"] },
  { slug: "plain-language", name: "Plain Language", category: "writing", mission: "public-facing text is rewritten to a measured readability standard without losing the legal meaning \u2014 and when the two conflict, the conflict is raised", keywords: ["readability", "plain english", "accessibility", "translation brief"] },
  /* ── analysis (4): the numbers behind assurance ───────────────────────── */
  { slug: "actuarial-pensions", name: "Actuarial & Pensions", category: "analysis", mission: "actuarial outputs are statements about the future with an explicit basis: assumptions, funding position and the sensitivity around them", keywords: ["valuation basis", "funding position", "mortality assumption", "sensitivity"] },
  { slug: "audit-assurance", name: "Audit & Assurance", category: "analysis", mission: "assurance work plans around the risk of material misstatement, gathers evidence to a standard, and refuses to describe a limit as a clean opinion", keywords: ["materiality", "internal control", "audit evidence", "opinion"] },
  { slug: "cost-benefit-analysis", name: "Cost-Benefit Analysis", category: "analysis", mission: "cost-benefit work states its discount rate, its baseline and its distributional consequences, because a ratio without those is an opinion", keywords: ["discount rate", "counterfactual", "net present value", "distributional impact"] },
  { slug: "forensic-accounting", name: "Forensic Accounting", category: "analysis", mission: "forensic work reconstructs what happened from records and states, at every step, what is proved and what is merely consistent", keywords: ["tracing", "funds flow", "evidence standard", "expert report"] },
  /* ── design (3): the built environment and the people in it ───────────── */
  { slug: "urban-planning", name: "Urban Planning", category: "design", mission: "planning decisions are made in public, against a development plan, balancing statutory consultation with the duty to give reasons", keywords: ["development plan", "statutory consultation", "zoning", "planning obligation"] },
  { slug: "transport-planning", name: "Transport Planning", category: "design", mission: "transport schemes are appraised on modelled demand and measured safety outcomes, with the model's assumptions open to challenge", keywords: ["demand modelling", "road safety audit", "level of service", "appraisal framework"] },
  { slug: "accessible-design", name: "Accessible Design", category: "design", mission: "accessibility is a legal baseline met by design and verified with real assistive technology, never a retrofit claimed after the fact", keywords: ["wcag baseline", "assistive technology", "inclusive design", "reasonable adjustment"] },
  /* ── product (3): public services as products ─────────────────────────── */
  { slug: "benefits-administration", name: "Benefits Administration", category: "product", mission: "entitlement decisions must be accurate, explained and appealable: the reason for a decision is part of the product, not a support article", keywords: ["entitlement rules", "decision notice", "appeal route", "means testing"] },
  { slug: "permitting-licensing", name: "Permitting & Licensing", category: "product", mission: "permits are granted against criteria and within statutory time limits, and a refusal states the criterion that failed", keywords: ["statutory timescale", "licensing criteria", "public register", "conditions"] },
  { slug: "civic-technology", name: "Civic Technology", category: "product", mission: "civic systems serve people who cannot opt out, so identity handling, accessibility and offline fallback are requirements from the first sketch", keywords: ["digital identity", "service continuity", "open data", "assisted digital"] },
  /* ── business (4): the services that keep a site running ─────────────── */
  { slug: "facilities-management", name: "Facilities Management", category: "business", mission: "facilities work keeps a site safe and compliant: statutory inspections are scheduled, logged and escalated, and the log is the evidence", keywords: ["statutory inspection", "planned maintenance", "estate condition", "service level"] },
  { slug: "building-services", name: "Building Services", category: "business", mission: "mechanical and electrical services are commissioned against a design intent, and comfort, efficiency and safety are all measured against it", keywords: ["commissioning", "hvac design", "energy performance", "legionella control"] },
  { slug: "waste-management", name: "Waste Management", category: "business", mission: "waste is tracked under a duty of care: the treatment route and the transfer documentation decide whether the duty has been met", keywords: ["duty of care", "waste hierarchy", "transfer note", "treatment standard"] },
  { slug: "emergency-management", name: "Emergency Management", category: "business", mission: "emergency planning works from a risk assessment to a tested plan: capabilities are exercised, gaps are recorded, and the record survives the incident", keywords: ["risk register", "exercise programme", "concept of operations", "recovery plan"] },
  /* ── legal (3): the state's own procedures ───────────────────────────── */
  { slug: "courts-judiciary", name: "Courts & Judiciary", category: "legal", mission: "court processes are governed by rules of procedure and duties of fairness, and a deadline or a disclosure duty is a hard constraint", keywords: ["rules of procedure", "disclosure duty", "listing practice", "judicial review"] },
  { slug: "immigration-services", name: "Immigration Services", category: "legal", mission: "immigration decisions turn on evidence and on rights of appeal: the applicable rule is identified before the merits are considered", keywords: ["immigration rules", "right of appeal", "documentary evidence", "asylum procedure"] },
  { slug: "customs-trade", name: "Customs & Trade", category: "legal", mission: "cross-border movement is classified and declared against a tariff, and the classification decision is the one everything else depends on", keywords: ["tariff classification", "rules of origin", "customs declaration", "trade agreement"] },
  /* ── comms (3): telling the public what is happening ─────────────────── */
  { slug: "emergency-comms", name: "Emergency Communications", category: "comms", mission: "emergency messaging is short, accurate and repeated: uncertainty is stated rather than smoothed, and corrections are issued as quickly as the error", keywords: ["public warning", "message discipline", "call handling", "situational awareness"] },
  { slug: "crisis-comms", name: "Crisis Communications", category: "comms", mission: "crisis communication is a discipline of holding to facts and timing under pressure, with a single source of truth and a stated next update", keywords: ["holding statement", "stakeholder mapping", "media liaison", "reputation risk"] },
  { slug: "public-consultation", name: "Public Consultation", category: "comms", mission: "consultation is a statutory process with a duty to consider responses and to publish the reasons for the decision taken", keywords: ["consultation duty", "response analysis", "decision record", "equalities duty"] }
];
function regulatedEntryId(domain, station) {
  return batchEntryId(domain, station);
}
function buildRegulatedBatch() {
  return buildBatch(REGULATED_BATCH_DOMAINS, REGULATED_BATCH_PROVENANCE);
}
function regulatedBatchCensus(entries) {
  return censusOf(entries);
}
export {
  REACH_BATCH_STATIONS,
  REGULATED_BATCH_DOMAINS,
  REGULATED_BATCH_PROVENANCE,
  buildRegulatedBatch,
  regulatedBatchCensus,
  regulatedEntryId
};
