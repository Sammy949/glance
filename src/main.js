/* main.js — glance orchestrator: state, rendering, edit mode, files, PWA glue. */

import { createRenderer } from './pipeline.js';
import { initTheme, toggleTheme } from './theme.js';
import { pickFile, saveFile, fromDrop, fromHandle } from './files.js';

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
};

const state = {
  name: null,
  text: '',
  handle: null,
  mode: 'read',        // 'read' | 'edit'
  imagesAllowed: false,
  dirty: false,
  theme: 'light',
};

let renderer = null;
const rendererReady = createRenderer().then((r) => (renderer = r));

state.theme = initTheme();

/* ---------------- rendering ---------------- */

async function renderPreview() {
  await rendererReady;
  els.content.innerHTML = renderer.render(state.text);
  els.content.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  markRemoteImages();
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
  els.btnImages.textContent = state.imagesAllowed ? '🖼️ Hide remote' : '🖼️ Load remote';
}

/* ---------------- document lifecycle ---------------- */

async function loadDoc(doc) {
  state.name = doc.name || 'untitled.md';
  state.text = doc.text || '';
  state.handle = doc.handle || null;
  state.dirty = false;
  els.editor.value = state.text;
  els.empty.hidden = true;
  els.workspace.hidden = false;
  els.btnSave.hidden = false;
  els.btnEdit.hidden = false;
  updateTitle();
  await renderPreview();
  window.scrollTo(0, 0);
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
  els.btnEdit.textContent = mode === 'edit' ? '👁 Preview' : '✏️ Edit';
  if (mode === 'edit') els.editor.focus();
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

addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 'o') { e.preventDefault(); openFile(); }
  else if (k === 's') { e.preventDefault(); save(); }
  else if (k === 'e') { e.preventDefault(); toggleMode(); }
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

/* service worker: offline + installability */
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
