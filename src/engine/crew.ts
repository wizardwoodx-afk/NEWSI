/**
 * THE CREW — a working space where up to 25 specialists work as one team
 * under the owner's governance (19.7.4 [Crew]).
 *
 * The law of the whole module, in order:
 *
 *   1. SELECTION — scanDomains → crewGate → selectCrewV2 (moeV2.ts). The
 *      pool is dynamic, the ceiling is 25, every admit and prune carries a
 *      reason, and a per-member reserve bench is staged for failover.
 *
 *   2. GOVERNANCE — every member act is admitted under the session's MODE
 *      (modes.ts): manual gates everything, semi gates risky/critical,
 *      full gates only critical. A gated member is a prepared ask at the
 *      human gate — the owner approves or refuses; the crew never raises
 *      its own mode, and the owner may hot-switch modes mid-run. Acts
 *      already in flight finish under the mode that admitted them.
 *
 *   3. EXECUTION — members run concurrently, bounded at CONCURRENCY (= 25,
 *      the same law as the ceiling), each through the real member agent
 *      loop (agentLoop.ts) with its own BEW receipt: a member that cannot
 *      prove VERIFY cannot report done. No provider key, nothing executes —
 *      the refusal is the session's outcome, stated, not a crash.
 *
 *   4. FAILOVER — a failed member is replaced by its bench reserve (same
 *      domain, ranked at selection time) in one step; the steward names
 *      the swap. A domain with no reserve left escalates to the owner as
 *      the ask, with the work named. The crew-wide breaker (3 consecutive
 *      unresolved failures) cools the session down — visible, never silent.
 *
 *   5. PROOF — every member carries a digest; the session receipt is the
 *      digest over the ordered member receipts. The steward reports the
 *      working as it happens; LOTUS keeps the token bill honest.
 */

import type { ProviderConfig } from "./types";
import { getSpecialist } from "./registry";
import { buildSpecialistPrompt } from "./skills";
import { runMemberAgent } from "./agentLoop";
import { scanDomains, selectCrewV2, CREW_MAX, type CrewSelection } from "./moeV2";
export { CREW_MAX } from "./moeV2";
import { pureSha256 } from "./pureHash";
import {
  actRunsUnattended,
  gateAskLine,
  setMode,
  initialModeState,
  CREW_MODE_LABELS,
  type CrewMode,
  type ModeState,
} from "./modes";
import {
  initialFeed,
  record,
  checkMilestone,
  brief,
  reassignLine,
  escalateLine,
  type StewardFeed,
} from "./steward";
import { compressToolOutput, noteLotus, LOTUS_DEFAULT_MODE, type LotusMode } from "./lotus";

/** The concurrency law: never more members running at once than the ceiling. */
export const CREW_CONCURRENCY = CREW_MAX;

/** Session-level breaker: consecutive unresolved member failures before cooldown. */
export const CREW_BREAKER = 3;

export type CrewSlotStatus = "queued" | "active" | "answered" | "failed" | "reassigned" | "gated" | "escalated" | "refused";

export interface CrewSlot {
  slotId: string;
  specialistId: string;
  domain: string;
  status: CrewSlotStatus;
  /** The mode that admitted this act — in-flight acts finish under it. */
  admittedUnder: CrewMode;
  attempts: number;
  replacedBy?: string;
  gateAsk?: string;
  answerPreview?: string;
  memberDigest?: string;
  bewPhases?: string;
  verdict?: string;
  error?: string;
}

export type CrewSessionStatus = "running" | "awaiting-gate" | "done" | "failed" | "cooled-down";

export interface CrewSession {
  id: string;
  task: string;
  createdAt: number;
  status: CrewSessionStatus;
  mode: ModeState;
  lotusMode: LotusMode;
  selection: CrewSelection;
  slots: CrewSlot[];
  feed: StewardFeed;
  sessionReceipt?: string;
  refusal?: string;
}

export interface CrewRunOptions {
  provider: ProviderConfig;
  fetchImpl?: typeof fetch;
  maxSteps?: number;
}

const sessions = new Map<string, CrewSession>();
let sessionSeq = 0;

export function getCrewSession(id: string): CrewSession | null {
  return sessions.get(id) ?? null;
}

export function listCrewSessions(): CrewSession[] {
  return [...sessions.values()].sort((a, b) => b.createdAt - a.createdAt);
}

/** Test/admin seam — clears the session registry. */
export function resetCrewSessions(): void {
  sessions.clear();
  sessionSeq = 0;
}

function domainOf(id: string): string {
  return getSpecialist(id)?.category ?? "?";
}

/**
 * Create a session: scan the task's domains, gate the crew budget, select
 * the crew with reserves, stage every slot. No provider call happens here —
 * creation is pure planning; runCrewSession executes.
 */
export function createCrewSession(
  task: string,
  opts: { mode?: CrewMode; lotusMode?: LotusMode; at?: number } = {},
): CrewSession {
  const at = opts.at ?? Date.now();
  const pool = scanDomains(task);
  const selection = selectCrewV2(task, pool);
  sessionSeq += 1;
  const session: CrewSession = {
    id: `crew-${at}-${sessionSeq}`,
    task,
    createdAt: at,
    status: selection.crew.length === 0 ? "failed" : "running",
    mode: { ...initialModeState(), ...(opts.mode ? { mode: opts.mode } : {}) },
    lotusMode: opts.lotusMode ?? LOTUS_DEFAULT_MODE,
    selection,
    slots: selection.crew.map((c, i) => {
      const tier = getSpecialist(c.id)?.riskTier ?? "safe";
      const runsFree = actRunsUnattended(opts.mode ?? "manual", tier);
      return {
        slotId: `${sessionSeq}-s${i}`,
        specialistId: c.id,
        domain: domainOf(c.id),
        status: runsFree ? "queued" : "gated",
        admittedUnder: opts.mode ?? "manual",
        attempts: 0,
        ...(runsFree ? {} : { gateAsk: gateAskLine(opts.mode ?? "manual", tier, getSpecialist(c.id)?.name ?? c.id) }),
      };
    }),
    feed: initialFeed(),
    ...(selection.crew.length === 0
      ? { refusal: "no specialist pool matched this task — nothing was selected, nothing was executed" }
      : {}),
  };
  record(
    session.feed,
    "crew-started",
    `crew of ${selection.crew.length} selected from a ${pool.pool.length}-specialist pool across ${pool.domains.length} domain(s) — mode ${CREW_MODE_LABELS[session.mode.mode]}`,
    at,
  );
  const gated = session.slots.filter((s) => s.status === "gated").length;
  if (gated > 0) {
    session.status = "awaiting-gate";
    record(session.feed, "member-gated", `${gated} member(s) wait at your gate — ${CREW_MODE_DOCTRINE_SHORT[session.mode.mode]}`, at);
  }
  sessions.set(session.id, session);
  return session;
}

const CREW_MODE_DOCTRINE_SHORT: Record<CrewMode, string> = {
  manual: "manual mode runs nothing without your approval",
  semi: "semi-autonomous runs safe acts only",
  full: "fully autonomous still gates critical acts",
};

/**
 * The owner's answer at the human gate: approve → queued, refuse → refused.
 *
 * 19.7.4 review fix — the gate is decidable from EVERY live state a session
 * can honestly be in when the owner reaches it: awaiting-gate (the normal
 * muster), running (a member gated mid-run), and FAILED-untouched (a runner
 * that started with every member gated — the UI-muster sequencing bug the
 * review caught: it skipped the gated roster and marked the session failed
 * before anyone had answered the gate). A resolution recomputes the session
 * status: gated members remain → awaiting-gate; none remain → running, so
 * the very next run executes the approved crew. A cooled-down session takes
 * no gate decisions — the breaker owns it until the owner restarts it.
 */
export function resolveGate(sessionId: string, slotId: string, approve: boolean, at = Date.now()): { ok: boolean; line: string } {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, line: "no such crew session" };
  if (session.status === "cooled-down") return { ok: false, line: "the session is cooled down — restart it before gate decisions" };
  const slot = session.slots.find((s) => s.slotId === slotId);
  if (!slot || slot.status !== "gated") return { ok: false, line: "that member is not at the gate" };
  if (!approve) {
    slot.status = "refused";
    record(session.feed, "note", `${slot.specialistId} refused at your gate — it will not run`, at);
  } else {
    slot.status = "queued";
    record(session.feed, "member-admitted", `${slot.specialistId} approved at your gate — joining the crew`, at);
  }
  const remaining = session.slots.filter((s) => s.status === "gated").length;
  if (session.status === "awaiting-gate" || session.status === "failed" || session.status === "running") {
    session.status = remaining > 0 ? "awaiting-gate" : "running";
  }
  return { ok: true, line: `${approve ? "approved" : "refused"}: ${slot.specialistId}` };
}

/** Hot-switch the session's mode mid-run. In-flight acts keep their admitting mode. */
export function switchMode(sessionId: string, next: CrewMode, at = Date.now(), why = ""): { ok: boolean; line: string } {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, line: "no such crew session" };
  const res = setMode(session.mode, next, at, why);
  session.mode = res.state;
  if (res.changed) {
    record(session.feed, "mode-switched", res.line, at);
    // Newly-queued members re-evaluate admission under the new mode now.
    for (const slot of session.slots) {
      if (slot.status !== "queued" && slot.status !== "gated") continue;
      const tier = getSpecialist(slot.specialistId)?.riskTier ?? "safe";
      const runsFree = actRunsUnattended(next, tier);
      if (runsFree && slot.status === "gated") {
        slot.status = "queued";
        slot.gateAsk = undefined;
        slot.admittedUnder = next;
      } else if (!runsFree && slot.status === "queued" && slot.attempts === 0) {
        slot.status = "gated";
        slot.gateAsk = gateAskLine(next, tier, getSpecialist(slot.specialistId)?.name ?? slot.specialistId);
      }
    }
  }
  return { ok: !res.changed ? false : true, line: res.line || res.error || "" };
}

interface RunOutcome {
  answered: number;
  failed: number;
  reassigned: number;
  escalated: number;
  refused: number;
}

/**
 * Run the crew. Bounded concurrency, per-member failover from the bench,
 * steward events on every settlement, session receipt on completion.
 * The provider seam is the same one askSelfImpulse19 uses — no key, nothing runs.
 */
export async function runCrewSession(sessionId: string, opts: CrewRunOptions, _at = Date.now()): Promise<RunOutcome> {
  const session = sessions.get(sessionId);
  if (!session) throw new Error("no such crew session");
  if (session.refusal) return { answered: 0, failed: 0, reassigned: 0, escalated: 0, refused: 0 };

  const hash = async (text: string): Promise<string> => pureSha256(text);
  const outcome: RunOutcome = { answered: 0, failed: 0, reassigned: 0, escalated: 0, refused: 0 };
  let consecutiveFailures = 0;

  const runSlot = async (slot: CrewSlot): Promise<void> => {
    if (session.status === "cooled-down" || session.status === "failed") return;
    const specialist = getSpecialist(slot.specialistId);
    if (!specialist) {
      slot.status = "failed";
      slot.error = "specialist missing from the registry";
      return;
    }
    slot.attempts += 1;
    slot.status = "active";
    record(session.feed, "member-admitted", `${slot.specialistId} (${slot.domain}) started — attempt ${slot.attempts}, under ${CREW_MODE_LABELS[slot.admittedUnder]}`, Date.now());

    const systemBase = buildSpecialistPrompt(specialist);
    const run = await runMemberAgent({
      provider: opts.provider,
      specialist,
      task: session.task,
      systemBase,
      fetchImpl: opts.fetchImpl,
      hash,
      maxSteps: opts.maxSteps,
    });

    // LOTUS at the wire: the member's answer is tool-output-shaped text —
    // compressed for the evidence section, never for the receipt digest.
    const lotus = compressToolOutput(run.text, session.lotusMode, Date.now());
    noteLotus(lotus, Date.now());

    if (run.ok) {
      slot.status = "answered";
      slot.answerPreview = lotus.text.slice(0, 280);
      slot.memberDigest = await hash(
        JSON.stringify({ v: "si-crew/1", specialistId: slot.specialistId, text: run.text, bew: run.bew }),
      );
      slot.bewPhases = run.bew.phases.join("→");
      slot.verdict = run.bew.verdict;
      outcome.answered += 1;
      consecutiveFailures = 0;
      record(
        session.feed,
        "member-answered",
        `${slot.specialistId} answered · ${run.model} · ${run.latencyMs}ms · bew ${slot.bewPhases} · verdict ${slot.verdict}${run.truncated ? " · step limit reached, labelled" : ""}`,
        Date.now(),
      );
      const answeredSoFar = session.slots.filter((s) => s.status === "answered").length;
      checkMilestone(session.feed, answeredSoFar, session.selection.crew.length, Date.now());
      return;
    }

    consecutiveFailures += 1;
    slot.status = "failed";
    slot.error = `${run.errorKind}: ${run.error}`;
    record(session.feed, "member-failed", `${slot.specialistId} failed — ${slot.error}`, Date.now());

    if (consecutiveFailures >= CREW_BREAKER) {
      session.status = "cooled-down";
      record(session.feed, "escalated", `crew breaker: ${CREW_BREAKER} consecutive unresolved failures — session cooled down, nothing further executes until you restart it`, Date.now());
      return;
    }

    const bench = session.selection.bench.get(slot.specialistId) ?? [];
    const used = new Set(
      session.slots.filter((s) => s !== slot).map((s) => s.specialistId),
    );
    const next = bench.find((b) => !used.has(b.id));
    if (!next) {
      slot.status = "escalated";
      outcome.escalated += 1;
      record(session.feed, "escalated", escalateLine(slot.specialistId, slot.domain, session.task), Date.now());
      return;
    }
    const retry: CrewSlot = {
      slotId: `${slot.slotId}-r${slot.attempts}`,
      specialistId: next.id,
      domain: slot.domain,
      status: "queued",
      admittedUnder: session.mode.mode,
      attempts: 0,
    };
    session.slots.push(retry);
    session.selection.bench.set(slot.specialistId, bench.filter((b) => b.id !== next.id));
    slot.status = "reassigned";
    slot.replacedBy = next.id;
    outcome.reassigned += 1;
    record(session.feed, "member-reassigned", reassignLine(slot.specialistId, next.id, slot.domain), Date.now());
    await runSlot(retry);
  };

  // Bounded concurrency: never more than CREW_CONCURRENCY members at once.
  const queue = [...session.slots];
  const workers: Promise<void>[] = [];
  const lanes = Math.min(CREW_CONCURRENCY, queue.length);
  let cursor = 0;
  for (let i = 0; i < lanes; i++) {
    workers.push(
      (async () => {
        while (cursor < queue.length) {
          if (session.status === "cooled-down" || session.status === "failed") return;
          const slot = queue[cursor++];
          if (slot.status === "gated" || slot.status === "refused") {
            if (slot.status === "refused") outcome.refused += 1;
            continue; // gated members were resolved before/while running; refusals count.
          }
          await runSlot(slot);
        }
      })(),
    );
  }
  await Promise.all(workers);

  const answered = session.slots.filter((s) => s.status === "answered").length;
  const gatedLeft = session.slots.filter((s) => s.status === "gated").length;
  const refused = session.slots.filter((s) => s.status === "refused").length;
  const attempted = session.slots.filter((s) => s.attempts > 0).length;
  if (session.status !== "cooled-down") {
    if (session.refusal) {
      session.status = "failed"; // creation-time refusal stands
    } else if (answered === 0 && attempted === 0 && gatedLeft > 0) {
      /* 19.7.4 review fix: a runner that started with an all-gated roster
         executed NOTHING — that is a muster awaiting its owner, not a
         failure. The session returns to awaiting-gate and says so. */
      session.status = "awaiting-gate";
      record(session.feed, "note", `nothing executed — ${gatedLeft} member(s) still await your approval; approve, then run the crew`, Date.now());
    } else if (answered === 0 && attempted === 0 && refused > 0 && gatedLeft === 0) {
      /* every member refused at the gate: the owner cancelled the work —
         recorded as done-with-nothing, honestly worded, not a failure. */
      session.status = "done";
      record(session.feed, "crew-done", `every member was refused at your gate — nothing executed, exactly as you decided`, Date.now());
    } else {
      session.status = answered > 0 ? "done" : "failed";
    }
  }
  session.sessionReceipt = await hash(
    JSON.stringify({
      v: "si-crew-session/1",
      task: session.task,
      mode: session.mode.mode,
      members: session.slots
        .filter((s) => s.memberDigest || s.error)
        .map((s) => ({ specialistId: s.specialistId, status: s.status, digest: s.memberDigest ?? null })),
    }),
  );
  record(
    session.feed,
    "crew-done",
    `${brief(
      {
        total: session.selection.crew.length,
        answered,
        failed: session.slots.filter((s) => s.status === "failed").length,
        reassigned: outcome.reassigned,
        gated: session.slots.filter((s) => s.status === "gated").length,
        escalated: outcome.escalated,
      },
      session.status,
    )} session receipt ${session.sessionReceipt.slice(0, 12)}`,
    Date.now(),
  );
  return outcome;
}

/** The steward's current briefing line for the console. */
export function crewBriefing(session: CrewSession): string {
  return brief(
    {
      total: session.selection.crew.length,
      answered: session.slots.filter((s) => s.status === "answered").length,
      failed: session.slots.filter((s) => s.status === "failed").length,
      reassigned: session.slots.filter((s) => s.status === "reassigned").length,
      gated: session.slots.filter((s) => s.status === "gated").length,
      escalated: session.slots.filter((s) => s.status === "escalated").length,
    },
    session.status,
  );
}

/* ── 19.7.6 [Office] — the OFFICE VIEW: one common space for the crew ────── */

export interface OfficeDepartment {
  domain: string;
  members: Array<{ slotId: string; specialistId: string; name: string; status: CrewSlotStatus; attempts: number; verdict?: string }>;
}

export interface OfficeBoard {
  atGate: number;
  working: number;
  answered: number;
  sidelined: number; // failed + reassigned + escalated + refused
}

export interface OfficeView {
  departments: OfficeDepartment[];
  board: OfficeBoard;
  rooms: number;
  occupancy: number;
  headline: string;
}

/**
 * The office: the crew's slots grouped into DEPARTMENTS (one per domain),
 * plus the shared BOARD (the counts that matter at a glance). Pure over the
 * session — the console renders it, probes pin it. The steward remains the
 * office manager; the departments are how twenty-five specialists from
 * different domains look like ONE team in ONE space.
 */
export function officeView(session: CrewSession): OfficeView {
  const byDomain = new Map<string, OfficeDepartment>();
  for (const slot of session.slots) {
    let dept = byDomain.get(slot.domain);
    if (!dept) {
      dept = { domain: slot.domain, members: [] };
      byDomain.set(slot.domain, dept);
    }
    dept.members.push({
      slotId: slot.slotId,
      specialistId: slot.specialistId,
      name: getSpecialist(slot.specialistId)?.name ?? slot.specialistId,
      status: slot.status,
      attempts: slot.attempts,
      ...(slot.verdict ? { verdict: slot.verdict } : {}),
    });
  }
  const departments = [...byDomain.values()].sort((a, b) => b.members.length - a.members.length || a.domain.localeCompare(b.domain));
  const board: OfficeBoard = {
    atGate: session.slots.filter((s) => s.status === "gated").length,
    working: session.slots.filter((s) => s.status === "queued" || s.status === "active").length,
    answered: session.slots.filter((s) => s.status === "answered").length,
    sidelined: session.slots.filter((s) => s.status === "failed" || s.status === "reassigned" || s.status === "escalated" || s.status === "refused").length,
  };
  return {
    departments,
    board,
    rooms: departments.length,
    occupancy: session.slots.length,
    headline: `the office: ${departments.length} department(s), ${session.slots.length} specialist(s) on the floor — at the gate ${board.atGate} · working ${board.working} · answered ${board.answered} · sidelined ${board.sidelined}`,
  };
}
