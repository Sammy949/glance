/* settings.js: the full-page settings view.

   quiet.md keeps settings in a full view with a left rail, grouped rows in
   rounded cards, segmented controls and switches. This module keeps that
   model: the page replaces the document below the app header, and the rail
   replaces the file sidebar while it is open.

   The module owns its DOM and focus handling; all real state lives in main.js
   behind `getState` / `actions`. */

const MAC = /mac/i.test(navigator.platform) ||
  /Mac OS X|Macintosh/i.test(navigator.userAgent);
const MOD = MAC ? '⌘' : 'Ctrl';
const SHIFT = MAC ? '⇧' : 'Shift';

const VERSION = '0.4.2';
const SOURCE = 'https://github.com/Sammy949/glance';

const PAGES = [
  { id: 'appearance', label: 'Appearance', icon: 'palette' },
  { id: 'reading', label: 'Reading', icon: 'book' },
  { id: 'shortcuts', label: 'Shortcuts', icon: 'keyboard' },
  { id: 'about', label: 'About', icon: 'info' },
];

const PAGE_COPY = {
  appearance: ['Appearance', 'How glance looks while you read.'],
  reading: ['Reading', 'What appears around the document.'],
  shortcuts: ['Shortcuts', 'Every key glance answers to.'],
  about: ['About', 'A local viewer, and the people who made it.'],
};

const ICON_PATHS = {
  palette: '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>',
  book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  keyboard: '<path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  panelClose: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m16 15-3-3 3-3"/>',
  panelOpen: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="m14 9 3 3-3 3"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
};

function svg(name, size = 16) {
  const span = document.createElement('span');
  span.className = 'settings-glyph';
  span.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
  return span;
}

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

function row(title, desc, control, { key = null, disabled = false } = {}) {
  const descNode = h('div', { class: 'settings-row-desc', dataset: key ? { desc: key } : {} }, desc);
  return h('div', {
    class: `settings-row${disabled ? ' is-disabled' : ''}`,
    dataset: key ? { row: key } : {},
  },
    h('div', { class: 'settings-row-text' },
      h('div', { class: 'settings-row-title' }, title),
      desc ? descNode : null,
    ),
    h('div', { class: 'settings-row-control' }, control),
  );
}

function group(caption, rows) {
  return h('section', { class: 'settings-group' },
    caption ? h('h4', { class: 'settings-caption' }, caption) : null,
    h('div', { class: 'settings-card' }, ...rows),
  );
}

function segmented(label, options, current, onPick) {
  const wrap = h('div', {
    class: 'settings-segmented',
    role: 'group',
    'aria-label': label,
    dataset: { setting: 'theme' },
  });
  for (const option of options) {
    const button = h('button', {
      type: 'button',
      class: 'settings-seg',
      dataset: { value: option.value },
      'aria-pressed': String(option.value === current),
    }, option.label);
    button.addEventListener('click', () => onPick(option.value));
    wrap.append(button);
  }
  return wrap;
}

function toggleSwitch(label, value, onChange, { key, disabled = false } = {}) {
  const button = h('button', {
    type: 'button',
    class: 'settings-switch',
    role: 'switch',
    'aria-label': label,
    'aria-checked': String(!!value),
    dataset: { switch: key },
  }, h('span', { class: 'settings-switch-knob', 'aria-hidden': 'true' }));
  button.disabled = disabled;
  button.addEventListener('click', () => {
    onChange(button.getAttribute('aria-checked') !== 'true');
  });
  return button;
}

function stepper(onStep) {
  const minus = h('button', {
    type: 'button',
    class: 'settings-step',
    'aria-label': 'Decrease text size',
    title: 'Decrease text size',
  }, svg('minus', 13));
  const value = h('span', { class: 'settings-step-value', dataset: { zoomValue: '' } }, '100%');
  const plus = h('button', {
    type: 'button',
    class: 'settings-step',
    'aria-label': 'Increase text size',
    title: 'Increase text size',
  }, svg('plus', 13));
  minus.addEventListener('click', () => onStep(-0.1));
  plus.addEventListener('click', () => onStep(0.1));
  return h('div', { class: 'settings-stepper', dataset: { setting: 'zoom' } }, minus, value, plus);
}

function keys(list) {
  const wrap = h('span', { class: 'settings-keys' });
  list.forEach((key, index) => {
    if (index) wrap.append(h('span', { class: 'settings-key-join', 'aria-hidden': 'true' }, '+'));
    wrap.append(h('kbd', {}, key));
  });
  return wrap;
}

function shortcutRow(label, list) {
  return row(label, null, keys(list));
}

// A page of the document theme on a quiet band, inside the Appearance card.
function sample() {
  return h('div', { class: 'settings-sample' },
    h('div', { class: 'settings-sample-paper', dataset: { sample: '' } },
      h('h5', {}, 'Reading in glance'),
      h('p', {}, 'Headings, lists, tables, code and math render the way PowerToys Peek shows them.'),
      h('p', {}, 'Press ', h('code', {}, `${MOD}+F`), ' to find a line, or ', h('code', {}, `${MOD}+E`), ' to edit.'),
    ),
  );
}

// quiet.md's Appearance: one group, top to bottom. The choice, how it looks,
// then the size it is read at.
function appearancePanel(actions, getState) {
  return [
    group(null, [
      row('Appearance', null, segmented('Appearance', [
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ], getState().themeMode, (value) => actions.setThemeMode(value))),
      sample(),
      row('Text size', 'Scales the document and the editor.', stepper((delta) => {
        actions.setZoom(getState().zoom + delta);
      })),
    ]),
  ];
}

function readingPanel(actions, getState) {
  const outlineOn = getState().outlineAvailable;
  return [
    group('Page', [
      row('Reading width', 'Keep long lines to a comfortable measure.',
        toggleSwitch('Reading width', getState().readingWidth, (value) => actions.setReadingWidth(value), { key: 'readingWidth' })),
    ]),
    group('Content', [
      row('Remote images', 'Load images from the web. Off keeps the app offline.',
        toggleSwitch('Remote images', getState().imagesAllowed, (value) => actions.setImagesAllowed(value), { key: 'images' })),
      row('Frontmatter', 'Show the YAML header at the top of a document as a small table.',
        toggleSwitch('Frontmatter', getState().frontmatter, (value) => actions.setFrontmatter(value), { key: 'frontmatter' })),
      row('Outline', outlineOn
        ? 'Show headings beside the document.'
        : 'Open a document with headings to use the outline.',
      toggleSwitch('Outline', getState().outlineOn, (value) => actions.setOutline(value), {
        key: 'outline',
        disabled: !outlineOn,
      }), { key: 'outline', disabled: !outlineOn }),
    ]),
  ];
}

function shortcutsPanel() {
  return [
    group('File', [
      shortcutRow('Open a file', [MOD, 'O']),
      shortcutRow('Save', [MOD, 'S']),
      shortcutRow('Edit or preview', [MOD, 'E']),
      shortcutRow('Close tab', [MOD, 'W']),
      shortcutRow('Print', [MOD, 'P']),
    ]),
    group('Reading', [
      shortcutRow('Find in document', [MOD, 'F']),
      shortcutRow('Outline', [SHIFT, MOD, 'O']),
      shortcutRow('Larger text', [MOD, '=']),
      shortcutRow('Smaller text', [MOD, '-']),
      shortcutRow('Original text size', [MOD, '0']),
      shortcutRow('Next tab', [MOD, 'Tab']),
      shortcutRow('Settings', [MOD, ',']),
    ]),
    group('Files', [
      shortcutRow('Search files in a folder', [SHIFT, MOD, 'F']),
    ]),
  ];
}

function aboutPanel(actions) {
  return [
    h('div', { class: 'settings-about' },
      h('img', { src: 'icons/icon.svg', width: '56', height: '56', alt: '' }),
      h('div', { class: 'settings-about-name' }, 'glance'),
      h('div', { class: 'settings-about-version' }, `Version ${VERSION}`),
      h('p', { class: 'settings-about-desc' }, 'A fast, fluid markdown viewer and quick editor. Your documents stay as files on your computer.'),
    ),
    group('Project', [
      row('Source code', 'github.com/Sammy949/glance',
        h('a', {
          class: 'settings-link',
          href: SOURCE,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, 'GitHub', svg('external', 13))),
      row('Keyboard shortcuts', 'The full list, on one page.',
        h('button', {
          type: 'button',
          class: 'settings-textbtn',
          onclick: () => actions.showPage('shortcuts'),
        }, 'View')),
    ]),
    group('Reset', [
      row('Restore defaults', 'Theme, text size, reading width, remote images, frontmatter, and outline.',
        h('button', {
          type: 'button',
          class: 'settings-textbtn',
          onclick: () => actions.restoreDefaults(),
        }, 'Restore')),
    ]),
  ];
}

function panel(page, prefix, actions, getState) {
  const body = page === 'appearance' ? appearancePanel(actions, getState)
    : page === 'reading' ? readingPanel(actions, getState)
      : page === 'shortcuts' ? shortcutsPanel()
        : aboutPanel(actions);
  const [title, desc] = PAGE_COPY[page];
  if (page === 'shortcuts') {
    body.push(h('p', {
      class: 'settings-empty',
      hidden: true,
      dataset: { shortcutsEmpty: '' },
    }, 'No matching shortcuts'));
  }
  return h('section', {
    class: 'settings-panel',
    role: 'tabpanel',
    id: `${prefix}-panel-${page}`,
    'aria-labelledby': `${prefix}-tab-${page}`,
    dataset: { panel: page },
  },
    h('header', { class: 'settings-panel-head' },
      h('div', { class: 'settings-panel-title' },
        h('h3', {}, title),
        page === 'shortcuts' ? shortcutSearch() : null,
      ),
      h('p', {}, desc),
    ),
    ...body,
  );
}

/* quiet.md puts a compact search field on the Shortcuts title line and
   filters the rows as you type. Same idea, no extra state: the rows already
   carry their labels and keycaps, so the query just walks the DOM. */
function shortcutSearch() {
  const input = h('input', {
    type: 'search',
    class: 'settings-search-input',
    placeholder: 'Filter shortcuts',
    'aria-label': 'Filter shortcuts',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  input.addEventListener('input', () => {
    const panelEl = input.closest('.settings-panel');
    const query = input.value.trim().toLowerCase();
    for (const section of panelEl.querySelectorAll('.settings-group')) {
      let shown = 0;
      for (const rowEl of section.querySelectorAll('.settings-row')) {
        const match = !query || rowEl.textContent.toLowerCase().includes(query);
        rowEl.hidden = !match;
        if (match) shown += 1;
      }
      section.hidden = shown === 0;
    }
    const empty = panelEl.querySelector('[data-shortcuts-empty]');
    if (empty) {
      empty.hidden = !query || [...panelEl.querySelectorAll('.settings-row')].some((rowEl) => !rowEl.hidden);
    }
  });
  return h('label', { class: 'settings-search' }, svg('search', 14), input);
}

function nav(page, prefix, onShow) {
  const button = h('button', {
    type: 'button',
    class: 'settings-nav-item',
    role: 'tab',
    id: `${prefix}-tab-${page.id}`,
    'aria-controls': `${prefix}-panel-${page.id}`,
    'aria-selected': 'false',
    tabindex: '-1',
    dataset: { page: page.id },
    title: page.label,
  },
    svg(page.icon, 16),
    h('span', { class: 'settings-nav-label' }, page.label),
  );
  button.addEventListener('click', () => onShow(page.id));
  return button;
}

function navKeydown(event) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll('[role="tab"]')];
  const index = items.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  let next;
  if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = items.length - 1;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
  else next = (index + 1) % items.length;
  items[next].click();
  items[next].focus();
}

export function createSettings({ getState, actions, onOpen, onClose } = {}) {
  const pageMount = document.getElementById('settings-page');
  if (!pageMount) return null;

  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const requested = new URLSearchParams(location.search).get('settings');

  const state = {
    open: false,
    page: 'appearance',
    lastFocus: null,
  };

  const mounts = new Map();

  const show = (pageId) => {
    if (!PAGE_COPY[pageId]) return;
    state.page = pageId;
    sync();
    const mount = activeMount();
    mount?.querySelector(`[data-page="${pageId}"]`)?.focus({ preventScroll: true });
  };

  const internal = {
    setThemeMode: actions.setThemeMode,
    setZoom: actions.setZoom,
    setReadingWidth: actions.setReadingWidth,
    setImagesAllowed: actions.setImagesAllowed,
    setFrontmatter: actions.setFrontmatter,
    setOutline: actions.setOutline,
    restoreDefaults: actions.restoreDefaults,
    showPage: (pageId) => show(pageId),
  };

  function buildPage() {
    const prefix = 'settings-page';
    const navEl = h('nav', { class: 'settings-nav', role: 'tablist', 'aria-label': 'Settings sections' });
    const panels = h('div', { class: 'settings-content' });
    for (const item of PAGES) {
      navEl.append(nav(item, prefix, show));
      panels.append(panel(item.id, prefix, internal, getState));
    }
    navEl.addEventListener('keydown', navKeydown);

    const back = h('button', {
      type: 'button',
      class: 'settings-back',
      title: 'Back (Esc)',
      onclick: () => close(),
    }, svg('arrowLeft', 18), h('span', { class: 'settings-back-label' }, 'Back'), h('kbd', {}, 'Esc'));

    // The same head as the document sidebar: the mark and name, the collapse
    // icon at the far right. Collapsed, only the mark stays, and on hover it
    // becomes the control that opens the rail again.
    const mark = () => h('img', { src: 'icons/icon.svg', width: '20', height: '20', alt: '' });
    pageMount.replaceChildren(
      h('div', { class: 'settings-shell' },
        h('aside', { class: 'settings-rail' },
          h('div', { class: 'settings-rail-head' },
            h('button', {
              type: 'button',
              class: 'settings-rail-mark',
              title: 'Show sidebar',
              'aria-label': 'Show sidebar',
              onclick: () => setCollapsed(false),
            }, mark(), svg('panelOpen', 18)),
            h('span', { class: 'brand' }, mark(), h('span', {}, 'glance')),
            h('button', {
              type: 'button',
              class: 'settings-rail-toggle',
              title: 'Hide sidebar',
              'aria-label': 'Hide sidebar',
              onclick: () => setCollapsed(true),
            }, svg('panelClose', 18)),
          ),
          navEl,
          h('div', { class: 'settings-rail-foot' },
            back,
          ),
        ),
        h('main', { class: 'settings-main' }, panels),
      ),
    );
    mounts.set('page', { mount: pageMount, prefix });
  }

  function activeMount() {
    return pageMount;
  }

  // One sidebar, one state: collapsing here collapses the document sidebar
  // too, so going Back lands on the same shape.
  const sidebarEl = () => document.getElementById('sidebar');
  function setCollapsed(collapsed, { follow = true } = {}) {
    pageMount.classList.toggle('rail-collapsed', collapsed);
    const side = sidebarEl();
    if (follow && side && !side.hidden && document.body.classList.contains('has-sidebar') === collapsed) {
      document.getElementById('btn-sidebar')?.click();
    }
    const target = pageMount.querySelector(collapsed ? '.settings-rail-mark' : '.settings-rail-toggle');
    if (document.activeElement?.closest('.settings-rail-head')) target?.focus({ preventScroll: true });
  }

  function applyInert() {
    const active = activeMount();
    for (const child of document.body.children) {
      if (child.tagName === 'SCRIPT' || child.id === 'toast') {
        child.inert = false;
        continue;
      }
      if (!state.open) {
        child.inert = false;
        continue;
      }
      if (child === active) {
        child.inert = false;
        continue;
      }
      child.inert = true;
    }
  }

  function focusNav() {
    const mount = activeMount();
    if (!mount) return;
    mount.querySelector('.settings-nav-item[aria-selected="true"]')?.focus({ preventScroll: true });
  }

  function open(pageId) {
    if (state.open) {
      if (pageId) show(pageId);
      return;
    }
    state.open = true;
    if (pageId) state.page = pageId;
    state.lastFocus = document.activeElement;
    // Open in the shape the document sidebar is in. With nothing open there
    // is no sidebar to match, so the rail starts open.
    const side = sidebarEl();
    const wide = !matchMedia('(max-width: 640px)').matches;
    setCollapsed(wide && !!side && !side.hidden && !document.body.classList.contains('has-sidebar'), { follow: false });
    onOpen?.();
    document.body.classList.add('settings-open', 'settings-page-open');
    applyInert();
    sync();
    requestAnimationFrame(focusNav);
  }

  function close({ restoreFocus = true } = {}) {
    if (!state.open) return;
    state.open = false;
    document.body.classList.remove('settings-open', 'settings-page-open');
    pageMount.hidden = true;
    applyInert();
    onClose?.();
    const target = state.lastFocus;
    state.lastFocus = null;
    if (restoreFocus && target?.isConnected && !target.closest('[inert]')) {
      target.focus({ preventScroll: true });
    }
  }

  function sync() {
    pageMount.hidden = !state.open;

    const st = getState();
    for (const { mount } of mounts.values()) {
      mount.querySelectorAll('[data-page]').forEach((button) => {
        const active = button.dataset.page === state.page;
        button.classList.toggle('active', active);
        button.setAttribute('aria-selected', String(active));
        button.tabIndex = active ? 0 : -1;
      });
      mount.querySelectorAll('[data-panel]').forEach((node) => {
        node.hidden = node.dataset.panel !== state.page;
      });

      mount.querySelectorAll('[data-setting="theme"] [data-value]').forEach((button) => {
        const active = button.dataset.value === st.themeMode;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });

      const zoomControl = mount.querySelector('[data-setting="zoom"]');
      if (zoomControl) {
        zoomControl.querySelector('[data-zoom-value]').textContent = `${Math.round(st.zoom * 100)}%`;
        const [minus, plus] = zoomControl.querySelectorAll('button');
        minus.disabled = st.zoom <= 0.7 + 1e-9;
        plus.disabled = st.zoom >= 2 - 1e-9;
      }

      const values = {
        readingWidth: st.readingWidth,
        images: st.imagesAllowed,
        frontmatter: st.frontmatter,
        outline: st.outlineOn,
      };
      for (const [key, value] of Object.entries(values)) {
        const button = mount.querySelector(`[data-switch="${key}"]`);
        if (!button) continue;
        button.setAttribute('aria-checked', String(!!value));
        if (key === 'outline') button.disabled = !st.outlineAvailable;
      }

      const outlineRow = mount.querySelector('[data-row="outline"]');
      if (outlineRow) {
        outlineRow.classList.toggle('is-disabled', !st.outlineAvailable);
        const desc = outlineRow.querySelector('[data-desc="outline"]');
        if (desc) {
          desc.textContent = st.outlineAvailable
            ? 'Show headings beside the document.'
            : 'Open a document with headings to use the outline.';
        }
      }

      const paper = mount.querySelector('[data-sample]');
      if (paper) paper.dataset.width = st.readingWidth ? 'narrow' : 'wide';
    }
  }

  document.addEventListener('keydown', (event) => {
    if (!state.open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  }, true);

  buildPage();

  const api = {
    open,
    close,
    toggle: (pageId) => (state.open ? close() : open(pageId)),
    sync,
    isOpen: () => state.open,
  };

  if (requested === 'page') {
    queueMicrotask(() => open());
  }

  return api;
}
