/* pipeline.js — markdown -> safe HTML.
 * Mirrors the PowerToys Markdig recipe from MarkdownHelper.cs:
 *   UseAdvancedExtensions + UseEmojiAndSmiley + UseYamlFrontMatter +
 *   UseMathematics + SoftlineBreakAsHardline
 * mapped onto markdown-it + plugins, with DOMPurify for safety. */

const CDN = 'https://esm.sh';

/* Markdig's UseYamlFrontMatter hides frontmatter from output; we do the same. */
function stripFrontmatter(text) {
  const m = text.match(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return m ? text.slice(m[0].length) : text;
}

export async function createRenderer() {
  const MarkdownIt = (await import(`${CDN}/markdown-it@14`)).default;
  const DOMPurify = (await import(`${CDN}/dompurify@3`)).default;

  // highlight.js "common" build (~common languages, lighter than the full bundle).
  // Optional: if it fails to load, code blocks just render unhighlighted.
  let hljs = null;
  try { hljs = (await import(`${CDN}/highlight.js@11/lib/common`)).default; } catch (e) {
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
    ['markdown-it-emoji@3', (m) => m.full ?? m.default ?? m],
    ['markdown-it-footnote@4', (m) => m.default ?? m],
    ['markdown-it-deflist@3', (m) => m.default ?? m],
    ['markdown-it-task-lists@2', (m) => m.default ?? m, { label: true }],
    ['@traptitech/markdown-it-katex@1', (m) => m.default ?? m, { throwOnError: false, output: 'html' }],
  ];
  for (const [spec, pick, opts] of plugins) {
    try {
      const mod = await import(`${CDN}/${spec}`);
      md.use(pick(mod), ...(opts ? [opts] : []));
    } catch (e) {
      console.warn('[glance] plugin failed to load:', spec, e);
    }
  }

  // Heading anchors: slugged ids + a subtle hover "#" permalink. Handled apart
  // from the loop because its options reference the plugin's own permalink API.
  try {
    const anchorMod = await import(`${CDN}/markdown-it-anchor@9`);
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
