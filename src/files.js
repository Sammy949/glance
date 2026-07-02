/* files.js — opening and saving markdown via the File System Access API,
 * with graceful fallbacks for browsers/contexts where it's unavailable.
 * A "doc" is { name, text, handle }, where handle may be null (no write-back). */

const MD_ACCEPT = {
  description: 'Markdown',
  accept: { 'text/markdown': ['.md', '.markdown', '.mdown', '.mkd'], 'text/plain': ['.txt'] },
};

async function handleToDoc(handle) {
  const file = await handle.getFile();
  return { name: file.name, text: await file.text(), handle };
}

/** Open a file the user picks. Returns a doc, or null if cancelled. */
export async function pickFile() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: [MD_ACCEPT] });
      return await handleToDoc(handle);
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      // fall through to input fallback on unexpected errors
    }
  }
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), {
      type: 'file',
      accept: '.md,.markdown,.mdown,.mkd,.txt',
    });
    input.onchange = async () => {
      const f = input.files[0];
      resolve(f ? { name: f.name, text: await f.text(), handle: null } : null);
    };
    input.click();
  });
}

/** Build a doc from a drag-and-drop event; grabs a writable handle when possible. */
export async function fromDrop(dataTransfer) {
  const item = dataTransfer.items && dataTransfer.items[0];
  if (item && item.getAsFileSystemHandle) {
    try {
      const handle = await item.getAsFileSystemHandle();
      if (handle && handle.kind === 'file') return await handleToDoc(handle);
    } catch { /* fall back to plain file below */ }
  }
  const f = dataTransfer.files && dataTransfer.files[0];
  return f ? { name: f.name, text: await f.text(), handle: null } : null;
}

/** Read a doc from a handle delivered by the PWA file handler (launchQueue). */
export async function fromHandle(handle) {
  return handleToDoc(handle);
}

/**
 * Save text back to disk.
 * - With a handle: writes in place (requesting readwrite permission).
 * - Without: prompts Save As (or downloads if the API is unavailable).
 * Returns the handle written to (or null on download fallback).
 */
export async function saveFile({ handle, text, name }) {
  let h = handle;
  if (!h) {
    if (window.showSaveFilePicker) {
      h = await window.showSaveFilePicker({ suggestedName: name || 'untitled.md', types: [MD_ACCEPT] });
    } else {
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name || 'untitled.md' });
      a.click();
      URL.revokeObjectURL(url);
      return null;
    }
  }
  if (h.requestPermission) {
    const perm = await h.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('write permission denied');
  }
  const writable = await h.createWritable();
  await writable.write(text);
  await writable.close();
  return h;
}
