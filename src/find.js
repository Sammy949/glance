/* find.js — in-document find via the CSS Custom Highlight API (Chromium).
 * Matches become Ranges registered under ::highlight(find) / ::highlight(find-current),
 * so nothing in the DOM is mutated (no <mark> wrapping to undo). */

const supported =
  typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight !== 'undefined';

let ranges = [];
let current = -1;
let container = null;

export function setContainer(el) { container = el; }

function clearHighlights() {
  if (!supported) return;
  CSS.highlights.delete('find');
  CSS.highlights.delete('find-current');
}

function collectTextNodes(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p && p.closest('script, style')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}

function markCurrent() {
  if (!supported) return;
  if (current >= 0 && ranges[current]) {
    const h = new Highlight(ranges[current]);
    h.priority = 1; // draw above the general 'find' highlight
    CSS.highlights.set('find-current', h);
  } else {
    CSS.highlights.delete('find-current');
  }
}

function scrollToCurrent() {
  const r = ranges[current];
  if (!r) return;
  const rect = r.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  if (midY < 80 || midY > innerHeight - 80) {
    scrollTo({ top: Math.max(0, scrollY + rect.top - innerHeight / 2), behavior: 'smooth' });
  }
}

/** Run a fresh search. Returns { count, index, supported }. */
export function search(query) {
  clearHighlights();
  ranges = [];
  current = -1;
  if (!supported || !container || !query) return { count: 0, index: 0, supported };

  const q = query.toLowerCase();
  for (const node of collectTextNodes(container)) {
    const text = node.nodeValue.toLowerCase();
    let from = 0, idx;
    while ((idx = text.indexOf(q, from)) !== -1) {
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + q.length);
      ranges.push(range);
      from = idx + q.length;
    }
  }

  if (ranges.length) {
    CSS.highlights.set('find', new Highlight(...ranges));
    current = 0;
    markCurrent();
    scrollToCurrent();
  }
  return { count: ranges.length, index: ranges.length ? 1 : 0, supported };
}

/** Move to the next (dir=1) or previous (dir=-1) match. */
export function step(dir = 1) {
  if (!ranges.length) return { count: 0, index: 0 };
  current = (current + dir + ranges.length) % ranges.length;
  markCurrent();
  scrollToCurrent();
  return { count: ranges.length, index: current + 1 };
}

export function close() {
  clearHighlights();
  ranges = [];
  current = -1;
}
