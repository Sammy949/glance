/* diagrams.js — Mermaid diagrams. The library (vendored, chunked ESM) loads
 * only when a document contains a ```mermaid block, and only the chunks that
 * diagram type needs. Until a diagram renders, its source stays visible as a
 * code block; a diagram that fails to parse keeps showing its source. */

let mermaidReady = null;
let nextId = 0;

function loadMermaid() {
  mermaidReady ??= import('../vendor/mermaid/mermaid.esm.min.mjs')
    .then((m) => m.default)
    .catch((e) => { mermaidReady = null; throw e; });
  return mermaidReady;
}

export const hasDiagrams = (container) => !!container.querySelector('code.language-mermaid, .mermaid-diagram');

/**
 * Replace each mermaid code block in `container` with its rendered SVG.
 * `isCurrent()` going false (a newer render, or another tab) stops the work.
 */
export async function renderDiagrams(container, { theme, isCurrent }) {
  const blocks = [...container.querySelectorAll('pre > code.language-mermaid')];
  if (!blocks.length) return;
  let mermaid;
  try { mermaid = await loadMermaid(); } catch (e) {
    console.warn('[glance] mermaid failed to load:', e);
    return;
  }
  if (!isCurrent()) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    // Flat "classic" shapes (v12 defaults to "neo", with drop shadows) and the
    // neutral palette, so diagrams sit in glance's monochrome page.
    look: 'classic',
    theme: theme === 'dark' ? 'dark' : 'neutral',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  });
  for (const code of blocks) {
    const id = `glance-mermaid-${++nextId}`;
    const pre = code.parentElement;
    try {
      const { svg } = await mermaid.render(id, code.textContent);
      if (!isCurrent()) return;
      const figure = document.createElement('figure');
      figure.className = 'mermaid-diagram';
      figure.innerHTML = svg;
      pre.replaceWith(figure);
    } catch (e) {
      // Mermaid can leave its error graphic in <body>; keep the source instead.
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(id)?.remove();
      pre.classList.add('mermaid-error');
      pre.dataset.error = String(e?.message || e).split('\n')[0];
    }
  }
}
