/* favicon.js — the tab icon is the same rounded square, but filled with a random
 * color from a curated palette on every load. Drawn as an inline SVG data URI so
 * there's no network request. (App/PWA/desktop icons are unaffected.) */

const PALETTE = [
  '#0366d6', // glance blue
  '#7c3aed', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#6366f1', // indigo
];

export function randomizeFavicon() {
  const color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="${color}"/></svg>`;
  const href = 'data:image/svg+xml,' + encodeURIComponent(svg);

  let link = document.querySelector('link[rel="icon"][type="image/svg+xml"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  link.href = href;
  return color;
}
