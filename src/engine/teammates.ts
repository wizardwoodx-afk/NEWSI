/**
 * TEAMMATES PLANE — 19.5.6 (crew UX, governance-hardened).
 *
 * The crew UX adapted from the multi-agent desktop genre: named agents side
 * by side, each with its own workspace, queue and context, messaging each
 * other in a visible timeline, decisions traceable. VH already produced ALL
 * of that data on every multi-member run — it just lived behind the chat.
 * This module surfaces it.
 *
 * HONESTY, stated twice because it is the whole point:
 *  1. These rows are a RUN-DERIVED mission-crew view of the real
 *     GeneralistResponse (captain.members + memberRuns), NOT persistent
 *     teammate instances. VH's persistent team system is SelfImpulseTeam
 *     (src/mission/selfimpulseTeams.ts); unifying the two is a separate,
 *     unshipped workstream and is never implied here.
 *  2. Anyone can SHOW a trace; VH SIGNS it. The mission mandate rides
 *     ECDSA P-256 (the authority plane); every member + tool receipt lands
 *     a sha256 VERIFIED TRACE DIGEST. The card language keeps that
 *     distinction exact — a digest is never relabelled a signature.
 *
 * Restyled in the VH premium light system (porcelain/gunmetal/Brooklyn); the
 * interaction model is adapted, not the color scheme.
 */
import type { GeneralistResponse, MemberRunView } from "./types";
import { SPECIALISTS } from "./registry";

export type TeammateStatus = "done" | "executing" | "gated" | "refused" | "error" | "idle";

export interface TeammateRow {
  id: string;
  name: string;
  role: string;
  status: TeammateStatus;
  queue: string[];          // the member's steps in words — tool attempts + outcomes
  context: string[];        // scope chips: category, tool bindings, honesty labels
  workspace: string;        // derived from the member's ACTUAL tool surface + run seam
  traceDigests: string[];   // real sha256 receipt digests from this run
  /** Present only when the authority plane actually issued this run's mandate. */
  authorityNote?: string;
}

export const CHIEF_STEWARD = "Captain";

const categoryOf = (specialistId: string): string => {
  const s = SPECIALISTS.find((x) => x.id === specialistId);
  return s?.category ?? "specialist";
};

const nameOf = (specialistId: string, fallback: string): string => {
  const s = SPECIALISTS.find((x) => x.id === specialistId);
  return s?.name ?? fallback ?? specialistId;
};

const statusFrom = (outcome: string | undefined, executed: boolean): TeammateStatus => {
  if (outcome === "answered") return "done";
  if (outcome === "error") return "error";
  if (outcome === "gated-out" || outcome === "gated") return "gated";
  if (outcome === "refused") return "refused";
  return executed ? "executing" : "idle";
};

/**
 * The workspace line is DERIVED from the run, never hardcoded:
 *  - pc.* tools exist only on reach-provenance members → only THEY may
 *    display the Reach computer-use session;
 *  - fs.* tools ride the run's stated workspace seam (node /
 *    browser-memory / browser-fs-access);
 *  - research-only toolsets state "no file workspace";
 *  - a toolless member states "no workspace" — silence is never the
 *    explanation.
 */
export function workspaceFor(run: MemberRunView | undefined, resp: GeneralistResponse): string {
  const tools = run?.tools ?? [];
  if (tools.includes("pc.browser") || tools.includes("pc.exec")) {
    return "Reach computer-use plane · per-mission exec/browser session · cookies off by default · gated";
  }
  if (tools.some((t) => t.startsWith("fs."))) {
    const ws = resp.workspace;
    if (!ws) return "fs tools bound · run workspace not stated (flagged, not hidden)";
    if (ws.kind === "node") return `node workspace · ${ws.root}`;
    if (ws.kind === "browser-memory") return "in-browser mission workspace (memory) · no disk writes";
    if (ws.kind === "browser-fs-access") return `user-picked directory · File System Access · ${ws.root}`;
    return `mission workspace · seam "${ws.kind}" stated by the run`;
  }
  if (tools.length > 0) return "research-only tools · no file workspace";
  return "toolless · no workspace (stated)";
}

/** The front door itself, as the coordinating teammate. */
export function chiefRow(resp: GeneralistResponse): TeammateRow {
  const routedNames = (resp.routed?.selected ?? []).map((c) => nameOf(c.id, c.id));
  const queue: string[] = [
    `routed → ${routedNames.length > 0 ? routedNames.join(", ") : "no specialists (stated)"}`,
  ];
  if (resp.outcome === "gated-out") queue.push("risky step → HUMAN GATE (run paused)");
  if (resp.authority) queue.push("mandate signed (ECDSA P-256)");
  const trace: string[] = [];
  if (resp.provenanceDigest) trace.push(resp.provenanceDigest);
  if (resp.authority && typeof (resp.authority as { mandateDigest?: string }).mandateDigest === "string") {
    trace.push((resp.authority as { mandateDigest: string }).mandateDigest);
  }
  return {
    id: "engine-chief-steward",
    name: CHIEF_STEWARD,
    role: "front door · routing · synthesis",
    status: statusFrom(resp.outcome, resp.executed),
    queue,
    context: ["risk tier → gate", "honesty rule", resp.executed ? "executed" : "not executed"],
    workspace: "no tool workspace — routing + synthesis only (stated)",
    traceDigests: trace,
    authorityNote: resp.authority
      ? `ECDSA P-256 mission authority · mandate digest ${(resp.authority as { mandateDigest: string }).mandateDigest.slice(0, 12)}… on record`
      : undefined,
  };
}

/** Every routed specialist as a teammate row with its own queue + trace digests. */
export function teammateRows(resp: GeneralistResponse): TeammateRow[] {
  const runs = resp.memberRuns ?? [];
  const results = resp.captain?.members ?? [];
  const rows: TeammateRow[] = [];
  for (const m of results) {
    const run = runs.find((r) => r.specialistId === m.specialistId);
    const queue = (run?.toolReceipts ?? []).map((t) => `${t.tool} → ${t.outcome}`);
    if (run && queue.length === 0) queue.push("no tool calls this run (stated)");
    if (run?.truncated) queue.push("step limit reached — labelled honestly");
    const tools = run?.tools ?? [];
    rows.push({
      id: m.specialistId,
      name: nameOf(m.specialistId, m.specialistId),
      role: categoryOf(m.specialistId),
      status: statusFrom(m.outcome, m.outcome === "answered"),
      queue,
      context: [
        categoryOf(m.specialistId),
        tools.length > 0 ? `tools ≤ ${tools.length} bound` : "toolless (stated)",
        "receipts on every call",
      ],
      workspace: workspaceFor(run, resp),
      traceDigests: [
        ...(m.memberDigest ? [m.memberDigest] : []),
        ...(run?.toolReceipts ?? []).map((t) => t.digest).filter((d): d is string => Boolean(d)),
      ],
    });
  }
  return rows;
}

export function teammatesFromResponse(resp: GeneralistResponse): TeammateRow[] {
  return [chiefRow(resp), ...teammateRows(resp)];
}

/** The visible coordination timeline (crew feed, VH facts). */
export function coordinationFeed(resp: GeneralistResponse): string[] {
  const lines: string[] = [];
  const members = resp.captain?.members ?? [];
  const n = members.length;
  lines.push(n > 0 ? `Messaged ${n} agent${n === 1 ? "" : "s"} — routing decision shown and scored` : "No agents messaged — stated why");
  for (const m of members) {
    lines.push(`${nameOf(m.specialistId, m.specialistId)} → ${m.outcome}${m.note ? ` · ${m.note.slice(0, 80)}` : ""}`);
  }
  if (resp.synthesis) lines.push("Chief synthesis ready — divergences surfaced, not hidden");
  if (resp.outcome === "gated-out") lines.push("RUN PAUSED at the human gate — nothing executes until resolved");
  if (resp.liveData && resp.liveData.verified === false) lines.push("live-data check: unverified claims flagged in the reply");
  return lines;
}

/** One-click sample mission — deterministic, HONESTLY LABELLED as a demo. */
export function playgroundMission(): { task: string; labelledSample: true; plan: string[] } {
  return {
    task: "Prepare the launch plan: verify the evidence, check the rollout path, and keep every decision traceable.",
    labelledSample: true,
    plan: [
      "Captain routes to the research + product bench",
      "each teammate runs its own queue with receipts",
      "divergences surfaced in the synthesis",
      "risky steps pause at the human gate",
      "every decision lands a verified trace digest you can check offline",
    ],
  };
}
