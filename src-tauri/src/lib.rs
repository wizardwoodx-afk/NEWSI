mod a2a_host;
mod commands;
mod grants;
mod guard;
mod migrate;  /* C-1: the privileged IPC surface is registered from here, not from commands. */
pub mod db;
mod control_mcp;
mod git;
mod hermes;
pub mod contain;
mod mcp;
mod secrets;

use commands::AppState;
use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // 14.1.1-windows-fix: the updater plugin init was removed. It was
        // initialized with no `plugins.updater` config section, which is a
        // fatal PluginInitialization error — every desktop build exited 101
        // before setup with no window and no log. The updater has no
        // endpoints, no pubkey, no artifacts and zero callers, so the init
        // line goes; updates remain "download the new zip and reinstall".
        // Re-add ONLY together with a real `plugins.updater` config section.
        .setup(|app| {
            let data = app.path().app_data_dir().unwrap_or_else(|_| std::env::temp_dir().join("selfimpulse"));
            /* The bundle identifier was renamed (com.elevenhandle.app → com.selfimpulse.app) and the
               data directory is derived from it: copy an existing install's data across ONCE, before
               anything creates the new directory. Copy-only — the old directory is never touched. */
            match migrate::migrate_legacy_data(&data, &["vh.sqlite", "mj.sqlite"]) {
                migrate::Migration::Copied { files } => eprintln!("SelfImpulse: carried {files} file(s) over from the pre-rename data directory"),
                migrate::Migration::Failed(e) => eprintln!("SelfImpulse: the legacy data migration failed ({e}); starting fresh — the old directory was not touched and the migration will be retried"),
                migrate::Migration::NotNeeded => {}
            }
            let _ = std::fs::create_dir_all(data.join("artifacts"));
            let _ = std::fs::create_dir_all(data.join("skills"));
            /* 19.5.1 identity migration — the active store is vh.sqlite; a
               legacy mj.sqlite from pre-19.5.1 builds is renamed in place
               (data preserved, nothing re-created under the old name). */
            let db_path = data.join("vh.sqlite");
            if !db_path.exists() {
                let legacy = data.join("mj.sqlite");
                if legacy.exists() { let _ = std::fs::rename(&legacy, &db_path); }
            }
            let conn = db::open(&db_path).expect("open sqlite");
            db::seed_mcp_if_empty(&conn).ok();
            let cwd = std::env::current_dir().unwrap_or_default();
            let resource = app.path().resource_dir().unwrap_or(cwd.clone());
            let vendor = hermes::vendor_dir(&resource, &cwd);
            app.manage(Arc::new(AppState {
                db: Mutex::new(conn),
                db_path,
                data_dir: data,
                vendor_dir: vendor,
                secrets: secrets::SecretStore::new(),
                grants: grants::ExecGrants::new(),
                prompts: grants::DialogThrottle::new(),
            }));
            /* The window-state plugin restores the size the user last had, which
               is correct — but a size saved on a larger display can exceed the
               display the app is now on. A window wider than the screen pushes
               the window controls (which this app draws itself, because the
               window is frameless) off-screen, leaving no way to close it.
               Clamp to the current monitor before the window is shown. */
            if let Some(win) = app.get_webview_window("main") {
                let monitor_size: Option<(u32, u32)> = match win.current_monitor() {
                    Ok(Some(mon)) => {
                        let s = mon.size();
                        Some((s.width, s.height))
                    }
                    _ => None,
                };
                if let Some((mw_px, mh_px)) = monitor_size {
                    let sf = win.scale_factor().unwrap_or(1.0);
                    let (mw, mh) = (mw_px as f64 / sf, mh_px as f64 / sf);
                    let (cur_w, cur_h) = win
                        .outer_size()
                        .map(|s| (s.width as f64 / sf, s.height as f64 / sf))
                        .unwrap_or((0.0, 0.0));
                    // Leave room for the taskbar / window frame so the titlebar
                    // and the close control are always reachable.
                    let max_w = (mw - 32.0).max(640.0);
                    let max_h = (mh - 64.0).max(480.0);
                    if cur_w > max_w || cur_h > max_h {
                        let _ = win.set_size(tauri::LogicalSize::new(
                            cur_w.min(max_w).round(),
                            cur_h.min(max_h).round(),
                        ));
                    }
                    if cur_w > max_w {
                        let _ = win.center();
                    }
                }
            }

            let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit SelfImpulse", true, None::<&str>)?;
            let show = tauri::menu::MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
            let run = tauri::menu::MenuItem::with_id(app, "run", "Run active workflow", true, None::<&str>)?;
            let menu = tauri::menu::Menu::with_items(app, &[&show, &run, &quit])?;
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("SelfImpulse")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let w = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = w.hide();
                    }
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            a2a_host::a2a_host_start,
            a2a_host::a2a_host_status,
            a2a_host::a2a_host_stop,
            commands::db_maintenance,
            commands::workflow_list,
            commands::workflow_get,
            commands::workflow_create,
            commands::workflow_delete,
            commands::workflow_save,
            commands::workflow_version_create,
            commands::workflow_versions,
            commands::workflow_version_restore,
            commands::node_state_load,
            commands::node_state_save,
            commands::memory_add,
            commands::memory_search,
            commands::memory_delete,
            commands::skills_list,
            commands::skill_touch,
            commands::skill_deactivate,
            commands::skill_upsert,
            commands::feedback_add,
            commands::feedback_list,
            commands::evaluation_save,
            commands::evaluation_history,
            commands::suite_list,
            commands::suite_save,
            commands::evolution_propose_save,
            commands::evolution_list,
            guard::evolution_decide,
            guard::evolution_rollback,
            commands::approval_request,
            commands::approval_get,
            commands::approval_list,
            guard::approval_decide,
            guard::approval_authorize,
            commands::execution_create,
            commands::execution_finish,
            commands::event_emit,
            commands::execution_events,
            commands::execution_trace,
            commands::execution_list,
            commands::dlq_add,
            commands::dlq_list,
            commands::dlq_resolve,
            commands::run_request_take,
            commands::evolution_service_health,
            commands::evolution_service_propose,
            guard::hermes_bridge,
            guard::secret_set,
            guard::secret_delete,
            commands::secret_exists,
            guard::secret_get,
            guard::provider_bind_endpoint,
            commands::provider_endpoints_list,
            commands::provider_unbind_endpoint,
            guard::exec_grant_request,
            commands::exec_grants_status,
            commands::exec_grants_revoke,
            guard::llm_chat,
            guard::fs_read,
            guard::fs_write,
            guard::fs_list,
            guard::fs_mkdir,
            guard::fs_remove,
            guard::shell_exec,
            guard::workspace_root_add,
            guard::workspace_root_remove,
            commands::workspace_root_list,
            commands::mcp_server_list,
            guard::mcp_server_save,
            guard::mcp_server_remove,
            guard::mcp_connect_test,
            guard::mcp_call,
            guard::browser_session_create,
            commands::browser_session_close,
            commands::browser_sessions,
            guard::browser_navigate,
            guard::browser_act,
            guard::browser_screenshot,
            commands::browser_console,
            commands::cli_env,
            guard::package_export,
            guard::package_import,
            commands::control_validate_graph,
            commands::control_connect_ports,
            commands::control_disconnect_ports,
            commands::control_list_nodes,
            guard::control_run_workflow,
            git::git_is_repo,
            git::git_status,
            git::git_diff,
            git::git_head,
            git::git_branch,
            git::git_read_only_check,
        ])
        .build(tauri::generate_context!())
        .expect("error while building SelfImpulse")
        .run(|_app, event| {
            // A federation listener that outlives the app it belongs to is the
            // failure this module exists to prevent: a peer would keep reaching a
            // card for a machine whose owner closed the window.
            if matches!(event, tauri::RunEvent::Exit) {
                a2a_host::shutdown();
            }
        });
}
