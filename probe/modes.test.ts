/**
 * probe/modes.test.ts — CREW MODES (19.7.4 [Crew]).
 *
 * Pins: the three modes and their doctrine, the admission law (manual gates
 * everything; semi gates risky/critical; full gates only critical — and
 * CRITICAL gates in EVERY mode), hot-switch semantics (ledger + in-flight
 * contract + no-op honesty), the gate-ask wording, and the initiative pin.
 */
import assert from "node:assert/strict";

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

import {
  CREW_MODES, CREW_MODE_LABELS, CREW_MODE_DOCTRINE, initialModeState, setMode,
  actRunsUnattended, gateAskLine, pinnedInitiativeLevel, type CrewMode,
} from "../src/engine/modes";

function main(): void {
  console.log("modes — the owner's throttle");

  ok("exactly three modes, in order", CREW_MODES.length === 3 && CREW_MODES[0] === "manual" && CREW_MODES[1] === "semi" && CREW_MODES[2] === "full");
  ok("labels never say bare auto — the owner reads Semi-autonomous / Fully autonomous",
    CREW_MODE_LABELS.semi === "Semi-autonomous" && CREW_MODE_LABELS.full === "Fully autonomous" && CREW_MODE_LABELS.manual === "Manual");
  ok("every mode carries its doctrine line", CREW_MODES.every((m) => CREW_MODE_DOCTRINE[m].length > 20));

  /* admission law */
  ok("manual admits nothing unattended", (["safe", "risky", "critical"] as const).every((t) => !actRunsUnattended("manual", t)));
  ok("semi admits safe only", actRunsUnattended("semi", "safe") && !actRunsUnattended("semi", "risky") && !actRunsUnattended("semi", "critical"));
  ok("full admits safe and risky — critical still gates", actRunsUnattended("full", "safe") && actRunsUnattended("full", "risky") && !actRunsUnattended("full", "critical"));
  ok("CRITICAL gates in every mode — no override exists", CREW_MODES.every((m: CrewMode) => !actRunsUnattended(m, "critical")));

  /* hot-switch */
  const s0 = initialModeState();
  ok("the default is manual — nothing moves without the owner", s0.mode === "manual" && s0.prev === null && s0.switches.length === 0);
  const s1 = setMode(s0, "full", 1000, "trusted crew, trusted task");
  ok("a real switch records from → to → at → why", s1.changed && s1.state.mode === "full" && s1.state.prev === "manual" && s1.state.switches[0].from === "manual" && s1.state.switches[0].at === 1000 && s1.state.switches[0].why === "trusted crew, trusted task");
  ok("the switch line names the in-flight contract", s1.line.includes("in-flight acts finish under Manual") && s1.line.includes("new acts follow Fully autonomous"));
  const s2 = setMode(s1.state, "full", 2000);
  ok("same-mode set is an honest no-op — no event, no ledger noise", !s2.changed && s2.state.switches.length === 1 && s2.line.includes("no switch"));
  const s3 = setMode(s0, "warp" as unknown as CrewMode, 3000);
  ok("an unknown mode is refused, not coerced", !s3.changed && typeof s3.error === "string" && s3.error.includes("manual | semi | full"));
  const s4 = setMode(s1.state, "semi", 4000);
  ok("the ledger keeps full history, newest first", s4.state.switches.length === 2 && s4.state.switches[0].to === "semi" && s4.state.switches[1].to === "full");

  /* gate ask wording */
  const ask = gateAskLine("semi", "risky", "push to production");
  ok("the gate ask states mode, tier and the work", ask.includes("Semi-autonomous") && ask.includes("risky") && ask.includes("push to production"));
  const askC = gateAskLine("full", "critical", "delete the vault");
  ok("even in full, a critical ask says ALWAYS", askC.includes("every mode") && askC.includes("delete the vault"));

  /* initiative pin */
  ok("manual pins initiative at 0; semi/full leave the owner's level free", pinnedInitiativeLevel("manual") === 0 && pinnedInitiativeLevel("semi") === null && pinnedInitiativeLevel("full") === null);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
main();
