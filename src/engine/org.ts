/**
 * SelfImpulse org — the company, five rungs, never a flat crowd and never a
 * skipped layer:
 *
 *   USER  ⇄  CAPTAIN (the CEO — the only human-facing seat; talks to the user)
 *          ⇄  CONSUL   (one per domain — reports UP to the Captain, never
 *                       addresses the user, never commands crews directly)
 *          ⇄  ADEPT    (the desk's team lead — plans and presents)
 *          ⇄  SUB-AGENTS (the crew — the established fleet that does the work)
 *
 * Layer discipline is structural, not stylistic. The law is ./chain (a message
 * moves exactly one rung; LayerSkipError otherwise) and it is enforced where
 * the data lives: every desk's category resolves to exactly one Consul
 * (consulForDesk below), and workspace.ts refuses to seat a desk whose Consul
 * is missing. The Captain speaks only with the user and its Consuls; a Consul
 * speaks to the Captain above and its Adepts below — never the user, never a
 * sub-agent; an Adept leads its crew and reports to its Consul; the crew
 * executes and answers to its Adept.
 *
 * The Specialists door and the engine fleet stay two catalogs. This module
 * is the wiring: every worker belongs to a desk, every desk has an Adept
 * (plans the work) and an HR (staffs the bench). Captain never talks to
 * 1,500 people — it briefs Consuls; Consuls never talk to the user or the
 * floor; the desks field the crew. The floor cap lives in workspace.ts (MoE-25).
 *
 * 30 desks × 2 specialists = 60. That is the "60" in 25MoE60.
 */
import type { Specialist, SpecialistCategory } from "./types";
import { ESTABLISHED_SPECIALISTS } from "./federation/fleet";
import { TITLES } from "./chain";
import { captainForDomain, type Captain } from "./captains";

export const ORG_DESK_COUNT = 30;
export const ORG_SPECIALIST_COUNT = 60; // Lead + HR per desk

export type DeskId =
  | "frontend" | "backend" | "mobile" | "api" | "data" | "database"
  | "security" | "devops" | "cloud" | "testing" | "review" | "research"
  | "writing" | "docs" | "analysis" | "design" | "product" | "business"
  | "legal" | "comms" | "finance" | "silicon" | "health" | "privacy"
  | "people" | "revenue" | "marketing" | "ml" | "embedded" | "ops";

export type DeskRole = "lead" | "hr";

export interface DeskDef {
  id: DeskId;
  label: string;
  blurb: string;
  /** Engine category the worker bench is drawn from. */
  workerCategory: SpecialistCategory;
  /** Extra filter on workers; empty = the whole category. */
  workerKeywords: string[];
  /** Routing vocabulary for the desk itself (Captain → Lead). */
  keywords: string[];
}

export interface DeskSpecialist {
  id: string;
  desk: DeskId;
  role: DeskRole;
  name: string;
  mandate: string;
  keywords: string[];
}

const D = (
  id: DeskId, label: string, blurb: string,
  workerCategory: SpecialistCategory, workerKeywords: string[], keywords: string[],
): DeskDef => ({ id, label, blurb, workerCategory, workerKeywords, keywords });

/** Thirty desks. Expanding specialists means adding a row here — workers stay in the fleet. */
export const DESKS: readonly DeskDef[] = Object.freeze([
  D("frontend", "Frontend", "The screens people touch.", "code",
    ["react", "component", "ui", "jsx", "tsx", "frontend", "css", "a11y", "hook"],
    ["frontend", "ui", "react", "interface", "screen", "app", "website", "page"]),
  D("backend", "Backend", "Services, jobs, the other side of the API.", "code",
    ["node", "server", "backend", "grpc", "queue", "worker", "service"],
    ["backend", "server", "service", "api", "endpoint"]),
  D("mobile", "Mobile", "The phone in someone's hand.", "code",
    ["mobile", "ios", "android", "flutter", "swift", "kotlin", "react-native"],
    ["mobile", "ios", "android", "app", "phone"]),
  D("api", "API", "Contracts between systems.", "code",
    ["api", "rest", "openapi", "graphql", "webhook", "endpoint", "jsonrpc"],
    ["api", "rest", "graphql", "webhook", "contract", "integrate", "connect"]),
  D("data", "Data", "Pipelines, quality, the warehouse.", "data",
    [],
    ["data", "pipeline", "etl", "warehouse", "dataset", "analytics"]),
  D("database", "Database", "Schemas, indexes, the store.", "code",
    ["sql", "schema", "postgres", "database", "index", "query", "migration"],
    ["database", "sql", "schema", "postgres", "sqlite"]),
  D("security", "Security", "The trust boundary.", "security",
    [],
    ["security", "auth", "vulnerability", "threat", "secret", "encrypt"]),
  D("devops", "DevOps", "Delivery and the path to production.", "devops",
    [],
    ["devops", "ci", "deploy", "release", "pipeline", "docker"]),
  D("cloud", "Cloud", "The bill, the regions, the cluster.", "devops",
    ["aws", "gcp", "azure", "terraform", "kubernetes", "cloud", "iam"],
    ["cloud", "aws", "gcp", "azure", "kubernetes", "terraform"]),
  D("testing", "Testing", "Evidence that it works.", "testing",
    [],
    ["test", "testing", "qa", "coverage", "e2e", "probe"]),
  D("review", "Review", "The quality gate before it ships.", "review",
    [],
    ["review", "diff", "pr", "pull", "approve"]),
  D("research", "Research", "Claims with sources.", "research",
    [],
    ["research", "search", "source", "cite", "paper", "find"]),
  D("writing", "Writing", "Words that survive a stranger.", "writing",
    [],
    ["write", "writing", "copy", "prose", "edit"]),
  D("docs", "Docs", "The document, the runbook, the README.", "writing",
    ["docs", "documentation", "readme", "tutorial", "runbook", "guide"],
    ["docs", "document", "documentation", "readme", "runbook", "internal"]),
  D("analysis", "Analysis", "Numbers that can be defended.", "analysis",
    [],
    ["analysis", "metric", "forecast", "cohort", "cost"]),
  D("design", "Design", "How it looks and how it feels.", "design",
    [],
    ["design", "ux", "layout", "visual", "wireframe"]),
  D("product", "Product", "The problem before the solution.", "product",
    [],
    ["product", "roadmap", "user", "outcome", "scope"]),
  D("business", "Business", "Plans, numbers, the kill criterion.", "business",
    [],
    ["business", "plan", "model", "unit", "economics"]),
  D("legal", "Legal", "Obligations, never legal advice.", "legal",
    [],
    ["legal", "contract", "compliance", "terms", "liability"]),
  D("comms", "Comms", "Mail, status, who hears what.", "comms",
    [],
    ["mail", "email", "send", "message", "notify", "comms", "status", "announcement"]),
  D("finance", "Finance", "Money, tax, the ledger.", "finance",
    [],
    ["finance", "tax", "gst", "invoice", "ledger", "money"]),
  D("silicon", "Silicon", "The chip, the board, the tape-out.", "silicon",
    [],
    ["silicon", "rtl", "chip", "verilog", "asic", "fpga"]),
  D("health", "Healthcare", "Scores and occupancy — never a diagnosis.", "research",
    ["health", "clinical", "patient", "medical"],
    ["health", "healthcare", "clinical", "patient", "hospital", "medical"]),
  D("privacy", "Privacy", "Personal data, retention, consent.", "security",
    ["privacy", "pii", "gdpr", "consent", "retention", "dsar"],
    ["privacy", "pii", "gdpr", "consent", "personal"]),
  D("people", "People", "Headcount, hiring, the offer.", "business",
    ["hiring", "talent", "people", "headcount", "comp"],
    ["people", "hiring", "hr", "headcount", "talent"]),
  D("revenue", "Revenue", "Pipeline, price, the quarter.", "business",
    ["revenue", "pricing", "sales", "pipeline", "quota"],
    ["revenue", "sales", "pricing", "pipeline", "quota"]),
  D("marketing", "Marketing", "What gets said in public.", "comms",
    ["marketing", "campaign", "seo", "brand"],
    ["marketing", "campaign", "seo", "launch"]),
  D("ml", "ML & AI", "Models, evals, retrieval.", "code",
    ["ml", "model", "llm", "rag", "embedding", "eval", "inference"],
    ["ml", "model", "ai", "llm", "rag", "embedding"]),
  D("embedded", "Embedded", "Small machines, tight budgets.", "code",
    ["embedded", "firmware", "c", "misra", "interrupt", "wasm"],
    ["embedded", "firmware", "device", "iot"]),
  D("ops", "Reliability", "Incidents, capacity, the 3am path.", "devops",
    ["incident", "oncall", "sre", "capacity", "runbook", "slo"],
    ["ops", "reliability", "incident", "oncall", "uptime", "slo"]),
]);

function leadOf(d: DeskDef): DeskSpecialist {
  return {
    id: `lead.${d.id}`,
    desk: d.id,
    role: "lead",
    name: `${d.label} ${TITLES.adept}`,
    mandate: `You are the ${d.label} ${TITLES.adept} — the desk's team lead. Plan the desk's work, lead your ${TITLES.crew.toLowerCase()} crew through it, and report to your ${TITLES.consul}. Never address the user; never report to the ${TITLES.captain} over your ${TITLES.consul}'s head. You lead ${TITLES.crew.toLowerCase()}s; you do not impersonate them.`,
    keywords: d.keywords,
  };
}
function hrOf(d: DeskDef): DeskSpecialist {
  return {
    id: `hr.${d.id}`,
    desk: d.id,
    role: "hr",
    name: `${d.label} Desk HR`,
    mandate: `Staff the ${d.label} bench from the ${TITLES.crew.toLowerCase()} catalog. Name who should run; never do the work yourself. Staffing answers to your ${TITLES.consul}.`,
    keywords: [...d.keywords, "staff", "bench", "assign"],
  };
}

export const DOMAIN_SPECIALISTS: readonly DeskSpecialist[] = Object.freeze(
  DESKS.flatMap((d) => [leadOf(d), hrOf(d)]),
);

export function deskById(id: DeskId): DeskDef | undefined {
  return DESKS.find((d) => d.id === id);
}
/**
 * The Consul directly above a desk's Adept: the Consul who owns the desk's
 * worker category. Null means a skipped rung — workspace.ts refuses such
 * a desk and probe/workspace pins that none of the shipped desks is one.
 */
export function consulForDesk(id: DeskId): Captain | null {
  const d = deskById(id);
  return d ? captainForDomain(d.workerCategory) : null;
}
export function leadFor(id: DeskId): DeskSpecialist | undefined {
  return DOMAIN_SPECIALISTS.find((s) => s.desk === id && s.role === "lead");
}
export function hrFor(id: DeskId): DeskSpecialist | undefined {
  return DOMAIN_SPECIALISTS.find((s) => s.desk === id && s.role === "hr");
}

const CATEGORY_HOME: Record<SpecialistCategory, DeskId> = {
  code: "backend",
  security: "security",
  testing: "testing",
  review: "review",
  data: "data",
  devops: "devops",
  research: "research",
  writing: "writing",
  analysis: "analysis",
  design: "design",
  product: "product",
  business: "business",
  legal: "legal",
  comms: "comms",
  finance: "finance",
  silicon: "silicon",
};

function deskScoreForWorker(d: DeskDef, s: Specialist): number {
  let n = 0;
  if (d.workerCategory === s.category) n += 2;
  const hay = `${s.id} ${s.name} ${s.keywords.join(" ")}`.toLowerCase();
  for (const kw of d.workerKeywords) {
    if (s.keywords.some((k) => k.toLowerCase() === kw) || hay.includes(kw)) n += 3;
  }
  return n;
}

/**
 * Every established worker belongs to at least one desk. Sliced desks
 * (frontend vs backend) claim by keyword; leftovers go to the category home.
 */
export function desksForWorker(s: Specialist): DeskId[] {
  const hits: Array<{ id: DeskId; score: number }> = [];
  for (const d of DESKS) {
    const score = deskScoreForWorker(d, s);
    const bar = d.workerKeywords.length === 0 ? 2 : 5;
    if (score >= bar) hits.push({ id: d.id, score });
  }
  hits.sort((a, b) => b.score - a.score);
  if (hits.length === 0) return [CATEGORY_HOME[s.category]];
  return hits.map((h) => h.id);
}

let _home: Map<string, DeskId> | null = null;
let _byDesk: Map<DeskId, Specialist[]> | null = null;

function indexWorkers(): void {
  if (_home) return;
  _home = new Map();
  _byDesk = new Map();
  for (const d of DESKS) _byDesk.set(d.id, []);
  for (const s of ESTABLISHED_SPECIALISTS) {
    const ds = desksForWorker(s);
    _home.set(s.id, ds[0] ?? CATEGORY_HOME[s.category]);
    for (const id of ds) _byDesk.get(id)!.push(s);
  }
}

export function homeDesk(s: Specialist): DeskId {
  indexWorkers();
  return _home!.get(s.id) ?? CATEGORY_HOME[s.category];
}

export function workersOnDesk(id: DeskId): Specialist[] {
  indexWorkers();
  return _byDesk!.get(id) ?? [];
}

export function orgStats(): {
  desks: number;
  specialists: number;
  workers: number;
  unassigned: number;
  byDesk: Record<string, number>;
} {
  const byDesk: Record<string, number> = {};
  for (const d of DESKS) byDesk[d.id] = 0;
  let unassigned = 0;
  for (const s of ESTABLISHED_SPECIALISTS) {
    const ds = desksForWorker(s);
    if (ds.length === 0) unassigned += 1;
    else for (const id of ds) byDesk[id] = (byDesk[id] ?? 0) + 1;
  }
  return {
    desks: DESKS.length,
    specialists: DOMAIN_SPECIALISTS.length,
    workers: ESTABLISHED_SPECIALISTS.length,
    unassigned,
    byDesk,
  };
}
