use crate::{contain, control_mcp, db, grants, hermes, mcp, secrets::SecretStore};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

pub struct AppState {
    pub db: Mutex<rusqlite::Connection>,
    pub db_path: PathBuf,
    pub data_dir: PathBuf,
    pub vendor_dir: PathBuf,
    pub secrets: SecretStore,
    /// Scoped, expiring, human-minted execution grants (in memory only — see grants.rs).
    pub grants: grants::ExecGrants,
    /// One native confirmation at a time, with a fail-closed lockout after repeated declines.
    pub prompts: grants::DialogThrottle,
}

fn lock_db(state: &AppState) -> Result<parking_lot::MutexGuard<'_, rusqlite::Connection>, String> {
    Ok(state.db.lock())
}

/// ONE native confirmation, throttled. Ok(true) only when the human pressed the confirm
/// button; Ok(false) when they cancelled or closed it; Err only when the throttle refused to
/// show a prompt at all (another is open, or too many were declined recently). Every dialog
/// that authorizes something goes through here, so a hostile page can neither stack prompts
/// nor machine-gun them until one is clicked by reflex.
fn native_confirm(app: &AppHandle, state: &AppState, title: &str, body: String, ok_label: &str) -> Result<bool, String> {
    let ticket = state.prompts.begin(grants::unix_now())?;
    let confirmed = app
        .dialog()
        .message(body)
        .title(title)
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancelCustom(ok_label.to_string(), "Cancel".to_string()))
        .blocking_show();
    ticket.finish(confirmed, grants::unix_now());
    Ok(confirmed)
}

#[tauri::command]
pub fn app_info(app: AppHandle, state: State<Arc<AppState>>) -> Value {
    json!({
        "version": env!("CARGO_PKG_VERSION"),
        "platform": std::env::consts::OS,
        "workspaceRoot": state.data_dir,
        "artifactsDir": state.data_dir.join("artifacts"),
        "dbHealthy": true,
        "controlMcpPort": 0,
        "controlMcpTransport": "stdio",
        "controlMcpRunning": true,
        "host": "tauri",
        "desktopNative": true,
        "vendors": ["mcp-servers-reference", "mcp-github"],
        "resourceDir": app.path().resource_dir().ok().map(|p| p.display().to_string()),
        // The A2A host ships INSIDE the app bundle. Before this, the desktop
        // build advertised agent-to-agent federation but bundled no host to
        // federate with, so the feature was dead on arrival in the shipped
        // artifact. tools/si-host.mjs + its byte-pinned engine are declared in
        // bundle.resources, and this key is how the app finds them.
        "a2aHostPath": app.path().resource_dir().ok()
            .map(|p| p.join("a2a").join("si-host.mjs").display().to_string()),
        "a2aHostBundled": app.path().resource_dir().ok()
            .map(|p| p.join("a2a").join("si-host-engine.mjs").exists())
            .unwrap_or(false),
    })
}

#[tauri::command]
pub fn db_maintenance(state: State<Arc<AppState>>, vacuum: bool) -> Result<Value, String> {
    if vacuum {
        lock_db(&state)?.execute_batch("VACUUM;").map_err(|e| e.to_string())?;
    }
    Ok(json!({ "vacuumed": vacuum, "sizeBytes": db::db_size(&state.db_path) }))
}

#[tauri::command]
pub fn workflow_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::workflow_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_get(state: State<Arc<AppState>>, workflow_id: String) -> Result<Value, String> {
    db::workflow_get(&*lock_db(&state)?, &workflow_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_create(state: State<Arc<AppState>>, name: String, description: String) -> Result<Value, String> {
    db::workflow_create(&*lock_db(&state)?, &name, &description).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_delete(state: State<Arc<AppState>>, workflow_id: String) -> Result<(), String> {
    db::workflow_delete(&*lock_db(&state)?, &workflow_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn workflow_save(state: State<Arc<AppState>>, workflow_id: String, name: String, description: String, graph: Value) -> Result<(), String> {
    db::workflow_save(&*lock_db(&state)?, &workflow_id, &name, &description, &graph).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workflow_version_create(state: State<Arc<AppState>>, workflow_id: String, label: String) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    let wf = db::workflow_get(&conn, &workflow_id).map_err(|e| e.to_string())?;
    // V7 fix (bug S): the version number was hardcoded to 1, so the fifth save was still
    // "version 1" and the history could not be ordered or reasoned about.
    let next: i64 = conn
        .query_row("SELECT COALESCE(MAX(version), 0) + 1 FROM versions WHERE workflow_id=?1", [&workflow_id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    // V7 fix (bug S): this returned the literal string "ver" as the id, so the caller could never
    // reference the row it had just created.
    let id = format!("ver-{}", uuid::Uuid::new_v4().simple());
    conn.execute(
        "INSERT INTO versions (id, workflow_id, version, label, graph_json, created_at) VALUES (?1,?2,?3,?4,?5,?6)",
        rusqlite::params![id, workflow_id, next, label, wf["graph"].to_string(), chrono::Utc::now().to_rfc3339()],
    ).map_err(|e| e.to_string())?;
    Ok(json!({ "id": id, "version": next, "label": label }))
}
#[tauri::command]
pub fn workflow_versions(state: State<Arc<AppState>>, workflow_id: String) -> Result<Value, String> {
    // V7 fix (bug R): this returned a hardcoded empty array even though the `versions` table exists
    // and workflow_version_create writes to it, so the UI always showed "no versions yet".
    let conn = lock_db(&state)?;
    let mut st = conn
        .prepare("SELECT id, version, label, created_at FROM versions WHERE workflow_id=?1 ORDER BY version DESC, created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = st
        .query_map([&workflow_id], |r| {
            Ok(json!({
                "id": r.get::<_, String>(0)?,
                "workflowId": workflow_id,
                "version": r.get::<_, i64>(1)?,
                "label": r.get::<_, String>(2)?,
                "createdAt": r.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    let mut out: Vec<Value> = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| e.to_string())?);
    }
    Ok(Value::Array(out))
}
#[tauri::command]
pub fn workflow_version_restore(state: State<Arc<AppState>>, version_record_id: String) -> Result<Value, String> {
    // V7 fix (bug R): this returned Ok(()) for ANY id, so the UI confirmed a restore that never
    // happened while the user's graph stayed unchanged — the worst kind of silent failure.
    let conn = lock_db(&state)?;
    let row: Option<(String, String, i64)> = conn
        .query_row(
            "SELECT workflow_id, graph_json, version FROM versions WHERE id=?1",
            [&version_record_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let Some((workflow_id, graph_json, version)) = row else {
        return Err(format!("No version record '{version_record_id}' exists, so nothing was restored."));
    };
    let graph: Value = serde_json::from_str(&graph_json).map_err(|e| format!("Stored graph for version {version} is corrupt: {e}"))?;
    let wf = db::workflow_get(&conn, &workflow_id).map_err(|e| e.to_string())?;
    let name = wf["name"].as_str().unwrap_or("").to_string();
    let description = wf["description"].as_str().unwrap_or("").to_string();
    db::workflow_save(&conn, &workflow_id, &name, &description, &graph).map_err(|e| e.to_string())?;
    Ok(json!({ "workflowId": workflow_id, "restoredVersion": version }))
}

#[tauri::command]
pub fn node_state_load(state: State<Arc<AppState>>, node_key: String) -> Result<Value, String> {
    let conn = lock_db(&state)?;
    let row: Option<String> = conn.query_row("SELECT payload_json FROM node_state WHERE node_key=?1", [&node_key], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    Ok(row.and_then(|s| serde_json::from_str(&s).ok()).unwrap_or(json!({})))
}
#[tauri::command]
pub fn node_state_save(state: State<Arc<AppState>>, node_key: String, role_prompt: Option<Value>) -> Result<(), String> {
    let conn = lock_db(&state)?;
    conn.execute(
        "INSERT INTO node_state (node_key, payload_json) VALUES (?1,?2) ON CONFLICT(node_key) DO UPDATE SET payload_json=excluded.payload_json",
        rusqlite::params![node_key, json!({"rolePrompt": role_prompt}).to_string()],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn memory_add(state: State<Arc<AppState>>, node_key: String, kind: String, content: String, tags: Vec<String>, importance: f64, _execution_id: Option<String>) -> Result<Value, String> {
    db::memory_add(&*lock_db(&state)?, &node_key, &kind, &content, &json!(tags), importance).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn memory_search(state: State<Arc<AppState>>, node_key: String, query: String, limit: Option<i64>, _kinds: Option<Value>) -> Result<Value, String> {
    db::memory_search(&*lock_db(&state)?, &node_key, &query, limit.unwrap_or(12)).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn memory_delete(state: State<Arc<AppState>>, memory_id: String) -> Result<(), String> {
    lock_db(&state)?.execute("DELETE FROM memories WHERE id=?1", [&memory_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn skills_list(state: State<Arc<AppState>>, node_key: String) -> Result<Value, String> {
    db::skills_list(&*lock_db(&state)?, &node_key).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn skill_touch(state: State<Arc<AppState>>, skill_ids: Vec<String>) -> Result<Value, String> {
    // V11 (W6): real usage tracking. The count returned is what actually updated — stale ids
    // report themselves instead of pretending to count.
    db::skill_touch(&*lock_db(&state)?, &skill_ids).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn skill_deactivate(state: State<Arc<AppState>>, skill_id: String) -> Result<(), String> {
    lock_db(&state)?.execute("UPDATE skills SET active=0 WHERE id=?1", [&skill_id]).map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
#[allow(clippy::too_many_arguments)] // Tauri commands take named args; 8 fields is the UI contract.
pub fn skill_upsert(state: State<Arc<AppState>>, node_key: String, skill_id: Option<String>, name: String, description: String, procedure: String, origin: String, _score: Option<f64>) -> Result<Value, String> {
    let _ = skill_id;
    db::skill_upsert(&*lock_db(&state)?, &node_key, &name, &description, &procedure, &origin).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn feedback_add(state: State<Arc<AppState>>, execution_id: String, node_key: String, rating: i64, comment: String) -> Result<Value, String> {
    db::feedback_add(&*lock_db(&state)?, &execution_id, &node_key, rating, &comment).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn feedback_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::feedback_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn evaluation_save(state: State<Arc<AppState>>, node_key: String, execution_id: Option<String>, suite: Value, score: f64, details: Value) -> Result<Value, String> {
    // V11 (W6): persisted for real, with the stored id returned.
    db::evaluation_save(&*lock_db(&state)?, &node_key, execution_id.as_deref(), &suite, score, &details)
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn evaluation_history(state: State<Arc<AppState>>, node_key: String) -> Result<Value, String> {
    // V11 (W6): an empty array finally means "never evaluated".
    db::evaluation_history(&*lock_db(&state)?, &node_key).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn suite_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    // V11 (W6): real suites from the real table.
    db::suite_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn suite_save(state: State<Arc<AppState>>, suite_id: Option<String>, name: String, cases: Value) -> Result<Value, String> {
    // V11 (W6): upsert into the suites table; the returned id is the stored id.
    db::suite_save(&*lock_db(&state)?, suite_id.as_deref(), &name, &cases).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn evolution_propose_save(state: State<Arc<AppState>>, cand: Value) -> Result<Value, String> {
    db::evolution_propose(&*lock_db(&state)?, &cand).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn evolution_list(state: State<Arc<AppState>>, node_key: Option<String>) -> Result<Value, String> {
    db::evolution_list(&*lock_db(&state)?, node_key.as_deref()).map_err(|e| e.to_string())
}
pub fn evolution_decide(state: State<Arc<AppState>>, candidate_id: String, decision: String) -> Result<Value, String> {
    db::evolution_decide(&*lock_db(&state)?, &candidate_id, &decision)
}
pub fn evolution_rollback(state: State<Arc<AppState>>, candidate_id: String, _restore_role_prompt: Option<Value>) -> Result<Value, String> {
    // C-2: ROLLED_BACK is only reachable from DECIDED, exactly once, and a
    // missing candidate is an error — not a silent UPDATE over any row.
    let conn = lock_db(&state)?;
    let changed = conn
        .execute("UPDATE evolution SET status='ROLLED_BACK' WHERE id=?1 AND status='DECIDED'", [&candidate_id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        let existing: Option<String> = conn
            .query_row("SELECT status FROM evolution WHERE id=?1", [&candidate_id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        return Err(match existing {
            Some(st) => format!("evolution candidate {candidate_id} is not DECIDED (current status {st}) — it can only be rolled back once, from DECIDED."),
            None => format!("evolution candidate {candidate_id} does not exist — nothing was changed."),
        });
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub fn approval_request(state: State<Arc<AppState>>, execution_id: String, node_key: String, summary: String, payload: Value, requested_by: Option<String>) -> Result<Value, String> {
    // C-2 (archive 4): the requester is bound at request time; absent a name,
    // the execution run itself is the honest requester of record.
    let requester = requested_by
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| format!("execution:{execution_id}"));
    db::approval_request(&*lock_db(&state)?, &execution_id, &node_key, &summary, &payload, &requester).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn approval_get(state: State<Arc<AppState>>, execution_id: String, node_key: String) -> Result<Value, String> {
    db::approval_get(&*lock_db(&state)?, &execution_id, &node_key).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn approval_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::approval_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
/// C-2 (archive 4) — mint the native approval capability.
///
/// The ONLY path that can produce a capability: a blocking OS dialog (native
/// window — WebView scripts cannot answer it, cannot fake a click, and never
/// see the result unless this invoke resolves). The human reads who asked,
/// what is being asked, and which verdict the capability will carry; only an
/// explicit confirm mints it. Cancel declines and mints nothing.
///
/// Freshness is short by design (5 minutes): the capability exists to bind a
/// decision made *now*, not to be a bearer token for later.
pub fn approval_authorize(app: tauri::AppHandle, state: State<Arc<AppState>>, approval_id: String, decision: String) -> Result<Value, String> {
    if decision != "APPROVED" && decision != "REJECTED" {
        return Err(format!("approval_authorize: decision must be APPROVED or REJECTED (got {decision:?})"));
    }
    let (status, summary, requested_by, authority) = {
        let conn = lock_db(&state)?;
        match db::approval_open_info(&conn, &approval_id).map_err(|e| e.to_string())? {
            None => return Err(format!("approval {approval_id} does not exist — nothing to authorize.")),
            Some(info) => info,
        }
    };
    if status != "OPEN" {
        return Err(format!(
            "approval {approval_id} is not OPEN (current status {status}) — nothing to authorize; a decision already happened."
        ));
    }
    let verdict_word = if decision == "APPROVED" { "APPROVE this" } else { "REFUSE this" };
    let ok_label = if decision == "APPROVED" { "Approve" } else { "Refuse" };
    let confirmed = native_confirm(
        &app,
        &state,
        "SelfImpulse — human approval gate",
        format!(
            "{summary}\n\nRequester: {requested_by}\nRequired authority: {authority}\nVerdict if you confirm: {decision}\n\n{verdict_word}? Cancel mints nothing and decides nothing."
        ),
        ok_label,
    )?;
    if !confirmed {
        return Err(format!(
            "approval {approval_id}: declined at the native dialog — no capability was minted and no decision was recorded."
        ));
    }
    let ttl = 300; // seconds — the decision it binds should land immediately after the dialog
    db::approval_mint_capability(&*lock_db(&state)?, &approval_id, &decision, ttl)
}
pub fn approval_decide(state: State<Arc<AppState>>, approval_id: String, decision: String, capability: String) -> Result<(), String> {
    // C-2, archive 4: the state machine AND the actor both live in
    // db::approval_decide — capability ownership, freshness and verdict scope
    // are proven before the atomic OPEN→decided transition, and the guard
    // layer (guard::approval_decide) authorizes the call before it reaches here.
    db::approval_decide(&*lock_db(&state)?, &approval_id, &decision, &capability)
}

#[tauri::command]
pub fn execution_create(state: State<Arc<AppState>>, workflow_id: String, workflow_version: i64) -> Result<Value, String> {
    db::execution_create(&*lock_db(&state)?, &workflow_id, workflow_version).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn execution_finish(state: State<Arc<AppState>>, execution_id: String, status: String, error: Option<String>, stats: Value) -> Result<(), String> {
    db::execution_finish(&*lock_db(&state)?, &execution_id, &status, error.as_deref(), &stats).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn event_emit(app: AppHandle, state: State<Arc<AppState>>, execution_id: String, kind: String, level: String, node_id: Option<String>, data: Value) -> Result<Value, String> {
    let rec = db::event_emit(&*lock_db(&state)?, &execution_id, &kind, &level, node_id.as_deref(), &data).map_err(|e| e.to_string())?;
    let _ = app.emit("vh://event", rec.clone()); // 19.5.1: VH namespace (was mj://event — no internal listeners depended on the old name)
    Ok(rec)
}
#[tauri::command]
pub fn execution_events(state: State<Arc<AppState>>, execution_id: String) -> Result<Value, String> {
    db::execution_events(&*lock_db(&state)?, &execution_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn execution_trace(state: State<Arc<AppState>>, execution_id: String) -> Result<Value, String> {
    let events = db::execution_events(&*lock_db(&state)?, &execution_id).map_err(|e| e.to_string())?;
    Ok(json!({ "events": events, "status": "COMPLETED" }))
}
#[tauri::command]
pub fn execution_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::execution_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn dlq_add(state: State<Arc<AppState>>, execution_id: String, node_key: String, error: String, payload: Value, suggested_cause: String, candidate_fix: String) -> Result<Value, String> {
    db::dlq_add(&*lock_db(&state)?, &json!({
        "executionId": execution_id, "nodeKey": node_key, "error": error, "payload": payload,
        "suggestedCause": suggested_cause, "candidateFix": candidate_fix
    })).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn dlq_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::dlq_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn dlq_resolve(state: State<Arc<AppState>>, dlq_id: String) -> Result<(), String> {
    db::dlq_resolve(&*lock_db(&state)?, &dlq_id).map_err(|e| e.to_string())
}
#[tauri::command]
pub fn run_request_take(state: State<Arc<AppState>>) -> Result<Vec<String>, String> {
    // V7 fix (bug R): this was `vec![]` unconditionally, so queued evolution work was never picked
    // up. The real table is `run_queue (id INTEGER, workflow_id TEXT)` and the browser-side
    // implementation (localDb.runTake) drains the queue destructively, so this matches that.
    let conn = lock_db(&state)?;
    let ids: Vec<i64> = {
        let mut st = conn.prepare("SELECT id FROM run_queue ORDER BY id LIMIT 8").map_err(|e| e.to_string())?;
        let rows = st.query_map([], |r| r.get::<_, i64>(0)).map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for id in rows {
            v.push(id.map_err(|e| e.to_string())?);
        }
        v
    };
    let mut out = Vec::new();
    for id in ids {
        let wf: Option<String> = conn
            .query_row("SELECT workflow_id FROM run_queue WHERE id=?1", [id], |r| r.get(0))
            .optional()
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM run_queue WHERE id=?1", [id]).map_err(|e| e.to_string())?;
        if let Some(w) = wf {
            out.push(w);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn evolution_service_health(state: State<Arc<AppState>>) -> Value {
    hermes::health(&state.vendor_dir)
}
#[tauri::command]
pub fn evolution_service_propose(state: State<Arc<AppState>>, args: Value) -> Result<Value, String> {
    hermes::call(&state.vendor_dir, &json!({"cmd":"score_fitness","task_input": args.get("task"), "expected_behavior": args.get("expected"), "agent_output": args.get("output"), "skill_text": args.get("skill")}))
}
pub fn hermes_bridge(state: State<Arc<AppState>>, msg: Value) -> Result<Value, String> {
    // The bundled Python service implements exactly these commands (stdio_server.py). This used
    // to forward ANY JSON from the page to an interpreter that is not network-contained; the
    // page now chooses among the commands the service actually has, with a bounded payload.
    const HERMES_COMMANDS: &[&str] = &["ping", "score_fitness", "propose"];
    let cmd = msg.get("cmd").and_then(|c| c.as_str()).unwrap_or("");
    if !HERMES_COMMANDS.contains(&cmd) {
        return Err(format!(
            "hermes_bridge: {cmd:?} is not a command the evolution service implements ({}) — refused before it reached the interpreter.",
            HERMES_COMMANDS.join(", ")
        ));
    }
    if msg.to_string().len() > 64 * 1024 {
        return Err("hermes_bridge: the message exceeds 64 KiB — refused.".into());
    }
    hermes::call(&state.vendor_dir, &msg)
}

pub fn secret_get(state: State<Arc<AppState>>, secret_ref: String) -> Result<Value, String> {
    // The WebView is untrusted content, so what it may READ BACK depends on what the secret is:
    //   • a provider API key → NEVER the value. The page learns "present" and a short hint;
    //     the key is attached to a request natively, by `llm_chat`, and only ever sent to the
    //     vendor's own origin or one a human bound (see grants.rs). A page that is compromised
    //     can use the provider through the app, it cannot walk away with the key.
    //   • a signing key (owner / issuer) → readable, because signing still happens page-side.
    //     That is a stated residual (moving signing native is the follow-up), not a hidden one.
    //   • anything else → refused.
    match grants::classify_secret(&secret_ref) {
        grants::SecretClass::Provider => {
            let value = state.secrets.get(&secret_ref);
            Ok(json!({
                "ref": secret_ref,
                "present": value.is_some(),
                "value": null,
                "redacted": true,
                "hint": value.as_deref().and_then(grants::secret_hint),
            }))
        }
        grants::SecretClass::Signing => match state.secrets.get(&secret_ref) {
            Some(value) => Ok(json!({ "ref": secret_ref, "present": true, "value": value })),
            None => Ok(json!({ "ref": secret_ref, "present": false, "value": null })),
        },
        grants::SecretClass::Other => Err(format!(
            "secret_get: {secret_ref:?} is not a readable reference class — only signing keys can be read back, and provider keys never can. Refused."
        )),
    }
}
pub fn secret_set(state: State<Arc<AppState>>, secret_ref: String, value: String) -> Result<Value, String> {
    // V7 fix (bug W): report where the secret really went, so the UI can warn when a key is only
    // in memory instead of implying it is safely in the OS keychain.
    match state.secrets.set(&secret_ref, &value)? {
        crate::secrets::SecretLocation::Keychain => Ok(json!({ "stored": true, "location": "keychain", "survivesRestart": true })),
        _ => Ok(json!({
            "stored": true,
            "location": "memory-only",
            "survivesRestart": false,
            "warning": "The OS keychain was unavailable, so this secret is held in process memory only and will be lost when VH exits. It is NOT saved to disk.",
        })),
    }
}
pub fn secret_delete(state: State<Arc<AppState>>, secret_ref: String) -> Result<(), String> {
    state.secrets.delete(&secret_ref)
}
#[tauri::command]
pub fn secret_exists(state: State<Arc<AppState>>, secret_refs: Vec<String>) -> Value {
    let mut out = serde_json::Map::new();
    for r in &secret_refs {
        // V7 fix (bug W): `exists` alone could not distinguish "in the keychain" from "in RAM and
        // about to vanish", so the Providers page showed a green tick for a key that was not saved.
        let loc = match state.secrets.location(r) {
            crate::secrets::SecretLocation::Keychain => "keychain",
            crate::secrets::SecretLocation::MemoryOnly => "memory-only",
            crate::secrets::SecretLocation::Absent => "absent",
        };
        out.insert(r.clone(), json!({ "exists": loc != "absent", "location": loc, "survivesRestart": loc == "keychain" }));
    }
    json!(out)
}

/// Bind a provider key to ONE non-canonical origin, with a native confirmation naming both.
///
/// A vendor's own host needs no binding (it is built in). Anything else — a self-hosted or BYOK
/// gateway — has to be authorised by a human, because the page cannot be trusted to say where a
/// key is allowed to go. The origin must be https (or loopback), and must clear the SSRF guard.
/// Re-binding to the origin already bound asks nothing.
pub fn provider_bind_endpoint(app: AppHandle, state: State<Arc<AppState>>, secret_ref: String, base_url: String) -> Result<Value, String> {
    if grants::classify_secret(&secret_ref) != grants::SecretClass::Provider {
        return Err(format!("provider_bind_endpoint: {secret_ref:?} is not a provider key reference — nothing was bound."));
    }
    let origin = grants::origin_of(&base_url)?;
    let u = reqwest::Url::parse(&base_url).map_err(|e| e.to_string())?;
    let loopback = u.host_str().map(grants::is_loopback_host).unwrap_or(false);
    if u.scheme() != "https" && !loopback {
        return Err(format!("provider_bind_endpoint: a key may only be bound to an https endpoint (or a loopback address) — {origin} refused."));
    }
    egress_guard(&base_url).map_err(|e| format!("provider_bind_endpoint: {e} — nothing was bound."))?;
    let current = db::provider_endpoint_get(&*lock_db(&state)?, &secret_ref).map_err(|e| e.to_string())?;
    if current.as_deref() == Some(origin.as_str()) {
        return Ok(json!({ "bound": true, "origin": origin, "secretRef": secret_ref, "alreadyBound": true }));
    }
    let confirmed = native_confirm(
        &app,
        &state,
        "SelfImpulse — send an API key to this server?",
        format!(
            "SelfImpulse is asking to send the API key stored as\n    {secret_ref}\nto\n    {origin}\n\nThat server will receive the key with every request. Allow this only for a gateway you run or trust. Cancel binds nothing."
        ),
        "Allow",
    )?;
    if !confirmed {
        return Err(format!("{secret_ref}: declined at the native dialog — no endpoint was bound and no key can be sent there."));
    }
    db::provider_endpoint_bind(&*lock_db(&state)?, &secret_ref, &origin, "human:dialog").map_err(|e| e.to_string())?;
    Ok(json!({ "bound": true, "origin": origin, "secretRef": secret_ref, "alreadyBound": false }))
}

#[tauri::command]
pub fn provider_endpoints_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::provider_endpoint_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

/// Removing a binding only narrows what a key can reach, so it needs no confirmation.
#[tauri::command]
pub fn provider_unbind_endpoint(state: State<Arc<AppState>>, secret_ref: String) -> Result<Value, String> {
    let removed = db::provider_endpoint_unbind(&*lock_db(&state)?, &secret_ref).map_err(|e| e.to_string())?;
    Ok(json!({ "unbound": removed, "secretRef": secret_ref }))
}

/// Mint an execution grant: which dev tools, in which registered workspace, with or without the
/// network, for how long. The native dialog prints exactly that; the token goes back ONCE and is
/// stored only as a hash. `shell_exec` runs nothing without one. Default network: OFF.
pub fn exec_grant_request(
    app: AppHandle,
    state: State<Arc<AppState>>,
    programs: Vec<String>,
    workspace: String,
    network: bool,
    minutes: Option<u64>,
) -> Result<Value, String> {
    // The workspace must already be a registered root (or the app data dir): a grant cannot
    // widen the filesystem boundary, only spend it.
    let ws = ensure_allowed(&state, &workspace)?;
    let progs: Vec<String> = if programs.is_empty() { grants::DEV_TOOLS.iter().map(|p| p.to_string()).collect() } else { programs };
    let ttl = minutes.unwrap_or(30).clamp(1, 60) * 60;
    // Validate the scope BEFORE a human is asked to approve it: the dialog must never describe
    // something that would then be refused, or silently trimmed.
    let progs = grants::ExecGrants::validate_scope(&progs, &ws)?;
    let list = progs.join(", ");
    let confirmed = native_confirm(
        &app,
        &state,
        "SelfImpulse — allow programs to run?",
        format!(
            "SelfImpulse is asking to run these programs:\n    {list}\n\nonly inside this workspace:\n    {ws}\n\nNetwork access: {}\nValid for: {} minute(s)\n\nThey run in a sandbox that cannot see the rest of your files. Cancel runs nothing.",
            if network { "ALLOWED — the programs can reach the internet" } else { "DENIED — the programs cannot reach any network" },
            ttl / 60
        ),
        if network { "Allow (with network)" } else { "Allow" },
    )?;
    if !confirmed {
        return Err("exec_grant_request: declined at the native dialog — no grant was minted and nothing may run.".into());
    }
    let (token, view) = state.grants.mint(&progs, &ws, network, ttl, grants::unix_now())?;
    Ok(json!({
        "grant": token,
        "workspace": view.workspace,
        "network": view.network,
        "programs": view.programs,
        "expiresAt": view.expires_at,
    }))
}

/// What is currently granted. Never the tokens.
#[tauri::command]
pub fn exec_grants_status(state: State<Arc<AppState>>) -> Value {
    let now = grants::unix_now();
    json!(state.grants.status(now).iter().map(|g| json!({
        "workspace": g.workspace, "network": g.network, "programs": g.programs, "expiresAt": g.expires_at,
        "secondsLeft": g.expires_at.saturating_sub(now),
    })).collect::<Vec<_>>())
}

/// Revoke every grant. Only ever narrows authority, so it needs no confirmation.
#[tauri::command]
pub fn exec_grants_revoke(state: State<Arc<AppState>>) -> Value {
    json!({ "revoked": state.grants.revoke_all() })
}

/// Egress policy for the provider call boundary — the native mirror of
/// `checkEgressUrl` in src/security/guardrail.ts, enforced at the IPC handler.
///
/// Before this, `llm_chat` honoured any caller-supplied `base_url` and attached
/// the provider key to it. `base_url` is caller-controlled (node/provider config,
/// reachable from the WebView), so a hostile value could both drive an SSRF at
/// link-local / RFC1918 / cloud-metadata addresses and exfiltrate the user's API
/// key to an attacker's host. SECURITY.md already claimed egress guards live on
/// the fetch path; this is where that claim becomes true for provider calls.
///
/// Loopback stays ALLOWED: a local Ollama or a self-hosted gateway is documented,
/// consented product surface — this mirrors the TypeScript policy exactly, and
/// `probe/providerEgress.test.ts` pins the two in step.
fn egress_guard(raw: &str) -> Result<(), String> {
    let u = reqwest::Url::parse(raw).map_err(|_| "not a parseable URL".to_string())?;
    let scheme = u.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("scheme \"{scheme}\" refused — only http(s) egress is allowed"));
    }
    let host = u.host_str().unwrap_or("").to_ascii_lowercase();
    let bare = host.trim_start_matches('[').trim_end_matches(']');
    if bare == "169.254.169.254" || bare == "metadata.google.internal" {
        return Err("cloud metadata endpoint refused (SSRF guard)".into());
    }
    if bare.starts_with("169.254.") {
        return Err("link-local address refused (SSRF guard)".into());
    }
    if bare == "0.0.0.0" || bare == "::" {
        return Err("unspecified address refused".into());
    }
    if bare.starts_with("10.")
        || bare.starts_with("192.168.")
        || bare.starts_with("172.16.")
        || bare.starts_with("172.17.")
        || bare.starts_with("172.18.")
        || bare.starts_with("172.19.")
        || bare.starts_with("172.2")
        || bare.starts_with("172.30.")
        || bare.starts_with("172.31.")
    {
        return Err("private network address refused (SSRF guard)".into());
    }
    if bare.starts_with("fc") || bare.starts_with("fd") || bare.starts_with("fe80:") {
        return Err("IPv6 unique-local / link-local refused (SSRF guard)".into());
    }
    for sfx in [".internal", ".local", ".localhost"] {
        if bare.ends_with(sfx) {
            return Err(format!("host suffix \"{sfx}\" refused"));
        }
    }
    Ok(())
}

/// Resolve `host` once, classify every address, and pin the winner.
///
/// This is the layer a hostname-string check cannot provide. OWASP's SSRF
/// guidance is explicit that hostname checks are bypassable through DNS
/// rebinding: a name that answers PUBLIC at check time and PRIVATE at connect
/// time defeats any denylist (CVE-2025-69660, CVE-2026-64849 in the wild). The
/// fix is to resolve once, validate the resolved address, and connect to THAT
/// address — `ClientBuilder::resolve` does exactly that.
///
/// Fails closed: a name that resolves to both a public and a non-public address
/// is refused, because the caller does not control which one gets picked.
/// "I could not tell" is never "yes".
/// 11.14.4 — `async` restored. The body calls `tokio::net::lookup_host(..).await`,
/// so this cannot be a sync fn; the keyword had been lost and the crate did not
/// compile.
async fn resolve_and_pin(
    builder: reqwest::ClientBuilder,
    raw: &str,
    allow_loopback: bool,
) -> Result<reqwest::ClientBuilder, String> {
    let u = reqwest::Url::parse(raw).map_err(|_| "not a parseable URL".to_string())?;
    let host = u.host_str().unwrap_or("").to_string();
    if host.is_empty() {
        return Ok(builder);
    }
    // A literal address never touches DNS, so there is nothing to pin — the
    // string gate already classified it.
    if host.parse::<std::net::IpAddr>().is_ok() {
        return Ok(builder);
    }

    let port = u.port_or_known_default().unwrap_or(443);
    let addrs: Vec<std::net::SocketAddr> = (tokio::net::lookup_host((host.as_str(), port)).await)
        .map_err(|e| format!("DNS resolution failed for \"{host}\": {e}"))?
        .collect();
    if addrs.is_empty() {
        return Err(format!("\"{host}\" resolved to no addresses — refused rather than guessing"));
    }
    let mut pinned: Option<std::net::SocketAddr> = None;
    for a in &addrs {
        if let Err(reason) = classify_socket(*a, allow_loopback) {
            return Err(format!("\"{host}\" resolves to {a} — {reason}"));
        }
        if pinned.is_none() {
            pinned = Some(*a);
        }
    }
    // reqwest::ClientBuilder::resolve pins the hostname to this address for the
    // life of the client, so the transport never performs a second, attacker-
    // controlled lookup. This is what closes the TOCTOU window.
    Ok(builder.resolve(&host, pinned.expect("non-empty")))
}

/// Classify one resolved socket address. Mirrors classifyIp() in
/// src/security/egressNet.ts — probe/egressNet.test.ts pins that the two agree.
fn classify_socket(addr: std::net::SocketAddr, allow_loopback: bool) -> Result<(), String> {
    match addr {
        std::net::SocketAddr::V4(v4) => {
            let o = v4.ip().octets();
            if o[0] == 127 {
                return if allow_loopback { Ok(()) } else { Err("loopback address refused (SSRF guard)".into()) };
            }
            if o[0] == 169 && o[1] == 254 {
                if o[2] == 169 && o[3] == 254 {
                    return Err("cloud metadata endpoint refused (SSRF guard)".into());
                }
                return Err("link-local address refused (SSRF guard)".into());
            }
            if o[0] == 0 { return Err("this-network address refused (SSRF guard)".into()); }
            if o[0] == 10 { return Err("private network address refused (SSRF guard)".into()); }
            if o[0] == 100 && (64..128).contains(&o[1]) { return Err("carrier-grade NAT address refused (SSRF guard)".into()); }
            if o[0] == 172 && (16..32).contains(&o[1]) { return Err("private network address refused (SSRF guard)".into()); }
            if o[0] == 192 && o[1] == 168 { return Err("private network address refused (SSRF guard)".into()); }
            if o[0] == 192 && o[1] == 0 && o[2] == 0 { return Err("IETF protocol assignment refused (SSRF guard)".into()); }
            if o[0] == 192 && o[1] == 0 && o[2] == 2 { return Err("documentation range refused (SSRF guard)".into()); }
            if o[0] == 198 && (o[1] == 18 || o[1] == 19) { return Err("benchmarking range refused (SSRF guard)".into()); }
            if o[0] == 198 && o[1] == 51 && o[2] == 100 { return Err("documentation range refused (SSRF guard)".into()); }
            if o[0] == 203 && o[1] == 0 && o[2] == 113 { return Err("documentation range refused (SSRF guard)".into()); }
            if (224..=239).contains(&o[0]) { return Err("multicast address refused (SSRF guard)".into()); }
            if o[0] >= 240 { return Err("reserved address refused (SSRF guard)".into()); }
            Ok(())
        }
        std::net::SocketAddr::V6(v6) => {
            let s = v6.ip().segments();
            // An IPv4-mapped address is an IPv4 address in an IPv6 hat. Classify
            // the v4 inside it, or every v4 check above silently stops applying.
            if s[0..5].iter().all(|x| *x == 0) && s[5] == 0xffff {
                // `SocketAddrV4` is a (ip, port) pair; the port is irrelevant to
                // classification and is carried over from the v6 address.
                return classify_socket(std::net::SocketAddr::V4(std::net::SocketAddrV4::new(
                    std::net::Ipv4Addr::new(
                        (s[6] >> 8) as u8, (s[6] & 0xff) as u8, (s[7] >> 8) as u8, (s[7] & 0xff) as u8),
                    v6.port())), allow_loopback);
            }
            if s[0..7].iter().all(|x| *x == 0) && s[7] == 1 {
                return if allow_loopback { Ok(()) } else { Err("IPv6 loopback refused (SSRF guard)".into()) };
            }
            if s[0..7].iter().all(|x| *x == 0) && s[7] == 0 { return Err("unspecified address refused (SSRF guard)".into()); }
            if (s[0] & 0xfe00) == 0xfc00 { return Err("IPv6 unique-local refused (SSRF guard)".into()); }
            if (s[0] & 0xffc0) == 0xfe80 { return Err("IPv6 link-local refused (SSRF guard)".into()); }
            if (s[0] & 0xff00) == 0xff00 { return Err("IPv6 multicast refused (SSRF guard)".into()); }
            if s[0] == 0x2001 && s[1] == 0x0db8 { return Err("IPv6 documentation range refused (SSRF guard)".into()); }
            if s[0] == 0x0064 && s[1] == 0xff9b {
                return Err("NAT64-embedded address refused (SSRF guard)".into());
            }
            if s[0] == 0x2002 { return Err("6to4 address refused (SSRF guard)".into()); }
            if s[0] == 0x2001 && s[1] == 0x0000 { return Err("Teredo address refused (SSRF guard)".into()); }
            Ok(())
        }
    }
}

pub async fn llm_chat(state: State<'_, Arc<AppState>>, req: Value) -> Result<Value, String> {
    let provider = req["provider"].as_str().unwrap_or("openai");
    let model = req["model"].as_str().unwrap_or("gpt-4.1").to_string();
    let secret_ref = req["secret_ref"].as_str().unwrap_or("");
    let system = req["system"].as_str().unwrap_or("").to_string();
    let messages = req["messages"].clone();
    if provider == "ollama" {
        let base = req["base_url"].as_str().unwrap_or("http://127.0.0.1:11434");
        egress_guard(base).map_err(|e| format!("ollama base URL refused: {e} — nothing was sent and no key left this machine."))?;
        // V6 fix: the previous build sent `{"0": {...}}` (an object, not an array) and
        // dropped the conversation entirely — only the system prompt reached the model.
        // Ollama's /api/chat expects a JSON array of role/content messages.
        let mut msgs = Vec::new();
        if !system.is_empty() {
            msgs.push(json!({"role": "system", "content": system}));
        }
        if let Some(arr) = messages.as_array() {
            msgs.extend(arr.iter().cloned());
        }
        if msgs.is_empty() {
            return Err("ollama: no messages to send".into());
        }
        let body = json!({
            "model": model,
            "stream": false,
            "options": { "temperature": req["temperature"].as_f64().unwrap_or(0.2) },
            "messages": msgs
        });
        // Ollama is the user's local model, not a VH sidecar.
        // `redirect::Policy::none()` is load-bearing: an auto-following client
        // would reach an unvetted hop without ever re-entering the guard.
        let target = format!("{base}/api/chat");
        let client = resolve_and_pin(
            reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()),
            &target,
            true,
        ).await?.build().map_err(|e| format!("ollama client: {e}"))?;
        let r = client.post(&target).json(&body).send().await;
        return match r {
            Ok(resp) => {
                if !resp.status().is_success() {
                    return Err(format!("ollama returned HTTP {} — is the model pulled?", resp.status().as_u16()));
                }
                let j: Value = resp.json().await.unwrap_or(json!({}));
                Ok(json!({ "content": j.pointer("/message/content").cloned().unwrap_or(json!("")), "model": model, "usage": {"input_tokens": 0, "output_tokens": 0}, "duration_ms": 0 }))
            }
            Err(e) => Err(format!("ollama: {e}")),
        };
    }
    // THE BOUNDARY (archive-6 audit, finding 1). The page used to name BOTH the secret and the
    // destination: `secret_ref` + `base_url` made the stored key ride an Authorization header to
    // any public https host it chose, and `secret_get` handed the raw key back besides. Now:
    //   (1) only a PROVIDER key can be attached at all — never an owner/issuer key or any other secret;
    //   (2) that key may only go to the vendor's own origin, or an origin a HUMAN bound through a
    //       native dialog, over https (plain http only to loopback);
    //   (3) both are decided BEFORE the secret is read, so a refused call never touches the key.
    if grants::classify_secret(secret_ref) != grants::SecretClass::Provider {
        return Err(format!(
            "llm_chat attaches provider keys only (vh.providerkey.* / provider.*); {secret_ref:?} is not one — nothing was sent and no key left this machine."
        ));
    }
    // 16.10.1 (external review — the "universal providers" gap, closed): each
    // kind now has its REAL default endpoint — groq was falling through to the
    // OpenAI URL — and base_url is honored for EVERY cloud kind (BYOK gateways
    // and self-hosted gateways), not just ollama. Anthropic speaks its actual
    // Messages contract: top-level `system`, never a system role message, and
    // its REQUIRED max_tokens is always present.
    let (default_url, header, is_anthropic) = match provider {
        "anthropic" => ("https://api.anthropic.com/v1/messages", "x-api-key", true),
        "google" => ("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "Authorization", false),
        "groq" => ("https://api.groq.com/openai/v1/chat/completions", "Authorization", false),
        "openrouter" => ("https://openrouter.ai/api/v1/chat/completions", "Authorization", false),
        _ => ("https://api.openai.com/v1/chat/completions", "Authorization", false),
    };
    let base_override = req["base_url"].as_str().unwrap_or("").trim().to_string();
    let url = if base_override.is_empty() { default_url.to_string() } else { base_override };
    egress_guard(&url).map_err(|e| format!("base URL refused by the egress guard: {e} — nothing was sent and no key left this machine."))?;
    let bound = {
        let conn = lock_db(&state)?;
        db::provider_endpoint_get(&conn, secret_ref).map_err(|e| e.to_string())?
    }; // the lock is released before any await
    grants::key_destination_allowed(provider, &url, bound.as_deref())
        .map_err(|e| format!("{e} — nothing was sent and no key left this machine."))?;
    let key = state.secrets.get(secret_ref).ok_or_else(|| format!("secret not found: {secret_ref}"))?;
    // Second gate: resolve once, classify every answer, and PIN the address so
    // the transport cannot be handed a different one by a rebinding resolver.
    // Redirects are not auto-followed — each hop would otherwise be an
    // unvetted destination, and a provider key rides this request.
    let client = resolve_and_pin(
        reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()),
        &url,
        false,
    ).await?.build().map_err(|e| format!("provider client: {e}"))?;
    let body = if is_anthropic {
        let mut msgs: Vec<Value> = Vec::new();
        if let Some(arr) = messages.as_array() {
            msgs.extend(arr.iter().cloned());
        }
        if msgs.is_empty() {
            return Err("anthropic: no messages to send".into());
        }
        let mut b = json!({
            "model": model,
            "messages": msgs,
            "max_tokens": req["max_tokens"].as_u64().unwrap_or(1024),
        });
        if !system.is_empty() {
            b["system"] = json!(system);
        }
        b
    } else {
        let mut msgs = vec![json!({"role":"system","content": system})];
        if let Some(arr) = messages.as_array() {
            msgs.extend(arr.iter().cloned());
        }
        json!({"model": model, "messages": msgs, "max_tokens": req["max_tokens"]})
    };
    let mut reqb = client.post(&url).json(&body);
    reqb = if header == "Authorization" { reqb.bearer_auth(&key) } else { reqb.header(header, key.as_str()).header("anthropic-version", "2023-06-01") };
    let resp = reqb.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        // A 401 / 429 / 5xx used to come back as an EMPTY reply ("ok", no content) — the owner saw a
        // silent nothing instead of "invalid key". The provider's own words go back, with the key
        // scrubbed first: some providers echo part of it in the error body.
        let scrubbed = if key.len() >= 8 { text.replace(&key, "[key redacted]") } else { text };
        let snippet: String = scrubbed.chars().take(400).collect();
        return Err(format!("provider returned HTTP {}: {}", status.as_u16(), snippet));
    }
    let j: Value = serde_json::from_str(&text).map_err(|e| format!("provider returned a non-JSON body: {e}"))?;
    let content = j.pointer("/choices/0/message/content").or_else(|| j.pointer("/content/0/text")).cloned().unwrap_or(json!(""));
    Ok(json!({ "content": content, "model": model, "usage": j.get("usage").cloned().unwrap_or(json!({})), "duration_ms": 0 }))
}

// ---------------------------------------------------------------------------
// QA fix (audit C2): filesystem sandbox.
//
// fs_read / fs_write / fs_list / fs_mkdir / fs_remove / shell_exec used to accept
// ANY absolute path from the webview, which made every XSS in the frontend a
// full-disk read/write/delete + arbitrary-execution primitive. Every path now
// must resolve inside an allowed root:
//   â€¢ the app data dir (always, it is VH's own store), or
//   â€¢ a user-registered workspace root (persisted in SQLite, managed by the
//     workspace_root_* commands below — Teams registers the repo when a run starts).
// Agents can be prompt-injected; the user-registered-root gate is what keeps an
// injected tool call from reaching, say, ~/.ssh or C:\Windows.
// ---------------------------------------------------------------------------

fn normalize_parts(p: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    for comp in p.replace('\\', "/").split('/') {
        if comp.is_empty() || comp == "." {
            continue;
        }
        if comp == ".." {
            if parts.len() > 1 {
                parts.pop();
            }
            continue;
        }
        parts.push(comp.to_string());
    }
    parts
}

fn normalize_path_str(p: &str) -> String {
    normalize_parts(p).join("/")
}

/// 16.10.1 (external review): lexical checks are symlink-bypassable — a
/// registered root containing a symlink to anywhere made the containment test
/// a lie. Resolve the REAL path first: canonicalize the deepest EXISTING
/// ancestor and re-join the not-yet-existing tail (fs_write creates new
/// files), so every parent crossing is the true filesystem name.
fn canonicalize_best(path: &str) -> String {
    let pb = std::path::PathBuf::from(path);
    let mut cur = pb.clone();
    let mut tail: Vec<std::ffi::OsString> = Vec::new();
    loop {
        match std::fs::canonicalize(&cur) {
            Ok(real) => {
                let mut real = real;
                for t in tail.iter().rev() {
                    real.push(t);
                }
                return real.display().to_string();
            }
            Err(_) => match cur.file_name() {
                Some(name) => {
                    tail.push(name.to_os_string());
                    if !cur.pop() {
                        return path.to_string();
                    }
                }
                None => return path.to_string(),
            },
        }
    }
}

fn is_within(child: &str, root: &str) -> bool {
    let (c, r) = (normalize_path_str(child), normalize_path_str(root));
    if c.eq_ignore_ascii_case(&r) {
        return true;
    }
    let cc = format!("{c}/");
    let rc = format!("{r}/");
    cc.to_ascii_lowercase().starts_with(&rc.to_ascii_lowercase())
}

fn allowed_roots(state: &AppState) -> Vec<String> {
    // 16.10.1: every root is canonicalized too — containment compares REAL paths.
    let mut roots = vec![canonicalize_best(&normalize_path_str(&state.data_dir.display().to_string()))];
    if let Ok(v) = db::workspace_root_list(&state.db.lock()) {
        if let Some(arr) = v.as_array() {
            for r in arr {
                if let Some(p) = r["path"].as_str() {
                    roots.push(canonicalize_best(&normalize_path_str(p)));
                }
            }
        }
    }
    roots
}

/// Workspace-root containment for a caller-supplied path.
///
/// `pub(crate)` since 20.1: the gate used to be private to this module, which
/// meant `git.rs` could not use it — and so did not. Every `git_*` command
/// took its `cwd` straight from the WebView and ran `git` there, outside the
/// sandbox that guards `fs_*`. `git status --porcelain -z` against an arbitrary
/// directory returns every untracked filename in it; `git diff` returns file
/// CONTENT. That is the read primitive the `fs_*` sandbox exists to prevent,
/// reachable through a sibling command in the same handler list.
pub(crate) fn ensure_allowed(state: &AppState, path: &str) -> Result<String, String> {
    let normalized = canonicalize_best(&normalize_path_str(path)); // 16.10.1: real path, symlink-proof
    if normalized.is_empty() {
        return Err("sandbox: empty path".into());
    }
    if allowed_roots(state).iter().any(|root| is_within(&normalized, root)) {
        Ok(normalized)
    } else {
        Err(format!(
            "sandbox: path '{normalized}' is outside every registered workspace root. Register it first (Teams â†’ runner repo, or workspace_root_add)."
        ))
    }
}

/// Refuse a root that would hand the sandbox the whole machine.
///
/// 11.14.4. `workspace_root_add` used to validate exactly one thing — that the
/// path is a directory — and then trust it forever. Every `fs_*` command's
/// containment check reads that list (see `allowed_roots` / `ensure_allowed`),
/// so any script in the WebView could call
/// `invoke("workspace_root_add", {root: "C:\\"})` and then read, write or
/// recursively delete anything the signed-in user can reach, with the sandbox
/// reporting success. The sandbox was self-service.
///
/// This is the policy the check was always supposed to have. It is a REFUSAL
/// LIST, not a permission grant: the operator picks a working folder, and the
/// product declines the handful of locations that would make the containment
/// guarantee meaningless. Everything else is still allowed, so a legitimately
/// deep workspace keeps working.
fn refuse_uncontainable_root(root: &str) -> Option<String> {
    let norm = normalize_path_str(root);
    let path = PathBuf::from(&norm);
    let canon = std::fs::canonicalize(&path).unwrap_or(path.clone());
    let c = canon.to_string_lossy().to_ascii_lowercase();
    let comps = path_components_lower(&c);

    // A drive root (C:\, D:\, \\server\share) is the whole volume, not a folder.
    let is_drive_root = comps.len() == 1 && comps[0].ends_with(':');
    // UNC detection reads the RAW input too: normalize_path_str collapses
    // `\\server\share` to `server/share`, so a lexical-only check on `c`
    // never sees the leading double backslash at all (C-3 companion).
    let is_unc_root = (c.starts_with("\\") || root.starts_with("\\")) && comps.len() <= 2;
    if is_drive_root || is_unc_root {
        return Some(format!(
            "\"{norm}\" is a filesystem/volume root. The workspace boundary would be the entire machine, so it is refused. Pick a project folder inside it instead."
        ));
    }

    // The user profile and the system directories. A workspace legitimately
    // lives somewhere in here (Documents\repos), so the refusal is on the
    // sensitive directories themselves, not on the parent.
    const FORBIDDEN_EXACT: &[&str] = &[
        "c:\\users",
        "c:\\windows",
        "c:\\windows\\system32",
        "c:\\windows\\syswow64",
        "c:\\windows\\winsxs",
        "c:\\program files",
        "c:\\program files (x86)",
        "c:\\programdata",
        "c:\\$recycle.bin",
        "c:\\system volume information",
    ];
    for bad in FORBIDDEN_EXACT {
        if comps == path_components_lower(bad) {
            return Some(format!(
                "\"{norm}\" is a system directory. Registering it would put the agent outside anything the sandbox is meant to contain; refused."
            ));
        }
    }

    // Home itself, and the SSH/credential directories wherever the profile sits.
    if let Ok(profile) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let p = path_components_lower(&profile);
        if !p.is_empty() && comps == p {
            return Some(format!(
                "\"{norm}\" is the whole user profile. Register the project folder inside it instead of the profile itself."
            ));
        }
    }
    const CREDENTIAL_DIRS: &[&str] = &[".ssh", ".aws", ".gnupg", ".config\\gcloud", ".docker", ".kube", ".azure"];
    for seg in CREDENTIAL_DIRS {
        // Tail match on PATH COMPONENTS (C-3): `...\me\.ssh`, `...\me\.ssh\`,
        // `...\ME\.SSH`, `\\?\C:\Users\me\.ssh` and unix `.../.ssh` all hit.
        // The old code matched suffixes against a `with_sep` string that ended
        // in a separator, so `ends_with("\\.ssh")` could never be true — the
        // refusal existed but never fired.
        let want = path_components_lower(seg);
        if !want.is_empty() && comps.len() >= want.len() && comps[comps.len() - want.len()..] == want[..] {
            return Some(format!(
                "\"{norm}\" is a credential store ({seg}). The agent has no business reading key material; refused."
            ));
        }
    }
    None
}

/// Lowercased path components — tolerant of `\` vs `/`, empty segments, `.`,
/// and the Windows extended-length prefix (`\\?\C:\...`, `\\?\UNC\server\share`).
/// Both sides of every comparison in `refuse_uncontainable_root` go through
/// this one normalizer; suffix-string tricks are exactly how C-3 happened.
fn path_components_lower(s: &str) -> Vec<String> {
    let mut s = s.to_ascii_lowercase();
    if let Some(rest) = s.strip_prefix("\\\\?\\unc\\") {
        s = format!("\\\\{rest}");
    } else if let Some(rest) = s.strip_prefix("\\\\?\\") {
        s = rest.to_string();
    } else if let Some(rest) = s.strip_prefix("?/") {
        // normalize_path_str folds `\\\\?\\C:\\x` to `?/C:/x` — strip the
        // marker in its FOLDED form too, or lexical input never matches.
        s = rest.to_string();
    }
    s.split(['\\', '/'])
        .filter(|p| !p.is_empty() && *p != ".")
        .map(|p| p.to_string())
        .collect()
}

pub fn workspace_root_add(app: AppHandle, state: State<'_, Arc<AppState>>, root: String) -> Result<Value, String> {
    let normalized = normalize_path_str(&root);
    if normalized.is_empty() || !PathBuf::from(&root).is_dir() {
        return Err(format!("sandbox: '{root}' is not an existing directory"));
    }
    // 11.14.4 — the containment boundary may not be widened by the WebView.
    if let Some(why) = refuse_uncontainable_root(&normalized) {
        return Err(format!("sandbox: {why} Nothing was registered; the existing roots are unchanged."));
    }
    // Archive-6 audit: the check above refuses system and credential roots, but it left EVERY other
    // folder one script call away — a page could register ~/Documents and then read, write and request
    // execution grants inside it, and this comment's own promise ("may not be widened by the WebView")
    // was only true for the dangerous half of the disk. Widening the boundary now needs a human at a
    // native dialog. A folder that is already a root asks nothing (idempotent), so a run that
    // re-registers its repo does not nag.
    if allowed_roots(&state).iter().any(|r| normalize_path_str(r) == normalized) {
        return db::workspace_root_add(&*lock_db(&state)?, &normalized).map_err(|e| e.to_string());
    }
    let confirmed = native_confirm(
        &app,
        &state,
        "SelfImpulse — open a folder to the crew?",
        format!(
            "SelfImpulse is asking to read and write files inside:\n    {normalized}\n\nPrograms you allow later run inside this folder in a sandbox that cannot see the rest of your files. Cancel registers nothing."
        ),
        "Allow",
    )?;
    if !confirmed {
        return Err(format!("{normalized}: declined at the native dialog — the folder was not registered and the existing roots are unchanged."));
    }
    db::workspace_root_add(&*lock_db(&state)?, &normalized).map_err(|e| e.to_string())
}

pub fn workspace_root_remove(state: State<Arc<AppState>>, root: String) -> Result<Value, String> {
    db::workspace_root_remove(&*lock_db(&state)?, &root).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn workspace_root_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::workspace_root_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}

pub fn fs_read(state: State<Arc<AppState>>, path: String) -> Result<String, String> {
    let path = ensure_allowed(&state, &path)?;
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
pub fn fs_write(state: State<Arc<AppState>>, path: String, content: String) -> Result<(), String> {
    let path = ensure_allowed(&state, &path)?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
pub fn fs_list(state: State<Arc<AppState>>, path: String) -> Result<Value, String> {
    let path = ensure_allowed(&state, &path)?;
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for e in rd.flatten() {
        out.push(json!({ "name": e.file_name().to_string_lossy(), "path": e.path().display().to_string(), "dir": e.path().is_dir() }));
    }
    Ok(Value::Array(out))
}
pub fn fs_mkdir(state: State<Arc<AppState>>, path: String) -> Result<(), String> {
    let path = ensure_allowed(&state, &path)?;
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}
pub fn fs_remove(state: State<Arc<AppState>>, path: String, recursive: bool) -> Result<(), String> {
    let path = ensure_allowed(&state, &path)?;
    if recursive { std::fs::remove_dir_all(&path).or_else(|_| std::fs::remove_file(&path)).map_err(|e| e.to_string()) }
    else { std::fs::remove_file(&path).map_err(|e| e.to_string()) }
}
/// 16.10.1 (external review): shell_exec used to run ANY program the webview
/// named — only the cwd was sandboxed, which made it a full-machine execution
/// primitive. The capability boundary is now narrower still: the external
/// coding-agent CLIs and the custom-harness registry are GONE, so the only
/// things shell_exec will start are a dev-tool binary or an executable that
/// lives INSIDE a registered workspace root. Everything else refuses in words.
///
/// The agent CLIs (claude, codex, gemini, â€¦) used to be listed here so a
/// harness could drive them. They are removed by product decision: every agent
/// runs natively in-process on the owner's own provider key. The dev-tool seat
/// below stays, because missions legitimately need to build and test.
// One list, shared with the grants (a grant can only ever cover programs from this set).
const SHELL_ALLOWED_PROGRAMS: &[&str] = grants::DEV_TOOLS;

/// The one program-allowlist rule, shared by every spawn path.
///
/// 11.14.4. `shell_exec` used to carry this check inline; `mcp_call` and
/// `mcp_connect_test` had no equivalent and handed the stored command straight to
/// `contain::spawn_target`, which returns the configured string unchanged when
/// PATH lookup misses. That made the MCP registry an arbitrary-execution
/// primitive reachable from any script in the WebView, bypassing the allowlist
/// entirely. Both paths now come through here.
///
/// Two ways to pass, unchanged from the original shell rule: a known dev-tool by
/// bare name, or an executable that already lives inside a registered workspace
/// root (so a project can ship and run its own binary).
fn ensure_program_allowed(state: &AppState, program: &str) -> Result<(), String> {
    let bare = std::path::Path::new(program)
        .file_name()
        .map(|f| f.to_string_lossy().trim_end_matches(".exe").to_string())
        .unwrap_or_else(|| program.to_string());
    if SHELL_ALLOWED_PROGRAMS.contains(&bare.as_str()) {
        return Ok(());
    }
    if ensure_allowed(state, program).is_ok() {
        return Ok(());
    }
    Err(format!(
        "shell capability boundary: '{program}' is not a dev-tool binary or an executable inside a registered workspace root — run it from a registered root. Refused in words; nothing ran."
    ))
}

pub fn shell_exec(
    state: State<Arc<AppState>>,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    grant: Option<String>,
) -> Result<Value, String> {
    // 11.14.4 — the rule moved into ensure_program_allowed so the MCP spawn
    // paths cannot drift away from it again.
    ensure_program_allowed(&state, &program)?;
    // The working directory must be a registered root. No cwd given -> SelfImpulse's own data dir,
    // which is always allowed (previously it silently inherited the install dir).
    let cwd = match cwd {
        Some(c) => ensure_allowed(&state, &c)?,
        None => normalize_path_str(&state.data_dir.display().to_string()),
    };
    // THE GRANT (archive-6 audit, finding 3). An allow-listed interpreter with arbitrary arguments
    // is arbitrary code: `node -e …`, `python3 -c …`. The program allow-list and the cwd sandbox
    // limited WHERE it ran, not WHAT it did, and the network was wide open. Running a program now
    // needs a grant a human minted at a native dialog: which tools, which workspace, whether the
    // network is reachable (default: it is not), for how long. Without one nothing starts.
    let bare = grants::bare_name(&program);
    let is_workspace_binary = !grants::DEV_TOOLS.contains(&bare.as_str()) && ensure_allowed(&state, &program).is_ok();
    let view = state.grants.check(grant.as_deref().unwrap_or(""), &program, is_workspace_binary, grants::unix_now())?;
    if !is_within(&cwd, &view.workspace) {
        return Err(format!(
            "the working directory '{cwd}' is outside this execution grant's workspace '{}'. Nothing ran.",
            view.workspace
        ));
    }
    // Host-escape containment: the process runs INSIDE the workspace filesystem
    // boundary (unshare/bwrap/seatbelt when available), with an env scrub and a
    // redirected HOME. `containment` reports the rung actually achieved — a
    // policy-only run is a different fact from a sandboxed one and says so. With the
    // network denied, a host that cannot isolate it REFUSES rather than runs open.
    let write_paths: Vec<std::path::PathBuf> = vec![std::path::PathBuf::from(&cwd)];
    let (cmd, rung) = contain::wrap_command(&program, &args, std::path::Path::new(&cwd), &[], &write_paths, view.network)?;
    let (stdout, stderr, code) = run_timeout(cmd, timeout_secs.unwrap_or(60))?;
    Ok(json!({ "stdout": stdout, "stderr": stderr, "code": code, "containment": rung.label(), "network": view.network }))
}

#[tauri::command]
pub fn mcp_server_list(state: State<Arc<AppState>>) -> Result<Value, String> {
    db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())
}
pub fn mcp_server_save(app: AppHandle, state: State<Arc<AppState>>, cfg: Value) -> Result<Value, String> {
    // 11.14.4 — saving a server is a REQUEST TO SPAWN IT, so the program is
    // checked here and not only when it is later called (see `ensure_program_allowed`).
    //
    // Archive-6 audit: the allow-list is not an authorization. `node` is on it, and a server
    // whose arguments are `-e "…"` is arbitrary code the page can register and later call. So a
    // server whose PROGRAM (command + arguments) is new or changed is registered only after a
    // native dialog prints that exact program and its network setting and a human confirms it.
    // An unchanged program (toggling `enabled`/`pinned`) keeps its approval and asks nothing.
    let (command, arg_list, network) = db::mcp_program_of(&cfg);
    if command.is_empty() {
        // Nothing to spawn: stored UNAPPROVED, and it can never run until a program is confirmed.
        return db::mcp_save(&*lock_db(&state)?, &cfg, None).map_err(|e| e.to_string());
    }
    ensure_program_allowed(&state, &command)?;
    let needs = db::mcp_needs_confirmation(&*lock_db(&state)?, &cfg).map_err(|e| e.to_string())?;
    if !needs {
        return db::mcp_save(&*lock_db(&state)?, &cfg, None).map_err(|e| e.to_string());
    }
    let name = cfg["name"].as_str().or_else(|| cfg["id"].as_str()).unwrap_or("(unnamed)").to_string();
    let argline = arg_list.join(" ");
    let confirmed = native_confirm(
        &app,
        &state,
        "SelfImpulse — run a new program?",
        format!(
            "Register the MCP server \"{name}\"?\n\nSelfImpulse will RUN this program whenever the server is used:\n    {command} {argline}\n\nNetwork access: {}\n\nOnly allow a program you recognise. Cancel saves nothing.",
            if network { "ALLOWED" } else { "DENIED (it runs without any network)" }
        ),
        "Allow",
    )?;
    if !confirmed {
        return Err(format!("MCP server \"{name}\": declined at the native dialog — nothing was saved and the program cannot run."));
    }
    db::mcp_save(&*lock_db(&state)?, &cfg, Some("human:dialog")).map_err(|e| e.to_string())
}
pub fn mcp_server_remove(app: AppHandle, state: State<Arc<AppState>>, server_id: String) -> Result<(), String> {
    let list = db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())?;
    let found = list.as_array().and_then(|a| a.iter().find(|s| s["id"] == server_id)).cloned();
    let Some(s) = found else { return Ok(()) }; // already gone: nothing to confirm
    let name = s["name"].as_str().unwrap_or(&server_id).to_string();
    let confirmed = native_confirm(
        &app,
        &state,
        "SelfImpulse — remove an MCP server?",
        format!("Remove the MCP server \"{name}\"?\n\nIts program will no longer be available to SelfImpulse. Cancel keeps it."),
        "Remove",
    )?;
    if !confirmed {
        return Err(format!("MCP server \"{name}\": removal declined at the native dialog — it was kept."));
    }
    db::mcp_remove(&*lock_db(&state)?, &server_id).map_err(|e| e.to_string())
}
pub fn mcp_connect_test(state: State<Arc<AppState>>, server_id: String) -> Result<Value, String> {
    let list = db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())?;
    let found = list.as_array().and_then(|a| a.iter().find(|s| s["id"] == server_id)).cloned();
    let Some(s) = found else { return Ok(json!({"connected": false, "lastError": "unknown server", "toolCount": 0})); };
    // The program that runs must be the program a human approved (see mcp_server_save).
    if let Err(e) = db::mcp_check_approved(&s) {
        return Ok(json!({"connected": false, "lastError": e, "toolCount": 0}));
    }
    let cmd = s.pointer("/config/command").and_then(|v| v.as_str()).unwrap_or("").to_string();
    // 11.14.4 — re-checked at use, not only at save. A row written by an older
    // build, or edited directly in the database, is still covered.
    ensure_program_allowed(&state, &cmd)?;
    let args: Vec<String> = s.pointer("/config/args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let network = s.pointer("/config/network").and_then(|v| v.as_bool()).unwrap_or(true);
    let cwd = state.vendor_dir.parent().unwrap_or(&state.vendor_dir).to_path_buf();
    Ok(mcp::connect_test(&cmd, &args, &cwd, network))
}
pub fn mcp_call(state: State<Arc<AppState>>, server_id: String, tool: String, arguments: Value) -> Result<Value, String> {
    // V7 fix (bug Q): this used to match `tool.starts_with("control")`, which hijacked any real
    // MCP server that happened to expose a tool named control* and answered it from the stub.
    // Only the built-in server is served here.
    if server_id == "mcp.control" {
        // V11 (W2): the control plane gets real database access, so the graph tools mutate
        // and read the store instead of refusing.
        return Ok(control_mcp::dispatch_with_db(&tool, &arguments, &*lock_db(&state)?));
    }
    let list = db::mcp_list(&*lock_db(&state)?).map_err(|e| e.to_string())?;
    let found = list.as_array().and_then(|a| a.iter().find(|s| s["id"] == server_id)).cloned();
    let Some(s) = found else { return Err(format!("unknown MCP server {server_id}")); };
    // The program that runs must be the program a human approved (see mcp_server_save).
    db::mcp_check_approved(&s)?;
    let cmd = s.pointer("/config/command").and_then(|v| v.as_str()).unwrap_or("").to_string();
    // 11.14.4 — the guard that was missing entirely on this path. Without it the
    // stored command was spawned verbatim; see mcp_server_save.
    ensure_program_allowed(&state, &cmd)?;
    let args: Vec<String> = s.pointer("/config/args").and_then(|v| v.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(|s| s.to_string())).collect()).unwrap_or_default();
    let network = s.pointer("/config/network").and_then(|v| v.as_bool()).unwrap_or(true);
    let cwd = state.vendor_dir.parent().unwrap_or(&state.vendor_dir).to_path_buf();
    Ok(mcp::call_tool(&cmd, &args, &cwd, &tool, &arguments, network))
}

/* ------------------------------------------------------------------ browser
 *
 * SelfImpulse SHIPS the browser service inside the product (src-tauri/browser-service/ —
 * materialized into the app-data service directory on first use; nothing is required from
 * outside the product). The service owns the optional Chromium-family browser process.
 * These commands only forward to that service over loopback HTTP; no browser logic lives
 * in this crate. Interactive browsing uses a browser already on the machine (an optional
 * OS capability, reported honestly when absent); fetch-mode goto/extract needs none.
 *
 * The V7 (bug V) fail-closed contract is preserved exactly. If the service is not running, every
 * command reports `notAttached` with a reason that says so, and no session id, page title or engine
 * is ever invented here. An offline browser and a broken browser must look identical to a caller
 * that would otherwise believe it had seen a page.
 */

/// Where the browser service listens. Loopback only; the service accepts no other connections.
fn browser_base() -> String {
    std::env::var("HANDLE_BROWSER_URL").or_else(|_| std::env::var("MJ_BROWSER_URL")).unwrap_or_else(|_| "http://127.0.0.1:9223".to_string())
}

fn browser_down_reason(e: &str) -> String {
    format!(
        "No browser is attached: the SelfImpulse browser service is not answering on {}. Nothing was \
         fetched. Start it with `node <HANDLE_BROWSER_DIR>\\cli.mjs start` (defaults under your \
         app-data directory; set HANDLE_BROWSER_DIR if you keep it elsewhere). ({e})",
        browser_base()
    )
}

fn browser_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        // The service caps a navigation at 120 s; leave headroom on this side.
        .timeout(std::time::Duration::from_secs(150))
        .build()
        .map_err(|e| e.to_string())
}

/// POSTs to the browser service and hands back its JSON body verbatim.
///
/// A transport failure is reshaped into the honest `notAttached` response the stubs used to return,
/// so the Browser page and every agent keep failing closed rather than reading a fabricated result.
async fn browser_call(route: &str, body: Value) -> Value {
    let client = match browser_client() {
        Ok(c) => c,
        Err(e) => return json!({ "ok": false, "notAttached": true, "reason": browser_down_reason(&e) }),
    };
    let url = format!("{}{}", browser_base(), route);
    match client.post(&url).json(&body).send().await {
        Ok(resp) => match resp.json::<Value>().await {
            Ok(v) => v,
            Err(e) => json!({
                "ok": false,
                "notAttached": true,
                "reason": format!("The browser service at {url} replied with something that was not JSON: {e}")
            }),
        },
        Err(e) => json!({ "ok": false, "notAttached": true, "reason": browser_down_reason(&e.to_string()) }),
    }
}

async fn browser_get(route: &str) -> Option<Value> {
    let client = browser_client().ok()?;
    let url = format!("{}{}", browser_base(), route);
    let resp = client.get(&url).send().await.ok()?;
    resp.json::<Value>().await.ok()
}

fn reason_of(r: &Value) -> String {
    r.get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("the browser service did not say why")
        .to_string()
}

/// True only when the service itself reported success.
fn served(r: &Value) -> bool {
    r.get("ok").and_then(|v| v.as_bool()) == Some(true)
}

/* --------------------------------------------------------- autonomous start
 *
 * VH decides it needs a browser; the operator should not also have to remember to start one. If the
 * service is not answering, VH starts it, waits for it to come up, then carries on. If it cannot be
 * started, the caller still fails closed with a reason — autonomy must never become a lie.
 */

/// Cooldown so a service that refuses to start does not turn every command into a process spawn.
static BROWSER_BOOT: std::sync::OnceLock<Mutex<Option<std::time::Instant>>> = std::sync::OnceLock::new();
const BROWSER_BOOT_COOLDOWN: std::time::Duration = std::time::Duration::from_secs(10);
const BROWSER_BOOT_WAIT: std::time::Duration = std::time::Duration::from_secs(25);

fn browser_dir() -> PathBuf {
    match std::env::var("HANDLE_BROWSER_DIR").or_else(|_| std::env::var("MJ_BROWSER_DIR")) {
        Ok(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => {
            // Portable default under the user's app-data directory - never a hardcoded
            // developer-machine path.
            if cfg!(windows) {
                if let Ok(la) = std::env::var("LOCALAPPDATA") {
                    if !la.trim().is_empty() {
                        return PathBuf::from(la).join("SelfImpulse").join("browser-service");
                    }
                }
            }
            if let Ok(home) = std::env::var("HOME") {
                if !home.trim().is_empty() {
                    return PathBuf::from(home).join(".local").join("share").join("selfimpulse").join("browser-service");
                }
            }
            std::env::temp_dir().join("selfimpulse-browser-service")
        }
    }
}

/// Every way we know to find a Node runtime, most trusted first.
///
/// Bare `node` is tried first because it respects whatever the user has on their PATH, but a GUI
/// app does not always inherit the same PATH a terminal shows, so real install locations are
/// probed afterwards rather than trusting the name to resolve.
fn browser_node_candidates() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Ok(n) = std::env::var("HANDLE_BROWSER_NODE").or_else(|_| std::env::var("MJ_BROWSER_NODE")) {
        if !n.trim().is_empty() {
            out.push(n);
        }
    }
    out.push("node".to_string());
    if cfg!(windows) {
        out.push("node.exe".to_string());
        for p in [
            "C:\\Program Files\\nodejs\\node.exe",
            "C:\\Program Files (x86)\\nodejs\\node.exe",
        ] {
            out.push(p.to_string());
        }
        if let Ok(o) = std::process::Command::new("where").arg("node").output() {
            if let Ok(s) = String::from_utf8(o.stdout) {
                if let Some(first) = s.lines().next().map(|l| l.trim().to_string()) {
                    if !first.is_empty() {
                        out.push(first);
                    }
                }
            }
        }
    } else {
        out.push("/usr/local/bin/node".to_string());
        out.push("/usr/bin/node".to_string());
    }
    out
}

/// The Node binary the bundled A2A host is launched with. `node` first so PATH
/// wins on a developer machine, then the same platform fallbacks the browser
/// service uses — the A2A host is our own bundle and needs a runtime, not an
/// agent binary, and there is no third-party tool in this path.
pub fn node_binary() -> String {
    browser_node_candidates()
        .into_iter()
        .find(|c| c != "node")
        .unwrap_or_else(|| "node".to_string())
}

/// Starts the browser service, trying each Node candidate until one actually launches.
fn spawn_browser_service(server: &std::path::Path, dir: &std::path::Path) -> Result<(), String> {
    let mut attempts = Vec::new();
    for bin in browser_node_candidates() {
        let mut cmd = std::process::Command::new(&bin);
        cmd.arg(server).current_dir(dir);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW: no console flash when VH starts the service behind the UI.
            cmd.creation_flags(0x08000000);
        }
        match cmd.spawn() {
            Ok(_) => return Ok(()),
            Err(e) => attempts.push(format!("`{bin}` ({e})")),
        }
    }
    Err(format!(
        "could not launch a Node runtime for the browser service. Tried: {}. Set HANDLE_BROWSER_NODE to the full path of your node.exe.",
        attempts.join(", ")
    ))
}

async fn browser_healthy(client: &reqwest::Client) -> bool {
    matches!(
        client.get(format!("{}/health", browser_base())).send().await,
        Ok(r) if r.status().is_success()
    )
}

/// Is a browser up right now, without starting one? Used by commands where launching a browser
/// would be the wrong thing to do (closing or listing when nothing is running).
async fn browser_running() -> bool {
    match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
    {
        Ok(c) => browser_healthy(&c).await,
        Err(_) => false,
    }
}

/// Ensures the browser service is running, launching it if this is the first thing to need it.
async fn ensure_browser() -> Result<(), String> {
    let probe = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(800))
        .build()
    {
        Ok(c) => c,
        Err(e) => return Err(format!("could not build an http client: {e}")),
    };
    if browser_healthy(&probe).await {
        return Ok(());
    }

    // Another command may already be starting it; only one process should try at a time.
    {
        let mut last = BROWSER_BOOT.get_or_init(|| Mutex::new(None)).lock();
        let now = std::time::Instant::now();
        if let Some(previous) = *last {
            if now.duration_since(previous) < BROWSER_BOOT_COOLDOWN {
                return Err(format!(
                    "the browser service is not answering on {} and a start was already attempted moments ago",
                    browser_base()
                ));
            }
        }
        *last = Some(now);
    }

    let dir = browser_dir();
    let server = dir.join("server.mjs");
    let guard_script = dir.join("browser-guard.script.mjs");
    // The network guard is re-materialized on every boot, not only when the
    // service is missing. A user who edits a stale copy on disk must not be
    // able to run a browser with no containment, and an update must ship the
    // new guard without needing the service to be absent.
    {
        if let Err(e) = std::fs::create_dir_all(&dir) {
            return Err(format!("could not prepare the browser service directory {}: {e}", dir.display()));
        }
        if let Err(e) = std::fs::write(&guard_script, include_str!("../browser-service/browser-guard.script.mjs")) {
            return Err(format!("could not write the browser network guard to {}: {e}", guard_script.display()));
        }
    }
    if !server.exists() {
        // The service ships INSIDE the product (bundled at build time from
        // src-tauri/browser-service/). Materialize it on first use — nothing is
        // required from outside the product for any feature.
        if let Err(e) = std::fs::write(&server, include_str!("../browser-service/server.mjs")) {
            return Err(format!("could not write the bundled browser service to {}: {e}", server.display()));
        }
        let _ = std::fs::write(dir.join("cli.mjs"), include_str!("../browser-service/cli.mjs"));
    }

    spawn_browser_service(&server, &dir)?;

    let deadline = std::time::Instant::now() + BROWSER_BOOT_WAIT;
    while std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_millis(250)).await;
        if browser_healthy(&probe).await {
            return Ok(());
        }
    }
    Err(format!(
        "the browser service did not answer on {} within {}s of being started",
        browser_base(),
        BROWSER_BOOT_WAIT.as_secs()
    ))
}

pub async fn browser_session_create(key: Option<String>) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "engine": null, "sessionId": null, "reason": e });
    }
    // `key` lets an agent ask for *its* browser and get the same one back, so a loop that
    // navigates twenty times drives one tab instead of leaking twenty contexts.
    let r = browser_call("/session/create", json!({ "key": key })).await;
    if served(&r) {
        return r;
    }
    // Fail closed: never hand back a session id that did not come from a real browser.
    json!({
        "ok": false,
        "notAttached": true,
        "engine": null,
        "sessionId": null,
        "reason": reason_of(&r)
    })
}

#[tauri::command]
pub async fn browser_session_close(session_id: String) -> Result<(), String> {
    // Starting a browser purely in order to close a session would be absurd. If none is running,
    // the session this id refers to cannot exist, so closing is already true.
    if !browser_running().await {
        return Ok(());
    }
    let r = browser_call("/session/close", json!({ "sessionId": session_id })).await;
    if served(&r) {
        return Ok(());
    }
    Err(reason_of(&r))
}

#[tauri::command]
pub async fn browser_sessions() -> Value {
    // Read-only: list what exists, never launch a browser just to report that nothing is open.
    if !browser_running().await {
        return json!([]);
    }
    browser_get("/sessions").await.unwrap_or_else(|| json!([]))
}

pub async fn browser_navigate(session_id: String, url: String, timeout_ms: Option<u64>) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "url": url, "title": null, "engine": null, "reason": e });
    }
    let r = browser_call(
        "/navigate",
        json!({ "sessionId": session_id, "url": url, "timeoutMs": timeout_ms }),
    )
    .await;
    if served(&r) {
        return r;
    }
    json!({
        "ok": false,
        // A browser that is attached but refused the URL is not the same as no browser at all.
        "notAttached": r.get("notAttached").and_then(|v| v.as_bool()).unwrap_or(true),
        "url": url,
        "title": null,
        "engine": null,
        "reason": reason_of(&r)
    })
}

/// In-page interaction for the Browser Agent: navigate / click / type / fill / select / hover /
/// scroll / wait / extract / evaluate / back / forward / reload / keyboard.
///
/// The frontend calls this with a flat object (`invoke("browser_act", {...})`), so the fields arrive
/// as individually named arguments rather than one `args` value. `args` is still accepted for
/// callers that wrap their payload, and explicit fields win when both are present.
#[allow(clippy::too_many_arguments)] // the flat invoke(...) surface is 10 named fields by design.
pub async fn browser_act(
    args: Option<Value>,
    session_id: Option<String>,
    action: Option<String>,
    selector: Option<String>,
    value: Option<Value>,
    key: Option<String>,
    url: Option<String>,
    state: Option<String>,
    script: Option<String>,
    timeout_ms: Option<u64>,
) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "reason": e });
    }
    let mut body = match args {
        Some(Value::Object(map)) => Value::Object(map),
        _ => json!({}),
    };
    if let Some(obj) = body.as_object_mut() {
        if let Some(v) = session_id {
            obj.insert("sessionId".into(), Value::String(v));
        }
        if let Some(v) = action {
            obj.insert("action".into(), Value::String(v));
        }
        if let Some(v) = selector {
            obj.insert("selector".into(), Value::String(v));
        }
        if let Some(v) = value {
            obj.insert("value".into(), v);
        }
        if let Some(v) = key {
            obj.insert("key".into(), Value::String(v));
        }
        if let Some(v) = url {
            obj.insert("url".into(), Value::String(v));
        }
        if let Some(v) = state {
            obj.insert("state".into(), Value::String(v));
        }
        if let Some(v) = script {
            obj.insert("script".into(), Value::String(v));
        }
        if let Some(v) = timeout_ms {
            obj.insert("timeoutMs".into(), json!(v));
        }
    }
    browser_call("/act", body).await
}

pub async fn browser_screenshot(session_id: String, full_page: Option<bool>) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "path": null, "reason": e });
    }
    let r = browser_call(
        "/screenshot",
        json!({ "sessionId": session_id, "fullPage": full_page.unwrap_or(false) }),
    )
    .await;
    if served(&r) {
        return r;
    }
    // An empty path must stay indistinguishable from "saved with no filename" (V7 bug V).
    json!({ "ok": false, "notAttached": true, "path": null, "reason": reason_of(&r) })
}

#[tauri::command]
pub async fn browser_console(session_id: String) -> Value {
    if let Err(e) = ensure_browser().await {
        return json!({ "ok": false, "notAttached": true, "console": [], "networkFailures": [], "reason": e });
    }
    let r = browser_call("/console", json!({ "sessionId": session_id })).await;
    if served(&r) {
        return r;
    }
    // Empty lists must never read as "the page was clean" (V7 bug V).
    json!({
        "ok": false,
        "notAttached": true,
        "console": [],
        "networkFailures": [],
        "reason": reason_of(&r)
    })
}

/// Where coding-agent CLIs actually get installed, per platform.
///
/// A packaged app launched from Finder or the Start menu does NOT inherit your shell's PATH, so
/// `claude` installed by npm or Homebrew is invisible to it. This is the single most common
/// reason a native agent workstation reports "harness not installed" while the same command
/// works in a terminal. We search these directories explicitly.
const EXTRA_BIN_DIRS: &[&str] = &[
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/opt/local/bin",
    "$HOME/.local/bin",
    "$HOME/.bun/bin",
    "$HOME/.deno/bin",
    "$HOME/.cargo/bin",
    "$HOME/.npm-global/bin",
    "$HOME/.nvm/versions/node",   // walked one level deeper below (versioned node dirs)
    "$HOME/.volta/bin",
    "$HOME/.fnm",
    "$HOME/Applications",
    "C:\\Program Files\\nodejs",
    "C:\\ProgramData\\chocolatey\\bin",
    "$HOME\\AppData\\Roaming\\npm",
    "$HOME\\AppData\\Local\\Programs",
    "$HOME\\scoop\\shims",
];

fn expand_home(p: &str) -> std::path::PathBuf {
    if let Some(rest) = p.strip_prefix("$HOME") {
        if let Some(h) = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE")) {
            let mut b = std::path::PathBuf::from(h);
            let r = rest.trim_start_matches('/').trim_start_matches('\\');
            if !r.is_empty() { b.push(r); }
            return b;
        }
    }
    std::path::PathBuf::from(p)
}

fn exists_executable(dir: &std::path::Path, bin: &str) -> Option<String> {
    let plain = dir.join(bin);
    if plain.exists() { return Some(plain.display().to_string()); }
    if cfg!(windows) {
        for ext in ["exe", "cmd", "bat"] {
            let with = dir.join(format!("{bin}.{ext}"));
            if with.exists() { return Some(with.display().to_string()); }
        }
    }
    None
}

/// Fast PATH search: the inherited PATH plus known install locations. Never spawns a process, so
/// it is safe to call from a synchronous Tauri command on the main thread.
fn fast_paths() -> Vec<std::path::PathBuf> {
    static CACHE: std::sync::OnceLock<Vec<std::path::PathBuf>> = std::sync::OnceLock::new();
    CACHE.get_or_init(build_fast_paths).clone()
}

fn build_fast_paths() -> Vec<std::path::PathBuf> {
    let mut out: Vec<std::path::PathBuf> = Vec::new();
    if let Some(p) = std::env::var_os("PATH") {
        for d in std::env::split_paths(&p) { push_unique(&mut out, d); }
    }
    for d in EXTRA_BIN_DIRS { push_unique(&mut out, expand_home(d)); }
    // nvm keeps binaries under a versioned directory: ~/.nvm/versions/node/vX.Y.Z/bin
    let nvm = expand_home("$HOME/.nvm/versions/node");
    if let Ok(entries) = std::fs::read_dir(&nvm) {
        for e in entries.flatten() { push_unique(&mut out, e.path().join("bin")); }
    }
    out
}

fn push_unique(out: &mut Vec<std::path::PathBuf>, p: std::path::PathBuf) {
    if !out.contains(&p) { out.push(p); }
}

/// What the user's login shell reports as PATH. Spawns a shell, so it can take ~1s; it is cached
/// after the first call. Only reached when the fast search misses, or when the Providers page asks
/// for diagnostics.
///
/// Note: this must never call back into `which_bin` / `fast_paths` — `OnceLock::get_or_init`
/// deadlocks on re-entrant initialisation.
fn login_shell_paths() -> Vec<std::path::PathBuf> {
    static CACHE: std::sync::OnceLock<Vec<std::path::PathBuf>> = std::sync::OnceLock::new();
    CACHE.get_or_init(|| {
        let mut out: Vec<std::path::PathBuf> = Vec::new();
        for shell in ["/bin/zsh", "/bin/bash", "/bin/sh"] {
            if !std::path::Path::new(shell).exists() { continue; }
            let mut cmd = std::process::Command::new(shell);
            cmd.args(["-lc", "printf %s \"$PATH\""]);
            if let Ok((stdout, _, _)) = run_timeout(cmd, 3) {
                if stdout.trim().len() > 1 {
                    for d in std::env::split_paths(stdout.trim()) { push_unique(&mut out, d); }
                    break;
                }
            }
        }
        out
    }).clone()
}

fn which_bin(bin: &str) -> Option<String> {
    for dir in fast_paths() {
        if let Some(hit) = exists_executable(&dir, bin) { return Some(hit); }
    }
    // A packaged app does not inherit the shell's PATH, so a CLI installed by npm/Homebrew is
    // invisible until we ask the login shell where things live.
    for dir in login_shell_paths() {
        if let Some(hit) = exists_executable(&dir, bin) { return Some(hit); }
    }
    None
}

fn run_timeout(mut cmd: std::process::Command, secs: u64) -> Result<(String, String, Option<i32>), String> {
    use std::io::Read;
    use std::process::Stdio;
    use std::time::{Duration, Instant};
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("spawn: {e}"))?;

    // Coding agents print a lot. Reading only after exit lets the OS pipe buffer fill, the child
    // blocks on write, and VH waits for a child that is waiting for VH. Drain both pipes on
    // threads instead.
    let drain = |pipe: Option<std::process::ChildStdout>| -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Some(mut p) = pipe { let _ = p.read_to_string(&mut buf); }
            buf
        })
    };
    let drain_err = |pipe: Option<std::process::ChildStderr>| -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut buf = String::new();
            if let Some(mut p) = pipe { let _ = p.read_to_string(&mut buf); }
            buf
        })
    };
    let out_handle = drain(child.stdout.take());
    let err_handle = drain_err(child.stderr.take());

    let start = Instant::now();
    let limit = Duration::from_secs(secs.max(1));
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = out_handle.join().unwrap_or_default();
                let stderr = err_handle.join().unwrap_or_default();
                return Ok((stdout, stderr, status.code()));
            }
            Ok(None) => {
                if start.elapsed() > limit {
                    let _ = child.kill();
                    let _ = child.wait();
                    // Killing closes the pipes, so the readers finish instead of leaking.
                    let _ = out_handle.join();
                    let _ = err_handle.join();
                    return Err(format!("timeout after {secs}s"));
                }
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}










/// Diagnostics for the Providers page: exactly where VH looked, and what it found. Without this
/// "not installed" is unactionable.
#[tauri::command]
/// Reports the dev tools the workspace can actually run, and whether the local
/// toolchain is on the PATH.
///
/// 19.7.15: this used to be the external agent CLI inventory — it probed 22
/// coding-agent binaries (claude, codex, cursor-agent, cline, aider, â€¦) by
/// running `which` and `--version` on each, on every call, to decide which seats
/// a crew could use. With that tier removed there is nothing to inventory: the
/// list below is the dev-tool allowlist that `shell_exec` actually enforces, so
/// what this reports is what the app may really run rather than what it wishes it
/// could run. Reporting a removed capability's install state was both misleading
/// and a small standing cost on every call.
pub fn cli_env() -> Value {
    // Keep in sync with SHELL_ALLOWED_PROGRAMS. A tool listed here but not there
    // (or the reverse) means the app would report a capability it cannot exercise.
    let bins = [
        ("node", "node"), ("npm", "npm"), ("npx", "npx"),
        ("python", "python"), ("python3", "python3"),
        ("pip", "pip"), ("pip3", "pip3"), ("pytest", "pytest"),
        ("cargo", "cargo"), ("git", "git"), ("go", "go"),
    ];
    let rows: Vec<Value> = bins.into_iter().map(|(id, bin)| {
        let resolved = which_bin(bin).or_else(|| which_bin(id));
        let version = resolved.as_ref().and_then(|p| probe_version(p));
        json!({
            "id": id,
            "bin": bin,
            "kind": "dev-tool",
            "executable": resolved.clone().map(Value::String).unwrap_or(Value::Null),
            "installed": resolved.is_some(),
            "version": version.map(Value::String).unwrap_or(Value::Null),
        })
    }).collect();
    json!({ "devTools": rows, "count": rows.len() })
}

fn probe_version(program: &str) -> Option<String> {
    let mut cmd = std::process::Command::new(program);
    cmd.arg("--version");
    let (out, err, _) = run_timeout(cmd, 5).ok()?;
    let text = if out.trim().is_empty() { err } else { out };
    text.lines().next().map(|l| l.trim().chars().take(120).collect())
}

pub fn package_export(state: State<Arc<AppState>>, workflow_id: String, _include_history: bool) -> Result<Value, String> {
    let wf = db::workflow_get(&*lock_db(&state)?, &workflow_id).map_err(|e| e.to_string())?;
    Ok(json!({
        "packageFormat": 1,
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "application": "SelfImpulse",
        "version": env!("CARGO_PKG_VERSION"),
        "workflow": { "name": wf["name"], "description": wf["description"], "graph": wf["graph"] },
        "history": [],
        "secretsIncluded": false
    }))
}
pub fn package_import(state: State<Arc<AppState>>, pkg: Value) -> Result<Value, String> {
    // The export names SelfImpulse; packages written before the rename say "VH" and still import.
    if pkg["application"] != "SelfImpulse" && pkg["application"] != "VH" { return Err("package rejected".into()); }
    let name = pkg.pointer("/workflow/name").and_then(|v| v.as_str()).unwrap_or("Imported");
    let desc = pkg.pointer("/workflow/description").and_then(|v| v.as_str()).unwrap_or("");
    let created = db::workflow_create(&*lock_db(&state)?, &format!("{name} (imported)"), desc).map_err(|e| e.to_string())?;
    if let Some(graph) = pkg.pointer("/workflow/graph") {
        db::workflow_save(&*lock_db(&state)?, created["id"].as_str().unwrap_or(""), &format!("{name} (imported)"), desc, graph).map_err(|e| e.to_string())?;
    }
    Ok(json!({ "id": created["id"], "validated": true }))
}

#[tauri::command]
pub fn control_validate_graph(_state: State<Arc<AppState>>, workflow_id: String) -> Value {
    control_mcp::dispatch("validate_graph", &json!({ "workflowId": workflow_id, "native": true, "host": "tauri" }))
}
#[tauri::command]
pub fn control_connect_ports(state: State<Arc<AppState>>, workflow_id: String, source_node_id: String, source_port_id: String, target_node_id: String, target_port_id: String) -> Value {
    control_mcp::dispatch_with_db("connect_ports", &json!({
        "workflowId": workflow_id, "sourceNodeId": source_node_id, "sourcePortId": source_port_id,
        "targetNodeId": target_node_id, "targetPortId": target_port_id
    }), &lock_db(&state).expect("db lock"))
}
#[tauri::command]
pub fn control_disconnect_ports(state: State<Arc<AppState>>, workflow_id: String, wire_id: Option<String>, source_node_id: Option<String>, target_node_id: Option<String>) -> Value {
    control_mcp::dispatch_with_db("disconnect_ports", &json!({
        "workflowId": workflow_id, "wireId": wire_id,
        "sourceNodeId": source_node_id, "targetNodeId": target_node_id
    }), &lock_db(&state).expect("db lock"))
}
#[tauri::command]
pub fn control_list_nodes(state: State<Arc<AppState>>, workflow_id: String) -> Value {
    control_mcp::dispatch_with_db("list_nodes", &json!({ "workflowId": workflow_id }), &lock_db(&state).expect("db lock"))
}
pub fn control_run_workflow(state: State<Arc<AppState>>, workflow_id: String) -> Value {
    control_mcp::dispatch_with_db("run_workflow", &json!({ "workflowId": workflow_id }), &lock_db(&state).expect("db lock"))
}

use rusqlite::OptionalExtension;
use tauri::Emitter;

// ------------------------------------------------------------------ ACP bridge (V11 W1)
// Pipes for src/mission/acp.ts. The child process is owned by Rust; the WebView speaks the
// protocol. See src-tauri/src/acp.rs for the design notes.





/* ── C-3 regression tests (security review of archive 3) ────────────────────
 * The credential/system refusal used to be built from suffix strings and
 * silently never fired. These vectors are the reviewer's exact cases plus the
 * trailing-separator, case and extended-prefix variants, expressed so they
 * pass on ANY host (the logic is string-level; non-existent Windows paths
 * fall back to the lexical form, which is what the old test-less code got
 * wrong even there).
 *
 *   cargo test c3_    (Windows and unix alike)
 * ────────────────────────────────────────────────────────────────────────── */
#[cfg(test)]
mod c3_credential_path_tests {
    use super::{path_components_lower, refuse_uncontainable_root};

    fn refused(root: &str) -> bool {
        refuse_uncontainable_root(root).is_some()
    }

    #[test]
    fn credential_dirs_are_refused_verbatim() {
        assert!(refused(r"C:\Users\me\.ssh"), ".ssh must be refused");
        assert!(refused(r"C:\Users\me\.aws"), ".aws must be refused");
        assert!(refused(r"C:\Users\me\.kube"), ".kube must be refused");
        assert!(refused(r"C:\Users\me\.docker"), ".docker must be refused");
        assert!(refused(r"C:\Users\me\.gnupg"), ".gnupg must be refused");
        assert!(refused(r"C:\Users\me\.azure"), ".azure must be refused");
        assert!(refused(r"C:\Users\me\.config\gcloud"), ".config\\gcloud must be refused");
    }

    #[test]
    fn trailing_separator_variant_is_refused() {
        // THE C-3 vector: with_sep ended in `\`, so ends_with(`\.ssh`) was false.
        assert!(refused(r"C:\Users\me\.ssh\"), "trailing backslash must not defeat the check");
        assert!(refused("C:/Users/me/.ssh/"), "trailing forward slash too");
    }

    #[test]
    fn case_variant_is_refused() {
        assert!(refused(r"C:\USERS\ME\.SSH"));
        assert!(refused(r"c:\Users\Meadow\.AwS"));
    }

    #[test]
    fn extended_length_prefix_variant_is_refused() {
        // Windows canonicalize() returns \\?\C:\… — the old exact-string
        // comparison never matched a path in that form either.
        assert!(refused(r"\\?\C:\Users\me\.ssh"));
        assert!(refused(r"\\?\C:\Users"));
    }

    #[test]
    fn plain_workspaces_are_allowed() {
        assert!(refuse_uncontainable_root(r"C:\Users\me\projects\ship").is_none());
        assert!(refuse_uncontainable_root("/home/dev/repo").is_none());
        // a directory that MEREly contains .ssh deeper is fine — only the tail matters
        assert!(refuse_uncontainable_root(r"C:\work\vendor\.ssh-tools").is_none());
    }

    #[test]
    fn system_dirs_and_volume_roots_are_refused() {
        assert!(refused(r"C:\Users"), "system dir by components");
        assert!(refused(r"C:\Windows\System32"), "system32 by components");
        assert!(refused(r"C:\"), "drive root");
        assert!(refused(r"\\server\share"), "UNC share root");
    }

    #[test]
    fn normalizer_contract() {
        assert_eq!(path_components_lower(r"\\?\C:\Users\ME\.SSH\"), ["c:", "users", "me", ".ssh"]);
        assert_eq!(path_components_lower("C:/Users/me/.ssh/"), ["c:", "users", "me", ".ssh"]);
        assert_eq!(path_components_lower(r"\\?\UNC\srv\share"), ["srv", "share"]);
        assert_eq!(path_components_lower(r".config\gcloud"), [".config", "gcloud"]);
    }
}
