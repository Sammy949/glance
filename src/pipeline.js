/* pipeline.js — markdown -> safe HTML.
 * Mirrors the PowerToys Markdig recipe from MarkdownHelper.cs:
 *   UseAdvancedExtensions + UseEmojiAndSmiley + UseYamlFrontMatter +
 *   UseMathematics + SoftlineBreakAsHardline
 * mapped onto markdown-it + plugins, with DOMPurify for safety.
 *
 * All deps are vendored (vendor/, pinned by scripts/vendor.mjs) — nothing is
 * fetched from a CDN at runtime, so startup is instant and fully offline. */

/* Markdig's UseYamlFrontMatter hides frontmatter from output; we do the same,
 * unless the reader asks to see it (Settings > Reading > Frontmatter). */
const FRONTMATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
function stripFrontmatter(text) {
  const m = text.match(FRONTMATTER);
  return m ? text.slice(m[0].length) : text;
}

const unquote = (value) => value.replace(/^(["'])(.*)\1$/, '$2');

/* Flat YAML only: `key: value` lines, and `- item` lists under a key. Returns
 * [key, value | items[]] pairs, or null for anything else (nested maps, block
 * scalars) so the caller can show the raw text instead. No YAML library. */
export function parseFrontmatter(yaml) {
  const entries = [];
  for (const line of yaml.split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item) {
      const last = entries[entries.length - 1];
      if (!last || !Array.isArray(last[1])) return null;
      last[1].push(unquote(item[1].trim()));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_][\w .-]*?)\s*:(?:\s+(.*))?$/);
    if (!pair) return null;
    const value = (pair[2] ?? '').trim();
    if (/^[|>]/.test(value)) return null;
    entries.push([pair[1], value === '' ? [] : unquote(value)]);
  }
  return entries;
}

/* The frontmatter as a small key/value table, or raw text when it isn't flat.
 * Everything is escaped: nothing in frontmatter is HTML. */
export function frontmatterHtml(text) {
  const m = text.match(FRONTMATTER);
  if (!m || !m[1].trim()) return '';
  const entries = parseFrontmatter(m[1]);
  if (!entries || !entries.length) return `<pre class="frontmatter frontmatter-raw">${esc(m[1])}</pre>\n`;
  const rows = entries.map(([key, value]) =>
    `<tr><th scope="row">${esc(key)}</th><td>${esc(Array.isArray(value) ? value.join(', ') : value)}</td></tr>`).join('');
  return `<table class="frontmatter"><tbody>${rows}</tbody></table>\n`;
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

/* How many elements a piece of raw HTML leaves open (negative if it closes
 * more than it opens). Comments, void and self-closing tags don't count. Large
 * documents only split where this is back to zero, so a <details> opened in
 * one block and closed much later is sanitized as one piece. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function htmlBalance(html) {
  let open = 0;
  for (const [, close, name, selfClose] of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-zA-Z][\w-]*)\b[^>]*?(\/?)>/g)) {
    if (VOID_TAGS.has(name.toLowerCase()) || selfClose) continue;
    open += close ? -1 : 1;
  }
  return open;
}

const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The configured markdown-it, shared by the page and the render worker (no
 * DOM needed). `setLarge(true)` turns off syntax highlighting, which large
 * documents skip. `blocks` holds the last parse's source and the line ranges
 * of its top-level blocks (see changes.js). Resolves to null if the core
 * library can't load. */
export async function createMarkdown() {
  let MarkdownIt;
  try { MarkdownIt = (await import('../vendor/markdown-it.js')).default; } catch (e) {
    console.error('[glance] core renderer failed to load:', e);
    return null;
  }

  // highlight.js (common build). Optional: without it code blocks are plain.
  let hljs = null;
  try { hljs = (await import('../vendor/highlight.js')).default; } catch (e) {
    console.warn('[glance] highlight.js failed to load:', e);
  }

  let largeDocument = false;
  const highlight = (str, lang) => {
    if (largeDocument) return '';
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

  // Number the top-level blocks (data-block) and record their line ranges, so a
  // reload can tell which blocks changed (changes.js). Registered last so it
  // sees the final order, after plugins have moved or added tokens. Tokens
  // with no source position (alert titles, the footnote list) are skipped.
  const blocks = { src: '', maps: [] };
  md.core.ruler.push('glance_blocks', (state) => {
    const maps = [];
    for (const token of state.tokens) {
      if (token.level !== 0 || token.nesting < 0 || !token.map) continue;
      token.attrSet('data-block', String(maps.length / 2));
      maps.push(token.map[0], token.map[1]);
    }
    blocks.src = state.src;
    blocks.maps = maps;
  });

  return { md, blocks, setLarge(on) { largeDocument = on; } };
}

/** Parse once so references, footnotes and duplicate heading IDs stay global,
 * then yield unsanitized HTML in chunks, splitting only at balanced top-level
 * block boundaries: never inside a list or table, or while raw HTML has an
 * element open. The first chunk is small so the first screen comes quickly. */
export function* chunkHtml(markdown, text, { frontmatter = false } = {}) {
  const { md } = markdown;
  markdown.setLarge(true);
  const env = {};
  const tokens = md.parse(stripFrontmatter(text), env);
  let start = 0;
  let depth = 0;
  let htmlOpen = 0;
  for (let end = 0; end < tokens.length; end++) {
    depth += tokens[end].nesting;
    if (tokens[end].type === 'html_block') htmlOpen = Math.max(0, htmlOpen + htmlBalance(tokens[end].content));
    const last = end === tokens.length - 1;
    if (last || (depth === 0 && htmlOpen === 0 && end - start >= (start === 0 ? 400 : 1600))) {
      const card = start === 0 && frontmatter ? frontmatterHtml(text) : '';
      yield card + md.renderer.render(tokens.slice(start, end + 1), md.options, env);
      start = end + 1;
    }
  }
}

/* The first ~32 KB of a document, cut at a blank line outside fenced code, so
 * a large file can show its first screen before the full parse finishes. */
const PREFIX_BYTES = 32 * 1024;
export function documentPrefix(text) {
  if (text.length <= PREFIX_BYTES) return text;
  let fence = null;
  let at = 0;
  while (at < text.length) {
    const next = text.indexOf('\n', at);
    const end = next === -1 ? text.length : next + 1;
    const line = text.slice(at, end);
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null;
    }
    if (!fence && at >= PREFIX_BYTES && !line.trim()) return text.slice(0, at);
    at = end;
  }
  return text;
}

export async function createRenderer() {
  let DOMPurify;
  const markdown = await createMarkdown();
  try {
    if (!markdown) throw new Error('markdown-it did not load');
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
  const { md, blocks } = markdown;

  // Block sources are built only when a reload asks for them, so ordinary
  // renders don't pay for it. A worker render reports its ranges back here.
  let lastSrc = '';
  let lastMaps = [];
  let lastBlocks = null;
  const recordBlocks = (src, maps) => { lastSrc = src; lastMaps = maps; lastBlocks = null; };
  const blockSources = () => {
    const starts = [0];
    for (let i = lastSrc.indexOf('\n'); i !== -1; i = lastSrc.indexOf('\n', i + 1)) starts.push(i + 1);
    starts.push(lastSrc.length + 1);
    const out = [];
    for (let i = 0; i < lastMaps.length; i += 2) {
      out.push(lastSrc.slice(starts[lastMaps[i]], starts[lastMaps[i + 1]] - 1));
    }
    return out;
  };

  const sanitize = (html) => DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel', 'class', 'id'] });

  // Large documents parse in a worker so the window stays responsive. One
  // render at a time: a parse can't be interrupted, so a newer request
  // replaces the worker instead of queueing behind it.
  let worker = null;
  let workerBusy = false;
  let nextJob = 0;
  const startWorker = () => {
    try { return new Worker(new URL('./render-worker.js', import.meta.url), { type: 'module' }); }
    catch (e) { console.warn('[glance] render worker unavailable:', e); return null; }
  };

  async function* mainThreadChunks(text, options) {
    for (const html of chunkHtml(markdown, text, options)) yield sanitize(html);
    recordBlocks(blocks.src, blocks.maps);
  }

  async function* workerChunks(text, options) {
    if (workerBusy) { worker?.terminate(); worker = null; }
    worker ??= startWorker();
    if (!worker) { yield* mainThreadChunks(text, options); return; }
    const id = ++nextJob;
    const queue = [];
    let wake = null;
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      queue.push(data);
      wake?.();
    };
    const onError = (event) => { queue.push({ id, error: event.message || 'worker error' }); wake?.(); };
    const own = worker;
    own.addEventListener('message', onMessage);
    own.addEventListener('error', onError);
    workerBusy = true;
    own.postMessage({ id, text, frontmatter: !!options.frontmatter });
    let sent = 0;
    let finished = false;
    try {
      while (true) {
        if (!queue.length) await new Promise((resolve) => { wake = resolve; });
        wake = null;
        const message = queue.shift();
        if (message.error) {
          // Fall back to the main thread, unless chunks already went out.
          console.warn('[glance] render worker failed:', message.error);
          finished = true;
          own.terminate();
          if (worker === own) worker = null;
          if (!sent) yield* mainThreadChunks(text, options);
          return;
        }
        if (message.done) { finished = true; recordBlocks(stripFrontmatter(text), message.maps); return; }
        sent++;
        yield sanitize(message.html);
      }
    } finally {
      own.removeEventListener('message', onMessage);
      own.removeEventListener('error', onError);
      // Abandoned mid-parse (a newer render took over): the worker is still busy
      // with this document, so drop it rather than queue the next one behind it.
      if (!finished) { own.terminate(); if (worker === own) worker = null; }
      if (worker === own || !worker) workerBusy = false;
    }
  }

  return {
    /** Block sources from the most recent render, in data-block order. */
    get lastBlocks() { return (lastBlocks ??= blockSources()); },
    /** Normal documents keep the immediate render path. */
    render(text, { frontmatter = false } = {}) {
      markdown.setLarge(text.length > 256 * 1024);
      const html = sanitize((frontmatter ? frontmatterHtml(text) : '') + md.render(stripFrontmatter(text)));
      recordBlocks(blocks.src, blocks.maps);
      return html;
    },
    /** A quick render of the first screen of a large document. Not recorded as
     * the document's blocks: the full render replaces it. */
    prefix(text, { frontmatter = false } = {}) {
      markdown.setLarge(true);
      const body = documentPrefix(stripFrontmatter(text));
      return sanitize((frontmatter ? frontmatterHtml(text) : '') + md.render(body));
    },
    /** Large documents: sanitized HTML chunks, parsed off the main thread
     * when a worker is available. */
    chunksAsync(text, options = {}) {
      return typeof Worker === 'function' ? workerChunks(text, options) : mainThreadChunks(text, options);
    },
  };
}
