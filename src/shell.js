/* shell.js: quiet.md's window around main.js.

   main.js still owns every action and its state. This file arranges the
   chrome the way quiet.md does and keeps it in step with main.js:

   - the sidebar is how you move between documents: its actions first,
     then open documents, then the folder, then Settings at the foot
   - collapsed, the sidebar leaves a rail of its icons, as Manus does
   - the note's header names the current document; its right end is
     "more" and find
   - the long tail of actions sits in the "more" menu, which mirrors and
     clicks the real buttons main.js drives */

const MAC = /mac/i.test(navigator.platform) || /Mac OS X|Macintosh/i.test(navigator.userAgent);
const $ = (id) => document.getElementById(id);
const body = document.body;
const hint = (text) => (MAC ? text.replace('Ctrl ', '⌘').replace('⇧ ', '⇧') : text);
const narrow = () => matchMedia('(max-width: 600px)').matches;
for (const kbd of document.querySelectorAll('#sidebar kbd')) kbd.textContent = hint(kbd.textContent);

const svg = (paths) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const sidebar = $('sidebar');
const tabs = $('tabs');
const tree = $('file-tree');
const btnSidebar = $('btn-sidebar');

/* ---- controls that reach a real one ---- */

const click = (id) => () => $(id).click();
for (const button of document.querySelectorAll('[data-proxy]')) button.addEventListener('click', click(button.dataset.proxy));
$('sidebar-collapse').addEventListener('click', click('btn-sidebar'));
// The rail's mark, its documents and its folder all open the sidebar.
for (const id of ['rail-open', 'rail-docs', 'rail-folder']) $(id).addEventListener('click', click('btn-sidebar'));
$('sidebar-settings').addEventListener('click', click('btn-settings'));
// main.js opens find from its Ctrl+F handler; the button presses that key.
$('btn-find').addEventListener('click', () => {
  body.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }));
});

/* ---- sections fold from their title, as in quiet.md ---- */

for (const title of sidebar.querySelectorAll('.sb-title')) {
  title.addEventListener('click', () => {
    const open = title.getAttribute('aria-expanded') !== 'true';
    title.setAttribute('aria-expanded', String(open));
    title.closest('.sb-group').classList.toggle('folded', !open);
  });
}

/* ---- the sidebar exists whenever there is something to move between ---- */

let lastCount = 0;
function syncSidebar() {
  const count = tabs.children.length;
  const folderOpen = tree.children.length > 0 && !!$('folder-name').textContent;
  const available = count > 0 || folderOpen;
  const set = (node, attr, value) => { if (node[attr] !== value) node[attr] = value; };

  set($('sb-folder'), 'hidden', !folderOpen);
  set($('sb-open'), 'hidden', count === 0);
  set(sidebar, 'hidden', !available);
  set(btnSidebar, 'hidden', !available);
  set($('rail'), 'hidden', !available);
  set($('rail-docs'), 'hidden', count === 0);
  set($('rail-folder'), 'hidden', !folderOpen);
  const folder = $('folder-name').textContent;
  if (folderOpen && $('rail-folder').title !== folder) {
    $('rail-folder').title = folder;
    $('rail-folder').setAttribute('aria-label', `Folder: ${folder}`);
  }
  // A quiet mark on the documents icon while any of them has unsaved edits.
  $('rail-docs').classList.toggle('unsaved', !!tabs.querySelector('.tab-close.dirty'));
  // Open it with the first document, the way quiet.md always has it open.
  // After that it stays where the reader put it.
  if (lastCount === 0 && count > 0 && !narrow() && !body.classList.contains('has-sidebar')) {
    body.classList.add('has-sidebar');
    dispatchEvent(new Event('resize')); // main.js re-checks whether the outline fits
  }
  if (!available && body.classList.contains('has-sidebar')) body.classList.remove('has-sidebar');
  lastCount = count;
}

/* ---- the note's header names the document ---- */

const crumbs = document.querySelector('#doc-title .crumbs');
const name = document.querySelector('#doc-title .name');
function syncTitle() {
  const active = tabs.querySelector('.tab.active .tab-select');
  const label = active?.textContent || '';
  const where = (active?.title || '').split(/[\\/]/).filter(Boolean);
  const parent = where.length > 1 ? where[where.length - 2] : '';
  if (name.textContent !== label) name.textContent = label;
  if (crumbs.textContent !== parent) crumbs.textContent = parent;
  document.title = label ? `${label} · glance` : 'glance';
}

new MutationObserver(() => { syncSidebar(); syncTitle(); })
  .observe(tabs, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'title'] });
new MutationObserver(syncSidebar).observe(tree, { childList: true });
new MutationObserver(syncSidebar).observe(sidebar, { attributes: true, attributeFilter: ['hidden'] });
new MutationObserver(syncSidebar).observe($('folder-name'), { childList: true, characterData: true, subtree: true });

// The open documents are a vertical list here; main.js walks them with
// Left/Right, so Up/Down are passed on as those.
tabs.addEventListener('keydown', (event) => {
  const map = { ArrowUp: 'ArrowLeft', ArrowDown: 'ArrowRight' };
  if (!map[event.key] || event.target.getAttribute('role') !== 'tab') return;
  event.preventDefault();
  event.target.dispatchEvent(new KeyboardEvent('keydown', { key: map[event.key], bubbles: true }));
});

/* ---- the document menu ("…") ----

   quiet.md's grouping, mapped onto what glance can actually do: how the
   page is shown; finding; getting the document out; what it is; the file
   itself; and the keyboard, last. Rows that mirror a real button take its
   state and click it, so main.js stays the one place an action lives. */

const ICON = {
  width: svg('<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>'),
  find: svg('<path d="M21 6H3"/><path d="M10 12H3"/><path d="M10 18H3"/><circle cx="17" cy="15" r="3"/><path d="m21 19-1.9-1.9"/>'),
  download: svg('<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>'),
  print: svg('<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  close: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  keyboard: svg('<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>'),
  chevron: svg('<path d="m9 18 6-6-6-6"/>'),
};

const pressKey = (key) => body.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true }));
const reading = () => !body.classList.contains('mode-edit');
const docText = () => $('editor')?.value ?? '';
const docName = () => tabs.querySelector('.tab.active .tab-select')?.textContent || 'untitled.md';
const docPath = () => tabs.querySelector('.tab.active .tab-select')?.title || '';
const plain = (text) => (text || '').replace(/\s*\(.*\)\s*$/, '');

/* Page width: quiet.md's Standard / Wide / Full. Standard and Full are
   main.js's reading width on and off; Wide is the reading width with a
   longer measure. */
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};
body.classList.toggle('page-wide', store.get('glance.pageWide') === '1');
function pageWidth() {
  if (!body.classList.contains('reading-width')) return 'full';
  return body.classList.contains('page-wide') ? 'wide' : 'standard';
}
function setPageWidth(width) {
  const on = width !== 'full';
  if (body.classList.contains('reading-width') !== on) $('btn-width').click();
  body.classList.toggle('page-wide', width === 'wide');
  store.set('glance.pageWide', width === 'wide' ? '1' : '0');
}

function widthPanel(sub) {
  const caption = document.createElement('p');
  caption.className = 'width-caption';
  caption.textContent = 'Choose a page width for this window';
  const row = document.createElement('div');
  row.className = 'width-cards';
  const current = pageWidth();
  for (const [value, label] of [['standard', 'Standard'], ['wide', 'Wide'], ['full', 'Full']]) {
    const card = document.createElement('button');
    card.type = 'button';
    card.tabIndex = -1;
    card.className = `width-card width-${value}`;
    card.setAttribute('role', 'menuitemradio');
    card.setAttribute('aria-checked', String(value === current));
    card.innerHTML = '<span class="width-page" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
    card.append(label);
    card.addEventListener('click', () => { setPageWidth(value); closeMenu(true); });
    card.addEventListener('pointerenter', () => card.focus({ preventScroll: true }));
    row.append(card);
  }
  sub.classList.add('width-panel');
  sub.setAttribute('aria-label', 'Page width');
  sub.append(caption, row);
}

function downloadMarkdown() {
  const name = /\.(md|markdown|mdx|txt)$/i.test(docName()) ? docName() : `${docName()}.md`;
  const url = URL.createObjectURL(new Blob([docText()], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadPanel(sub) {
  sub.setAttribute('aria-label', 'Download as');
  sub.append(
    subItem('Markdown', downloadMarkdown),
    subItem('PDF', () => pressKey('p'), 'Through the print dialog: choose Save as PDF'),
  );
}

function subItem(label, run, title) {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.setAttribute('role', 'menuitem');
  if (title) button.title = title;
  button.textContent = label;
  button.addEventListener('click', () => { closeMenu(true); run(); });
  button.addEventListener('pointerenter', () => button.focus({ preventScroll: true }));
  return button;
}

const ROWS = [
  { sub: widthPanel, label: 'Page width', icon: ICON.width, when: reading },
  { mirror: 'btn-outline', label: () => 'Outline', toggle: true, keys: 'Ctrl ⇧ O' },
  { mirror: 'btn-edit', label: (t) => plain(t.title) || 'Edit', keys: 'Ctrl E' },
  null,
  { run: () => pressKey('f'), label: 'Find in document', icon: ICON.find, keys: 'Ctrl F', when: reading },
  { mirror: 'btn-images', label: (t) => plain(t.title) || 'Remote images' },
  null,
  { sub: downloadPanel, label: 'Download as', icon: ICON.download },
  { run: () => pressKey('p'), label: 'Print', icon: ICON.print, keys: 'Ctrl P' },
  null,
  { run: showInfo, label: 'Document info', icon: ICON.info },
  null,
  { run: () => tabs.querySelector('.tab.active .tab-close')?.click(), label: 'Close document', icon: ICON.close, keys: 'Ctrl W' },
  null,
  { run: showShortcuts, label: 'Keyboard shortcuts', icon: ICON.keyboard },
];

const menu = $('more-menu');
const subMenu = $('more-sub');
const trigger = $('btn-more');
const entries = [];

function addRow(row) {
  if (!row) {
    const rule = document.createElement('div');
    rule.setAttribute('role', 'separator');
    menu.append(rule);
    entries.push({ rule });
    return;
  }
  const target = row.mirror ? $(row.mirror) : null;
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.setAttribute('role', row.toggle ? 'menuitemcheckbox' : 'menuitem');
  const glyph = document.createElement('span');
  glyph.className = 'menu-glyph';
  const text = document.createElement('span');
  text.className = 'menu-label';
  button.append(glyph, text);
  if (row.keys) {
    const keys = document.createElement('kbd');
    keys.textContent = hint(row.keys);
    button.append(keys);
  }
  if (row.sub) {
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');
    const more = document.createElement('span');
    more.className = 'menu-more';
    more.innerHTML = ICON.chevron;
    button.append(more);
    button.addEventListener('click', () => openSub(entry, true));
    button.addEventListener('pointerenter', () => { button.focus({ preventScroll: true }); openSub(entry, false); });
  } else {
    button.addEventListener('pointerenter', () => { button.focus({ preventScroll: true }); closeSub(); });
    button.addEventListener('click', () => {
      closeMenu(true);
      if (target) target.click(); else row.run();
    });
  }
  menu.append(button);
  const entry = { row, target, button, glyph, text };
  entries.push(entry);
  refresh(entry);
  if (target) new MutationObserver(() => refresh(entry)).observe(target, { attributes: true, childList: true, subtree: true });
}

function refresh({ row, target, button, glyph, text }) {
  const icon = row.icon || target?.innerHTML || '';
  if (glyph.innerHTML !== icon) glyph.innerHTML = icon;
  const label = typeof row.label === 'function' ? row.label(target) : row.label;
  if (text.textContent !== label) text.textContent = label;
  button.hidden = target ? target.hidden : row.when ? !row.when() : false;
  if (row.toggle) button.setAttribute('aria-checked', String(target.getAttribute('aria-pressed') === 'true'));
  tidy();
}

// No separator at either end, and never two in a row.
function tidy() {
  let previous = null;
  for (const entry of entries) {
    if (entry.rule) {
      entry.rule.hidden = !previous || !!previous.rule;
      if (!entry.rule.hidden) previous = entry;
    } else if (!entry.button.hidden) previous = entry;
  }
  if (previous?.rule) previous.rule.hidden = true;
}

const items = (root) => [...root.querySelectorAll('button')].filter((button) => !button.hidden);
let openEntry = null;

// Submenus open to the left, 4px from the menu, level with their row.
function openSub(entry, focus) {
  if (openEntry !== entry) {
    closeSub();
    openEntry = entry;
    subMenu.className = '';
    subMenu.replaceChildren();
    entry.row.sub(subMenu);
    subMenu.hidden = false;
    entry.button.setAttribute('aria-expanded', 'true');
    entry.button.classList.add('open');
    const row = entry.button.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    subMenu.style.right = `${Math.round(innerWidth - box.left + 4)}px`;
    const top = Math.min(row.top - 7, innerHeight - subMenu.offsetHeight - 8);
    subMenu.style.top = `${Math.max(8, Math.round(top))}px`;
  }
  if (focus) items(subMenu)[0]?.focus({ preventScroll: true });
}

function closeSub(restore = false) {
  if (!openEntry) return;
  openEntry.button.setAttribute('aria-expanded', 'false');
  openEntry.button.classList.remove('open');
  if (restore) openEntry.button.focus({ preventScroll: true });
  openEntry = null;
  subMenu.hidden = true;
}

function openMenu() {
  if (!menu.hidden) { closeMenu(); return; }
  entries.forEach((entry) => { if (!entry.rule) refresh(entry); });
  menu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  const box = trigger.getBoundingClientRect();
  menu.style.top = `${Math.round(box.bottom + 6)}px`;
  menu.style.right = `${Math.max(8, Math.round(innerWidth - box.right))}px`;
  items(menu)[0]?.focus({ preventScroll: true });
}

function closeMenu(restore = false) {
  closeSub();
  if (menu.hidden) return;
  menu.hidden = true;
  trigger.setAttribute('aria-expanded', 'false');
  if (restore) trigger.focus({ preventScroll: true });
}

function walk(event, root) {
  const list = items(root);
  const at = list.indexOf(document.activeElement);
  const go = (index) => { event.preventDefault(); list[(index + list.length) % list.length]?.focus(); };
  if (event.key === 'ArrowDown' || (root === subMenu && event.key === 'ArrowRight')) go(at + 1);
  else if (event.key === 'ArrowUp' || (root === subMenu && event.key === 'ArrowLeft' && root.classList.contains('width-panel') && at > 0)) go(at - 1);
  else if (event.key === 'Home') go(0);
  else if (event.key === 'End') go(list.length - 1);
  else return false;
  return true;
}

trigger.addEventListener('click', openMenu);
menu.addEventListener('keydown', (event) => {
  if (walk(event, menu)) { closeSub(); return; }
  const entry = entries.find((e) => e.button === document.activeElement);
  if (entry?.row.sub && event.key === 'ArrowRight') { event.preventDefault(); openSub(entry, true); }
  else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(true); }
  else if (event.key === 'Tab') closeMenu(true);
});
subMenu.addEventListener('keydown', (event) => {
  const back = event.key === 'Escape' || (event.key === 'ArrowLeft' && !(subMenu.classList.contains('width-panel') && items(subMenu).indexOf(document.activeElement) > 0));
  if (back) { event.preventDefault(); event.stopPropagation(); closeSub(true); return; }
  if (walk(event, subMenu)) return;
  if (event.key === 'Tab') closeMenu(true);
});
addEventListener('pointerdown', (event) => {
  if (menu.hidden) return;
  if (![menu, subMenu, trigger].some((node) => node.contains(event.target))) closeMenu();
});
addEventListener('resize', () => closeMenu());
addEventListener('blur', () => closeMenu());

/* ---- Document info: quiet.md's, cut to what a local file has ---- */

// Each CJK character counts as one word; a run of letters or digits counts
// as one; punctuation and spaces don't count. (quiet.md's rule.)
const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/u;
function wordCount(text) {
  let words = 0;
  let inWord = false;
  for (const c of text) {
    const wordy = (/[\p{L}\p{N}]/u.test(c) && !CJK.test(c)) || (inWord && /['’\-._]/.test(c));
    if (wordy) { if (!inWord) words += 1; inWord = true; continue; }
    inWord = false;
    if (CJK.test(c)) words += 1;
  }
  return words;
}

const number = new Intl.NumberFormat();
function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const info = $('doc-info');
function showInfo() {
  const text = docText();
  const words = wordCount(text);
  const minutes = Math.max(1, Math.round(words / 230));
  const lines = text ? text.split('\n').length : 0;
  const make = (tag, cls, content) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (content != null) node.textContent = content;
    return node;
  };
  const group = (title, rows) => {
    const section = make('section', 'info-group');
    section.append(make('h3', '', title));
    const list = make('dl');
    for (const [term, value] of rows) {
      const row = make('div', 'info-row');
      row.append(make('dt', '', term), make('dd', '', value));
      list.append(row);
    }
    section.append(list);
    return section;
  };
  const close = make('button', 'info-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = ICON.close;
  close.addEventListener('click', () => info.close());
  const head = make('header', 'info-head');
  head.append(make('h2', '', 'Document info'), close);
  head.firstChild.id = 'doc-info-title';
  const where = docPath();
  info.replaceChildren(
    head,
    group('Overview', [['Name', docName()], ...(where && where !== docName() ? [['Location', where]] : [])]),
    group('Statistics', [
      ['Words', number.format(words)],
      ['Characters', number.format([...text].length)],
      ['Lines', number.format(lines)],
      ['Reading time', `About ${minutes} min`],
      ['Size', size(new TextEncoder().encode(text).length)],
    ]),
  );
  info.showModal();
  close.focus();
}
info.addEventListener('click', (event) => { if (event.target === info) info.close(); });

function showShortcuts() {
  $('btn-settings').click();
  requestAnimationFrame(() => document.querySelector('#settings-page [data-page="shortcuts"]')?.click());
}

ROWS.forEach(addRow);
syncSidebar();
syncTitle();

/* ---- development demo folder: ?demo ---- */
if (new URLSearchParams(location.search).has('demo')) import('./demo.js');
