/**
 * §CREW MISSION — the ONE reachable door from an objective to a verdict.
 *
 * WHY THIS FILE EXISTS. `teamExecutor.ts` is ~1,700 lines of real execution and
 * not one production call site reached it: `src/ui/store.ts` invoked
 * `askSelfImpulse19` and `fireTrigger`, and nothing else. `missionLoop.ts` could
 * reach `executeTeam`, but only through `src/selfimpulse/engine/bridge.ts`'s
 * `dispatch_mission`, which is itself only reachable from an MCP tool call.
 * So the crew — the part of the product that actually runs agents in isolated
 * worktrees, under a real budget ledger, behind a real gate — had no door a
 * person could walk through.
 *
 * `runCrewMission(objective, deps)` is that door, and it is a SEAM, not a
 * reimplementation. Every step of it calls code that already existed:
 *
 *   1. ROSTER + GOVERNANCE — `engine/crew.ts` (`createCrewSession`,
 *      `resolveGate`, `runCrewSession`) selects the crew from the task's
 *      domains, admits acts under the owner's mode, runs each member through the
 *      real member-agent loop with its own BEW receipt, and engages ITS OWN
 *      circuit breaker (3 consecutive consecutive failures) and per-member bench
 *      failover. Optional: absent `deps.crew`, none of it runs and nothing about
 *      the mission pretends otherwise.
 *   2. CUSTODY — `custody.issueRootEnvelope` mints the root authority, which is
 *      what makes `executeTeam`'s `BudgetGate` admission path reachable at all
 *      (without a root envelope the gate is `null` and every seat dispatches
 *      ungated by the atomic reservation).
 *   3. EXECUTE — `executeTeam`, on a `TeamRunRequest` this module composes.
 *   4. ARENA — `adversarialArena.runAdversarialDuel` attacks the writers' work
 *      with a caller-supplied real test runner.
 *
 * WHY THIS MODULE DOES NOT ALSO RUN THE MISSION-LOOP ARC
 *
 * `src/mission/missionLoop.ts` exposes the compose→dispatch→execute→gate→adapt
 * arc (evolution fold, lesson reflection, signed proof receipt). This module
 * deliberately does NOT call it. `probe/selfimpulse.test.ts` ("ONE THROAT 16.6.0")
 * is a static text scan that pins that arc's entry symbol to exactly three files
 * in `src/`: its own definition, the SelfImpulse throat
 * (`src/selfimpulse/engine/bridge.ts`) and the VH engine face
 * (`src/pages/LoopPage.tsx`). A fourth path is precisely the regression that
 * test exists to stop — and this comment names the symbol, so the scan counts a
 * mention as a path just as it counts a call. Reaching the arc from here through
 * `bridge.ts` instead would invert the layering the same file defends (the
 * control plane reaching INTO the engine, never the engine importing it).
 *
 * So there are TWO sanctioned doors, and this is the custody one:
 *   • `runCrewMission(objective, deps)` — THIS module. Full custody, the
 *     `BudgetGate` admission, the review snapshot, the gate verdict, the merge
 *     authority, the arena stamp, per-seat resume. Its report is the raw
 *     `TeamRunReport`.
 *   • `runSelfImpulseMission(objective, missionId, opts)` in
 *     `src/selfimpulse/engine/bridge.ts` — the loop arc. Its report is a
 *     `MissionOutcome` (status, cycle, gate, receipt) rather than the raw run.
 * A caller that wants the evolution/lessons/receipt fold calls the bridge; a
 * caller that wants the gate and the merge authority calls this.
 *
 * NOTHING HERE DECIDES WHETHER THE WORK SUCCEEDED. The verdict is always the
 * executor's own: `TeamRunReport.gate` (the adversarial gate), `report.merge.gate`
 * (whether the branches may merge), `report.arena` (the governance-arena stamp)
 * and `report.seats[].verified` (the repository's own check, exit code read, not
 * claimed). This file composes, routes and reports; it never grades.
 *
 * HONESTY RULES THIS FILE KEEPS
 *   - A missing crew is a refusal in words, never a fabricated run.
 *   - A crew cooled down by its breaker stops the mission with the breaker's own
 *     sentence as the reason. It does not dispatch seats "anyway, partially".
 *   - No provider means the crew layer executes nothing and says so; the
 *     executor layer still reports whatever ITS deps could actually measure.
 *   - `spentUsd` is the sum of what the agents REPORTED. A seat that reported
 *     tokens but no price is counted as unknown, not as $0.
 */

import {
  createSeatStepLedger,
  executeTeam,
  seatBriefing,
  type CliResult,
  type SeatAssignment,
  type SeatStepLedger,
  type TeamRunReport,
  type TeamRunRequest,
  type TeamRunnerDeps,
} from "./teamExecutor";
import { composeAssignments, loadCrews } from "./missionLoop";
import { CapLedger } from "./caps";
import { issueRootEnvelope, BudgetGate, type AuthorityEnvelope } from "./custody";
import { prepareAutonomy, type AutonomyRequest } from "./autonomyRuntime";
import { loadGatePolicy, type GatePolicy } from "./verifyGate";
import type { CliAgentTeam, TeamRole, TeamSeat } from "./agentTeam";
import { runAdversarialDuel, type AdversarialAttackVector, type HardeningReport } from "./adversarialArena";
import {
  createCrewSession,
  getCrewSession,
  resolveGate,
  runCrewSession,
  switchMode,
  type CrewSession,
} from "../engine/crew";
import type { CrewMode } from "../engine/modes";
import type { LotusMode } from "../engine/lotus";
import type { ProviderConfig } from "../engine/types";

/* ------------------------------------------------------------------ the request */

export interface CrewMissionDeps {
  /**
   * The crew to run. Omitted: the governed crew's roster (`deps.crew`), else the
   * last persisted crew, else the last prebuilt one. Absent all three, this is a
   * refusal, not a run.
   *
   * Precedence is deliberate: an explicit `team` wins over a crew-derived roster,
   * because the owner naming a roster is a decision the crew must not overwrite.
   * When both are supplied the outcome says which one ran.
   */
  team?: CliAgentTeam;
  /** Host runner deps. Omitted: a runner that refuses in words — never faked. */
  runner?: TeamRunnerDeps;
  /** The repository the mission runs in (default "."). */
  repoRoot?: string;
  /** The repository's base branch (default "main"). */
  baseBranch?: string;
  /** The repository's OWN verification command, e.g. ["npm","test"]. */
  testCommand?: string[];
  /** Hard USD cap for the whole mission. Default 5. */
  budgetUsd?: number;
  /**
   * The human who pressed the button. Supplying it is what mints the root
   * authority envelope, which is what makes `executeTeam`'s atomic budget
   * admission live. Omitted: the mission runs with the ledger's own cap and the
   * outcome says the custody chain was absent.
   */
  principal?: string;
  /** Authority window in ms (default 30 min). Only meaningful with `principal`. */
  authorityTtlMs?: number;
  /**
   * Per-seat step ledger. Omitted: a localStorage-backed one, so a re-run of the
   * same mission slug resumes instead of re-applying. Pass `createSeatStepLedger({store:null})`
   * for a deliberately fresh run.
   */
  steps?: SeatStepLedger;
  /** The mission slug. THIS is part of every step id, so reuse it to resume. */
  missionSlug?: string;
  /**
   * How seats are assigned. Default: `missionLoop.composeAssignments` — one seat
   * per roster entry, waves by role, read-only for non-writers, single turn.
   *
   * Override it to add a `followUp` (the repair pass `executeTeam` already
   * supports) or to place a seat in a wave of your choosing. This is the ONLY way
   * to ask for a multi-turn seat, because `composeAssignments` never emits one;
   * without this the per-step resume path in the step ledger would be
   * unreachable from the entry point, which is exactly the bug it exists to fix.
   */
  compose?: (team: CliAgentTeam, objective: string) => SeatAssignment[];
  gatePolicy?: GatePolicy;

  /**
   * OPT-IN. The governed crew layer (`engine/crew.ts`). Its circuit breaker and
   * per-member bench failover live inside `runCrewSession`, so this is the only
   * way they engage — and they are why a crew is allowed to say "cooled down".
   */
  crew?: {
    /** Required. `runCrewSession` runs each member through `runMemberAgent`. */
    provider: ProviderConfig;
    /**
     * The crew's own HTTP seam. It lives HERE, beside `provider`, on purpose:
     * `fetchImpl` and `provider` are the two halves of one member-agent call, and
     * splitting them across `deps.fetchImpl` / `deps.crew.provider` is how a crew
     * ends up silently dialling the REAL provider because the test stub was one
     * level too high. With no `fetchImpl` the crew uses `globalThis.fetch` — the
     * production path — which is exactly what an app wants and never what a probe
     * wants, so the outcome states which one was used.
     */
    fetchImpl?: typeof fetch;
    /** Owner's throttle. Default "manual": every act waits at the human gate. */
    mode?: CrewMode;
    lotusMode?: LotusMode;
    /**
     * The owner's gate answers, by specialist id. Applied through
     * `crew.resolveGate` — a caller that passes none gets a mission that stops
     * at `awaitingGate` with every ask spelled out, which is the honest result
     * under manual mode.
     */
    decisions?: Array<{ specialistId: string; approve: boolean }>;
    /** Per-member agent-loop step ceiling. */
    maxSteps?: number;
  };

  /** OPT-IN. Run the adversarial arena against the writers' work. */
  arena?: {
    vectors?: AdversarialAttackVector[];
    maxRounds?: number;
    /** REQUIRED for a non-simulated duel: runs the generated probe and reports the real exit code. */
    testRunner?: (script: string) => Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }>;
    /** Attack/defender seat ids on the bus. Default: the run's writer and reviewer. */
    attackerSeatId?: string;
    defenderSeatId?: string;
  };

  emit?: (ev: { phase?: string; note?: string }) => void;
  now?: () => number;
}

/* ------------------------------------------------------------------ the outcome */

/**
 * The counters `crew.runCrewSession` returns. The crew module does not export
 * its own `RunOutcome`, and it is a plain data shape, so it is declared here
 * rather than inferred — an inferred `any` would let a change in the crew module
 * silently reshape this module's public record.
 */
export interface CrewRunCounters {
  answered: number;
  failed: number;
  reassigned: number;
  escalated: number;
  refused: number;
}

/** One honest sentence about the crew layer. Never a claim about the mission. */
export interface CrewGovernanceRecord {
  sessionId: string;
  status: CrewSession["status"];
  mode: CrewMode;
  total: number;
  answered: number;
  failed: number;
  reassigned: number;
  escalated: number;
  gated: number;
  /** The breaker's own words when it cooled the crew down. */
  breakerNote: string | null;
  sessionReceipt: string | null;
  /** Per-member slot state, in the crew module's own vocabulary. */
  slots: Array<{ slotId: string; specialistId: string; domain: string; status: string; attempts: number; verdict?: string; replacedBy?: string; error?: string }>;
  /** Members still waiting at the human gate. Each needs `crew.resolveGate`. */
  atGate: Array<{ slotId: string; specialistId: string; ask: string }>;
  /** The crew runner's own counters, or null when the runner never ran. */
  counters: CrewRunCounters | null;
}

export interface CrewMissionOutcome {
  /** Minted here when the caller supplies none, so the receipt chain has one id. */
  missionId: string;
  missionSlug: string;
  objective: string;
  /** Executor status, verbatim: completed | partial | blocked | aborted. */
  status: string;
  /**
   * THE VERDICT, in one sentence a person can act on. It states what ran, what
   * was verified by the repository's own check, what the gate decided about the
   * merge, and — when money is unknown — says so rather than rounding to $0.
   */
  verdict: string;
  /** The executor's full measured report. This, not `verdict`, is the evidence. */
  report: TeamRunReport | null;
  teamId: string;
  teamName: string;
  /**
   * Which executor ran. Always `"direct"` here: the mission-loop arc in
   * `src/mission/missionLoop.ts` is reached through its own sanctioned door,
   * `runSelfImpulseMission` in `src/selfimpulse/engine/bridge.ts`, and
   * `probe/selfimpulse.test.ts` reserves that path for exactly one file. This
   * field exists so a record can never be ambiguous about which executor
   * produced it.
   */
  engineUsed: "direct";
  /** The root authority that permitted the run, when one was minted. */
  authority: { id: string; principal: string; budgetUsd: number | null } | null;
  /** The cap the seats actually reserved against, as `BudgetGate` accounted it. */
  budget: TeamRunReport["budget"] | null;
  /** What the ledger recorded — charged USD is what the agents REPORTED. */
  spend: { chargedUsd: number; reportedBySeats: string[]; unknownUsdSeats: string[] };
  crew: CrewGovernanceRecord | null;
  arena: HardeningReport | null;
  /** True when the mission asked to resume and at least one step was reused. */
  resumed: boolean;
  steps: { reused: string[]; applied: string[]; unresolved: string[] };
  notes: string[];
  runMs: number;
}

/* ------------------------------------------------------------------ helpers */

const MISSION_SCOPE = ["run:team-mission", "spend:capped-by-ledger", "write:worktrees", "read:review-snapshot", "role:any"];

const ROLE_BY_CATEGORY: Record<string, TeamRole> = {
  coding: "coder",
  testing: "coder",
  review: "reviewer",
  research: "planner",
  security: "security",
  design: "architect",
  operations: "synthesizer",
};

const WRITER_ROLES = new Set<TeamRole>(["coder", "debugger"]);

function seatFromSpecialist(slotId: string, specialistId: string, domain: string, role: TeamRole): TeamSeat {
  const mayWrite = WRITER_ROLES.has(role);
  return {
    id: slotId,
    role,
    // A seat is a ROLE filled by a harness, and the only two harnesses the
    // product ships are the in-process ones. A direct `llm` seat cannot write
    // (validateTeam refuses it), so every writer is `hermes`.
    harness: mayWrite ? "hermes" : "llm",
    model: null,
    mayWrite,
    maxRisk: mayWrite ? "MEDIUM" : "LOW",
    timeoutSecs: 600,
    maxTurns: null,
    instructions: `Domain: ${domain}. Specialist: ${specialistId}.`,
  };
}

/**
 * The crew's roster, as an executor team.
 *
 * The seats carry the CREW's work, not the mission's outcome: each member's
 * measured answer (its BEW verdict and digest) is folded into the seat's
 * instructions so the executor's agent starts from what the governed analysis
 * actually found. The mission's result is the executor's report, never this.
 */
function teamFromCrewSession(session: CrewSession): CliAgentTeam {
  const seen = new Set<string>();
  const seats: TeamSeat[] = [];
  for (const slot of session.slots) {
    // Only settled work becomes a seat. A queued/active member has produced no
    // finding, and a seat built on nothing would be a seat invented to look busy.
    if (slot.status !== "answered" && slot.status !== "reassigned" && slot.status !== "failed") continue;
    const role = ROLE_BY_CATEGORY[slot.domain] ?? "planner";
    let id = slot.slotId;
    let n = 2;
    while (seen.has(id)) id = `${slot.slotId}-${n++}`;
    seen.add(id);
    const seat = seatFromSpecialist(id, slot.specialistId, slot.domain, role);
    seat.instructions = `Specialist: ${slot.specialistId} (${slot.domain}). BEW verdict: ${slot.verdict ?? "not recorded"}.`;
    seats.push(seat);
  }
  return {
    id: `crew.session.${session.id}`,
    name: `Crew ${session.id}`,
    description: `The governed crew for "${session.task}" — ${session.selection.crew.length} selected, ${session.slots.length} slot(s) after failover.`,
    seats,
    budgetUsd: null,
    schemaVersion: 1,
    revision: 1,
    createdAt: new Date(session.createdAt).toISOString(),
  };
}

function crewRecord(session: CrewSession, run: CrewRunCounters | null): CrewGovernanceRecord {
  const breaker = session.feed.events.find((e) => e.kind === "escalated" && /breaker/i.test(e.line));
  return {
    sessionId: session.id,
    status: session.status,
    mode: session.mode.mode,
    total: session.selection.crew.length,
    answered: session.slots.filter((s) => s.status === "answered").length,
    failed: session.slots.filter((s) => s.status === "failed").length,
    reassigned: session.slots.filter((s) => s.status === "reassigned").length,
    escalated: session.slots.filter((s) => s.status === "escalated").length,
    gated: session.slots.filter((s) => s.status === "gated").length,
    breakerNote: breaker?.line ?? null,
    sessionReceipt: session.sessionReceipt ?? null,
    /* The runner's OWN counters, kept beside the re-count of the slots. They can
       disagree and the disagreement is worth seeing: a reassignment pushes a
       retry slot, so the slot re-count can only ever be >= the runner's count. */
    counters: run,
    slots: session.slots.map((s) => ({
      slotId: s.slotId,
      specialistId: s.specialistId,
      domain: s.domain,
      status: s.status,
      attempts: s.attempts,
      ...(s.verdict ? { verdict: s.verdict } : {}),
      ...(s.replacedBy ? { replacedBy: s.replacedBy } : {}),
      ...(s.error ? { error: s.error } : {}),
    })),
    atGate: session.slots.filter((s) => s.status === "gated").map((s) => ({ slotId: s.slotId, specialistId: s.specialistId, ask: s.gateAsk ?? `${s.specialistId} waits at your gate under ${session.mode.mode} mode` })),
  };
}

function spendOf(report: TeamRunReport): CrewMissionOutcome["spend"] {
  const reported: string[] = [];
  const unknown: string[] = [];
  for (const s of report.seats) {
    const usd = s.usage?.costUsd;
    if (typeof usd === "number") reported.push(s.seatId);
    else if ((s.usage?.tokens ?? 0) > 0) unknown.push(s.seatId);
  }
  return { chargedUsd: report.spentUsd, reportedBySeats: reported, unknownUsdSeats: unknown };
}

function stepsOf(report: TeamRunReport): CrewMissionOutcome["steps"] {
  const reused: string[] = [];
  const applied: string[] = [];
  const unresolved: string[] = [];
  for (const s of report.seats) {
    const id = s.idempotency;
    if (!id) continue;
    for (const x of id.reused) reused.push(`${s.seatId}/${x}`);
    for (const x of id.applied) applied.push(`${s.seatId}/${x}`);
    for (const x of id.unresolved) unresolved.push(`${s.seatId}/${x}`);
  }
  return { reused, applied, unresolved };
}

/** The one sentence a person acts on. Built from measured fields only. */
function verdictOf(args: { objective: string; report: TeamRunReport | null; crew: CrewGovernanceRecord | null; spend: CrewMissionOutcome["spend"]; arena: HardeningReport | null; refusal?: string }): string {
  if (args.refusal) return args.refusal;
  const r = args.report;
  if (!r) return "Nothing ran: the executor returned no report, so there is no verdict to report.";
  const ran = r.seats.filter((s) => s.turnsRun > 0).length;
  const reused = r.seats.filter((s) => (s.idempotency?.reused.length ?? 0) > 0).length;
  const verified = r.seats.filter((s) => s.verified).length;
  const parts: string[] = [];
  parts.push(`${args.objective}: ${r.status.toUpperCase()}.`);
  if (ran > 0) parts.push(`${ran} seat(s) ran real agent turns`);
  else if (reused > 0) parts.push(`no seat was dispatched — ${reused} seat(s) were already applied by an earlier run of this mission`);
  else parts.push("no seat was dispatched");
  parts.push(`${verified} were confirmed by the repository's own check.`);
  parts.push(`Gate: ${r.gate.status} (${r.gate.tier}).`);
  parts.push(r.merge.gate.allowed ? `Merge: ALLOWED — ${r.merge.gate.reason}` : `Merge: BLOCKED — ${r.merge.gate.reason}`);
  if (r.arena) parts.push(`Governance arena: ${r.arena.gate} (${r.arena.defended}/${r.arena.total} defended).`);
  else parts.push("Governance arena: no stamp — the preflight runner itself could not execute, so this is an honest gap, not a pass.");
  if (args.arena) parts.push(`Adversarial hardening: ${args.arena.hardened ? "CERTIFIED" : "REMEDIATION REQUIRED"} at ${args.arena.defenseScore}%${args.arena.isSimulated ? " (SIMULATED — no real test runner was attached)" : ""}.`);
  if (args.crew) {
    parts.push(`Crew: ${args.crew.answered}/${args.crew.total} answered, ${args.crew.reassigned} reassigned from the bench, ${args.crew.escalated} escalated, ${args.crew.gated} still at your gate${args.crew.breakerNote ? `; ${args.crew.breakerNote}` : ""}.`);
  }
  parts.push(
    args.spend.unknownUsdSeats.length > 0
      ? `Spend: $${args.spend.chargedUsd.toFixed(4)} reported by ${args.spend.reportedBySeats.length} seat(s); ${args.spend.unknownUsdSeats.length} seat(s) reported tokens with no price, so their dollar cost is UNKNOWN rather than zero.`
      : `Spend: $${args.spend.chargedUsd.toFixed(4)} reported.`,
  );
  return parts.join(" ");
}

/* ------------------------------------------------------------------ the entry point */

/**
 * Start a mission, run the crew, get a verdict.
 *
 * This is the function `src/ui/store.ts` (and any other caller) invokes. It is
 * the only supported way in: nothing else in `src/` calls `executeTeam` on a
 * path a person can reach.
 *
 * @param objective What the mission is for, in words.
 * @param deps      Host capabilities and policy. `provider` for the crew layer
 *                  lives under `deps.crew`; the executor's own agent runner is
 *                  `deps.runner`.
 */
export async function runCrewMission(objective: string, deps: CrewMissionDeps = {}): Promise<CrewMissionOutcome> {
  const now = deps.now ?? (() => Date.now());
  const t0 = now();
  const notes: string[] = [];
  const missionSlug = deps.missionSlug ?? `crew-mission-${t0.toString(36)}`;
  const budgetUsd = deps.budgetUsd ?? 5;

  /* ── 1. ROSTER: the crew layer, when the caller asked for it ─────────────── */
  let crew: CrewGovernanceRecord | null = null;
  let crewRun: CrewRunCounters | null = null;
  let crewRefusal: string | null = null;
  let crewTeam: CliAgentTeam | null = null;

  if (deps.crew) {
    const session = createCrewSession(objective, {
      ...(deps.crew.mode ? { mode: deps.crew.mode } : {}),
      ...(deps.crew.lotusMode ? { lotusMode: deps.crew.lotusMode } : {}),
      at: t0,
    });
    /* The owner's gate answers are applied through crew.ts's own resolveGate, so
       the crew's status recomputation and its feed lines are the real ones. */
    for (const d of deps.crew.decisions ?? []) {
      const slot = session.slots.find((s) => s.specialistId === d.specialistId && s.status === "gated");
      if (slot) resolveGate(session.id, slot.slotId, d.approve, now());
    }
    /* Nothing was approved and nothing is queued: the mission stops here rather
       than dispatching seats under a mode the owner never chose. */
    const runnable = session.slots.filter((s) => s.status === "queued").length;
    if (runnable === 0) {
      crewRefusal =
        session.slots.length === 0
          ? `The crew layer selected no specialist for "${objective}" — nothing to run, so no seat was dispatched.`
          : session.slots.some((s) => s.status === "refused")
            ? `Every crew member was refused at the gate (${session.slots.filter((s) => s.status === "refused").length} refused) — exactly as decided, so no seat was dispatched.`
            : `All ${session.slots.length} crew member(s) wait at your gate under ${session.mode.mode} mode. Approve them with crew.resolveGate(sessionId, slotId, true) and run the mission again; nothing is dispatched until then.`;
      crew = crewRecord(getCrewSession(session.id) ?? session, null);
    } else {
      /* HERE the crew's own circuit breaker and per-member bench failover run:
         they live inside runCrewSession's runSlot, and this is the only call that
         reaches them. */
      crewRun = await runCrewSession(
        session.id,
        {
          provider: deps.crew.provider,
          ...(deps.crew.fetchImpl ? { fetchImpl: deps.crew.fetchImpl } : {}),
          ...(deps.crew.maxSteps !== undefined ? { maxSteps: deps.crew.maxSteps } : {}),
        },
        now(),
      );
      notes.push(
        deps.crew.fetchImpl
          ? `Crew members ran through the caller-supplied fetch seam (${deps.crew.fetchImpl.name || "anonymous"}), not the host's global fetch.`
          : "Crew members ran through the host's global fetch — the production path.",
      );
      const settled = getCrewSession(session.id) ?? session;
      crew = crewRecord(settled, crewRun);
      if (settled.status === "cooled-down") {
        crewRefusal = `The crew breaker cooled this crew down before the mission could dispatch a seat. ${crew.breakerNote ?? "Three consecutive unresolved member failures."} Nothing was dispatched; the mission did not run.`;
      } else {
        crewTeam = teamFromCrewSession(settled);
        if (crewTeam.seats.length === 0) {
          crewRefusal = `The crew ran (${settled.slots.length} slot(s)) but produced no member answer to seat, so the mission had nothing to dispatch. Nothing ran.`;
        }
      }
    }
  }

  /* ── 2. THE CREW ITSELF ────────────────────────────────────────────────────
     Precedence, stated rather than implied: an explicit `deps.team` wins (the
     owner named a roster), else the governed crew's roster, else the last
     persisted/prebuilt crew. Whichever it is, the outcome says so — a mission
     that ran a different roster than the one on screen is the kind of thing a
     receipt has to be able to answer. */
  const persisted = loadCrews();
  const team = deps.team ?? crewTeam ?? persisted[persisted.length - 1];
  const rosterSource = deps.team ? "the caller's explicit crew" : crewTeam ? "the governed crew session's roster" : "the last persisted/prebuilt crew";
  if (team) notes.push(`Roster: ${team.name} (${team.seats.length} seat(s)) from ${rosterSource}.`);
  if (!team) {
    return {
      missionId: missionSlug,
      missionSlug,
      objective,
      status: "aborted",
      verdict: `No crew is configured, so there is no one to execute with — nothing ran and nothing was spent. Persist one with agentTeam.saveTeams([...]) or pass deps.team.`,
      report: null,
      teamId: "",
      teamName: "",
      engineUsed: "direct",
      authority: null,
      budget: null,
      spend: { chargedUsd: 0, reportedBySeats: [], unknownUsdSeats: [] },
      crew,
      arena: null,
      resumed: false,
      steps: { reused: [], applied: [], unresolved: [] },
      notes: [...notes, "no crew configured"],
      runMs: now() - t0,
    };
  }
  if (crewRefusal) notes.push(crewRefusal);

  /* ── 3. CUSTODY: the root authority, when a human pressed the button ────── */
  let authority: AuthorityEnvelope | null = null;
  if (deps.principal) {
    authority = await issueRootEnvelope({
      principal: deps.principal,
      scope: MISSION_SCOPE,
      expiresAt: t0 + (deps.authorityTtlMs ?? 30 * 60_000),
      budgetUsd,
      now: t0,
    });
  } else {
    notes.push("No principal was supplied, so no root authority envelope was minted. executeTeam's atomic budget admission (BudgetGate) is therefore inactive and the CapLedger's own cap is the only spend control.");
  }

  /* ── 4. EXECUTE ─────────────────────────────────────────────────────────── */
  let report: TeamRunReport | null = null;

  /* THE CLOCK MUST BE ONE CLOCK. The root envelope above is minted against
     `deps.now`, and `executeTeam` reads the same clock through `deps.now` on its
     runner. Forwarding only one of them produces an envelope that is expired the
     instant it is checked — a real failure this module shipped with until a
     probe caught it, and one that looks exactly like "custody refused the
     mission". A caller that supplies a clock gets it on both sides or on neither. */
  const runner: TeamRunnerDeps = {
    ...(deps.runner ?? honestNoRunner()),
    ...(deps.now ? { now: deps.now } : {}),
  };

  if (!crewRefusal) {
    const compose = deps.compose ?? composeAssignments;
    const assignments: SeatAssignment[] = compose(team, objective);
    {
      const ledger = new CapLedger({ maxCostUsd: budgetUsd, maxTurns: 120, timeoutMs: 30 * 60_000 }, t0);
      const autonomy: AutonomyRequest = prepareAutonomy();
      const req: TeamRunRequest = {
        team,
        assignments,
        repoRoot: deps.repoRoot ?? ".",
        baseBranch: deps.baseBranch ?? "main",
        missionSlug,
        objective,
        steps: deps.steps ?? createSeatStepLedger(),
        ledger,
        autonomy,
        ...(deps.testCommand ? { testCommand: deps.testCommand } : {}),
        ...(authority ? { rootEnvelope: authority } : {}),
        ...(deps.gatePolicy ? { gatePolicy: deps.gatePolicy } : {}),
      };
      report = await executeTeam(req, runner);
      notes.push(`Executed ${report.seats.length} seat record(s) via executeTeam on mission slug "${missionSlug}".`);
    }
  }

  /* ── 5. ARENA: attack the writers' work ──────────────────────────────────── */
  let arena: HardeningReport | null = null;
  if (!crewRefusal && report && deps.arena) {
    const writer = report.seats.find((s) => !s.reviewedRef.includes("/review") && s.role !== "reviewer" && s.role !== "security") ?? report.seats[0];
    const reviewer = report.seats.find((s) => s.role === "reviewer" || s.role === "security") ?? writer;
    arena = await runAdversarialDuel({
      objective,
      defenderSeatId: deps.arena.defenderSeatId ?? reviewer?.seatId ?? "seat:defender",
      defenderHarness: reviewer?.harness ?? "llm",
      attackerSeatId: deps.arena.attackerSeatId ?? writer?.seatId ?? "seat:attacker",
      attackerHarness: writer?.harness ?? "llm",
      targetCwd: writer?.worktreePath ?? deps.repoRoot ?? ".",
      ...(deps.arena.vectors ? { vectors: deps.arena.vectors } : {}),
      ...(deps.arena.maxRounds !== undefined ? { maxRounds: deps.arena.maxRounds } : {}),
      ...(deps.arena.testRunner ? { testRunner: deps.arena.testRunner } : {}),
    });
    notes.push(arena.isSimulated ? "Adversarial arena ran SIMULATED — no testRunner was attached, so its breaches come from the declared fixture, not from measurement." : "Adversarial arena ran against the real test runner.");
  }

  /* ── 6. THE OUTCOME ─────────────────────────────────────────────────────── */
  const spend = report ? spendOf(report) : { chargedUsd: 0, reportedBySeats: [], unknownUsdSeats: [] };
  const steps = report ? stepsOf(report) : { reused: [], applied: [], unresolved: [] };
  const status = crewRefusal ? "blocked" : (report?.status ?? "blocked");
  const gatePolicyNote = (): string => {
    if (!deps.gatePolicy && !report) return "";
    try {
      const p = deps.gatePolicy ?? loadGatePolicy();
      return ` Gate policy in force: ${p}.`;
    } catch {
      return "";
    }
  };

  return {
    missionId: missionSlug,
    missionSlug,
    objective,
    status,
    verdict: verdictOf({ objective, report, crew, spend, arena, ...(crewRefusal ? { refusal: crewRefusal } : {}) }) + gatePolicyNote(),
    report,
    teamId: team.id,
    teamName: team.name,
    engineUsed: "direct",
    authority: authority ? { id: authority.id, principal: authority.principal, budgetUsd: authority.budgetUsd } : null,
    budget: report?.budget ?? null,
    spend,
    crew,
    arena,
    resumed: steps.reused.length > 0,
    steps,
    notes,
    runMs: now() - t0,
  };
}

/**
 * Deps for a host that has no agent runner at all.
 *
 * Deliberately NOT `missionLoop.noHostDeps()`: that one reports a timed-out
 * result, which reads as a seat that ran and was killed. This one reports exit
 * 127 with the reason in stderr, so every seat's record says the host could not
 * run agents rather than that an agent failed.
 */
function honestNoRunner(): TeamRunnerDeps {
  const r: CliResult = { exitCode: 127, stdout: "", stderr: "no agent runner is configured on this host", durationMs: 0, timedOut: false };
  return {
    cliInvoke: async () => r,
    resolveBin: async () => null,
    nativeInvoke: async () => r,
  };
}

/* ------------------------------------------------------------------ resumption */

/**
 * Resume a mission: the same slug plus the same ledger, and no seat is
 * dispatched twice.
 *
 * `forgetCrewMission` is the deliberate inverse — it is the ONLY way to make a
 * mission re-run its seats from scratch, and it is explicit so that "why did my
 * seat not run again" always has an answer in the ledger rather than in a guess.
 */
export function resumeCrewMission(objective: string, deps: CrewMissionDeps & { missionSlug: string }): Promise<CrewMissionOutcome> {
  return runCrewMission(objective, { ...deps, steps: deps.steps ?? createSeatStepLedger() });
}

/** Drop every step record for a mission so its seats genuinely run again. */
export function forgetCrewMission(missionSlug: string, ledger: SeatStepLedger = createSeatStepLedger()): number {
  const keep = ledger.entries().filter((r) => r.missionSlug !== missionSlug);
  let dropped = 0;
  for (const r of ledger.entries()) if (r.missionSlug === missionSlug) dropped += 1;
  const store = (globalThis.localStorage as { setItem?(k: string, v: string): void } | undefined) ?? null;
  try {
    store?.setItem?.("vh.seatSteps.v1", JSON.stringify(keep));
  } catch {
    /* memory-only hosts keep their own copy */
  }
  return dropped;
}

/* ------------------------------------------------------------------ helpers for surfaces */

/** The briefing text a seat would receive, so a surface can show exactly what it was told. */
export function crewMissionBriefing(team: CliAgentTeam, seatId: string, objective: string): string | null {
  const seat = team.seats.find((s) => s.id === seatId);
  if (!seat) return null;
  return seatBriefing(seat, { objective, readOnly: !seat.mayWrite });
}

/** Hot-switch the governed crew's mode mid-flight. The crew re-evaluates its own queue. */
export function switchCrewMode(sessionId: string, next: CrewMode, at = Date.now(), why = ""): { ok: boolean; line: string } {
  return switchMode(sessionId, next, at, why);
}

export { BudgetGate };
