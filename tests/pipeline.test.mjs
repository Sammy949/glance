import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlBalance } from '../src/pipeline.js';

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
