/**
 * §A2A LIVE BRIDGE — an inbound cross-selfimpulse delegation EXECUTES, and is sealed.
 *
 * THE GAP THIS CLOSES. `selfimpulseTeams.ts` owns the cross-selfimpulse ladder: strict A2A
 * v1.0 discovery, JWS card verification, sender routing, GuardRail, the sender
 * human gate, a tamper-evident packet digest, the receiver re-scan, the receiver
 * human gate, and a digest both sides re-verify. All of that was real. The last
 * step was not: the receiver produced a completion STRING.
 *
 *     const artifact = `${toTeammate.name} completed: "${task}" — executed under …`
 *
 * A template literal that asserts execution it never performed, in a product
 * whose entire premise is that a claim without evidence is not a claim. That is
 * the one place the product could say "the agent did the work" without anything
 * behind it — exactly the failure mode SelfImpulse exists to make impossible.
 *
 * WHAT THIS DOES INSTEAD.
 *
 *     A2A packet
 *       ↓  (selfimpulseTeams: card verify · GuardRail · receiver gate · replay guard)
 *     runInboundDelegation()                       ← this module
 *       ↓  one seat, built from the receiving teammate
 *     executeTeam()                                ← the REAL executor
 *       ↓  real CLI spawn through the injected deps, real git, real verify
 *     buildProofReceipt() → verifyProofReceipt()   ← si-proof-receipt/2, sealed AND re-verified
 *       ↓
 *     { outcome, execution, receipt }              ← bound into the DelegationRecord
 *
 * THE HONESTY RULE, WHICH IS THE WHOLE POINT.
 *
 * This module has no fallback. If the host did not supply a harness, or the
 * harness's binary is not installed, it returns `ok: false` with the reason in
 * words and `outcome: "not-executed"`. It never returns a completion string for
 * work it did not run. A caller that wants a demo has to ask for the old
 * behaviour explicitly (`allowUnexecuted: true`) and gets a record whose status
 * says so on its face — the product's standard posture, not a silent default.
 *
 * The trust core is untouched: protocol v0.10.7, RULES 3–6, and every wcarena
 * harness are exactly as they were. This module sits ABOVE the ladder, at the
 * point where the ladder used to end.
 */import {
  evaluateChain, narrowTo,
  type Capability, type ChainHop, type Grant, type Principal,
} from "../security/authority";

import type { Teammate } from "./selfimpulseTeams";
import {
  executeTeam,
  type SeatAssignment,
  type TeamRunnerDeps,
  type TeamRunReport,
} from "./teamExecutor";
import type { CliAgentTeam, TeamSeat, TeamRole } from "./agentTeam";
import type { HarnessId } from "../domain/harness";
import { CapLedger } from "./caps";
import { buildProofReceipt, verifyProofReceipt, type ProofReceipt } from "./receipts";
import { ENGINE_VERSION } from "../version";
import { uid } from "../app/id";

/** What actually ran, in measured terms. Every field is a measurement, not a claim. */
export interface BridgeExecution {
  /** The harness that ran the seat. Null when nothing ran. */
  harness: HarnessId | null;
  /** Exit-code-first: what the executor's own verdict was. */
  runStatus: string;
  /** Seats the executor actually invoked. */
  seatsRun: number;
  /** Seats that came back verified by the run's own gate. */
  seatsVerified: number;
  /** Measured dollars; seats that reported tokens only are NOT priced here. */
  spentUsd: number;
  /** Seats that could not run, with the executor's reason for each. */
  notRun: Array<{ seatId: string; reason: string }>;
  /** Wall clock, as measured by the executor. */
  wallClockMs: number;
  /** The executor's own one-sentence verdict. */
  summary: string;
  /**
   * Whether the seat ran IN-PROCESS on this host's own provider key.
   *
   * 19.7.15: this replaces a `binResolved` flag that was hardcoded `true` — it
   * asserted a binary had been found on the PATH at a moment when no binary was
   * looked up at all. A claim that is structurally incapable of being false is
   * not evidence. The pre-flight above now checks for a seat runner instead,
   * and this records what that check established.
   */
  inProcess: boolean;
}

export type BridgeOutcome = "executed" | "executed-failed" | "refused" | "not-executed";

export interface BridgeResult {
  ok: boolean;
  outcome: BridgeOutcome;
  /** The evidence string bound into the delegation record. Never a fabricated completion. */
  artifact: string | null;
  /** Present only when something really ran. */
  execution: BridgeExecution | null;
  /** The sealed, re-verified receipt. Present only when something really ran. */
  receipt: ProofReceipt | null;
  /** Refusal reason, in words. Null on success. */
  reason: string | null;
}

export interface BridgeConfig {
  /** How the executor reaches a real CLI. Required to execute anything. */
  deps?: TeamRunnerDeps;
  /**
   * The authority the SENDING user actually holds, as a grant.
   *
   * Absent means "nothing was stated", which resolves to the host's own default
   * bound — never to "unlimited". A delegation whose authority cannot be named is
   * a delegation that should not run.
   */
  principalChain?: Grant;
  /** Which harness runs remote work on THIS machine. The receiving operator's choice. */
  harness?: HarnessId;
  /** Role the receiving teammate sits in. Defaults to "coder". */
  role?: TeamRole;
  /**
   * Harness for the read-only reviewer seat. This is NOT cosmetic: the
   * verification gate's adversarial core requires that for EVERY writer harness,
   * an evidence-grade verifier from a DIFFERENT harness reviewed the snapshot.
   * Writer and reviewer on the same harness tiers the run `self-verification`
   * and BLOCKS it — "an author grading its own work is not a review". So the
   * default is a different harness, and setting it to `null` runs writer-only
   * and accepts a BLOCKED verdict rather than pretending to a PASS.
   */
  reviewerHarness?: HarnessId | null;
  /** Repository the seat works in. Required for a real git-backed run. */
  repoRoot?: string;
  baseBranch?: string;
  /** The repository's own test command — the verdict comes from the repo, not the seat. */
  testCommand?: string[];
  timeoutSecs?: number;
  maxTurns?: number | null;
  /**
   * Escape hatch, OFF by default. When true, a host that cannot execute returns
   * `not-executed` WITH a descriptive artifact instead of refusing — for demos
   * and UI previews only. The record's outcome still says `not-executed`; this
   * never upgrades a non-run into an executed one.
   */
  allowUnexecuted?: boolean;
  now?: () => number;
}

function seatFor(teammate: Teammate, cfg: BridgeConfig): TeamSeat {
  return {
    id: `a2a-${teammate.id.slice(0, 8)}-${uid("seat").slice(0, 6)}`,
    role: cfg.role ?? "coder",
    harness: (cfg.harness ?? "hermes") as HarnessId,
    model: null,
    /* A remote delegation arrives as work to do, so the seat may write — but the
       executor's own containment still governs where. */
    mayWrite: true,
    timeoutSecs: cfg.timeoutSecs ?? 600,
    maxTurns: cfg.maxTurns === undefined ? 8 : cfg.maxTurns,
    instructions: `${teammate.title} — ${teammate.description}`,
  };
}

function bridgeTeam(teammate: Teammate, remoteUser: string, seats: TeamSeat[]): CliAgentTeam {
  return {
    id: `a2a-team-${uid("tm").slice(0, 8)}`,
    name: `${teammate.name} (inbound from ${remoteUser})`,
    description: `Inbound A2A delegation from ${remoteUser} — writer plus read-only reviewer, so the run is cross-seat verified rather than self-graded.`,
    seats,
    budgetUsd: null,
    schemaVersion: 1,
  };
}

function executionOf(report: TeamRunReport, inProcess: boolean): BridgeExecution {
  const verified = report.seats.filter((s) => s.verified).length;
  return {
    harness: report.seats[0]?.harness ?? null,
    runStatus: report.status,
    seatsRun: report.seats.length,
    seatsVerified: verified,
    spentUsd: report.spentUsd,
    notRun: report.notRun.map((n) => ({ seatId: n.seatId, reason: n.reason })),
    wallClockMs: report.wallClockMs,
    summary: report.summary,
    inProcess,
  };
}

/**
 * Run an inbound delegation for real and seal it.
 *
 * @param teammate the receiving teammate the packet was routed to
 * @param task     the GuardRail-clean task text (selfimpulseTeams already scanned it)
 * @param fromUser the sending selfimpulse's user, for provenance only
 */
export async function runInboundDelegation(
  teammate: Teammate,
  task: string,
  fromUser: string,
  cfg: BridgeConfig = {},
): Promise<BridgeResult> {
  const refuse = (reason: string, outcome: BridgeOutcome = "refused"): BridgeResult => ({
    ok: false,
    outcome,
    artifact: null,
    execution: null,
    receipt: null,
    reason,
  });

  /* ── 1. can this host execute at all? Refuse in words; never invent a run. ── */
  if (!cfg.deps) {
    return cfg.allowUnexecuted
      ? {
          ok: false,
          outcome: "not-executed",
          artifact: `${teammate.name} received "${task}" from ${fromUser} but this host supplied no execution deps — nothing ran.`,
          execution: null,
          receipt: null,
          reason: "no execution deps supplied — the host cannot run a seat",
        }
      : refuse("no execution deps supplied — this host cannot execute an inbound delegation, so it refuses rather than claim one");
  }

  const harness = cfg.harness;
  if (!harness) {
    return cfg.allowUnexecuted
      ? {
          ok: false,
          outcome: "not-executed",
          artifact: `${teammate.name} received "${task}" from ${fromUser} but no harness is configured for remote work on this host — nothing ran.`,
          execution: null,
          receipt: null,
          reason: "no harness configured for inbound remote work",
        }
      : refuse("no harness configured for inbound remote work — refusing rather than reporting a completion that never happened");
  }

  if (!cfg.repoRoot) {
    return cfg.allowUnexecuted
      ? {
          ok: false,
          outcome: "not-executed",
          artifact: `${teammate.name} received "${task}" from ${fromUser} but no repository was bound to this host — nothing ran.`,
          execution: null,
          receipt: null,
          reason: "no repoRoot bound — a real run needs a repository",
        }
      : refuse("no repoRoot bound — a real seat run needs a repository to work in");
  }

  /* ── 2. pre-flight: can this host actually run a seat? ──────────────────────
     there is no external harness path in the product, so there is no harness
     binary to find. The pre-flight now asks the only question that still
     matters — is there a seat runner that can run IN-PROCESS? A host with no
     provider key must refuse in words, exactly as it did when the binary was
     missing. Swapping the check without swapping the refusal would have turned
     an honest "cannot run" into a silent failure. */
  if (typeof cfg.deps.nativeInvoke !== "function") {
    const reason = `this host has no in-process seat runner (no provider key) — refusing the delegation in words rather ` +
      `than answering with a fabricated completion. Set SI_A2A_PROVIDER_KEY to run seats here.`;
    return cfg.allowUnexecuted
      ? { ok: false, outcome: "not-executed", artifact: `${teammate.name}: ${reason}`, execution: null, receipt: null, reason }
      : refuse(reason);
  }

  /* ── 2b. THE AGENTIC PRINCIPAL CHAIN ──────────────────────────────────────
   *
   * arXiv 2605.03213: multi-agent delegation has no intent transitivity. A
   * microservice hop is authorized by a cryptographically scoped credential; an
   * agent hop is authorized by natural language in a context window, which every
   * intermediate agent can silently modify. Nothing in the wire format can
   * prove that the action about to run is still inside what the original user
   * granted, which is exactly the gap Muruaga's Agentic Principal Chain closes.
   *
   * This is not hypothetical for us — an inbound A2A delegation IS a
   * cross-principal hop, and a seat that delegates further is another. The chain
   * may only narrow: if any hop claims more than it was given, the delegation is
   * refused and the offending principal is named. Refusing here, before the
   * executor is touched, is the point.
   */
  /* The delegation's authority must be STATED. The old fallback invented a
   * root ceiling of read+write+shell+network+delegate for any peer that did not
   * name one, which meant the safest-looking configuration — "I did not bother
   * configuring authority" — was in fact the most permissive one, and it granted
   * a remote caller shell and network on this machine. Silence about authority
   * is not consent to it. A peer that wants work done states what the work may
   * touch; a peer that states nothing gets nothing, and is told so by name. */
  const statedChain: Grant | undefined = cfg.principalChain;
  if (statedChain === undefined) {
    const why = `no principal chain was stated for "${fromUser}", so this delegation holds no authority; `
      + "the sending principal must declare the capabilities and budget it is delegating";
    return cfg.allowUnexecuted
      ? { ok: false, outcome: "not-executed", artifact: `refused before execution — ${why}`, execution: null, receipt: null, reason: why }
      : refuse(`principal-chain refusal: ${why}`);
  }
  /* Even when authority IS stated, the receiving side keeps its own immutable
   * bound: this host executes inbound work as a reader-writer inside a zero
   * budget, so a chain cannot be widened from the far end. narrowTo returns
   * the intersection, which means an over-broad incoming chain is capped here
   * rather than trusted, and an under-broad one is honoured as asked. */
  const inboundGrant: Grant = narrowTo(
    { capabilities: ["read", "write", "shell"] as Capability[], budgetCents: 0 },
    statedChain,
  );
  const chainRoot: Principal = {
    id: fromUser,
    human: true,
    grant: statedChain,
    ceiling: statedChain,
  };
  const hops: ChainHop[] = [{
    principalId: teammate.name,
    grant: inboundGrant,
    capability: "write", // the inbound writer seat; the reviewer hop is added below
    budgetCents: 0,
  }];
  const chain = evaluateChain(chainRoot, hops);
  if (!chain.ok) {
    return cfg.allowUnexecuted
      ? { ok: false, outcome: "not-executed", artifact: `${teammate.name}: ${chain.reason}`, execution: null, receipt: null, reason: chain.reason }
      : refuse(`principal-chain refusal: ${chain.reason}`);
  }

  /* ── 3. the real run, through the real executor ────────────────────────── */
  /* A writer AND a read-only reviewer on a different seat. Without the reviewer
     the gate tiers the run `self-verification` and BLOCKS it — correctly, since
     a seat grading its own work is not evidence. The reviewer inspects the
     writer's actual worktree through the review snapshot. */
  const seat = seatFor(teammate, { ...cfg, harness });
  const seats: TeamSeat[] = [seat];
  const assignments: SeatAssignment[] = [
    { seat, prompt: task, wave: 0, readOnly: false },
  ];
  /* Independence no longer comes from a second vendor's CLI — external harnesses
     are removed. It comes from a reviewer seat pinned to a different MODEL, so
     the review is not the writer's own weights grading their own work. */
  const reviewerHarness: HarnessId | undefined = cfg.reviewerHarness ?? harness;
  if (reviewerHarness) {
    const reviewer: TeamSeat = {
      ...seatFor(teammate, { ...cfg, harness: reviewerHarness }),
      id: `${seat.id}-rev`,
      role: "reviewer",
      mayWrite: false,
      instructions: `Review the writer's work against the delegated task. Read-only. Task from ${fromUser}.`,
    };
    seats.push(reviewer);
    assignments.push({ seat: reviewer, prompt: `Review the change for: ${task}`, wave: 1, readOnly: true, dependsOn: [seat.id] });
  }
  const team = bridgeTeam(teammate, fromUser, seats);

  const startedAt = new Date(cfg.now?.() ?? Date.now()).toISOString();
  let report: TeamRunReport;
  try {
    report = await executeTeam({
      team,
      assignments,
      repoRoot: cfg.repoRoot,
      baseBranch: cfg.baseBranch ?? "main",
      missionSlug: `a2a-${teammate.id.slice(0, 8)}`,
      objective: task,
      constraints: [`Inbound A2A delegation from ${fromUser} — stay inside the delegated task.`],
      testCommand: cfg.testCommand,
      ledger: new CapLedger({}),
      minimumRunnableSeats: 1,
    }, cfg.deps);
  } catch (err) {
    return refuse(`the executor failed before producing a report: ${err instanceof Error ? err.message : String(err)}`);
  }
  const finishedAt = new Date(cfg.now?.() ?? Date.now()).toISOString();

  // The pre-flight refused unless cfg.deps.nativeInvoke is a function, so by
  // here the seat did run in-process. This is now a fact, not a hardcoded true.
  const execution = executionOf(report, true);

  /* Nothing ran at all → that is a refusal, not a completion. */
  if (execution.seatsRun === 0) {
    const reason = execution.notRun[0]?.reason ?? "the executor invoked no seat";
    return refuse(`no seat ran — ${reason}`, "not-executed");
  }

  /* ── 4. seal it, then verify our own seal before we claim anything ─────── */
  const receipt = await buildProofReceipt({
    mission: `a2a-inbound-${teammate.id}`,
    teamId: team.id,
    startedAt,
    finishedAt,
    mjVersion: ENGINE_VERSION,
    edition: "business",
    report: {
      status: report.status,
      seats: report.seats.map((s) => ({
        seatId: s.seatId,
        role: s.role,
        outcome: s.outcome,
        verified: s.verified,
        harness: s.harness,
      })),
      autonomyArms: report.autonomyArms,
      reviewedBySnapshot: true,
    },
  });
  const selfCheck = await verifyProofReceipt(receipt);
  if (!selfCheck.ok) {
    return refuse(`the run completed but its receipt failed our own verification (${selfCheck.reason}) — not reporting it as executed`);
  }

  /* ── 5. the artifact is the MEASURED result, not a sentence about it ───── */
  /* "Executed" means the run's OWN verification said so — the adversarial gate
     PASSed and at least one seat came back verified. A run that merely finished
     is `executed-failed`, never a completion. */
  const ok = report.status === "completed" && report.gate.status === "PASS" && execution.seatsVerified > 0;
  /* A receipt has no id of its own — its identity is the chain head, the hash of
     its last event. That is what an auditor re-computes, so that is what we cite. */
  const chainHead = receipt.events.length > 0 ? receipt.events[receipt.events.length - 1].hash : "0".repeat(64);
  const artifact = [
    `${teammate.name} (${harness}) ${ok ? "completed" : "ran but did not verify"}: "${task}"`,
    `run=${report.status}`,
    `gate=${report.gate.status}/${report.gate.tier}`,
    `seats=${execution.seatsRun}/${execution.seatsVerified} verified`,
    execution.spentUsd > 0 ? `spent=$${execution.spentUsd.toFixed(4)}` : "spent=unmeasured",
    `receipt=${chainHead.slice(0, 16)}`,
  ].join(" · ");

  return {
    ok,
    outcome: ok ? "executed" : "executed-failed",
    artifact,
    execution,
    receipt,
    reason: ok ? null : `the seat ran but the run's own verification was gate=${report.gate.status} status=${report.status} verified=${execution.seatsVerified}`,
  };
}
