import { createRequire as __mjCreateRequire } from "node:module"; const require = __mjCreateRequire(import.meta.url);

// probe/shellContain.test.ts
import assert from "node:assert/strict";
import { execFileSync, spawnSync as spawnSync2 } from "node:child_process";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os2 from "node:os";
import * as path2 from "node:path";

// src/mission/shellContain.ts
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
var systemReadPrefixes = () => process.platform === "win32" ? [] : ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32", "/etc/ssl", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/ld.so.cache", "/etc/ld.so.conf", "/proc", "/dev", "/opt/homebrew", "/opt/local"].filter((p) => existsSync(p));
var UNSHARE_MOUNT_SCRIPT = [
  'R="$1"; CWD="$2"; H="$3"; shift 3',
  "mount --make-rprivate / 2>/dev/null || true",
  "for p in /usr /bin /sbin /lib /lib64 /lib32 /etc /proc /dev; do",
  '  if [ -e "$p" ]; then',
  '    if ! { mkdir -p "$R$p" && mount --rbind "$p" "$R$p"; }; then',
  '      case "$p" in',
  '        /usr|/dev) echo "contain-run: could not bind $p into the sandbox \u2014 refusing to run in a hollow root" >&2; exit 97 ;;',
  "      esac",
  "    fi",
  '    mount -o remount,ro,bind "$R$p" 2>/dev/null || true',
  "  fi",
  "done",
  'mkdir -p "$R/tmp"',
  'mount -t tmpfs -o size=512m tmpfs "$R/tmp"',
  "IFS=':'",
  "for r in $CONTAIN_READS; do",
  '  [ -n "$r" ] || continue',
  '  [ -e "$r" ] || continue',
  '  mkdir -p "$R$r"; mount --bind "$r" "$R$r"; mount -o remount,ro,bind "$R$r" 2>/dev/null || true',
  "done",
  "for w in $CONTAIN_WRITES; do",
  '  [ -n "$w" ] || continue',
  '  mkdir -p "$R$w"; mount --bind "$w" "$R$w"',
  "done",
  "unset IFS",
  'exec chroot "$R" /usr/bin/env -i -C "$CWD" HOME="$H" TMPDIR=/tmp PATH="${CONTAIN_PATH:-/usr/bin:/bin:/usr/local/bin}" "$@"',
  ""
].join("\n");
var DEFAULT_INNER_PATH = "/usr/bin:/bin:/usr/local/bin";
var OUTER_PATH = "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin";
function which(bin) {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(dir, bin);
    if (existsSync(p)) return p;
  }
  return null;
}
function whichSystem(bin) {
  const found = which(bin);
  if (found) return found;
  for (const d of ["/usr/sbin", "/sbin", "/usr/bin", "/bin"]) {
    const p = path.join(d, bin);
    if (existsSync(p)) return p;
  }
  return null;
}
function unshareArgs(network, scratch, cwd, home, program, args) {
  return ["-Urm", ...network ? [] : ["-n"], "--map-root-user", "/bin/sh", "-c", UNSHARE_MOUNT_SCRIPT, "contain-run", scratch, cwd, home, program, ...args];
}
function canaryUnshare(isolateNet) {
  let dir = "";
  try {
    dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "si-canary-")));
    const r = spawnSync("unshare", unshareArgs(!isolateNet, `${dir}/.contain-root`, dir, dir, "true", []), {
      stdio: "ignore",
      timeout: 1e4,
      env: { PATH: OUTER_PATH, CONTAIN_WRITES: dir, CONTAIN_READS: "", CONTAIN_PATH: DEFAULT_INNER_PATH }
    });
    return r.status === 0;
  } catch {
    return false;
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}
function canaryBwrap(isolateNet) {
  try {
    const r = spawnSync("bwrap", ["--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev", ...isolateNet ? ["--unshare-net"] : [], "--", "true"], {
      stdio: "ignore",
      timeout: 1e4,
      env: { PATH: "/usr/bin:/bin" }
    });
    return r.status === 0;
  } catch {
    return false;
  }
}
var capsCache = null;
function containCaps() {
  if (capsCache) return capsCache;
  const c = { unshare: false, unshareNet: false, bwrap: false, bwrapNet: false };
  if (process.platform === "linux") {
    if (whichSystem("unshare") && whichSystem("chroot") && whichSystem("mount")) {
      c.unshare = canaryUnshare(false);
      c.unshareNet = c.unshare && canaryUnshare(true);
    }
    if (which("bwrap")) {
      c.bwrap = canaryBwrap(false);
      c.bwrapNet = c.bwrap && canaryBwrap(true);
    }
  }
  capsCache = c;
  return c;
}
function detectContainment(needNetIsolation = false) {
  const c = containCaps();
  if (needNetIsolation) {
    if (c.unshareNet) return "unshare";
    if (c.bwrapNet) return "bwrap";
  } else {
    if (c.unshare) return "unshare";
    if (c.bwrap) return "bwrap";
  }
  if (process.platform === "darwin" && existsSync("/usr/bin/sandbox-exec")) return "seatbelt";
  return "policy-only";
}
var ALWAYS_VISIBLE = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32"];
var CREDENTIAL_COMPONENTS = [".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", "gcloud", "keyrings", ".password-store", ".git-credentials", ".netrc"];
var isUnder = (child, root2) => child === root2 || child.startsWith(root2.endsWith("/") ? root2 : root2 + "/");
function installPrefix(p) {
  const parent = path.dirname(p);
  return path.basename(parent) === "bin" ? path.dirname(parent) : parent;
}
function prefixIsBindable(x, home) {
  const comps = x.split("/").filter((c) => c.length > 0).map((c) => c.toLowerCase());
  if (comps.length < 2) return false;
  if (comps.some((c) => CREDENTIAL_COMPONENTS.includes(c))) return false;
  if (home) {
    if (isUnder(home, x)) return false;
    if (path.dirname(x) === home) return false;
  }
  return true;
}
function programSupport(resolved, home) {
  const none = { read: [], binDir: null };
  if (process.platform === "win32" || !path.isAbsolute(resolved)) return none;
  let real = resolved;
  try {
    real = realpathSync(resolved);
  } catch {
  }
  const visible = (x) => ALWAYS_VISIBLE.some((v) => isUnder(x, v));
  if (visible(resolved) && visible(real)) return none;
  const read2 = [];
  for (const candidate of [resolved, real]) {
    if (visible(candidate)) continue;
    const pk = [installPrefix(candidate), path.dirname(candidate)].find((c) => prefixIsBindable(c, home));
    if (pk && !read2.some((r) => isUnder(pk, r))) {
      for (let i = read2.length - 1; i >= 0; i--) if (isUnder(read2[i], pk)) read2.splice(i, 1);
      read2.push(pk);
    }
  }
  const bin = path.dirname(resolved);
  const binDir = read2.some((r) => isUnder(bin, r)) && !visible(bin) ? bin : null;
  return { read: read2, binDir };
}
function nodePermissionArgs(nodeMajor, writePaths) {
  const flag = nodeMajor !== void 0 && nodeMajor >= 23 ? "--permission" : "--experimental-permission";
  const reads = [.../* @__PURE__ */ new Set([...systemReadPrefixes(), ...writePaths])];
  return [
    flag,
    ...reads.map((p) => `--allow-fs-read=${p}`),
    ...writePaths.map((p) => `--allow-fs-write=${p}`)
  ];
}
function bwrapArgv(spec) {
  const network = spec.network ?? true;
  const binds = [];
  for (const p of systemReadPrefixes()) binds.push("--ro-bind", p, p);
  binds.push("--tmpfs", "/tmp");
  for (const p of spec.readPaths) {
    const abs = path.resolve(p);
    if (existsSync(abs) && !spec.writePaths.some((w) => path.resolve(w) === abs)) binds.push("--ro-bind", abs, abs);
  }
  for (const p of spec.writePaths) {
    const abs = path.resolve(p);
    binds.push("--bind", abs, abs);
  }
  return [
    "bwrap",
    ...binds,
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    ...network ? [] : ["--unshare-net"],
    "--setenv",
    "HOME",
    path.resolve(spec.writePaths[0] ?? spec.cwd),
    "--setenv",
    "TMPDIR",
    "/tmp",
    "--setenv",
    "PATH",
    spec.innerPath ?? DEFAULT_INNER_PATH,
    "--die-with-parent",
    "--new-session",
    "--chdir",
    path.resolve(spec.cwd),
    "--",
    spec.program,
    ...spec.args
  ];
}
function unshareArgv(spec) {
  const writes = spec.writePaths.map((p) => path.resolve(p));
  const reads = spec.readPaths.map((p) => path.resolve(p)).filter((r) => existsSync(r));
  const home = writes[0] ?? path.resolve(spec.cwd);
  const scratch = path.resolve(spec.writePaths[0] ?? spec.cwd, ".contain-root");
  return {
    program: "unshare",
    args: unshareArgs(spec.network ?? true, scratch, path.resolve(spec.cwd), home, spec.program, spec.args),
    // The scrub clears the environment, so these are applied AFTER it (the native side once lost
    // CONTAIN_WRITES to exactly that ordering and never mounted the workspace).
    extraEnv: {
      PATH: OUTER_PATH,
      CONTAIN_WRITES: writes.join(":"),
      CONTAIN_READS: reads.join(":"),
      CONTAIN_PATH: spec.innerPath ?? DEFAULT_INNER_PATH
    }
  };
}
function seatbeltArgv(spec) {
  const writes = spec.writePaths.map((p) => `(subpath "${path.resolve(p)}")`).join(" ");
  const net2 = spec.network ?? true ? "" : "(deny network*)\n";
  const profile = `(version 1)
(allow default)
(deny file-write*)
(allow file-write* ${writes} (subpath "/private/tmp") (subpath "/tmp"))
${net2}`;
  return ["sandbox-exec", "-p", profile, spec.program, ...spec.args];
}
function scrubbedEnv(spec, extra = {}) {
  const home = path.resolve(spec.writePaths[0] ?? spec.cwd);
  const base = {
    PATH: "/usr/bin:/bin:/usr/local/bin",
    HOME: home,
    ...process.platform === "win32" ? { USERPROFILE: home, HOMEDRIVE: path.parse(home).root.replace(/[\\/]$/, ""), HOMEPATH: path.parse(home).root.replace(/^[A-Za-z]:/, "") } : {},
    TMPDIR: process.platform === "win32" ? process.env.TEMP ?? "C:\\Temp" : "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    ...extra
  };
  for (const [k, v] of Object.entries(spec.env ?? {})) if (v !== void 0) base[k] = v;
  return base;
}
function spawnTarget(command, args) {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return { program: command, args };
  }
  const names = process.platform === "win32" ? [`.exe`, `.cmd`, `.bat`, `.com`].map((e) => command + e).concat(command) : [command];
  const pathEnv = process.env.PATH ?? "";
  let resolved = null;
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (existsSync(candidate)) {
          resolved = candidate;
          break;
        }
      } catch {
      }
    }
    if (resolved) break;
  }
  const program = resolved ?? command;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(program)) {
    const shell = process.env.ComSpec ?? "cmd.exe";
    return { program: shell, args: ["/c", program, ...args] };
  }
  return { program, args };
}
async function runContained(spec) {
  const network = spec.network ?? true;
  const c = containCaps();
  const forcedOk = spec.forceRung === "unshare" ? network ? c.unshare : c.unshareNet : spec.forceRung === "bwrap" ? network ? c.bwrap : c.bwrapNet : false;
  const mode = spec.forceRung && forcedOk ? spec.forceRung : detectContainment(!network);
  if (!network && !["unshare", "bwrap", "seatbelt"].includes(mode)) {
    return {
      stdout: "",
      stderr: `network access is DENIED for this run, but this host has no containment that can enforce that (best available: ${mode}). Nothing ran.`,
      code: null,
      containment: "refused"
    };
  }
  let program = spec.program;
  let args = spec.args;
  let containment = mode;
  let env = scrubbedEnv(spec);
  if (mode === "unshare" || mode === "bwrap") {
    const resolved = spawnTarget(spec.program, []).program;
    const support = programSupport(resolved, process.env.HOME ?? os.homedir());
    const eff = {
      ...spec,
      program: path.isAbsolute(resolved) ? resolved : spec.program,
      readPaths: [...spec.readPaths, ...support.read],
      innerPath: support.binDir ? `${support.binDir}:${DEFAULT_INNER_PATH}` : DEFAULT_INNER_PATH
    };
    if (mode === "unshare") {
      const u = unshareArgv(eff);
      program = u.program;
      args = u.args;
      env = scrubbedEnv(spec, u.extraEnv);
    } else {
      const argv2 = bwrapArgv(eff);
      program = argv2[0];
      args = argv2.slice(1);
    }
  } else if (mode === "seatbelt") {
    const argv2 = seatbeltArgv(spec);
    program = argv2[0];
    args = argv2.slice(1);
  } else if (/^(node|npm|npx)(\.exe)?$/i.test(path.basename(spec.program))) {
    const writePaths = spec.writePaths.map((p) => path.resolve(p));
    if (path.basename(spec.program).startsWith("node")) {
      const extra = nodePermissionArgs(Number(process.versions.node.split(".")[0]), writePaths);
      args = [...extra, ...spec.args];
      containment = "node-permission";
    }
  }
  if (mode === "policy-only" || mode === "node-permission") {
    const t = spawnTarget(program, args);
    program = t.program;
    args = t.args;
  }
  return await new Promise((resolve2) => {
    const child = spawn(program, args, {
      cwd: spec.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), spec.timeoutMs ?? 15e3);
    child.stdout.on("data", (d) => stdout += d);
    child.stderr.on("data", (d) => stderr += d);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve2({ stdout, stderr: stderr + String(e.message), code: null, containment: "refused" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve2({ stdout, stderr, code, containment });
    });
  });
}
var ESCAPE_FIXTURES = [
  { id: "node-fs-read", program: "node", buildArgs: (f) => ["-e", `process.stdout.write("RAN:node-fs-read\\n");process.stdout.write("LEAK:"+require("fs").readFileSync(${JSON.stringify(f)},"utf8"))`] },
  { id: "node-fs-write", program: "node", buildArgs: (f) => ["-e", `process.stdout.write("RAN:node-fs-write\\n");require("fs").writeFileSync(${JSON.stringify(f + ".w")},"pwned");process.stdout.write("WROTE")`] },
  { id: "python-open", program: process.platform === "win32" ? "python" : "python3", buildArgs: (f) => ["-c", `print("RAN:python-open");print("LEAK:"+open(${JSON.stringify(f)}).read())`] },
  { id: "python-write", program: process.platform === "win32" ? "python" : "python3", buildArgs: (f) => ["-c", `print("RAN:python-write");open(${JSON.stringify(f + ".w")},"w").write("pwned");print("WROTE")`] },
  { id: "npm-home-leak", program: "npm", buildArgs: () => ["config", "get", "userconfig"] },
  { id: "git-status-outside", program: "git", buildArgs: (f) => ["-C", path.dirname(f), "status"] },
  { id: "git-config-read", program: "git", buildArgs: () => ["config", "--global", "--list", "--show-origin"] },
  { id: "cargo-manifest-outside", program: "cargo", buildArgs: (f) => ["metadata", "--manifest-path", path.join(path.dirname(f), "Cargo.toml"), "--format-version", "1"] }
];

// probe/shellContain.test.ts
var root = process.env.SI_ROOT ? path2.resolve(process.env.SI_ROOT) : process.cwd();
var read = (rel) => fs.readFileSync(path2.join(root, rel), "utf8");
var MARKER = "S3CRET_SELFIMPULSE_CANARY_f7a91c";
var checks = 0;
var ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};
var containRs = read("src-tauri/src/contain.rs");
var commandsRs = read("src-tauri/src/commands.rs");
var mcpRs = read("src-tauri/src/mcp.rs");
for (const flag of ["--ro-bind", "--bind", "--die-with-parent", "--new-session", "--tmpfs", "--chdir", "env_clear", "--unshare-net"]) {
  ok(containRs.includes(flag), `contain.rs carries the ${flag} containment flag`);
}
for (const token of ["-Urm", '"-n"', "--map-root-user", "mount --make-rprivate", "chroot", "tmpfs", "--rbind", "CONTAIN_READS", "CONTAIN_PATH"]) {
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
var shellTs = read("src/mission/shellContain.ts");
var rustScript = /pub const UNSHARE_MOUNT_SCRIPT: &str = r#"([\s\S]*?)"#;/.exec(containRs)?.[1] ?? "";
ok(rustScript.length > 200, "the Rust mount script was found");
ok(rustScript === UNSHARE_MOUNT_SCRIPT, "the unshare mount script is BYTE-IDENTICAL in contain.rs and shellContain.ts");
ok(UNSHARE_MOUNT_SCRIPT.includes("--rbind") && UNSHARE_MOUNT_SCRIPT.includes("exit 97"), "the script binds the system prefixes recursively and refuses to run in a hollow root");
ok(!/\/opt \/proc/.test(UNSHARE_MOUNT_SCRIPT), "the script no longer exposes all of /opt");
var tmpAt = UNSHARE_MOUNT_SCRIPT.indexOf("-t tmpfs");
ok(tmpAt > 0 && tmpAt < UNSHARE_MOUNT_SCRIPT.indexOf("for r in $CONTAIN_READS") && tmpAt < UNSHARE_MOUNT_SCRIPT.indexOf("for w in $CONTAIN_WRITES"), "the /tmp tmpfs is mounted BEFORE the bind loops (a workspace under /tmp survives)");
ok(shellTs.includes("mount --make-rprivate") && shellTs.includes("--map-root-user"), "the TS reference and the Rust mirror share the unshare script tokens");
var WS = path2.join(os2.tmpdir(), "ws");
var argv = bwrapArgv({
  program: "node",
  args: ["-e", "1"],
  cwd: WS,
  readPaths: [WS],
  writePaths: [WS]
});
ok(argv[0] === "bwrap" && argv.includes("--die-with-parent") && argv[argv.indexOf("--") + 1] === "node", "bwrapArgv shape (wrapper, die-with-parent, -- terminator)");
ok(argv.includes(path2.resolve(WS)), "bwrapArgv binds the workspace");
ok(argv.includes(WS) || argv.includes(path2.resolve(WS)), "bwrapArgv binds the workspace (as given or resolved)");
ok(argv.filter((a) => a === path2.resolve(WS)).length >= 2, "bwrapArgv binds the workspace read-write (a --bind pair, not a single mention)");
ok(argv.includes(path2.resolve(path2.join(os2.tmpdir(), "ws"))), "bwrapArgv resolves the workspace path rather than passing a POSIX literal on this platform");
ok(argv.indexOf("--tmpfs") < argv.indexOf("--bind"), "bwrapArgv mounts the /tmp tmpfs BEFORE the workspace bind (a workspace under /tmp survives)");
ok(!argv.includes("--unshare-net"), "bwrapArgv leaves the network alone when the caller did not deny it");
var argvNoNet = bwrapArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS], network: false });
ok(argvNoNet.includes("--unshare-net"), "bwrapArgv adds --unshare-net when the network is denied");
var pathIdx = bwrapArgv({ program: "x", args: [], cwd: WS, readPaths: [], writePaths: [WS], innerPath: "/tool/bin:/usr/bin" });
ok(pathIdx[pathIdx.indexOf("PATH") + 1] === "/tool/bin:/usr/bin", "bwrapArgv puts the program's own bin dir on the inner PATH");
var un = unshareArgv({ program: "node", args: ["-v"], cwd: WS, readPaths: [], writePaths: [WS], network: false });
ok(un.args.slice(0, 3).join(" ") === "-Urm -n --map-root-user", "unshareArgv denies the network with a fresh namespace (-n)");
ok(unshareArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS] }).args[1] === "--map-root-user", "unshareArgv leaves the network alone by default");
ok(/\/usr\/sbin/.test(un.extraEnv.PATH) && "CONTAIN_WRITES" in un.extraEnv && "CONTAIN_READS" in un.extraEnv && "CONTAIN_PATH" in un.extraEnv, "unshareArgv hands the script its env AFTER the scrub (and a PATH that can find chroot)");
ok(seatbeltArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS], network: false })[2].includes("(deny network*)"), "the seatbelt profile denies the network when asked");
ok(!seatbeltArgv({ program: "node", args: [], cwd: WS, readPaths: [], writePaths: [WS] })[2].includes("(deny network*)"), "\u2026and does not when the network was granted");
var npArgs = nodePermissionArgs(void 0, [WS]);
ok(npArgs[0].startsWith("--experimental-permission") || npArgs[0] === "--permission", "node-permission rung uses the permission-model flag");
ok(npArgs.some((a) => a === `--allow-fs-write=${WS}`), "node-permission rung allows writes only in the workspace");
ok(prefixIsBindable("/opt/nvm/versions/node/v22", "/home/u") && prefixIsBindable("/home/u/.nvm/versions/node/v22", "/home/u"), "a toolchain install prefix may be bound");
ok(!prefixIsBindable("/", "/home/u") && !prefixIsBindable("/opt", "/home/u") && !prefixIsBindable("/home", "/home/u"), "never `/`, a top-level directory, or an ancestor of HOME");
ok(!prefixIsBindable("/home/u", "/home/u") && !prefixIsBindable("/home/u/.local", "/home/u"), "never HOME itself or a direct child of it (app data and tokens)");
ok(!prefixIsBindable("/home/u/.ssh/tools", "/home/u") && !prefixIsBindable("/home/u/p/.AWS/bin", "/home/u"), "never a credential store, whatever its case");
ok(programSupport("/usr/bin/git", "/home/u").read.length === 0 && programSupport("git", "/home/u").read.length === 0, "system programs and bare names need no extra binds");
var rung = detectContainment();
var caps = containCaps();
console.log(`  containment rung on this host: ${rung}  (proven: ${JSON.stringify(caps)})`);
var outside = fs.mkdtempSync(path2.join(os2.tmpdir(), "11h-outside-"));
var ws = fs.mkdtempSync(path2.join(os2.tmpdir(), "11h-ws-"));
var secretFile = path2.join(outside, "secret.txt");
fs.writeFileSync(secretFile, MARKER);
var unixRung = rung === "bwrap" || rung === "unshare";
var osContained = unixRung || rung === "seatbelt";
var hasBin = (bin) => {
  const r = spawnSync2(process.platform === "win32" ? "where" : "which", [bin], { encoding: "utf8" });
  return r.status === 0;
};
var run = (program, args, extra = {}) => runContained({ program, args, cwd: ws, readPaths: [ws], writePaths: [ws], timeoutMs: 2e4, ...extra });
var provenRungs = ["unshare", "bwrap"].filter((r) => r === "unshare" ? caps.unshare : caps.bwrap);
var toolDir = fs.mkdtempSync(path2.join(os2.tmpdir(), "11h-tool-"));
{
  const bin = path2.join(toolDir, "opt-like", "mytool", "bin");
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path2.join(bin, "mytool"), "#!/bin/sh\necho TOOL_RAN\n");
  fs.chmodSync(path2.join(bin, "mytool"), 493);
}
var toolPath = path2.join(toolDir, "opt-like", "mytool", "bin", "mytool");
for (const forced of provenRungs) {
  const sh = await run("sh", ["-c", 'echo RAN; test -c /dev/null && echo DEVNULL; test -r /proc/self/status && echo PROC; test -d "$HOME" && echo WORKSPACE'], { forceRung: forced });
  ok(sh.containment === forced, `canary[${forced}]: the run really used the ${forced} rung (got ${sh.containment})`);
  for (const token of ["RAN", "DEVNULL", "PROC", "WORKSPACE"]) {
    ok(sh.stdout.includes(token), `canary[${forced}]: a contained process has ${token} (stdout=${JSON.stringify(sh.stdout)} stderr=${JSON.stringify(sh.stderr.slice(0, 200))})`);
  }
  const tr = await run(toolPath, [], { forceRung: forced });
  ok(tr.stdout.includes("TOOL_RAN"), `canary[${forced}]: a toolchain OUTSIDE the system prefixes runs inside the sandbox (stdout=${JSON.stringify(tr.stdout)} stderr=${JSON.stringify(tr.stderr.slice(0, 200))})`);
}
var live = 0;
var unproven = 0;
var skipped = 0;
var nodeRuns = false;
for (const fixture of ESCAPE_FIXTURES) {
  const bin = fixture.id.startsWith("python") ? process.platform === "win32" ? "python" : "python3" : fixture.program;
  const nodeClass = fixture.id.startsWith("node");
  if (!hasBin(bin) && !nodeClass) {
    console.log(`  skip ${fixture.id} \u2014 ${bin} not on this host`);
    skipped += 1;
    continue;
  }
  const program = nodeClass ? process.execPath : bin;
  if (osContained) {
    const alive = await run(program, ["--version"]);
    const runs = alive.code === 0 && `${alive.stdout}${alive.stderr}`.trim().length > 0;
    if (nodeClass) nodeRuns = runs;
    if (!runs) {
      console.log(`  UNPROVEN ${fixture.id}: ${bin} cannot run inside the ${alive.containment} sandbox on this host (${JSON.stringify(`${alive.stdout}${alive.stderr}`.slice(0, 120))}) \u2014 NOT counted as proved`);
      unproven += 1;
      continue;
    }
  }
  const res = await run(program, fixture.buildArgs(secretFile));
  if (nodeClass || osContained) {
    const label = `${fixture.id} (${res.containment})`;
    if (nodeClass || fixture.id.startsWith("python")) {
      ok(res.stdout.includes(`RAN:${fixture.id}`), `${label}: the fixture actually ran inside the sandbox \u2014 "did not leak" is only evidence if it started (stdout=${JSON.stringify(res.stdout.slice(0, 80))} stderr=${JSON.stringify(res.stderr.slice(0, 120))})`);
    }
    ok(!`${res.stdout}${res.stderr}`.includes(MARKER), `${label}: secret marker did not leak`);
    if (fixture.id.endsWith("-write") || fixture.id === "node-fs-write" || fixture.id === "python-write") {
      ok(!fs.existsSync(`${secretFile}.w`), `${label}: write outside the workspace did not land`);
    }
    live += 1;
  } else {
    console.log(`  REPORT ${fixture.id}: OS containment unavailable on this host (rung=${rung}) \u2014 battery runs in CI where bubblewrap is installed; policy layer + env scrub still enforced (run reported "${res.containment}")`);
    ok(res.containment === "policy-only" || res.containment === "refused", `${fixture.id}: the run honestly reports its rung`);
    skipped += 1;
  }
}
ok(live >= 2 || unproven > 0 || !osContained, `the battery either proved at least the node-class escapes blocked (proved ${live}) or reported exactly why it could not (unproven ${unproven})`);
console.log(`  battery: ${live} proved, ${unproven} UNPROVEN, ${skipped} reported/skipped (rung=${rung})`);
var envProbe = await run(process.execPath, [
  "-e",
  `process.stdout.write(JSON.stringify({home: process.env.HOME ?? null, ssh: process.env.SSH_AUTH_SOCK ?? null, path: process.env.PATH ?? ""}))`
]);
var envLine = envProbe.stdout.trim().split("\n").pop() ?? "";
if (envLine === "" && osContained && !nodeRuns) {
  console.log(`  UNPROVEN env-scrub: node cannot run inside the ${envProbe.containment} sandbox on this host \u2014 reported, not asserted`);
} else {
  ok(envLine !== "", `the env probe produced output (an empty run is a failure to LAUNCH, not a pass) \u2014 stderr=${JSON.stringify(envProbe.stderr.slice(0, 200))}`);
  const envOut = JSON.parse(envLine);
  ok(envOut.home === ws, `HOME is redirected into the workspace (got ${envOut.home})`);
  ok(!envOut.ssh, "no SSH_AUTH_SOCK (or any host secret env) reaches the process");
}
if (hasBin("npm")) {
  const alive = osContained ? await run("npm", ["--version"]) : null;
  if (alive && !(alive.code === 0 && alive.stdout.trim().length > 0)) {
    console.log(`  UNPROVEN npm-home: npm cannot run inside the ${alive.containment} sandbox on this host \u2014 reported, not asserted`);
  } else {
    const npmRes = await run("npm", ["config", "get", "userconfig"]);
    ok(!npmRes.stdout.includes(os2.homedir().replace(/\\/g, "/")), "npm does not see the real home directory (HOME scrub)");
    ok(npmRes.stdout.includes(path2.basename(ws)) || npmRes.stdout.includes(ws), `npm's userconfig resolves inside the workspace (got: ${npmRes.stdout.trim().slice(0, 120)})`);
  }
}
var netRungs = ["unshare", "bwrap"].filter((r) => r === "unshare" ? caps.unshareNet : caps.bwrapNet);
if (netRungs.length > 0) {
  if (hasBin("bash")) {
    const server = net.createServer((s) => s.end());
    await new Promise((res) => server.listen(0, "127.0.0.1", res));
    const port = server.address().port;
    const probe = `if (exec 3<>/dev/tcp/127.0.0.1/${port}) 2>/dev/null; then echo REACHED; else echo ISOLATED; fi`;
    for (const forced of netRungs) {
      const denied = await run("bash", ["-c", probe], { network: false, forceRung: forced });
      ok(denied.containment === forced, `network[${forced}]: the denied run really used the ${forced} rung (got ${denied.containment})`);
      ok(denied.stdout.includes("ISOLATED") && !denied.stdout.includes("REACHED"), `network[${forced}]: network:false puts the process in its own network namespace \u2014 stdout=${JSON.stringify(denied.stdout)} stderr=${JSON.stringify(denied.stderr.slice(0, 160))}`);
      const granted = await run("bash", ["-c", probe], { network: true, forceRung: forced });
      ok(granted.stdout.includes("REACHED"), `network[${forced}]: network:true leaves the host network reachable \u2014 otherwise a network grant means nothing \u2014 stdout=${JSON.stringify(granted.stdout)}`);
    }
    server.close();
  } else {
    console.log("  UNPROVEN network: bash is not on this host");
  }
} else if (detectContainment(true) !== "seatbelt") {
  const refused = await run(process.execPath, ["-e", "1"], { network: false });
  ok(refused.containment === "refused" && refused.code === null && /DENIED/.test(refused.stderr), `with no net-isolating rung a network-denied run is REFUSED, not started open \u2014 got ${refused.containment}`);
}
fs.rmSync(outside, { recursive: true, force: true });
fs.rmSync(ws, { recursive: true, force: true });
fs.rmSync(toolDir, { recursive: true, force: true });
console.log(`shellContain: PASS (${checks} checks, rung=${rung})`);
