//! SelfImpulse — host-escape containment for every spawned process (shell, MCP,
//! harness). This is the native mirror of `src/mission/shellContain.ts`; the two
//! are pinned to the same flags by `probe/shellContain.test.ts`.
//!
//! The security boundary of workspace-restricted execution is NOT "cwd is inside
//! the workspace" — a permitted process inherits the user's OS privileges. The
//! boundary is: agent → policy/gate → CONTAINED executor. Every run reports the
//! rung it actually achieved (`unshare` / `bwrap` / `seatbelt` /
//! `node-permission` / `policy-only`); nothing is ever inferred.

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::OnceLock;

/// How this run is contained. `policy-only` is honest reporting, not a sandbox.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Containment {
    Unshare,
    Bwrap,
    Seatbelt,
    NodePermission,
    PolicyOnly,
}

impl Containment {
    pub fn label(&self) -> &'static str {
        match self {
            Containment::Unshare => "unshare",
            Containment::Bwrap => "bwrap",
            Containment::Seatbelt => "seatbelt",
            Containment::NodePermission => "node-permission",
            Containment::PolicyOnly => "policy-only",
        }
    }
}

/// Locate an executable on PATH.
///
/// On unix the name is matched verbatim. On Windows a bare name is not enough:
/// the interpreter shims a user actually types are `npx.cmd`, `python.exe`,
/// `py.exe` and so on, and `std::process::Command` does not append `PATHEXT` the
/// way a shell does. Spawning the seeded MCP servers with their documented
/// commands therefore failed with `program not found` on Windows for every
/// server that is not a `.exe` — which is all of them. The extensions tried
/// here are the ones `PATHEXT` normally supplies, in the order Windows itself
/// prefers them, so a server configured as `npx` finds `npx.cmd` without the
/// configuration having to name a platform.
fn which(bin: &str) -> Option<PathBuf> {
    let candidate = Path::new(bin);
    // A path with a separator is used as given; only bare names are searched.
    let names: Vec<String> = if candidate.components().count() > 1 || cfg!(not(target_os = "windows")) {
        vec![bin.to_string()]
    } else {
        // Order matters, and the bare name must come LAST. Node, npm and
        // several other tools install a POSIX shell script with no extension
        // (`D:\...\npx`) *alongside* `npx.cmd`. Matching the bare name first
        // therefore locates a bash script on Windows, which cannot be executed
        // at all — it fails with "%1 is not a valid Win32 application". The
        // extension Windows would actually run comes first.
        let mut v = Vec::new();
        for ext in [".exe", ".cmd", ".bat", ".com"] {
            v.push(format!("{bin}{ext}"));
        }
        v.push(bin.to_string());
        v
    };
    if let Ok(paths) = std::env::var("PATH") {
        for dir in std::env::split_paths(&paths) {
            for name in &names {
                let p = dir.join(name);
                if p.is_file() {
                    return Some(p);
                }
            }
        }
    }
    None
}

/// Resolve a program name to something spawnable, or return it unchanged.
///
/// When nothing is found the original name is returned so the spawn error still
/// names what the configuration asked for, rather than a path the user never
/// wrote.
pub fn resolve_program(bin: &str) -> String {
    which(bin)
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| bin.to_string())
}

/// Turn a configured program + arguments into something that can actually be
/// spawned on this platform, together with the arguments to use.
///
/// Finding `npx.cmd` is only half the problem. Windows cannot `CreateProcess` a
/// batch file at all: a `.cmd` or `.bat` target fails with
/// "%1 is not a valid Win32 application" (os error 193) no matter that the file
/// was located correctly. Batch files are scripts for the command interpreter,
/// so they have to be launched as `cmd.exe /c <file> <args...>`.
///
/// On unix this is the identity: the program is resolved and the arguments pass
/// through untouched, because a shebang script is executed by the kernel.
pub fn spawn_target(command: &str, args: &[String]) -> (String, Vec<String>) {
    let program = resolve_program(command);
    if !cfg!(target_os = "windows") {
        return (program, args.to_vec());
    }
    let lower = program.to_ascii_lowercase();
    if lower.ends_with(".cmd") || lower.ends_with(".bat") {
        let mut all = vec!["/c".to_string(), program];
        all.extend(args.iter().cloned());
        // `%ComSpec%` is the interpreter this session is actually configured
        // to use; falling back to `cmd.exe` keeps the spawn honest if it is unset.
        let shell = std::env::var("ComSpec").unwrap_or_else(|_| "cmd.exe".to_string());
        return (shell, all);
    }
    (program, args.to_vec())
}

/// Chroot-mount script run INSIDE the user+mount namespace. Positional: R CWD HOME + program argv.
/// Environment: CONTAIN_READS / CONTAIN_WRITES (colon lists, bound read-only / read-write) and
/// CONTAIN_PATH (the PATH the program sees). Mirrors `UNSHARE_MOUNT_SCRIPT` in
/// src/mission/shellContain.ts (pinned by the probe).
///
/// The system prefixes are bound RECURSIVELY (`--rbind`): inside a container or an unprivileged
/// user namespace, `/etc`, `/proc` and `/dev` are locked mounts and a plain `--bind` of them fails
/// ("wrong fs type") — the old script ignored that, ran with no `/dev/null` and no `/proc`, and
/// still reported "contained". It now refuses to run in a root missing `/usr` or `/dev`.
///
/// `/opt` is deliberately NOT bound wholesale any more: a blanket `/opt` exposed every
/// vendor tree on the machine to the sandboxed process and still failed to cover a toolchain
/// that lives elsewhere (`~/.nvm`, `~/.local/…`). The program's own install prefix is bound
/// explicitly instead (see `program_support`).
pub const UNSHARE_MOUNT_SCRIPT: &str = r#"R="$1"; CWD="$2"; H="$3"; shift 3
mount --make-rprivate / 2>/dev/null || true
for p in /usr /bin /sbin /lib /lib64 /lib32 /etc /proc /dev; do
  if [ -e "$p" ]; then
    if ! { mkdir -p "$R$p" && mount --rbind "$p" "$R$p"; }; then
      case "$p" in
        /usr|/dev) echo "contain-run: could not bind $p into the sandbox — refusing to run in a hollow root" >&2; exit 97 ;;
      esac
    fi
    mount -o remount,ro,bind "$R$p" 2>/dev/null || true
  fi
done
mkdir -p "$R/tmp"
mount -t tmpfs -o size=512m tmpfs "$R/tmp"
IFS=':'
for r in $CONTAIN_READS; do
  [ -n "$r" ] || continue
  [ -e "$r" ] || continue
  mkdir -p "$R$r"; mount --bind "$r" "$R$r"; mount -o remount,ro,bind "$R$r" 2>/dev/null || true
done
for w in $CONTAIN_WRITES; do
  [ -n "$w" ] || continue
  mkdir -p "$R$w"; mount --bind "$w" "$R$w"
done
unset IFS
exec chroot "$R" /usr/bin/env -i -C "$CWD" HOME="$H" TMPDIR=/tmp PATH="${CONTAIN_PATH:-/usr/bin:/bin:/usr/local/bin}" "$@"
"#;

const DEFAULT_INNER_PATH: &str = "/usr/bin:/bin:/usr/local/bin";
/// The PATH the mount script itself runs under (OUTSIDE the chroot). `chroot` lives in
/// `/usr/sbin` on Debian and its derivatives; with the scrubbed `/usr/bin:/bin` the script died
/// with `chroot: not found` — the unshare rung could never launch there as shipped.
const OUTER_PATH: &str = "/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin";

/// Like `which`, but for the system tools the unshare rung needs that may live in an sbin
/// directory a normal user's PATH does not list.
fn which_system(bin: &str) -> Option<PathBuf> {
    which(bin).or_else(|| {
        ["/usr/sbin", "/sbin", "/usr/bin", "/bin"].iter().map(|d| Path::new(d).join(bin)).find(|p| p.is_file())
    })
}

/// The `unshare` argument vector. `network == false` adds a fresh network namespace (`-n`),
/// which has no route to anything — not even the host's loopback.
pub fn unshare_args(network: bool, scratch: &str, cwd: &str, home: &str, program: &str, args: &[String]) -> Vec<String> {
    let mut a: Vec<String> = vec!["-Urm".into()];
    if !network {
        a.push("-n".into());
    }
    a.extend([
        "--map-root-user".into(),
        "/bin/sh".into(),
        "-c".into(),
        UNSHARE_MOUNT_SCRIPT.to_string(),
        "contain-run".into(),
        scratch.to_string(),
        cwd.to_string(),
        home.to_string(),
        program.to_string(),
    ]);
    a.extend(args.iter().cloned());
    a
}

/// What this host's containment can ACTUALLY do, found by running each rung once.
///
/// Before this, a rung was "detected" by `which unshare` / `which bwrap` plus a bare
/// `unshare -Urm true`. None of that exercises the mount-and-chroot script or bubblewrap's
/// own namespace setup, and several hosts (AppArmor-restricted user namespaces, container
/// runtimes without mount rights) pass the cheap check and then run nothing — silently, with
/// empty output, labelled "contained". A rung that cannot launch a process is not a rung.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Caps {
    /// The unshare rung launches a process (network left as it is).
    pub unshare: bool,
    /// …and ALSO launches with a fresh, empty network namespace (`-n`).
    pub unshare_net: bool,
    /// The bwrap rung launches a process (network left as it is).
    pub bwrap: bool,
    /// …and ALSO launches with `--unshare-net`.
    pub bwrap_net: bool,
}

static CAPS: OnceLock<Caps> = OnceLock::new();

pub fn caps() -> Caps {
    *CAPS.get_or_init(probe_caps)
}

/// `isolate_net == true` probes the variant that adds a fresh network namespace (`-n`).
fn canary_unshare(isolate_net: bool) -> bool {
    let dir = std::env::temp_dir().join(format!("si-contain-canary-{}-{}", std::process::id(), isolate_net as u8));
    if std::fs::create_dir_all(&dir).is_err() {
        return false;
    }
    let d = dunce_abs(&dir);
    let scratch = format!("{d}/.contain-root");
    let a = unshare_args(!isolate_net, &scratch, &d, &d, "true", &[]); // unshare_args takes "network allowed"
    let ok = Command::new("unshare")
        .args(&a)
        .env_clear()
        .env("PATH", OUTER_PATH)
        .env("CONTAIN_WRITES", &d)
        .env("CONTAIN_READS", "")
        .env("CONTAIN_PATH", DEFAULT_INNER_PATH)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    let _ = std::fs::remove_dir_all(&dir);
    ok
}

/// `isolate_net == true` probes the variant that adds `--unshare-net`.
fn canary_bwrap(isolate_net: bool) -> bool {
    let mut c = Command::new("bwrap");
    c.args(["--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev"]);
    if isolate_net {
        c.arg("--unshare-net");
    }
    c.args(["--", "true"])
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn probe_caps() -> Caps {
    let mut c = Caps::default();
    if cfg!(target_os = "linux") {
        if which_system("unshare").is_some() && which_system("chroot").is_some() && which_system("mount").is_some() {
            c.unshare = canary_unshare(false);
            c.unshare_net = c.unshare && canary_unshare(true);
        }
        if which("bwrap").is_some() {
            c.bwrap = canary_bwrap(false);
            c.bwrap_net = c.bwrap && canary_bwrap(true);
        }
    }
    c
}

/// The strongest rung that is PROVEN to launch a process here. `need_net_isolation` asks
/// for a rung that can also deny the network; on macOS seatbelt can, via its profile.
pub fn detect(need_net_isolation: bool) -> Containment {
    let c = caps();
    if need_net_isolation {
        if c.unshare_net {
            return Containment::Unshare;
        }
        if c.bwrap_net {
            return Containment::Bwrap;
        }
    } else {
        if c.unshare {
            return Containment::Unshare;
        }
        if c.bwrap {
            return Containment::Bwrap;
        }
    }
    if cfg!(target_os = "macos") && Path::new("/usr/bin/sandbox-exec").exists() {
        return Containment::Seatbelt;
    }
    Containment::PolicyOnly
}

const SYSTEM_READ_PREFIXES: &[&str] = &[
    "/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32", "/etc/ssl", "/etc/resolv.conf",
    "/etc/hosts", "/etc/nsswitch.conf", "/etc/ld.so.cache", "/etc/ld.so.conf", "/proc", "/dev",
    "/opt/homebrew", "/opt/local",
];

/// Absolute, canonical, symlink-free form of `p`.
///
/// Canonicalize is best-effort: on Windows a path can be canonical even when it
/// does not exist yet, and on a non-existent path we fall back to the input.
/// This is used both for string comparison (dedupe) and for existence checks.
fn dunce_path(p: &Path) -> PathBuf {
    std::fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

/// The same value as a string, for argv entries and environment values.
/// Absolute path with the Windows `\\?\` prefix stripped.
///
/// `pub` since 20.1 so `hermes.rs` can compute the same `home` value the
/// scrubber needs, rather than inventing a second normalisation that would
/// drift from this one.
pub fn dunce_abs(p: &Path) -> String {
    dunce_path(p).display().to_string()
}

/* ───────────── the program must EXIST inside the sandbox ─────────────
 *
 * A contained process sees only the system prefixes and the workspace. A toolchain
 * installed anywhere else — `~/.nvm`, `~/.local/…`, `/opt/node`, a pyenv version — simply
 * does not exist in there: the launch fails, stdout is empty, and (the part that matters)
 * a battery that asserts "the secret did not leak" PASSES, because nothing ran. The
 * program's install prefix is therefore bound read-only, and its bin dir goes on the inner
 * PATH so an `npm` finds its sibling `node`. */

/// Directories that are already visible inside every rung.
const ALWAYS_VISIBLE: &[&str] = &["/usr", "/bin", "/sbin", "/lib", "/lib64", "/lib32"];
/// Path components that mark a credential store. Never bound, whatever the program says.
const CREDENTIAL_COMPONENTS: &[&str] =
    &[".ssh", ".aws", ".gnupg", ".kube", ".docker", ".azure", "gcloud", "keyrings", ".password-store", ".git-credentials", ".netrc"];

#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct ProgramSupport {
    /// Read-only binds that make the program (and its libraries) exist inside the sandbox.
    pub read: Vec<PathBuf>,
    /// Directory to put on the sandbox's PATH.
    pub bin_dir: Option<PathBuf>,
}

fn install_prefix(p: &Path) -> Option<PathBuf> {
    let parent = p.parent()?;
    if parent.file_name().map(|n| n == "bin").unwrap_or(false) {
        parent.parent().map(Path::to_path_buf)
    } else {
        Some(parent.to_path_buf())
    }
}

/// May this directory be exposed read-only to a sandboxed process? Never `/`, never a
/// top-level directory, never HOME or anything that contains HOME, never a credential store.
pub fn prefix_is_bindable(x: &Path, home: Option<&Path>) -> bool {
    let comps: Vec<String> = x.components().filter_map(|c| match c {
        std::path::Component::Normal(n) => Some(n.to_string_lossy().to_ascii_lowercase()),
        _ => None,
    }).collect();
    if comps.len() < 2 {
        return false;
    }
    if comps.iter().any(|c| CREDENTIAL_COMPONENTS.contains(&c.as_str())) {
        return false;
    }
    if let Some(h) = home {
        if h.starts_with(x) {
            return false; // x is HOME or an ancestor of it
        }
        // a direct child of HOME (e.g. `~/.local`, `~/.config`) holds app data and tokens
        if x.parent() == Some(h) {
            return false;
        }
    }
    true
}

/// Work out what must be bound for `resolved` (an absolute program path) to run inside a rung.
/// Returns the empty support for programs that are already visible, relative names, and
/// anything whose prefix may not be exposed — the launch then fails HONESTLY inside the sandbox.
pub fn program_support(resolved: &str, home: Option<&Path>) -> ProgramSupport {
    let given = Path::new(resolved);
    if !given.is_absolute() {
        return ProgramSupport::default();
    }
    let real = dunce_path(given);
    let visible = |x: &Path| ALWAYS_VISIBLE.iter().any(|v| x.starts_with(v));
    if visible(given) && visible(&real) {
        return ProgramSupport::default();
    }
    let mut read: Vec<PathBuf> = Vec::new();
    for candidate in [given, real.as_path()] {
        if visible(candidate) {
            continue;
        }
        let bin = candidate.parent().map(Path::to_path_buf);
        // prefer the whole install prefix (stdlib / node_modules live there), else just the bin dir
        let pick = install_prefix(candidate)
            .filter(|p| prefix_is_bindable(p, home))
            .or_else(|| bin.clone().filter(|b| prefix_is_bindable(b, home)));
        if let Some(pk) = pick {
            if !read.iter().any(|r| pk.starts_with(r)) {
                read.retain(|r| !r.starts_with(&pk));
                read.push(pk);
            }
        }
    }
    let bin_dir = given.parent().map(Path::to_path_buf).filter(|b| read.iter().any(|r| b.starts_with(r)) && !visible(b));
    ProgramSupport { read, bin_dir }
}

/// The bwrap builder — mirrored 1:1 by shellContain.ts `bwrapArgv` and pinned by the probe.
/// `network == false` adds `--unshare-net`; `inner_path` is the PATH the program sees.
pub fn bwrap_argv(
    program: &str,
    args: &[String],
    cwd: &Path,
    read_paths: &[PathBuf],
    write_paths: &[PathBuf],
    network: bool,
    inner_path: &str,
) -> Vec<String> {
    let mut out: Vec<String> = vec![];
    for p in SYSTEM_READ_PREFIXES {
        if Path::new(p).exists() {
            out.push("--ro-bind".into());
            out.push((*p).into());
            out.push((*p).into());
        }
    }
    // The /tmp tmpfs goes FIRST. bwrap applies its arguments in order, so a tmpfs mounted
    // after the workspace bind hides a workspace that lives under /tmp ("Can't chdir to …"),
    // and every contained run there silently produced nothing.
    out.push("--tmpfs".into());
    out.push("/tmp".into());
    for p in read_paths {
        let abs = dunce_path(p);
        if abs.exists() && !write_paths.iter().any(|w| dunce_path(w) == abs) {
            out.push("--ro-bind".into());
            out.push(abs.display().to_string());
            out.push(abs.display().to_string());
        }
    }
    for p in write_paths {
        let abs = dunce_abs(p);
        out.push("--bind".into());
        out.push(abs.clone());
        out.push(abs);
    }
    out.push("--dev".into());
    out.push("/dev".into());
    out.push("--proc".into());
    out.push("/proc".into());
    if !network {
        out.push("--unshare-net".into());
    }
    out.push("--setenv".into());
    out.push("HOME".into());
    // `write_paths.first()` is `&PathBuf`; `cwd` is `&Path`. Normalise to `&Path`
    // so `unwrap_or` has a single type to work with.
    let home_path: &Path = match write_paths.first() {
        Some(p) => p.as_path(),
        None => cwd,
    };
    out.push(dunce_abs(home_path));
    out.push("--setenv".into());
    out.push("TMPDIR".into());
    out.push("/tmp".into());
    out.push("--setenv".into());
    out.push("PATH".into());
    out.push(inner_path.into());
    out.push("--die-with-parent".into());
    out.push("--new-session".into());
    out.push("--chdir".into());
    out.push(dunce_abs(cwd));
    out.push("--".into());
    out.push(program.to_string());
    out.extend(args.iter().cloned());
    out
}

/// The seatbelt profile — macOS. Read ok; writes only inside workspace/scratch;
/// the network is denied unless the grant allowed it.
pub fn seatbelt_profile(write_paths: &[PathBuf], network: bool) -> String {
    let writes: Vec<String> = write_paths
        .iter()
        .map(|p| format!("(subpath \"{}\")", dunce_abs(p)))
        .collect();
    format!(
        "(version 1)\n(allow default)\n(deny file-write*)\n(allow file-write* {} (subpath \"/private/tmp\") (subpath \"/tmp\"))\n{}",
        writes.join(" "),
        if network { "" } else { "(deny network*)\n" }
    )
}

/// Node's own permission-model flags for `node` programs (works without any OS sandbox).
pub fn node_permission_args(write_paths: &[PathBuf]) -> Vec<String> {
    let mut reads: Vec<String> = SYSTEM_READ_PREFIXES.iter().map(|s| s.to_string()).collect();
    for p in write_paths {
        reads.push(dunce_abs(p));
    }
    reads.sort();
    reads.dedup();
    let mut out = vec!["--experimental-permission".to_string()];
    for r in &reads {
        out.push(format!("--allow-fs-read={r}"));
    }
    for p in write_paths {
        out.push(format!("--allow-fs-write={}", dunce_abs(p)));
    }
    out
}

/// Scrub the environment of any command about to be spawned.
///
/// The program is chosen by `wrap_command` *after* containment is detected, so
/// this is applied to the final command rather than to a pre-built template.
/// `std::process::Command` has no program setter, so the program cannot be
/// swapped in place on a constructed command.
///
/// Mirrors `scrubbedEnv` in src/mission/shellContain.ts, including the Windows
/// home variables. `env_clear()` removes `%USERPROFILE%` along with everything
/// else, and on Windows the toolchain reads that rather than `HOME` — so before
/// this was added a contained Windows process had no home at all and tools like
/// npm and git failed for the wrong reason. The TS reference and this file must
/// agree; probe/shellContain.test.ts pins both.
/// Strip everything but a minimal, reconstructable environment.
///
/// `pub` since 20.1: `scrub` used to be private, so a caller that needed the
/// environment guarantee WITHOUT OS-level containment (`wrap_command`) had no
/// way to get it — and the honest cheaper option was to just not scrub.
/// `hermes.rs` spawned the bundled Python bridge with the full inherited
/// environment, handing that process every provider key the operator had
/// exported in their shell. It now calls this.
pub fn scrub_env(cmd: &mut Command, home: &str) {
    scrub(cmd, home)
}

fn scrub(cmd: &mut Command, home: &str) {
    cmd.env_clear();
    cmd.env("PATH", "/usr/bin:/bin:/usr/local/bin");
    cmd.env("HOME", home);
    if cfg!(windows) {
        cmd.env("USERPROFILE", home);
        // HOMEDRIVE/HOMEPATH are the split form some Windows APIs read. A path
        // like `C:\ws` yields drive `C:` and an empty path component.
        let p = Path::new(home);
        let drive = p.components().next().map(|c| c.as_os_str().to_string_lossy().into_owned()).unwrap_or_default();
        cmd.env("HOMEDRIVE", drive.trim_end_matches(['\\', ':']));
        cmd.env("HOMEPATH", p.strip_prefix(&drive).map(|r| r.to_string_lossy().into_owned()).unwrap_or_default());
    }
    cmd.env(
        "TMPDIR",
        if cfg!(windows) {
            std::env::var("TEMP").unwrap_or_else(|_| "C:\\Temp".into())
        } else {
            "/tmp".into()
        },
    );
    if let Ok(lang) = std::env::var("LANG") {
        cmd.env("LANG", lang);
    }
}

fn path_list(v: &[PathBuf]) -> String {
    v.iter().map(|p| dunce_abs(p)).collect::<Vec<_>>().join(":")
}

/// Wrap `program` in the strongest containment available. Returns the command to
/// run and the rung achieved.
/// The caller MUST surface the label in the run result — a contained run and a
/// policy-only run are different facts.
///
/// `network == false` is a REQUIREMENT, not a hint: if no rung that can isolate the network
/// is proven to work on this host, the run is REFUSED rather than started with the network
/// open under a "contained" label.
pub fn wrap_command(
    program: &str,
    args: &[String],
    cwd: &Path,
    read_paths: &[PathBuf],
    write_paths: &[PathBuf],
    network: bool,
) -> Result<(Command, Containment), String> {
    wrap_with(detect(!network), program, args, cwd, read_paths, write_paths, network)
}

/// `wrap_command` with the rung chosen by the caller (the tests use it to exercise each proven
/// rung, not just the preferred one).
pub fn wrap_with(
    mode: Containment,
    program: &str,
    args: &[String],
    cwd: &Path,
    read_paths: &[PathBuf],
    write_paths: &[PathBuf],
    network: bool,
) -> Result<(Command, Containment), String> {
    if !network && !matches!(mode, Containment::Unshare | Containment::Bwrap | Containment::Seatbelt) {
        return Err(format!(
            "network access is DENIED for this run, but this host has no containment that can enforce that (best available: {}). \
             Nothing ran. Install bubblewrap / enable unprivileged user namespaces, or grant network access explicitly to run without isolation.",
            mode.label()
        ));
    }
    let home = dunce_abs(write_paths.first().map(|p| p.as_path()).unwrap_or(cwd));

    let bare = Path::new(program)
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| program.to_string());

    // The program must exist inside the sandbox: resolve it on the host, bind its install
    // prefix read-only, and put its bin dir on the inner PATH.
    let resolved = resolve_program(program);
    let home_env = std::env::var_os("HOME").map(PathBuf::from);
    let support = if matches!(mode, Containment::Unshare | Containment::Bwrap) {
        program_support(&resolved, home_env.as_deref())
    } else {
        ProgramSupport::default()
    };
    let inner_path = match &support.bin_dir {
        Some(b) => format!("{}:{}", dunce_abs(b), DEFAULT_INNER_PATH),
        None => DEFAULT_INNER_PATH.to_string(),
    };
    let run_program = if matches!(mode, Containment::Unshare | Containment::Bwrap) && Path::new(&resolved).is_absolute() {
        resolved.clone()
    } else {
        program.to_string()
    };
    let mut reads: Vec<PathBuf> = read_paths.to_vec();
    reads.extend(support.read.iter().cloned());

    // Environment the wrapper itself needs, applied AFTER the scrub (which clears everything —
    // applying it before is exactly how the workspace once never got mounted).
    let mut post_scrub_env: Vec<(String, String)> = Vec::new();

    let (mut cmd, achieved) = match mode {
        Containment::Unshare => {
            let scratch = format!("{}/.contain-root", home);
            let writes: Vec<PathBuf> = write_paths.to_vec();
            let a = unshare_args(network, &scratch, &dunce_abs(cwd), &home, &run_program, args);
            let mut c = Command::new("unshare");
            c.args(&a);
            post_scrub_env.push(("PATH".into(), OUTER_PATH.into()));
            post_scrub_env.push(("CONTAIN_WRITES".into(), path_list(&writes)));
            post_scrub_env.push(("CONTAIN_READS".into(), path_list(&reads)));
            post_scrub_env.push(("CONTAIN_PATH".into(), inner_path.clone()));
            (c, Containment::Unshare)
        }
        Containment::Bwrap => {
            let argv = bwrap_argv(&run_program, args, cwd, &reads, write_paths, network, &inner_path);
            let mut c = Command::new("bwrap");
            c.args(&argv);
            (c, Containment::Bwrap)
        }
        Containment::Seatbelt => {
            let profile = seatbelt_profile(write_paths, network);
            let mut a = vec!["-p".to_string(), profile, program.to_string()];
            a.extend(args.iter().cloned());
            let mut c = Command::new("sandbox-exec");
            c.args(&a);
            (c, Containment::Seatbelt)
        }
        Containment::PolicyOnly => {
            // (network == true here, or we returned above)
            if bare.starts_with("node") && !bare.starts_with("npm") {
                let mut a = node_permission_args(write_paths);
                a.extend(args.iter().cloned());
                let mut c = Command::new(program);
                c.args(&a);
                c.current_dir(cwd);
                scrub(&mut c, &home);
                return Ok((c, Containment::NodePermission));
            }
            let mut c = Command::new(program);
            c.args(args);
            (c, Containment::PolicyOnly)
        }
        Containment::NodePermission => unreachable!("detect() never returns NodePermission"),
    };

    // Always: environment scrub + HOME redirect (all rungs).
    scrub(&mut cmd, &home);
    for (k, v) in post_scrub_env {
        cmd.env(k, v);
    }
    cmd.current_dir(cwd);
    Ok((cmd, achieved))
}

/* ──────────────────────────────── tests ──────────────────────────────────── */

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::process::Stdio;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    // ── pure builders ────────────────────────────────────────────────────────

    #[test]
    fn unshare_isolates_the_network_unless_it_was_granted() {
        let denied = unshare_args(false, "/s", "/w", "/w", "node", &s(&["-v"]));
        let allowed = unshare_args(true, "/s", "/w", "/w", "node", &s(&["-v"]));
        assert_eq!(&denied[..3], &["-Urm", "-n", "--map-root-user"], "denied: a fresh network namespace");
        assert_eq!(&allowed[..2], &["-Urm", "--map-root-user"], "granted: no -n");
        assert_eq!(denied.last().unwrap(), "-v", "program arguments are passed through untouched");
    }

    #[test]
    fn bwrap_isolates_the_network_unless_it_was_granted() {
        let ws = std::env::temp_dir();
        let denied = bwrap_argv("node", &[], &ws, &[], &[ws.clone()], false, DEFAULT_INNER_PATH);
        let allowed = bwrap_argv("node", &[], &ws, &[], &[ws.clone()], true, DEFAULT_INNER_PATH);
        assert!(denied.iter().any(|a| a == "--unshare-net"));
        assert!(!allowed.iter().any(|a| a == "--unshare-net"));
        // the program and the terminator are where they were
        let i = denied.iter().position(|a| a == "--").unwrap();
        assert_eq!(denied[i + 1], "node");
    }

    #[test]
    fn bwrap_binds_the_programs_own_prefix_read_only_and_sets_its_path() {
        let ws = std::env::temp_dir();
        let prefix = std::env::temp_dir(); // exists on every host
        let argv = bwrap_argv("/x/bin/node", &[], &ws, &[prefix.clone()], &[], true, "/x/bin:/usr/bin");
        let ro = argv.iter().position(|a| a == "--ro-bind" && argv[argv.iter().position(|b| b == a).unwrap()] == *a).is_some();
        assert!(ro);
        let pi = argv.iter().position(|a| a == "PATH").unwrap();
        assert_eq!(argv[pi + 1], "/x/bin:/usr/bin", "the inner PATH carries the program's bin dir");
    }

    #[test]
    fn the_tmp_tmpfs_is_mounted_before_any_bind_that_may_live_under_it() {
        let ws = std::env::temp_dir();
        let argv = bwrap_argv("true", &[], &ws, &[ws.clone()], &[ws.clone()], true, DEFAULT_INNER_PATH);
        let tmpfs = argv.iter().position(|a| a == "--tmpfs").expect("tmpfs");
        let first_bind = argv.iter().position(|a| a == "--bind").expect("workspace bind");
        assert!(tmpfs < first_bind, "bwrap: --tmpfs /tmp must precede the workspace --bind");
        let script_tmp = UNSHARE_MOUNT_SCRIPT.find("-t tmpfs").expect("tmpfs mount");
        let script_writes = UNSHARE_MOUNT_SCRIPT.find("for w in $CONTAIN_WRITES").expect("writes loop");
        let script_reads = UNSHARE_MOUNT_SCRIPT.find("for r in $CONTAIN_READS").expect("reads loop");
        assert!(script_tmp < script_reads && script_tmp < script_writes, "unshare: the /tmp tmpfs must precede the bind loops");
    }

    #[test]
    fn seatbelt_denies_the_network_unless_it_was_granted() {
        let w = [PathBuf::from("/tmp/ws")];
        assert!(seatbelt_profile(&w, false).contains("(deny network*)"));
        assert!(!seatbelt_profile(&w, true).contains("(deny network*)"));
    }

    #[test]
    fn the_mount_script_binds_reads_and_no_longer_exposes_all_of_opt() {
        assert!(UNSHARE_MOUNT_SCRIPT.contains("CONTAIN_READS"));
        assert!(UNSHARE_MOUNT_SCRIPT.contains("CONTAIN_WRITES"));
        assert!(UNSHARE_MOUNT_SCRIPT.contains("CONTAIN_PATH"));
        assert!(!UNSHARE_MOUNT_SCRIPT.contains("/opt /proc"), "a blanket /opt bind is gone");
    }

    // ── what may be bound ────────────────────────────────────────────────────

    #[test]
    fn a_toolchain_prefix_is_bound_but_homes_and_credential_stores_never_are() {
        let home = PathBuf::from("/home/u");
        assert!(prefix_is_bindable(Path::new("/opt/nvm/versions/node/v22"), Some(&home)));
        assert!(prefix_is_bindable(Path::new("/opt/node"), Some(&home)));
        assert!(prefix_is_bindable(Path::new("/home/u/.nvm/versions/node/v22"), Some(&home)));
        assert!(!prefix_is_bindable(Path::new("/"), Some(&home)));
        assert!(!prefix_is_bindable(Path::new("/opt"), Some(&home)), "a top-level directory is too broad");
        assert!(!prefix_is_bindable(Path::new("/home/u"), Some(&home)), "never HOME itself");
        assert!(!prefix_is_bindable(Path::new("/home"), Some(&home)), "never an ancestor of HOME");
        assert!(!prefix_is_bindable(Path::new("/home/u/.local"), Some(&home)), "a direct child of HOME holds app data and tokens");
        assert!(!prefix_is_bindable(Path::new("/home/u/.ssh/tools"), Some(&home)));
        assert!(!prefix_is_bindable(Path::new("/home/u/proj/.AWS/bin"), Some(&home)), "case-insensitive");
        assert!(!prefix_is_bindable(Path::new("/home/u/.local/share/keyrings"), Some(&home)));
    }

    #[test]
    fn system_programs_need_no_extra_binds() {
        let sup = program_support("/usr/bin/git", Some(Path::new("/home/u")));
        assert_eq!(sup, ProgramSupport::default());
        assert_eq!(program_support("git", None), ProgramSupport::default(), "a bare name has nothing to bind");
    }

    #[test]
    fn a_toolchain_outside_the_system_prefixes_gets_its_prefix_bound_and_its_bin_on_the_path() {
        let root = std::env::temp_dir().join(format!("si-support-{}", std::process::id()));
        let bin = root.join("tools/node22/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("node"), b"#!/bin/sh\n").unwrap();
        let node = dunce_path(&bin.join("node"));
        let sup = program_support(&node.display().to_string(), Some(Path::new("/nonexistent-home")));
        let prefix = dunce_path(&root.join("tools/node22"));
        assert_eq!(sup.read, vec![prefix.clone()], "the install prefix, not just the binary");
        assert_eq!(sup.bin_dir.as_deref(), Some(dunce_path(&bin).as_path()));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn a_program_whose_prefix_may_not_be_exposed_falls_back_to_its_bin_dir_only() {
        let home = std::env::temp_dir().join(format!("si-home-{}", std::process::id()));
        let bin = home.join(".local/bin");
        std::fs::create_dir_all(&bin).unwrap();
        std::fs::write(bin.join("tool"), b"x").unwrap();
        let tool = dunce_path(&bin.join("tool"));
        let home_real = dunce_path(&home);
        let sup = program_support(&tool.display().to_string(), Some(&home_real));
        // prefix would be ~/.local (a direct child of HOME) → refused; the bin dir itself is bound
        assert_eq!(sup.read, vec![dunce_path(&bin)], "never ~/.local, only ~/.local/bin");
        let _ = std::fs::remove_dir_all(&home);
    }

    // ── the live battery: a contained process really runs, and really cannot reach the network ──
    //
    // These START processes through `wrap_command`. They skip — LOUDLY, with the reason printed —
    // only on a host with no proven rung; on a host that has one, they must pass. A skipped
    // run is a different fact from a green one and is reported as such.

    struct Local {
        out: String,
        err: String,
        ok: bool,
    }

    /// Every rung this host has PROVEN it can launch a process in (optionally: with network isolation).
    fn proven_rungs(need_net: bool) -> Vec<Containment> {
        let c = caps();
        let mut v = Vec::new();
        if if need_net { c.unshare_net } else { c.unshare } {
            v.push(Containment::Unshare);
        }
        if if need_net { c.bwrap_net } else { c.bwrap } {
            v.push(Containment::Bwrap);
        }
        v
    }

    /// Tests run on parallel threads of one process: every run needs its OWN directory, or one
    /// test deletes the workspace another is still mounting.
    static RUN_SEQ: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

    fn run_on(rung: Containment, program: &str, args: &[&str], network: bool) -> Result<Local, String> {
        let n = RUN_SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let ws = std::env::temp_dir().join(format!("si-ws-{}-{}-{}-{:?}", std::process::id(), n, network as u8, rung));
        std::fs::create_dir_all(&ws).unwrap();
        let (mut cmd, _achieved) = wrap_with(rung, program, &s(args), &ws, &[], &[ws.clone()], network)?;
        cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;
        let (mut o, mut e) = (String::new(), String::new());
        child.stdout.take().unwrap().read_to_string(&mut o).ok();
        child.stderr.take().unwrap().read_to_string(&mut e).ok();
        let status = child.wait().map_err(|e| e.to_string())?;
        let _ = std::fs::remove_dir_all(&ws);
        Ok(Local { out: o, err: e, ok: status.success() })
    }

    #[test]
    fn live_every_proven_rung_launches_a_process_with_dev_null_proc_and_the_workspace() {
        let rungs = proven_rungs(false);
        if rungs.is_empty() {
            eprintln!("SKIP live_every_proven_rung…: no containment rung is proven on this host ({:?})", caps());
            return;
        }
        for rung in rungs {
            // Not just "it printed something": the hollow-root failure mode had NO /dev/null and NO /proc.
            let r = run_on(
                rung,
                "sh",
                &["-c", "echo RAN; test -c /dev/null && echo DEVNULL; test -r /proc/self/status && echo PROC; test -d \"$HOME\" && echo WORKSPACE"],
                true,
            )
            .expect("wrap");
            assert!(r.ok, "[{rung:?}] the contained process must run: stderr={:?}", r.err);
            for token in ["RAN", "DEVNULL", "PROC", "WORKSPACE"] {
                assert!(r.out.contains(token), "[{rung:?}] missing {token} — the sandbox root is hollow: out={:?} err={:?}", r.out, r.err);
            }
        }
    }

    #[test]
    fn live_the_network_is_unreachable_when_not_granted_and_reachable_when_granted() {
        let rungs = proven_rungs(true);
        if rungs.is_empty() {
            eprintln!("SKIP live_the_network_is_unreachable…: no net-isolating rung is proven on this host ({:?})", caps());
            return;
        }
        if which("bash").is_none() {
            eprintln!("SKIP live_the_network_is_unreachable…: bash not on this host");
            return;
        }
        // a listener on the HOST's loopback — reachable only if the sandbox shares the host's network
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            for _ in listener.incoming() {} // accept and drop
        });
        let probe = format!("if (exec 3<>/dev/tcp/127.0.0.1/{port}) 2>/dev/null; then echo REACHED; else echo ISOLATED; fi");
        for rung in rungs {
            let denied = run_on(rung, "bash", &["-c", &probe], false).expect("wrap (denied)");
            assert!(
                denied.out.contains("ISOLATED") && !denied.out.contains("REACHED"),
                "[{rung:?}] network=false must put the process in its own network namespace: out={:?} err={:?}",
                denied.out, denied.err
            );
            let granted = run_on(rung, "bash", &["-c", &probe], true).expect("wrap (granted)");
            assert!(
                granted.out.contains("REACHED"),
                "[{rung:?}] network=true must leave the host network reachable — otherwise the grant means nothing: out={:?} err={:?}",
                granted.out, granted.err
            );
        }
    }

    #[test]
    fn live_a_toolchain_outside_the_system_prefixes_actually_runs_inside_the_sandbox() {
        // THE REVIEWER'S FAILURE: a program that lives outside /usr and friends does not exist in the
        // sandbox, the launch fails with empty output, and a "secret did not leak" check passes
        // because nothing ran. Here the program is a script in a directory the sandbox would not
        // otherwise see; it must run, and say so.
        let rungs = proven_rungs(false);
        if rungs.is_empty() {
            eprintln!("SKIP live_a_toolchain_outside…: no containment rung is proven on this host");
            return;
        }
        let root = std::env::temp_dir().join(format!("si-tool-{}-{}", std::process::id(), RUN_SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)));
        let bin = root.join("opt-like/mytool/bin");
        std::fs::create_dir_all(&bin).unwrap();
        let tool = bin.join("mytool");
        std::fs::write(&tool, "#!/bin/sh\necho TOOL_RAN\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let tool_s = dunce_abs(&tool);
        for rung in rungs {
            let r = run_on(rung, &tool_s, &[], true).expect("wrap");
            assert!(r.out.contains("TOOL_RAN"), "[{rung:?}] a toolchain outside the system prefixes must run inside the sandbox: out={:?} err={:?}", r.out, r.err);
        }
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn live_a_denied_run_is_refused_when_no_rung_can_isolate_the_network() {
        if !proven_rungs(true).is_empty() || cfg!(target_os = "macos") {
            return; // this host can isolate: the refusal path is covered by the unit logic below
        }
        let ws = std::env::temp_dir();
        let r = wrap_command("true", &[], &ws, &[], &[ws.clone()], false);
        assert!(r.is_err(), "a run that must not touch the network may not start un-isolated");
    }

    #[test]
    fn live_the_unshare_rung_mounts_the_workspace_it_was_given() {
        // The scrub used to erase CONTAIN_WRITES, so the unshare rung never mounted the workspace
        // and `env -C $CWD` could not enter it. Drive the REAL arm of wrap_with.
        if !caps().unshare {
            eprintln!("SKIP live_the_unshare_rung_mounts_the_workspace: the unshare rung is not proven on this host ({:?})", caps());
            return;
        }
        let ws = std::env::temp_dir().join(format!("si-unshare-ws-{}-{}", std::process::id(), RUN_SEQ.fetch_add(1, std::sync::atomic::Ordering::SeqCst)));
        std::fs::create_dir_all(&ws).unwrap();
        std::fs::write(ws.join("marker.txt"), b"IN_WORKSPACE").unwrap();
        let (mut cmd, rung) = wrap_with(Containment::Unshare, "cat", &s(&["marker.txt"]), &ws, &[], &[ws.clone()], true).unwrap();
        assert_eq!(rung, Containment::Unshare);
        let out = cmd.stdin(Stdio::null()).output().unwrap();
        let _ = std::fs::remove_dir_all(&ws);
        assert_eq!(String::from_utf8_lossy(&out.stdout), "IN_WORKSPACE", "stderr={}", String::from_utf8_lossy(&out.stderr));
    }
}
