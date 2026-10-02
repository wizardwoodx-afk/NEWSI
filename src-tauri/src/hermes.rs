use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

pub fn vendor_dir(resource: &Path, cwd: &Path) -> PathBuf {
    let candidates = [
        resource.join("vendor"),
        cwd.join("vendor"),
        cwd.join("../vendor"),
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../vendor"),
    ];
    for c in candidates {
        if c.exists() {
            return c;
        }
    }
    cwd.join("vendor")
}

pub fn call(vendor: &Path, msg: &Value) -> Result<Value, String> {
    // Canonical entry point is the JSON-lines stdio server shipped in evolution-service/.
    // No HTTP. No 127.0.0.1 bind.
    let service = vendor.join("evolution-service");
    let module_entry = service.join("mj_evolution/stdio_server.py");
    let legacy_bridge = vendor.join("mj-bridge/bridge.py");

    let (program, args, cwd): (String, Vec<String>, std::path::PathBuf) = if module_entry.exists() {
        (
            "python3".into(),
            vec!["-m".into(), "mj_evolution.stdio_server".into()],
            service.clone(),
        )
    } else if legacy_bridge.exists() {
        (
            "python3".into(),
            vec![legacy_bridge.display().to_string()],
            vendor.parent().unwrap_or(vendor).to_path_buf(),
        )
    } else {
        return Err(format!(
            "missing evolution service: looked for {} and {}",
            module_entry.display(),
            legacy_bridge.display()
        ));
    };

    // The bridge must not inherit the operator's shell environment.
    //
    // 20.1. `Command` inherits the parent environment by default, and this call
    // is reachable from the WebView (`commands.rs` hermes_ping / hermes_hook /
    // hermes_bridge). Every key the operator had exported — OPENAI_API_KEY,
    // ANTHROPIC_API_KEY, AWS_SECRET_ACCESS_KEY, GITHUB_TOKEN — was readable by
    // this Python process. `contain::wrap_command` was never called here, so
    // `env_clear()` never happened.
    //
    // `scrub_env` rather than `wrap_command` deliberately: this is a bundled,
    // first-party, in-process helper that must keep working on every platform,
    // and OS-level namespacing would change what it can see on disk for no
    // security gain here. The secret leak was the environment, not the mount.
    let mut cmd = Command::new(&program);
    cmd.args(&args)
        .current_dir(&cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let home = crate::contain::dunce_abs(&cwd);
    crate::contain::scrub_env(&mut cmd, &home);
    // Re-added AFTER the scrub, because the scrub clears everything and the
    // interpreter needs to find its own modules.
    cmd.env("PYTHONPATH", &service);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn {program}: {e}"))?;
    {
        let stdin = child.stdin.as_mut().ok_or("stdin")?;
        let mut line = msg.to_string();
        line.push('\n');
        stdin.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
        let _ = stdin.flush();
    }
    // Close stdin so the bridge can exit after one command.
    drop(child.stdin.take());

    // Drain stdout on its own thread, and hold the child to a deadline.
    //
    // 20.1. This used to be a bare `reader.read_line(&mut out)` with no
    // timeout and no kill. A wedged child pinned the Tauri IPC thread forever
    // with no recovery path — and `run_timeout` in commands.rs already had the
    // correct pattern, so the omission was an oversight rather than a choice.
    let stdout = child.stdout.take().ok_or("stdout")?;
    let drain = std::thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut buf = String::new();
        let _ = reader.read_line(&mut buf);
        buf
    });

    let deadline = Instant::now() + Duration::from_secs(30);
    let out = loop {
        if drain.is_finished() {
            break drain.join().unwrap_or_default();
        }
        match child.try_wait() {
            Ok(Some(_)) => {
                // Exited but the pipe may still hold buffered bytes; let the
                // reader finish rather than truncating a valid final line.
                break drain.join().unwrap_or_default();
            }
            Ok(None) => {}
            Err(e) => return Err(format!("bridge wait: {e}")),
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            return Err("bridge timed out after 30s and was killed".into());
        }
        std::thread::sleep(Duration::from_millis(25));
    };
    if out.trim().is_empty() {
        return Err("empty bridge response".into());
    }
    serde_json::from_str(out.trim()).map_err(|e| format!("bridge json: {e} :: {out}"))
}

pub fn ping(vendor: &Path) -> Value {
    match call(vendor, &json!({"cmd": "ping"})) {
        Ok(v) => v,
        Err(e) => json!({"ok": false, "error": e, "transport": "stdio"}),
    }
}

pub fn health(vendor: &Path) -> Value {
    let p = ping(vendor);
    json!({
        "available": p.get("ok").and_then(|x| x.as_bool()).unwrap_or(false),
        "transport": "stdio",
        "service": vendor.join("evolution-service").display().to_string(),
        "bridge": p,
        "hooks": ["on_session_start", "pre_llm_call", "post_llm_call", "on_session_end"],
        "timeoutHintMs": Duration::from_secs(30).as_millis(),
    })
}
