/* folder.js — folder mode (v0.2). Open a directory, walk it for markdown files,
 * resolve relative asset/link paths against a file's directory, and persist the
 * chosen directory handle in IndexedDB so it can be reoffered next session.
 * Uses the File System Access API (Chromium / WebView2). */

export const MD_RE = /\.(md|markdown|mdown|mkd)$/i;

/* ---------------- IndexedDB handle store ---------------- */

const DB_NAME = 'glance';
const STORE = 'handles';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveHandle(key, handle) {
  try {
    const db = await openDb();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, key);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch { /* non-fatal */ }
}

export async function loadHandle(key) {
  try {
    const db = await openDb();
    return await new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const rq = tx.objectStore(STORE).get(key);
      rq.onsuccess = () => res(rq.result || null);
      rq.onerror = () => res(null);
    });
  } catch { return null; }
}

/* ---------------- directory access ---------------- */

export function supported() { return typeof window !== 'undefined' && !!window.showDirectoryPicker; }

export async function pickDirectory() {
  if (!supported()) return null;
  try { return await window.showDirectoryPicker(); }
  catch { return null; } // AbortError on cancel
}

/** Is read permission already granted (no prompt)? */
export async function isGranted(handle) {
  if (!handle.queryPermission) return true;
  return (await handle.queryPermission({ mode: 'read' })) === 'granted';
}

/** Request read permission (must be called from a user gesture). */
export async function requestPermission(handle) {
  if (!handle.requestPermission) return true;
  return (await handle.requestPermission({ mode: 'read' })) === 'granted';
}

/* ---------------- tree ---------------- */

/**
 * Recursively build { name, kind:'dir', handle, children[] } for markdown files,
 * skipping hidden/system dirs and folders with no markdown inside. File nodes
 * carry their parent dir handle for relative resolution.
 */
export async function buildTree(dirHandle, prefix = []) {
  const node = { name: dirHandle.name, kind: 'dir', handle: dirHandle, children: [] };
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const child = await buildTree(handle, [...prefix, name]);
      if (child.children.length) node.children.push(child);
    } else if (MD_RE.test(name)) {
      // parentPath = directory segments from the root to this file
      node.children.push({ name, kind: 'file', handle, parentPath: prefix });
    }
  }
  node.children.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1
  );
  return node;
}

export function firstFile(node) {
  for (const child of node.children) {
    if (child.kind === 'file') return child;
    const found = firstFile(child);
    if (found) return found;
  }
  return null;
}

/**
 * Resolve absolute-from-root path segments (…dirs, filename) to a file handle,
 * walking down from the root directory. Returns { fileHandle, dirHandle } or null.
 */
export async function resolveSegments(root, segments) {
  if (!segments.length) return null;
  let dir = root;
  for (let i = 0; i < segments.length - 1; i++) {
    try { dir = await dir.getDirectoryHandle(segments[i]); } catch { return null; }
  }
  try {
    const fileHandle = await dir.getFileHandle(segments[segments.length - 1]);
    return { fileHandle, dirHandle: dir };
  } catch { return null; }
}
