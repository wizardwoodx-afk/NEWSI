/**
 * Federation-surface probe.
 *
 * Pins the reviewer's second open item as a DECISION rather than an accident:
 * the desktop app bundles an A2A host, and mounting it is explicit.
 *
 * The failure this prevents is subtle and worth naming. It would be easy to
 * "fix" the invisible-A2A finding by starting the host on app launch. That
 * would be a regression: the host binds a TCP port and publishes a signed agent
 * card describing the user's machine, so auto-start means the product opens a
 * listener nobody asked for. The posture this product sells is the one it must
 * apply to itself. These assertions exist to stop that "fix" from happening.
 */
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT: string = process.env.SI_ROOT ?? process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(ROOT, rel), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];
const ok = (label: string, cond: boolean, detail = ""): void => {
  if (cond) { passed += 1; console.log(`  ok   ${label}`); }
  else { failed += 1; failures.push(`${label}${detail ? ` — ${detail}` : ""}`); console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`); }
};
const section = (n: string): void => console.log(`\n== ${n}`);

/* ───────────────────────────────────────────────────────────────────────── */
section("1. the app actually READS the bundle state (this was the gap)");
{
  const client = read("src/ipc/client.ts");
  ok("the a2aHostPath field is read, not just written by Rust", /a2aHostPath/.test(client));
  ok("a2aHostBundled is read too", /a2aHostBundled/.test(client));
  ok("there is a status call", /federationStatus/.test(client));
  ok("and a mount call", /federationMount/.test(client));
  ok("and an explicit stop", /federationStop/.test(client));

  // The gap the reviewer found was precisely that nothing consumed these fields.
  const consumers = ["src/ui/screens/Federation.tsx", "src/ui/screens/Settings.tsx", "src/ui/store.ts"]
    .filter((f) => fs.existsSync(path.join(ROOT, f)));
  ok("at least one screen exists to surface federation", consumers.length > 0);
}

section("2. mounting is EXPLICIT — the host is never auto-started");
{
  const screen = read("src/ui/screens/Federation.tsx");
  ok("the screen says the app does not start a listener on launch", /does <strong>not<\/strong> start/i.test(screen));
  ok("and explains what mounting actually does", /signed agent card/.test(screen));
  ok("mounting is behind a button", /federation-mount/.test(screen));
  ok("and there is an explicit unmount beside it", /federation-stop/.test(screen));
  ok("the screen polls only while a mount is actually starting",
    /state !== "starting"/.test(screen) && /clearInterval/.test(screen),
    "a poll that never stops is a UI refreshing forever after the user left");

  // The load-bearing assertion: nothing in the runtime may start the host
  // without a user action. If someone adds a mount call to a mount-effect, this
  // catches it — which is the whole point.
  const runtime = ["src/main.tsx", "src/ui/Shell.tsx", "src/ui/store.ts", "src/App.tsx"]
    .filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => read(f)).join("\n");
  ok("no startup path calls federationMount", !/federationMount\(/.test(runtime),
    "something at startup is mounting the host; that opens a port nobody asked for");
  ok("the mount call only appears behind the user's control", /onClick/.test(read("src/ui/screens/Federation.tsx")));

  /* THE BUG THIS SECTION USED TO SANCTION. The mount used to go through
   * `shellExec(..., 20)`, which is `run_timeout()` — spawn, wait, kill on the
   * deadline. An A2A host is a server and never exits, so that call killed the
   * listener it had just started. probe/a2aHostLifecycle.test.ts proves a real
   * host is still serving 22s after READY; this asserts the app stopped asking
   * for a timeout wrapper. */
  const clientSrc = read("src/ipc/client.ts");
  const mountBody = clientSrc.slice(clientSrc.indexOf("federationMount:"), clientSrc.indexOf("federationStop:"));
  ok("mounting no longer goes through shellExec", !/shellExec/.test(mountBody),
    "the mount path is timing out the server it starts");
  ok("it asks the backend supervisor instead", /a2a_host_start/.test(mountBody));
  ok("status asks the supervisor too, not a constant", /a2a_host_status/.test(clientSrc));
  ok("`running` is computed, never hardcoded", !/running: false,\s*detail:/.test(clientSrc) && !/running: true/.test(clientSrc));
  ok("the client models the whole lifecycle", /"stopped" \| "starting" \| "running" \| "failed" \| "unavailable"/.test(clientSrc));
  ok("a second mount is refused by the state, not attempted", /already mounted/.test(mountBody));
}

section("3. mounting uses OUR OWN bundle through an existing allowlist");
{
  const client = read("src/ipc/client.ts");
  ok("node is launched by the supervisor, not by a timed shell command",
    /Command::new\(crate::commands::node_binary\(\)\)/.test(read("src-tauri/src/a2a_host.rs")));
  // A comment that explains the removal is fine; a live call is not.
  const liveCli = client.split("\n").filter((l) => /cli_invoke|cli_providers_detect/.test(l) && !/could execute|removed|REMOVED/.test(l));
  ok("it does not reintroduce a CLI-spawn command", liveCli.length === 0, liveCli.join(" | ").slice(0, 120));
  const rust = read("src-tauri/src/commands.rs");
  ok("no agent-spawn command came back with it", !/cli_invoke|ALLOWED_CLI_BINS/.test(rust));

  // The host is OUR bundle, and its launcher verifies the engine by SHA-256
  // before listening. That property is the reason bundling it is safe.
  const entry = read("tools/si-host.mjs");
  ok("the host launcher still verifies its engine pin", /si-host-engine\.sha256/.test(entry) && /sha256/.test(entry));
  ok("it fails closed rather than listening on a mismatch", /throw|fail|exit/i.test(entry));

  /* The supervisor itself — the part that makes "mounted" mean something. */
  const sup = read("src-tauri/src/a2a_host.rs");
  ok("the supervisor keeps the child instead of waiting on it", /Child/ .test(sup) && /\.spawn\(\)/.test(sup));
  const supCode = sup.split("\n").filter((l) => !/^\s*(\/\/|\/\/|\*)/.test(l)).join("\n");
  ok("it never calls the timeout wrapper (outside the comment that explains it)", !/run_timeout/.test(supCode));
  ok("it waits for the host to ANNOUNCE itself, then releases the lock",
    /SI-A2A-READY/.test(sup) && /recv_timeout/.test(sup) && /supervisor\(\)\.lock\(\);/.test(sup));
  ok("a host that never announces itself is killed rather than orphaned",
    /did not report ready/.test(sup) && /child\.kill\(\)/.test(sup));
  ok("`running` is answered by asking the OS, not by a stored flag", /try_wait/.test(sup) && /alive\(&mut m\.child\)/.test(sup));
  ok("a host that died on its own is reported as failed, in words", /exited on its own/.test(sup));
  ok("mounting twice returns the existing host rather than a second listener", /alreadyRunning/.test(sup));
  ok("stop is explicit and idempotent", /a2a_host_stop/.test(sup) && /nothing was stopped/.test(sup));
  ok("quitting the app unmounts — a card must not outlive the window", /pub fn shutdown/.test(sup) && /RunEvent::Exit/.test(read("src-tauri/src/lib.rs")));
  ok("the bearer token never crosses to the frontend", !/\.get\("token"\)/.test(sup) && /token. is deliberately NOT read/.test(sup));
  ok("all three commands are registered", (read("src-tauri/src/lib.rs").match(/a2a_host::a2a_host_\w+/g) ?? []).length >= 3);

  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const res: Record<string, string> = conf.bundle.resources;
  ok("the host is still declared as a bundled resource", Boolean(res["../tools/si-host.mjs"]));
  ok("it lands under a2a/ so app_info's path matches", res["../tools/si-host.mjs"] === "a2a/si-host.mjs", res["../tools/si-host.mjs"]);
  ok("the byte-pinned engine is bundled too", Boolean(res["../tools/si-host-engine.mjs"]));
  ok("and its pin", Boolean(res["../tools/si-host-engine.sha256"]));
}

section("4. it refuses in words rather than pretending");
{
  const client = read("src/ipc/client.ts");
  ok("a non-desktop build says federation is a desktop capability", /desktop capability/i.test(client));
  ok("a missing bundle says so instead of silently no-oping", /No A2A host is bundled/.test(client));
  ok("a failure to read the bundle state is reported, not hidden", /Could not read the A2A host state/.test(client));
  ok("a failed mount explains rather than claiming success", /Mount failed in words rather than pretending/.test(client));
  ok("a failed stop is equally honest", /Stop failed in words rather than pretending/.test(client));
  ok("an unreadable lifecycle is reported, not defaulted to stopped", /Could not read the A2A host state/.test(client));
  ok("a non-desktop build is 'unavailable', not 'stopped' — different things", /state: "unavailable"/.test(client));
  ok("every state has a word on screen", /STATE_WORD/.test(read("src/ui/screens/Federation.tsx")));

  const screen = read("src/ui/screens/Federation.tsx");
  ok("the screen disables the control when nothing is bundled", /!st\.bundled/.test(screen));
  ok("and says the build shipped without it", /shipped without the A2A host bundle/.test(screen));
  ok("the outcome is shown to the user verbatim", /federation-outcome/.test(screen));
}

section("5. this did not undo the CLI removal");
{
  let hits = "";
  try {
    hits = execSync(`grep -rln "cli_invoke\\|cli_providers_detect\\|ALLOWED_CLI_BINS\\|custom_harness" ${ROOT}/src ${ROOT}/src-tauri/src 2>/dev/null || true`, { encoding: "utf8" });
  } catch { /* grep found nothing: that is the passing case */ }
  const files = hits.split("\n").map((s) => s.trim()).filter(Boolean);
  // A comment explaining the removal is fine; a live reference is not.
  const live = files.filter((f) => {
    const src = read(path.relative(ROOT, f));
    return !/REMOVED|removed from|no longer|does not exist|19\.7\.15/.test(src);
  });
  ok("no live reference to the removed CLI subsystem", live.length === 0, live.join(", "));
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
