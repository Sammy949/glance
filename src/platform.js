/* platform.js — bridges the web app to the native Tauri shell when present.
 * Uses the global `window.__TAURI__` (config: app.withGlobalTauri = true), so
 * there's no npm dependency and the same files run as a plain PWA in a browser. */

export const isTauri = () =>
  typeof window !== 'undefined' && !!window.__TAURI__;

/**
 * When running under Tauri, deliver files glance was launched with:
 *  - on startup: the file passed on the command line / via file association
 *  - later: files from a second launch, forwarded by the single-instance plugin
 * `onFile` receives a { name, text, handle:null } doc.
 */
export async function initNativeLaunch(onFile) {
  if (!isTauri()) return;
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;

  const deliver = (f) => {
    if (f && typeof f.text === 'string') onFile({ name: f.name, text: f.text, handle: null });
  };

  try {
    deliver(await invoke('get_launch_file'));
  } catch (e) {
    console.warn('[glance] get_launch_file failed:', e);
  }

  try {
    await listen('open-file', (event) => deliver(event.payload));
  } catch (e) {
    console.warn('[glance] open-file listener failed:', e);
  }
}
