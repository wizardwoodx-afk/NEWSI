/**
 * The specialist pack — every engine, every tool, every specialist, in one place.
 *
 * This is the generalist counterpart to the finance pack: same contract, same discipline,
 * different domains. Nothing here is domain-specific in the shell — a tool declares its
 * fields and its engine, and the surface renders itself from that declaration. Adding a
 * domain therefore never means touching the UI, which is the property that makes this a pack
 * rather than a feature.
 */
export * from "./types";
export * from "./frontend";
export * from "./dev";
export * from "./api";
export * from "./data";
export * from "./security";
export * from "./ops";
export * from "./docs";
export * from "./growth";
export * from "./systems";
export * from "./intelligence";
export * from "./governance";
export * from "./commerce";
export * from "./health";
export * from "./roster";

import type { Domain, Tool } from "./types";
import { FRONTEND_TOOLS } from "./frontend";
import { DEV_TOOLS } from "./dev";
import { API_TOOLS } from "./api";
import { DATA_TOOLS } from "./data";
import { SECURITY_TOOLS } from "./security";
import { OPS_TOOLS } from "./ops";
import { DOCS_TOOLS } from "./docs";
import { GROWTH_TOOLS } from "./growth";
import { SYSTEMS_TOOLS } from "./systems";
import { INTELLIGENCE_TOOLS } from "./intelligence";
import { GOVERNANCE_TOOLS } from "./governance";
import { COMMERCE_TOOLS } from "./commerce";
import { HEALTH_TOOLS } from "./health";

/** Every tool in the pack, in the order the surface shows them. */
export const TOOLS: readonly Tool[] = Object.freeze([
  ...FRONTEND_TOOLS, ...DEV_TOOLS, ...API_TOOLS, ...DATA_TOOLS,
  ...SECURITY_TOOLS, ...OPS_TOOLS, ...DOCS_TOOLS, ...GROWTH_TOOLS,
  ...SYSTEMS_TOOLS, ...INTELLIGENCE_TOOLS, ...GOVERNANCE_TOOLS, ...COMMERCE_TOOLS,
  ...HEALTH_TOOLS,
]);

export interface DomainInfo {
  id: Domain;
  label: string;
  blurb: string;
}

/**

 * because it is part of the same surface, and its own tools and roster live where they were
 * built rather than being copied into this file.
 */
export const DOMAINS: readonly DomainInfo[] = Object.freeze([
  { id: "frontend", label: "Frontend", blurb: "Colour, contrast, type and spacing — the parts of design that are arithmetic." },
  { id: "dev", label: "Engineering", blurb: "Versions, commits, status codes, retry ladders and schedules." },
  { id: "api", label: "API", blurb: "Rate limits, payload budgets, idempotency keys and paging." },
  { id: "data", label: "Data", blurb: "Percentiles, outliers, experiment readouts and sample sizing." },
  { id: "security", label: "Security", blurb: "Secret shapes, token decoding, headers and entropy — as measures, not verdicts." },
  { id: "ops", label: "Reliability", blurb: "Error budgets, capacity runway, severity and deploy risk." },
  { id: "docs", label: "Docs", blurb: "Reading level, length, heading structure and terminology drift." },
  { id: "growth", label: "Growth", blurb: "Unit economics, funnels, prioritisation and revenue trajectory." },
  { id: "mobile", label: "Mobile", blurb: "Touch targets and the release size budget — the two that decide whether an app is usable and shippable." },
  { id: "cloud", label: "Cloud", blurb: "Instance sizing and egress cost — headroom and the bill, both computed from your own numbers." },
  { id: "db", label: "Database", blurb: "Index selectivity and connection pools — the two settings most changed on a hunch." },
  { id: "embedded", label: "Embedded", blurb: "Power budgets and real-time schedulability for devices that cannot be redeployed." },
  { id: "ml", label: "ML & AI", blurb: "Evaluation intervals and split audits — the honest statistics of a model readout." },
  { id: "research", label: "Research", blurb: "Citation coverage and inter-rater agreement, because a claim needs a source and a label needs a second rater." },
  { id: "media", label: "Media", blurb: "Loudness normalisation and bitrate budgets for anything watched or listened to." },
  { id: "finops", label: "FinOps", blurb: "Spend trajectory and anomaly detection against your own billing history." },
  { id: "legal", label: "Legal", blurb: "Undefined-term density and the date arithmetic a contract turns on — measures, never advice." },
  { id: "privacy", label: "Privacy", blurb: "Personal-data classes present in a text, and the clock on how long it may be kept." },
  { id: "people", label: "People", blurb: "Headcount modelling and band position — the plan and the offer, tested against themselves." },
  { id: "revenue", label: "Revenue", blurb: "Pipeline coverage and the SLA clock — what the quarter needs and what the customer was promised." },
  { id: "marketing", label: "Marketing", blurb: "What a search result truncates and what a crawl costs, before either is paid for." },
  { id: "locale", label: "Localisation", blurb: "Translation coverage and the space translated strings take in a layout built for English." },
  { id: "supply", label: "Supply chain", blurb: "Order quantities and the safety stock a service level actually costs." },
  { id: "web3", label: "Web3", blurb: "Transaction cost and base-unit arithmetic — integer maths, because token floats lose money." },
  { id: "health", label: "Healthcare", blurb: "Early-warning scores and ward occupancy — arithmetic, never a diagnosis." },
]);

export function toolsForDomain(domain: Domain): Tool[] {
  return TOOLS.filter((t) => t.domain === domain);
}

export function toolById(id: string): Tool | undefined {
  return TOOLS.find((t) => t.id === id);
}
