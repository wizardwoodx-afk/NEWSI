/**
 * CREW MODES — the owner's throttle on crew autonomy (19.7.4 [Crew]).
 *
 * The crew can field up to 25 specialists at once. Power without a throttle
 * is a liability, so every crew session runs under exactly one of three
 * owner-owned modes — and the owner may switch modes WHILE the crew is
 * working. The switch is part of the ledger, never a silent mutation.
 *
 *   MANUAL             every act waits for the owner's approval.
 *   SEMI-AUTONOMOUS    safe-tier acts run free; risky/critical hit the gate.
 *   FULLY AUTONOMOUS   safe and risky acts run free inside the hard caps
 *                      (initiative limits + circuit breaker still law);
 *                      CRITICAL acts always gate — no mode overrides that.
 *
 * HOT-SWITCH CONTRACT (pinned by probe/modes):
 *   • switching mid-run never kills in-flight work — an act already admitted
 *     under the old mode finishes under the old mode's rules;
 *   • every act admitted AFTER the switch follows the new mode immediately;
 *   • the switch itself is recorded (from → to → at → why) and announced by
 *     the steward, not whispered;
 *   • setting the mode that is already set is an honest no-op, not an event.
 *
 * Mapping to the initiative ladder (levels 0–3 answer "when does work
 * START", modes answer "who approves it"): manual pins the initiative
 * level at 0; semi and full leave the owner's initiative level untouched.
 * The engine never raises either dial itself.
 */

import type { RiskTier } from "./types";

export type CrewMode = "manual" | "semi" | "full";

export const CREW_MODES: readonly CrewMode[] = ["manual", "semi", "full"] as const;

export const CREW_MODE_LABELS: Record<CrewMode, string> = {
  manual: "Manual",
  semi: "Semi-autonomous",
  full: "Fully autonomous",
};

export const CREW_MODE_DOCTRINE: Record<CrewMode, string> = {
  manual: "every act waits for your approval — nothing moves without you",
  semi: "safe acts run free; risky and critical acts stop at your gate",
  full: "safe and risky acts run free inside the hard caps; critical acts still stop at your gate",
};

export interface ModeSwitch {
  from: CrewMode;
  to: CrewMode;
  at: number;
  /** What the owner (or the owner's client) stated as the reason. Free text, may be empty. */
  why: string;
}

export interface ModeState {
  mode: CrewMode;
  /** Set on every real switch; null until the first switch from the default. */
  prev: CrewMode | null;
  /** Epoch ms of the last real switch (0 = never switched). */
  changedAt: number;
  switches: ModeSwitch[];
}

export const MODE_KEY = "engine.crewModes.v1";
export const MODE_LEDGER_CAP = 100;

/** The default is the safe one: nothing moves without the owner. */
export function initialModeState(): ModeState {
  return { mode: "manual", prev: null, changedAt: 0, switches: [] };
}

export interface ModeSetResult {
  state: ModeState;
  /** false when the requested mode was already active — an honest no-op. */
  changed: boolean;
  /** The steward line for this event; empty for a no-op. */
  line: string;
  error?: string;
}

/**
 * The one lawful way to change modes. Pure over its inputs: pass the current
 * state, get the next state back; nothing global is mutated here (the crew
 * session owns its own copy and the persistence layer serialises it).
 */
export function setMode(state: ModeState, next: CrewMode, at: number, why = ""): ModeSetResult {
  if (!CREW_MODES.includes(next)) {
    return { state, changed: false, line: "", error: `unknown mode '${String(next)}' — use manual | semi | full` };
  }
  if (state.mode === next) {
    return {
      state,
      changed: false,
      line: `already in ${CREW_MODE_LABELS[next]} — no switch, no event`,
    };
  }
  const entry: ModeSwitch = { from: state.mode, to: next, at, why };
  const ledger = [entry, ...state.switches];
  if (ledger.length > MODE_LEDGER_CAP) ledger.length = MODE_LEDGER_CAP;
  return {
    state: { mode: next, prev: state.mode, changedAt: at, switches: ledger },
    changed: true,
    line: `mode switched ${CREW_MODE_LABELS[entry.from]} → ${CREW_MODE_LABELS[entry.to]} — in-flight acts finish under ${CREW_MODE_LABELS[entry.from]}; new acts follow ${CREW_MODE_LABELS[next]} (${CREW_MODE_DOCTRINE[next]})`,
  };
}

/**
 * The admission law. Given the active mode and an act's risk tier, does the
 * act run without asking? CRITICAL refuses in every mode — that line is
 * deliberately identical across all three rows of the doctrine.
 */
export function actRunsUnattended(mode: CrewMode, tier: RiskTier): boolean {
  if (tier === "critical") return false;
  if (mode === "manual") return false;
  if (mode === "semi") return tier === "safe";
  return true; // full: safe + risky run; critical still gated above
}

/**
 * The gate ask text for an act this mode refused to run unattended. The
 * wording states the mode, the tier, and the doctrine — never a bare "blocked".
 */
export function gateAskLine(mode: CrewMode, tier: RiskTier, subject: string): string {
  if (tier === "critical") {
    return `critical-tier act always asks, in every mode — approval needed: ${subject}`;
  }
  return `${CREW_MODE_LABELS[mode]} mode does not run ${tier}-tier acts unattended — approval needed: ${subject}`;
}

/** Initiative level the mode pins (manual forces 0; others leave it free). */
export function pinnedInitiativeLevel(mode: CrewMode): 0 | null {
  return mode === "manual" ? 0 : null;
}
