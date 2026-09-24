/* platform.js — bridges the web app to the native Tauri shell when present.
 * Uses the global `window.__TAURI__` (config: app.withGlobalTauri = true), so
 * there's no npm dependency and the same files run as a plain PWA in a browser. */

export const isTauri = () =>
  typeof window !== 'undefined' && !!window.__TAURI__;

export async function pickNativeDocument() {
  const file = await window.__TAURI__.core.invoke('open_native_file');
  return file ? { ...file, handle: null } : null;
}

export async function saveNativeDocument({ path, name, text }) {
  return window.__TAURI__.core.invoke('save_native_file', { path, name, text });
}

/**
 * When running under Tauri, deliver files glance was launched with:
 *  - on startup: files passed on the command line / via file association
 *  - later: files from a second launch, forwarded by the single-instance plugin
 *  - live: `file-changed` when the watched file is modified on disk
 * `onFile` handles opens; `onChange` handles external edits. Both receive a
 * { name, text, path, handle:null } doc.
 */
export async function initNativeLaunch(onFile, onChange) {
  if (!isTauri()) return;
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  const toDoc = (f) => ({ name: f.name, text: f.text, path: f.path, handle: null });

  try {
    const files = await invoke('get_launch_files');
    for (const file of files || []) if (typeof file.text === 'string') await onFile(toDoc(file));
  } catch (e) {
    console.warn('[glance] get_launch_files failed:', e);
  }

  try {
    await listen('open-files', async (e) => {
      for (const file of e.payload || []) await onFile(toDoc(file));
    });
  } catch (e) {
    console.warn('[glance] open-files listener failed:', e);
  }

  try {
    await listen('file-changed', (e) => { if (e.payload && onChange) onChange(toDoc(e.payload)); });
  } catch (e) {
    console.warn('[glance] file-changed listener failed:', e);
  }
}

/** Ask the native side to watch `path` and emit file-changed on modification. */
export async function watchFile(path) {
  if (!isTauri() || !path) return;
  try { await window.__TAURI__.core.invoke('watch_file', { path }); }
  catch (e) { console.warn('[glance] watch_file failed:', e); }
}
