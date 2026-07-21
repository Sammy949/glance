/* pipeline.js — markdown -> safe HTML.
 * Mirrors the PowerToys Markdig recipe from MarkdownHelper.cs:
 *   UseAdvancedExtensions + UseEmojiAndSmiley + UseYamlFrontMatter +
 *   UseMathematics + SoftlineBreakAsHardline
 * mapped onto markdown-it + plugins, with DOMPurify for safety.
 *
 * All deps are vendored (vendor/, pinned by scripts/vendor.mjs) — nothing is
 * fetched from a CDN at runtime, so startup is instant and fully offline. */

/* Markdig's UseYamlFrontMatter hides frontmatter from output; we do the same. */
function stripFrontmatter(text) {
  const m = text.match(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function createRenderer() {
  let MarkdownIt, DOMPurify;
  try {
    MarkdownIt = (await import('../vendor/markdown-it.js')).default;
    DOMPurify = (await import('../vendor/dompurify.js')).default;
  } catch (e) {
    // Core failed to load (corrupt/missing vendor file). Degrade to a plain-text
    // renderer instead of a dead app.
    console.error('[glance] core renderer failed to load:', e);
    return {
      render: (text) =>
        `<blockquote><strong>glance:</strong> renderer failed to load — showing raw text.</blockquote><pre>${esc(text)}</pre>`,
    };
  }

  // highlight.js (common build). Optional: without it code blocks are plain.
  let hljs = null;
  try { hljs = (await import('../vendor/highlight.js')).default; } catch (e) {
    console.warn('[glance] highlight.js failed to load:', e);
  }

  const highlight = (str, lang) => {
    if (hljs) {
      try {
        if (lang && hljs.getLanguage(lang)) return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value;
        return hljs.highlightAuto(str).value;
      } catch { /* fall through */ }
    }
    return ''; // markdown-it applies its own escaping
  };

  // breaks:true == SoftlineBreakAsHardline; linkify + GFM tables are built in.
  const md = new MarkdownIt({ html: true, linkify: true, breaks: true, typographer: false, highlight });

  // Each plugin is optional: one failing to load must not break rendering.
  const plugins = [
    ['../vendor/markdown-it-emoji.js', (m) => m.full ?? m.default ?? m],
    ['../vendor/markdown-it-footnote.js', (m) => m.default ?? m],
    ['../vendor/markdown-it-deflist.js', (m) => m.default ?? m],
    ['../vendor/markdown-it-task-lists.js', (m) => m.default ?? m, { label: true }],
    ['../vendor/markdown-it-katex.js', (m) => m.default ?? m, { throwOnError: false, output: 'html' }],
  ];
  for (const [spec, pick, opts] of plugins) {
    try {
      const mod = await import(spec);
      md.use(pick(mod), ...(opts ? [opts] : []));
    } catch (e) {
      console.warn('[glance] plugin failed to load:', spec, e);
    }
  }

  // Heading anchors: slugged ids + a subtle hover "#" permalink. Handled apart
  // from the loop because its options reference the plugin's own permalink API.
  try {
    const anchorMod = await import('../vendor/markdown-it-anchor.js');
    const anchor = anchorMod.default ?? anchorMod;
    md.use(anchor, {
      tabIndex: false,
      permalink: anchor.permalink.linkInsideHeader({
        symbol: '#',
        placement: 'after',
        class: 'heading-anchor',
        ariaHidden: true,
      }),
    });
  } catch (e) {
    console.warn('[glance] anchor plugin failed to load:', e);
  }

  return {
    /** markdown string -> sanitized HTML string */
    render(text) {
      const dirty = md.render(stripFrontmatter(text));
      return DOMPurify.sanitize(dirty, { ADD_ATTR: ['target', 'rel', 'class', 'id'] });
    },
  };
}
