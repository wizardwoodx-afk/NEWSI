/**
 * SelfImpulse — shell containment (the host-escape boundary).
 *
 * The security boundary of workspace-restricted execution is NOT "cwd is inside
 * the workspace" — a permitted `node`/`python` process inherits the user's OS
 * privileges and can read anything the user can. The boundary is:
 *
 *     agent → policy/gate → CONTAINED executor
 *
 * This module is the single, testable specification of that containment. The
 * native runner (src-tauri/src/contain.rs) mirrors these builders exactly and
 * `probe/shellContain.test.ts` pins both sides to the same flags, then runs a
 * live escape battery through `runContained` on this machine.
 *
 * Containment ladder (strongest available is always used, and the run reports
 * which rung was achieved — never inferred):
 *
 *   unshare        Linux user-namespace + mount-namespace chroot sandbox
 *                  (util-linux `unshare`): system prefixes bound read-only,
 *                  ONLY the workspace is writable, /tmp is a tmpfs, HOME is
 *                  redirected into the workspace. Everything else is absent.
 *   bwrap          Linux bubblewrap, same policy, when installed.
 *   seatbelt       macOS sandbox-exec profile: read ok, writes only inside
 *                  the workspace and scratch.
 *   node-permission  Node's own permission model (--experimental-permission /
 *                  --permission): filesystem allow-list enforced by the Node
 *                  runtime for node programs when no OS sandbox exists.
 *   policy-only    No OS sandbox on this host: allow-list + workspace cwd +
 *                  env scrub ONLY, and the run says so (`containment:
 *                  "policy-only"`). Honest, not silent.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export type ContainmentMode = "unshare" | "bwrap" | "seatbelt" | "node-permission" | "policy-only";

export interface ContainSpec {
  program: string;
  args: string[];
  cwd: string;
  /** Directory trees the process may read (plus system runtime prefixes). */
  readPaths: string[];
  /** Directory trees the process may write (workspace roots + scratch). */
  writePaths: string[];
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  /**
   * May the process reach the network? DEFAULT TRUE here (the reference keeps its historical
   * behaviour for existing callers). `false` is a REQUIREMENT: the run gets a fresh, empty network
   * namespace, and on a host with no rung PROVEN to isolate it, the run is REFUSED rather than
   * started open under a "contained" label. The native runner takes it from the human-minted grant.
   */
  network?: boolean;
  /** PATH the program sees inside the sandbox (set by runContained from the program's own bin dir). */
  innerPath?: string;
  /**
   * TEST SEAM: run on this rung instead of the preferred one — honoured ONLY if the rung is proven
   * to launch a process here (otherwise the normal detection applies and `containment` says which
   * rung actually ran). The probe uses it to exercise every proven rung, not just the first.
   */
  forceRung?: "unshare" | "bwrap";
}

export interface ContainResult {
  stdout: string;
  stderr: string;
  code: number | null;
  containment: ContainmentMode | "refused";
}

const systemReadPrefixes = (): string[] =>
  process.platform === "win32"
    ? []
    : ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32", "/etc/ssl", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf", "/etc/ld.so.cache", "/etc/ld.so.conf", "/proc", "/dev", "/opt/homebrew", "/opt/local"].filter((p) => existsSync(p));

/**
 * Chroot-mount script run INSIDE the user+mount namespace. Positional: R CWD HOME + program argv.
 * Environment: CONTAIN_READS / CONTAIN_WRITES (colon lists bound read-only / read-write) and
 * CONTAIN_PATH (the PATH the program sees).
 *
 * BYTE-IDENTICAL to `UNSHARE_MOUNT_SCRIPT` in src-tauri/src/contain.rs — the probe compares the
 * two strings, so the reference and the native runner cannot drift apart. The system prefixes are
 * bound RECURSIVELY: inside a container or an unprivileged user namespace `/etc`, `/proc` and
 * `/dev` are locked mounts, a plain `--bind` of them fails, and the old script ignored that and
 * ran in a root with no `/dev/null` and no `/proc` while still reporting "contained". It now
 * refuses to run in a hollow root. The `/tmp` tmpfs is mounted BEFORE the bind loops, so a
 * workspace that lives under `/tmp` is not hidden by it.
 */
export const UNSHARE_MOUNT_SCRIPT = [
  "R=\"$1\"; CWD=\"$2\"; H=\"$3\"; shift 3",
  "mount --make-rprivate / 2>/dev/null || true",
  "for p in /usr /bin /sbin /lib /lib64 /lib32 /etc /proc /dev; do",
  "  if [ -e \"$p\" ]; then",
  "    if ! { mkdir -p \"$R$p\" && mount --rbind \"$p\" \"$R$p\"; }; then",
  "      case \"$p\" in",
  "        /usr|/dev) echo \"contain-run: could not bind $p into the sandbox — refusing to run in a hollow root\" >&2; exit 97 ;;",
  "      esac",
  "    fi",
  "    mount -o remount,ro,bind \"$R$p\" 2>/dev/null || true",
  "  fi",
  "done",
  "mkdir -p \"$R/tmp\"",
  "mount -t tmpfs -o size=512m tmpfs \"$R/tmp\"",
  "IFS=':'",
  "for r in $CONTAIN_READS; do",
  "  [ -n \"$r\" ] || continue",
  "  [ -e \"$r\" ] || continue",
  "  mkdir -p \"$R$r\"; mount --bind \"$r\" \"$R$r\"; mount -o remount,ro,bind \"$R$r\" 2>/dev/null || true",
  "done",
  "for w in $CONTAIN_WRITES; do",
  "  [ -n \"$w\" ] || continue",
  "  mkdir -p \"$R$w\"; mount --bind \"$w\" \"$R$w\"",
  "done",
  "unset IFS",
  "exec chroot \"$R\" /usr/bin/env -i -C \"$CWD\" HOME=\"$H\" TMPDIR=/tmp PATH=\"${CONTAIN_PATH:-/usr/bin:/bin:/usr/local/bin}\" \"$@\"",
  "",
].join("\n");

/** PATH inside the sandbox unless the program brings its own bin dir. */
export const DEFAULT_INNER_PATH = "/usr/bin:/bin:/usr/local/bin";
/** PATH the mount script itself runs under (OUTSIDE the chroot): `chroot` is in /usr/sbin on Debian. */
export const OUTER_PATH = "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin";

function which(bin: string): string | null {
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const p = path.join(dir, bin);
    if (existsSync(p)) return p;
  }
  return null;
}

/** `which`, falling back to the sbin directories a normal user's PATH does not list. */
function whichSystem(bin: string): string | null {
  const found = which(bin);
  if (found) return found;
  for (const d of ["/usr/sbin", "/sbin", "/usr/bin", "/bin"]) {
    const p = path.join(d, bin);
    if (existsSync(p)) return p;
  }
  return null;
}

/** The `unshare` argument vector. `network === false` adds a fresh network namespace (`-n`). */
export function unshareArgs(network: boolean, scratch: string, cwd: string, home: string, program: string, args: string[]): string[] {
  return ["-Urm", ...(network ? [] : ["-n"]), "--map-root-user", "/bin/sh", "-c", UNSHARE_MOUNT_SCRIPT, "contain-run", scratch, cwd, home, program, ...args];
}

/* A rung is not "detected" by `which` — it is PROVEN by launching a process in it. The old check
   ran `unshare -Urm true`, which exercises neither the mount-and-chroot script nor bubblewrap's
   own setup, so hosts with restricted user namespaces passed it and then ran nothing, silently,
   labelled "contained". */
function canaryUnshare(isolateNet: boolean): boolean {
  let dir = "";
  try {
    dir = realpathSync(mkdtempSync(path.join(os.tmpdir(), "si-canary-")));
    const r = spawnSync("unshare", unshareArgs(!isolateNet, `${dir}/.contain-root`, dir, dir, "true", []), {
      stdio: "ignore",
      timeout: 10_000,
      env: { PATH: OUTER_PATH, CONTAIN_WRITES: dir, CONTAIN_READS: "", CONTAIN_PATH: DEFAULT_INNER_PATH },
    });
    return r.status === 0;
  } catch {
    return false;
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
}

function canaryBwrap(isolateNet: boolean): boolean {
  try {
    const r = spawnSync("bwrap", ["--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev", ...(isolateNet ? ["--unshare-net"] : []), "--", "true"], {
      stdio: "ignore",
      timeout: 10_000,
      env: { PATH: "/usr/bin:/bin" },
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

export interface ContainCaps { unshare: boolean; unshareNet: boolean; bwrap: boolean; bwrapNet: boolean }
let capsCache: ContainCaps | null = null;

/** What this host can ACTUALLY do, found by running each rung once (cached). */
export function containCaps(): ContainCaps {
  if (capsCache) return capsCache;
  const c: ContainCaps = { unshare: false, unshareNet: false, bwrap: false, bwrapNet: false };
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

/** The strongest rung PROVEN to launch a process here; `needNetIsolation` asks for one that can also deny the network. */
export function detectContainment(needNetIsolation = false): ContainmentMode {
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

/* ───────────── the program must EXIST inside the sandbox ─────────────
   A contained process sees only the system prefixes and the workspace. A toolchain installed
   anywhere else (`~/.nvm`, `~/.local/…`, `/opt/node`, a pyenv version) does not exist in there:
   the launch fails, stdout is empty, and a battery asserting "the secret did not leak" PASSES
   because nothing ran. The program's install prefix is therefore bound read-only and its bin dir
   goes on the inner PATH (so an `npm` finds its sibling `node`). Mirrors `program_support`. */
const ALWAYS_VISIBLE = ["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32"];
const CREDENTIAL_COMPONENTS = [".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", "gcloud", "keyrings", ".password-store", ".git-credentials", ".netrc"];

const isUnder = (child: string, root: string): boolean => child === root || child.startsWith(root.endsWith("/") ? root : root + "/");

export interface ProgramSupport { read: string[]; binDir: string | null }

function installPrefix(p: string): string {
  const parent = path.dirname(p);
  return path.basename(parent) === "bin" ? path.dirname(parent) : parent;
}

/** May this directory be exposed read-only to a sandboxed process? Never `/`, a top-level directory, HOME or an ancestor of it, a direct child of HOME, or a credential store. */
export function prefixIsBindable(x: string, home?: string): boolean {
  const comps = x.split("/").filter((c) => c.length > 0).map((c) => c.toLowerCase());
  if (comps.length < 2) return false;
  if (comps.some((c) => CREDENTIAL_COMPONENTS.includes(c))) return false;
  if (home) {
    if (isUnder(home, x)) return false; // x is HOME or an ancestor of it
    if (path.dirname(x) === home) return false; // a direct child of HOME holds app data and tokens
  }
  return true;
}

export function programSupport(resolved: string, home?: string): ProgramSupport {
  const none: ProgramSupport = { read: [], binDir: null };
  if (process.platform === "win32" || !path.isAbsolute(resolved)) return none;
  let real = resolved;
  try { real = realpathSync(resolved); } catch { /* keep as given */ }
  const visible = (x: string): boolean => ALWAYS_VISIBLE.some((v) => isUnder(x, v));
  if (visible(resolved) && visible(real)) return none;
  const read: string[] = [];
  for (const candidate of [resolved, real]) {
    if (visible(candidate)) continue;
    const pk = [installPrefix(candidate), path.dirname(candidate)].find((c) => prefixIsBindable(c, home));
    if (pk && !read.some((r) => isUnder(pk, r))) {
      for (let i = read.length - 1; i >= 0; i--) if (isUnder(read[i], pk)) read.splice(i, 1);
      read.push(pk);
    }
  }
  const bin = path.dirname(resolved);
  const binDir = read.some((r) => isUnder(bin, r)) && !visible(bin) ? bin : null;
  return { read, binDir };
}

/**
 * Node runtime flags for the node-permission rung (used for node when no OS
 * sandbox exists). Node 20: --experimental-permission; Node >=23: --permission.
 */
export function nodePermissionArgs(nodeMajor: number | undefined, writePaths: string[]): string[] {
  const flag = nodeMajor !== undefined && nodeMajor >= 23 ? "--permission" : "--experimental-permission";
  const reads = [...new Set([...systemReadPrefixes(), ...writePaths])];
  return [
    flag,
    ...reads.map((p) => `--allow-fs-read=${p}`),
    ...writePaths.map((p) => `--allow-fs-write=${p}`),
  ];
}

/** The bwrap builder — mirrored by contain.rs and pinned by the probe. */
export function bwrapArgv(spec: ContainSpec): string[] {
  const network = spec.network ?? true;
  const binds: string[] = [];
  for (const p of systemReadPrefixes()) binds.push("--ro-bind", p, p);
  // The /tmp tmpfs goes FIRST: bwrap applies arguments in order, so a tmpfs mounted after the
  // workspace bind hides a workspace that lives under /tmp ("Can't chdir to …").
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
    "--dev", "/dev",
    "--proc", "/proc",
    ...(network ? [] : ["--unshare-net"]),
    "--setenv", "HOME", path.resolve(spec.writePaths[0] ?? spec.cwd),
    "--setenv", "TMPDIR", "/tmp",
    "--setenv", "PATH", spec.innerPath ?? DEFAULT_INNER_PATH,
    "--die-with-parent",
    "--new-session",
    "--chdir", path.resolve(spec.cwd),
    "--",
    spec.program,
    ...spec.args,
  ];
}

/** The unshare builder — mirrored by contain.rs and pinned by the probe. */
export function unshareArgv(spec: ContainSpec): { program: string; args: string[]; extraEnv: Record<string, string> } {
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
      CONTAIN_PATH: spec.innerPath ?? DEFAULT_INNER_PATH,
    },
  };
}

/** The seatbelt builder — macOS. Read-everything, write-only-inside, network denied unless granted. */
export function seatbeltArgv(spec: ContainSpec): string[] {
  const writes = spec.writePaths.map((p) => `(subpath "${path.resolve(p)}")`).join(" ");
  const net = (spec.network ?? true) ? "" : "(deny network*)\n";
  const profile = `(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* ${writes} (subpath "/private/tmp") (subpath "/tmp"))\n${net}`;
  return ["sandbox-exec", "-p", profile, spec.program, ...spec.args];
}

function scrubbedEnv(spec: ContainSpec, extra: Record<string, string> = {}): Record<string, string> {
  const home = path.resolve(spec.writePaths[0] ?? spec.cwd);
  /* 19.8 — HOME is the POSIX home variable, and setting ONLY it left every
     Windows tool inside the sandbox with no home at all: the scrub clears the
     environment, and on Windows the toolchain reads `%USERPROFILE%` (npm, git,
     Python, cargo all do), not `HOME`. The observed symptom was `npm config get
     userconfig` printing an EMPTY path inside a contained run — fail-closed, so
     not a leak, but a broken environment that makes contained tooling fail for
     the wrong reason. The native mirror in contain.rs sets the same three. */
  const base: Record<string, string> = {
    PATH: "/usr/bin:/bin:/usr/local/bin",
    HOME: home,
    ...(process.platform === "win32" ? { USERPROFILE: home, HOMEDRIVE: path.parse(home).root.replace(/[\\/]$/, ""), HOMEPATH: path.parse(home).root.replace(/^[A-Za-z]:/, "") } : {}),
    TMPDIR: process.platform === "win32" ? process.env.TEMP ?? "C:\\Temp" : "/tmp",
    LANG: process.env.LANG ?? "C.UTF-8",
    ...extra,
  };
  for (const [k, v] of Object.entries(spec.env ?? {})) if (v !== undefined) base[k] = v;
  return base;
}

/**
 * Run a program under the strongest containment this host offers. The result
 * always reports which rung was achieved — a caller can never mistake
 * policy-only for an OS sandbox.
 */
/**
 * Resolve a program to something spawnable on this platform.
 *
 * Mirrors `resolve_program` / `spawn_target` in src-tauri/src/contain.rs, and
 * exists because the Rust side solved a problem the TypeScript reference never
 * did. 19.8: `runContained` called `spawn(program, args)` directly, and on
 * Windows that cannot execute a `.cmd`/`.bat` at all — npm, npx, python and py
 * all install a shim script rather than a real executable. Every contained run of
 * those tools therefore failed to start. The escape battery did not catch it
 * because the failures were REPORTED as "skipped" instead of being failures, so
 * a containment layer that could not launch half its fixtures still read green.
 *
 * Two steps, in this order:
 *   1. a bare name is searched on PATH with the extensions `PATHEXT` supplies,
 *      in the order Windows itself prefers — the bare name LAST, because npm
 *      installs an extensionless POSIX shim alongside `npm.cmd` and matching it
 *      first finds a bash script that cannot run at all;
 *   2. a resolved `.cmd`/`.bat` is launched as `cmd.exe /c <file> <args...>`,
 *      because Windows cannot `CreateProcess` a batch file.
 */
export function spawnTarget(command: string, args: string[]): { program: string; args: string[] } {
  if (path.isAbsolute(command) || command.includes("/") || command.includes("\\")) {
    return { program: command, args };
  }
  const names = process.platform === "win32"
    ? [`.exe`, `.cmd`, `.bat`, `.com`].map((e) => command + e).concat(command)
    : [command];
  const pathEnv = process.env.PATH ?? "";
  let resolved: string | null = null;
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (existsSync(candidate)) { resolved = candidate; break; }
      } catch { /* an unreadable PATH entry is not a reason to stop searching */ }
    }
    if (resolved) break;
  }
  // Nothing found: return the name unchanged so the spawn error still names what
  // the caller asked for, rather than a path the configuration never wrote.
  const program = resolved ?? command;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(program)) {
    const shell = process.env.ComSpec ?? "cmd.exe";
    return { program: shell, args: ["/c", program, ...args] };
  }
  return { program, args };
}

/**
 * Run the command under the strongest containment available and report which
 * rung was actually achieved — a caller can never mistake
 * policy-only for an OS sandbox. With `network: false` a host that cannot isolate the network
 * REFUSES the run (containment "refused") instead of starting it open.
 */
export async function runContained(spec: ContainSpec): Promise<ContainResult> {
  const network = spec.network ?? true;
  const c = containCaps();
  const forcedOk =
    spec.forceRung === "unshare" ? (network ? c.unshare : c.unshareNet) : spec.forceRung === "bwrap" ? (network ? c.bwrap : c.bwrapNet) : false;
  const mode: ContainmentMode = spec.forceRung && forcedOk ? spec.forceRung : detectContainment(!network);
  if (!network && !["unshare", "bwrap", "seatbelt"].includes(mode)) {
    return {
      stdout: "",
      stderr: `network access is DENIED for this run, but this host has no containment that can enforce that (best available: ${mode}). Nothing ran.`,
      code: null,
      containment: "refused",
    };
  }
  let program = spec.program;
  let args = spec.args;
  let containment: ContainResult["containment"] = mode;
  let env = scrubbedEnv(spec);

  if (mode === "unshare" || mode === "bwrap") {
    // The program must exist INSIDE the sandbox: resolve it on the host, bind its install prefix
    // read-only, and put its bin dir on the inner PATH.
    const resolved = spawnTarget(spec.program, []).program;
    const support = programSupport(resolved, process.env.HOME ?? os.homedir());
    const eff: ContainSpec = {
      ...spec,
      program: path.isAbsolute(resolved) ? resolved : spec.program,
      readPaths: [...spec.readPaths, ...support.read],
      innerPath: support.binDir ? `${support.binDir}:${DEFAULT_INNER_PATH}` : DEFAULT_INNER_PATH,
    };
    if (mode === "unshare") {
      const u = unshareArgv(eff);
      program = u.program;
      args = u.args;
      env = scrubbedEnv(spec, u.extraEnv);
    } else {
      const argv = bwrapArgv(eff);
      program = argv[0];
      args = argv.slice(1);
    }
  } else if (mode === "seatbelt") {
    const argv = seatbeltArgv(spec);
    program = argv[0];
    args = argv.slice(1);
  } else if (/^(node|npm|npx)(\.exe)?$/i.test(path.basename(spec.program))) {
    // The node-permission rung works anywhere Node runs — even without an OS sandbox.
    // (npm/npx are shell shims: flags cannot pass through them, so they keep the
    // scrubbed env + HOME redirect and honestly report their rung.)
    const writePaths = spec.writePaths.map((p) => path.resolve(p));
    if (path.basename(spec.program).startsWith("node")) {
      const extra = nodePermissionArgs(Number(process.versions.node.split(".")[0]), writePaths);
      args = [...extra, ...spec.args];
      containment = "node-permission";
    }
  }

  // The builder may have produced a wrapper (bwrap, unshare, sandbox-exec) whose
  // program is already absolute; spawnTarget is a no-op for those and only
  // rewrites bare tool names like `npm`.
  if (mode === "policy-only" || mode === "node-permission") {
    const t = spawnTarget(program, args);
    program = t.program;
    args = t.args;
  }

  return await new Promise((resolve) => {
    const child = spawn(program, args, {
      cwd: spec.cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), spec.timeoutMs ?? 15000);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(e.message), code: null, containment: "refused" });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code, containment });
    });
  });
}

/**
 * The adversarial battery. Each fixture is a realistic escape attempt a mission
 * restricted to a workspace would try (directly, or via node/python/npm/git/
 * cargo/MCP). `marker` is the secret planted outside the workspace — it must
 * never appear in any output.
 *
 * LIVENESS: a contained process that never started cannot leak anything, so "the marker did not
 * appear" proves nothing on its own. The node and python fixtures print `RAN:<id>` BEFORE they
 * attempt the escape — the probe requires it — and the probe additionally runs every fixture's
 * interpreter with `--version` inside the same sandbox first and counts a fixture as PROVED only
 * if that came back.
 */
export const ESCAPE_FIXTURES: { id: string; program: string; buildArgs: (outsideFile: string) => string[] }[] = [
  { id: "node-fs-read", program: "node", buildArgs: (f) => ["-e", `process.stdout.write("RAN:node-fs-read\\n");process.stdout.write("LEAK:"+require("fs").readFileSync(${JSON.stringify(f)},"utf8"))`] },
  { id: "node-fs-write", program: "node", buildArgs: (f) => ["-e", `process.stdout.write("RAN:node-fs-write\\n");require("fs").writeFileSync(${JSON.stringify(f+".w")},"pwned");process.stdout.write("WROTE")`] },
  { id: "python-open", program: process.platform === "win32" ? "python" : "python3", buildArgs: (f) => ["-c", `print("RAN:python-open");print("LEAK:"+open(${JSON.stringify(f)}).read())`] },
  { id: "python-write", program: process.platform === "win32" ? "python" : "python3", buildArgs: (f) => ["-c", `print("RAN:python-write");open(${JSON.stringify(f+".w")},"w").write("pwned");print("WROTE")`] },
  { id: "npm-home-leak", program: "npm", buildArgs: () => ["config", "get", "userconfig"] },
  { id: "git-status-outside", program: "git", buildArgs: (f) => ["-C", path.dirname(f), "status"] },
  { id: "git-config-read", program: "git", buildArgs: () => ["config", "--global", "--list", "--show-origin"] },
  { id: "cargo-manifest-outside", program: "cargo", buildArgs: (f) => ["metadata", "--manifest-path", path.join(path.dirname(f), "Cargo.toml"), "--format-version", "1"] },
];
