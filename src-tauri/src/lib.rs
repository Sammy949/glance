// glance — Tauri v2 shell around the web app.
// Headline job: when glance is launched with a file path (double-clicking a
// .md, or via the OS file association), read that file and hand it to the
// frontend. Everything else (rendering, editing) is the same web core.

use serde::Serialize;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

#[derive(Serialize, Clone)]
struct OpenedFile {
    name: String,
    text: String,
    path: String,
}

/// Find the first readable file path in a set of process args (skips flags).
fn file_from_args(args: &[String]) -> Option<OpenedFile> {
    for arg in args.iter().skip(1) {
        if arg.starts_with('-') {
            continue;
        }
        let path = PathBuf::from(arg);
        if let Ok(text) = std::fs::read_to_string(&path) {
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "untitled.md".to_string());
            return Some(OpenedFile {
                name,
                text,
                path: path.to_string_lossy().to_string(),
            });
        }
    }
    None
}

/// Called by the frontend on startup to pick up a file glance was launched with.
#[tauri::command]
fn get_launch_file() -> Option<OpenedFile> {
    file_from_args(&std::env::args().collect::<Vec<_>>())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance: a second launch (e.g. double-clicking another .md)
        // forwards its args to the running window instead of opening a new one.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = file_from_args(&argv) {
                let _ = app.emit("open-file", file);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![get_launch_file])
        .run(tauri::generate_context!())
        .expect("error while running glance");
}
