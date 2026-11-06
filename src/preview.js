/* preview.js: platform label polish. Nothing here changes glance's behaviour.

   On macOS, shortcut labels should read the way the platform reads them. The
   app already accepts both Ctrl and Cmd for every shortcut; this only fixes
   the words in tooltips and the empty-state hint. A small observer keeps the
   dynamic labels (edit/preview, remote images) correct too. */

const MAC = /mac/i.test(navigator.platform) ||
  /Mac OS X|Macintosh/i.test(navigator.userAgent);

const normalize = (value) => value
  .replaceAll('Ctrl+Shift+', '⇧⌘')
  .replaceAll('Ctrl+', '⌘')
  .replaceAll('Ctrl', '⌘');

function fixElement(el) {
  if (!el || el.nodeType !== 1) return;
  for (const attr of ['title', 'aria-label']) {
    const value = el.getAttribute(attr);
    if (value && value.includes('Ctrl')) el.setAttribute(attr, normalize(value));
  }
}

function sweep(root) {
  fixElement(root);
  root.querySelectorAll?.('[title], [aria-label]').forEach(fixElement);
}

if (MAC) {
  document.documentElement.dataset.platform = 'mac';
  sweep(document);

  const shortcut = document.querySelector('#empty .shortcut');
  const hint = shortcut?.querySelector('kbd');
  if (hint) hint.textContent = '⌘';
  shortcut?.querySelector('span:not(.shortcut-label)')?.remove();

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') fixElement(record.target);
    }
  }).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['title', 'aria-label'],
  });
}
