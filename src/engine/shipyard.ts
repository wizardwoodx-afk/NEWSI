/**
 * SelfImpulse — The Shipyard (19.1.0 "Shipyard"): the Team workspace.
 *
 * One brief ("build me a Y app") becomes a BUILD with one work order per
 * needed domain. Each order names that domain's Captain and a concrete
 * instruction; orders execute one at a time through the real Generalist
 * pipeline (gate, routing, provider call all still apply), each Captain
 * supervising its slice of the build. A build is DONE only when every
 * order genuinely executed; a blocked order blocks the build, and
 * settling requires the whole ship. State is a local checkpoint and
 * statuses come only from real execution results — nothing is simulated.
 */

import type { SpecialistCategory } from "./types";
import { routeDeterministic } from "./router";
import { captainForDomain } from "./captains";
import { sha256Hex } from "./collabInvite";

export interface WorkOrder {
  id: string;
  domain: SpecialistCategory;
  captainId: string;
  captainName: string;
  instruction: string;
  status: "pending" | "executed" | "settled" | "blocked";
  outcome?: string;
  /** The executed run's provenance digest — real, from the response. */
  receiptDigest?: string;
  note?: string;
  executedAt?: string;
}

export interface Build {
  id: string;
  brief: string;
  createdAt: string;
  status: "active" | "done" | "settled" | "paused";
  orders: WorkOrder[];
  buildDigest?: string;
}

/** What a real Generalist run hands back to the Shipyard. */
export interface RunResult {
  executed: boolean;
  outcome: string;
  note?: string;
  provenanceDigest?: string;
}

/** Max domains one brief may open work orders for — focus beats sprawl. */
export const MAX_ORDERS = 6;

const SHIPYARD_KEY = "engine.shipyard.v1";
const BUILD_CAP = 50;

const DOMAIN_LABEL: Record<SpecialistCategory, string> = {
  code: "Implementation",
  security: "Security review",
  testing: "Test strategy",
  review: "Code review",
  data: "Data & analytics",
  devops: "Build & deployment",
  research: "Research & discovery",
  writing: "Content & docs",
  analysis: "Analysis & decisions",
  design: "Design & UI",
  product: "Product strategy",
  business: "Business & operations",
  legal: "Legal & compliance",
  comms: "Communications",
  finance: "Finance & compliance",
  silicon: "Semiconductor engineering",
};

const CAPTAIN_INSTRUCTION: Record<SpecialistCategory, string> = {
  code: "Design the architecture and implement the core modules for this brief. List files, key types, and the entry point.",
  security: "Threat-model this brief: trust boundaries, injection surfaces, auth needs, and a hardening checklist for the team's implementation.",
  testing: "Produce the test plan for this brief: unit, integration, and end-to-end cases with the exact commands to run them.",
  review: "Define the review bar for this build: what reviewers must check per domain before merge.",
  data: "Specify the data model, storage, and analytics events this product needs.",
  devops: "Specify the CI pipeline, packaging, and deployment steps for this product.",
  research: "Research the problem space of this brief: current best practice, prior art, constraints. Date your findings.",
  writing: "Draft the product content for this brief: README, onboarding copy, and docs structure.",
  analysis: "Break this brief into decisions: what must be chosen, the options, and a recommendation with risks.",
  design: "Produce the design system slice for this product: layout, components, palette, and the states every screen needs.",
  product: "Frame the product problem in this brief: user, evidence, hypothesis, and the metric that proves the win.",
  business: "Produce the business slice: unit economics, go-to-market motion, and the risks with owners.",
  legal: "Review this brief for legal exposure: privacy, licensing, terms — and state where counsel must sign.",
  comms: "Draft the communications slice: launch copy, changelog, and the announcement a journalist could verify.",
  finance: "Produce the finance slice: the statutory calendar, the registers and reconciliations this brief needs, and the control that proves each number.",
  silicon: "Produce the silicon slice: the design/verification/signoff flow stages this brief needs, with the criterion that closes each stage.",
};

/* ── local checkpoint ───────────────────────────────────── */

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function listBuilds(): Build[] {
  const raw = storage()?.getItem(SHIPYARD_KEY) ?? null;
  if (!raw) return [];
  try {
    const b = JSON.parse(raw) as Build[];
    return Array.isArray(b) ? b : [];
  } catch {
    return [];
  }
}

function save(list: Build[]): void {
  storage()?.setItem(SHIPYARD_KEY, JSON.stringify(list.slice(-BUILD_CAP)));
}

export function getBuild(id: string): Build | null {
  return listBuilds().find((b) => b.id === id) ?? null;
}

export function clearBuilds(): void {
  storage()?.removeItem(SHIPYARD_KEY);
}

/* ── build creation ─────────────────────────────────────── */

function orderInstruction(brief: string, domain: SpecialistCategory): string {
  return (
    `${DOMAIN_LABEL[domain]} — brief: “${brief}”\n${CAPTAIN_INSTRUCTION[domain]}\n\n` +
    `Work as the ${domain} domain of this build. Be concrete and specific to this brief. You may not claim work you did not do.`
  );
}

function domainOfSpecialist(id: string): SpecialistCategory | null {
  const head = id.split(".")[0];
  return head in DOMAIN_LABEL ? (head as SpecialistCategory) : null;
}

/**
 * Turn a brief into a build: route it with the product's own router, map
 * the selected specialists to their domains (in rank order, capped at
 * MAX_ORDERS), and open one work order per domain under its Captain.
 * A brief too vague to route opens a single honest research order.
 */
export function createBuild(brief: string, now: () => Date = () => new Date()): Build {
  const route = routeDeterministic(brief);
  const domains: SpecialistCategory[] = [];
  for (const c of route.selected) {
    const d = domainOfSpecialist(c.id);
    if (d && !domains.includes(d)) domains.push(d);
  }
  if (domains.length === 0) domains.push("research"); // discovery first, honestly
  const picked = domains.slice(0, MAX_ORDERS);

  const id = `build-${now().getTime().toString(36)}`;
  const orders: WorkOrder[] = picked.map((domain, i) => {
    const c = captainForDomain(domain);
    return {
      id: `${id}-order-${i + 1}`,
      domain,
      captainId: c?.id ?? "",
      captainName: c?.name ?? "",
      instruction: orderInstruction(brief, domain),
      status: "pending" as const,
    };
  });

  const build: Build = { id, brief, createdAt: now().toISOString(), status: "active", orders };
  save([...listBuilds(), build]);
  return build;
}

/* ── execution ──────────────────────────────────────────── */

function captainPrompt(order: WorkOrder): string {
  return `${order.instruction}\n\n[Shipyard work order ${order.id} — supervised by ${order.captainName}. Report only what this run actually produces.]`;
}

/**
 * Execute the next unfinished work order through a real run. The caller
 * supplies the run (the door passes the Generalist; probes inject one).
 * Only a truly executed run marks the order executed; anything else —
 * gated, refused, planned, error — marks it blocked, with the real note.
 */
export async function advanceBuild(
  buildId: string,
  run: (text: string) => Promise<RunResult>,
): Promise<Build | null> {
  const list = listBuilds();
  const build = list.find((b) => b.id === buildId);
  if (!build) return null;
  if (build.status === "settled") return build;

  // Pending work first; blocked orders are retried only once the rest
  // of the ship has moved — a block never skips ahead of real work.
  const order = build.orders.find((o) => o.status === "pending") ?? build.orders.find((o) => o.status === "blocked");
  if (!order) return build; // nothing left to run

  const result = await run(captainPrompt(order));
  order.outcome = result.outcome;
  order.note = result.note;
  order.receiptDigest = result.provenanceDigest;
  order.executedAt = new Date().toISOString();
  order.status = result.executed ? "executed" : "blocked";
  recomputeStatus(build);
  save(list);
  return build;
}

/** Run every pending order in sequence; stops at the first blocked order. */
export async function runAllOrders(
  buildId: string,
  run: (text: string) => Promise<RunResult>,
): Promise<Build | null> {
  let build = getBuild(buildId);
  while (build && build.orders.some((o) => o.status === "pending")) {
    build = await advanceBuild(buildId, run);
    if (build?.orders.some((o) => o.status === "blocked")) break;
  }
  return build;
}

function recomputeStatus(build: Build): void {
  if (build.status === "settled") return;
  const done = build.orders.every((o) => o.status === "executed" || o.status === "settled");
  build.status = done ? "done" : "active";
}

/** Settle the build: only possible when every order truly executed. */
export async function settleBuild(buildId: string): Promise<Build | null> {
  const list = listBuilds();
  const build = list.find((b) => b.id === buildId);
  if (!build) return null;
  if (build.status === "settled") return build;
  const incomplete = build.orders.filter((o) => o.status !== "executed" && o.status !== "settled");
  if (incomplete.length > 0) {
    build.status = "paused";
    save(list);
    return build;
  }
  for (const o of build.orders) o.status = "settled";
  const canon = JSON.stringify({
    id: build.id,
    brief: build.brief,
    orders: build.orders.map((o) => ({ id: o.id, domain: o.domain, status: o.status, outcome: o.outcome, receiptDigest: o.receiptDigest })),
  });
  build.buildDigest = await sha256Hex(canon);
  build.status = "settled";
  save(list);
  return build;
}

/* ── honest summary ─────────────────────────────────────── */

export function buildSummary(build: Build): string {
  const counts = build.orders.reduce(
    (acc, o) => ({ ...acc, [o.status]: (acc[o.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const parts = Object.entries(counts).map(([s, n]) => `${n} ${s}`);
  const verdict =
    build.status === "settled"
      ? "SETTLED — every order executed; the build is closed with a digest."
      : build.status === "done"
        ? "DONE — all orders executed; settle to close the build."
        : build.status === "paused"
          ? "PAUSED — some orders are blocked or unexecuted; a blocked order is never counted as done."
          : "ACTIVE — work orders remain.";
  return `${build.orders.length} work orders (${parts.join(", ")}) — ${verdict}`;
}
