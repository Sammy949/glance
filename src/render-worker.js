/* render-worker.js: parses large documents off the main thread.
 *
 * Receives { id, text, frontmatter }, posts { id, html } for each chunk and then
 * { id, done, maps } with the block line ranges (see pipeline.js). The HTML is
 * not sanitized here: DOMPurify needs a DOM, so the page sanitizes each chunk. */

import { createMarkdown, chunkHtml } from './pipeline.js';

const ready = createMarkdown();

self.addEventListener('message', async ({ data }) => {
  const markdown = await ready;
  if (!markdown) { self.postMessage({ id: data.id, error: 'markdown-it did not load' }); return; }
  try {
    for (const html of chunkHtml(markdown, data.text, { frontmatter: data.frontmatter })) {
      self.postMessage({ id: data.id, html });
    }
    self.postMessage({ id: data.id, done: true, maps: markdown.blocks.maps });
  } catch (error) {
    self.postMessage({ id: data.id, error: String(error?.message || error) });
  }
});
