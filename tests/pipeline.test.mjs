import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlBalance, parseFrontmatter, frontmatterHtml } from '../src/pipeline.js';

test('balanced and self-contained HTML leaves nothing open', () => {
  assert.equal(htmlBalance('<p class="markdown-alert-title"><svg viewBox="0 0 24 24"><path d="M1 1"/></svg>Note</p>\n'), 0);
  assert.equal(htmlBalance('<!-- a <div> in a comment -->'), 0);
  assert.equal(htmlBalance('<img src="a.png"><br><hr/>'), 0);
  assert.equal(htmlBalance('<details><summary>More</summary>body</details>'), 0);
});

test('containers split across blocks are tracked', () => {
  assert.equal(htmlBalance('<details>\n<summary>Big</summary>\n'), 1);
  assert.equal(htmlBalance('</details>\n'), -1);
  assert.equal(htmlBalance('<DIV align="center">'), 1);
});

test('flat frontmatter parses into pairs and lists', () => {
  assert.deepEqual(parseFrontmatter('name: plan\ndescription: "Ship it"\n# a comment\ntags:\n  - a\n  - \'b\'\nempty:'),
    [['name', 'plan'], ['description', 'Ship it'], ['tags', ['a', 'b']], ['empty', []]]);
});

test('nested or block-scalar frontmatter is not parsed', () => {
  assert.equal(parseFrontmatter('meta:\n  author: x'), null);
  assert.equal(parseFrontmatter('body: |\n  text'), null);
  assert.equal(parseFrontmatter('- orphan item'), null);
});

test('frontmatter renders escaped, falls back to raw, and needs a closing fence', () => {
  assert.equal(frontmatterHtml('---\ntitle: <b>x</b>\n---\n# Doc'),
    '<table class="frontmatter"><tbody><tr><th scope="row">title</th><td>&lt;b&gt;x&lt;/b&gt;</td></tr></tbody></table>\n');
  assert.equal(frontmatterHtml('---\nmeta:\n  a: <i>\n---\nbody'), '<pre class="frontmatter frontmatter-raw">meta:\n  a: &lt;i&gt;</pre>\n');
  assert.equal(frontmatterHtml('---\ntitle: x\nno closing fence'), '');
  assert.equal(frontmatterHtml('# No frontmatter'), '');
});
