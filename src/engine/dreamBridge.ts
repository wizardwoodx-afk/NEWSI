/**
 * THE DREAM-BRIDGE — how consolidation happens without anybody pressing a button.
 *
 * ── THE COMPLAINT THIS ANSWERS ───────────────────────────────────────────────
 * The 1.0.0-dreaming build shipped a working consolidation pass and no way for
 * it to run: `dreamPass()` was called from exactly one place, a button on the
 * Memory door. The gates, the decay, the retirement — all of it waited for a
 * person to open a screen and click. A feature called DREAMING that only runs
 * while you are watching it is a button, not a memory.
 *
 * ── WHERE IT RUNS ────────────────────────────────────────────────────────────
 * `store.wakeNow()` — THE initiative heartbeat. Not a second timer: the same
 * 15-minute tick that decides whether to act now also consolidates what the
 * deployment has learned since the last tick. One tick, one place to look, and
 * the loop that already exists (`armHeartbeat`, armed above level 0) is what
 * drives it. Housekeeping is not an act to be routed to a specialist, so it is
 * not dressed up as one — it runs in the tick, beside the acts, before them.
 *
 * ── THE ORDER: THE RECORD EXISTS BEFORE THE WORK DOES ────────────────────────
 * The discipline this follows: the agent gateway writes its audit row and only
 * then calls the tool. The same rule here, for the same reason — a
 * consolidation that half-happened and left no trace is a memory system nobody
 * can audit. So a tick writes a
 * `running` row FIRST, runs the pass, then completes that same row with what the
 * pass did. A row still reading `running` on the next tick is a pass that was
 * interrupted, and it is reported as one rather than quietly retried — the same
 * way an uncertain write is recorded and never auto-replayed.
 *
 * ── THROTTLE ─────────────────────────────────────────────────────────────────
 * A tick inside `DREAM_MIN_GAP_MS` of the last pass does nothing and says so.
 * The heartbeat is a schedule, not a statement that anything has changed; the
 * manual control on the Memory door passes `force` because a person pressing a
 * button IS a statement that something changed.
 */
import { uid, nowIso } from "../app/id";
import { dreamPass, type DreamReport } from "./dreaming";

const JOURNAL_KEY = "engine.dream.journal.v1";
/** Below this, a tick does not re-consolidate. */
export const DREAM_MIN_GAP_MS = 10 * 60 * 1000;
/** Rows kept per user. A journal, not an archive. */
export const JOURNAL_CAP = 200;

export interface DreamJournalRow {
  id: string;
  userId: string;
  /** When the tick started. */
  at: string;
  /** `running` until the pass completes — a row stuck here was interrupted. */
  state: "running" | "done";
  staged: number;
  promoted: number;
  held: number;
  retired: number;
  /** The pass counter after this tick. */
  passes: number;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function loadJournal(): DreamJournalRow[] {
  const s = storage();
  if (!s) return [];
  try {
    const raw = JSON.parse(s.getItem(JOURNAL_KEY) ?? "[]") as DreamJournalRow[];
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.at === "string") : [];
  } catch {
    return [];
  }
}

function saveJournal(rows: DreamJournalRow[]): void {
  const s = storage();
  if (!s) return;
  const byUser = new Map<string, DreamJournalRow[]>();
  for (const r of rows) {
    const u = r.userId || "default";
    const list = byUser.get(u);
    if (list) list.push(r);
    else byUser.set(u, [r]);
  }
  const kept: DreamJournalRow[] = [];
  for (const list of byUser.values()) kept.push(...list.slice(-JOURNAL_CAP));
  s.setItem(JOURNAL_KEY, JSON.stringify(kept));
}

/** The journal, newest first. `userId` scopes it; omit for the whole install. */
export function dreamJournal(userId?: string): DreamJournalRow[] {
  const rows = loadJournal();
  const mine = userId ? rows.filter((r) => (r.userId || "default") === userId) : rows;
  return mine.slice().reverse();
}

/** The last tick for this user, whether or not it did anything. */
export function dreamCursor(userId = "default"): DreamJournalRow | null {
  return dreamJournal(userId)[0] ?? null;
}

/** Every pass that never finished — each row is the proof that it started.
 *
 *  (No "skip the current tick's row" here: a caller can only observe this
 *  between ticks, and a tick always completes its own row before it returns.
 *  Anything still reading `running` is a pass that did not.) */
export function interruptedPasses(userId = "default"): DreamJournalRow[] {
  return dreamJournal(userId).filter((r) => r.state === "running");
}

export interface DreamTickResult {
  ran: boolean;
  /** Why not, when it did not run. Honest, and shown. */
  whyNot?: string;
  at: string;
  userId: string;
  row: DreamJournalRow | null;
  report?: DreamReport;
}

/**
 * One tick: consolidate this user's staged records, if enough has happened and
 * enough time has passed.
 *
 * `force` is for the manual control — a person asking for consolidation now gets
 * it now. The heartbeat never passes it.
 */
export function dreamTick(userId = "default", at: string = nowIso(), opts: { force?: boolean } = {}): DreamTickResult {
  const who = userId || "default";
  const last = dreamCursor(who);
  if (!opts.force && last?.state === "done") {
    /* The guard is measured on the TICK'S OWN TIMELINE — the instant this tick
     * says it is, against the instant the last pass says it was.
     *
     * In production those are both `nowIso()`, so this is real elapsed time and
     * the two readings coincide. They are kept separate because a wall-clock
     * comparison makes the guard untestable with fixed dates and, worse, makes
     * it a property of the machine rather than of the schedule: a pass stamped
     * by one clock and read by another would either run constantly or never
     * run at all. An unreadable stamp means the guard stands aside — a broken
     * clock must not stop the deployment from learning. */
    const since = Date.parse(at) - Date.parse(last.at);
    if (Number.isFinite(since) && since >= 0 && since < DREAM_MIN_GAP_MS) {
      return { ran: false, whyNot: `consolidated ${Math.round(since / 1000)}s ago`, at, userId: who, row: last };
    }
  }

  /* The record first. If the pass below throws or the process dies, this row is
   * what remains — a pass that was attempted and not reported, which is exactly
   * what an auditor needs to see. */
  const row: DreamJournalRow = {
    id: uid("dream"),
    userId: who,
    at,
    state: "running",
    staged: 0,
    promoted: 0,
    held: 0,
    retired: 0,
    passes: 0,
  };
  const before = loadJournal();
  saveJournal([...before, row]);

  const report = dreamPass(who, at);
  const done: DreamJournalRow = {
    ...row,
    state: "done",
    staged: report.staged,
    promoted: report.promoted,
    held: report.held.length,
    retired: report.retired,
    passes: (last?.passes ?? 0) + 1,
  };
  saveJournal([...loadJournal().filter((r) => r.id !== row.id), done]);

  return { ran: true, at, userId: who, row: done, report };
}

/** One plain line a person can read in the transcript. */
export function dreamLine(r: DreamTickResult): string {
  const row = r.row;
  if (!r.ran || !row) return `Dreaming — skipped: ${r.whyNot ?? "nothing to do"}.`;
  if (row.staged === 0) return "Dreaming — nothing new since the last pass.";
  const bits: string[] = [`${row.staged} new record${row.staged === 1 ? "" : "s"} reviewed`];
  if (row.promoted > 0) bits.push(`${row.promoted} belief${row.promoted === 1 ? "" : "s"} added`);
  if (row.held > 0) bits.push(`${row.held} held at the gates`);
  if (row.retired > 0) bits.push(`${row.retired} retired`);
  return `Dreaming — ${bits.join(", ")}.`;
}
