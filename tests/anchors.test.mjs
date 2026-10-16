import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import MarkdownIt from '../vendor/markdown-it.js';
import anchor from '../vendor/markdown-it-anchor.js';
import { patchAnchor } from '../scripts/vendor-patches.mjs';
test('heading IDs, duplicates and permalink output match upstream', async () => {
  const patched = await readFile(new URL('../vendor/markdown-it-anchor.js', import.meta.url), 'utf8');
  const original = patched.replace('l=r[l]===i?l:r.indexOf(i)', 'l=r.indexOf(i)');
  assert.equal(patchAnchor(original), patched);
  const upstream = (await import(`data:text/javascript;base64,${Buffer.from(original).toString('base64')}`)).default;
  for (const mode of ['linkInsideHeader', 'linkAfterHeader']) {
    const render = (plugin) => new MarkdownIt().use(plugin, {
      tabIndex: false,
      permalink: plugin.permalink[mode](mode === 'linkInsideHeader' ? {symbol:'#',placement:'after',ariaHidden:true}
        : {style:'aria-label',assistiveText: title => title,wrapper:['<div>','</div>']}),
    });
    const text = '## Same\n\n**hello**\n\n## Same\n\n## code `name`\n\n# Next\n';
    assert.equal(render(anchor).render(text), render(upstream).render(text));
  }
});
