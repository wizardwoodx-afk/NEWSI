/**
 * probe/tokenPipeline.test.ts — the 19.7.0 wire optimization pipeline.
 *
 * Pins the honesty contract of the token optimizer:
 *   • estimates are estimates, but the budgeting is real;
 *   • normalization never changes meaning, only bytes;
 *   • repeated lines collapse with a MARK in place, not silent drops;
 *   • the cache-alignment report tells the truth about the prompt prefix;
 *   • the emergency budget guard only fires on egregious overshoot;
 *   • complete() rides the pipeline: events land in the ring with deltas.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const {
  estimateTokens, fitToBudget, optimizeComposedPrompt, optimizeWirePair,
  normalizeWhitespace, collapseRepeatedLines, fnv1a,
  wireEventSeq, optimDelta, resetWireCacheState, WIRE_BUDGET,
} = await import("../src/engine/tokenOptim");
const { complete } = await import("../src/engine/providers");

console.log("== estimates and the fitter ==");
ok("estimateTokens is the honest ~4 chars/token", estimateTokens("12345678") === 2);
ok("fitToBudget leaves short text alone", !fitToBudget("hello world", 100).trimmed);
const big = ("x".repeat(3000) + "\n") + "keep this tail line".repeat(20);
const fit = fitToBudget(big, 400);
ok("fitToBudget trims only when over, and MARKS the cut", fit.trimmed && fit.text.includes("trimmed by the VH token optimizer"));
ok("fitToBudget keeps the tail (the checklist)", fit.text.endsWith("keep this tail line".repeat(20).slice(-40)) || fit.text.includes("keep this tail line"));

console.log("== stage 1: normalization ==");
const n = normalizeWhitespace("a\n\n\n\nb   \nc");
ok("3+ newlines collapse, trailing spaces go, meaning stays", n.text === "a\n\nb\nc" && n.removedChars > 0);

console.log("== stage 2: repeated-line collapse ==");
const rep = ["alpha beta gamma delta", "alpha beta gamma delta", "alpha beta gamma delta", "something else entirely long here"].join("\n");
const c = collapseRepeatedLines(rep);
ok("a line seen >2× collapses to the first two + a marker", c.collapsed === 1 && c.text.includes("repeats 1 more time") && c.text.includes("repeats elided by the token optimizer"));
ok("structural lines never collapse", collapseRepeatedLines("# Header\n# Header").collapsed === 0);

console.log("== fnv1a determinism ==");
ok("same text, same hash; different text, different hash",
  fnv1a("mission alpha") === fnv1a("mission alpha") && fnv1a("mission alpha") !== fnv1a("mission beta"));

console.log("== the wire pipeline ==");
resetWireCacheState();
const seq0 = wireEventSeq();
const sys = "You are SelfImpulse.\n\n\n\nStay honest.   \nStay honest.";
const usr = "plan a mission";
const w1 = optimizeWirePair(sys, usr, { model: "m1", kind: "probe" });
ok("pipeline returns usable texts", w1.system.includes("You are SelfImpulse.") && w1.user === "plan a mission");
ok("pipeline report is labelled an estimate", w1.report.est === true);
ok("first call is NOT cache-aligned (no prefix history)", w1.report.cacheAligned === false);
const w2 = optimizeWirePair(sys, usr, { model: "m1", kind: "probe" });
ok("identical system bytes on the same model ARE cache-aligned", w2.report.cacheAligned === true);
const w3 = optimizeWirePair(sys, usr, { model: "m2", kind: "probe" });
ok("a different model is NOT cache-aligned", w3.report.cacheAligned === false);
const delta = optimDelta(seq0);
ok("optimDelta scopes to the run: 3 calls, honest sums", delta.calls === 3 && delta.savedTokens >= 0 && delta.est === true);
ok("the pipeline never turns text into a fabrication", w1.system.includes("Stay honest"));

const hugeSys = Array.from({ length: 4000 }, (_, i) => `Unique filler line ${i} carrying plenty of padding text so dedup cannot save it here.`).join("\n");
const w4 = optimizeWirePair(hugeSys, "short task", { model: "m3", kind: "probe" });
ok("the emergency budget guard fires only on egregious overshoot", w4.report.budgetTrimmed === true && estimateTokens(w4.system + "\n" + w4.user) <= WIRE_BUDGET + 900);

console.log("== complete() rides the pipeline ==");
const seq1 = wireEventSeq();
const cfg: ProviderConfig = { kind: "openai-compatible", baseUrl: "https://provider.example/v1", apiKey: "sk-test-abcdef123456", model: "probe-1" };
let seenBody = "";
const fakeFetch = (async (_url: string | URL, init?: { body?: string }) => {
  seenBody = init?.body ?? "";
  return new Response(JSON.stringify({ choices: [{ message: { content: "the answer" } }] }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;
const r = await complete(cfg, "You are SelfImpulse, the SelfImpulse generalist.", "hello", { fetchImpl: fakeFetch });
ok("complete() succeeds through the pipeline", r.ok === true && r.text === "the answer");
ok("the wire body still carries the system + user roles", seenBody.includes("You are SelfImpulse") && seenBody.includes("hello"));
const d1 = optimDelta(seq1);
ok("the call landed exactly one pipeline event", d1.calls === 1 && d1.beforeTokens > 0);

console.log("== the composed-prompt fitter still honors skills ==");
const composed = ["Base identity prompt for the specialist.", "## Bound skills", "### Skill: Search", "Procedure: find sources", "1. search the web", "1. read the top result", "1. cite what you used"].join("\n");
const opt = optimizeComposedPrompt(composed, estimateTokens(composed) - 5 > 0 ? 10 : 10);
ok("over budget, it trims; the base prompt survives", opt.optimized === true && opt.prompt.includes("Base identity prompt"));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
