import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// src/engine/modes.ts
var CREW_MODES = ["manual", "semi", "full"];
var CREW_MODE_LABELS = {
  manual: "Manual",
  semi: "Semi-autonomous",
  full: "Fully autonomous"
};
var CREW_MODE_DOCTRINE = {
  manual: "every act waits for your approval \u2014 nothing moves without you",
  semi: "safe acts run free; risky and critical acts stop at your gate",
  full: "safe and risky acts run free inside the hard caps; critical acts still stop at your gate"
};
var MODE_LEDGER_CAP = 100;
function initialModeState() {
  return { mode: "manual", prev: null, changedAt: 0, switches: [] };
}
function setMode(state, next, at, why = "") {
  if (!CREW_MODES.includes(next)) {
    return { state, changed: false, line: "", error: `unknown mode '${String(next)}' \u2014 use manual | semi | full` };
  }
  if (state.mode === next) {
    return {
      state,
      changed: false,
      line: `already in ${CREW_MODE_LABELS[next]} \u2014 no switch, no event`
    };
  }
  const entry = { from: state.mode, to: next, at, why };
  const ledger = [entry, ...state.switches];
  if (ledger.length > MODE_LEDGER_CAP) ledger.length = MODE_LEDGER_CAP;
  return {
    state: { mode: next, prev: state.mode, changedAt: at, switches: ledger },
    changed: true,
    line: `mode switched ${CREW_MODE_LABELS[entry.from]} \u2192 ${CREW_MODE_LABELS[entry.to]} \u2014 in-flight acts finish under ${CREW_MODE_LABELS[entry.from]}; new acts follow ${CREW_MODE_LABELS[next]} (${CREW_MODE_DOCTRINE[next]})`
  };
}
function actRunsUnattended(mode, tier) {
  if (tier === "critical") return false;
  if (mode === "manual") return false;
  if (mode === "semi") return tier === "safe";
  return true;
}
function gateAskLine(mode, tier, subject) {
  if (tier === "critical") {
    return `critical-tier act always asks, in every mode \u2014 approval needed: ${subject}`;
  }
  return `${CREW_MODE_LABELS[mode]} mode does not run ${tier}-tier acts unattended \u2014 approval needed: ${subject}`;
}
function pinnedInitiativeLevel(mode) {
  return mode === "manual" ? 0 : null;
}

// probe/modes.test.ts
var passed = 0;
var failed = 0;
var failures = [];
function ok(label, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ok   ${label}`);
  } else {
    failed++;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
}
function main() {
  console.log("modes \u2014 the owner's throttle");
  ok("exactly three modes, in order", CREW_MODES.length === 3 && CREW_MODES[0] === "manual" && CREW_MODES[1] === "semi" && CREW_MODES[2] === "full");
  ok(
    "labels never say bare auto \u2014 the owner reads Semi-autonomous / Fully autonomous",
    CREW_MODE_LABELS.semi === "Semi-autonomous" && CREW_MODE_LABELS.full === "Fully autonomous" && CREW_MODE_LABELS.manual === "Manual"
  );
  ok("every mode carries its doctrine line", CREW_MODES.every((m) => CREW_MODE_DOCTRINE[m].length > 20));
  ok("manual admits nothing unattended", ["safe", "risky", "critical"].every((t) => !actRunsUnattended("manual", t)));
  ok("semi admits safe only", actRunsUnattended("semi", "safe") && !actRunsUnattended("semi", "risky") && !actRunsUnattended("semi", "critical"));
  ok("full admits safe and risky \u2014 critical still gates", actRunsUnattended("full", "safe") && actRunsUnattended("full", "risky") && !actRunsUnattended("full", "critical"));
  ok("CRITICAL gates in every mode \u2014 no override exists", CREW_MODES.every((m) => !actRunsUnattended(m, "critical")));
  const s0 = initialModeState();
  ok("the default is manual \u2014 nothing moves without the owner", s0.mode === "manual" && s0.prev === null && s0.switches.length === 0);
  const s1 = setMode(s0, "full", 1e3, "trusted crew, trusted task");
  ok("a real switch records from \u2192 to \u2192 at \u2192 why", s1.changed && s1.state.mode === "full" && s1.state.prev === "manual" && s1.state.switches[0].from === "manual" && s1.state.switches[0].at === 1e3 && s1.state.switches[0].why === "trusted crew, trusted task");
  ok("the switch line names the in-flight contract", s1.line.includes("in-flight acts finish under Manual") && s1.line.includes("new acts follow Fully autonomous"));
  const s2 = setMode(s1.state, "full", 2e3);
  ok("same-mode set is an honest no-op \u2014 no event, no ledger noise", !s2.changed && s2.state.switches.length === 1 && s2.line.includes("no switch"));
  const s3 = setMode(s0, "warp", 3e3);
  ok("an unknown mode is refused, not coerced", !s3.changed && typeof s3.error === "string" && s3.error.includes("manual | semi | full"));
  const s4 = setMode(s1.state, "semi", 4e3);
  ok("the ledger keeps full history, newest first", s4.state.switches.length === 2 && s4.state.switches[0].to === "semi" && s4.state.switches[1].to === "full");
  const ask = gateAskLine("semi", "risky", "push to production");
  ok("the gate ask states mode, tier and the work", ask.includes("Semi-autonomous") && ask.includes("risky") && ask.includes("push to production"));
  const askC = gateAskLine("full", "critical", "delete the vault");
  ok("even in full, a critical ask says ALWAYS", askC.includes("every mode") && askC.includes("delete the vault"));
  ok("manual pins initiative at 0; semi/full leave the owner's level free", pinnedInitiativeLevel("manual") === 0 && pinnedInitiativeLevel("semi") === null && pinnedInitiativeLevel("full") === null);
  console.log(`
${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nfailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
main();
