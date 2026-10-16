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

/* GitHub alerts: a blockquote whose first line is exactly [!NOTE], [!TIP],
 * [!IMPORTANT], [!WARNING] or [!CAUTION] renders as a titled callout. Lucide
 * icons (ISC) keep the marks consistent with the rest of glance. */
const ALERT_ICON = {
  note: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  tip: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  important: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path d="M12 7v2"/><path d="M12 13h.01"/>',
  warning: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  caution: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
};

function githubAlerts(md) {
  md.core.ruler.after('block', 'github_alerts', (state) => {
    const tokens = state.tokens;
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].type !== 'blockquote_open') continue;
      const inline = tokens[i + 2];
      if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue;
      const m = inline.content.match(/^\[!(note|tip|important|warning|caution)\][ \t]*(?:\n|$)/i);
      if (!m) continue;
      const kind = m[1].toLowerCase();
      tokens[i].attrJoin('class', `markdown-alert markdown-alert-${kind}`);
      inline.content = inline.content.slice(m[0].length);
      const title = new state.Token('html_block', '', 0);
      title.content = `<p class="markdown-alert-title"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ALERT_ICON[kind]}</svg>${kind[0].toUpperCase()}${kind.slice(1)}</p>\n`;
      // A marker on its own line leaves an empty paragraph behind; drop it.
      if (!inline.content.trim()) tokens.splice(i + 1, 3, title);
      else tokens.splice(i + 1, 0, title);
    }
  });
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
    if (lang === 'mermaid') return ''; // left as source for diagrams.js
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

  githubAlerts(md);

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
