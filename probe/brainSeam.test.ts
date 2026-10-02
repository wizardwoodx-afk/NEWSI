/**
 * probe/brainSeam.test.ts — the real-model planning seam (16.9.7).
 *
 * The 16.9.6 review found the production gap: the seam spawned via
 * node:child_process, which the web bundle aliases to an honest stub — so a
 * shipped "Claude exited 1" could mean the CLI never ran. 16.9.7 fixes the
 * boundary, and this probe pins the FIX:
 *
 *   - HOST ROUTING: production invoke routes Tauri → ipc.cliInvoke (the Rust
 *     allowlist), refuses the web edition in words BEFORE any spawn, and the
 *     module never imports node:child_process at all (the stub is untouchable).
 *   - ASYNC: decide admits a Promise; the chat's event loop never blocks.
 *   - THE TRUE END-TO-END: a REAL process (node itself — harmless and
 *     deterministic) is resolved, invoked, parsed into a PLAN, labeled REAL,
 *     under the hybrid identity — in this probe's real Node environment.
 *   - REFUSAL TAXONOMY: unknown · not installed · host-cannot-spawn (which
 *     is NOT "exited 1") · non-zero exit · timeout · empty — all in words.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import {
  wrapRealModelBrain, runModelPrompt, planFromModelText, plannerPrompt,
  brainModelRun, realBrainDeps, realBrainInvoke, bareProviderId,
  BrainHostError, type BrainInvokeDeps,
} from "../src/selfimpulse/engine/brainSeam";
import { simulatedBrain, type SelfImpulseBrain } from "../src/selfimpulse/engine/selfimpulse";
import { HARNESS_BY_ID, type HarnessId } from "../src/domain/harness";

const root: string = (globalThis as { SI_ROOT?: string }).SI_ROOT ?? process.cwd();
const AUTO = "auto" as const;
const execFileP = promisify(execFile);

/** Fake deps: host-shaped, no real process — for the refusal taxonomy. */
const fakeDeps = (behavior: { installed?: boolean; exit?: number; answer?: string; timeout?: boolean; hostError?: boolean }): BrainInvokeDeps => ({
  resolve: (id) => (id === "unknown" ? null : behavior.installed === false ? { name: "Fake CLI", bin: null, argv: ["$PROMPT"] } : { name: "Fake CLI", bin: "/usr/bin/fake-cli", argv: ["$PROMPT"] }),
  invoke: async (_bin, _argv, _t) => {
    if (behavior.hostError) throw new BrainHostError("this host cannot spawn processes — test host error");
    if (behavior.timeout) return { exitCode: 1, stdout: "", stderr: "timed out", timedOut: true };
    if (behavior.exit) return { exitCode: behavior.exit, stdout: "", stderr: "boom", timedOut: false };
    return { exitCode: 0, stdout: behavior.answer ?? "step one\nstep two\n- step three", stderr: "", timedOut: false };
  },
});

/** REAL deps: a genuine process — node itself as the harmless deterministic harness. */
const realNodeDeps = (): BrainInvokeDeps => ({
  // this fake host has exactly one CLI installed — node itself — aliased to
  // whatever registry id the walk asks for. The template passes the prompt as
  // DATA (argv[1]) to a small deterministic program that derives the plan from
  // it — the same shape a real harness adapter uses. REAL process, REAL output.
  resolve: (id) =>
    id === "unknown"
      ? null
      : {
          name: "Node runtime",
          bin: process.execPath,
          argv: [
            "-e",
            "const p = process.argv[1]; const ls = p.split(/\\n/).filter(l => l.trim().length > 20).slice(0, 3); ls.forEach((l, i) => console.log((i + 1) + '. ' + l.trim().slice(0, 60)));",
            "$PROMPT",
          ],
        },
  invoke: async (bin, argv, timeoutSecs) =>
    await new Promise((resolve) => {
      execFile(bin, argv, { timeout: timeoutSecs * 1000, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
        const e = err as { killed?: boolean; code?: number | string } | null;
        resolve({
          exitCode: e ? (typeof e.code === "number" ? e.code : 1) : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? ""),
          timedOut: Boolean(e?.killed),
        });
      });
    }),
});

test("brainSeam — real model, honest refusal, or labeled simulated: never faked", async () => {
  // 1. default is OFF — a human turns the seam on; the base brain runs untouched
  const plain = wrapRealModelBrain(simulatedBrain, fakeDeps({ installed: true }), "simulated");
  const ref = simulatedBrain.decide("What time is it in Chennai?", { mode: "quick", persona: "witty", facts: [] });
  const plainPlan = await plain.decide("x", { mode: "quick", persona: "witty", facts: [] });
  assert.deepEqual(plainPlan.plan, ref.plan, "pref simulated → the base brain runs untouched");

  // 2. THE TRUE END-TO-END: a REAL process runs, its output becomes the PLAN
  const real = wrapRealModelBrain(simulatedBrain, realNodeDeps(), AUTO);
  assert.equal(real.id, "simulated+real-plan", "auto → the hybrid identity is live");
  const planReal = await real.decide("Plan a mission to verify the workspace", { mode: "deep", persona: "professional", facts: [] });
  assert.ok(planReal.thoughts[0].includes("REAL model") && planReal.thoughts[0].includes("Node runtime"), `the run is labeled with the real harness: ${planReal.thoughts[0].slice(0, 80)}`);
  assert.ok(planReal.thoughts[0].includes("still gated"), "the label names the unchanged human gate");
  assert.equal(planReal.plan.length, 3, `plan steps parsed from the REAL process output: ${JSON.stringify(planReal.plan)}`);
  assert.ok(planReal.plan[0].startsWith("You are the planner"), );
  assert.ok(planReal.plan[2].includes("Objective"), "the objective line survived the real round-trip");

  // 3. host-cannot-spawn (the web path) → refused in words, NEVER "exited 1"
  const web = wrapRealModelBrain(simulatedBrain, fakeDeps({ installed: true, hostError: true }), AUTO);
  const planWeb = await web.decide("Plan something", { mode: "deep", persona: "minimal", facts: [] });
  assert.ok(planWeb.thoughts[0].includes("cannot spawn processes"), "the web refusal names the capability gap");
  assert.ok(!planWeb.thoughts[0].includes("exited"), "a host refusal is NOT reported as a CLI exit — no fabricated exit codes");
  assert.ok(planWeb.plan[0].includes("simulated brain retained"), "the labeled simulated brain is retained");
  const direct = await runModelPrompt("hi", "gemini", fakeDeps({ installed: true, hostError: true }));
  assert.equal(direct.ok, false);
  assert.ok(direct.refused.includes("cannot spawn processes") && !direct.refused.includes("exited"), "refusal text is precise at the API level too");

  // 4. not installed / unknown / exit-failure / timeout — all in words
  const absent = wrapRealModelBrain(simulatedBrain, fakeDeps({ installed: false }), AUTO);
  const planAbsent = await absent.decide("Plan something real", { mode: "deep", persona: "minimal", facts: [] });
  assert.ok(planAbsent.thoughts[0].includes("never fakes"), "the absence refusal names the honesty rule");
  const failed = await runModelPrompt("hi", "fake", fakeDeps({ installed: true, exit: 3 }));
  assert.ok(!failed.ok && failed.refused.includes("exited 3"), "a real CLI failure is reported as itself");
  const slow = await runModelPrompt("hi", "fake", fakeDeps({ installed: true, timeout: true }));
  assert.ok(!slow.ok && slow.refused.includes("timed out"), "timeout refused in words");
  const unknown = await runModelPrompt("hi", "unknown", fakeDeps({}));
  assert.ok(!unknown.ok && unknown.refused.includes("unknown harness"), "unknown harness refused in words");
  const none = await brainModelRun("hi", fakeDeps({ installed: false }));
  assert.equal(none.ok, false);
  assert.ok(none.refused.includes("not installed"), "the registry walk reports the honest absence");

  // 5. prompt shaping + parsing bounds
  assert.ok(plannerPrompt("build a barn").includes("build a barn") && plannerPrompt("build a barn").includes("human gate"), "the prompt carries the objective and the governance");
  assert.equal(planFromModelText("a\n\nbb bb\n- ccc ccc\ndddd dddd\neeee eeee\nffff ffff\ngggg gggg\nhhhh hhhh").length, 6, "steps bounded");

  // 6. THE PRODUCTION ROUTING, pinned in source (the 16.9.6 review's fix):
  const src = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "brainSeam.ts"), "utf8");
  assert.ok(!/from "node:child_process"/.test(src), "the seam NEVER imports node:child_process — the stub is untouchable");
  // 19.7.15: the Tauri path no longer routes anywhere — there is no CLI command
  // left to call. The seam refuses on EVERY host, which is the stronger property:
  // a host that could spawn cannot be reached from this seam at all.
  assert.ok(/external agent CLIs are removed/.test(src),
    "the Tauri path refuses in words too, not just the web path");
  assert.ok(/BrainHostError/.test(src), "the web path refuses via a typed host error, before any spawn");
  const selfimpulseSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "selfimpulse.ts"), "utf8");
  assert.ok(/await brainNow\.decide/.test(selfimpulseSrc), "the governed pipeline awaits the (possibly async) plan");
  assert.ok(/SelfImpulsePlan \| Promise<SelfImpulsePlan>/.test(selfimpulseSrc), "the brain interface admits async plans");
  assert.ok(/wrapRealModelBrain\(simulatedBrain\)/.test(selfimpulseSrc), "the simulated brain ships wrapped");
  assert.ok(!/no host app|no mission engine|until the merge/i.test(selfimpulseSrc), "no stale header narrative survives");

  // 7. identity pins (the 16.9.6 honesty fix, kept)
  const offBrain = wrapRealModelBrain(simulatedBrain, fakeDeps({ installed: true }), "simulated");
  assert.equal(offBrain.id, "simulated", "off → the base identity stands");
  const wb: SelfImpulseBrain = wrapRealModelBrain(simulatedBrain, fakeDeps({ installed: true }), AUTO);
  assert.ok(wb.label.includes("real-model planning"), "auto → the label names the seam");
  assert.ok(realBrainDeps.resolve !== undefined && realBrainDeps.invoke !== undefined, "production deps exist");
});

test("brainSeam — 19.7.15: the native boundary has no spawn to get wrong", async () => {
  // This test used to pin the whole external-CLI spawn chain: bare provider id
  // on the wire -> the Rust ALLOWED_CLI_BINS gate -> which_bin() resolution ->
  // the containment wrapper -> a real child process. It existed because the
  // 16.9.7 review found a material bug in that chain (an absolute path was sent
  // where a bare id was expected, so the gate refused an installed harness).
  //
  // External coding-agent CLIs are now REMOVED, so that chain does not exist and
  // the bug class is gone with it. Asserting the chain anyway would be asserting
  // a fiction; leaving a dead test would be a false signal. What is asserted
  // instead is the property that replaced it, in both directions.
  const rustSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "commands.rs"), "utf8");
  const seamSrc = fs.readFileSync(path.join(root, "src", "selfimpulse", "engine", "brainSeam.ts"), "utf8");

  // 1. Nothing in Rust can spawn an agent any more.
  assert.ok(!/\bcli_invoke\b/.test(rustSrc), "there is no command that can execute an external agent CLI");
  assert.ok(!/ALLOWED_CLI_BINS/.test(rustSrc), "the external agent allowlist is gone");
  // which_bin SURVIVES — it is how the dev-tool shell (node/npm/cargo/git)
  // resolves a program, and that seat is real and still contained. What must not
  // survive is an AGENT binary being resolved by name.
  // The list lives in grants.rs (DEV_TOOLS) — ONE source shared by the shell allow-list and by execution
  // grants — and commands.rs's SHELL_ALLOWED_PROGRAMS is an alias of it.
  assert.ok(/SHELL_ALLOWED_PROGRAMS: &\[&str\] = grants::DEV_TOOLS;/.test(rustSrc), "SHELL_ALLOWED_PROGRAMS aliases the one shared dev-tool list");
  const grantsSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "grants.rs"), "utf8");
  const allow = /pub const DEV_TOOLS: &\[&str\] = &\[([\s\S]*?)\];/.exec(grantsSrc);
  assert.ok(allow !== null, "the dev-tool allowlist is locatable");
  if (allow) {
    for (const gone of ["claude", "codex", "opencode", "cursor-agent", "cline", "aider", "gemini"]) {
      assert.ok(!allow[1].includes(`"${gone}"`), `the allowlist resolves no agent binary (${gone})`);
    }
  }
  const containSrc = fs.readFileSync(path.join(root, "src-tauri", "src", "contain.rs"), "utf8");
  assert.ok(/Command::new\(program\)/.test(containSrc),
    "containment still wraps whatever it is given — used for the dev-tool shell, not agents");

  // 2. The seam refuses in words, on every host, and touches no process API.
  assert.ok(!/ipc\.cliInvoke/.test(seamSrc), "the seam no longer calls an IPC that could spawn a CLI");
  assert.ok(!/from "node:child_process"/.test(seamSrc), "the seam never imports node:child_process");
  assert.ok(/external agent CLIs are removed/.test(seamSrc),
    "the seam says WHY it refuses, in words a user can act on");

  // 3. And it still refuses ASYNCHRONOUSLY and by throwing a typed error, so a
  //    caller cannot mistake a refusal for a plan.
  let threw: unknown = null;
  await assert.rejects(
    () => realBrainInvoke("anything", [], 10),
    (e: unknown) => { threw = e; return e instanceof BrainHostError; },
  );
  assert.ok(threw instanceof BrainHostError, "the refusal is a typed BrainHostError, not a silent empty plan");
  assert.match(String((threw as Error).message), /external agent CLIs are removed/,
    "and the message names the reason rather than saying 'unknown error'");

  // 4. The shell path keeps its own independent gate — the dev-tool seat is real
  //    and still contained, so removing agents did not remove containment.
  assert.ok(rustSrc.includes("ensure_allowed(&state, &c)"),
    "the shell path still refuses a cwd outside every registered workspace root");
});
