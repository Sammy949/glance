// glance — Tauri v2 shell around the web app.
// Two native jobs:
//  1. Launch/association: read file paths and hand them to the frontend
//     (get_launch_files command / open-files event).
//  2. Live-reload: watch the current file's folder and emit file-changed when
//     it's modified on disk (external editor), so the frontend re-renders.

use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize, Clone)]
struct OpenedFile {
    name: String,
    text: String,
    path: String,
}

/// Holds the active watcher so it stays alive; replaced when a new file is watched.
struct WatchState(Mutex<Option<RecommendedWatcher>>);
struct FileAccess(Mutex<HashSet<PathBuf>>);

fn allow_file(app: &tauri::AppHandle, path: &PathBuf) {
    app.state::<FileAccess>().0.lock().unwrap().insert(path.clone());
}

fn read_opened(path: &PathBuf) -> Option<OpenedFile> {
    let path = std::fs::canonicalize(path).ok()?;
    let text = std::fs::read_to_string(&path).ok()?;
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

/// Read every file path passed through an OS file association (skips flags).
fn files_from_args(args: &[String]) -> Vec<OpenedFile> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .filter_map(|a| read_opened(&PathBuf::from(a)))
        .collect()
}

/// Called by the frontend on startup to pick up launched files.
#[tauri::command]
fn get_launch_files(app: tauri::AppHandle) -> Vec<OpenedFile> {
    let files = files_from_args(&std::env::args().collect::<Vec<_>>());
    for file in &files { allow_file(&app, &PathBuf::from(&file.path)); }
    files
}

#[tauri::command]
async fn open_native_file(app: tauri::AppHandle) -> Result<Option<OpenedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app.dialog().file()
            .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "txt"])
            .blocking_pick_file();
        let Some(picked) = picked else { return Ok(None) };
        let path = picked.into_path().map_err(|e| e.to_string())?;
        let file = read_opened(&path).ok_or("Could not read file")?;
        allow_file(&app, &PathBuf::from(&file.path));
        Ok(Some(file))
    }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_native_file(
    app: tauri::AppHandle,
    path: Option<String>,
    name: String,
    text: String,
) -> Result<Option<OpenedFile>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = if let Some(path) = path {
            let target = std::fs::canonicalize(&path).map_err(|e| e.to_string())?;
            if !app.state::<FileAccess>().0.lock().unwrap().contains(&target) {
                return Err("File is not open in glance".to_string());
            }
            target
        } else {
            let picked = app.dialog().file()
                .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "txt"])
                .set_file_name(name.clone())
                .blocking_save_file();
            let Some(picked) = picked else { return Ok(None) };
            picked.into_path().map_err(|e| e.to_string())?
        };
        std::fs::write(&target, &text).map_err(|e| e.to_string())?;
        let file = read_opened(&target).ok_or("Could not reopen saved file")?;
        allow_file(&app, &PathBuf::from(&file.path));
        Ok(Some(file))
    }).await.map_err(|e| e.to_string())?
}

/// Watch `path`'s parent directory and emit `file-changed` when that file is
/// modified. Watching the directory (not the file) survives atomic saves where
/// editors write a temp file and rename over the original. Replaces any prior watch.
#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    state: tauri::State<WatchState>,
    path: String,
) -> Result<Option<OpenedFile>, String> {
    let target = PathBuf::from(&path);
    let target = std::fs::canonicalize(target).map_err(|e| e.to_string())?;
    if !app.state::<FileAccess>().0.lock().unwrap().contains(&target) {
        return Err("File is not open in glance".to_string());
    }
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
    Ok(read_opened(&target))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance first: a second launch forwards its args instead of
        // opening a new window.
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let files = files_from_args(&argv);
            for file in &files { allow_file(app, &PathBuf::from(&file.path)); }
            if !files.is_empty() { let _ = app.emit("open-files", files); }
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .manage(WatchState(Mutex::new(None)))
        .manage(FileAccess(Mutex::new(HashSet::new())))
        .invoke_handler(tauri::generate_handler![get_launch_files, open_native_file, save_native_file, watch_file])
        .run(tauri::generate_context!())
        .expect("error while running glance");
}
