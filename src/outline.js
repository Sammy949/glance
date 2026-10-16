/* outline.js — the document's headings as a navigable outline. The section
 * being read is marked as you scroll; clicking an entry jumps to it. */

const LEVELS = 'h1, h2, h3, h4';
const READ_LINE = 130; // px from the top: just below the toolbar + tab bar

let nav = null;
let headings = [];
let links = [];
let current = -1;
let frame = 0;

/** Text of a heading without its hover "#" permalink. */
function headingText(h) {
  return [...h.childNodes]
    .filter((n) => !n.classList?.contains('heading-anchor'))
    .map((n) => n.textContent).join('').trim();
}

export function init(navEl, onPick) {
  nav = navEl;
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-index]');
    if (!a) return;
    e.preventDefault();
    headings[+a.dataset.index]?.scrollIntoView({ block: 'start' });
    onPick?.();
  });
  addEventListener('scroll', () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; spy(); });
  }, { passive: true });
}

/** Rebuild from rendered content. Returns the number of headings found. */
export function build(container) {
  headings = [...container.querySelectorAll(LEVELS)].filter((h) => h.id);
  const top = Math.min(...headings.map((h) => +h.tagName[1]));
  const list = document.createElement('ol');
  links = headings.map((h, i) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `#${h.id}`;
    a.dataset.index = String(i);
    a.textContent = headingText(h);
    a.title = a.textContent;
    a.style.setProperty('--depth', String(+h.tagName[1] - top));
    li.append(a);
    list.append(li);
    return a;
  });
  nav.replaceChildren(list);
  current = -1;
  spy();
  return headings.length;
}

/** Mark the last heading that has scrolled past the reading line. */
export function spy() {
  if (!headings.length || nav.hidden) return;
  let index = 0;
  for (let i = 0; i < headings.length; i++) {
    if (headings[i].getBoundingClientRect().top <= READ_LINE) index = i;
    else break;
  }
  if (index === current) return;
  links[current]?.classList.remove('current');
  links[current]?.removeAttribute('aria-current');
  current = index;
  const link = links[current];
  link.classList.add('current');
  link.setAttribute('aria-current', 'location');
  // Keep the marked entry visible inside the panel without moving the page.
  const { offsetTop, offsetHeight } = link;
  if (offsetTop < nav.scrollTop) nav.scrollTop = offsetTop - 8;
  else if (offsetTop + offsetHeight > nav.scrollTop + nav.clientHeight) {
    nav.scrollTop = offsetTop + offsetHeight - nav.clientHeight + 8;
  }
}
