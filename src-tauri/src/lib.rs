// glance — Tauri v2 shell around the web app.
// Two native jobs:
//  1. Launch/association: when glance is opened with a file path, read it and
//     hand it to the frontend (get_launch_file command / open-file event).
//  2. Live-reload: watch the current file's folder and emit file-changed when
//     it's modified on disk (external editor), so the frontend re-renders.

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Serialize, Clone)]
struct OpenedFile {
    name: String,
    text: String,
    path: String,
}

/// Holds the active watcher so it stays alive; replaced when a new file is watched.
struct WatchState(Mutex<Option<RecommendedWatcher>>);

fn read_opened(path: &PathBuf) -> Option<OpenedFile> {
    let text = std::fs::read_to_string(path).ok()?;
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "untitled.md".to_string());
    Some(OpenedFile {
        name,
        text,
        path: path.to_string_lossy().to_string(),
    })
}

/// First readable file path among process args (skips flags).
fn file_from_args(args: &[String]) -> Option<OpenedFile> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .find_map(|a| read_opened(&PathBuf::from(a)))
}

/// Called by the frontend on startup to pick up a launched file.
#[tauri::command]
fn get_launch_file() -> Option<OpenedFile> {
    file_from_args(&std::env::args().collect::<Vec<_>>())
}

/// Watch `path`'s parent directory and emit `file-changed` when that file is
/// modified. Watching the directory (not the file) survives atomic saves where
/// editors write a temp file and rename over the original. Replaces any prior watch.
#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    state: tauri::State<WatchState>,
    path: String,
) -> Result<(), String> {
    let target = PathBuf::from(&path);
    let dir = target
        .parent()
        .map(|p| p.to_path_buf())
        .ok_or("file has no parent directory")?;
    let target_for_cb = target.clone();
    let app_for_cb = app.clone();

    let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
        let Ok(event) = res else { return };
        if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
            return;
        }
        if event.paths.iter().any(|p| p == &target_for_cb) {
            if let Some(file) = read_opened(&target_for_cb) {
                let _ = app_for_cb.emit("file-changed", file);
            }
        }
    })
    .map_err(|e| e.to_string())?;

    watcher
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(watcher);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance first: a second launch forwards its args instead of
        // opening a new window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(file) = file_from_args(&argv) {
                let _ = app.emit("open-file", file);
            }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .manage(WatchState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![get_launch_file, watch_file])
        .run(tauri::generate_context!())
        .expect("error while running glance");
}
