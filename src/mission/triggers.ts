/**
 * VH 16.10.0 — FEATURE 5: ALWAYS-ON TRIGGERS (it wakes up without you).
 *
 * The scheduler engine (`src/engine/scheduler.ts`) existed for workflow runs;
 * nothing OUTSIDE the UI ever fired. This module is the trigger→mission
 * path: interval and time-window triggers that dispatch REAL governed
 * missions — which still pause at the SAME human gate (proactivity never
 * bypasses governance) — with quiet rules so it stays silent unless it
 * matters (quiet hours, max runs/day, one concurrent run).
 *
 * HONEST BOUNDARY: in-app triggers live for the app process (the desktop
 * daemon that survives the window closing is the native-build seat, stated
 * here and in the docs — not claimed).
 */
export interface TriggerSpec {
  id: string;
  /** Interval trigger: minimum ms between fires. */
  everyMs?: number;
  /** Quiet window, local hours [from, to) — no fires inside. */
  quietHours?: { from: number; to: number };
  maxPerDay?: number;
  /** The governed objective dispatched on fire. */
  objective: string;
  enabled?: boolean;
}

export interface TriggerFire { ok: boolean; detail: string }

export interface TriggerDeps {
  now?: () => Date;
  /** The governed dispatcher — the SAME path the chat's dispatch uses (gate included). */
  dispatch: (objective: string, triggerId: string) => Promise<{ ok: boolean; detail: string }>;
}

export class TriggerEngine {
  private lastFired = new Map<string, number>();
  private firedToday = new Map<string, { day: string; count: number }>();
  private running = false;
  constructor(private readonly deps: TriggerDeps) {}

  /** Evaluate one trigger now. Quiet rules are mechanical, not vibes. */
  async evaluate(t: TriggerSpec): Promise<TriggerFire> {
    if (t.enabled === false) return { ok: false, detail: `trigger "${t.id}" is disabled.` };
    const now = (this.deps.now ?? (() => new Date()))();
    const hour = now.getHours();
    if (t.quietHours) {
      const { from, to } = t.quietHours;
      const inside = from <= to ? hour >= from && hour < to : hour >= from || hour < to;
      if (inside) return { ok: false, detail: `quiet hours (${from}:00–${to}:00) — "${t.id}" stays silent unless it matters.` };
    }
    if (t.everyMs != null) {
      const last = this.lastFired.get(t.id) ?? 0;
      const since = now.getTime() - last;
      if (last !== 0 && since < t.everyMs) return { ok: false, detail: `"${t.id}" not due for another ${Math.ceil((t.everyMs - since) / 1000)}s (overlap protection).` };
    }
    if (t.maxPerDay != null) {
      const day = now.toISOString().slice(0, 10);
      const rec = this.firedToday.get(t.id);
      if (rec && rec.day === day && rec.count >= t.maxPerDay) return { ok: false, detail: `"${t.id}" hit its daily cap (${t.maxPerDay}) — quiet unless it matters.` };
    }
    if (this.running) return { ok: false, detail: `a triggered mission is already running — one concurrent run, never a pile-up.` };
    this.running = true;
    this.lastFired.set(t.id, now.getTime());
    const day = now.toISOString().slice(0, 10);
    const rec = this.firedToday.get(t.id);
    this.firedToday.set(t.id, { day, count: rec && rec.day === day ? rec.count + 1 : 1 });
    try {
      // the SAME governed dispatch: human gate, receipts, no special path
      const r = await this.deps.dispatch(t.objective, t.id);
      return { ok: r.ok, detail: r.ok ? `trigger "${t.id}" dispatched a governed mission (human gate applies): ${r.detail}` : `trigger "${t.id}" dispatch refused: ${r.detail}` };
    } finally {
      this.running = false;
    }
  }
}
