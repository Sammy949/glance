/* main.js — glance orchestrator: state, rendering, edit mode, files, PWA glue. */

import { createRenderer } from './pipeline.js';
import { initTheme, toggleTheme } from './theme.js';
import { pickFile, saveFile, fromDrop, fromHandle } from './files.js';
import { ICONS } from './icons.js';
import { isTauri, initNativeLaunch, watchFile } from './platform.js';
import * as find from './find.js';
import { randomizeFavicon } from './favicon.js';
import * as folder from './folder.js';

const els = {
  content: document.getElementById('content'),
  editor: document.getElementById('editor'),
  workspace: document.getElementById('workspace'),
  empty: document.getElementById('empty'),
  toast: document.getElementById('toast'),
  btnOpen: document.getElementById('btn-open'),
  btnOpen2: document.getElementById('btn-open-2'),
  btnNew: document.getElementById('btn-new'),
  btnNew2: document.getElementById('btn-new-2'),
  btnSave: document.getElementById('btn-save'),
  btnEdit: document.getElementById('btn-edit'),
  btnTheme: document.getElementById('btn-theme'),
  btnImages: document.getElementById('btn-images'),
  btnWidth: document.getElementById('btn-width'),
  findbar: document.getElementById('findbar'),
  findInput: document.getElementById('find-input'),
  findCount: document.getElementById('find-count'),
  findPrev: document.getElementById('find-prev'),
  findNext: document.getElementById('find-next'),
  findClose: document.getElementById('find-close'),
  btnFolder: document.getElementById('btn-folder'),
  btnFolder2: document.getElementById('btn-folder-2'),
  btnSidebar: document.getElementById('btn-sidebar'),
  sidebar: document.getElementById('sidebar'),
  folderName: document.getElementById('folder-name'),
  fileTree: document.getElementById('file-tree'),
  btnFolderClose: document.getElementById('btn-folder-close'),
};

const state = {
  name: null,
  key: null,           // identity for scroll memory (path || name)
  text: '',
  handle: null,
  mode: 'read',        // 'read' | 'edit'
  imagesAllowed: false,
  dirty: false,
  theme: 'light',
  readingWidth: false,
  root: null,          // folder-mode root directory handle
  relDir: null,        // current file's dir segments from root (null = not in folder)
};

/* tiny localStorage JSON helpers */
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let renderer = null;
const rendererReady = createRenderer().then((r) => (renderer = r));

state.theme = initTheme();
state.readingWidth = store.get('glance.readingWidth', false);
randomizeFavicon();

/* ---------------- rendering ---------------- */

async function renderPreview() {
  await rendererReady;
  revokeObjectUrls();
  els.content.innerHTML = renderer.render(state.text);
  els.content.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  addCopyButtons();
  markRemoteImages();
  await resolveRelativeAssets();
  find.setContainer(els.content);
}

/* ---------------- folder mode: relative assets ---------------- */

let objectUrls = [];
function revokeObjectUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

/* Normalize a relative path against the current file's dir → segments from root,
 * or null if it escapes the root or is empty. */
function resolveRel(relPath) {
  const base = (state.relDir || []).slice();
  for (const p of relPath.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') { if (!base.length) return null; base.pop(); }
    else base.push(p);
  }
  return base.length ? base : null;
}

/* In folder mode, swap relative <img> srcs for blob URLs read from disk. */
async function resolveRelativeAssets() {
  if (!state.root || state.relDir == null) return;
  for (const img of els.content.querySelectorAll('img[src]')) {
    const raw = img.getAttribute('src') || '';
    if (!raw || /^(https?:|data:|blob:)/i.test(raw)) continue;
    const segs = resolveRel(decodeURIComponent(raw.split('#')[0].split('?')[0]));
    if (!segs) continue;
    const res = await folder.resolveSegments(state.root, segs);
    if (res) {
      try {
        const url = URL.createObjectURL(await res.fileHandle.getFile());
        objectUrls.push(url);
        img.src = url;
      } catch { /* unreadable — leave as-is */ }
    }
  }
}

/* hover "copy" button on each code block */
function addCopyButtons() {
  els.content.querySelectorAll('pre').forEach((pre) => {
    const code = pre.querySelector('code');
    if (!code) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.title = 'Copy';
    btn.setAttribute('aria-label', 'Copy code');
    btn.innerHTML = ICONS.copy;
    btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code.textContent); }
      catch { return; }
      btn.innerHTML = ICONS.check;
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = ICONS.copy; btn.classList.remove('copied'); }, 1200);
    });
    pre.appendChild(btn);
  });
}

/* Remote images are blocked by default (Peek's privacy default). */
function markRemoteImages() {
  let found = false;
  els.content.querySelectorAll('img[src]').forEach((img) => {
    const src = img.getAttribute('src') || '';
    if (/^https?:/i.test(src)) {
      img.dataset.remote = src;
      if (!state.imagesAllowed) img.removeAttribute('src');
      found = true;
    }
  });
  els.btnImages.hidden = !found;
  updateImagesButton();
}

function updateImages() {
  els.content.querySelectorAll('img[data-remote]').forEach((img) => {
    if (state.imagesAllowed) img.src = img.dataset.remote;
    else img.removeAttribute('src');
  });
  updateImagesButton();
}

function updateImagesButton() {
  els.btnImages.innerHTML = state.imagesAllowed ? ICONS.imageOff : ICONS.image;
  const label = state.imagesAllowed ? 'Hide remote images' : 'Load remote images';
  els.btnImages.title = label;
  els.btnImages.setAttribute('aria-label', label);
}

/* ---------------- document lifecycle ---------------- */

async function loadDoc(doc) {
  closeFind();
  state.name = doc.name || 'untitled.md';
  state.key = doc.path || doc.name || 'untitled.md';
  state.text = doc.text || '';
  state.handle = doc.handle || null;
  state.relDir = doc.relDir ?? null;
  state.dirty = false;
  els.editor.value = state.text;
  els.empty.hidden = true;
  els.workspace.hidden = false;
  els.btnSave.hidden = false;
  els.btnEdit.hidden = false;
  els.btnWidth.hidden = false;
  updateTitle();
  await renderPreview();
  // one-shot enter animation (read loads only; live edits call renderPreview directly)
  els.content.classList.remove('enter');
  void els.content.offsetWidth;
  els.content.classList.add('enter');
  restoreScroll();
  startWatch(doc);
}

/* ---------------- live-reload (external edits) ---------------- */

let pollTimer = null;
let lastMod = 0;

function stopWatch() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startWatch(doc) {
  stopWatch();
  if (isTauri() && doc.path) { watchFile(doc.path); return; }   // native watcher
  if (doc.handle && doc.handle.getFile) {                        // web: poll the handle
    doc.handle.getFile().then((f) => { lastMod = f.lastModified; }).catch(() => {});
    pollTimer = setInterval(pollHandle, 1500);
  }
}

async function pollHandle() {
  if (document.hidden || !state.handle || !state.handle.getFile) return;
  try {
    const f = await state.handle.getFile();
    if (f.lastModified > lastMod) { lastMod = f.lastModified; externalUpdate(await f.text()); }
  } catch { /* file moved/removed — ignore */ }
}

/* Apply an on-disk change to the current doc, preserving scroll. Never clobbers
 * unsaved edits. */
function externalUpdate(text) {
  if (text === state.text) return;
  if (state.dirty) { flash('File changed on disk — unsaved edits kept'); return; }
  const y = window.scrollY;
  state.text = text;
  els.editor.value = text;
  renderPreview().then(() => window.scrollTo({ top: y, left: 0, behavior: 'instant' }));
}

/* ---------------- folder mode ---------------- */

async function openFolder() {
  if (!folder.supported()) { flash('Folder mode needs a Chromium browser'); return; }
  const dir = await folder.pickDirectory();
  if (dir) useFolder(dir);
}

async function useFolder(dir) {
  let tree;
  try { tree = await folder.buildTree(dir); }
  catch (e) { console.warn(e); flash('Could not read folder'); return; }

  state.root = dir;
  folder.saveHandle('lastDir', dir);
  els.folderName.textContent = dir.name;
  els.folderName.title = dir.name;
  renderTree(tree);
  document.body.classList.add('has-sidebar');
  els.sidebar.hidden = false;
  els.btnSidebar.hidden = false;

  const firstBtn = els.fileTree.querySelector('.tree-file');
  if (firstBtn) selectTreeFile(firstBtn._node, firstBtn);
}

function renderTree(root) {
  els.fileTree.innerHTML = '';
  els.fileTree.appendChild(buildTreeDom(root));
}

function buildTreeDom(node) {
  const ul = document.createElement('ul');
  for (const child of node.children) {
    const li = document.createElement('li');
    if (child.kind === 'dir') {
      const btn = document.createElement('button');
      btn.className = 'tree-dir';
      btn.type = 'button';
      const chev = document.createElement('span');
      chev.className = 'chev';
      chev.innerHTML = ICONS.chevronRight;
      btn.append(chev);
      btn.insertAdjacentHTML('beforeend', ICONS.folder);
      const span = document.createElement('span');
      span.textContent = child.name;
      btn.append(span);
      const sub = buildTreeDom(child);
      btn.addEventListener('click', () => { sub.hidden = !li.classList.toggle('open'); });
      li.classList.add('open');
      li.append(btn, sub);
    } else {
      const btn = document.createElement('button');
      btn.className = 'tree-file';
      btn.type = 'button';
      btn.innerHTML = ICONS.fileText;
      const span = document.createElement('span');
      span.textContent = child.name;
      btn.append(span);
      btn._node = child;
      btn.addEventListener('click', () => selectTreeFile(child, btn));
      li.append(btn);
    }
    ul.append(li);
  }
  return ul;
}

async function selectTreeFile(node, btn) {
  try {
    const file = await node.handle.getFile();
    await loadDoc({ name: file.name, text: await file.text(), handle: node.handle, relDir: node.parentPath });
    setMode('read');
    setActive(btn);
  } catch (e) { console.warn(e); flash('Could not open file'); }
}

function setActive(btn) {
  els.fileTree.querySelectorAll('.tree-file.active').forEach((b) => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

function toggleSidebar() { document.body.classList.toggle('has-sidebar'); }

function closeFolder() {
  document.body.classList.remove('has-sidebar');
  els.sidebar.hidden = true;
  els.btnSidebar.hidden = true;
  state.root = null;
  state.relDir = null;
  folder.saveHandle('lastDir', null);
}

function newDoc() {
  loadDoc({ name: 'untitled.md', text: '', handle: null });
  setMode('edit');
}

function updateTitle() {
  const flag = state.dirty ? '• ' : '';
  document.title = state.name ? `${flag}${state.name} — glance` : 'glance';
}

/* ---------------- edit mode ---------------- */

function setMode(mode) {
  state.mode = mode;
  document.body.classList.toggle('mode-edit', mode === 'edit');
  els.btnEdit.innerHTML = mode === 'edit' ? ICONS.eye : ICONS.pencil;
  const label = mode === 'edit' ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)';
  els.btnEdit.title = label;
  els.btnEdit.setAttribute('aria-label', label);
  if (mode === 'edit') { closeFind(); els.editor.focus(); }
}

/* ---------------- reading width ---------------- */

function applyReadingWidth() {
  document.body.classList.toggle('reading-width', state.readingWidth);
  els.btnWidth.setAttribute('aria-pressed', String(state.readingWidth));
}

function toggleReadingWidth() {
  state.readingWidth = !state.readingWidth;
  store.set('glance.readingWidth', state.readingWidth);
  applyReadingWidth();
}

/* ---------------- scroll memory ---------------- */

const scrollStore = store.get('glance.scroll', {});
let scrollTimer = null;

function restoreScroll() {
  const y = scrollStore[state.key] || 0;
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
}

addEventListener('scroll', () => {
  if (state.mode !== 'read' || !state.key || els.workspace.hidden) return;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    scrollStore[state.key] = window.scrollY;
    store.set('glance.scroll', scrollStore);
  }, 200);
}, { passive: true });

/* ---------------- find ---------------- */

function openFind() {
  if (els.workspace.hidden || state.mode !== 'read') return;
  els.findbar.hidden = false;
  els.findInput.focus();
  els.findInput.select();
  if (els.findInput.value) runFind();
}

function closeFind() {
  els.findbar.hidden = true;
  find.close();
}

function runFind() {
  const { count, index, supported } = find.search(els.findInput.value);
  if (supported === false) { els.findCount.textContent = 'n/a'; return; }
  els.findCount.textContent = `${index}/${count}`;
}

function stepFind(dir) {
  const { count, index } = find.step(dir);
  els.findCount.textContent = `${index}/${count}`;
}

function toggleMode() {
  if (els.workspace.hidden) return; // nothing loaded
  setMode(state.mode === 'edit' ? 'read' : 'edit');
}

let renderTimer = null;
els.editor.addEventListener('input', () => {
  state.text = els.editor.value;
  if (!state.dirty) { state.dirty = true; updateTitle(); }
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 120);
});

/* ---------------- saving ---------------- */

async function save() {
  if (els.workspace.hidden) return;
  try {
    const h = await saveFile({ handle: state.handle, text: state.text, name: state.name });
    if (h) {
      state.handle = h;
      if (h.name) state.name = h.name;
    }
    state.dirty = false;
    updateTitle();
    flash('Saved');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error(e);
    flash('Save failed');
  }
}

/* ---------------- toast ---------------- */

let toastTimer = null;
function flash(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

/* ---------------- open helper ---------------- */

async function openFile() {
  const doc = await pickFile();
  if (doc) { await loadDoc(doc); setMode('read'); }
}

/* ---------------- wiring ---------------- */

els.btnOpen.onclick = openFile;
els.btnOpen2.onclick = openFile;
els.btnNew.onclick = newDoc;
els.btnNew2.onclick = newDoc;
els.btnSave.onclick = save;
els.btnEdit.onclick = toggleMode;
els.btnImages.onclick = () => { state.imagesAllowed = !state.imagesAllowed; updateImages(); };
els.btnTheme.onclick = () => { state.theme = toggleTheme(state.theme); };
els.btnWidth.onclick = toggleReadingWidth;
applyReadingWidth();

/* folder-mode controls */
els.btnFolder.onclick = openFolder;
els.btnFolder2.onclick = openFolder;
els.btnSidebar.onclick = toggleSidebar;
els.btnFolderClose.onclick = closeFolder;

/* relative .md links inside a folder-mode doc open in-app */
els.content.addEventListener('click', async (e) => {
  const a = e.target.closest('a');
  if (!a || !state.root || state.relDir == null) return;
  const href = a.getAttribute('href') || '';
  if (!href || /^(https?:|mailto:|#)/i.test(href)) return;
  const path = href.split('#')[0];
  if (!folder.MD_RE.test(path)) return;
  e.preventDefault();
  const segs = resolveRel(decodeURIComponent(path));
  const res = segs && await folder.resolveSegments(state.root, segs);
  if (!res) { flash('Linked file not found'); return; }
  try {
    const file = await res.fileHandle.getFile();
    await loadDoc({ name: file.name, text: await file.text(), handle: res.fileHandle, relDir: segs.slice(0, -1) });
    setMode('read');
    setActive(null);
  } catch { flash('Could not open linked file'); }
});

/* find bar controls */
els.findInput.addEventListener('input', runFind);
els.findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); }
  else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
});
els.findNext.onclick = () => stepFind(1);
els.findPrev.onclick = () => stepFind(-1);
els.findClose.onclick = closeFind;

addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 'o') { e.preventDefault(); openFile(); }
  else if (k === 's') { e.preventDefault(); save(); }
  else if (k === 'e') { e.preventDefault(); toggleMode(); }
  else if (k === 'f' && state.mode === 'read' && !els.workspace.hidden) { e.preventDefault(); openFind(); }
});

/* drag & drop */
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (e.relatedTarget === null) document.body.classList.remove('dragging'); });
addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const doc = await fromDrop(e.dataTransfer);
  if (doc) { await loadDoc(doc); setMode('read'); }
});

/* warn on unsaved changes */
addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* PWA file handler: launched by double-clicking a .md once installed */
if ('launchQueue' in window && 'setConsumer' in window.launchQueue) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    try { await loadDoc(await fromHandle(params.files[0])); setMode('read'); } catch (err) { console.error(err); }
  });
}

/* ?file=README.md deep-link (handy for the demo / a bookmarkable viewer) */
const qFile = new URLSearchParams(location.search).get('file');
if (qFile) {
  fetch(qFile)
    .then((r) => (r.ok ? r.text() : Promise.reject(new Error('fetch failed'))))
    .then((text) => loadDoc({ name: qFile.split('/').pop(), text, handle: null }))
    .catch(() => {});
}

/* native (Tauri): load launched/associated files + apply live file changes */
initNativeLaunch(
  (doc) => { loadDoc(doc); setMode('read'); },
  (doc) => { if (doc.path && doc.path === state.key) externalUpdate(doc.text); }
);

/* web live-reload: also check the file when the window regains focus */
addEventListener('focus', () => { pollHandle(); });

/* restore last folder if permission is still granted (no prompt without gesture) */
if (folder.supported()) {
  folder.loadHandle('lastDir')
    .then(async (dir) => { if (dir && await folder.isGranted(dir)) useFolder(dir); })
    .catch(() => {});
}

/* service worker: offline + installability (browser PWA only, not under Tauri) */
if ('serviceWorker' in navigator && !isTauri()) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
