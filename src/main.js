/* main.js — glance orchestrator: state, rendering, edit mode, files, PWA glue. */

import { createRenderer } from './pipeline.js';
import { initTheme, toggleTheme } from './theme.js';
import { pickFile, saveFile, fromDrop, fromHandle } from './files.js';
import { ICONS } from './icons.js';
import { isTauri, initNativeLaunch, watchFile } from './platform.js';
import * as find from './find.js';
import { randomizeFavicon } from './favicon.js';

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
  els.content.innerHTML = renderer.render(state.text);
  els.content.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  addCopyButtons();
  markRemoteImages();
  find.setContainer(els.content);
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

/* service worker: offline + installability (browser PWA only, not under Tauri) */
if ('serviceWorker' in navigator && !isTauri()) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
