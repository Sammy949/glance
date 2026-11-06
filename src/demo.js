/* demo.js: development aid. ?demo fakes an opened folder from ./sample so the
   sidebar and the tabs can be judged without the browser's folder picker.
   It only loads with ?demo. main.js's own filter and tree code run against it, so
   the nodes carry the fields that code reads. */

import { ICONS } from './icons.js';

const $ = (id) => document.getElementById(id);
const tree = $('file-tree');

const FILES = [
  { name: 'notes', children: [
    { name: 'deep.md', path: 'sample/notes/deep.md' },
    { name: 'reading.md', path: 'sample/notes/reading.md' },
    { name: 'typography.md', path: 'sample/notes/typography.md' },
  ] },
  { name: 'index.md', path: 'sample/index.md' },
  { name: 'showcase.md', path: 'sample/showcase.md' },
];

const make = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html) node.innerHTML = html;
  return node;
};

function file(node) {
  const li = make('li');
  const button = make('button', 'tree-file', ICONS.fileText);
  button.type = 'button';
  button.append(make('span', '', node.name));
  button.dataset.path = node.path;
  button._node = node;
  button.addEventListener('click', () => {
    dispatchEvent(new CustomEvent('glance:open-sample', { detail: { path: node.path } }));
  });
  li.append(button);
  return li;
}

function branch(node) {
  const li = make('li', 'open');
  const button = make('button', 'tree-dir', `<span class="chev">${ICONS.chevronRight}</span>${ICONS.folder}`);
  button.type = 'button';
  button.setAttribute('aria-expanded', 'true');
  button.append(make('span', '', node.name));
  const list = make('ul');
  for (const child of node.children) list.append(file(child));
  button.addEventListener('click', () => {
    const open = li.classList.toggle('open');
    button.setAttribute('aria-expanded', String(open));
    list.hidden = !open;
  });
  li.append(button, list);
  return li;
}

const root = make('ul');
for (const node of FILES) root.append(node.children ? branch(node) : file(node));
tree.replaceChildren(root);

$('folder-name').textContent = 'sample';
$('sidebar').hidden = false;
$('btn-sidebar').hidden = false;
document.body.classList.add('has-sidebar');

// main.js clears tree highlights right after it announces a document (it
// matches real file handles, which the demo has none of), so mark one frame on.
addEventListener('glance:doc', (event) => {
  requestAnimationFrame(() => {
    for (const button of tree.querySelectorAll('.tree-file')) {
      button.classList.toggle('active', button.dataset.path === event.detail?.key);
    }
  });
});

dispatchEvent(new CustomEvent('glance:open-sample', { detail: { path: 'sample/showcase.md' } }));
