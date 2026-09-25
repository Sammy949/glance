/* main.js — glance orchestrator: state, rendering, edit mode, files, PWA glue. */

import { createRenderer } from './pipeline.js';
import { initTheme, toggleTheme } from './theme.js';
import { pickFile, saveFile, fromDrop, fromHandle } from './files.js';
import { ICONS } from './icons.js';
import { isTauri, initNativeLaunch, watchFile, pickNativeDocument, saveNativeDocument } from './platform.js';
import * as find from './find.js';
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
  documentBar: document.getElementById('document-bar'),
  tabs: document.getElementById('tabs'),
  documentStatus: document.getElementById('document-status'),
};

const state = {
  name: null,
  key: null,           // identity for scroll memory (path || name)
  text: '',
  savedText: '',
  handle: null,
  mode: 'read',        // 'read' | 'edit'
  imagesAllowed: false,
  dirty: false,
  theme: 'light',
  readingWidth: false,
  root: null,          // folder-mode root directory handle
  docRoot: null,       // directory associated with this document
  relDir: null,        // current file's dir segments from root (null = not in folder)
  path: null,
};

const tabs = [];
let activeTab = null;
let nextTabId = 1;

function rememberActive() {
  if (!activeTab) return;
  for (const key of ['name', 'key', 'text', 'savedText', 'handle', 'mode', 'imagesAllowed', 'dirty', 'docRoot', 'relDir', 'path']) {
    activeTab[key] = state[key];
  }
  activeTab.scrollY = window.scrollY;
  activeTab.previewY = els.content.scrollTop;
  activeTab.editorY = els.editor.scrollTop;
}

function restoreActive(tab) {
  for (const key of ['name', 'key', 'text', 'savedText', 'handle', 'mode', 'imagesAllowed', 'dirty', 'docRoot', 'relDir', 'path']) {
    state[key] = tab[key];
  }
}

async function matchingTab(doc) {
  if (doc.path) return tabs.find((tab) => tab.path === doc.path);
  if (doc.handle) {
    for (const tab of tabs) {
      if (!tab.handle?.isSameEntry) continue;
      try { if (await tab.handle.isSameEntry(doc.handle)) return tab; } catch {}
    }
    return null;
  }
  return doc.key ? tabs.find((tab) => tab.key === doc.key) : null;
}

function renderTabs() {
  els.documentBar.hidden = tabs.length === 0;
  document.body.classList.toggle('has-tabs', tabs.length > 0);
  els.tabs.replaceChildren();
  for (const tab of tabs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tab';
    if (tab === activeTab) wrapper.classList.add('active');
    wrapper.addEventListener('click', (event) => {
      if (!event.target.closest('.tab-close')) activateTab(tab);
    });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-select';
    button.setAttribute('role', 'tab');
    button.id = `tab-${tab.id}`;
    button.setAttribute('aria-controls', 'workspace');
    button.setAttribute('aria-selected', String(tab === activeTab));
    button.tabIndex = tab === activeTab ? 0 : -1;
    button.title = tab.path || tab.key || tab.name;
    button.textContent = tab.name;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.tabIndex = tab === activeTab ? 0 : -1;
    close.setAttribute('aria-label', tab.dirty ? `Close ${tab.name}, unsaved changes` : `Close ${tab.name}`);
    close.classList.toggle('dirty', tab.dirty);
    close.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg><span class="dirty-mark" aria-hidden="true"></span>';
    close.onclick = (event) => { event.stopPropagation(); closeTab(tab); };
    wrapper.append(button, close);
    els.tabs.append(wrapper);
  }
  const selected = els.tabs.querySelector('.active .tab-select');
  if (selected) els.workspace.setAttribute('aria-labelledby', selected.id);
  selected?.parentElement?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  els.documentStatus.textContent = activeTab ? (state.dirty ? 'Unsaved changes' : 'Saved') : '';
  els.btnSave.hidden = !activeTab?.dirty;
}

els.tabs.addEventListener('keydown', (event) => {
  if (event.target.getAttribute('role') !== 'tab') return;
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Delete'].includes(event.key)) return;
  const current = tabs.indexOf(activeTab);
  if (current < 0) return;
  event.preventDefault();
  if (event.key === 'Delete') { closeTab(activeTab); return; }
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  activateTab(tabs[next]).then(() => els.tabs.querySelector('.active .tab-select')?.focus());
});

/* tiny localStorage JSON helpers */
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let renderer = null;
const rendererReady = createRenderer().then((r) => (renderer = r));

state.theme = initTheme();
state.readingWidth = store.get('glance.readingWidth', true);

/* ---------------- rendering ---------------- */

let renderVersion = 0;
async function renderPreview() {
  const version = ++renderVersion;
  await rendererReady;
  if (version !== renderVersion) return;
  const tab = activeTab;
  if (!tab) return;
  revokeObjectUrls();
  const fragment = document.createElement('template');
  fragment.innerHTML = renderer.render(state.text);
  let foundRemote = false;
  fragment.content.querySelectorAll('img').forEach((img) => {
    img.removeAttribute('srcset');
    const src = img.getAttribute('src') || '';
    if (/^https?:/i.test(src)) {
      img.dataset.remote = src;
      if (!state.imagesAllowed) img.removeAttribute('src');
      foundRemote = true;
    }
  });
  els.content.replaceChildren(fragment.content);
  els.content.querySelectorAll('a[href^="http"]').forEach((a) => {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  });
  addCopyButtons();
  els.btnImages.hidden = !foundRemote;
  updateImagesButton();
  await resolveRelativeAssets(tab, version);
  if (version === renderVersion && tab === activeTab) find.setContainer(els.content);
}

/* ---------------- folder mode: relative assets ---------------- */

let objectUrls = [];
function revokeObjectUrls() {
  objectUrls.forEach((u) => URL.revokeObjectURL(u));
  objectUrls = [];
}

/* Normalize a relative path against the current file's dir → segments from root,
 * or null if it escapes the root or is empty. */
function resolveRel(relPath, baseDir = state.relDir) {
  const base = (baseDir || []).slice();
  for (const p of relPath.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..') { if (!base.length) return null; base.pop(); }
    else base.push(p);
  }
  return base.length ? base : null;
}

function decodePath(value) {
  try { return decodeURIComponent(value); } catch { return null; }
}

/* In folder mode, swap relative <img> srcs for blob URLs read from disk. */
async function resolveRelativeAssets(tab, version) {
  if (!tab.docRoot || tab.relDir == null) return;
  for (const img of els.content.querySelectorAll('img[src]')) {
    const raw = img.getAttribute('src') || '';
    if (!raw || /^(https?:|data:|blob:)/i.test(raw)) continue;
    const decoded = decodePath(raw.split('#')[0].split('?')[0]);
    const segs = decoded && resolveRel(decoded, tab.relDir);
    if (!segs) continue;
    const res = await folder.resolveSegments(tab.docRoot, segs);
    if (version !== renderVersion) return;
    if (res) {
      try {
        const url = URL.createObjectURL(await res.fileHandle.getFile());
        if (version !== renderVersion) { URL.revokeObjectURL(url); return; }
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
  const existing = await matchingTab(doc);
  if (existing) { await activateTab(existing); return; }
  const tab = {
    id: nextTabId++, name: doc.name || 'untitled.md',
    key: doc.path || doc.key || doc.name || null,
    path: doc.path || null, text: doc.text || '', savedText: doc.text || '', handle: doc.handle || null,
    mode: doc.mode || 'read', imagesAllowed: false, dirty: false,
    docRoot: doc.docRoot || null, relDir: doc.relDir ?? null,
    scrollY: doc.key ? scrollStore[doc.key] || 0 : 0, previewY: 0, editorY: 0,
  };
  tabs.push(tab);
  await activateTab(tab);
}

async function activateTab(tab) {
  if (tab === activeTab) return;
  rememberActive();
  clearTimeout(renderTimer);
  closeFind();
  activeTab = tab;
  restoreActive(tab);
  els.editor.value = state.text;
  els.empty.hidden = true;
  els.workspace.hidden = false;
  els.btnEdit.hidden = false;
  els.btnWidth.hidden = false;
  document.body.classList.toggle('mode-edit', state.mode === 'edit');
  updateModeButton();
  updateTitle();
  renderTabs();
  await renderPreview();
  if (tab !== activeTab) return;
  window.scrollTo({ top: tab.scrollY, left: 0, behavior: 'instant' });
  els.content.scrollTop = tab.previewY;
  els.editor.scrollTop = tab.editorY;
  startWatch(tab);
  syncTreeActive();
}

async function closeTab(tab) {
  if (tab === activeTab) rememberActive();
  if (tab.dirty && !window.confirm(`Discard unsaved changes to ${tab.name}?`)) return;
  const index = tabs.indexOf(tab);
  if (index < 0) return;
  tabs.splice(index, 1);
  if (tab !== activeTab) { renderTabs(); return; }
  activeTab = null;
  stopWatch();
  revokeObjectUrls();
  if (tabs.length) {
    await activateTab(tabs[Math.min(index, tabs.length - 1)]);
    els.tabs.querySelector('.active .tab-select')?.focus();
  } else {
    els.workspace.hidden = true;
    els.empty.hidden = false;
    els.btnEdit.hidden = true;
    els.btnWidth.hidden = true;
    els.btnImages.hidden = true;
    document.body.classList.remove('mode-edit');
    state.name = null;
    state.key = null;
    updateTitle();
    renderTabs();
    syncTreeActive();
  }
}

/* ---------------- live-reload (external edits) ---------------- */

let pollTimer = null;
let lastMod = 0;

function stopWatch() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startWatch(doc) {
  stopWatch();
  if (isTauri() && doc.path) {
    watchFile(doc.path).then((file) => {
      if (file && activeTab === doc) externalUpdate(file.text);
    });
    return;
  }
  if (doc.handle && doc.handle.getFile) {                        // web: poll the handle
    doc.handle.getFile().then(async (f) => {
      if (activeTab !== doc) return;
      lastMod = f.lastModified;
      externalUpdate(await f.text());
    }).catch(() => {});
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
  state.savedText = text;
  if (activeTab) activeTab.text = text;
  if (activeTab) activeTab.savedText = text;
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

  syncTreeActive();
  const firstBtn = els.fileTree.querySelector('.tree-file');
  if (!activeTab && firstBtn) selectTreeFile(firstBtn._node, firstBtn);
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
      btn.setAttribute('aria-expanded', 'true');
      btn.addEventListener('click', () => {
        const open = li.classList.toggle('open');
        sub.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      });
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
      btn.addEventListener('click', () => selectTreeFile(child));
      li.append(btn);
    }
    ul.append(li);
  }
  return ul;
}

async function selectTreeFile(node) {
  try {
    const file = await node.handle.getFile();
    await loadDoc({ name: file.name, text: await file.text(), handle: node.handle,
      docRoot: state.root, relDir: node.parentPath,
      key: `${state.root.name}/${[...node.parentPath, file.name].join('/')}` });
    if (matchMedia('(max-width: 600px)').matches) document.body.classList.remove('has-sidebar');
  } catch (e) { console.warn(e); flash('Could not open file'); }
}

function syncTreeActive() {
  els.fileTree.querySelectorAll('.tree-file.active').forEach((b) => b.classList.remove('active'));
  if (!activeTab?.handle) return;
  for (const btn of els.fileTree.querySelectorAll('.tree-file')) {
    if (btn._node.handle === activeTab.handle) { btn.classList.add('active'); break; }
  }
}

function toggleSidebar() { document.body.classList.toggle('has-sidebar'); }

function closeFolder() {
  document.body.classList.remove('has-sidebar');
  els.sidebar.hidden = true;
  els.btnSidebar.hidden = true;
  state.root = null;
  folder.saveHandle('lastDir', null);
}

function newDoc() {
  let number = 1;
  let name = 'untitled.md';
  while (tabs.some((tab) => tab.name === name && !tab.path)) {
    number++;
    name = `untitled-${number}.md`;
  }
  loadDoc({ name, text: '', handle: null, mode: 'edit' });
}

function updateTitle() {
  const flag = state.dirty ? '• ' : '';
  document.title = state.name ? `${flag}${state.name} — glance` : 'glance';
  if (activeTab) {
    activeTab.dirty = state.dirty;
    activeTab.name = state.name;
    renderTabs();
  }
}

/* ---------------- edit mode ---------------- */

function setMode(mode) {
  state.mode = mode;
  if (activeTab) activeTab.mode = mode;
  document.body.classList.toggle('mode-edit', mode === 'edit');
  updateModeButton();
  if (mode === 'edit') { closeFind(); els.editor.focus(); }
}

function updateModeButton() {
  const mode = state.mode;
  els.btnEdit.innerHTML = mode === 'edit' ? ICONS.eye : ICONS.pencil;
  const label = mode === 'edit' ? 'Preview (Ctrl+E)' : 'Edit (Ctrl+E)';
  els.btnEdit.title = label;
  els.btnEdit.setAttribute('aria-label', label);
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
  const y = activeTab?.scrollY || scrollStore[state.key] || 0;
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
}

addEventListener('scroll', () => {
  if (state.mode !== 'read' || !state.key || els.workspace.hidden) return;
  const key = state.key;
  const y = window.scrollY;
  if (activeTab) activeTab.scrollY = y;
  clearTimeout(scrollTimer);
  scrollTimer = setTimeout(() => {
    scrollStore[key] = y;
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
  if (activeTab) activeTab.text = state.text;
  const dirty = state.text !== state.savedText;
  if (dirty !== state.dirty) { state.dirty = dirty; updateTitle(); }
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 120);
});

/* ---------------- saving ---------------- */

async function save() {
  if (els.workspace.hidden) return;
  try {
    const savingTab = activeTab;
    const text = state.text;
    const result = isTauri()
      ? await saveNativeDocument({ path: state.path, text, name: state.name })
      : await saveFile({ handle: state.handle, text, name: state.name });
    if (isTauri() && !result) return;
    if (isTauri()) {
      savingTab.path = result.path;
      savingTab.key = result.path;
      savingTab.name = result.name;
    } else if (result.downloaded) {
      flash('Downloaded a copy; original unchanged');
      return;
    } else if (result.handle) {
      savingTab.handle = result.handle;
      if (result.handle.name) savingTab.name = result.handle.name;
    }
    savingTab.savedText = text;
    savingTab.dirty = savingTab.text !== text;
    if (savingTab === activeTab) {
      state.path = savingTab.path;
      state.key = savingTab.key;
      state.name = savingTab.name;
      state.handle = savingTab.handle;
      state.savedText = savingTab.savedText;
      state.dirty = savingTab.dirty;
      if (isTauri()) startWatch(savingTab);
      updateTitle();
    } else renderTabs();
    flash(savingTab.dirty ? 'Saved; newer edits remain' : `Saved ${savingTab.name}`);
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
  const doc = isTauri() ? await pickNativeDocument() : await pickFile();
  if (doc) await loadDoc(doc);
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
els.btnFolder.hidden = !folder.supported();
els.btnFolder2.hidden = !folder.supported();
els.btnSidebar.onclick = toggleSidebar;
els.btnFolderClose.onclick = closeFolder;

/* relative .md links inside a folder-mode doc open in-app */
els.content.addEventListener('click', async (e) => {
  const a = e.target.closest('a');
  if (!a || !state.docRoot || state.relDir == null) return;
  const href = a.getAttribute('href') || '';
  if (!href || /^(https?:|mailto:|#)/i.test(href)) return;
  const path = href.split('#')[0];
  if (!folder.MD_RE.test(path)) return;
  e.preventDefault();
  const decoded = decodePath(path);
  const segs = decoded && resolveRel(decoded);
  const res = segs && await folder.resolveSegments(state.docRoot, segs);
  if (!res) { flash('Linked file not found'); return; }
  try {
    const file = await res.fileHandle.getFile();
    await loadDoc({ name: file.name, text: await file.text(), handle: res.fileHandle,
      docRoot: state.docRoot, relDir: segs.slice(0, -1),
      key: `${state.docRoot.name}/${segs.join('/')}` });
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
  else if (k === 'w' && activeTab) { e.preventDefault(); closeTab(activeTab); }
  else if (k === 'tab' && tabs.length > 1) {
    e.preventDefault();
    const index = tabs.indexOf(activeTab);
    activateTab(tabs[(index + (e.shiftKey ? -1 : 1) + tabs.length) % tabs.length]);
  }
});

/* drag & drop */
addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('dragging'); });
addEventListener('dragleave', (e) => { if (e.relatedTarget === null) document.body.classList.remove('dragging'); });
addEventListener('drop', async (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  const docs = await fromDrop(e.dataTransfer);
  for (const doc of docs) await loadDoc(doc);
});

/* warn on unsaved changes */
addEventListener('beforeunload', (e) => {
  if (tabs.some((tab) => tab.dirty)) { e.preventDefault(); e.returnValue = ''; }
});

/* PWA file handler: launched by double-clicking a .md once installed */
if ('launchQueue' in window && 'setConsumer' in window.launchQueue) {
  window.launchQueue.setConsumer(async (params) => {
    if (!params.files || !params.files.length) return;
    try { for (const handle of params.files) await loadDoc(await fromHandle(handle)); }
    catch (err) { console.error(err); }
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
  (doc) => loadDoc(doc),
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
