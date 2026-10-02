/**
 * INITIATIVE — the engine that lets the crew work on its own (19.7.2.1 [Agent]).
 *
 * The honest answer to "agents should not only work from prompts": autonomy
 * is not a property of a prompt, it is a property of a LOOP. The research
 * pattern (heartbeat agents, layered autonomy, proactive monitors) reduced
 * to four gate-enforced parts:
 *
 *   1. LEVELS — layered autonomy, stated per level, never implied:
 *        0 manual       acts only when the user sends a task
 *        1 scheduled    a heartbeat wakes the crew on a fixed interval
 *        2 self-set     the crew may schedule its own follow-ups (capped)
 *        3 adaptive     follow-ups may reschedule from observed state (capped)
 *      The owner sets the level. The engine never raises it itself.
 *
 *   2. HEARTBEAT — while the app is open (stated plainly: no background
 *      magic), a timer wakes the engine. Each wake assembles context
 *      (due follow-ups, pending goals, memory drift, provider/vault state)
 *      and `evaluateWake()` DECIDES: act or heartbeat-ok. Decisions are
 *      pure and probe-testable; the timer is just the bell.
 *
 *   3. LIMITS — autonomy runs inside hard caps: acts/hour, acts/day,
 *      follow-up depth ≤ 2, idempotency keys so the same act cannot fire
 *      twice in its window, and a circuit breaker (3 consecutive failures
 *      → 60-minute cooldown, visible in the UI, not silent).
 *
 *   4. GATES — initiative only ever EXECUTES safe-tier work. Anything
 *      risky or critical becomes a prepared ask at the human gate. The
 *      engine proposes; the gate disposes. That is the whole deal.
 *
 * probe/initiative pins all four parts.
 */
import { loadGoals, nextPendingStep } from "./goals";

export type AutonomyLevel = 0 | 1 | 2 | 3;

export const AUTONOMY_LEVEL_NAMES: Record<AutonomyLevel, string> = {
  0: "manual — acts only on your command",
  1: "scheduled — heartbeat wakes the crew on an interval",
  2: "self-set — the crew may schedule its own follow-ups (capped)",
  3: "adaptive — follow-ups adapt to observed state (still capped)",
};

export const INITIATIVE_KEY = "engine.initiative.v1";
export const HEARTBEAT_DEFAULT_MS = 15 * 60 * 1000;

/* ── limits (the caps are law, not defaults) ─────────────────────────── */
export const LIMITS = {
  maxActsPerHour: 6,
  maxActsPerDay: 50,
  maxFollowUpDepth: 2,
  breakerFailures: 3,
  breakerCooldownMs: 60 * 60 * 1000,
  idempotencyWindowMs: HEARTBEAT_DEFAULT_MS,
} as const;

export interface FollowUp {
  id: string;
  kind: "verify" | "resume" | "brief" | "check";
  subject: string;
  dueAt: number;
  depth: number;
  createdAt: number;
}

export interface InitiativeAct {
  id: string;
  kind: "verify" | "resume" | "brief" | "check" | "proposal";
  subject: string;
  at: number;
  note: string;
  outcome: "done" | "proposed" | "failed" | "skipped-duplicate" | "skipped-cap";
}

export interface InitiativeState {
  level: AutonomyLevel;
  followUps: FollowUp[];
  acts: InitiativeAct[];
  lastWakeAt: number | null;
  recentFailures: number;
  breakerUntil: number | null;
  windowActs: Array<{ at: number; key: string }>;
  lastBrieftAt: number | null;
}

/* ── state (module memory + localStorage mirror, sandbox-safe) ───────── */
let state: InitiativeState | null = null;

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadInitiative(): InitiativeState {
  if (state) return state;
  try {
    const raw = storage()?.getItem(INITIATIVE_KEY);
    if (raw) {
      state = { ...(JSON.parse(raw) as InitiativeState) };
      return state!;
    }
  } catch {
    /* sandboxed embeds: module memory only */
  }
  state = {
    level: 1,
    followUps: [],
    acts: [],
    lastWakeAt: null,
    recentFailures: 0,
    breakerUntil: null,
    windowActs: [],
    lastBrieftAt: null,
  };
  return state;
}

function persist(): void {
  if (!state) return;
  try {
    storage()?.setItem(INITIATIVE_KEY, JSON.stringify(state));
  } catch {
    /* module memory only */
  }
}

export function setLevel(level: AutonomyLevel): InitiativeState {
  const s = loadInitiative();
  s.level = level;
  persist();
  return s;
}

/* ── idempotency + caps ───────────────────────────────────────────────── */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function actKey(kind: InitiativeAct["kind"], subject: string, at: number): string {
  return fnv1a(`${kind}|${subject}|${Math.floor(at / LIMITS.idempotencyWindowMs)}`);
}

export function scheduleFollowUp(kind: FollowUp["kind"], subject: string, dueAt: number, depth: number, now = Date.now()): { ok: boolean; why?: string; followUp?: FollowUp } {
  const s = loadInitiative();
  if (depth > LIMITS.maxFollowUpDepth) {
    return { ok: false, why: `follow-up depth ${depth} exceeds the cap (${LIMITS.maxFollowUpDepth}) — the chain stops here` };
  }
  if (s.level < 2) {
    return { ok: false, why: "self-scheduling requires autonomy level 2+ (owner sets it in Settings → Autonomy)" };
  }
  const key = fnv1a(`${kind}|${subject}|${Math.floor(dueAt / LIMITS.idempotencyWindowMs)}`);
  if (s.followUps.some((f) => fnv1a(`${f.kind}|${f.subject}|${Math.floor(f.dueAt / LIMITS.idempotencyWindowMs)}`) === key)) {
    return { ok: false, why: "duplicate follow-up in the same window — skipped by idempotency key" };
  }
  const followUp: FollowUp = { id: fnv1a(`${kind}|${subject}|${dueAt}|${now}`), kind, subject, dueAt, depth, createdAt: now };
  s.followUps.push(followUp);
  persist();
  return { ok: true, followUp };
}

/* ── the wake decision (pure — probes drive this) ────────────────────── */
export interface WakeContext {
  now: number;
  level: AutonomyLevel;
  providerReady: boolean;
  vaultUnlocked: boolean;
  memoryOn: boolean;
}

export interface WakeDecision {
  kind: "act" | "ok";
  acts: InitiativeAct[];
  note: string;
  breakerTripped?: boolean;
}

export function evaluateWake(ctx: WakeContext, st: InitiativeState, deps: { pendingGoalId?: string | null; newFacts?: number }): WakeDecision {
  const acts: InitiativeAct[] = [];

  /* circuit breaker first — three consecutive failures park the engine. */
  if (st.breakerUntil !== null && ctx.now < st.breakerUntil) {
    return { kind: "ok", acts, note: `circuit breaker open — initiative parked until ${new Date(st.breakerUntil).toISOString().slice(11, 16)} UTC`, breakerTripped: true };
  }

  /* level 0: the engine never acts on its own. */
  if (ctx.level === 0) {
    return { kind: "ok", acts, note: "autonomy is manual — nothing acts without your command" };
  }

  /* caps: window (hourly) and daily. */
  const hourAgo = ctx.now - 60 * 60 * 1000;
  const dayAgo = ctx.now - 24 * 60 * 60 * 1000;
  const inHour = st.windowActs.filter((w) => w.at >= hourAgo).length;
  const inDay = st.windowActs.filter((w) => w.at >= dayAgo).length;
  const capsExhausted = inHour >= LIMITS.maxActsPerHour || inDay >= LIMITS.maxActsPerDay;

  /* 1 — due follow-ups act first (levels 2+; verify/check run even without a provider). */
  if (ctx.level >= 2 && !capsExhausted) {
    const due = st.followUps
      .filter((f) => f.dueAt <= ctx.now)
      .sort((a, b) => a.dueAt - b.dueAt)[0];
    if (due) {
      acts.push({ id: fnv1a(`${due.id}|${ctx.now}`), kind: due.kind, subject: due.subject, at: ctx.now, note: due.kind === "verify" ? "verification you asked to check back on" : "scheduled follow-up", outcome: "done" });
    }
  }

  /* 2 — pending goal steps resume autonomously (safe tier only; gated work stays at the gate). */
  if (!capsExhausted && ctx.providerReady && deps.pendingGoalId) {
    const goal = loadGoals().find((g) => g.id === deps.pendingGoalId) ?? null;
    if (goal && nextPendingStep(goal)) {
      acts.push({ id: fnv1a(`resume|${goal.id}|${ctx.now}`), kind: "resume", subject: `goal "${goal.user.slice(0, 48)}"`, at: ctx.now, note: "pending goal step resumed — safe tier only; gated steps still ask", outcome: "proposed" });
    }
  }

  /* 3 — proactive briefing from memory drift (throttled to once per 6 hours). */
  if (!capsExhausted && ctx.level >= 1 && deps.newFacts && deps.newFacts >= 3 && (st.lastBrieftAt === null || ctx.now - st.lastBrieftAt > 6 * 60 * 60 * 1000)) {
    acts.push({
      id: fnv1a(`brief|${ctx.now}`),
      kind: "brief",
      subject: `${deps.newFacts} new facts in memory`,
      at: ctx.now,
      note: ctx.providerReady ? "briefing prepared from new memory — marked self-initiated" : "briefing prepared; connect a provider to run deeper checks",
      outcome: "proposed",
    });
  }

  /* 4 — the one safe proposal the engine makes about security posture. */
  if (!capsExhausted && ctx.memoryOn && !ctx.vaultUnlocked && (st.lastBrieftAt === null || ctx.now - st.lastBrieftAt > 6 * 60 * 60 * 1000)) {
    acts.push({ id: fnv1a(`proposal|seal|${ctx.now}`), kind: "proposal", subject: "memory is ON without a vault", at: ctx.now, note: "proposal only — create the vault in Settings to seal memory at rest", outcome: "proposed" });
  }

  if (acts.length === 0) {
    return { kind: "ok", acts, note: "nothing due — heartbeat ok" };
  }
  return { kind: "act", acts, note: `${acts.length} initiative act(s) this wake` };
}

/** Applies a wake decision to state: caps, breaker, log. Returns the state. */
export function applyWake(decision: WakeDecision, st: InitiativeState, now: number): InitiativeState {
  st.lastWakeAt = now;
  for (const act of decision.acts) {
    const key = actKey(act.kind, act.subject, now);
    const dup = st.windowActs.some((w) => w.key === key);
    if (dup) {
      act.outcome = "skipped-duplicate";
      continue;
    }
    st.windowActs.push({ at: now, key });
    st.acts.unshift(act);
    if (act.outcome === "failed") st.recentFailures += 1;
  }
  while (st.acts.length > 50) st.acts.pop();
  st.windowActs = st.windowActs.filter((w) => now - w.at < 24 * 60 * 60 * 1000);
  if (decision.acts.some((a) => a.kind === "brief" || a.kind === "proposal")) st.lastBrieftAt = now;
  const due = st.followUps.filter((f) => f.dueAt <= now);
  for (const d of due) st.followUps = st.followUps.filter((f) => f.id !== d.id);
  if (st.recentFailures >= LIMITS.breakerFailures) {
    st.breakerUntil = now + LIMITS.breakerCooldownMs;
    st.recentFailures = 0;
  }
  persist();
  return st;
}

/** Marks a result back into the breaker. */
export function reportFailure(st: InitiativeState): InitiativeState {
  st.recentFailures += 1;
  if (st.recentFailures >= LIMITS.breakerFailures) {
    st.breakerUntil = Date.now() + LIMITS.breakerCooldownMs;
    st.recentFailures = 0;
  }
  persist();
  return st;
}

export function breakerTripped(st: InitiativeState, now = Date.now()): boolean {
  return st.breakerUntil !== null && now < st.breakerUntil;
}

/* ── THE EXECUTION BRIDGE (the review fix: decide → EXECUTE → observe →
   receipt → reschedule) ───────────────────────────────────────────────────
 *
 * evaluateWake DECIDES; this pass ACTS. The executor is injected (production:
 * askSelfImpulse19, so safe acts ride the real engine — routing, MoE, member loops,
 * gated tools, receipts; probes: a mock), and every verdict lands back in
 * state: successes heal the breaker, failures feed it, partials reschedule a
 * capped verify follow-up, proposals never execute (the human gate owns
 * those). Nothing here is silent: the caller renders the receipts.
 */
export interface ActExecutorResult {
  verdict: "done" | "partial" | "blocked" | "failed";
  detail: string;
}

export type ActExecutor = (act: InitiativeAct) => Promise<ActExecutorResult>;

export interface ActRunResult {
  act: InitiativeAct;
  executed: boolean;
  result: ActExecutorResult | null;
  whyNot?: string;
  rescheduled?: { ok: boolean; why?: string };
}

/** Successes heal the breaker — three STRAIGHT failures trip it, so one win resets the count. */
export function reportSuccess(st: InitiativeState): InitiativeState {
  st.recentFailures = 0;
  persist();
  return st;
}

/** Executes a wake's acts through the injected executor, then writes the real outcomes into state. */
export async function executeWakeActs(
  acts: InitiativeAct[],
  executor: ActExecutor,
): Promise<ActRunResult[]> {
  const st = loadInitiative();
  const runs: ActRunResult[] = [];

  for (const act of acts) {
    /* proposals are the human gate's property — the engine never executes them */
    if (act.kind === "proposal") {
      runs.push({ act, executed: false, result: null, whyNot: "proposal — waits for your decision, never self-executed" });
      continue;
    }

    let result: ActExecutorResult;
    try {
      result = await executor(act);
    } catch (err) {
      result = { verdict: "failed", detail: `executor threw: ${String(err).slice(0, 120)}` };
    }

    if (result.verdict === "failed") {
      act.outcome = "failed";
      act.note = result.detail.slice(0, 200);
      reportFailure(st);
      runs.push({ act, executed: true, result });
      continue;
    }

    if (result.verdict === "blocked") {
      act.outcome = "proposed";
      act.note = `blocked — ${result.detail.slice(0, 160)}`;
      runs.push({ act, executed: false, result, whyNot: "blocked work is surfaced for you, never forced" });
      continue;
    }

    act.outcome = "done";
    act.note = result.detail.slice(0, 200);
    reportSuccess(st);

    /* partial ⇒ reschedule a verify check-back (self-set work, depth-capped) */
    let rescheduled: ActRunResult["rescheduled"];
    if (result.verdict === "partial") {
      act.note = `partial — ${result.detail.slice(0, 160)}`;
      rescheduled = scheduleFollowUp("verify", `re-check: ${act.subject}`.slice(0, 90), Date.now() + HEARTBEAT_DEFAULT_MS, 1);
    }
    runs.push({ act, executed: true, result, rescheduled });
  }

  persist();
  return runs;
}
