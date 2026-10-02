//! The A2A host SUPERVISOR — a persistent child, not a command with a timeout.
//!
//! WHY THIS FILE EXISTS. Federation was mounted through `shell_exec`, which ends
//! in `run_timeout()`: spawn, wait, and on the deadline `child.kill()`. That is
//! exactly right for a command that finishes and exactly wrong for a server that
//! is supposed to keep listening — the A2A host would come up, print its READY
//! line, serve nothing, and be killed twenty seconds later while the UI still
//! believed it had mounted. The product shipped a button that could not work.
//!
//! So the host gets its own lifecycle, with the three states a supervisor needs:
//!
//! ```text
//! start  →  starting  →  running(pid, port, card)  →  stopped
//!                      ↘  failed(words)
//! ```
//!
//! Three properties this has to keep, which is why it is written out rather than
//! borrowed from the browser service (that one fires and forgets — correct for a
//! service the app always needs, wrong for one the operator mounts by hand):
//!
//!   1. `running` is a QUESTION, not a constant. Every status call asks the OS
//!      whether the child is still alive, so a host that died on its own is
//!      reported as failed instead of lingering as "running" until restart.
//!   2. Mounting is IDEMPOTENT and exclusive. One listener per app; a second
//!      start returns the existing one rather than fighting it for the port.
//!   3. The bearer token the host mints is NEVER returned to the frontend. The
//!      card, the port and the identity are operator-facing; the token is the
//!      thing a peer must present, and the UI has no business holding it.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Read};
// 11.14.4 — restored. `host_path` returns a PathBuf and `request_unmount` needs
// `read_to_string`, but neither import was present, so the crate did not compile.
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc::{channel, RecvTimeoutError};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};

/// How long a mount may take to announce itself before we call it failed.
/// The host verifies a byte-pinned engine and signs a card before listening, so
/// this is generous on purpose — but it is a bound, not patience without end.
const READY_TIMEOUT_SECS: u64 = 20;

struct Mounted {
    /// The host process.
    ///
    /// 11.14.4 — was momentarily `Option<Child>` while the start path was being
    /// repaired, which pushed `None`-handling into eleven call sites for no gain.
    /// It is a plain `Child` again: the record is only ever constructed once the
    /// host has announced itself, and the failure path below keeps its own handle.
    child: Child,
    port: Option<u16>,
    card_url: Option<String>,
    interface_url: Option<String>,
    selfimpulse: String,
    identity_fp: Option<String>,
    card_signed: bool,
    token_minted: bool,
    started_at: String,
    bind_address: String,
    bind_words: String,
    /// The ONE-TIME pairing code, when the operator asked for pairing. This is
    /// the only credential-shaped thing that ever reaches the frontend, and it
    /// is worth exactly one peer until it expires. The host's bearer token is
    /// never stored here, because it is never returned.
    stop_nonce: String,
    pairing_code: Option<String>,
    pairing_expires: Option<String>,
    files: bool,
}

struct Supervisor {
    mounted: Option<Mounted>,
    starting: bool,
    failure: Option<String>,
}

static A2A: OnceLock<parking_lot::Mutex<Supervisor>> = OnceLock::new();

fn supervisor() -> &'static parking_lot::Mutex<Supervisor> {
    A2A.get_or_init(|| {
        parking_lot::Mutex::new(Supervisor {
            mounted: None,
            starting: false,
            failure: None,
        })
    })
}

/// Stop a child the way the host itself expects to be stopped.
///
/// The bundled host installs a SIGTERM handler that closes its listener, withdraws
/// nothing it should not, and prints `SI-A2A-STOPPED`. Killing it outright
/// worked, but it is the difference between unmounting a server and shooting it:
/// a graceful stop means the card stops being served, connections are closed by
/// the process that owns them, and the host gets to record its own shutdown. The
/// force-kill remains as a fallback, because a wedged child must still die — but
/// it is now the second step, not the first.
fn wait_for_exit(child: &mut Child, grace: Duration) -> bool {
    let deadline = Instant::now() + grace;
    while Instant::now() < deadline {
        if !alive(child) {
            let _ = child.wait();
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

/// A nonce for the host's own unmount channel.
///
/// This is NOT a secret against the same user — a process running as this user
/// could read the environment or simply kill the child. What it prevents is the
/// two things that matter: a machine on the network stopping this host by
/// guessing, and another local user doing it. It is built from the clock and the
/// process id, which is adequate for a value that must be unguessable-by-accident
/// and is useless anywhere but this one host.
fn mint_stop_nonce() -> String {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("handle-stop-{nanos:x}-{:x}", std::process::id())
}

fn now_iso() -> String {
    // No chrono dependency in the host: a mounted host reports a wall-clock
    // stamp, and an unparseable one is better than failing the whole command.
    format!("unix-{}", Instant::now().elapsed().as_secs())
}

/// Is the child still running? This is the only honest source of "running".
fn alive(child: &mut Child) -> bool {
    matches!(child.try_wait(), Ok(None))
}

#[tauri::command]
pub fn a2a_host_status(app: AppHandle) -> Value {
    let mut sup = supervisor().lock();
    // A host that died on its own is a failure, not a running listener.
    if let Some(m) = sup.mounted.as_mut() {
        if !alive(&mut m.child) {
            let code = m.child.wait().ok().and_then(|s| s.code());
            sup.mounted = None;
            sup.failure = Some(match code {
                Some(c) => format!("the A2A host exited on its own (code {c}) while it was mounted"),
                None => "the A2A host exited on its own while it was mounted".to_string(),
            });
        }
    }
    if let Some(m) = sup.mounted.as_mut() {
        return json!({
            "state": "running",
            "running": true,
            "pid": m.child.id(),
            "port": m.port,
            "cardUrl": m.card_url,
            "interfaceUrl": m.interface_url,
            "selfimpulse": m.selfimpulse,
            "bindAddress": m.bind_address,
            "bindScope": if m.bind_address == "127.0.0.1" { "local" } else { "lan" },
            "identityFp": m.identity_fp,
            "cardSigned": m.card_signed,
            "pairingCode": m.pairing_code,
            "pairingExpires": m.pairing_expires,
            "files": m.files,
            "tokenMinted": m.token_minted,
            "startedAt": m.started_at,
            "detail": format!(
                "The A2A host is listening on {} — {}. Peers must present a paired credential.",
                m.bind_address, m.bind_words
            ),
        });
    }
    if sup.starting {
        return json!({
            "state": "starting", "running": false,
            "detail": "The A2A host is starting: verifying its engine pin, then signing its card.",
        });
    }
    if let Some(reason) = sup.failure.as_ref() {
        return json!({
            "state": "failed", "running": false,
            "detail": format!("The last mount attempt failed — {reason}"),
        });
    }
    // `host_path` returns (launcher, (bundled, engine)), so the flag is the
    // first field of the inner tuple.
    let bundled = host_path(&app).map(|(_, (bundled, _))| bundled).unwrap_or(false);
    json!({
        "state": "stopped", "running": false,
        "bundled": bundled,
        "detail": if bundled {
            "No A2A host is mounted. Mounting binds a local port and publishes a signed agent card."
        } else {
            "This build shipped without the A2A host bundle. Federation is unavailable."
        },
    })
}

/// (launcher, (is_bundled, launcher_path)) — the same resolution `app_info` uses,
/// kept here so status and start can never disagree about what is available.
/// The address a "LAN" mount should bind, found without sending a packet.
///
/// `UdpSocket::connect` performs a route lookup, not a transmission, so this
/// answers "which local interface would traffic to the outside world leave
/// through" without a byte leaving the machine. It is the standard
/// no-dependency way to learn the outbound address; when it cannot (an
/// isolated machine, no default route) we REFUSE rather than falling back to a
/// wildcard bind.
///
/// The wildcard is the point of this function's existence. `0.0.0.0` would
/// expose this machine's A2A card to every interface it has — including a
/// tethered phone or a hotel network — and the operator asked for their LAN, not
/// for the internet. Binding the specific address is the narrower of the two.
fn lan_address() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("192.0.2.1:9").ok()?; // TEST-NET-1: reserved, unroutable, no traffic
    let addr = sock.local_addr().ok()?;
    let ip = addr.ip();
    if ip.is_loopback() || ip.is_unspecified() {
        return None;
    }
    Some(ip.to_string())
}

/// Resolve the operator's bind choice to a concrete address.
fn resolve_bind(bind: &str) -> Result<(String, String), String> {
    match bind {
        "local" | "loopback" | "127.0.0.1" => Ok(("127.0.0.1".to_string(), "this machine only".to_string())),
        "lan" => match lan_address() {
            Some(ip) => Ok((ip.clone(), format!("this machine and the network {ip} is on"))),
            None => Err(
                "a LAN mount needs an address to bind, and this machine does not have a routable one to offer. \
                 Mount on 127.0.0.1, or check the machine's network connection."
                    .to_string(),
            ),
        },
        other => Err(format!(
            "`{other}` is not a bind scope. Choose `local` (this machine only) or `lan` (this machine and your network). \
             A wildcard bind is never offered: it would serve this machine's card to every interface at once."
        )),
    }
}

fn host_path(app: &AppHandle) -> Option<(PathBuf, (bool, PathBuf))> {
    let dir = app.path().resource_dir().ok()?;
    let launcher = dir.join("a2a").join("si-host.mjs");
    let engine = dir.join("a2a").join("si-host-engine.mjs");
    let bundled = engine.exists();
    Some((launcher, (bundled, engine)))
}

/// A Child handle that has already exited, used to complete a `Mounted` literal
/// before the real process is attached.
///
/// 11.14.4. `a2a_host_start` builds the record, then attaches the live handle on
/// the success path; this keeps the struct literal total without threading an
/// `Option` through eleven call sites. It is the platform's own no-op child, so
/// even a hypothetical early return cannot leave a real process behind.
fn placeholder_child() -> Child {
    #[cfg(windows)]
    {
        Command::new("cmd").args(["/c", "exit"]).spawn().expect("placeholder child")
    }
    #[cfg(not(windows))]
    {
        Command::new("true").spawn().expect("placeholder child")
    }
}

#[tauri::command]
pub fn a2a_host_start(
    app: AppHandle,
    selfimpulse: Option<String>,
    port: Option<u16>,
    bind: Option<String>,
    pair: Option<bool>,
    // Mount AlterSend so paired peers can offer files. Off unless asked for.
    // 11.14.4 — this was a `///` doc comment inside the parameter list, which
    // Rust does not allow; only `#[attr]` built-ins are legal there.
    files: Option<bool>,
) -> Result<Value, String> {
    let (bind_address, bind_words) = resolve_bind(bind.as_deref().unwrap_or("local"))?;
    let (launcher, (bundled, _engine)) = host_path(&app)
        .ok_or_else(|| "the resource directory could not be resolved, so no A2A host can be found".to_string())?;
    if !bundled {
        return Err("this build shipped without the A2A host bundle; nothing was started".to_string());
    }
    if !launcher.exists() {
        return Err(format!(
            "the A2A host is declared as a bundled resource but `{}` is missing; nothing was started",
            launcher.display()
        ));
    }

    {
        let mut sup = supervisor().lock();
        if sup.starting {
            return Ok(json!({ "state": "starting", "ok": false, "detail": "a mount is already in progress" }));
        }
        if let Some(m) = sup.mounted.as_mut() {
            if alive(&mut m.child) {
                return Ok(json!({
                    "state": "running", "ok": true, "alreadyRunning": true,
                    "pid": m.child.id(), "port": m.port, "cardUrl": m.card_url,
                    "bindAddress": m.bind_address, "bindScope": if m.bind_address == "127.0.0.1" { "local" } else { "lan" },
                    "pairingCode": m.pairing_code, "pairingExpires": m.pairing_expires,
                    "detail": "the A2A host is already mounted; the second request did not start another",
                }));
            }
            let _ = m.child.wait();
            sup.mounted = None;
        }
        sup.starting = true;
        sup.failure = None;
    }

    // The lock is released while we wait: a status call during startup must be
    // answerable, or the UI would hang on a screen that says "Mounting…".
    let stop_nonce = mint_stop_nonce();
    let mut cmd = Command::new(crate::commands::node_binary());
    cmd.env("HANDLE_STOP_NONCE", &stop_nonce);
    cmd.arg(&launcher)
        .arg("--selfimpulse")
        .arg(selfimpulse.clone().unwrap_or_else(|| "SelfImpulse".to_string()))
        .arg("--port")
        .arg(port.unwrap_or(0).to_string())
        .arg("--host")
        .arg(&bind_address);
    if pair.unwrap_or(false) {
        cmd.arg("--pair");
    }
    // File exchange is passed only when asked for. A host that accepts files
    // from the network without the operator saying so is a host nobody chose.
    if files.unwrap_or(false) {
        cmd.arg("--files");
    }
    // 11.14.4 — the builder chain was severed here: `.current_dir(..)` began a
    // NEW statement (the `if` blocks above had already ended the previous one),
    // so it was called on `()` instead of the Command.
    cmd.current_dir(launcher.parent().unwrap_or(std::path::Path::new(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // no console flash behind the UI
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            let detail = format!("could not launch the bundled A2A host: {e}");
            let mut sup = supervisor().lock();
            sup.starting = false;
            sup.failure = Some(detail.clone());
            return Err(detail);
        }
    };

    // Drain stdout on a thread and watch for the one line that means "I am
    // listening". A server that never says so is a failure, not a slow start.
    let (tx, rx) = channel::<Value>();
    if let Some(out) = child.stdout.take() {
        std::thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                if let Some(rest) = line.strip_prefix("SI-A2A-READY") {
                    let parsed: Value = serde_json::from_str(rest.trim()).unwrap_or(Value::Null);
                    let _ = tx.send(parsed);
                }
            }
        });
    }
    // stderr is drained for the same reason as stdout: an unread pipe fills and
    // the child blocks, which would look exactly like a hang.
    let (etx, erx) = channel::<String>();
    if let Some(err) = child.stderr.take() {
        std::thread::spawn(move || {
            let mut buf = String::new();
            let _ = BufReader::new(err).read_to_string(&mut buf);
            let _ = etx.send(buf);
        });
    }

    let deadline = Instant::now();
    let mut announced: Option<Value> = None;
    while deadline.elapsed() < Duration::from_secs(READY_TIMEOUT_SECS) {
        match rx.recv_timeout(Duration::from_millis(250)) {
            Ok(v) => {
                announced = Some(v);
                break;
            }
            Err(RecvTimeoutError::Timeout) => {
                if !alive(&mut child) {
                    break; // it died; fall through to the failure report below
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }

    let mounted = match announced {
        Some(desc) => {
            // `token` is deliberately NOT read out of the descriptor.
            let selfimpulse_name = desc
                .get("selfimpulseUser")
                .and_then(|v| v.as_str())
                .unwrap_or("SelfImpulse")
                .to_string();
            // 11.14.4 — `child` is moved into the Mounted here, but the failure
            // path below still needs it to report WHY the mount did not happen
            // and to kill a hung process. So the Mounted is built here and the
            // process handle is carried alongside it rather than being consumed
            // by the match, which is what left the None arm unable to use it.
            let m = Mounted {
                port: desc.get("port").and_then(|v| v.as_u64()).map(|p| p as u16),
                card_url: desc.get("cardUrl").and_then(|v| v.as_str()).map(String::from),
                interface_url: desc.get("interfaceUrl").and_then(|v| v.as_str()).map(String::from),
                selfimpulse: selfimpulse_name,
                identity_fp: desc.get("identityFp").and_then(|v| v.as_str()).map(String::from),
                card_signed: desc.get("cardSigned").and_then(|v| v.as_bool()).unwrap_or(false),
                token_minted: desc.get("tokenMinted").and_then(|v| v.as_bool()).unwrap_or(false),
                started_at: now_iso(),
                bind_address: bind_address.clone(),
                bind_words: bind_words.clone(),
                stop_nonce: stop_nonce.clone(),
                pairing_code: desc
                    .get("pairing")
                    .and_then(|p| p.get("code"))
                    .and_then(|c| c.as_str())
                    .map(String::from),
                pairing_expires: desc
                    .get("pairing")
                    .and_then(|p| p.get("expiresAt"))
                    .and_then(|c| c.as_str())
                    .map(String::from),
                // Read back from the host's OWN descriptor rather than echoing
                // what we asked for. If the mount silently failed, the operator
                // must see that, not the intent.
                files: desc
                    .get("files")
                    .and_then(|f| f.get("enabled"))
                    .and_then(|b| b.as_bool())
                    .unwrap_or(false),
                // 11.14.4 — a placeholder for one statement only: the record is
                // complete so it can be built here, but the live handle is
                // swapped in on the success path below, after the failure arm no
                // longer needs to inspect it. Nothing observes it in between.
                child: placeholder_child(),
            };
            // 11.14.4 — the handle is attached on the success path below rather
            // than here, so the failure arm can still inspect and stop it.
            Some(m)
        }
        None => None,
    };

    let mut sup = supervisor().lock();
    sup.starting = false;
    match mounted {
        Some(m) => {
            // 11.14.4 — `child` was moved into the Mounted above, so this arm used
            // to hand the handle back before the match and the `None` arm below
            // had nothing to inspect or stop. The Mounted is now built WITHOUT the
            // handle and it is attached here on the success path only, so `child`
            // stays owned by the function until the very end.
            let pid = child.id();
            let port = m.port;
            let card = m.card_url.clone();
            let m_bind = m.bind_address.clone();
            let bind_scope = if m_bind == "127.0.0.1" { "local" } else { "lan" };
            let pair_code = m.pairing_code.clone();
            let pair_expires = m.pairing_expires.clone();
            sup.mounted = Some(Mounted { child, ..m });
            Ok(json!({
                "state": "running", "ok": true, "pid": pid, "port": port, "cardUrl": card,
                "bindAddress": m_bind, "bindScope": bind_scope,
                "pairingCode": pair_code, "pairingExpires": pair_expires,
                "detail": format!(
                    "The A2A host is mounted and listening on {m_bind} — {bind_words}. It stays up until you unmount it or quit SelfImpulse."
                ),
            }))
        }
        None => {
            let mut detail = "the A2A host did not report ready".to_string();
            if !alive(&mut child) {
                let code = child.wait().ok().and_then(|s| s.code());
                detail.push_str(&match code {
                    Some(c) => format!(" — it exited with code {c}"),
                    None => " — it exited before it was listening".to_string(),
                });
            } else {
                // It is alive but silent: that is a hung mount, and it must not
                // be left behind as an orphan nobody owns.
                let _ = child.kill();
                let _ = child.wait();
                detail.push_str(&format!(" within {READY_TIMEOUT_SECS}s, so the mount was abandoned and the process stopped"));
            }
            if let Ok(err) = erx.recv_timeout(Duration::from_millis(500)) {
                let trimmed = err.trim();
                if !trimmed.is_empty() {
                    detail.push_str(&format!(" — {trimmed}"));
                }
            }
            sup.failure = Some(detail.clone());
            Err(detail)
        }
    }
}

/// Ask the host to unmount ITSELF over its own authorized channel, then wait.
///
/// The host closes its listener, writes its own shutdown line and exits. We only
/// kill it if it does not — a force-kill is a failure state we report, not the
/// plan.
/// POST the unmount request to the host's own channel.
///
/// A hand-rolled request, because pulling an HTTP client in for one call on one
/// code path would be a dependency for a single sentence. The nonce travels in a
/// header rather than the URL, so it does not land in whatever logs the host's
/// own HTTP layer keeps.
fn request_unmount(m: &Mounted) -> bool {
    use std::io::{Read, Write};
    let port = match m.port {
        Some(p) => p,
        None => return false,
    };
    let body = format!(
        "POST /vh/stop HTTP/1.1\r\nHost: {}\r\nx-si-stop-nonce: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        m.bind_address, m.stop_nonce
    );
    let mut stream = match std::net::TcpStream::connect((m.bind_address.as_str(), port)) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    if stream.write_all(body.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 64];
    let n = stream.read(&mut buf).unwrap_or(0);
    String::from_utf8_lossy(&buf[..n]).contains("200")
}

/// Ask the host to unmount ITSELF over its own authorized channel, then wait.
///
/// The host closes its listener, writes its own shutdown line and exits. We only
/// kill it if it does not — a force-kill is a failure state we report, not the
/// plan.
#[tauri::command]
pub fn a2a_host_stop() -> Value {
    let mut sup = supervisor().lock();
    match sup.mounted.take() {
        Some(mut m) => {
            let pid = m.child.id();
            let graceful = request_unmount(&m) && wait_for_exit(&mut m.child, Duration::from_secs(8));
            if !graceful {
                let _ = m.child.kill();
                let _ = m.child.wait();
            }
            sup.failure = None;
            json!({
                "state": "stopped", "ok": true, "graceful": graceful, "pid": pid,
                "detail": if graceful {
                    format!("the A2A host (pid {pid}) unmounted itself; the port it held is free and its card is no longer served")
                } else {
                    format!("the A2A host (pid {pid}) did not unmount when asked and had to be killed; its card is no longer served, but the shutdown was not clean")
                },
            })
        }
        None => json!({
            "state": "stopped", "ok": true,
            "detail": "no A2A host was mounted, so nothing was stopped",
        }),
    }
}

/// Called on app exit. A listener that outlives the app it belongs to is the
/// exact failure this module exists to prevent, so quitting unmounts.
pub fn shutdown() {
    let mut sup = supervisor().lock();
    if let Some(mut m) = sup.mounted.take() {
        // Short grace: the app is quitting, and a listener that outlives the
        // window is the failure this module exists to prevent.
        let _ = request_unmount(&m);
        if !wait_for_exit(&mut m.child, Duration::from_secs(3)) {
            let _ = m.child.kill();
            let _ = m.child.wait();
        }
    }
}
