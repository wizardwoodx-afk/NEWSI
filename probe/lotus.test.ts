/**
 * probe/lotus.test.ts — LEAN OPTIMAL TOKEN UTILISATION SYSTEM (19.7.4 [Crew]).
 *
 * Pins: the four modes and the auto ladder, the LAWS (never changes meaning;
 * error-shaped output passes byte-exact; reversible via the spill; dedup
 * refs for identical output; the net-win gate refuses a pass that does not
 * pay for itself), honest estimate-based numbers, and the report/line.
 */
import assert from "node:assert/strict";

let passed = 0; let failed = 0; const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

import {
  LOTUS_MODES, LOTUS_DEFAULT_MODE, LOTUS_MIN_SAVE, compressToolOutput, isErrorShaped,
  lotusExpand, lotusReport, lotusLine, noteLotus, resetLotusSession, spillSize,
  type LotusResult,
} from "../src/engine/lotus";

function noisy(n: number): string {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) lines.push(`item ${i}: value ${i * 7} status ok path /very/long/path/number/${i}/under/root — with trailing padding text to make each line long enough to matter for the estimate`);
  return lines.join("\n");
}

function main(): void {
  console.log("lotus — the crew's token economy");

  ok("four modes, auto is the default", LOTUS_MODES.length === 4 && LOTUS_MODES.includes("auto") && LOTUS_DEFAULT_MODE === "auto");
  ok("the net-win gate is a real floor", LOTUS_MIN_SAVE === 16);

  /* LAW 1 — error-shaped output passes byte-exact */
  const err = "TypeError: cannot read properties of undefined (reading 'id')\n    at handler (app.ts:41:19)\n    at process (tick.js:9:3)";
  ok("error-shaped output is detected", isErrorShaped(err));
  const errRes = compressToolOutput(err, "aggressive");
  ok("errors pass byte-exact — a compressed bug is a hidden bug", !errRes.compressed && errRes.text === err && errRes.untouchedReason === "error-shaped output passes byte-exact");

  /* LAW 2 — the net-win gate */
  const tiny = "ok";
  const tinyRes = compressToolOutput(tiny, "aggressive");
  ok("a pass that cannot pay for itself is refused", !tinyRes.compressed && tinyRes.text === tiny && (tinyRes.untouchedReason ?? "").includes("net-win gate"));

  /* LAW 3 — meaning-preserving compression, marked and reversible */
  resetLotusSession();
  const big = noisy(60);
  const res = compressToolOutput(big, "balanced");
  ok("balanced compresses a big listing", res.compressed && res.savedTokens > 0);
  ok("the numbers are honest: saved = original − output", res.savedTokens === res.originalTokens - res.outputTokens && res.originalTokens > res.outputTokens);
  ok("the cut is marked, not silent", res.text.includes("LOTUS:") && res.text.includes("elided"));
  ok("head and tail survive — the cut is the MIDDLE only", res.text.startsWith(big.slice(0, 40)) && res.text.includes(big.slice(-60).trimEnd().slice(-40)));
  ok("the elided original is kept in the spill", spillSize() >= 1 && typeof res.ref === "string");
  const restored = res.ref ? lotusExpand(res.ref) : null;
  ok("lotusExpand recovers the byte-exact original", restored === big);

  /* LAW 4 — dedup refs */
  const again = compressToolOutput(big, "balanced");
  ok("identical output compresses to a short ref line", again.compressed && again.text.includes("identical output") && again.savedTokens === again.originalTokens - again.outputTokens);
  ok("the ref line costs a handful of tokens, not the payload", again.outputTokens < 60, `got ${again.outputTokens}`);
  ok("the occurrence count is stated", again.text.includes("occurrence #2"));

  /* the auto ladder */
  const smallAuto = compressToolOutput("one short line of output", "auto");
  ok("auto picks conservative for small output", smallAuto.mode === "conservative");
  const hugeAuto = compressToolOutput(noisy(400), "auto");
  ok("auto picks aggressive for huge output", hugeAuto.mode === "aggressive");
  const consBig = compressToolOutput(noisy(60), "conservative");
  ok("conservative still normalizes — but never elides", consBig.compressed === false || !consBig.text.includes("elided"));

  /* the ring + the line */
  resetLotusSession();
  const r1: LotusResult = compressToolOutput(noisy(60), "balanced");
  noteLotus(r1);
  const r2 = compressToolOutput(err, "aggressive");
  noteLotus(r2);
  const rep = lotusReport();
  ok("the report counts compressed and passthrough separately", rep.calls === 2 && rep.compressed === 1 && rep.passthrough === 1);
  ok("the report sums real savings, labelled estimates", rep.savedTokens === r1.savedTokens);
  const line = lotusLine(rep);
  ok("the line states compressed/total, savings, and the estimate label", line.includes("1/2") && line.includes("est. tokens saved") && line.includes("estimates, labelled"));
  ok("reset clears the session state", ((): number => { resetLotusSession(); return spillSize(); })() === 0);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); process.exit(1); }
}
main();
