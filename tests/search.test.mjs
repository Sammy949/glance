import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchText } from '../src/search.js';

const mark = (r) => r.text.slice(0, r.start) + '[' + r.text.slice(r.start, r.end) + ']' + r.text.slice(r.end);

test('finds matching lines case-insensitively, one result per line', () => {
  const results = searchText('# Plan\n\nThe plan is to plan.\nnothing here\nPLAN B', 'plan');
  assert.deepEqual(results.map((r) => [r.line, mark(r), r.occurrence]),
    [[1, '# [Plan]', 0], [3, 'The [plan] is to plan.', 1], [5, '[PLAN] B', 3]]);
});

test('long lines are trimmed around the match with ellipses', () => {
  const line = `    ${'a'.repeat(100)} needle ${'b'.repeat(100)}`;
  const [r] = searchText(line, 'needle');
  assert.ok(r.text.startsWith('…') && r.text.endsWith('…'));
  assert.equal(r.text.slice(r.start, r.end), 'needle');
  assert.ok(r.text.length <= 100, `excerpt is ${r.text.length} chars`);
});

test('leading indentation is dropped from short lines', () => {
  const [r] = searchText('    - item with needle', 'needle');
  assert.equal(mark(r), '- item with [needle]');
});

test('limit, empty query and no match', () => {
  assert.equal(searchText('x\nx\nx', 'x', 2).length, 2);
  assert.deepEqual(searchText('abc', ''), []);
  assert.deepEqual(searchText('abc', 'zz'), []);
});
