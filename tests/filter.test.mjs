import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchFilename } from '../src/filter.js';
import { decodeText, encodeText } from '../src/text.js';
test('filename matching is a case-insensitive substring with source offsets', () => {
  assert.deepEqual(matchFilename('ReadMe.md', 'ME.'), { start: 4, end: 7 });
  assert.equal(matchFilename('notes.md', 'missing'), null);
  assert.deepEqual(matchFilename('notes.md', ''), { start: 0, end: 0 });
  assert.deepEqual(matchFilename('İnotes.md', 'notes'), { start: 1, end: 6 });
  assert.deepEqual(matchFilename('📚notes.md', '📚'), { start: 0, end: 2 });
});
test('editing the LF model preserves CRLF and BOM when saved', () => {
  const decoded = decodeText('\ufefffirst\r\nsecond\r\n');
  assert.equal(encodeText(decoded.text.replace('second', 'changed'), decoded), '\ufefffirst\r\nchanged\r\n');
});
