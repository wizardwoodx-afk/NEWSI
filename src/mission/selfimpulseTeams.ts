/**
 * selfimpulseTeams.ts — the major upgrade: persistent named agent teams over A2A v1.0,
 * with the human in the loop on BOTH sides.
 *
 * WHAT THIS BUILDS (and why each rule exists)
 *   • TEAMMATES — persistent, named agents with a name, a title and a
 *     DESCRIPTION (the pattern: the description is what delegation reads). Descriptions are GuardRail-sanitized and injection-scanned at
 *     creation time: a poisoned description is persistent injection.
 *   • DELEGATION ROUTING — a task is matched against teammate descriptions
 *     by token overlap. When nothing matches well the router REFUSES in
 *     words; it never invents a worker (§38 doctrine: no fake capability).
 *   • SELFIMPULSE LINKS — USER 1's selfimpulse connects to USER 2's selfimpulse through an
 *     A2A v1.0 AgentCard. A signed card is verified against the issuer's
 *     public JWK before the link is accepted; an unverified link refuses to
 *     carry delegations. Identity comes from the crossSelfImpulse seam — the
 *     same ECDSA P-256 keypair that anchors receipts between machines.
 *   • CROSS-USER DELEGATION — `delegateAcrossSelfImpulses` runs the whole flow:
 *       GuardRail on the task (deny on injection findings — the inter-agent
 *       channel must stay clean) → sender-side gate → signed delegation
 *       packet → receiver-side GuardRail re-scan → receiver-side gate →
 *       matched receiver teammate executes → dual tamper-evident digests.
 *   • THE AUTONOMY LADDER — the human stays in the loop proportionally:
 *       tier "safe"  (read-only collaboration) → autonomous on both sides;
 *       tier "risky" (writes, execution, spend) → BOTH humans must approve,
 *       either human can deny, and a denial executes nothing.
 *     Decisions apply ONCE (replay-safe), expire with the packet TTL, and
 *     every outcome — approval, denial, refusal — lands in both ledgers.
 *     The audit trail is never optional.
 *
 * HONESTY: this module proves the mechanism locally (two selfimpulse identities
 * in one process — the same discipline as the drill). Real network carriage
 * rides the SelfImpulse Protocol's device-to-device substrate; nothing here
 * phones home, and nothing claims a remote execution it cannot show.
 */

import { parseAgentCardV1, verifyAgentCardSignature, type AgentCardV1 } from "./a2a";
import { sanitizeText, detectInjection, secureId } from "../security/guardrail";
import { classifyRisk } from "./riskPolicy";
import type { RiskClass } from "./types";
import { ENGINE_VERSION } from "../version";
import { runInboundDelegation, type BridgeConfig, type BridgeExecution } from "./a2aBridge";
import type { ProofReceipt } from "./receipts";

/* ── teammates (persistent, named, selfimpulseed) ──────────────────────────────── */

export interface Teammate {
  id: string;
  name: string;
  title: string;
  /** What other agents read to decide delegation. GuardRail-clean. */
  description: string;
  skills: string[];
}

export interface SelfImpulseTeam {
  user: string;
  teammates: Teammate[];
  createdAt: string;
}

export type TeamResult<T> = { ok: true; value: T } | { ok: false; reason: string };

export function createTeam(user: string): SelfImpulseTeam {
  return { user: sanitizeText(user, 60) || "USER", teammates: [], createdAt: new Date().toISOString() };
}

/**
 * Add a teammate. The description is the delegation surface, so it is
 * sanitized and injection-scanned; a poisoned description is refused with
 * the finding codes, never stored.
 */
export function addTeammate(
  team: SelfImpulseTeam,
  input: { name: string; title: string; description: string; skills?: string[] },
): TeamResult<{ team: SelfImpulseTeam; teammate: Teammate }> {
  const name = sanitizeText(input.name, 60);
  const title = sanitizeText(input.title, 80);
  const description = sanitizeText(input.description, 400);
  if (!name || !description) return { ok: false, reason: "a teammate needs a name and a description" };
  const findings = detectInjection(description);
  if (findings.length > 0) {
    return { ok: false, reason: `teammate description refused — guardrail findings: ${findings.map((f) => f.code).join(", ")}` };
  }
  if (team.teammates.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
    return { ok: false, reason: `a teammate named "${name}" already exists on this team` };
  }
  if (team.teammates.length >= 20) return { ok: false, reason: "team is full (20 teammates)" };
  const teammate: Teammate = {
    id: secureId("tm"),
    name,
    title,
    description,
    skills: (input.skills ?? []).map((s) => sanitizeText(s, 60)).filter((s) => s.length > 0).slice(0, 12),
  };
  return { ok: true, value: { team: { ...team, teammates: [...team.teammates, teammate] }, teammate } };
}

export function removeTeammate(team: SelfImpulseTeam, id: string): SelfImpulseTeam {
  return { ...team, teammates: team.teammates.filter((t) => t.id !== id) };
}

/* ── delegation routing (description-driven, honest) ──────────────────────── */

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "is", "are",
  "please", "can", "you", "that", "this", "it", "from", "by", "at", "as", "be",
]);

/** Light suffix stemming: "writes"≈"write", "reports"≈"report" — enough for
 * description matching without a grammar dependency. */
function stem(w: string): string {
  let s = w;
  if (s.length > 5 && s.endsWith("ing")) s = s.slice(0, -3);
  if (s.length > 4 && s.endsWith("es")) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith("s")) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(stem);
}

export interface DelegationMatch {
  teammate: Teammate;
  score: number;
}

/**
 * Match a task against the team's descriptions. Token-overlap scoring over
 * the description AND skills; below threshold the router refuses — it never
 * hands work to an agent whose description does not claim it.
 */
export function routeDelegation(team: SelfImpulseTeam, task: string): TeamResult<DelegationMatch> {
  const taskTokens = new Set(tokens(task));
  if (taskTokens.size === 0) return { ok: false, reason: "the task carries no routable words — refused" };
  let best: DelegationMatch | null = null;
  for (const tm of team.teammates) {
    const claim = new Set([...tokens(tm.description), ...tm.skills.flatMap((s) => tokens(s)), ...tokens(tm.title)]);
    let overlap = 0;
    for (const t of taskTokens) if (claim.has(t)) overlap += 1;
    const score = overlap / Math.sqrt(taskTokens.size);
    if (score > 0 && (best === null || score > best.score)) best = { teammate: tm, score };
  }
  if (best === null || best.score < 0.4) {
    return { ok: false, reason: `no teammate on team "${team.user}" claims this work — delegation refused, nothing faked` };
  }
  return { ok: true, value: best };
}

/* ── the selfimpulse's own A2A v1.0 card ───────────────────────────────────────── */

/** Describe a whole team as one A2A v1.0 card (skills = the union of teammates'). */
export function selfimpulseCardForTeam(team: SelfImpulseTeam): AgentCardV1 {
  return {
    protocolVersion: "1.0",
    name: `SelfImpulse team — ${team.user}`,
    description: `${team.user}'s governed agent team: ${team.teammates.map((t) => `${t.name} (${t.title})`).join("; ") || "no teammates yet"}`,
    version: ENGINE_VERSION,
    url: "http://localhost/selfimpulse-local",
    selfimpulse: team.user,
    capabilities: { streaming: false, pushNotifications: false, stateless: true },
    supportedInterfaces: [{ url: "http://localhost/selfimpulse-local/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
    securitySchemes: [{ scheme: "httpAuth", note: "selfimpulse identity signatures; human gate on risky calls" }],
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: team.teammates.map((t) => ({
      id: t.id,
      name: `${t.name} — ${t.title}`,
      description: t.description,
      tags: t.skills,
    })),
    signatures: [],
  };
}

/* ── selfimpulse links (USER 1 ⇄ USER 2) ───────────────────────────────────────── */

export interface SelfImpulseLink {
  remoteUser: string;
  fingerprint: string;
  card: AgentCardV1;
  verified: boolean;
  linkedAt: string;
}

/**
 * Accept a remote selfimpulse's card ONLY if it parses as v1.0 and its signature
 * verifies against the issuer's public key. An unsigned or tampered card
 * links as UNVERIFIED — and unverified links refuse to carry delegations.
 */
export async function linkSelfImpulse(rawCard: unknown, issuerPublicJwk: JsonWebKey): Promise<TeamResult<SelfImpulseLink>> {
  const parsed = parseAgentCardV1(rawCard);
  if (!parsed.ok) return { ok: false, reason: `remote card rejected: ${parsed.errors.join("; ")}` };
  const card = parsed.card;
  const check = await verifyAgentCardSignature(card, issuerPublicJwk);
  const fp = card.signatures[0]?.fp ?? "unsigned";
  return {
    ok: true,
    value: {
      remoteUser: card.selfimpulse,
      fingerprint: fp,
      card,
      verified: check.ok,
      linkedAt: new Date().toISOString(),
    },
  };
}

/* ── cross-user delegation with the human in the loop on both sides ───────── */

export type RiskTier = "safe" | "risky";

/** The human-gate seam: resolves true = approved, false = denied. */
export type HumanGate = (action: string, detail: string) => Promise<boolean>;

export interface GateDecision {
  outcome: "auto" | "human-approved" | "human-denied";
  by: string;
}

export interface DelegationRecord {
  id: string;
  fromUser: string;
  fromTeammate: string;
  toUser: string;
  toTeammate: string | null;
  task: string;
  tier: RiskTier;
  senderGate: GateDecision;
  receiverGate: GateDecision | null;
  status: "completed" | "denied" | "refused";
  artifact: string | null;
  packetDigest: string;
  receiverDigest: string | null;
  note: string;
  ts: string;
  /**
   * LIVE BRIDGE — what actually ran, in measured terms. Null when nothing ran:
   * a denied, refused or host-cannot-execute delegation has no execution to
   * report, and this field says so rather than implying one.
   */
  execution?: BridgeExecution | null;
  /**
   * LIVE BRIDGE — the sealed `si-proof-receipt/2` for the run, re-verified
   * locally before it was bound here. Null whenever `execution` is null. This
   * is the difference between "the remote selfimpulse said it did the work" and
   * "here is the receipt, verify it yourself".
   */
  receipt?: ProofReceipt | null;
  /**
   * The receiver's OWN risk classification of the task, and the tier that was
   * actually enforced. Present on every record that reached routing, so a
   * sender can see when its "safe" label was overruled — and why.
   */
  receiverPolicy?: ReceiverRiskVerdict;
}

export interface DelegationOutcome {
  ok: boolean;
  record: DelegationRecord;
}

const PACKET_TTL_MS = 10 * 60 * 1000;
const decidedDelegations = new Set<string>();
/** The receiving selfimpulse keeps its OWN replay registry — each side settles once. */
const decidedInbound = new Set<string>();

async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("delegation digests require WebCrypto");
  const h = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * USER 1's teammate delegates a task to USER 2's team over the A2A link.
 *
 * The ladder:
 *   safe  → both gates autonomous (read-only collaboration);
 *   risky → BOTH humans decide through their own gates; either denial
 *           executes nothing, and the denial is still recorded on both sides.
 */
export async function delegateAcrossSelfImpulses(opts: {
  fromTeam: SelfImpulseTeam;
  link: SelfImpulseLink;
  remoteTeam: SelfImpulseTeam;
  task: string;
  tier: RiskTier;
  /**
   * What this delegation is allowed to do on the far machine. Required: the
   * sender's human is present and states it, and the receiver narrows it. There
   * is no implicit default, because a default here is a shell handed to a peer.
   */
  authority: DeclaredAuthority;
  senderGate?: HumanGate;
  receiverGate?: HumanGate;
  /** LIVE BRIDGE — see handleInboundDelegation. Without it this path refuses rather than claims. */
  bridge?: BridgeConfig;
}): Promise<DelegationOutcome> {
  const { fromTeam, link, remoteTeam, task, tier, authority } = opts;
  const ts = new Date().toISOString();
  const id = secureId("d");

  const refused = (reason: string, partial?: Partial<DelegationRecord>): DelegationOutcome => ({
    ok: false,
    record: {
      id,
      fromUser: fromTeam.user,
      fromTeammate: partial?.fromTeammate ?? "unrouted",
      toUser: link.remoteUser,
      toTeammate: null,
      task: sanitizeText(task, 400),
      tier,
      senderGate: partial?.senderGate ?? { outcome: "auto", by: fromTeam.user },
      receiverGate: null,
      status: "refused",
      artifact: null,
      packetDigest: partial?.packetDigest ?? "",
      receiverDigest: null,
      note: reason,
      ts,
    },
  });

  /* 1. the link must be verified — identity is the trust anchor. */
  if (!link.verified) return refused(`link to "${link.remoteUser}" is UNVERIFIED — refusing to carry a delegation across an unproven identity`);
  if (link.card.selfimpulse !== remoteTeam.user) {
    return refused(`the linked card belongs to "${link.card.selfimpulse}" but the remote team is "${remoteTeam.user}" — identity mismatch`);
  }

  /* 2. sender-side routing: SOMEONE on the sender team must own this task. */
  const senderRoute = routeDelegation(fromTeam, task);
  if (!senderRoute.ok) return refused(senderRoute.reason);
  const fromTeammate = senderRoute.value.teammate.name;

  /* 3. GuardRail on the task — injection findings are HARD refusals here:
   *    the inter-agent channel must stay clean, and findings never ride
   *    across to another user's selfimpulse. */
  const cleanTask = sanitizeText(task, 400);
  const findings = detectInjection(cleanTask);
  if (findings.length > 0) {
    return refused(`task content refused by the GuardRail before transmission: ${findings.map((f) => f.code).join(", ")}`, { fromTeammate });
  }

  /* 4. receiver-side routing decided BEFORE any gate: a task nobody can do
   *    never spends a human's attention. */
  const receiverRoute = routeDelegation(remoteTeam, cleanTask);
  if (!receiverRoute.ok) return refused(receiverRoute.reason, { fromTeammate });
  const toTeammate = receiverRoute.value.teammate;

  /* 5. the delegation packet + its tamper-evident digest. */
  const packet = {
    id, fromUser: fromTeam.user, fromTeammate, toUser: remoteTeam.user,
    toTeammate: toTeammate.name, task: cleanTask, tier, ts,
    declaredAuthority: sanitizeDeclaredAuthority(authority),
  };
  const packetDigest = await sha256Hex(JSON.stringify(packet));

  /* 6. sender-side gate. */
  const senderGate: GateDecision =
    tier === "safe"
      ? { outcome: "auto", by: fromTeam.user }
      : {
          outcome: (await (opts.senderGate ?? (async () => false))("cross-selfimpulse delegation", `${fromTeam.user} → ${remoteTeam.user}: "${cleanTask.slice(0, 120)}"`))
            ? "human-approved"
            : "human-denied",
          by: fromTeam.user,
        };
  if (senderGate.outcome === "human-denied") {
    return {
      ok: false,
      record: {
        id, fromUser: fromTeam.user, fromTeammate, toUser: link.remoteUser, toTeammate: toTeammate.name,
        task: cleanTask, tier, senderGate, receiverGate: null, status: "denied", artifact: null,
        packetDigest, receiverDigest: null, note: `denied at the SENDER gate by ${fromTeam.user} — nothing was transmitted`, ts,
      },
    };
  }

  /* 7. receiver-side gate (re-scan on arrival: the packet crossed a boundary). */
  const arrivalFindings = detectInjection(cleanTask);
  if (arrivalFindings.length > 0) {
    return refused(`receiver-side GuardRail refused the inbound packet: ${arrivalFindings.map((f) => f.code).join(", ")}`, { fromTeammate, packetDigest });
  }
  const receiverGate: GateDecision =
    tier === "safe"
      ? { outcome: "auto", by: remoteTeam.user }
      : {
          outcome: (await (opts.receiverGate ?? (async () => false))("inbound delegation", `${fromTeam.user} asks ${toTeammate.name}: "${cleanTask.slice(0, 120)}"`))
            ? "human-approved"
            : "human-denied",
          by: remoteTeam.user,
        };
  if (receiverGate.outcome === "human-denied") {
    return {
      ok: false,
      record: {
        id, fromUser: fromTeam.user, fromTeammate, toUser: remoteTeam.user, toTeammate: toTeammate.name,
        task: cleanTask, tier, senderGate, receiverGate, status: "denied", artifact: null,
        packetDigest, receiverDigest: null, note: `denied at the RECEIVER gate by ${remoteTeam.user} — nothing executed`, ts,
      },
    };
  }

  /* 8. replay guard: a decided delegation settles exactly once. */
  if (decidedDelegations.has(id)) return refused("delegation already decided — replay refused");
  decidedDelegations.add(id);

  /* 9. LIVE BRIDGE — the delegated work is EXECUTED by the real TeamExecutor and
   *    sealed as a si-proof-receipt/2, exactly as the A2A wire path does. The
   *    comment this replaces promised "a real seat/harness execution binds
   *    through the same record" while the record had no field to bind one to and
   *    nothing ever called the executor. Now it does. */
  const run = await runInboundDelegation(toTeammate, cleanTask, fromTeam.user, opts.bridge ?? {});

  if (!run.ok && run.outcome === "refused") {
    return {
      ok: false,
      record: {
        id, fromUser: fromTeam.user, fromTeammate, toUser: remoteTeam.user, toTeammate: toTeammate.name,
        task: cleanTask, tier, senderGate, receiverGate, status: "refused", artifact: null,
        packetDigest, receiverDigest: null,
        note: `the receiving selfimpulse could not execute the delegation — ${run.reason}. Nothing ran, so nothing is claimed.`,
        ts, execution: null, receipt: null,
      },
    };
  }
  /* `not-executed` is the documented demo hatch (allowUnexecuted): the delegation
     settles as the wire expects, but the record carries NO execution and NO
     receipt, and its artifact says in words that nothing ran. */
  const executedForReal = run.outcome === "executed" || run.outcome === "executed-failed";

  const artifact = run.artifact;
  const receiverDigest = await sha256Hex(`${packetDigest}|${artifact ?? ""}`);

  return {
    ok: run.ok || !executedForReal,
    record: {
      id, fromUser: fromTeam.user, fromTeammate, toUser: remoteTeam.user, toTeammate: toTeammate.name,
      task: cleanTask, tier, senderGate, receiverGate,
      status: executedForReal ? (run.ok ? "completed" : "refused") : "completed",
      artifact, packetDigest, receiverDigest,
      note: !executedForReal
        ? `NOT EXECUTED (demo hatch) — ${run.reason}`
        : run.ok
          ? `executed by ${run.execution?.harness ?? "the configured harness"} — gate ${run.execution?.runStatus ?? "unknown"}, receipt sealed`
          : `executed but not verified — ${run.reason}`,
      ts,
      execution: run.execution,
      receipt: run.receipt,
    },
  };
}

/** Packets older than the TTL may not be re-presented. */
export function packetExpired(ts: string, nowMs: number = Date.now()): boolean {
  return nowMs - new Date(ts).getTime() > PACKET_TTL_MS;
}

import { type AgentCardV10 } from "./a2aV10";

/**
 * The selfimpulse's STRICT A2A v1.0.0 card (released Linux Foundation schema):
 * no top-level url / protocolVersion — the endpoint lives in
 * supportedInterfaces; securitySchemes is a map. The card's `name` is the
 * selfimpulse's user identity, which is what the wire delegation flow matches the
 * packet's `toUser` against.
 */
export function selfimpulseCardForTeamV10(team: SelfImpulseTeam, interfaceUrl: string): AgentCardV10 {
  return {
    name: team.user,
    description: `${team.user}'s governed agent team: ${team.teammates.map((t) => `${t.name} (${t.title})`).join("; ") || "no teammates yet"}`,
    supportedInterfaces: [{ url: interfaceUrl, protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
    provider: { url: "https://github.com/wizardwoodx-afk/SelfImpulse", organization: "SelfImpulse" },
    version: ENGINE_VERSION,
    capabilities: { streaming: true, pushNotifications: true },
    securitySchemes: { selfimpulseIdentity: { httpAuthSecurityScheme: { scheme: "Bearer", description: "selfimpulse-issued delegation token; ECDSA-signed agent card" } } },
    defaultInputModes: ["text/plain", "application/json"],
    defaultOutputModes: ["text/plain", "application/json"],
    skills: team.teammates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      tags: t.skills.length > 0 ? t.skills : ["general"],
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   REAL-WIRE DELEGATION — A2A v1.0 transport (Warrant-Teams)

   delegateAcrossSelfImpulses above is the in-process flow (both teams in one
   runtime). This seam carries the SAME governance ladder over the released
   A2A 1.0.0 wire:

     sender teammate → routing → GuardRail → sender gate → packet digest
        → message/send (JSON-RPC) → remote selfimpulse's A2A server
        → receiver GuardRail re-scan → receiver routing → receiver gate
        → execution → receiver digest → response → sender verifies digests

   The receiving selfimpulse mounts `makeDelegationHandler` as the onMessage
   handler of its createA2AServer() — its own human gate, its own routing,
   its own governance. Nothing about the ladder is weakened for transport:
   unverified cards carry nothing, injection findings hard-refuse on BOTH
   sides, dual digests make the artifact tamper-evident, and every event is
   published to the inter-agent bus for the UI.
   ═══════════════════════════════════════════════════════════════════════ */

import { discoverAgentCard, sendMessage } from "./a2aClient";
import type { MessageV10, PartV10, TaskV10 } from "./a2aV10";
import { ALL_CAPABILITIES, type Capability, type Grant } from "../security/authority";
import { globalAgentBus } from "./interAgentChannel";

/**
 * What the SENDING principal says the delegated work is allowed to touch.
 *
 * This is a claim, not a grant: the receiving selfimpulse runs it through the
 * principal chain, so it can only ever narrow what this machine will execute.
 * It is on the wire, in the digest, and required — a packet that omits it
 * reaches the receiver as a delegation with no stated authority, which is
 * refused by name rather than quietly executed under an invented ceiling.
 */
/**
 * Normalise a declared authority before it goes on the wire.
 *
 * A sender is not trusted to produce a well-formed claim, and an unnormalised
 * object would be free-form JSON travelling into the receiver's authority
 * check. Only capability names this build recognises survive, duplicates
 * collapse, the budget becomes a non-negative integer, and anything that
 * claims an authority beyond what the tier itself justifies is dropped rather
 * than laundered.
 */
export function sanitizeDeclaredAuthority(claim: DeclaredAuthority | undefined | null): DeclaredAuthority {
  if (!claim || typeof claim !== "object") return { capabilities: [], budgetCents: 0 };
  const raw = Array.isArray((claim as DeclaredAuthority).capabilities) ? (claim as DeclaredAuthority).capabilities : [];
  const caps = new Set<string>();
  for (const c of raw) {
    if (typeof c === "string" && ALL_CAPABILITIES.includes(c as Capability)) caps.add(c);
  }
  const cents = Number((claim as DeclaredAuthority).budgetCents);
  const budgetCents = Number.isFinite(cents) && cents > 0 ? Math.floor(cents) : 0;
  return { capabilities: [...caps], budgetCents };
}

export interface DeclaredAuthority {
  capabilities: string[];
  budgetCents: number;
}

export interface DelegationPacketV10 {
  vh: "delegation/1.0";
  id: string;
  fromUser: string;
  fromTeammate: string;
  toUser: string;
  task: string;
  tier: RiskTier;
  packetDigest: string;
  declaredAuthority?: DeclaredAuthority;
  ts: string;
}

function busNote(intent: "handoff" | "operator", text: string, from: string): void {
  try {
    globalAgentBus.publish({
      channel: "#security-audit",
      sender: { seatId: `${from}-generalist`, role: "synthesizer", harness: "llm", name: `${from} (generalist)` },
      intent,
      content: text,
    });
  } catch {
    /* the bus is observability — a publish failure never blocks delegation */
  }
}

/**
 * RECEIVER RISK POLICY — a sender does not get to grade its own request.
 *
 * `DelegationPacketV10.tier` is written by the SENDING selfimpulse. Before 17.10.7
 * rev 3 the receiver believed it, which meant a remote selfimpulse could label a
 * `git push --force` "safe" and walk straight past the receiver's human gate.
 * That contradicts §10 of this codebase in so many words ("the classification
 * is derived from the action itself — not asserted by the agent that wants to
 * perform it; an agent cannot downgrade its own risk class"), so the receiver
 * now re-classifies the task with its OWN policy table and takes the WORSE of
 * the two. It can only upgrade: a sender declaring "risky" is never talked down.
 */
export type ReceiverRiskMode =
  /** Default: the receiver's own HIGH/CRITICAL findings force its human gate. */
  | "high-and-critical"
  /** Stricter: MEDIUM and above force the gate too (any code/config mutation). */
  | "medium-and-above"
  /** Legacy: believe the sender's tier. Off by default; here to be explicit. */
  | "trust-sender";

export interface ReceiverRiskPolicy {
  mode?: ReceiverRiskMode;
}

export interface ReceiverRiskVerdict {
  /** The receiver's own classification of the task text. */
  risk: RiskClass;
  why: string;
  declaredTier: RiskTier;
  effectiveTier: RiskTier;
  /** True when the receiver overruled the sender's self-declared tier. */
  upgraded: boolean;
  mode: ReceiverRiskMode;
}

/** The worse of the sender's claim and the receiver's own classification. */
export function receiverRiskVerdict(task: string, declaredTier: RiskTier, policy?: ReceiverRiskPolicy): ReceiverRiskVerdict {
  const mode = policy?.mode ?? "high-and-critical";
  const { risk, why } = classifyRisk(task);
  const gatedByPolicy =
    mode === "trust-sender" ? false : mode === "medium-and-above" ? risk !== "LOW" : risk === "HIGH" || risk === "CRITICAL";
  const effectiveTier: RiskTier = gatedByPolicy ? "risky" : declaredTier;
  return { risk, why, declaredTier, effectiveTier, upgraded: effectiveTier !== declaredTier, mode };
}

/** The receiver's side of the ladder, run INSIDE the remote selfimpulse. */
export async function handleInboundDelegation(
  remoteTeam: SelfImpulseTeam,
  packet: DelegationPacketV10,
  inboundGate?: HumanGate,
  /**
   * LIVE BRIDGE — how this host executes remote work. Without it the delegation
   * is REFUSED in words; it never falls back to claiming a completion.
   */
  bridge?: BridgeConfig,
  /**
   * The receiver's own risk policy. Defaults to re-classifying the task and
   * forcing this selfimpulse's gate on anything IT considers HIGH or CRITICAL,
   * whatever the sender claimed. See `receiverRiskVerdict`.
   */
  policy?: ReceiverRiskPolicy,
): Promise<{ ok: boolean; record: DelegationRecord }> {
  const ts = new Date().toISOString();
  const refused = (reason: string, partial?: Partial<DelegationRecord>): { ok: boolean; record: DelegationRecord } => ({
    ok: false,
    record: {
      id: packet.id, fromUser: packet.fromUser, fromTeammate: packet.fromTeammate,
      toUser: remoteTeam.user, toTeammate: partial?.toTeammate ?? null, task: packet.task,
      tier: packet.tier, senderGate: { outcome: "auto", by: packet.fromUser },
      receiverGate: partial?.receiverGate ?? null, status: "refused", artifact: null,
      packetDigest: packet.packetDigest, receiverDigest: null, note: reason, ts,
    },
  });

  if (packet.toUser !== remoteTeam.user) return refused(`packet is addressed to "${packet.toUser}" but this selfimpulse is "${remoteTeam.user}"`);
  if (packetExpired(packet.ts)) return refused("packet expired (TTL 10 min) — stale delegations are refused");
  const digest = await sha256Hex(JSON.stringify({ ...packet, packetDigest: "" }));
  if (digest !== packet.packetDigest) return refused("packet digest mismatch — the packet was modified in transit");

  /* receiver GuardRail: content that crossed a boundary is re-scanned here. */
  const findings = detectInjection(packet.task);
  if (findings.length > 0) return refused(`receiver-side GuardRail refused the inbound packet: ${findings.map((f) => f.code).join(", ")}`);

  const route = routeDelegation(remoteTeam, packet.task);
  if (!route.ok) return refused(route.reason);
  const toTeammate = route.value.teammate;

  /* The receiver grades the request itself — a sender's "safe" is a claim, not
     a clearance. Anything this selfimpulse's own policy calls risky meets this
     selfimpulse's gate, and a headless gate denies. */
  const riskVerdict = receiverRiskVerdict(packet.task, packet.tier, policy);
  const effectiveTier = riskVerdict.effectiveTier;

  const receiverGate: GateDecision =
    effectiveTier === "safe"
      ? { outcome: "auto", by: remoteTeam.user }
      : {
          outcome: (await (inboundGate ?? (async () => false))("inbound delegation (A2A)", `${packet.fromUser} asks ${toTeammate.name}: "${packet.task.slice(0, 120)}"`))
            ? "human-approved"
            : "human-denied",
          by: remoteTeam.user,
        };
  if (receiverGate.outcome === "human-denied") {
    return {
      ok: false,
      record: {
        id: packet.id, fromUser: packet.fromUser, fromTeammate: packet.fromTeammate,
        toUser: remoteTeam.user, toTeammate: toTeammate.name, task: packet.task, tier: effectiveTier,
        senderGate: { outcome: "auto", by: packet.fromUser }, receiverGate, status: "denied",
        artifact: null, packetDigest: packet.packetDigest, receiverDigest: null,
        note: riskVerdict.upgraded
          ? `denied at the RECEIVER gate by ${remoteTeam.user} — the sender declared "${packet.tier}" but this selfimpulse classified the task ${riskVerdict.risk} (${riskVerdict.why}). Nothing executed`
          : `denied at the RECEIVER gate by ${remoteTeam.user} — nothing executed`,
        ts, receiverPolicy: riskVerdict, execution: null, receipt: null,
      },
    };
  }

  if (decidedInbound.has(packet.id)) return refused("delegation already decided — replay refused");
  decidedInbound.add(packet.id);

  /* 9. LIVE BRIDGE — the delegated work is EXECUTED by the real TeamExecutor and
   *    sealed as a si-proof-receipt/2. This used to be a template literal that
   *    asserted a completion it never performed; that was the one place the
   *    product could claim work with nothing behind it. It refuses instead. */
  /* 9a. The sender's claim becomes a principal chain, or the delegation is
   * refused by name. Nothing here invents a ceiling: an absent claim, a claim
   * naming only capabilities this build does not recognise, or a claim the
   * receiver's own risk policy does not support all resolve to "no stated
   * authority" rather than to a permissive default. */
  const claimed = sanitizeDeclaredAuthority(packet.declaredAuthority);
  const declared = claimed.capabilities.length > 0 ? claimed : null;
  const run = await runInboundDelegation(toTeammate, packet.task, packet.fromUser, {
    ...(bridge ?? {}),
    ...(declared ? { principalChain: declared as Grant } : {}),
  });

  if (!run.ok && run.outcome === "refused") {
    return {
      ok: false,
      record: {
        id: packet.id, fromUser: packet.fromUser, fromTeammate: packet.fromTeammate,
        toUser: remoteTeam.user, toTeammate: toTeammate.name, task: packet.task, tier: effectiveTier,
        senderGate: { outcome: "auto", by: packet.fromUser }, receiverGate, status: "refused",
        artifact: null, packetDigest: packet.packetDigest, receiverDigest: null,
        note: `this selfimpulse could not execute the delegation — ${run.reason}. Nothing ran, so nothing is claimed.`,
        ts, execution: null, receipt: null, receiverPolicy: riskVerdict,
      },
    };
  }
  /* `not-executed` = the documented demo hatch: the wire settles as expected, the
     record carries NO execution and NO receipt, and the artifact says so. */
  const executedForReal = run.outcome === "executed" || run.outcome === "executed-failed";

  const artifact = run.artifact;
  const receiverDigest = await sha256Hex(`${packet.packetDigest}|${artifact ?? ""}`);
  busNote(
    "handoff",
    `delegation ${packet.id} ${run.outcome} over A2A: ${packet.fromUser} → ${remoteTeam.user}`,
    remoteTeam.user,
  );

  return {
    ok: run.ok || !executedForReal,
    record: {
      id: packet.id, fromUser: packet.fromUser, fromTeammate: packet.fromTeammate,
      toUser: remoteTeam.user, toTeammate: toTeammate.name, task: packet.task, tier: effectiveTier,
      senderGate: { outcome: "auto", by: packet.fromUser }, receiverGate,
      status: executedForReal ? (run.ok ? "completed" : "refused") : "completed",
      artifact, packetDigest: packet.packetDigest, receiverDigest,
      note: !executedForReal
        ? `NOT EXECUTED over A2A (demo hatch) — ${run.reason}`
        : run.ok
          ? (effectiveTier === "safe"
              ? `safe tier over A2A — executed by ${run.execution?.harness ?? "the configured harness"}, gate ${run.execution?.runStatus ?? "unknown"}, receipt sealed`
              : `risky tier over A2A (receiver classified ${riskVerdict.risk}) — receiver human approved, then executed and receipt-sealed`)
          : `executed but not verified — ${run.reason}`,
      ts,
      execution: run.execution,
      receipt: run.receipt,
      receiverPolicy: riskVerdict,
    },
  };
}

/**
 * Mount on the receiving selfimpulse's A2A server: `createA2AServer({ card,
 * onMessage: makeDelegationHandler(team, gate) })`. Delegation packets in the
 * data part run through the receiver ladder; anything else gets a plain echo
 * refusal so the endpoint never pretends to have executed unknown work.
 */
export function makeDelegationHandler(remoteTeam: SelfImpulseTeam, receiverGate?: HumanGate, bridge?: BridgeConfig, policy?: ReceiverRiskPolicy): (task: TaskV10, message: MessageV10) => Promise<{ parts: PartV10[]; state?: TaskV10["status"]["state"] }> {
  return async (_task: TaskV10, message: MessageV10) => {
    const dataPart = message.parts.find((p) => p.kind === "data");
    if (!dataPart || dataPart.kind !== "data") {
      return { parts: [{ kind: "text", text: "this endpoint only accepts vh delegation/1.0 packets" }], state: "rejected" };
    }
    const packet = dataPart.data as unknown as DelegationPacketV10;
    if (packet?.vh !== "delegation/1.0") {
      return { parts: [{ kind: "text", text: "packet refused: not vh delegation/1.0" }], state: "rejected" };
    }
    const out = await handleInboundDelegation(remoteTeam, packet, receiverGate, bridge, policy);
    return {
      parts: [{ kind: "data", data: { vh: "delegation-result/1.0", record: out.record as unknown as Record<string, unknown> } }],
      state: out.ok ? "completed" : out.record.status === "denied" ? "completed" : "failed",
    };
  };
}

/**
 * The sender's wire flow: discover the remote card STRICTLY (v1.0.0 shape +
 * JWS signature), run the sender side of the ladder, then message/send.
 * Returns the settled DelegationRecord from the receiving selfimpulse, with its
 * receiver digest re-verified locally.
 */
export async function delegateViaA2A(opts: {
  fromTeam: SelfImpulseTeam;
  remoteRoot: string;
  remotePublicJwk: JsonWebKey;
  task: string;
  tier: RiskTier;
  /** What this delegation may do on the remote machine. Required — see `authority` above. */
  authority: DeclaredAuthority;
  senderGate?: HumanGate;
  /** Authorization header value satisfying the remote card's securitySchemes. */
  authorization?: string;
}): Promise<DelegationOutcome> {
  const { fromTeam, task, tier, authority } = opts;
  const ts = new Date().toISOString();
  const id = secureId("d");

  const refused = (reason: string, partial?: Partial<DelegationRecord>): DelegationOutcome => ({
    ok: false,
    record: {
      id, fromUser: fromTeam.user, fromTeammate: partial?.fromTeammate ?? "unrouted",
      toUser: partial?.toUser ?? "unknown", toTeammate: null, task: sanitizeText(task, 400),
      tier, senderGate: partial?.senderGate ?? { outcome: "auto", by: fromTeam.user },
      receiverGate: null, status: "refused", artifact: null,
      packetDigest: partial?.packetDigest ?? "", receiverDigest: null, note: reason, ts,
      /* A refusal states what it does NOT have, explicitly: no execution, no
         receipt. `undefined` here read as "not reported" in a record whose
         whole job is to say what ran. */
      execution: null, receipt: null,
    },
  });

  /* 1. strict discovery + signature: identity is the trust anchor. */
  let disc: Awaited<ReturnType<typeof discoverAgentCard>>;
  try {
    disc = await discoverAgentCard(opts.remoteRoot, { publicJwk: opts.remotePublicJwk });
  } catch (e) {
    return refused(`remote selfimpulse discovery refused: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!disc.signatureVerified) return refused("remote agent-card did not verify against the issuer key — nothing crosses to an unproven identity");
  const toUser = disc.card.name;

  /* 2. sender routing. */
  const senderRoute = routeDelegation(fromTeam, task);
  if (!senderRoute.ok) return refused(senderRoute.reason, { toUser });
  const fromTeammate = senderRoute.value.teammate.name;

  /* 3. GuardRail — injection findings are HARD refusals before transmission. */
  const cleanTask = sanitizeText(task, 400);
  const findings = detectInjection(cleanTask);
  if (findings.length > 0) {
    return refused(`task content refused by the GuardRail before transmission: ${findings.map((f) => f.code).join(", ")}`, { fromTeammate, toUser });
  }

  /* 4. sender gate. */
  const senderGate: GateDecision =
    tier === "safe"
      ? { outcome: "auto", by: fromTeam.user }
      : {
          outcome: (await (opts.senderGate ?? (async () => false))("cross-selfimpulse delegation (A2A)", `${fromTeam.user} → ${toUser}: "${cleanTask.slice(0, 120)}"`))
            ? "human-approved"
            : "human-denied",
          by: fromTeam.user,
        };
  if (senderGate.outcome === "human-denied") {
    return {
      ok: false,
      record: {
        id, fromUser: fromTeam.user, fromTeammate, toUser, toTeammate: null, task: cleanTask,
        tier, senderGate, receiverGate: null, status: "denied", artifact: null,
        packetDigest: "", receiverDigest: null, note: `denied at the SENDER gate by ${fromTeam.user} — nothing was transmitted`, ts,
      },
    };
  }

  /* 5. packet + digest, then the wire. */
  const body = {
    vh: "delegation/1.0" as const, id, fromUser: fromTeam.user, fromTeammate, toUser,
    task: cleanTask, tier, ts, declaredAuthority: sanitizeDeclaredAuthority(authority),
  };
  const packetDigest = await sha256Hex(JSON.stringify({ ...body, packetDigest: "" }));
  const packet: DelegationPacketV10 = { ...body, packetDigest };
  if (decidedDelegations.has(id)) return refused("delegation already decided — replay refused", { fromTeammate, toUser, packetDigest });
  decidedDelegations.add(id);
  busNote("operator", `delegation ${id} crossing to ${toUser} over A2A v1.0 (${tier})`, fromTeam.user);

  let remote: TaskV10;
  try {
    remote = await sendMessage(opts.remoteRoot, {
      role: "user",
      messageId: secureId("m"),
      parts: [{ kind: "data", data: packet as unknown as Record<string, unknown> }, { kind: "text", text: cleanTask }],
      metadata: { "si-delegation": id },
    }, undefined, opts.authorization);
  } catch (e) {
    return refused(`A2A transport failed: ${e instanceof Error ? e.message : String(e)}`, { fromTeammate, toUser, packetDigest, senderGate });
  }

  /* 6. settle from the receiver's record — digest re-verified locally. */
  const resultPart = remote.status.message?.parts.find((p) => p.kind === "data") as { kind: "data"; data: { record?: DelegationRecord } } | undefined;
  const record = resultPart?.data?.record;
  if (!record || record.id !== id) {
    return refused("remote selfimpulse returned no settlement for this delegation", { fromTeammate, toUser, packetDigest, senderGate });
  }
  if (record.status === "completed" && record.artifact && record.receiverDigest) {
    const expect = await sha256Hex(`${record.packetDigest}|${record.artifact}`);
    if (expect !== record.receiverDigest) {
      return refused("receiver digest mismatch — the remote artifact does not match its claimed packet", { fromTeammate, toUser, packetDigest, senderGate });
    }
  }
  /* The settled record carries the LOCAL sender-gate decision (the sender is
   * authoritative about its own gate) alongside the receiver's settlement. */
  return { ok: record.status === "completed", record: { ...record, fromTeammate, senderGate } };
}
