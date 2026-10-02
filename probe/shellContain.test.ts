/**
 * probe · shellContain — the host-escape battery.
 *
 * Proves, adversarially, that a mission restricted to workspace X cannot use
 * node / python / npm / git / cargo / MCP-style processes to escape X and read
 * or write arbitrary host files — and, since the archive-6 audit, that the
 * network is unreachable unless it was granted. What this host cannot prove,
 * the suite REPORTS (containment rung per run) instead of pretending.
 *
 *   1. SPEC PINS — the native runner (contain.rs / commands.rs) carries the same
 *      containment builders as the reference implementation, and the unshare
 *      mount script is BYTE-IDENTICAL on both sides.
 *   2. LIVE BATTERY — every ESCAPE_FIXTURES attempt runs through `runContained`
 *      against a planted secret OUTSIDE the workspace; the marker must never
 *      appear in any output and write attempts must not land.
 *   3. ENV SCRUB — HOME is redirected into the workspace; no host env leaks.
 *   4. NETWORK — a listener on the HOST's loopback is unreachable from a run that
 *      was not granted the network, and reachable from one that was.
 *
 * WHY THE LIVENESS GATES. This battery used to count a fixture as "proved" when the
 * secret marker did not appear. A contained process that never STARTED cannot leak
 * anything — so on a host where the rung was detected but could not launch the
 * program (the interpreter lived outside the bound prefixes, `chroot` was not on the
 * PATH, a hollow root had no /dev/null) every fixture "passed" with empty output, and
 * the env-scrub section then died on `JSON.parse("")`. The gates below make a pass
 * mean the interpreter RAN: hard deterministic canaries (`sh`, a toolchain outside the
 * system prefixes, /dev/null, /proc), a `RAN:<id>` heartbeat printed by the node and
 * python fixtures BEFORE the escape attempt, and an interpreter `--version` run in the
 * same sandbox before any fixture counts as proved. An interpreter that cannot run
 * is reported UNPROVEN — never silently green, never a crash.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import {
  ESCAPE_FIXTURES,
  UNSHARE_MOUNT_SCRIPT,
  bwrapArgv,
  containCaps,
  detectContainment,
  nodePermissionArgs,
  prefixIsBindable,
  programSupport,
  runContained,
  seatbeltArgv,
  unshareArgv,
} from "../src/mission/shellContain";

const root = process.env.SI_ROOT ? path.resolve(process.env.SI_ROOT as string) : process.cwd();
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");
const MARKER = "S3CRET_SELFIMPULSE_CANARY_f7a91c";

let checks = 0;
const ok = (cond: boolean, msg: string): void => {
  assert.ok(cond, msg);
  checks += 1;
};
void execFileSync;

/* ---------------------------------------------------------- 1. spec pins */
const containRs = read("src-tauri/src/contain.rs");
const commandsRs = read("src-tauri/src/commands.rs");
const mcpRs = read("src-tauri/src/mcp.rs");
for (const flag of ["--ro-bind", "--bind", "--die-with-parent", "--new-session", "--tmpfs", "--chdir", "env_clear", "--unshare-net"]) {
  ok(containRs.includes(flag), `contain.rs carries the ${flag} containment flag`);
}
for (const token of ["-Urm", "\"-n\"", "--map-root-user", "mount --make-rprivate", "chroot", "tmpfs", "--rbind", "CONTAIN_READS", "CONTAIN_PATH"]) {
  ok(containRs.includes(token), `contain.rs carries the unshare rung token ${token}`);
}
ok(containRs.includes("sandbox-exec") && containRs.includes("--experimental-permission"), "contain.rs carries the seatbelt + node-permission rungs");
ok(containRs.includes("(deny network*)"), "contain.rs denies the network in the seatbelt profile unless granted");
ok(/contain::wrap_command/.test(commandsRs), "shell_exec routes through contain::wrap_command");
ok(/contain::wrap_command/.test(mcpRs) || /contain::/.test(mcpRs), "MCP spawn routes through the containment layer");
ok(/containment/.test(commandsRs), "shell_exec reports the containment rung in its result");
ok(/fn canary_unshare|fn canary_bwrap/.test(containRs), "contain.rs PROVES a rung by launching a process in it (canary), not by `which`");
ok(!/unshare_works\(\)/.test(containRs), "the cheap `unshare -Urm true` detection is gone");
ok(/wrap_command\([^;]{0,200}?view\.network\)/.test(commandsRs.replace(/\s+/g, " ")), "shell_exec passes the GRANT's network setting to the containment layer");
const shellTs = read("src/mission/shellContain.ts");

/* the two mount scripts are the SAME bytes — token pins let them drift; equality cannot */
const rustScript = /pub const UNSHARE_MOUNT_SCRIPT: &str = r#"([\s\S]*?)"#;/.exec(containRs)?.[1] ?? "";
ok(rustScript.length > 200, "the Rust mount script was found");
ok(rustScript === UNSHARE_MOUNT_SCRIPT, "the unshare mount script is BYTE-IDENTICAL in contain.rs and shellContain.ts");
ok(UNSHARE_MOUNT_SCRIPT.includes("--rbind") && UNSHARE_MOUNT_SCRIPT.includes("exit 97"), "the script binds the system prefixes recursively and refuses to run in a hollow root");
ok(!/\/opt \/proc/.test(UNSHARE_MOUNT_SCRIPT), "the script no longer exposes all of /opt");
const tmpAt = UNSHARE_MOUNT_SCRIPT.indexOf("-t tmpfs");
ok(tmpAt > 0 && tmpAt < UNSHARE_MOUNT_SCRIPT.indexOf("for r in $CONTAIN_READS") && tmpAt < UNSHARE_MOUNT_SCRIPT.indexOf("for w in $CONTAIN_WRITES"), "the /tmp tmpfs is mounted BEFORE the bind loops (a workspace under /tmp survives)");
ok(shellTs.includes("mount --make-rprivate") && shellTs.includes("--map-root-user"), "the TS reference and the Rust mirror share the unshare script tokens");

/* builder unit checks */
/* 19.8 — this used to assert `argv.includes("/tmp/ws")` against a hard-coded
   POSIX literal. `bwrapArgv` normalises through `path.resolve`, which on win32
   yields `C:\tmp\ws`, so the assertion failed on Windows while the BUILDER WAS
   CORRECT — the probe was asserting a platform string instead of the contract.
   The contract is "the workspace the caller asked for is bound into the argv,
   resolved the same way the implementation resolves it". That is what is pinned
   now, on every platform, and it is a STRONGER pin than the literal: a builder
   that stopped binding the workspace would still fail here. */
const WS = path.join(os.tmpdir(), "ws");
const argv = bwrapArgv({
  program: "node",
  args: ["-e", "1"],
  cwd: WS,
  readPaths: [WS],
  writePaths: [WS],
});
ok(argv[0] === "bwrap" && argv.includes("--die-with-parent") && argv[argv.indexOf("--") + 1] === "node", "bwrapArgv shape (wrapper, die-with-parent, -- terminator)");
ok(argv.includes(path.resolve(WS)), "bwrapArgv binds the workspace");
ok(argv.includes(WS) || argv.includes(path.resolve(WS)), "bwrapArgv binds the workspace (as given or resolved)");
ok(argv.filter((a) => a === path.resolve(WS)).length >= 2, "bwrapArgv binds the workspace read-write (a --bind pair, not a single mention)");
ok(argv.includes(path.resolve(path.join(os.tmpdir(), "ws"))), "bwrapArgv resolves the workspace path rather than passing a POSIX literal on this platform");
ok(argv.indexOf("--tmpfs") < argv.indexOf("--bind"), "bwrapArgv mounts the /tmp tmpfs BEFORE the workspace bind (a workspace under /tmp survives)");
ok(!argv.includes("--unshare-net"), "bwrapArgv leaves the network alone when the caller did not deny it");
const argvNoNet = bwrapArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS], network: false });
ok(argvNoNet.includes("--unshare-net"), "bwrapArgv adds --unshare-net when the network is denied");
const pathIdx = bwrapArgv({ program: "x", args: [], cwd: WS, readPaths: [], writePaths: [WS], innerPath: "/tool/bin:/usr/bin" });
ok(pathIdx[pathIdx.indexOf("PATH") + 1] === "/tool/bin:/usr/bin", "bwrapArgv puts the program's own bin dir on the inner PATH");
const un = unshareArgv({ program: "node", args: ["-v"], cwd: WS, readPaths: [], writePaths: [WS], network: false });
ok(un.args.slice(0, 3).join(" ") === "-Urm -n --map-root-user", "unshareArgv denies the network with a fresh namespace (-n)");
ok(unshareArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS] }).args[1] === "--map-root-user", "unshareArgv leaves the network alone by default");
ok(/\/usr\/sbin/.test(un.extraEnv.PATH) && "CONTAIN_WRITES" in un.extraEnv && "CONTAIN_READS" in un.extraEnv && "CONTAIN_PATH" in un.extraEnv, "unshareArgv hands the script its env AFTER the scrub (and a PATH that can find chroot)");
ok(seatbeltArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS], network: false })[2].includes("(deny network*)"), "the seatbelt profile denies the network when asked");
ok(!seatbeltArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS] })[2].includes("(deny network*)"), "…and does not when the network was granted");
const npArgs = nodePermissionArgs(undefined, [WS]);
ok(npArgs[0].startsWith("--experimental-permission") || npArgs[0] === "--permission", "node-permission rung uses the permission-model flag");
ok(npArgs.some((a) => a === `--allow-fs-write=${WS}`), "node-permission rung allows writes only in the workspace");

/* what may be bound so a toolchain outside the system prefixes can run */
ok(prefixIsBindable("/opt/nvm/versions/node/v22", "/home/u") && prefixIsBindable("/home/u/.nvm/versions/node/v22", "/home/u"), "a toolchain install prefix may be bound");
ok(!prefixIsBindable("/", "/home/u") && !prefixIsBindable("/opt", "/home/u") && !prefixIsBindable("/home", "/home/u"), "never `/`, a top-level directory, or an ancestor of HOME");
ok(!prefixIsBindable("/home/u", "/home/u") && !prefixIsBindable("/home/u/.local", "/home/u"), "never HOME itself or a direct child of it (app data and tokens)");
ok(!prefixIsBindable("/home/u/.ssh/tools", "/home/u") && !prefixIsBindable("/home/u/p/.AWS/bin", "/home/u"), "never a credential store, whatever its case");
ok(programSupport("/usr/bin/git", "/home/u").read.length === 0 && programSupport("git", "/home/u").read.length === 0, "system programs and bare names need no extra binds");

/* ------------------------------------------------------- 2. live battery */
const rung = detectContainment();
const caps = containCaps();
console.log(`  containment rung on this host: ${rung}  (proven: ${JSON.stringify(caps)})`);
const outside = fs.mkdtempSync(path.join(os.tmpdir(), "11h-outside-"));
const ws = fs.mkdtempSync(path.join(os.tmpdir(), "11h-ws-"));
const secretFile = path.join(outside, "secret.txt");
fs.writeFileSync(secretFile, MARKER);
const unixRung = rung === "bwrap" || rung === "unshare";
const osContained = unixRung || rung === "seatbelt";

const hasBin = (bin: string): boolean => {
  const r = spawnSync(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
  return r.status === 0;
};
const run = (program: string, args: string[], extra: { network?: boolean; forceRung?: "unshare" | "bwrap" } = {}) =>
  runContained({ program, args, cwd: ws, readPaths: [ws], writePaths: [ws], timeoutMs: 20000, ...extra });

/* 2a — HARD, deterministic canaries on EVERY rung this host has proven (not only the preferred one):
   a contained process runs, its root is not hollow, and a toolchain outside the system prefixes
   runs. `sh` exists everywhere. */
const provenRungs = (["unshare", "bwrap"] as const).filter((r) => (r === "unshare" ? caps.unshare : caps.bwrap));
const toolDir = fs.mkdtempSync(path.join(os.tmpdir(), "11h-tool-"));
{
  const bin = path.join(toolDir, "opt-like", "mytool", "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, "mytool"), "#!/bin/sh\necho TOOL_RAN\n");
  fs.chmodSync(path.join(bin, "mytool"), 0o755);
}
const toolPath = path.join(toolDir, "opt-like", "mytool", "bin", "mytool");
for (const forced of provenRungs) {
  const sh = await run("sh", ["-c", 'echo RAN; test -c /dev/null && echo DEVNULL; test -r /proc/self/status && echo PROC; test -d "$HOME" && echo WORKSPACE'], { forceRung: forced });
  ok(sh.containment === forced, `canary[${forced}]: the run really used the ${forced} rung (got ${sh.containment})`);
  for (const token of ["RAN", "DEVNULL", "PROC", "WORKSPACE"]) {
    ok(sh.stdout.includes(token), `canary[${forced}]: a contained process has ${token} (stdout=${JSON.stringify(sh.stdout)} stderr=${JSON.stringify(sh.stderr.slice(0, 200))})`);
  }
  const tr = await run(toolPath, [], { forceRung: forced });
  ok(tr.stdout.includes("TOOL_RAN"), `canary[${forced}]: a toolchain OUTSIDE the system prefixes runs inside the sandbox (stdout=${JSON.stringify(tr.stdout)} stderr=${JSON.stringify(tr.stderr.slice(0, 200))})`);
}

/* 2b — the escape fixtures, each gated on its interpreter actually running in the sandbox */
let live = 0;
let unproven = 0;
let skipped = 0;
let nodeRuns = false;
for (const fixture of ESCAPE_FIXTURES) {
  const bin = fixture.id.startsWith("python") ? (process.platform === "win32" ? "python" : "python3") : fixture.program;
  const nodeClass = fixture.id.startsWith("node");
  if (!hasBin(bin) && !nodeClass) {
    console.log(`  skip ${fixture.id} — ${bin} not on this host`);
    skipped += 1;
    continue;
  }
  const program = nodeClass ? process.execPath : bin;
  if (osContained) {
    const alive = await run(program, ["--version"]);
    const runs = alive.code === 0 && `${alive.stdout}${alive.stderr}`.trim().length > 0;
    if (nodeClass) nodeRuns = runs;
    if (!runs) {
      console.log(`  UNPROVEN ${fixture.id}: ${bin} cannot run inside the ${alive.containment} sandbox on this host (${JSON.stringify(`${alive.stdout}${alive.stderr}`.slice(0, 120))}) — NOT counted as proved`);
      unproven += 1;
      continue;
    }
  }
  const res = await run(program, fixture.buildArgs(secretFile));
  if (nodeClass || osContained) {
    const label = `${fixture.id} (${res.containment})`;
    if (nodeClass || fixture.id.startsWith("python")) {
      ok(res.stdout.includes(`RAN:${fixture.id}`), `${label}: the fixture actually ran inside the sandbox — "did not leak" is only evidence if it started (stdout=${JSON.stringify(res.stdout.slice(0, 80))} stderr=${JSON.stringify(res.stderr.slice(0, 120))})`);
    }
    // PROVEN class on this host: the marker must not leak and writes must not land.
    ok(!`${res.stdout}${res.stderr}`.includes(MARKER), `${label}: secret marker did not leak`);
    if (fixture.id.endsWith("-write") || fixture.id === "node-fs-write" || fixture.id === "python-write") {
      ok(!fs.existsSync(`${secretFile}.w`), `${label}: write outside the workspace did not land`);
    }
    live += 1;
  } else {
    // Policy-only host for this program class: REPORT, never pretend.
    console.log(`  REPORT ${fixture.id}: OS containment unavailable on this host (rung=${rung}) — battery runs in CI where bubblewrap is installed; policy layer + env scrub still enforced (run reported "${res.containment}")`);
    ok(res.containment === "policy-only" || res.containment === "refused", `${fixture.id}: the run honestly reports its rung`);
    skipped += 1;
  }
}
// a host that proves nothing must SAY why — silence is the failure mode this suite exists to prevent
ok(live >= 2 || unproven > 0 || !osContained, `the battery either proved at least the node-class escapes blocked (proved ${live}) or reported exactly why it could not (unproven ${unproven})`);
console.log(`  battery: ${live} proved, ${unproven} UNPROVEN, ${skipped} reported/skipped (rung=${rung})`);

/* ----------------------------------------------------------- 3. env scrub */
const envProbe = await run(process.execPath, [
  "-e",
  `process.stdout.write(JSON.stringify({home: process.env.HOME ?? null, ssh: process.env.SSH_AUTH_SOCK ?? null, path: process.env.PATH ?? ""}))`,
]);
const envLine = envProbe.stdout.trim().split("\n").pop() ?? "";
if (envLine === "" && osContained && !nodeRuns) {
  console.log(`  UNPROVEN env-scrub: node cannot run inside the ${envProbe.containment} sandbox on this host — reported, not asserted`);
} else {
  ok(envLine !== "", `the env probe produced output (an empty run is a failure to LAUNCH, not a pass) — stderr=${JSON.stringify(envProbe.stderr.slice(0, 200))}`);
  const envOut = JSON.parse(envLine) as { home?: string | null; ssh?: string | null };
  ok(envOut.home === ws, `HOME is redirected into the workspace (got ${envOut.home})`);
  ok(!envOut.ssh, "no SSH_AUTH_SOCK (or any host secret env) reaches the process");
}

/* npm HOME leak: `npm config get userconfig` must resolve INSIDE the workspace */
if (hasBin("npm")) {
  const alive = osContained ? await run("npm", ["--version"]) : null;
  if (alive && !(alive.code === 0 && alive.stdout.trim().length > 0)) {
    console.log(`  UNPROVEN npm-home: npm cannot run inside the ${alive.containment} sandbox on this host — reported, not asserted`);
  } else {
    const npmRes = await run("npm", ["config", "get", "userconfig"]);
    ok(!npmRes.stdout.includes(os.homedir().replace(/\\/g, "/")), "npm does not see the real home directory (HOME scrub)");
    ok(npmRes.stdout.includes(path.basename(ws)) || npmRes.stdout.includes(ws), `npm's userconfig resolves inside the workspace (got: ${npmRes.stdout.trim().slice(0, 120)})`);
  }
}

/* -------------------------------------------------------------- 4. network */
const netRungs = (["unshare", "bwrap"] as const).filter((r) => (r === "unshare" ? caps.unshareNet : caps.bwrapNet));
if (netRungs.length > 0) {
  if (hasBin("bash")) {
    // a listener on the HOST's loopback: reachable only if the sandbox shares the host's network
    const server = net.createServer((s) => s.end());
    await new Promise<void>((res) => server.listen(0, "127.0.0.1", res));
    const port = (server.address() as net.AddressInfo).port;
    const probe = `if (exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null; then echo REACHED; else echo ISOLATED; fi`;
    for (const forced of netRungs) {
      const denied = await run("bash", ["-c", probe], { network: false, forceRung: forced });
      ok(denied.containment === forced, `network[${forced}]: the denied run really used the ${forced} rung (got ${denied.containment})`);
      ok(denied.stdout.includes("ISOLATED") && !denied.stdout.includes("REACHED"), `network[${forced}]: network:false puts the process in its own network namespace — stdout=${JSON.stringify(denied.stdout)} stderr=${JSON.stringify(denied.stderr.slice(0, 160))}`);
      const granted = await run("bash", ["-c", probe], { network: true, forceRung: forced });
      ok(granted.stdout.includes("REACHED"), `network[${forced}]: network:true leaves the host network reachable — otherwise a network grant means nothing — stdout=${JSON.stringify(granted.stdout)}`);
    }
    server.close();
  } else {
    console.log("  UNPROVEN network: bash is not on this host");
  }
} else if (detectContainment(true) !== "seatbelt") {
  // no rung can isolate the network here: a run that must not touch it may not start open
  const refused = await run(process.execPath, ["-e", "1"], { network: false });
  ok(refused.containment === "refused" && refused.code === null && /DENIED/.test(refused.stderr), `with no net-isolating rung a network-denied run is REFUSED, not started open — got ${refused.containment}`);
}

fs.rmSync(outside, { recursive: true, force: true });
fs.rmSync(ws, { recursive: true, force: true });
fs.rmSync(toolDir, { recursive: true, force: true });
console.log(`shellContain: PASS (${checks} checks, rung=${rung})`);
