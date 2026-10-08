/**
 * probe/dispatchLanes.test.ts — the labour ceiling on a fan-out. The lift from
 * the `claw-enterprise` controller's credential queue (MIT, Copyright (c) 2026
 * OpenAI, `apps/controller/src/drivers/repo/credentials/provider-queue.ts`;
 * licence at `LICENSES/claw-enterprise-MIT.txt`).
 *
 * WHY THIS IS NOT AN ABSTRACTION WAITING FOR A CALLER
 * `executeTeam` drained its wave with `Promise.all`: every seat in the wave
 * started in the same instant. Nothing in this repository ceilings
 * `team.seats` — `validateTeam` in `src/mission/agentTeam.ts` checks role shape
 * and never count, and `composeAssignments` emits one seat per roster entry —
 * and since 19.7.15 a seat is an in-process agent loop holding the owner's
 * provider key. So the unbounded point was real, it was reachable, and the crew
 * layer had already bounded itself (`CREW_CONCURRENCY`) while the executor layer
 * had not.
 *
 * §6 therefore drives a REAL `executeTeam()` over a REAL git repository with
 * twelve writer seats and measures the peak number of `nativeInvoke` calls that
 * were in flight at once. That is the whole property: not "the queue looks
 * correct in isolation" but "the run that used to open twelve streams now opens
 * at most eight, and every seat still has a record."
 *
 * The rest of the suite pins the queue's own contract, including the two arms
 * the run path cannot reach and which are stated as guards rather than passed off
 * as exercised behaviour: the overflow refusal (§4) and the mid-queue stop
 * (§5). Both are honest about which is which.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import {
  createDispatchLanes,
  HOUSEKEEPING_STREAK_CAP,
  isLaneRefusal,
  laneForSeat,
  LaneRefusalError,
  SEAT_LANE_CONCURRENCY,
} from "../src/mission/dispatchLanes";
import { executeTeam, type TeamRunRequest, type TeamRunnerDeps } from "../src/mission/teamExecutor";
import type { CliAgentTeam, TeamSeat } from "../src/mission/agentTeam";
import { CapLedger } from "../src/mission/caps";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function ok(label: string, cond: boolean, detail = ""): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(name: string): void {
  console.log(`\n== ${name}`);
}

declare const SI_ROOT: string | undefined;
const ROOT = typeof SI_ROOT === "string" && SI_ROOT.length > 0 ? SI_ROOT : process.cwd();

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/* ── the real-executor fixtures (same shape probe/mergeGate pins) ─────────── */

function sh(args: string[], cwd: string): { code: number | null; out: string } {
  try {
    const out = execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string; stderr?: string };
    return { code: err.status ?? null, out: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

function makeRepo(): { repo: string; branch: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "si-lanes-"));
  fs.writeFileSync(path.join(repo, "app.js"), "module.exports = { v: 1 };\n");
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ name: "si-lanes-fixture", version: "1.0.0" }, null, 2));
  sh(["git", "init", "-q", "."], repo);
  sh(["git", "config", "user.email", "si@selfimpulse.local"], repo);
  sh(["git", "config", "user.name", "SelfImpulse"], repo);
  sh(["git", "add", "-A"], repo);
  sh(["git", "commit", "-qm", "initial"], repo);
  const branch = sh(["git", "symbolic-ref", "--short", "HEAD"], repo).out.trim() || "master";
  return { repo, branch };
}

const writerSeat = (n: number): TeamSeat => ({
  id: `impl-${String(n)}`,
  role: "coder",
  harness: "hermes",
  model: null,
  mayWrite: true,
  maxRisk: "MEDIUM",
  timeoutSecs: 120,
  maxTurns: 1,
  instructions: "Write one file and stop.",
});

const reviewerSeat = (): TeamSeat => ({
  id: "reviewer",
  role: "reviewer",
  harness: "codex",
  model: null,
  mayWrite: false,
  maxRisk: "LOW",
  timeoutSecs: 120,
  maxTurns: 1,
  instructions: "Review the snapshot.",
});

async function main(): Promise<void> {
  /* ── 1. the ceiling itself ─────────────────────────────────────────────── */
  section("1 · the ceiling holds, and the work is never dropped");
  {
    const lanes = createDispatchLanes({ concurrency: 3, maximumQueued: 32 });
    let inFlight = 0;
    let peak = 0;
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        lanes.run(async () => {
          inFlight += 1;
          peak = Math.max(peak, inFlight);
          await sleep(4);
          inFlight -= 1;
          return i;
        }),
      ),
    );
    ok("peak concurrency never exceeded the ceiling", peak <= 3, `peak ${peak}`);
    ok("the ceiling actually bound (it did not serialise to 1)", peak === 3, `peak ${peak}`);
    ok("all 24 entries completed and returned their own value", results.length === 24 && results.every((v, i) => v === i));
    ok("the lane reports itself empty when drained", lanes.pending === 0 && lanes.waiting === 0 && lanes.running === 0);
    ok("the snapshot counts what started", lanes.snapshot().startedByLane.foreground === 24);
  }

  /* ── 2. the ceiling is a ceiling, not a hint ───────────────────────────── */
  section("2 · a lane of 1 is a queue, and a task failure is not a refusal");
  {
    const lanes = createDispatchLanes({ concurrency: 1, maximumQueued: 8 });
    const order: string[] = [];
    await Promise.all([
      lanes.run(async () => { await sleep(10); order.push("a"); }),
      lanes.run(async () => { order.push("b"); }),
      lanes.run(async () => { order.push("c"); }),
    ]);
    ok("one lane runs one at a time, in order", order.join(",") === "a,b,c", order.join(","));

    const mixed = createDispatchLanes({ concurrency: 2, maximumQueued: 8 });
    const settled = await Promise.allSettled([
      mixed.run(async () => { throw new Error("the seat's own failure"); }),
      mixed.run(async () => "fine"),
    ]);
    ok("a task that throws propagates its OWN error, unchanged", settled[0].status === "rejected" && (settled[0] as PromiseRejectedResult).reason.message === "the seat's own failure");
    ok("a refusal is a distinct type, so a caller never confuses the two", !isLaneRefusal((settled[0] as PromiseRejectedResult).reason));
    ok("a sibling in the same lane is unaffected", settled[1].status === "fulfilled");
  }

  /* ── 3. the two lanes and the starvation cap ───────────────────────────── */
  section("3 · housekeeping never starves admitted work");
  {
    const lanes = createDispatchLanes({ concurrency: 1, maximumQueued: 64, housekeepingStreakCap: HOUSEKEEPING_STREAK_CAP });
    const started: string[] = [];
    // One admitted foreground entry, queued BEHIND a stream of housekeeping.
    const blockers = Array.from({ length: 6 }, (_, i) =>
      lanes.run(async () => { started.push(`h${String(i)}`); }, { priority: "housekeeping" }),
    );
    const admitted = lanes.run(async () => { started.push("F"); }, { priority: "foreground" });
    await Promise.all([...blockers, admitted]);
    ok("the admitted entry ran at all (it was not starved out)", started.includes("F"), started.join(","));
    /* THE STARVATION GUARD, STATED PRECISELY. `housekeeping` entries had a two
     * head start on the admitted one, so the honest claim is: no more than
     * HOUSEKEEPING_STREAK_CAP housekeeping entries may run between the moment an
     * admitted entry is queued and the moment it gets its lane. Index 2 with a
     * cap of 2 is exactly that, and it is why the cap exists — without it the
     * admitted entry would have been 7th. */
    ok("an admitted entry waits behind at most the streak cap", started.indexOf("F") <= HOUSEKEEPING_STREAK_CAP, started.join(","));
    ok("housekeeping really did run first (the cap is a cap, not a reversal)", started[0].startsWith("h") && started[1].startsWith("h"), started.join(","));
    ok("the remaining housekeeping drained after the admitted entry", started.filter((s) => s.startsWith("h")).length === 6, started.join(","));
    ok("the lane labels a writer as foreground", laneForSeat(true) === "foreground");
    ok("the lane labels a read-only seat as housekeeping", laneForSeat(false) === "housekeeping");
  }

  section("4 · a full lane REFUSES in words — the guard arm");
  {
    /* `maximumQueued` caps WAITING entries, not running ones (see the doc on
     * `createDispatchLanes`), so with one lane and one waiting slot the queue
     * holds exactly two and the third is refused. */
    const lanes = createDispatchLanes({ concurrency: 1, maximumQueued: 1 });
    let thirdStarted = false;
    const held: Promise<unknown>[] = [
      lanes.run(async () => { await sleep(40); }),
      lanes.run(async () => { await sleep(40); }),
    ];
    let refusal: unknown = null;
    try {
      await lanes.run(async () => { thirdStarted = true; return "should not start"; });
      ok("overflow was refused", false, "it resolved instead of refusing");
    } catch (e) {
      refusal = e;
      ok("overflow rejected rather than growing the queue", isLaneRefusal(e), String(e));
      ok("the refusal is a LaneRefusalError", e instanceof LaneRefusalError);
      ok("the refusal names the ceiling and the queue depth", /lane is full/.test(String((e as Error).message)) && /ceiling of 1/.test((e as Error).message), (e as Error).message);
    }
    await Promise.all(held);
    ok("the refusal is recorded on the lane's own snapshot", lanes.snapshot().refused.length === 1, JSON.stringify(lanes.snapshot().refused));
    ok("the refused entry never started", thirdStarted === false);
    ok("only the two admitted entries started", lanes.snapshot().startedByLane.foreground === 2, JSON.stringify(lanes.snapshot().startedByLane));
    ok("a refusal carries a real error object", refusal !== null);
    ok("the lane takes new work again once it drains", await lanes.run(async () => true));
  }

  section("5 · a stop that arrives while an entry waits — the guard arm");
  {
    let stopped = false;
    const lanes = createDispatchLanes({ concurrency: 1, maximumQueued: 8 });
    const stopReason = () => (stopped ? "the mission has already spent its ceiling — dispatch refused" : null);
    const first = lanes.run(async () => { await sleep(20); stopped = true; });
    const later = Array.from({ length: 3 }, () => lanes.run(async () => "ran", { stopReason }));
    const settled = await Promise.allSettled([first, ...later]);
    const refused = settled.filter((s) => s.status === "rejected" && isLaneRefusal(s.reason));
    const ran = settled.filter((s) => s.status === "fulfilled");
    ok("an entry overtaken by the stop refused instead of starting", refused.length >= 1, `${String(refused.length)} refused`);
    ok("the refusal repeats the run's own sentence", refused.length === 0 || /ceiling/.test(String((refused[0] as PromiseRejectedResult).reason.message)));
    ok("entries that started before the stop were not cancelled mid-flight", ran.length >= 1, `${String(ran.length)} fulfilled`);
    ok("an entry enqueued AFTER the stop is refused at the door", await lanes.run(async () => "no", { stopReason }).then(
      () => false,
      (e: unknown) => isLaneRefusal(e),
    ));
  }

  /* ── 6. THE REAL CALLER: a twelve-seat wave through executeTeam ─────────── */
  section(`6 · a real executeTeam wave of 12 writers opens at most ${SEAT_LANE_CONCURRENCY} streams`);
  {
    const { repo, branch } = makeRepo();
    const seats = [...Array.from({ length: 12 }, (_, i) => writerSeat(i)), reviewerSeat()];
    const team: CliAgentTeam = {
      id: "t.lanes.probe",
      name: "Lane probe team",
      description: "12 writers + 1 reviewer, all writers in one wave",
      schemaVersion: 1,
      seats,
    };
    let inFlight = 0;
    let peak = 0;
    let calls = 0;
    const deps: TeamRunnerDeps = {
      resolveBin: async (bin) => `/usr/local/bin/${bin}`,
      nativeInvoke: async (req) => {
        calls += 1;
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        // Hold the lane open long enough for the ceiling to be observable rather
        // than merely theoretically in place.
        await sleep(12);
        if (!req.readOnly) fs.writeFileSync(path.join(req.cwd, `lane-${String(calls)}.js`), "module.exports = 1;\n");
        inFlight -= 1;
        return {
          exitCode: 0,
          stdout: JSON.stringify({ type: "result", is_error: false, result: req.readOnly ? "CORRECT: reviewed against snapshot." : "Implemented.", total_cost_usd: 0.001, usage: { input_tokens: 10, output_tokens: 5 } }),
          stderr: "",
          durationMs: 12,
          timedOut: false,
        };
      },
      git: async (args, cwd) => {
        const r = sh(["git", ...args], cwd);
        return { ok: r.code === 0, stdout: r.out, stderr: "", exitCode: r.code, reason: null };
      },
      writeFile: async (p, contents) => {
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, contents);
      },
      verify: async (cwd) => {
        const r = sh(["node", "-e", "process.exit(0)"], cwd);
        return { exitCode: r.code ?? 0, stdout: r.out, stderr: "", durationMs: 3, timedOut: false };
      },
    };
    const req: TeamRunRequest = {
      team,
      assignments: team.seats.map((s) => ({
        seat: s,
        prompt: `Objective for ${s.role}.`,
        wave: s.role === "coder" ? 1 : 2,
        readOnly: s.role !== "coder",
      })),
      repoRoot: repo,
      baseBranch: branch,
      missionSlug: `lanes-${Math.random().toString(36).slice(2, 8)}`,
      objective: "Labour ceiling fixture.",
      steps: undefined as never,
      ledger: new CapLedger({ maxCostUsd: 5, maxTurns: 60, timeoutMs: 120_000 }, Date.now()),
      testCommand: ["node", "-e", "process.exit(0)"],
    } as never;

    const report = await executeTeam(req, deps);

    ok(`peak concurrent seat streams stayed at or under the ceiling (${SEAT_LANE_CONCURRENCY})`, peak <= SEAT_LANE_CONCURRENCY, `peak ${peak}`);
    ok("the wave really did fan out (the ceiling bound it, it did not serialise it)", peak > 1 && peak <= SEAT_LANE_CONCURRENCY, `peak ${peak}`);
    ok("every writer seat still produced a record — nothing was dropped by the queue", report.seats.length === seats.length, `${String(report.seats.length)} of ${String(seats.length)}`);
    ok("all twelve writers were dispatched, so the bound delayed rather than denied", calls >= 12, `${String(calls)} nativeInvoke calls`);
    ok("the run reached a verdict and the report is intact", ["completed", "partial", "blocked"].includes(report.status), report.status);
    ok("no seat was refused for queue space (the wave sized its own ceiling)", !report.seats.some((s) => /lane is full/.test(s.reason)), JSON.stringify(report.seats.filter((s) => /lane is full/.test(s.reason)).map((s) => s.seatId)));
    ok("the run spent money on real dispatches, so the seats genuinely ran", report.spentUsd > 0, String(report.spentUsd));

    fs.rmSync(repo, { recursive: true, force: true });
  }

  /* ── 7. the wiring is the queue's only reason to exist ─────────────────── */
  section("7 · the queue is wired into the executor, by source");
  const execSrc = fs.readFileSync(path.join(ROOT, "src/mission/teamExecutor.ts"), "utf8");
  ok("the executor imports the lane module", /from "\.\/dispatchLanes"/.test(execSrc));
  ok("the executor builds ONE lane set per run, at the product ceiling", /createDispatchLanes\(\{ concurrency: SEAT_LANE_CONCURRENCY/.test(execSrc));
  ok("the wave drain goes through a lane rather than a bare Promise.all of runSeat", /lanes\.run\(entry,\s*\{/.test(execSrc) && !/Promise\.all\(\s*runnableWave\.map\(\(a\) =>\s*runSeat\(/.test(execSrc));
  ok("a writer seat is dispatched foreground and a read-only seat as housekeeping", /priority: laneForSeat\(a\.seat\.mayWrite\)/.test(execSrc));
  ok("a queued seat is re-checked against the run's cap before it starts", /stopReason: \(\) => req\.ledger\.admissionError\(now\(\)\)/.test(execSrc));
  ok("a refusal becomes an honest unrun seat, not a silent success", /isLaneRefusal\(e\)/.test(execSrc) && /unrunRecord\(a,[\s\S]{0,120}"skipped_budget"/.test(execSrc));
  ok("a refusal is reported in the run's own budget sentence", /laneRefusals/.test(execSrc));
  const pkg = fs.readFileSync(path.join(ROOT, "package.json"), "utf8");
  ok("no npm package was added for this", !/bottleneck|p-queue|p-limit|async-semaphore/.test(pkg));
  ok("the queue module imports nothing at all", !/^import /m.test(fs.readFileSync(path.join(ROOT, "src/mission/dispatchLanes.ts"), "utf8")));

  console.log(`\n========================================`);
  console.log(`DISPATCH LANES PROBE SUMMARY: ${passed} passed, ${failed} failed.`);
  console.log(`========================================`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("dispatchLanes probe crashed:", err);
  process.exit(1);
});
