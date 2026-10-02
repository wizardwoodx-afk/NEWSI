/**
 * probe/autoRepairReplay.test.ts — the 19.7.0 autonomy + A2A upgrades.
 *
 * Pins:
 *   • the member loop's auto-repair: a transient provider failure gets ONE
 *     situation-changing retry with NO human pause, labelled on the run;
 *     non-transient failures are NOT blind-repaired;
 *   • the federation replay guard: the same crossing request inside the
 *     window is refused in words before anything is signed — and a
 *     different task, or the same task after the window, passes.
 */
import assert from "node:assert/strict";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
}

const { runMemberAgent } = await import("../src/engine/agentLoop");
const { replayGuardCheck, replayGuardStats, resetReplayGuard } = await import("../src/engine/federation/live");
const { pairKey } = await import("../src/engine/selfimpulseMesh");
import type { ProviderConfig } from "../src/engine/types";

const provider: ProviderConfig = { kind: "openai-compatible", baseUrl: "https://provider.example/v1", apiKey: "sk-test-abcdef123456", model: "probe-1" };

const okFetch = (async () => new Response(JSON.stringify({ choices: [{ message: { content: "the repaired standalone answer" } }] }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;

console.log("== the member loop's auto-repair rung ==");
let attempts = 0;
const flakyFetch = (async (_url: string | URL, init?: { body?: string }) => {
  attempts += 1;
  if (attempts === 1) throw new TypeError("terminate: connection reset by peer");
  const body = JSON.parse(init?.body ?? "{}");
  return new Response(JSON.stringify({ choices: [{ message: { content: `recovered:${String(body.messages?.at(-1)?.content ?? "").includes("[repair turn]")}` } }] }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

const run = await runMemberAgent({
  provider,
  specialist: { id: "s1", name: "Probe Specialist", category: "code", riskTier: "safe", capabilities: ["probe"], prompt: "You probe." } as never,
  task: "do the probe task",
  systemBase: "You are a probe member.",
  fetchImpl: flakyFetch,
});
ok("a transient failure was auto-repaired to a real answer", run.ok === true && run.text === "recovered:true");
ok("the repair CHANGED THE SITUATION (a [repair turn] restatement rode the retry)", run.text === "recovered:true");
ok("the run is labelled repaired with the reason in words", run.repaired === true && (run.repairNote ?? "").includes("attempt 1 failed with network"));
ok("exactly two provider calls were made (no blind ladder)", run.calls === 2);

let once = 0;
const noKeyFetch = (async () => { once += 1; return new Response("denied", { status: 401 }); }) as typeof fetch;
const run2 = await runMemberAgent({
  provider,
  specialist: { id: "s2", name: "Probe Specialist", category: "code", riskTier: "safe", capabilities: ["probe"], prompt: "You probe." } as never,
  task: "task two",
  systemBase: "You are a probe member.",
  fetchImpl: noKeyFetch,
});
ok("an HTTP failure is NOT blind-repaired (one attempt, honest failure)", once === 1 && run2.ok === false && run2.repaired !== true);
ok("the non-repaired failure still carries its kind", run2.errorKind === "http-error");

console.log("== the A2A replay guard ==");
resetReplayGuard();
const t0 = new Date("2026-09-19T12:00:00Z");
const first = replayGuardCheck("Owner A", "Owner B", "repo.write", "ship the notes", () => t0);
ok("the first submission passes the guard", first.ok === true);
const dup = replayGuardCheck("Owner A", "Owner B", "repo.write", "ship the notes", () => new Date(t0.getTime() + 5000));
ok("a duplicate inside the window is refused in words", dup.ok === false && dup.reason.includes("replay-guard") && dup.reason.includes("nothing was signed twice"));
const other = replayGuardCheck("Owner A", "Owner B", "repo.write", "a DIFFERENT task entirely", () => new Date(t0.getTime() + 6000));
ok("a different task on the same pair passes", other.ok === true);
const after = replayGuardCheck("Owner A", "Owner B", "repo.write", "ship the notes", () => new Date(t0.getTime() + 61_000));
ok("the same task AFTER the window passes — an owner may rerun", after.ok === true);
const wsWhitespace = replayGuardCheck("Owner A", "Owner B", "repo.write", "ship   the\nnotes", () => new Date(t0.getTime() + 62_000));
ok("whitespace-cosplay of the same task is still caught", wsWhitespace.ok === false);
ok("the guard stats speak", replayGuardStats().windowMs === 60_000 && replayGuardStats().entries >= 1);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("\nfailures:"); for (const f of failures) console.log(`  - ${f}`); }
process.exit(failed > 0 ? 1 : 0);
