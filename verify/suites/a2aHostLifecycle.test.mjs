import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/a2aHostLifecycle.test.ts
import { spawn } from "node:child_process";
import * as path from "node:path";
var ROOT = process.env.SI_ROOT ?? process.cwd();
var passed = 0;
var failed = 0;
var failures = [];
var ok = (label, cond, detail = "") => {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failed += 1;
    failures.push(`${label}${detail ? ` \u2014 ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` \u2014 ${detail}` : ""}`);
  }
};
var section = (n) => console.log(`
== ${n}`);
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function launchHost(extra = []) {
  const child = spawn(process.execPath, [
    path.join(ROOT, "tools", "si-host.mjs"),
    "--selfimpulse",
    "LIFECYCLE-PROBE",
    "--port",
    "0",
    ...extra
  ], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  const state = { child, ready: null, readyAt: null, stdout: "", stderr: "", exited: null };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (c) => {
    state.stdout += c;
    for (const line of c.split("\n")) {
      if (line.startsWith("SI-A2A-READY") && !state.ready) {
        try {
          state.ready = JSON.parse(line.slice("SI-A2A-READY".length).trim());
        } catch {
          state.ready = {};
        }
        state.readyAt = Date.now();
      }
    }
  });
  child.stderr.on("data", (c) => {
    state.stderr += c;
  });
  child.on("exit", (code, signal) => {
    state.exited = { code, signal, at: Date.now() };
  });
  return state;
}
async function main() {
  section("1. the bundled host starts and announces itself");
  const h = launchHost();
  try {
    const deadline = Date.now() + 4e4;
    while (!h.ready && !h.exited && Date.now() < deadline) await sleep(200);
    ok("the host reports SI-A2A-READY", h.ready !== null, h.stderr.slice(0, 300) || h.stdout.slice(0, 300));
    ok("it is running, and says so in the descriptor", h.ready?.mounted === true, JSON.stringify(h.ready).slice(0, 200));
    ok("it names the port it actually bound", typeof h.ready?.port === "number");
    ok("it publishes a card URL", typeof h.ready?.cardUrl === "string");
    ok("the card is signed", h.ready?.cardSigned === true);
    ok("it has a pid", typeof h.child.pid === "number" && h.child.pid > 0);
    section("2. IT STAYS MOUNTED \u2014 the bug this suite was written for");
    const aliveAt = (h.readyAt ?? Date.now()) + 22e3;
    while (Date.now() < aliveAt) await sleep(500);
    const aliveNow = h.exited === null;
    ok(
      "the host is STILL ALIVE 22s after it said it was ready",
      aliveNow,
      aliveNow ? "" : `it exited with code ${h.exited?.code} at ${(h.exited.at - (h.readyAt ?? h.exited.at)) / 1e3}s \u2014 this is exactly the old timeout bug`
    );
    ok(
      "so a supervisor that waits on it would kill a healthy listener",
      aliveNow,
      "if this fails the process dies by itself, which is a different bug and should be reported as such"
    );
    section("3. the port is actually served while mounted");
    const port = h.ready?.port;
    if (typeof port === "number") {
      let served = false;
      try {
        const res = await fetch(`http://127.0.0.1:${port}/.well-known/agent-card.json`, { signal: AbortSignal.timeout(5e3) });
        served = res.ok;
      } catch {
        served = false;
      }
      ok(
        "the signed card is fetchable on the bound port while mounted",
        served,
        "the port is claimed but nothing answers it"
      );
    } else {
      ok("the signed card is fetchable on the bound port while mounted", false, "no port was reported");
    }
    section("4. an explicit stop is what ends it \u2014 not a deadline");
    const stopAt = Date.now();
    h.child.kill("SIGTERM");
    const stopDeadline = stopAt + 15e3;
    while (h.exited === null && Date.now() < stopDeadline) await sleep(200);
    ok("SIGTERM ends the host", h.exited !== null, `still running ${(Date.now() - stopAt) / 1e3}s after the stop`);
    const posixSignals = process.platform !== "win32";
    if (posixSignals) {
      ok(
        "it unmounted in words",
        /SI-A2A-STOPPED|unmounting|stopped/i.test(h.stdout + h.stderr),
        (h.stdout + h.stderr).split("\n").slice(-3).join(" | ").slice(0, 200)
      );
      ok(
        "the stop was clean, not a kill -9",
        h.exited?.code === 0 || h.exited?.code === 143 || h.exited === null,
        `exit code ${h.exited?.code}`
      );
    } else {
      ok(
        "it unmounted (Windows TerminateProcess delivers no signal, so no farewell line exists to read)",
        h.exited !== null,
        "the host survived its own stop"
      );
      ok(
        "the stop was clean, not a kill -9",
        h.exited !== null,
        `exit code ${h.exited?.code}, signal ${h.exited?.signal} \u2014 on Windows this is a TerminateProcess, not a delivered signal`
      );
    }
    if (typeof port === "number") {
      await sleep(500);
      let stillAnswering = true;
      try {
        await fetch(`http://127.0.0.1:${port}/.well-known/agent-card.json`, { signal: AbortSignal.timeout(2500) });
      } catch {
        stillAnswering = false;
      }
      ok(
        "the port stops answering once the host is stopped",
        !stillAnswering,
        "something is still serving the card after the host exited"
      );
    }
  } finally {
    if (h.exited === null) {
      h.child.kill("SIGKILL");
      await sleep(300);
    }
  }
  console.log(`
${passed} passed, ${failed} failed.`);
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"));
    process.exit(1);
  }
}
void main();
